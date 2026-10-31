/// <reference types="node" />
import { beforeAll, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Simulation, emptyIntent, distance } from '../src/mission/Simulation';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, FIXED_DT as dt } from '../src/runtime/Physics';
import type { Vec3 } from '../src/contracts';
beforeAll(initializePhysics);
function replay(cover: boolean) {
  const env = buildEnvironment('rescue'), sim = new Simulation('rescue', env.solids);
  const shotOwners = new Set<string>(), first: Record<string, number> = {}, start = new Map(sim.actors.map(a => [a.id, [...a.position] as Vec3]));
  const snapshot = () => ({ phase: sim.mission.phase, phaseTime: sim.mission.phaseTime, elapsed: sim.mission.elapsed, health: sim.player.health, player: sim.player.position, facts: [...sim.mission.facts], shots: [...shotOwners], first, enemies: sim.aliveEnemies.map(a => ({ id: a.id, health: a.health })), allies: sim.actors.filter(a => a.role === 'ally').map(a => ({ id: a.id, position: a.position, moved: distance(start.get(a.id)!, a.position), goals: a.goals, aiming: a.aiming })) });
  try {
    for (let i = 0; i < 16 / dt && !sim.mission.failed; i++) {
      const target: Vec3 = [-6, 0, 189], moving = distance(sim.player.position, target) > .25;
      const yaw = moving ? Math.atan2(-(target[0] - sim.player.position[0]), -(target[2] - sim.player.position[2])) : sim.player.yaw;
      sim.step({ ...emptyIntent, yaw, forward: moving ? 1 : 0, sprint: moving, crouch: !moving, cover: cover && i === 0 });
      for (const p of sim.ballistics.projectiles) if (p.owner === 'zheng' || p.owner === 'meng') { shotOwners.add(p.owner); first[p.owner] ??= sim.mission.elapsed; }
    }
    return snapshot();
  } finally { sim.dispose(); env.dispose(); }
}
it('autonomous S10 companions cover without Q while Q remains a physical side-post order', () => {
  const normal = replay(false), requested = replay(true);
  writeFileSync(new URL('../artifacts/model-integration/rescue-behavior/public-intent-replay.json', import.meta.url), JSON.stringify({ method: 'Fresh real environment + Simulation, public Intent only, no fact/health/actor/phase mutation', normal, requested }, null, 2));
  expect(normal.shots).toContain('zheng');
  expect(normal.shots).toContain('meng');
  expect(normal.facts).not.toContain('rescue-cover-requested');
  expect(requested.facts).toContain('rescue-cover-requested');
  expect(requested.allies.find(a => a.id === 'zheng')!.moved).toBeGreaterThan(5);
  expect(normal.phase).toBe(0); // Never bypass the player rendezvous / injury gate.
}, 20000);
