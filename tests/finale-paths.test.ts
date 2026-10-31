import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ScenarioId, Vec3 } from '../src/contracts';
import { RESCUE as R } from '../src/content/rescue-layout';
import { MEDICAL as M } from '../src/content/medical-layout';
import { EPILOGUE as E } from '../src/content/epilogue-layout';
import { carryFacts, CHAPTER_STAGES, nextStage, stageFor } from '../src/content/chapter-flow';
import { emptyIntent, distance, Simulation, type Snapshot } from '../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, FIXED_DT as dt } from '../src/runtime/Physics';

beforeAll(initializePhysics);
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
function persist(s: Simulation): Snapshot {
  const memory = new Memory(), store = new SaveStore(memory), snap = s.snapshot();
  const result = store.save('campaign', snap, { chapter: 'campaign', stage: stageFor(s.scenario)!.id, elapsedBefore: 2700 });
  expect(result, `${s.scenario}/${s.mission.phase}/${s.mission.phaseTime}`).toEqual({ ok: true });
  expect(store.load('campaign').save!.snapshot).toEqual(snap); return snap;
}
function fixture(s: Simulation): void {
  if (process.env.RECORD_VISUAL_FIXTURES !== '1') return;
  const memory = new Memory(), store = new SaveStore(memory); expect(store.save(s.scenario, s.snapshot())).toEqual({ ok: true });
  const raw = memory.getItem(`${SAVE_KEY_PREFIX}${s.scenario}`)!;
  const base = new URL('../artifacts/runs/visual-fixtures/', import.meta.url); mkdirSync(base, { recursive: true });
  const name = `${s.scenario}-${s.mission.phase}`;
  writeFileSync(new URL(`${name}.json`, base), raw);
  writeFileSync(new URL(`${name}.source.json`, base), JSON.stringify({ kind: 'public-intent-replay-checkpoint',
    sourceTest: 'tests/finale-paths.test.ts', scenario: s.scenario, phase: s.mission.phase, elapsed: s.mission.elapsed,
    phaseTime: s.mission.phaseTime, sha256: createHash('sha256').update(raw).digest('hex'),
    note: '真实公开输入回放的自然路线检查点；局部恢复不是完整人工首通。' }, null, 2));
}
function play(id: 'rescue' | 'medical' | 'epilogue', skip = false, restore = false, facts: string[] = []) {
  const env = buildEnvironment(id); let s = new Simulation(id, env.solids, undefined, facts);
  let steps = 0, path: Vec3[] = [], key = '', allyDamage = 0, heldFrames = 0;
  const phases = [0], restored = new Set<number>(), seenFacts = new Map<string, number>();
  const metrics = { playerDistance: 0, mengDistance: 0, maxEnemies: 0, maxAiming: 0, carryFrames: 0, rejectedShots: 0 };
  const summary = () => JSON.stringify({ id, phase: s.mission.phase, time: s.mission.phaseTime, elapsed: s.mission.elapsed,
    p: s.player.position, hp: s.player.health, objective: s.objective, path: path.slice(0, 3), facts: s.mission.facts,
    actors: s.actors.map(a => ({ id: a.id, pos: a.position, goals: a.goals, path: a.path.slice(0, 2), health: a.health })) });
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(`${message} ${summary()}`); };
  try {
    persist(s);
    while (!s.mission.complete && !s.mission.failed && steps < 1100 / dt) {
      const phase = s.mission.phase, staged = s.mission.control === 'staged';
      let goal = s.objective.point;
      let precision = id === 'rescue' && (phase === 2 || phase === 4) ? 0.12 : id === 'epilogue' && phase >= 6 ? 0.35 : 0.65;
      if (id === 'rescue' && s.mission.control === 'combat' && s.player.ammo + s.player.reserve < 22) {
        goal = [...R.ammo].sort((a, b) => distance(a, s.player.position) - distance(b, s.player.position))[0]; precision = 0.6;
      }
      const newKey = `${phase}:${goal[0]}:${goal[2]}`;
      if (newKey !== key) { path = []; key = newKey; }
      if (distance(s.player.position, goal) < 1.4) path = [[...goal]];
      else if (!path.length) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.25) path.shift();
      const waypoint = path[0] ?? goal;
      let mx = 0, mz = 0;
      if (!staged && distance(s.player.position, goal) > precision) {
        const dx = waypoint[0] - s.player.position[0], dz = waypoint[2] - s.player.position[2], len = Math.max(0.001, Math.hypot(dx, dz));
        mx = dx / len; mz = dz / len;
      }
      const target = s.mission.control === 'combat' ? s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
        .find(a => distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (target) { const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2];
        yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz)); }
      const before = s.snapshot(), beforeFired = s.ballistics.fired;
      const fire = !!target && (s.mission.elapsed > 10 || s.player.health < 60);
      const noPlayerBullet = !s.ballistics.projectiles.some(p => p.owner === 'player');
      s.step({ ...emptyIntent, yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
        right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !target && s.mission.control !== 'cooperative', ads: !!target,
        fire: fire || (id === 'rescue' && phase >= 3), cover: steps % 120 === 0, reload: !s.player.ammo && !s.player.reload,
        interact: steps % 12 === 0 && (id === 'rescue' ? phase === 2 || R.ammo.some(p => distance(p, s.player.position) < 1.5) : id === 'medical' ? [0, 1, 2, 7].includes(phase) : [0, 2, 4, 6].includes(phase)), skip });
      steps++; env.setFacts?.(s.mission.facts);
      metrics.playerDistance += distance(before.player.position, s.player.position);
      const meng = s.actors.find(a => a.id === 'meng'), previousMeng = before.actors.find(a => a.id === 'meng');
      if (meng && previousMeng) metrics.mengDistance += distance(meng.position, previousMeng.position);
      if (id === 'rescue' && phase >= 3 && phase < 5) {
        metrics.carryFrames++; check(s.player.ammo === before.player.ammo, 'occupied hands fired');
        if (beforeFired === s.ballistics.fired) metrics.rejectedShots++;
      }
      if (id === 'rescue' && noPlayerBullet && !fire && s.actors.some(a => a.role === 'enemy'
        && a.health < (before.actors.find(b => b.id === a.id)?.health ?? a.health))) allyDamage++;
      if (!skip && !restore && phase >= 1 && phase !== s.mission.phase) fixture(s);
      for (const fact of s.mission.facts) if (!seenFacts.has(fact)) seenFacts.set(fact, steps);
      for (const a of s.actors.filter(a => a.role !== 'enemy')) {
        const old = before.actors.find(b => b.id === a.id)!;
        if (!skip) check(distance(a.position, old.position) < 0.13, `actor moved discontinuously ${a.id}`);
      }
      metrics.maxEnemies = Math.max(metrics.maxEnemies, s.aliveEnemies.length);
      metrics.maxAiming = Math.max(metrics.maxAiming, s.aliveEnemies.filter(a => a.aiming).length);
      check(metrics.maxEnemies <= 8 && metrics.maxAiming <= 2, 'active combat budget exceeded');
      if (id === 'rescue' && phase >= 5) check(!s.mission.failed && s.player.health > 0, 'fixed injury became a combat failure');
      if (id === 'epilogue' && phase === 7) { heldFrames++; check(!s.mission.complete || aReceived(s), 'completed before real passage'); }
      if (phase !== s.mission.phase) {
        phases.push(s.mission.phase); path = []; persist(s);
        if (restore && !restored.has(s.mission.phase) && !s.mission.complete) {
          const snap = persist(s), replacement = new Simulation(id, env.solids, snap); expect(replacement.snapshot()).toEqual(snap);
          s.dispose(); s = replacement; restored.add(s.mission.phase);
        }
      }
      if (steps % 300 === 0) persist(s);
    }
    check(s.mission.complete && !s.mission.failed, 'public input route did not complete');
    if (id === 'rescue') {
      expect(s.mission.spawned).toBeLessThanOrEqual(40); expect(s.has('rescue-cover-fired')).toBe(true); expect(s.has('rescue-cover-hit')).toBe(true);
      expect(allyDamage, 'ally damage while player not firing and with no old player bullet').toBeGreaterThan(0);
      expect(metrics.carryFrames).toBeGreaterThan(30); expect(metrics.rejectedShots).toBeGreaterThan(30);
      expect(seenFacts.get('rescue-meng-under-cover')!).toBeLessThanOrEqual(seenFacts.get('rescue-zhou-wounded')!);
      expect(s.has('zhou-requested-rescue')).toBe(true); expect(s.has('rescue-both-received')).toBe(true);
      if (!skip) { expect(metrics.mengDistance).toBeGreaterThan(420); expect(phases).toEqual(Array.from({ length: 11 }, (_, i) => i)); }
    } else if (id === 'medical') {
      expect(s.has('zhou-death-confirmed')).toBe(true); expect(s.has('meng-treatment-continues')).toBe(true);
      expect(s.actors.find(a => a.id === 'zhou')!.down).toBe(false); expect(s.mission.failed).toBe(false);
      expect(seenFacts.get('medical-zhou-responsive')!).toBeLessThan(seenFacts.get('zhou-death-confirmed')!);
      expect(phases).toEqual(Array.from({ length: 11 }, (_, i) => i));
    } else {
      expect(metrics.playerDistance).toBeGreaterThan(430); expect(heldFrames * dt).toBeGreaterThan(10);
      expect(s.has('report-includes-losses')).toBe(true); expect(s.has('report-includes-shaoyuan-escape')).toBe(true); expect(aReceived(s)).toBe(true);
      expect(phases).toEqual(Array.from({ length: 9 }, (_, i) => i));
    }
    console.info(`FINALE ${id} skip=${skip} restore=${restore}`, JSON.stringify({ elapsed: s.mission.elapsed, phases, allyDamage, ...metrics }));
    return persist(s);
  } finally { s.dispose(); env.dispose(); }
}
function aReceived(s: Simulation) { return ['worker-0', 'worker-1', 'worker-2', 'supply-cart'].every(id => {
  const a = s.actors.find(x => x.id === id)!; return !a.goals.length && a.position[2] < -4.8;
}); }
function finalState(s: Snapshot) { return { facts: [...s.mission.facts].sort(), health: s.player.health,
  actors: s.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id, role: a.role, down: a.down, name: a.name })) }; }

describe('final campaign whitebox through public intent', () => {
  it('connects twelve chapter entries and carries the original causal order through the finale', () => {
    expect(CHAPTER_STAGES.map(s => s.id)).toEqual(Array.from({ length: 12 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`));
    expect(nextStage('relief')?.scenario).toBe('rescue'); expect(nextStage('rescue')?.scenario).toBe('medical'); expect(nextStage('epilogue')).toBeUndefined();
  });
  for (const id of ['rescue', 'medical', 'epilogue'] as const) {
    it(`${id}: real actions, natural/skip results and persisted phase restore`, () => {
      const normal = play(id), skipped = play(id, true), restored = play(id, false, true);
      expect(finalState(skipped)).toEqual(finalState(normal)); expect(finalState(restored)).toEqual(finalState(normal));
      if (id !== 'epilogue') expect(carryFacts(nextStage(id)!.id, normal.mission.facts).length).toBeGreaterThan(0);
    }, 120_000);
  }
});
