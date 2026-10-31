import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Vec3 } from '../src/contracts';
import { carryFacts } from '../src/content/chapter-flow';
import { RELIEF as R } from '../src/content/relief-layout';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
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
function recordVisualFixture(s: Simulation): void {
  if (process.env.RECORD_VISUAL_FIXTURES !== '1') return;
  const snapshot = s.snapshot(), storage = new Memory(), store = new SaveStore(storage);
  expect(store.save('relief', snapshot)).toEqual({ ok: true });
  const raw = storage.getItem(`${SAVE_KEY_PREFIX}relief`)!;
  expect(store.load('relief').save!.snapshot).toEqual(snapshot);
  const directory = new URL('../artifacts/runs/visual-fixtures/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  // Preserve the actual SaveStore envelope and hash its exact emitted bytes.
  writeFileSync(new URL('relief-care.json', directory), raw, 'utf8');
  writeFileSync(new URL('relief-care.source.json', directory), JSON.stringify({
    kind: 'public-intent-replay-checkpoint', sourceTest: 'tests/relief-paths.test.ts',
    sourceCase: 'physically hands over the posts, crosses under allied fire and accepts care; natural/skip endings converge',
    replay: { skip: false, restore: false, firstPhaseEntry: true },
    artifact: 'relief-care.json', slot: 'relief', scenario: snapshot.mission.scenario,
    phase: snapshot.mission.phase, elapsed: snapshot.mission.elapsed, phaseTime: snapshot.mission.phaseTime,
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    note: '真实公开输入回放到达的检查点；供恢复后的局部视觉观察，不代表人工完整路线通关。',
  }, null, 2) + '\n', 'utf8');
}
const d3 = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]));

