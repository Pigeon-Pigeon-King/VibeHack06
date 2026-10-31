import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { EPILOGUE as E } from '../src/content/epilogue-layout';
import { RESCUE as R } from '../src/content/rescue-layout';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, Physics, FIXED_DT as dt } from '../src/runtime/Physics';

beforeAll(initializePhysics);
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

// Exact envelopes and provenance are archived from public-Intent replay.
// These restored LOCAL mechanism checks are not full manual campaign evidence.
function restore(scene: 'rescue' | 'epilogue', extraSolids: SolidSpec[] = []) {
  const name = scene === 'rescue' ? 'rescue-4' : 'epilogue-7';
  const raw = readFileSync(new URL(`./fixtures/finale/${name}.json`, import.meta.url), 'utf8');
  const source = JSON.parse(readFileSync(new URL(`./fixtures/finale/${name}.source.json`, import.meta.url), 'utf8'));
  expect(source.kind).toBe('public-intent-replay-checkpoint');
  expect(source.sourceTest).toBe('tests/finale-paths.test.ts');
  expect(source.scenario).toBe(scene); expect(source.phase).toBe(scene === 'rescue' ? 4 : 7); expect(source.phaseTime).toBe(0);
  expect(createHash('sha256').update(raw).digest('hex')).toBe(source.sha256);
  const storage = new Memory(); storage.setItem(`${SAVE_KEY_PREFIX}${scene}`, raw);
  const loaded = new SaveStore(storage).load(scene);
  expect(loaded.warning).toBeUndefined(); expect(loaded.save).toBeDefined();
  const environment = buildEnvironment(scene), solids = [...environment.solids, ...extraSolids];
  return { environment, solids, sim: new Simulation(scene, solids, loaded.save!.snapshot) };
}
const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const copy = (p: Vec3): Vec3 => [...p];
function moveToward(s: Simulation, target: Vec3, maximumFrames: number) {
  let path = s.navigation.path(s.player.position, target);
  for (let frame = 0; frame < maximumFrames && distance(s.player.position, target) > 0.25 && !s.mission.failed; frame++) {
    if (distance(s.player.position, target) < 1.4) path = [[...target]];
    while (path.length && distance(s.player.position, path[0]) < 0.20) path.shift();
    const next = path[0] ?? target;
    const yaw = Math.atan2(-(next[0] - s.player.position[0]), -(next[2] - s.player.position[2]));
    s.step({ ...emptyIntent, yaw, forward: 1, sprint: true });
  }
}

