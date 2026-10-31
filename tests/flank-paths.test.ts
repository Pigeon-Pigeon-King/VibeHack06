import { beforeAll, describe, expect, it } from 'vitest';
import { FLANK_DIALOGUE_TIMING as D } from '../src/content/flank-dialogue-timing';
import { DIALOGUE_CATALOG } from '../src/audio/catalog';
import type { Vec3 } from '../src/contracts';
import { carryFacts } from '../src/content/chapter-flow';
import { FLANK as F } from '../src/content/flank-layout';
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

// Deterministic headless driver, not human or browser acceptance. All progression,
// movement and combat use public Intent. The authored stairs are driven explicitly
// because the ground navigation grid cannot represent a second floor.
function playFlank(skip: boolean, restore: boolean) {
  const env = buildEnvironment('flank');
  const context = carryFacts('S07', ['sharing-promised', 'zhou-knows-shaoyuan-time', 'zhou-withheld-time',
    'lu-knows-shaoyuan-time', 'lu-knows-zhou-withheld', 'transfer-gate-open', 'transfer-patients-through',
    'argument-finished', 'lu-unfair-accusation', 'zhou-admits-withholding', 'lu-continues-duty', 'source-timestamp-shared']);
  let s = new Simulation('flank', env.solids, undefined, context);
  const ids = s.actors.filter(a => a.role === 'worker' || a.role === 'cart' || a.id.startsWith('walker-')).map(a => a.id);
  const traveled = new Map<string, number>(), arrivedAt = new Map<string, number>(), walkedAbove = new Set<string>();
  const factsAt = new Map<string, number>(), phases = [0], restores = new Set<number>();
  let steps = 0, path: Vec3[] = [], goalKey = '', climb = 0, descend = 0, reachedPlatform = false, reachedLower = false;
  let maxCartHeight = 0, maxActive = 0, maxAimers = 0, fireInputs = 0, reportStart = 0, reportEnd = 0;
  let admissionStart = 0, admissionEnd = 0;
  const summary = () => JSON.stringify({ time: s.mission.elapsed, phase: s.mission.phase, player: s.player.position,
    health: s.player.health, ammo: [s.player.ammo, s.player.reserve], objective: s.objective, next: path[0], climb, descend,
    facts: s.mission.facts, active: s.aliveEnemies.map(a => ({ id: a.id, pos: a.position, next: a.path[0] })),
    participants: s.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id, pos: a.position, safe: a.safe,
      goals: a.goals, next: a.path[0], distance: traveled.get(a.id) })) });
  try {
    const platformFloor = s.physics.trace([F.platform[0], 5, F.platform[2]], [F.platform[0], -0.2, F.platform[2]], undefined, true);
    expect(platformFloor?.point[1], 'S07 must use its actual 2.4m platform, not fallback geometry').toBeCloseTo(2.4, 1);
    expect(s.player.name).toBe('周延 · 三十三岁');
    expect(s.has('lu-has-full-report')).toBe(false);
    while (!s.mission.complete && !s.mission.failed && steps < 900 / FIXED_DT) {
      const phase = s.mission.phase;
      let goal = s.objective.point, authored = false;
      // The two manifest reports are received by radio; do not visit the former
      // observation marker merely to unlock arrival that has already occurred.
      if (phase === 4) goal = F.report;
      if (phase === 0) {
        const stairs = [F.platformStairStart, F.platformStairTop, F.platform];
        if (climb < 2 && d3(s.player.position, stairs[climb]) < 0.6) { climb++; path = []; }
        goal = stairs[climb]; authored = climb > 0;
        if (climb === 2 && distance(s.player.position, F.platform) < 2 && s.player.position[1] > 2.2) reachedPlatform = true;
      } else if (phase === 1 && descend < 2) {
        const stairs = [F.platformDescentTop, F.platformDescentEnd];
        if (d3(s.player.position, stairs[descend]) < 0.6) {
          descend++; path = [];
          if (descend === 2) { reachedLower = true; expect(s.player.position[1]).toBeLessThan(0.3); }
        }
        if (descend < 2) { goal = stairs[descend]; authored = true; }
      }
      // A nearby but occluded opponent can require a real lateral approach. Only
      // use ground flanking after the authored descent, never shortcut the stairs.
      if (!authored && phase >= 1 && phase <= 2 && distance(s.player.position, goal) < 2) {
        const threat = s.aliveEnemies.find(a => distance(a.position, goal) < 52 && !s.physics.trace(
          [goal[0], goal[1] + 1.66, goal[2]], [a.position[0], a.position[1] + 1.66, a.position[2]], undefined, true));
        if (threat) goal = [threat.position[0] + (threat.position[0] < s.player.position[0] ? 4 : -4), 0, threat.position[2] + 4];
      }
      const key = `${phase}:${authored}:${goal.map(v => v.toFixed(1)).join(',')}`;
      if (key !== goalKey) { path = []; goalKey = key; }
      // The first stair anchor is also a precise approach, even though reaching
      // it from the spawn still uses the ground grid.
      const stopRange = authored || phase === 0 ? 0.35 : 1.5;
      if (!authored && !path.length && distance(s.player.position, goal) > stopRange) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
      const point = authored ? goal : path[0] ?? goal;
      let mx = 0, mz = 0;
      if (distance(s.player.position, goal) > stopRange && s.mission.control !== 'staged') {
        const dx = point[0] - s.player.position[0], dz = point[2] - s.player.position[2], length = Math.max(0.01, Math.hypot(dx, dz));
        mx = dx / length; mz = dz / length;
      }
      const target = s.mission.control === 'combat' ? s.aliveEnemies.slice()
        .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
        .find(a => distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye,
          [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (target) {
        const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2];
        yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz));
      }
      const before = new Map(s.actors.map(a => [a.id, [...a.position] as Vec3]));
      s.step({ ...emptyIntent, yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
        right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !target, ads: !!target, fire: !!target,
        reload: s.mission.control === 'combat' && !s.player.ammo && !s.player.reload,
        // Defended sectors and actual arrivals progress without E; adoption of
        // the route, the original report and accepting relief remain deliberate.
        interact: [3, 6, 7].includes(phase) && steps % 12 === 0, skip: phase !== 5 || skip });
      steps++; if (target) fireInputs++; env.setFacts?.(s.mission.facts);
      if (phase === 0 && s.mission.phase === 1) {
        expect(s.player.position[1], summary()).toBeGreaterThan(2.2); reachedPlatform = true;
      }
      if (phase === 4 && s.mission.phase === 5) {
        expect(distance(s.player.position, F.routeWatch), 'arrival report still required the old observation marker').toBeGreaterThan(2.8);
      }
      if (phases.at(-1) !== s.mission.phase) { phases.push(s.mission.phase); path = []; }
      for (const fact of s.mission.facts) if (!factsAt.has(fact)) factsAt.set(fact, steps);
      for (const id of ids) {
        const a = s.actors.find(a => a.id === id)!;
        const delta = d3(a.position, before.get(id)!);
        expect(delta, `discontinuous ${id}: ${summary()}`).toBeLessThan(0.2);
        traveled.set(id, (traveled.get(id) ?? 0) + distance(a.position, before.get(id)!));
        if (a.safe && !arrivedAt.has(id)) arrivedAt.set(id, steps);
        if (a.role === 'cart') maxCartHeight = Math.max(maxCartHeight, a.position[1]);
        if (id.startsWith('walker-') && a.position[1] > 1.05 && a.position[2] > -16 && a.position[2] < -6) walkedAbove.add(id);
      }
      maxActive = Math.max(maxActive, s.aliveEnemies.length);
      maxAimers = Math.max(maxAimers, s.aliveEnemies.filter(a => a.aiming).length);
      if (maxActive > 8 || maxAimers > 2 || s.mission.spawned > 44) throw new Error(`S07 pressure exceeded: ${summary()}`);
      if (s.mission.phase >= 3) {
        expect(s.safeCount, summary()).toBe(3);
        expect(reachedPlatform, summary()).toBe(true); expect(reachedLower, summary()).toBe(true);
      }
      if (s.mission.phase <= 4) expect(s.has('full-report-shared')).toBe(false);
      if (s.mission.phase >= 5) {
        expect(s.actors.filter(a => a.role === 'cart' || a.id.startsWith('walker-')).every(a => a.safe), summary()).toBe(true);
        expect(walkedAbove.size, summary()).toBe(2);
      }
      if (phase !== 5 && s.mission.phase === 5) admissionStart = steps;
      if (phase === 5 && s.mission.phase === 6) admissionEnd = steps;
      if (s.has('full-report-transmission') && !reportStart) reportStart = steps;
      if (phase === 6 && s.mission.phase === 7) reportEnd = steps;
      if (restore && ((s.mission.phase === 2 && s.has('flank-tank-base-secured')) || s.mission.phase === 4 || s.mission.phase === 6)
        && !restores.has(s.mission.phase)) {
        const storage = new Memory(), checkpoint = s.checkpoint;
        expect(new SaveStore(storage).save('campaign', checkpoint, { chapter: 'campaign', stage: 'S07', elapsedBefore: 1200 })).toEqual({ ok: true });
        const loaded = new SaveStore(storage).load('campaign'); expect(loaded.warning).toBeUndefined();
        const replacement = new Simulation('flank', env.solids, loaded.save!.snapshot);
        expect(replacement.snapshot()).toEqual(checkpoint); expect(replacement.ballistics.projectiles).toHaveLength(0);
        s.dispose(); s = replacement; path = []; restores.add(s.mission.phase);
      }
    }
    expect(s.mission.failed, summary()).toBe(false); expect(s.mission.complete, summary()).toBe(true);
    expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.actors.filter(a => a.role === 'worker' || a.role === 'cart' || a.id.startsWith('walker-')).map(a => a.id)).toEqual(ids);
    expect(maxCartHeight).toBeLessThan(0.15); expect(walkedAbove.size).toBe(2);
    for (const id of ids) {
      expect(traveled.get(id), `${id}: ${summary()}`).toBeGreaterThan(id.startsWith('worker-') ? 45 : 55);
      expect(arrivedAt.get(id), `${id}: ${summary()}`).toBeLessThanOrEqual(factsAt.get('meng-route-proven')!);
    }
    expect(factsAt.get('meng-route-proven')!).toBeLessThan(factsAt.get('full-report-shared')!);
    expect(factsAt.get('full-report-shared')!).toBeLessThan(factsAt.get('zhou-asks-relief')!);
    expect(s.mission.facts).toEqual(expect.arrayContaining(['flank-team-back', 'meng-route-adopted', 'meng-route-proven',
      'patients-used-cargo-route', 'walkers-used-side-route', 'zhou-apology-without-excuse', 'full-report-shared',
      'lu-has-full-report', 'departure-unconfirmed-shared', 'escort-staffing-shared', 'uncertainty-explicit',
      'zhou-asks-rest', 'zhou-asks-relief', 'zhou-on-withdrawal-list', 'backup-radio-handed-to-zheng', 'family-medicine-reported']));
    expect(s.has('zhou-growth-complete')).toBe(false);
    expect((reportEnd - reportStart) * FIXED_DT).toBeGreaterThanOrEqual(D.reportEnd);
    if (!skip) expect((admissionEnd - admissionStart) * FIXED_DT).toBeGreaterThanOrEqual(D.admissionEnd - FIXED_DT);
    expect(fireInputs).toBeGreaterThan(0); expect(s.hits).toBeGreaterThan(0);
    expect(s.player.health).toBe(100); expect(s.mission.control).toBe('work');
    if (restore) expect([...restores]).toEqual([2, 4, 6]);
    const result = { facts: [...s.mission.facts].sort(), player: { position: [...s.player.position] as Vec3, health: s.player.health,
      ammo: s.player.ammo, reserve: s.player.reserve }, actors: s.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id,
      position: [...a.position] as Vec3, safe: a.safe, health: a.health, down: a.down, goals: a.goals, path: a.path })) };
    console.info(`FLANK_REPLAY skip=${skip} restore=${restore}`, JSON.stringify({ seconds: s.mission.elapsed,
      spawned: s.mission.spawned, kills: s.kills, maxActive, maxAimers, phases, restores: [...restores] }));
    return result;
  } finally { s.dispose(); env.dispose(); }
}

