import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Vec3 } from '../src/contracts';
import { carryFacts } from '../src/content/chapter-flow';
import { ESCORT as E } from '../src/content/escort-layout';
import { escortPatients } from '../src/mission/Escort';
import { distance, emptyIntent, Simulation, type Actor } from '../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
function recordVisualFixture(s: Simulation, name: 'escort-monitor' | 'escort-transfer'): void {
  if (process.env.RECORD_VISUAL_FIXTURES !== '1') return;
  const snapshot = s.snapshot(), storage = new Memory(), store = new SaveStore(storage);
  expect(store.save('escort', snapshot)).toEqual({ ok: true });
  const raw = storage.getItem(`${SAVE_KEY_PREFIX}escort`)!;
  expect(store.load('escort').save!.snapshot).toEqual(snapshot);
  const directory = new URL('../artifacts/runs/visual-fixtures/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  // Write the exact validated SaveStore envelope bytes, not a handcrafted save
  // or a naked Snapshot. The companion hash covers these exact UTF-8 bytes.
  writeFileSync(new URL(`${name}.json`, directory), raw, 'utf8');
  writeFileSync(new URL(`${name}.source.json`, directory), JSON.stringify({
    kind: 'public-intent-replay-checkpoint', sourceTest: 'tests/escort-paths.test.ts',
    sourceCase: 'walks both bridge stairs and escorts the same two patients and two attendants; natural/skip endings converge',
    replay: { skip: false, restore: false, firstPhaseEntry: true },
    artifact: `${name}.json`, slot: 'escort', scenario: snapshot.mission.scenario,
    phase: snapshot.mission.phase, elapsed: snapshot.mission.elapsed, phaseTime: snapshot.mission.phaseTime,
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    note: '真实公开输入回放到达的检查点；供恢复后的局部视觉观察，不代表人工完整路线通关。',
  }, null, 2) + '\n', 'utf8');
}
const d3 = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));
// Separating-axis clearance for the actual 0.9m by 2.4m cart footprints.
const cartSeparation = (a: Actor, b: Actor) => {
  const axes = (yaw: number) => [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]];
  const aa = axes(a.yaw), bb = axes(b.yaw), dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2];
  const radius = (axis: number[], basis: number[][]) => Math.abs(axis[0] * basis[0][0] + axis[1] * basis[0][1]) * 0.45
    + Math.abs(axis[0] * basis[1][0] + axis[1] * basis[1][1]) * 1.2;
  return Math.max(...[...aa, ...bb].map(axis => Math.abs(dx * axis[0] + dz * axis[1]) - radius(axis, aa) - radius(axis, bb)));
};

