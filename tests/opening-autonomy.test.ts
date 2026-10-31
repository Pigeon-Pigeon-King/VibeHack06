import { beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { HISTORY as H } from '../src/content/history-layout';
import { emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);

// Constructed threat boundaries supplement the unmodified public-input replays
// in opening-paths. They are not presented as end-to-end completion evidence.
function gateOpenBoundary(solids: SolidSpec[], enemy: Vec3): Snapshot {
  const seed = new Simulation('mainhall', solids);
  seed.step({ ...emptyIntent, interact: true });
  const snapshot = seed.snapshot(); seed.dispose();
  expect(snapshot.mission.phase).toBe(1);
  snapshot.mission.nextSpawn = 1000;
  snapshot.actors.filter(a => a.role === 'enemy').forEach((a, i) => {
    a.goals = []; a.path = [];
    if (i === 0) a.position = [...enemy];
    else { a.down = true; a.health = 0; }
  });
  return snapshot;
}

describe('S02 autonomous resident departure safety', () => {
  it('waits while an actual threat exposes the doorway even after the gate was opened', () => {
    const env = buildEnvironment('mainhall');
    const s = new Simulation('mainhall', env.solids, gateOpenBoundary(env.solids, H.gateOutside));
    try {
      expect(s.has('history-gate-open')).toBe(true);
      expect(s.exposedThreat(H.gateOutside, 18)).toBe(true);
      for (let i = 0; i < 30; i++) s.step(emptyIntent);
      expect(s.mission.phase).toBe(1);
      expect(s.has('hall-front-secured')).toBe(false);
      expect(s.workers.every(a => !a.released && !a.goals.length)).toBe(true);
      expect(s.objective.interaction).toBe('');
    } finally { s.dispose(); env.dispose(); }
  });

  it('lets residents move without player confirmation while a wall-hidden enemy remains alive', () => {
    const env = buildEnvironment('mainhall');
    const wall: SolidSpec = { id: 'autonomy-test-screen', position: [10, 2, 0], size: [0.6, 4, 48] };
    const solids = [...env.solids, wall];
    const s = new Simulation('mainhall', solids, gateOpenBoundary(solids, [14, 0, -4]));
    try {
      expect(s.physics.trace([H.defenseA[0], 1.66, H.defenseA[2]], [14, 1.66, -4], undefined, true)?.id).toBe(`solid:${wall.id}`);
      expect(s.aliveEnemies).toHaveLength(1);
      const starts = s.workers.slice(0, 3).map(a => [...a.position] as Vec3);
      s.step(emptyIntent);
      expect(s.mission.phase).toBe(2);
      expect(s.player.position[0]).toBeLessThan(-18); // Stayed by the door, not the defense marker.
      expect(s.workers.slice(0, 3).every(a => a.released)).toBe(true);
      expect(s.workers.slice(3).every(a => !a.released)).toBe(true);
      for (let i = 0; i < 60; i++) s.step(emptyIntent);
      expect(s.aliveEnemies.some(a => a.id === 'enemy-E00-0')).toBe(true);
      s.workers.slice(0, 3).forEach((a, i) => expect(Math.hypot(a.position[0] - starts[i][0], a.position[2] - starts[i][2])).toBeGreaterThan(1));
      expect(s.mission.phase).toBe(2); // The last cohort waits for the first to actually pass the door.
      expect(s.workers.slice(3).every(a => !a.released)).toBe(true);
    } finally { s.dispose(); env.dispose(); }
  });
});
