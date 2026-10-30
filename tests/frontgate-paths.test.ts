import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/contracts';
import { FRONTGATE as F } from '../src/content/frontgate-layout';
import { carryFacts, nextStage } from '../src/content/chapter-flow';
import { Simulation, emptyIntent, distance } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, FIXED_DT } from '../src/runtime/Physics';

beforeAll(initializePhysics);
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

// Headless public-input route proof. This observes positions to choose movement
// and aim; it never teleports, edits actors, sets facts or skips unfinished combat.
function run(skip: boolean, restore: boolean) {
  const env = buildEnvironment('frontgate');
  let s = new Simulation('frontgate', env.solids, undefined, carryFacts('S05', ['sharing-promised', 'technicians-received', 'family-escort-promised']));
  const ids = s.workers.map(a => a.id), arrival = new Map<string, Vec3>(), walked = new Map<string, number>();
  const factAt = new Map<string, number>(), phases = [0], restored = new Set<number>();
  let path: Vec3[] = [], goalKey = '', steps = 0, maxActive = 0, maxAimers = 0, fireInputs = 0, reloadInputs = 0;
  const summary = () => JSON.stringify({ t: s.mission.elapsed, phase: s.mission.phase, pos: s.player.position,
    hp: s.player.health, ammo: [s.player.ammo, s.player.reserve], objective: s.objective, facts: s.mission.facts,
    spawned: s.mission.spawned, enemies: s.aliveEnemies.map(a => ({ id: a.id, pos: a.position })),
    allies: s.actors.filter(a => a.role === 'ally').map(a => ({ id: a.id, pos: a.position, goals: a.goals, next: a.path[0] })),
    workers: s.workers.map(a => ({ id: a.id, pos: a.position, safe: a.safe, next: a.path[0] })), next: path[0] });
  try {
    while (!s.mission.complete && !s.mission.failed && steps < 600 / FIXED_DT) {
      let goal = s.objective.point;
      // When a threat pins a required position, approach its flank using the same
      // player route planner instead of firing endlessly through a solid cover.
      const phasePoint = s.mission.phase === 1 ? s.has('front-first-released') ? F.weighB : F.weighA
        : s.mission.phase === 2 ? F.eastPost : F.rearPost;
      const localThreat = s.aliveEnemies.find(a => distance(a.position, phasePoint) < (s.mission.phase >= 2 ? 52 : 24)
        && !s.physics.trace([phasePoint[0], 1.66, phasePoint[2]], [a.position[0], a.position[1] + 1.66, a.position[2]], undefined, true));
      if (s.mission.phase >= 1 && s.mission.phase <= 3 && localThreat && distance(s.player.position, goal) < 2.6) goal = [localThreat.position[0] - 2, 0, localThreat.position[2] + 3];
      const key = goal.map(n => Math.round(n)).join(',');
      if (key !== goalKey) { path = []; goalKey = key; }
      if (!path.length && distance(s.player.position, goal) > 1.6) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < 0.3) path.shift();
      let mx = 0, mz = 0;
      if (distance(s.player.position, goal) > 1.6 && s.mission.control !== 'staged') {
        const point = path[0] ?? goal, dx = point[0] - s.player.position[0], dz = point[2] - s.player.position[2], d = Math.max(0.01, Math.hypot(dx, dz)); mx = dx / d; mz = dz / d;
      }
      const candidate = s.mission.control === 'combat' ? s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
        .find(a => distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (candidate) { const dx = candidate.position[0] - s.player.position[0], dz = candidate.position[2] - s.player.position[2]; yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(candidate.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz)); }
      const reload = s.mission.control === 'combat' && !s.player.ammo && !s.player.reload;
      const before = new Map(s.workers.map(a => [a.id, [...a.position] as Vec3]));
      s.step({ ...emptyIntent, yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
        right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !candidate, ads: !!candidate, fire: !!candidate, reload,
        interact: steps % 12 === 0, skip: skip && steps % 12 === 0 });
      steps++; if (candidate) fireInputs++; if (reload) reloadInputs++;
      env.setFacts?.(s.mission.facts);
      if (phases.at(-1) !== s.mission.phase) { phases.push(s.mission.phase); path = []; }
      for (const f of s.mission.facts) if (!factAt.has(f)) factAt.set(f, steps);
      for (const a of s.workers) {
        const d = distance(a.position, before.get(a.id)!); if (d >= 0.1) throw new Error(`Worker teleported: ${summary()}`);
        walked.set(a.id, (walked.get(a.id) ?? 0) + d);
        if (a.safe && !arrival.has(a.id)) arrival.set(a.id, [...a.position]);
      }
      maxActive = Math.max(maxActive, s.aliveEnemies.length); maxAimers = Math.max(maxAimers, s.aliveEnemies.filter(a => a.aiming).length);
      if (maxActive > 8 || maxAimers > 2 || s.mission.spawned > 44) throw new Error(`Pressure cap: ${summary()}`);
      if (restore && [2, 3].includes(s.mission.phase) && !restored.has(s.mission.phase)) {
        const save = new SaveStore(new Memory()); expect(save.save('campaign', s.checkpoint, { chapter: 'campaign', stage: 'S05', elapsedBefore: 480 })).toEqual({ ok: true });
        const loaded = save.load('campaign'); expect(loaded.warning).toBeUndefined();
        const replacement = new Simulation('frontgate', env.solids, loaded.save!.snapshot);
        expect(replacement.snapshot()).toEqual(s.checkpoint); s.dispose(); s = replacement; restored.add(s.mission.phase); path = [];
      }
    }
    expect(s.mission.failed, summary()).toBe(false); expect(s.mission.complete, summary()).toBe(true);
    expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.workers.map(a => a.id)).toEqual(ids); expect(arrival.size).toBe(7);
    for (const [id, pos] of arrival) { expect(distance(pos, F.safe)).toBeLessThan(5); expect(walked.get(id)).toBeGreaterThan(55); }
    expect(distance(s.actors.find(a => a.id === 'relief')!.position, F.weighA)).toBeLessThan(1);
    expect(distance(s.actors.find(a => a.id === 'zheng')!.position, F.rearPost)).toBeLessThan(1);
    expect(factAt.get('east-road-warned')!).toBeLessThan(factAt.get('east-entry-0')!);
    expect(factAt.get('front-relieved')!).toBeLessThanOrEqual(factAt.get('front-team-returned')!);
    for (const f of ['zhou-knows-shaoyuan-time', 'zhou-withheld-time', 'mobile-force-warning-shared']) expect(s.has(f)).toBe(true);
    expect(s.has('lu-knows-shaoyuan-time')).toBe(false);
    expect(fireInputs).toBeGreaterThan(0);
    if (restore) expect([...restored]).toEqual([2, 3]);
    return { facts: [...s.mission.facts].sort(), safe: s.safeCount, time: s.mission.elapsed, spawned: s.mission.spawned, kills: s.kills, reloads: reloadInputs };
  } finally { s.dispose(); env.dispose(); }
}