// A deterministic headless bot sends only public Intent. It stops shooting once
// the post is handed over; subsequent covering damage must come from allies'
// actual projectiles, not injected hits or the player's previous bullets.
function playRelief(skip: boolean, restore: boolean) {
  const env = buildEnvironment('relief');
  let s = new Simulation('relief', env.solids, undefined, carryFacts('S09', [
    'full-report-shared', 'lu-has-full-report', 'zhou-asks-rest', 'zhou-asks-relief', 'zhou-on-withdrawal-list',
    'escort-patient-transferred', 'escort-pillow-card-preserved', 'escort-convoy-arrived', 'escort-manifest-checked',
    'shaoyuan-passed-dispatch', 'meng-returned-for-relief',
  ]));
  const team = ['meng', 'relief-0', 'relief-1'], ids = s.actors.filter(a => a.role !== 'enemy').map(a => a.id);
  const traveled = new Map<string, number>(), phases = [0], restores = new Set<number | string>(), projectileOwners = new Set<string>();
  const factAt = new Map<string, number>();
  let steps = 0, path: Vec3[] = [], key = '', firstVia = 0, secondVia = 0;
  let maxActive = 0, maxAimers = 0, alliedImpacts = 0, fireInputs = 0, seatedFrames = 0;
  let handoverStart = 0, handoverEnd = 0, restStart = 0, restEnd = 0, reportStart = 0, reportEnd = 0;
  let playerCombatFinished: { hits: number; kills: number } | undefined;
  const summary = () => JSON.stringify({ phase: s.mission.phase, time: s.mission.elapsed, player: s.player.position,
    health: s.player.health, ammo: [s.player.ammo, s.player.reserve], objective: s.objective, next: path[0],
    facts: s.mission.facts, actors: s.actors.map(a => ({ id: a.id, p: a.position, safe: a.safe, health: a.health,
      goals: a.goals, path: a.path.slice(0, 3) })) });
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(`${message}: ${summary()}`); };
  try {
    expect(env.solids.some(solid => solid.id === 'relief-rest-seat')).toBe(true);
    expect(s.player.name).toBe('周延 · 三十三岁');
    expect(s.has('zhou-gives-up-post')).toBe(false);
    while (!s.mission.complete && !s.mission.failed && steps < 900 / FIXED_DT) {
      const phase = s.mission.phase;
      let goal = s.objective.point, precision = phase === 6;
      if (phase === 4) {
        if (firstVia < R.crossingVia[0].length - 1 && distance(s.player.position, R.crossingVia[0][firstVia]) < 0.6) { firstVia++; path = []; }
        goal = R.crossingVia[0][firstVia]; precision = firstVia === 0;
      } else if (phase === 5) {
        if (secondVia < R.crossingVia[1].length - 1 && distance(s.player.position, R.crossingVia[1][secondVia]) < 0.6) { secondVia++; path = []; }
        goal = R.crossingVia[1][secondVia]; precision = secondVia === 0;
      }
      const resupplying = phase < 3 && s.player.reserve + s.player.ammo < 25;
      if (resupplying) {
        goal = [...R.ammo].sort((a, b) => distance(a, s.player.position) - distance(b, s.player.position))[0]; precision = true;
      }
      const nextKey = `${phase}:${goal.map(v => v.toFixed(1)).join(',')}`;
      if (key !== nextKey) { key = nextKey; path = []; }
      // A precise final public-input approach avoids comparing two arbitrary
      // positions within the old 1.5 m bot stopping range after different skips.
      const stop = phase === 9 ? 0.01 : precision ? 0.35 : 1.5;
      if (!path.length && distance(s.player.position, goal) > stop) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
      const next = path[0] ?? goal;
      let mx = 0, mz = 0;
      if (distance(s.player.position, goal) > stop && s.mission.control !== 'staged') {
        const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2], length = Math.max(0.01, Math.hypot(dx, dz));
        mx = dx / length; mz = dz / length;
        if (phase === 9) { const scale = Math.min(1, length / (6.3 * FIXED_DT)); mx *= scale; mz *= scale; }
      }
      const target = phase < 3 ? s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
        .find(a => distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye,
          [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (target) {
        const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2];
        yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz));
      }
      const before = new Map(s.actors.map(a => [a.id, { position: [...a.position] as Vec3, health: a.health }]));
      const noPlayerBullet = phase >= 4 && !s.ballistics.projectiles.some(p => p.owner === 'player');
      if (noPlayerBullet && !playerCombatFinished) playerCombatFinished = { hits: s.hits, kills: s.kills };
      const interact = ([6, 8].includes(phase) || resupplying && R.ammo.some(p => distance(s.player.position, p) < 1.5)) && steps % 12 === 0;
      s.step({ ...emptyIntent, yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
        right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !target, ads: !!target, fire: !!target,
        reload: phase < 3 && !s.player.ammo && !s.player.reload,
        // Entry clearance and physical post handover require no E; sitting,
        // replying to family and taking ammunition remain manual actions.
        interact, skip });
      steps++; if (target) fireInputs++; env.setFacts?.(s.mission.facts);
      for (const fact of s.mission.facts) if (!factAt.has(fact)) factAt.set(fact, steps);
      for (const id of ids) {
        const a = s.actors.find(a => a.id === id)!;
        check(d3(a.position, before.get(id)!.position) < 0.15, `discontinuous participant ${id}`);
        traveled.set(id, (traveled.get(id) ?? 0) + distance(a.position, before.get(id)!.position));
      }
      if (phase >= 4) for (const bullet of s.ballistics.projectiles) if (team.includes(bullet.owner)) projectileOwners.add(bullet.owner);
      if (noPlayerBullet && s.events.some(event => event.type === 'impact' && event.enemy)
        && s.actors.some(a => a.role === 'enemy' && before.has(a.id) && a.health < before.get(a.id)!.health)) alliedImpacts++;
      if (playerCombatFinished) {
        check(s.hits === playerCombatFinished.hits && s.kills === playerCombatFinished.kills, 'player dealt damage after handing over the post');
      }
      maxActive = Math.max(maxActive, s.aliveEnemies.length); maxAimers = Math.max(maxAimers, s.aliveEnemies.filter(a => a.aiming).length);
      check(maxActive <= 8 && maxAimers <= 2 && s.mission.spawned <= 44, 'E08 pressure cap exceeded');
      if (phase !== s.mission.phase) {
        if (phase < 3) check(!interact, 'automatic team entry/handover received E');
        phases.push(s.mission.phase); path = [];
        if (!skip && !restore && s.mission.phase === 7) recordVisualFixture(s);
        if (s.mission.phase === 2) {
          check(s.safeCount === 3, 'handover began before all technicians arrived');
          team.forEach((id, i) => {
            const a = s.actors.find(a => a.id === id)!;
            check(!a.goals.length && distance(a.position, R.reliefPosts[i]) < 1.2, `${id} did not occupy the assigned post`);
          });
        }
        if (s.mission.phase === 3) handoverStart = steps;
        if (phase === 3) {
          handoverEnd = steps;
          const actual = s.snapshot(), storage = new Memory(), store = new SaveStore(storage);
          expect(store.save('relief', actual)).toEqual({ ok: true });
          const damaged = structuredClone(actual); damaged.mission.facts = damaged.mission.facts.filter(f => f !== 'relief-handover-complete');
          expect(store.save('relief', damaged)).toEqual({ ok: false, error: expect.stringContaining('交接状态') });
          expect(store.load('relief').save!.snapshot).toEqual(actual);
        }
        if (phase === 4) check(firstVia === 1 && s.player.position[0] > 19 && s.has('relief-cover-fired'), 'first lateral crossing bypassed actual cover');
        if (phase === 5) check(secondVia === 1 && s.player.position[0] < -19, 'second lateral crossing bypassed the actual withdrawal route');
        if (s.mission.phase === 7) restStart = steps;
        if (phase === 7) restEnd = steps;
        if (s.mission.phase === 9) reportStart = steps;
        if (phase === 9) reportEnd = steps;
      }
      if (s.mission.phase === 7) {
        seatedFrames++;
        check(s.player.height === 1.1 && s.physics.bodies.get('player')!.height === 1.1, 'seated state did not use a seated physical body');
        const zheng = s.actors.find(a => a.id === 'zheng')!;
        if (zheng.goals.length) check(s.mission.phaseTime === 0, 'care timer ran before actual close approach');
        else check(distance(zheng.position, [s.player.position[0], s.player.position[1], s.player.position[2] - 0.8]) < 0.07,
          'care began before Zheng physically reached the precise helping position');
      } else if (s.mission.phase >= 8) check(s.player.height === 1.8, 'player did not regain standing control after care');
      const restoreKey = s.mission.phase === 7 && !restores.has('7-enter') ? '7-enter'
        : ([1, 3, 9].includes(s.mission.phase) || s.mission.phase === 7 && s.mission.phaseTime >= 15) && !restores.has(s.mission.phase) ? s.mission.phase : undefined;
      if (restore && restoreKey !== undefined) {
        const snapshot = restoreKey === 7 ? s.snapshot() : s.checkpoint, storage = new Memory();
        expect(new SaveStore(storage).save('campaign', snapshot, { chapter: 'campaign', stage: 'S09', elapsedBefore: 2500 })).toEqual({ ok: true });
        const loaded = new SaveStore(storage).load('campaign'); expect(loaded.warning).toBeUndefined();
        const replacement = new Simulation('relief', env.solids, loaded.save!.snapshot);
        expect(replacement.snapshot()).toEqual(snapshot); expect(replacement.ballistics.projectiles).toHaveLength(0);
        expect(replacement.physics.bodies.get('player')!.height).toBe(snapshot.player.height);
        if (restoreKey === 7) {
          expect(snapshot.mission.facts).toContain('zhou-brace-adjusted'); expect(snapshot.player.height).toBe(1.1);
          expect(snapshot.mission.facts).not.toContain('zhou-heard-family');
        }
        s.dispose(); s = replacement; path = []; restores.add(restoreKey);
      }
    }
    check(!s.mission.failed && s.mission.complete, 'public-input relief did not complete');
    expect(phases).toEqual(Array.from({ length: 11 }, (_, i) => i));
    expect(fireInputs).toBeGreaterThan(0); expect(s.hits).toBeGreaterThan(0);
    expect(projectileOwners.size).toBeGreaterThan(0); expect(alliedImpacts).toBeGreaterThan(0);
    expect(s.has('relief-cover-hit')).toBe(true); expect(seatedFrames).toBeGreaterThan(0);
    expect(s.safeCount).toBe(3);
    for (const id of ids) expect(s.actors.find(a => a.id === id)!.down).toBe(false);
    for (const id of ['worker-0', 'worker-1', 'worker-2']) expect(traveled.get(id), id).toBeGreaterThan(55);
    team.slice(1).forEach((id, i) => {
      const a = s.actors.find(a => a.id === id)!;
      expect(a.goals).toEqual([]); expect(distance(a.position, R.reliefPosts[i + 1])).toBeLessThan(1.2);
      expect(traveled.get(id), id).toBeGreaterThan(75);
    });
    const meng = s.actors.find(a => a.id === 'meng')!;
    expect(meng.goals).toEqual([]); expect(distance(meng.position, R.rest)).toBeLessThan(6);
    expect(traveled.get('meng')).toBeGreaterThan(180);
    expect(factAt.get('relief-posts-held')!).toBeLessThan(factAt.get('zhou-gives-up-post')!);
    expect(factAt.get('relief-cover-fired')!).toBeLessThanOrEqual(factAt.get('zhou-crossed-first-cover')!);
    expect(factAt.get('zhou-accepts-help')!).toBeLessThan(factAt.get('zhou-heard-family')!);
    expect(factAt.get('zhou-heard-family')!).toBeLessThan(factAt.get('zhou-family-reply-queued')!);
    expect((reportEnd - reportStart) * FIXED_DT).toBeGreaterThanOrEqual(20);
    if (!skip) { expect((handoverEnd - handoverStart) * FIXED_DT).toBeGreaterThanOrEqual(28); expect((restEnd - restStart) * FIXED_DT).toBeGreaterThanOrEqual(38); }
    if (restore) expect([...restores]).toEqual([1, 3, '7-enter', 7, 9]);
    const result = { facts: [...s.mission.facts].sort(), player: { position: [...s.player.position] as Vec3,
      health: s.player.health, ammo: s.player.ammo, reserve: s.player.reserve, height: s.player.height }, actors: s.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id,
      position: [...a.position] as Vec3, health: a.health, safe: a.safe, down: a.down, goals: a.goals, path: a.path })) };
    console.info(`RELIEF_REPLAY skip=${skip} restore=${restore}`, JSON.stringify({ seconds: s.mission.elapsed, spawned: s.mission.spawned,
      kills: s.kills, maxActive, maxAimers, phases, restores: [...restores], projectileOwners: [...projectileOwners], alliedImpacts }));
    return result;
  } finally { s.dispose(); env.dispose(); }
}

describe('S09 relief: public-input handover and actual covering fire', () => {
  it('physically hands over the posts, crosses under allied fire and accepts care; natural/skip endings converge', () => {
    const actual = playRelief(true, false), expected = playRelief(false, false);
    expect(actual.facts).toEqual(expected.facts);
    const { position: pa, ...sa } = actual.player, { position: pb, ...sb } = expected.player;
    expect(sa).toEqual(sb); expect(d3(pa, pb)).toBeLessThan(0.02);
    actual.actors.forEach((a, i) => {
      const { position: xa, ...aa } = a, { position: xb, ...ab } = expected.actors[i];
      expect(aa).toEqual(ab); expect(d3(xa, xb), a.id).toBeLessThan(0.02);
    });
  }, 120_000);
  it('restores actual incoming-team, handover, seated-care and final-report snapshots without replaying or erasing facts', () => {
    playRelief(false, true);
  }, 120_000);
});
