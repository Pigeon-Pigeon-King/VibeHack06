import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/contracts';
import { carryFacts } from '../src/content/chapter-flow';
import { TRANSFER as T } from '../src/content/transfer-layout';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const d3 = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));

// Observes headless state to choose public Intent values. This is geometry/input
// regression evidence, not browser-input or human-experience acceptance.
function playTransfer(skip: boolean, restore: boolean) {
  const env = buildEnvironment('transfer');
  const gate = env.solids.find(solid => solid.openFact === 'transfer-gate-open');
  if (!gate) { env.dispose(); throw new Error('S06 factory is not connected to its actual transfer gate'); }
  // Normal chapter-entry context: Zhou knows, Lu has not yet heard the courier.
  const context = carryFacts('S06', ['sharing-promised', 'zhou-knows-shaoyuan-time', 'zhou-withheld-time', 'mobile-force-warning-shared']);
  let s = new Simulation('transfer', env.solids, undefined, context);
  const ids = s.actors.filter(a => a.role === 'cart').map(a => a.id);
  const walked = new Map<string, number>(), crossed = new Set<string>(), arrivedAt = new Map<string, number>();
  const factsAt = new Map<string, number>(), phases = [0], restores = new Set<number>(), autonomous = new Set<number>();
  let steps = 0, path: Vec3[] = [], goalKey = '', argumentPosition: Vec3 | undefined;
  let argumentAmmo = 0, argumentStarted = 0, argumentEnded = 0;
  const gateTrace = () => s.physics.trace([T.gateCenter[0], 1, T.gateCenter[2] - 1.5],
    [T.gateCenter[0], 1, T.gateCenter[2] + 1.5], undefined, true);
  const summary = () => JSON.stringify({ scenario: s.scenario, time: s.mission.elapsed, phase: s.mission.phase,
    player: s.player.position, health: s.player.health, control: s.mission.control, objective: s.objective,
    facts: s.mission.facts, next: path[0], actors: s.actors.map(a => ({ id: a.id, pos: a.position, goals: a.goals,
      next: a.path[0], safe: a.safe, released: a.released, walked: walked.get(a.id) })), gate: gateTrace() });
  try {
    expect(ids).toEqual(['cart-0', 'cart-1', 'cart-2']);
    expect(s.has('zhou-knows-shaoyuan-time')).toBe(true);
    expect(s.has('lu-knows-shaoyuan-time')).toBe(false);
    expect(s.has('lu-knows-zhou-withheld')).toBe(false);
    expect(gateTrace()?.id).toBe(`solid:${gate.id}`);
    // Enter and fire cannot bypass the work or reveal information before contact.
    for (let i = 0; i < 30; i++) s.step({ ...emptyIntent, skip: true, fire: true });
    expect(s.mission.phase).toBe(0); expect(s.has('lu-knows-shaoyuan-time')).toBe(false);

    while (!s.mission.complete && !s.mission.failed && steps < 600 / FIXED_DT) {
      const phase = s.mission.phase;
      // Stay beside the repaired panel while the convoy leaves: its report must
      // not depend on the player visiting the former observation marker.
      const goal = phase === 2 ? T.panel : s.objective.point;
      const key = `${phase}:${goal.join(',')}`;
      if (key !== goalKey) { path = []; goalKey = key; }
      if (!path.length && distance(s.player.position, goal) > 1.5) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
      const point = path[0] ?? goal, dx = point[0] - s.player.position[0], dz = point[2] - s.player.position[2];
      const moving = distance(s.player.position, goal) > 1.5 && s.mission.control !== 'staged';
      const yaw = moving ? Math.atan2(-dx, -dz) : s.player.yaw;
      const before = new Map(s.actors.map(a => [a.id, [...a.position] as Vec3]));
      s.step({ ...emptyIntent, yaw, pitch: s.player.pitch, forward: moving ? 1 : 0, sprint: true,
        // Only opening/repairing the box and treating the hand use E. Arrival
        // reports and entering the already agreed conversation receive no E.
        interact: [0, 1, 5].includes(phase) && steps % 12 === 0, skip: phase !== 4 || skip, fire: true, ads: true });
      steps++; env.setFacts?.(s.mission.facts);
      if (phases.at(-1) !== s.mission.phase) { phases.push(s.mission.phase); path = []; }
      if ([2, 3].includes(phase) && phase !== s.mission.phase) {
        autonomous.add(phase);
        expect(distance(s.player.position, phase === 2 ? T.watch : T.equipment), 'automatic progression still required the old exact marker').toBeGreaterThan(2.8);
      }
      for (const fact of s.mission.facts) if (!factsAt.has(fact)) factsAt.set(fact, steps);
      for (const actor of s.actors) {
        if (actor.role !== 'cart' && actor.id !== 'xu' && actor.id !== 'luo') continue;
        const delta = d3(actor.position, before.get(actor.id)!);
        expect(delta, `discontinuous ${actor.id}: ${summary()}`).toBeLessThan(0.12);
        walked.set(actor.id, (walked.get(actor.id) ?? 0) + distance(actor.position, before.get(actor.id)!));
        if (actor.role === 'cart' && actor.position[2] > T.gateCenter[2]) {
          expect(s.has('transfer-gate-open'), summary()).toBe(true); crossed.add(actor.id);
        }
        if (actor.safe && !arrivedAt.has(actor.id)) arrivedAt.set(actor.id, steps);
      }
      if (s.has('transfer-gate-open')) expect(gateTrace()?.id).not.toBe(`solid:${gate.id}`);
      if (s.mission.phase >= 3) {
        expect(s.actors.filter(a => a.role === 'cart').every(a => a.safe), summary()).toBe(true);
        expect(s.actors.find(a => a.id === 'xu')!.safe, summary()).toBe(true);
        expect(crossed.size, summary()).toBe(3);
      }
      if (s.mission.phase === 4) {
        if (!argumentPosition) {
          argumentPosition = [...s.player.position]; argumentAmmo = s.player.ammo; argumentStarted = steps;
          expect(s.player.position[0]).toBeGreaterThan(T.equipmentRoom.minX);
          expect(s.player.position[0]).toBeLessThan(T.equipmentRoom.maxX);
          expect(s.player.position[2]).toBeGreaterThan(T.equipmentRoom.minZ);
          expect(s.player.position[2]).toBeLessThan(T.equipmentRoom.maxZ);
        }
        expect(s.mission.control).toBe('staged'); expect(s.player.ads).toBe(false);
        expect(d3(s.player.position, argumentPosition)).toBeLessThan(0.02);
        expect(s.player.ammo).toBe(argumentAmmo);
      }
      if (phase === 4 && s.mission.phase === 5) argumentEnded = steps;
      if (restore && [2, 4, 5].includes(s.mission.phase) && !restores.has(s.mission.phase)) {
        const storage = new Memory(), store = new SaveStore(storage);
        const checkpoint = s.checkpoint;
        expect(store.save('campaign', checkpoint, { chapter: 'campaign', stage: 'S06', elapsedBefore: 900 })).toEqual({ ok: true });
        const loaded = new SaveStore(storage).load('campaign'); expect(loaded.warning).toBeUndefined();
        const replacement = new Simulation('transfer', env.solids, loaded.save!.snapshot);
        expect(replacement.snapshot()).toEqual(checkpoint); expect(replacement.ballistics.projectiles).toHaveLength(0);
        s.dispose(); s = replacement; path = []; restores.add(s.mission.phase);
        expect(gateTrace()?.id).not.toBe(`solid:${gate.id}`);
      }
    }
    expect(s.mission.failed, summary()).toBe(false); expect(s.mission.complete, summary()).toBe(true);
    expect([...autonomous]).toEqual([2, 3]);
    expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.actors.filter(a => a.role === 'cart').map(a => a.id)).toEqual(ids);
    for (const id of ids) {
      expect(walked.get(id), summary()).toBeGreaterThan(20);
      expect(arrivedAt.get(id), summary()).toBeLessThanOrEqual(factsAt.get('transfer-patients-through')!);
    }
    expect(walked.get('xu')).toBeGreaterThan(30); expect(walked.get('luo')).toBeGreaterThan(5);
    expect(arrivedAt.get('xu')!).toBeLessThanOrEqual(factsAt.get('transfer-patients-through')!);
    expect(factsAt.get('transfer-patients-through')!).toBeLessThan(factsAt.get('argument-finished')!);
    expect(factsAt.get('argument-finished')!).toBeLessThan(factsAt.get('transfer-hand-treated')!);
    expect(s.mission.facts).toEqual(expect.arrayContaining(['lu-knows-shaoyuan-time', 'lu-knows-zhou-withheld',
      'argument-finished', 'lu-unfair-accusation', 'zhou-admits-withholding', 'reception-report-delivered',
      'transfer-hand-treated', 'lu-continues-duty', 'source-timestamp-shared']));
    expect(s.has('full-report-shared')).toBe(false);
    expect(distance(s.actors.find(a => a.id === 'luo')!.position, T.exit)).toBeLessThan(1.2);
    expect(s.player.health).toBe(100); expect(s.mission.control).toBe('work');
    if (!skip) expect((argumentEnded - argumentStarted) * FIXED_DT).toBeGreaterThanOrEqual(71);
    if (restore) expect([...restores]).toEqual([2, 4, 5]);
    const result = { facts: [...s.mission.facts].sort(), player: { position: [...s.player.position] as Vec3, health: s.player.health,
      ammo: s.player.ammo, reserve: s.player.reserve }, actors: s.actors.map(a => ({ id: a.id, position: [...a.position] as Vec3,
      safe: a.safe, down: a.down, health: a.health, goals: a.goals, path: a.path })) };
    console.info(`TRANSFER_REPLAY skip=${skip} restore=${restore}`, JSON.stringify({ seconds: s.mission.elapsed,
      phases, restores: [...restores], patientDistance: ids.map(id => [id, walked.get(id)]) }));
    return result;
  } finally { s.dispose(); env.dispose(); }
}

describe('S06 transfer: public-input routes and causality', () => {
  it('moves all three patients and Xu through the physical gate before natural/skip argument endings converge', () => {
    const actual = playTransfer(true, false), expected = playTransfer(false, false);
    expect(actual.facts).toEqual(expected.facts);
    const { position: playerA, ...playerStateA } = actual.player;
    const { position: playerB, ...playerStateB } = expected.player;
    expect(playerStateA).toEqual(playerStateB);
    // The character controller has a 1.5cm contact offset. Long playback can
    // settle bodies a few millimetres differently; story and route state stay exact.
    expect(d3(playerA, playerB)).toBeLessThan(0.02);
    actual.actors.forEach((a, i) => {
      const { position: positionA, ...stateA } = a;
      const { position: positionB, ...stateB } = expected.actors[i];
      expect(stateA).toEqual(stateB); expect(d3(positionA, positionB), a.id).toBeLessThan(0.02);
    });
  }, 90_000);
  it('rebuilds actual open-gate and argument checkpoints, then resumes the work and hand-care sequence', () => {
    playTransfer(false, true);
  }, 90_000);
});
