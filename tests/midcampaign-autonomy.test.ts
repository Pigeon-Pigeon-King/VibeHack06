import { beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { TRANSFER as T } from '../src/content/transfer-layout';
import { RELIEF as R } from '../src/content/relief-layout';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);

// Local functional negatives accompany the four complete public-input chapter
// replays. No story facts, actor health, positions or arrivals are injected.
function repairTransfer(s: Simulation): void {
  let path: Vec3[] = [];
  for (let frame = 0; frame < 25 / FIXED_DT && s.mission.phase < 2; frame++) {
    if (!path.length) path = s.navigation.path(s.player.position, T.panel);
    while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
    const next = path[0] ?? T.panel;
    const moving = distance(s.player.position, T.panel) > 1.5;
    const yaw = moving ? Math.atan2(-(next[0] - s.player.position[0]), -(next[2] - s.player.position[2])) : s.player.yaw;
    s.step({ ...emptyIntent, yaw, forward: moving ? 1 : 0, sprint: true, interact: frame % 12 === 0 });
  }
  expect(s.mission.phase).toBe(2);
  expect(s.has('transfer-gate-open')).toBe(true);
}

describe('midcampaign autonomous actions retain real-world conditions', () => {
  it('reports actual transfer arrivals without E, while a physically blocked patient prevents the same report', () => {
    // Fault injection: a wall seals the transfer lane and every alternative
    // crossing of this map beyond the gate. A lane-only obstacle is insufficient:
    // the real navigation can find a safe route around its open sides.
    // Only geometry changes; no convoy mission state or route is overwritten.
    const barrier: SolidSpec = { id: 'FAULT-INJECTION-transfer-lane-barrier', position: [0, 1.8, 29], size: [300, 3.6, 0.6] };
    const normalEnv = buildEnvironment('transfer'), blockedEnv = buildEnvironment('transfer');
    const normal = new Simulation('transfer', normalEnv.solids);
    const blocked = new Simulation('transfer', [...blockedEnv.solids, barrier]);
    try {
      repairTransfer(normal); repairTransfer(blocked);
      for (let frame = 0; frame < 90 / FIXED_DT; frame++) {
        normal.step({ ...emptyIntent, yaw: normal.player.yaw });
        blocked.step({ ...emptyIntent, yaw: blocked.player.yaw });
      }
      expect(distance(normal.player.position, T.watch)).toBeGreaterThan(2.8);
      expect(normal.mission.phase).toBe(3); expect(normal.has('transfer-patients-through')).toBe(true);
      expect(normal.actors.filter(a => a.role === 'cart').every(a => a.safe && !a.goals.length)).toBe(true);
      expect(blocked.mission.phase).toBe(2); expect(blocked.mission.complete).toBe(false);
      expect(blocked.has('transfer-patients-through')).toBe(false);
      expect(blocked.actors.filter(a => a.role === 'cart' && a.safe)).toHaveLength(0);
      expect(blocked.actors.filter(a => a.role === 'cart').every(a => a.position[2] < barrier.position[2])).toBe(true);
      console.info('AUTONOMY_BOUNDARY transfer', JSON.stringify({ observationDistance: distance(normal.player.position, T.watch),
        normalPhase: normal.mission.phase, blockedPhase: blocked.mission.phase, waitedSeconds: 90,
        blockedPatientZ: blocked.actors.filter(a => a.role === 'cart').map(a => a.position[2]) }));
    } finally { normal.dispose(); blocked.dispose(); normalEnv.dispose(); blockedEnv.dispose(); }
  }, 30_000);

  it('does not release equipment workers or the relief team while the entry fire line remains exposed', () => {
    const env = buildEnvironment('relief'), s = new Simulation('relief', env.solids);
    try {
      expect(s.exposedThreat(R.entryHold, 52)).toBe(true);
      for (let frame = 0; frame < 8 / FIXED_DT; frame++) s.step({ ...emptyIntent, yaw: s.player.yaw, skip: true });
      expect(s.mission.phase).toBe(0); expect(s.has('relief-entry-secured')).toBe(false);
      expect(s.aliveEnemies.length).toBeGreaterThan(0);
      const waiting = s.actors.filter(a => a.role === 'worker' || ['meng', 'relief-0', 'relief-1'].includes(a.id));
      expect(waiting).toHaveLength(6);
      for (const person of waiting) { expect(person.released, person.id).toBe(false); expect(person.goals, person.id).toEqual([]); }
    } finally { s.dispose(); env.dispose(); }
  });
});