describe('S07 flank: public-input stairs, combat and split routes', () => {
  it('spaces the report and handover against the approved full voice durations', () => {
    const duration = (prefix: string) => DIALOGUE_CATALOG.find(line => line.scenario === 'flank' && line.text.startsWith(prefix))!.duration;
    const admission = ['这批过了', '刚才的预告', '我知道你怎么想', '包括。我答应'];
    const report = ['已核实：', '尚未确认：', '北闸仍有压力', '升降机试完', '第二段的接手'];
    for (const [offsets, end, prefixes] of [[D.admission, D.admissionEnd, admission], [D.report, D.reportEnd, report]] as const) {
      prefixes.forEach((prefix, i) => expect((offsets[i + 1] ?? end) - offsets[i]).toBeGreaterThan(duration(prefix) + 0.12));
    }
    expect(D.reportReady).toBeGreaterThan(duration('把原文、核实情况') + 0.12);
    expect(D.reliefReady).toBeGreaterThan(duration('你先换一下位置') + 0.12);
    expect(D.medicineReport).toBeGreaterThan(duration('缩回去我得缓') + 0.12);
    expect(D.exitReady - D.medicineReport).toBeGreaterThan(duration('罗敬妻子缺的药') + 0.12);
  });
  it('physically uses both platform stairs and the split routes before full disclosure and natural/skip endings converge', () => {
    const actual = playFlank(true, false), expected = playFlank(false, false);
    expect(actual.facts).toEqual(expected.facts);
    const { position: playerA, ...playerStateA } = actual.player;
    const { position: playerB, ...playerStateB } = expected.player;
    expect(playerStateA).toEqual(playerStateB);
    // Match the 1.5cm controller contact offset, while keeping story, resources,
    // participants and route state exact. No stage or arrival assertion is relaxed.
    expect(d3(playerA, playerB)).toBeLessThan(0.02);
    actual.actors.forEach((a, i) => {
      const { position: positionA, ...stateA } = a;
      const { position: positionB, ...stateB } = expected.actors[i];
      expect(stateA).toEqual(stateB); expect(d3(positionA, positionB), a.id).toBeLessThan(0.02);
    });
  }, 120_000);
  it('restores actual withdrawal, split-route and report checkpoints without erasing participants or prior facts', () => {
    playFlank(false, true);
  }, 120_000);
});