describe('S05 continuous northgate encounter', () => {
  it('ends a safe radio scene with the same combat health after natural playback or skip', () => {
    const env = buildEnvironment('frontgate'), seed = new Simulation('frontgate', env.solids), snapshot = seed.snapshot(); seed.dispose();
    Object.assign(snapshot.mission, { phase: 4, elapsed: 20, phaseTime: 0, control: 'staged' });
    snapshot.player.health = 42; snapshot.player.hurtAt = 20; snapshot.player.position = [...F.rearPost];
    const endings = [];
    try {
      for (const skip of [false, true]) {
        const s = new Simulation('frontgate', env.solids, snapshot);
        try {
          for (let i = 0; i < 1000 && s.mission.phase === 4; i++) s.step({ ...emptyIntent, skip });
          expect(s.mission.phase).toBe(5); endings.push({ health: s.player.health, facts: [...s.mission.facts].sort() });
        } finally { s.dispose(); }
      }
      expect(endings[0]).toEqual(endings[1]); expect(endings[0].health).toBe(100);
    } finally { env.dispose(); }
  });
  it('does not convert a still-exposed east or rear position into a safe scripted scene', () => {
    const env = buildEnvironment('frontgate');
    try {
      // Constructed boundary snapshots reproduce the two transition races; these
      // cases are not presented as player completion evidence.
      for (const phase of [2, 3]) {
        const seed = new Simulation('frontgate', env.solids), snapshot = seed.snapshot(); seed.dispose();
        Object.assign(snapshot.mission, { phase, phaseTime: 5, elapsed: 20, nextSpawn: 1000, control: 'combat',
          facts: ['east-deployed', 'east-entry-0', 'east-entry-1', 'east-entry-2', 'front-east-enemy-E04-0', 'front-east-enemy-E04-1', 'front-east-enemy-E04-2', 'front-relieved'] });
        snapshot.player.position = [...(phase === 2 ? F.eastPost : F.rearPost)];
        snapshot.actors.forEach(a => {
          a.goals = []; a.path = [];
          if (a.role === 'worker') { a.position = [...F.safe]; a.released = true; a.safe = true; }
          if (a.id === 'zheng') a.position = [...F.rearPost];
          if (a.id === 'relief') a.position = [...F.weighA];
          if (a.role === 'enemy') {
            const index = Number(a.id.split('-').at(-1));
            a.position = [...(phase === 2 ? F.eastEntries[index] : F.eastPosts[2])];
            if (phase === 3 && index > 0) { a.down = true; a.health = 0; }
          }
        });
        const s = new Simulation('frontgate', env.solids, snapshot);
        try {
          if (phase === 3) expect(s.exposedThreat(s.player.position, 52)).toBe(true);
          else expect(s.aliveEnemies.every(a => distance(a.position, F.eastPost) > 38)).toBe(true);
          s.step({ ...emptyIntent, interact: true });
          expect(s.mission.phase).toBe(phase); expect(s.mission.control).toBe('combat');
          expect(s.objective.interaction).toBe('');
        } finally { s.dispose(); }
      }
    } finally { env.dispose(); }
  });
  it('moves both groups behind cover, receives a real relief and preserves withheld knowledge on natural/skip playback', () => {
    const natural = run(false, false), skipped = run(true, true);
    expect(skipped.facts).toEqual(natural.facts); expect(skipped.safe).toBe(natural.safe);
  }, 40_000);
  it('keeps isolated validation arenas outside the campaign and carries only known first-chapter commitments', () => {
    expect(nextStage('childhood')?.scenario).toBe('mainhall'); expect(nextStage('mainhall')?.scenario).toBe('nightshift');
    expect(nextStage('workers')?.scenario).toBe('frontgate'); expect(nextStage('prologue')).toBeUndefined();
    expect(carryFacts('S05', ['family-escort-promised', 'reception-damage-known', 'workers-released', 'fan-cleared'])).toEqual(['family-escort-promised', 'reception-damage-known']);
  });
});