// Deterministic headless input driver, not human/browser acceptance. Neither the
// mission nor its actors are edited. The raised combat bridge uses its actual
// authored stair approaches rather than the ground-only navigation grid.
function playEscort(skip: boolean, restore: boolean) {
  const env = buildEnvironment('escort');
  let s = new Simulation('escort', env.solids, undefined, carryFacts('S08', [
    'family-escort-promised', 'technicians-received', 'full-report-shared', 'lu-has-full-report',
    'source-timestamp-shared', 'zhou-asks-rest', 'zhou-asks-relief', 'zhou-on-withdrawal-list',
  ]));
  const ids = s.actors.map(a => a.id), traveled = new Map<string, number>();
  const initialPatientNames = escortPatients(s).map(a => a.name);
  const phases = [0], restores = new Set<number | string>(), factAt = new Map<string, number>();
  let steps = 0, phaseSteps = 0, path: Vec3[] = [], goalKey = '', climb = 0, descend = 0, maxHeight = 0;
  let maxActive = 0, maxAimers = 0, fireInputs = 0, cooperativeStart = 0, readyFrames = 0;
  let deniedSkip = false, repairStart = 0, repairEnd = 0, decisionStart = 0, decisionEnd = 0;
  const retiredRestored = new Set<string>(), retreatStarts = new Map<string, Vec3>();
  const summary = () => JSON.stringify({ phase: s.mission.phase, time: s.mission.elapsed, player: s.player.position,
    health: s.player.health, ammo: [s.player.ammo, s.player.reserve], objective: s.objective, next: path[0], climb, descend,
    facts: s.mission.facts, actors: s.actors.map(a => ({ id: a.id, name: a.name, p: a.position, safe: a.safe, down: a.down,
      goals: a.goals, path: a.path.slice(0, 3), health: a.health })) });
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(`${message}: ${summary()}`); };
  const checkLeg = (leg: number) => {
    const people = [...escortPatients(s), ...[0, 1].map(i => s.actors.find(a => a.id === `walker-${i}`)!)];
    const goals = [...E.convoyLegs[leg].cartStops, ...E.convoyLegs[leg].walkerStops];
    people.forEach((a, i) => check(distance(a.position, goals[i]) < 1.2, `${a.id} did not physically finish leg ${leg}`));
  };
  try {
    expect(s.physics.trace([E.sidePlatform[0], 5, E.sidePlatform[2]], [E.sidePlatform[0], -0.2, E.sidePlatform[2]], undefined, true)?.point[1],
      'S08 must use its raised bridge, not fallback geometry').toBeCloseTo(2.4, 1);
    expect(escortPatients(s).map(a => a.id)).toEqual(['cart-0', 'cart-1']);
    expect(s.has('shaoyuan-departure-confirmed')).toBe(false);
    while (!s.mission.complete && !s.mission.failed && steps < 1400 / FIXED_DT) {
      const phase = s.mission.phase;
      let goal = s.objective.point, authored = false, precision = false;
      if (phase === 1) goal = E.reception;
      if (phase === 12) goal = [E.manifest[0] - 4, E.manifest[1], E.manifest[2] - 2];
      if (phase === 14) goal = E.manifest;
      if (phase === 7) {
        const stairs = [E.platformStairStart, E.platformStairTop, E.sidePlatform];
        if (climb < 2 && d3(s.player.position, stairs[climb]) < 0.6) { climb++; path = []; }
        goal = stairs[climb]; authored = climb > 0; precision = true;
      } else if (phase === 8 && descend < 2) {
        const stairs = [E.platformDescentTop, E.platformDescentEnd];
        if (d3(s.player.position, stairs[descend]) < 0.6) { descend++; path = []; }
        if (descend < 2) { goal = stairs[descend]; authored = true; precision = true; }
      }
      // Enter is intentionally supplied while away from the bed for nine seconds.
      // A staged skip must not substitute for the positioned cooperative action.
      const denyingCooperation = phase === 11 && steps - cooperativeStart < 9 / FIXED_DT;
      if (phase === 11) { goal = denyingCooperation ? s.player.position : E.changeAssist; precision = true; }
      const resupplying = s.mission.control === 'combat' && s.player.reserve + s.player.ammo < 25 && !authored;
      if (resupplying) {
        goal = [...E.ammo].sort((a, b) => distance(a, s.player.position) - distance(b, s.player.position))[0]; precision = true;
      }
      const key = `${phase}:${authored}:${goal.map(v => v.toFixed(1)).join(',')}`;
      if (goalKey !== key) { goalKey = key; path = []; }
      const stop = precision ? 0.35 : 1.5;
      if (!authored && !path.length && distance(s.player.position, goal) > stop) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
      const next = authored ? goal : path[0] ?? goal;
      let mx = 0, mz = 0;
      if (distance(s.player.position, goal) > stop && s.mission.control !== 'staged') {
        const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2], length = Math.max(0.01, Math.hypot(dx, dz));
        mx = dx / length; mz = dz / length;
      }
      const target = s.mission.control === 'combat' ? s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
        // The restore run only suppresses the current objective's fire line. It
        // leaves unrelated distant opponents alive instead of sweeping the map.
        .find(a => (!restore || distance(a.position, s.objective.point) < 52 && !s.physics.trace(
          [s.objective.point[0], s.objective.point[1] + 1.66, s.objective.point[2]], [a.position[0], a.position[1] + 1.66, a.position[2]], undefined, true))
          && distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye,
          [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (target) {
        const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2];
        yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz));
      }
      const before = new Map(s.actors.filter(a => a.role !== 'enemy').map(a => [a.id, [...a.position] as Vec3]));
      const medic = s.actors.find(a => a.id === 'medic')!;
      if (phase === 11 && distance(s.player.position, E.changeAssist) < 1.2 && !medic.goals.length && medic.released && distance(medic.position, E.medic) < 1.2) readyFrames++;
      else readyFrames = 0;
      const interact = ([0, 3, 10, 13].includes(phase) || resupplying && E.ammo.some(p => distance(s.player.position, p) < 1.5)) && phaseSteps % 12 === 0;
      s.step({ ...emptyIntent, yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
        right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !target, ads: !!target, fire: !!target,
        reload: s.mission.control === 'combat' && !s.player.ammo && !s.player.reload,
        // Combat-sector clearance, Luo's return and actual convoy/team arrivals
        // never receive an interaction; E only performs a manual task or refill.
        interact, skip: phase === 11 || skip });
      steps++; phaseSteps++; if (target) fireInputs++; env.setFacts?.(s.mission.facts);
      for (const fact of s.mission.facts) if (!factAt.has(fact)) factAt.set(fact, steps);
      maxHeight = Math.max(maxHeight, s.player.position[1]);
      for (const id of ids) {
        const a = s.actors.find(a => a.id === id)!;
        check(d3(a.position, before.get(id)!) < 0.15, `discontinuous participant ${id}`);
        traveled.set(id, (traveled.get(id) ?? 0) + distance(a.position, before.get(id)!));
        if (a.role === 'cart') check(Math.abs(a.position[1]) < 0.15, `${id} left the level patient lane`);
      }
      maxActive = Math.max(maxActive, s.aliveEnemies.length); maxAimers = Math.max(maxAimers, s.aliveEnemies.filter(a => a.aiming).length);
      check(maxActive <= 8 && maxAimers <= 2, 'pressure cap exceeded');
      for (const [group, budget] of [['E06', 32], ['E07', 38]] as const) check(s.actors.filter(a => a.id.startsWith(`enemy-${group}-`)).length <= budget, `${group} budget exceeded`);
      if (phase !== s.mission.phase) {
        if ([1, 5, 6, 7, 8, 9, 12, 14].includes(phase)) check(!interact, 'automatic progression received E');
        if (phase === 1) check(distance(s.player.position, E.luoDesk) > 2.8, 'Luo return still required following him to the exact desk');
        if (phase === 12) check(distance(s.player.position, E.arrival) > 2.8, 'convoy arrival still required the old marker');
        if (phase === 14) check(distance(s.player.position, E.exit) > 2.8, 'allied departure still required the player exit marker');
        phases.push(s.mission.phase); path = []; phaseSteps = 0;
        if (!skip && !restore && s.mission.phase === 4) recordVisualFixture(s, 'escort-monitor');
        if (!skip && !restore && s.mission.phase === 11) recordVisualFixture(s, 'escort-transfer');
        if (s.mission.phase === 2) repairStart = steps;
        if (phase === 2) repairEnd = steps;
        if (s.mission.phase === 4) decisionStart = steps;
        if (phase === 4) decisionEnd = steps;
        if (phase === 7) { checkLeg(0); check(s.player.position[1] > 2.2 && climb === 2, 'upper bridge was bypassed'); }
        if (phase === 8) check(descend === 2 && s.player.position[1] < 0.2, 'upper bridge descent was bypassed');
        if (s.mission.phase === 11) { checkLeg(1); cooperativeStart = steps; }
        if (phase === 11) {
          check(deniedSkip && readyFrames * FIXED_DT >= 8 - FIXED_DT * 2, 'cooperation completed without eight seconds at the bed');
          const actual = s.snapshot(), storage = new Memory(), store = new SaveStore(storage);
          expect(store.save('escort', actual)).toEqual({ ok: true });
          const damaged = structuredClone(actual); damaged.mission.facts = damaged.mission.facts.filter(f => f !== 'escort-patient-transferred');
          expect(store.save('escort', damaged)).toEqual({ ok: false, error: expect.stringContaining('换车状态') });
          expect(store.load('escort').save!.snapshot).toEqual(actual);
        }
        if (s.mission.phase === 13) checkLeg(2);
      }
      if (denyingCooperation) check(s.mission.phase === 11 && !s.has('escort-patient-transferred'), 'Enter skipped the cooperative transfer');
      if (phase === 11 && !denyingCooperation) deniedSkip = true;
      check(escortPatients(s).every((patient, i) => patient.name === initialPatientNames[i]),
        'the same two patients must retain their names and order when their physical cart changes');
      if (s.mission.phase < 12) {
        check(escortPatients(s).map(a => a.id).join(',') === 'cart-0,cart-1', 'patient identity changed before the transfer');
        check(distance(s.actors.find(a => a.id === 'cart-2')!.position, E.replacement) < 0.02, 'empty spare moved before the transfer');
      } else {
        check(escortPatients(s).map(a => a.id).join(',') === 'cart-2,cart-1', 'transferred patient disappeared or became an extra patient');
        const emptyCart = s.actors.find(a => a.id === 'cart-0')!;
        check(emptyCart.name === '故障空车' && !initialPatientNames.includes(emptyCart.name), 'the empty original cart still impersonates a patient');
        check(distance(emptyCart.position, E.convoyLegs[1].cartStops[0]) < 1.2, 'empty original cart did not remain at the exchange bay');
        const following = s.actors.find(a => a.id === 'cart-1')!;
        for (const id of ['cart-0', 'cart-2']) check(cartSeparation(following, s.actors.find(a => a.id === id)!) > 0.1,
          `second patient intersected ${id} instead of physically passing around the exchange bay`);
      }
      const retired = s.actors.filter(a => a.role === 'enemy' && a.safe && !a.down);
      for (const enemy of s.actors.filter(a => a.role === 'enemy' && s.has(`escort-retreat-${a.id}`))) {
        if (!retreatStarts.has(enemy.id)) retreatStarts.set(enemy.id, [...enemy.position]);
        if (enemy.safe) check(Math.min(...E.enemyEntries.flat().map(p => distance(enemy.position, p))) < 0.85, 'enemy vanished before physically reaching an exit');
      }
      if (s.mission.phase >= 5 && s.mission.phase <= 9) {
        for (const enemy of s.actors.filter(a => a.role === 'enemy' && !a.down && s.has(`escort-sector-${s.mission.phase - 5}-${a.id}`))) {
          check(!enemy.safe && !s.has(`escort-retreat-${enemy.id}`) && s.physics.bodies.has(enemy.id), 'new encounter pressure retired before the player could engage');
        }
      }
      const restoreKey = [5, 8, 11, 12, 14].includes(s.mission.phase) && !restores.has(s.mission.phase) ? s.mission.phase
        : retired.length && !restores.has('retired') ? 'retired' : undefined;
      if (restore && restoreKey !== undefined) {
        const snapshot = restoreKey === 'retired' ? s.snapshot() : s.checkpoint, storage = new Memory();
        expect(new SaveStore(storage).save('campaign', snapshot, { chapter: 'campaign', stage: 'S08', elapsedBefore: 1800 })).toEqual({ ok: true });
        const loaded = new SaveStore(storage).load('campaign'); expect(loaded.warning).toBeUndefined();
        const replacement = new Simulation('escort', env.solids, loaded.save!.snapshot);
        expect(replacement.snapshot()).toEqual(snapshot); expect(replacement.ballistics.projectiles).toHaveLength(0);
        for (const enemy of snapshot.actors.filter(a => a.role === 'enemy' && a.safe && !a.down)) {
          expect(replacement.physics.bodies.has(enemy.id)).toBe(false); expect(enemy.health).toBeGreaterThan(0); retiredRestored.add(enemy.id);
        }
        expect(replacement.kills).toBe(snapshot.kills);
        for (const id of ['cart-0', 'cart-1', 'cart-2']) expect(replacement.physics.bodies.has(id)).toBe(true);
        s.dispose(); s = replacement; restores.add(restoreKey); path = [];
      }
    }
    check(!s.mission.failed && s.mission.complete, 'public-input escort did not complete');
    expect(phases).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(maxHeight).toBeGreaterThan(2.2); expect(fireInputs).toBeGreaterThan(0); expect(s.hits).toBeGreaterThan(0);
    expect(s.actors.filter(a => a.role !== 'enemy').map(a => a.id)).toEqual(ids);
    expect(traveled.get('cart-0')).toBeGreaterThan(210); expect(traveled.get('cart-2')).toBeGreaterThan(150);
    for (const id of ['cart-1', 'walker-0', 'walker-1']) expect(traveled.get(id), id).toBeGreaterThan(375);
    for (const id of ['meng', 'relief-0', 'relief-1']) {
      const a = s.actors.find(a => a.id === id)!;
      expect(a.goals, id).toEqual([]); expect(distance(a.position, E.returnExit), id).toBeLessThan(4);
      expect(traveled.get(id), id).toBeGreaterThan(380);
    }
    expect(factAt.get('luo-stays-voluntarily')!).toBeLessThan(factAt.get('shaoyuan-departure-confirmed')!);
    expect(factAt.get('pursuit-staffing-cost-known')!).toBeLessThan(factAt.get('escort-patient-transferred')!);
    expect(factAt.get('escort-patient-transferred')!).toBeLessThan(factAt.get('escort-convoy-arrived')!);
    expect(factAt.get('escort-manifest-checked')!).toBeLessThan(factAt.get('meng-returned-for-relief')!);
    if (!skip) { expect((repairEnd - repairStart) * FIXED_DT).toBeGreaterThanOrEqual(24); expect((decisionEnd - decisionStart) * FIXED_DT).toBeGreaterThanOrEqual(58); }
    if (restore) {
      expect([...restores].filter(x => typeof x === 'number')).toEqual([5, 8, 11, 12, 14]); expect(retiredRestored.size).toBeGreaterThan(0);
      for (const id of retiredRestored) expect(distance(retreatStarts.get(id)!, s.actors.find(a => a.id === id)!.position), `${id} actually walked out`).toBeGreaterThan(0.2);
    }
    const result = { facts: [...s.mission.facts].sort(), player: { position: [...s.player.position] as Vec3,
      health: s.player.health, ammo: s.player.ammo, reserve: s.player.reserve }, actors: s.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id,
      position: [...a.position] as Vec3, health: a.health, safe: a.safe, down: a.down, goals: a.goals, path: a.path })) };
    console.info(`ESCORT_REPLAY skip=${skip} restore=${restore}`, JSON.stringify({ seconds: s.mission.elapsed, spawned: s.mission.spawned,
      kills: s.kills, maxActive, maxAimers, phases, restores: [...restores], retiredRestored: [...retiredRestored] }));
    return result;
  } finally { s.dispose(); env.dispose(); }
}

describe('S08 escort: public-input convoy and cooperative transfer', () => {
  it('walks both bridge stairs and escorts the same two patients and two attendants; natural/skip endings converge', () => {
    const actual = playEscort(true, false), expected = playEscort(false, false);
    expect(actual.facts).toEqual(expected.facts);
    const { position: pa, ...sa } = actual.player, { position: pb, ...sb } = expected.player;
    expect(sa).toEqual(sb); expect.soft(d3(pa, pb), 'player terminal pose').toBeLessThan(0.02);
    actual.actors.forEach((a, i) => {
      const { position: xa, ...aa } = a, { position: xb, ...ab } = expected.actors[i];
      expect(aa).toEqual(ab); expect.soft(d3(xa, xb), `${a.id}: ${JSON.stringify([xa, xb])}`).toBeLessThan(0.02);
    });
  }, 120_000);
  it('restores real combat, exchange and return checkpoints including living enemies that already left the field', () => {
    playEscort(false, true);
  }, 120_000);
});