describe('finale functional interactions rather than subtitle-only progression', () => {
  it('blocks occupied-hand shots, stops for a blocked patient, and permits backing out; the unblocked input reaches cover', () => {
    // Fault injection: a narrow rail overlaps the cart's side, but not the
    // player's 0.28 m capsule. No health, actor, phase or task fact is modified.
    const obstacle: SolidSpec = { id: 'FAULT-INJECTION-patient-side-rail', position: [-38, 1, 226.46], size: [1, 2, 0.2] };
    const blocked = restore('rescue', [obstacle]), normal = restore('rescue');
    const solo = new Physics(blocked.solids);
    try {
      const start = copy(blocked.sim.player.position);
      solo.add('player', start, blocked.sim.player.height);
      solo.step();
      for (let i = 0; i < 18 / dt; i++) { solo.move('player', -1.5, 0, dt); solo.step(); }
      expect(solo.foot('player')[0], 'the player lane itself must remain physically passable').toBeLessThan(-54);
      const input = { ...emptyIntent, yaw: Math.PI / 2, forward: 1, fire: true, reload: true };
      const ammo = blocked.sim.player.ammo, reserve = blocked.sim.player.reserve;
      let clearSteps = 0;
      while (normal.sim.mission.phase === 4 && clearSteps < 25 / dt) { normal.sim.step(input); clearSteps++; }
      expect(normal.sim.mission.phase).toBe(5);
      expect(normal.sim.has('rescue-meng-under-cover')).toBe(true);
      for (let i = 0; i < clearSteps + 5 / dt; i++) blocked.sim.step(input);
      const stoppedPlayer = copy(blocked.sim.player.position), stoppedPatient = copy(actor(blocked.sim, 'meng').position);
      for (let i = 0; i < 5 / dt; i++) blocked.sim.step(input);
      expect(distance(stoppedPlayer, blocked.sim.player.position), 'the blocked team must stop instead of stretching apart').toBeLessThan(0.05);
      expect(distance(stoppedPatient, actor(blocked.sim, 'meng').position)).toBeLessThan(0.05);
      expect(distance(blocked.sim.player.position, R.carryEnd)).toBeGreaterThan(10);
      expect(blocked.sim.mission.phase).toBe(4);
      expect(blocked.sim.has('rescue-meng-under-cover')).toBe(false);
      expect(blocked.sim.mission.complete).toBe(false);
      expect(blocked.sim.player.ammo).toBe(ammo); expect(blocked.sim.player.reserve).toBe(reserve);
      expect(blocked.sim.ballistics.fired).toBe(0);
      for (let i = 0; i < 2 / dt; i++) blocked.sim.step({ ...input, forward: -1 });
      expect(blocked.sim.player.position[0] - stoppedPlayer[0], 'backing toward the handles must release the bind').toBeGreaterThan(1.5);
      expect(actor(blocked.sim, 'meng').position[0] - stoppedPatient[0]).toBeGreaterThan(1);
      expect(blocked.sim.mission.phase).toBe(4);
      console.info('FINALE_INTERACTION carry', JSON.stringify({ clearSeconds: clearSteps * dt, blockedPlayerX: stoppedPlayer[0],
        blockedPatientX: stoppedPatient[0], soloPlayerX: solo.foot('player')[0], reverseDistance: blocked.sim.player.position[0] - stoppedPlayer[0],
        playerShots: blocked.sim.ballistics.fired, ammoSpent: ammo - blocked.sim.player.ammo }));
    } finally { solo.dispose(); blocked.sim.dispose(); normal.sim.dispose(); blocked.environment.dispose(); normal.environment.dispose(); }
  });

  it('halts actual workers and supplies while the player leaves the door, then resumes real passage on return', () => {
    const { sim, environment } = restore('epilogue');
    const ids = ['worker-0', 'worker-1', 'worker-2', 'supply-cart'];
    try {
      const before = new Map(ids.map(id => [id, copy(actor(sim, id).position)]));
      for (let i = 0; i < 3 / dt; i++) sim.step({ ...emptyIntent, yaw: sim.player.yaw });
      ids.forEach(id => expect(distance(before.get(id)!, actor(sim, id).position), `${id} should begin physically moving`).toBeGreaterThan(0.5));
      moveToward(sim, [-9, 0, 5], 5 / dt);
      expect(distance(sim.player.position, E.holdDoor)).toBeGreaterThan(1.3);
      // Allow one fixed tick to consume the newly read position at the boundary.
      sim.step({ ...emptyIntent, yaw: sim.player.yaw });
      const stopped = new Map(ids.map(id => [id, copy(actor(sim, id).position)]));
      for (let i = 0; i < 20 / dt; i++) sim.step({ ...emptyIntent, yaw: sim.player.yaw });
      ids.forEach(id => expect(distance(stopped.get(id)!, actor(sim, id).position), `${id} drifted while the door was unattended`).toBeLessThan(0.01));
      const maximumDrift = Math.max(...ids.map(id => distance(stopped.get(id)!, actor(sim, id).position)));
      expect(sim.mission.phase).toBe(7); expect(sim.mission.complete).toBe(false);
      moveToward(sim, E.holdDoor, 5 / dt);
      expect(distance(sim.player.position, E.holdDoor)).toBeLessThan(0.4);
      for (let i = 0; i < 60 / dt && !sim.mission.complete; i++) sim.step({ ...emptyIntent, yaw: sim.player.yaw });
      expect(sim.mission.complete).toBe(true);
      ids.forEach(id => { expect(actor(sim, id).position[2], id).toBeLessThan(-4.8); expect(actor(sim, id).goals).toEqual([]); });
      console.info('FINALE_INTERACTION door', JSON.stringify({ unattendedSeconds: 20, maximumDrift, received: ids.length }));
    } finally { sim.dispose(); environment.dispose(); }
  });

  it('a Q request makes Zheng move, fire his own projectiles and damage enemies while the player never shoots', () => {
    const environment = buildEnvironment('rescue'), sim = new Simulation('rescue', environment.solids);
    try {
      moveToward(sim, [-6, 0, 189], 5 / dt);
      expect(distance(sim.player.position, [-6, 0, 189])).toBeLessThan(0.3);
      const zhengStart = copy(actor(sim, 'zheng').position);
      let zhengShotsBefore = 0;
      for (let i = 0; i < 2 / dt; i++) {
        sim.step({ ...emptyIntent, yaw: sim.player.yaw, crouch: true });
        if (sim.ballistics.projectiles.some(p => p.owner === 'zheng')) zhengShotsBefore++;
      }
      expect(distance(zhengStart, actor(sim, 'zheng').position)).toBeLessThan(0.02);
      expect(zhengShotsBefore).toBe(0);
      const enemyHealth = new Map(sim.aliveEnemies.map(a => [a.id, a.health]));
      let ownProjectileSeen = false, actualDamage = false, shotEvents = 0;
      const ammo = sim.player.ammo;
      for (let i = 0; i < 25 / dt && !sim.mission.failed && !actualDamage; i++) {
        sim.step({ ...emptyIntent, yaw: sim.player.yaw, crouch: true, cover: i === 0 });
        if (sim.ballistics.projectiles.some(p => p.owner === 'zheng')) ownProjectileSeen = true;
        if (sim.events.some(event => event.type === 'shot' && event.position && distance(event.position, actor(sim, 'zheng').position) < 0.1)) shotEvents++;
        actualDamage = sim.actors.some(a => a.role === 'enemy' && enemyHealth.has(a.id) && a.health < enemyHealth.get(a.id)!);
      }
      expect(distance(zhengStart, actor(sim, 'zheng').position)).toBeGreaterThan(10);
      expect(ownProjectileSeen).toBe(true); expect(shotEvents).toBeGreaterThan(0);
      expect(actualDamage, 'no damage or health is injected; allied ballistics must hit a real enemy body').toBe(true);
      expect(sim.player.ammo).toBe(ammo); expect(sim.hits).toBe(0); expect(sim.kills).toBe(0);
      expect(sim.mission.failed).toBe(false);
      console.info('FINALE_INTERACTION cover', JSON.stringify({ zhengMeters: distance(zhengStart, actor(sim, 'zheng').position),
        shotEvents, ownProjectileSeen, damage: sim.actors.reduce((sum, a) => sum + Math.max(0, (enemyHealth.get(a.id) ?? a.health) - a.health), 0),
        playerAmmoSpent: ammo - sim.player.ammo, playerHits: sim.hits }));
    } finally { sim.dispose(); environment.dispose(); }
  });
});
