import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { EnvironmentModel, Vec3 } from '../src/contracts';
import { HISTORY as H } from '../src/content/history-layout';
import { OPENING_TIMELINE } from '../src/content/opening-timeline';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX, type StorageLike } from '../src/persistence/SaveStore';
import type { Intent } from '../src/player/Input';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

// Deterministic scene/physics replays, not a browser-input or human-experience
// verdict. These drivers only observe state and send public Intent values.
// Authored staged motion belongs to Simulation; the driver never teleports or
// writes a player, actor, mission phase/fact, health, or ammunition value.
beforeAll(() => initializePhysics());
const round = (point: Vec3) => point.map(n => +n.toFixed(3));
const distance3 = (a: Vec3, b: Vec3) => Math.hypot(...a.map((n, i) => n - b[i]));
const storyFacts = (s: Simulation) => [...s.mission.facts].sort();
const CHILD_CASE = 'keeps a late child safe and 1.1m tall, then gives natural/skip the same evacuation ending';
const HALL_CASE = 'physically evacuates six residents before fixed hall loss, preserving natural/skip terminal facts and positions';
const CHILD_UNSEEN_FACTS = ['father-died', 'history-bombardment', 'history-collapse', 'zhou-pinned',
  'history-enemy-breach', 'history-crowd-attacked', 'history-crowd-massacred', 'zhao-captured',
  'shao-identified-by-zhou', 'zhao-executed', 'zhou-unconscious'];
const HALL_RESIDENT_IDS = Array.from({ length: 32 }, (_, i) => `late-civilian-${i}`);
const EVACUATION_RESIDENT_IDS = Array.from({ length: 12 }, (_, i) => `evac-crowd-${i}`);
const CROWD_IDS = [...HALL_RESIDENT_IDS, ...EVACUATION_RESIDENT_IDS];

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

const VISUAL_FIXTURES = {
  'hall-autonomy-1': { scenario: 'mainhall', phase: 1, sourceCase: HALL_CASE,
    note: '正常公开输入回放的开门后检查点；六名居民尚未放行。供恢复后的局部操作验证，不代表人工通关。' },
  'child-timeline-3': { scenario: 'childhood', phase: 3, sourceCase: CHILD_CASE,
    note: '真实公开输入回放到达 S01 phase 3 首帧；尚未交出孩子，供正常速度的局部时间线观察，不代表人工首通。此前包含一分钟停留与无效输入检查。' },
  'hall-timeline-4': { scenario: 'mainhall', phase: 4, sourceCase: HALL_CASE,
    note: '真实公开输入回放到达 S02 phase 4 首帧；六名居民与孩子已撤出，周延仍站立且尚未轰炸坍塌。供正常速度的局部时间线观察，不代表人工首通。' },
} as const;
const recordedVisualFixtures = new Set<keyof typeof VISUAL_FIXTURES>();
function recordVisualFixture(s: Simulation, name: keyof typeof VISUAL_FIXTURES): void {
  const enabled = process.env.RECORD_OPENING_VISUAL_FIXTURES === '1' || process.env.RECORD_VISUAL_FIXTURES === '1';
  if (!enabled || recordedVisualFixtures.has(name)) return;
  const selected = process.env.RECORD_VISUAL_FIXTURE_NAMES?.split(',');
  if (selected && !selected.includes(name)) return;
  const fixture = VISUAL_FIXTURES[name];
  const snapshot = s.checkpoint, storage = new MemoryStorage(), store = new SaveStore(storage);
  expect(snapshot.mission.scenario).toBe(fixture.scenario);
  expect(snapshot.mission.phase).toBe(fixture.phase);
  expect(snapshot.mission.phaseTime).toBe(0);
  if (name === 'hall-autonomy-1') expect(snapshot.actors.filter(a => a.role === 'worker').every(a => !a.released)).toBe(true);
  expect(store.save(fixture.scenario, snapshot)).toEqual({ ok: true });
  expect(store.load(fixture.scenario).save!.snapshot).toEqual(snapshot);
  const raw = storage.getItem(`${SAVE_KEY_PREFIX}${fixture.scenario}`)!;
  const directory = new URL('../artifacts/runs/visual-fixtures/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  // Save the exact validated envelope, never a handcrafted or edited snapshot.
  writeFileSync(new URL(`${name}.json`, directory), raw, 'utf8');
  writeFileSync(new URL(`${name}.source.json`, directory), JSON.stringify({
    kind: 'public-intent-replay-checkpoint', sourceTest: 'tests/opening-paths.test.ts',
    sourceCase: fixture.sourceCase,
    replay: { skip: false, skipScope: 'staged-playback', restore: false, firstPhaseEntry: true },
    artifact: `${name}.json`, slot: fixture.scenario, scenario: snapshot.mission.scenario,
    phase: snapshot.mission.phase, elapsed: snapshot.mission.elapsed, phaseTime: snapshot.mission.phaseTime,
    crowds: { hallResidents: snapshot.actors.filter(a => a.id.startsWith('late-civilian-')).length,
      evacuationResidents: snapshot.actors.filter(a => a.id.startsWith('evac-crowd-')).length },
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    note: fixture.note,
  }, null, 2) + '\n', 'utf8');
  recordedVisualFixtures.add(name);
}

class OpeningReplay {
  readonly environment: EnvironmentModel;
  simulation: Simulation;
  readonly phases = [0];
  readonly factsAt = new Map<string, number>();
  readonly traveled = new Map<string, number>();
  readonly descended = new Set<string>();
  readonly safeArrival = new Map<string, { step: number; position: Vec3 }>();
  readonly trace: Array<{ time: number; phase: number; player: number[]; goal: number[]; safe: number }> = [];
  readonly inputs = { move: 0, fire: 0, interact: 0, skip: 0 };
  readonly interactionPhases = new Set<number>();
  steps = 0;
  restored = false;
  private path: Vec3[] = [];
  private destination = '';
  private navigation: Simulation['navigation'];
  private goal: Vec3;

  constructor(readonly scenario: 'childhood' | 'mainhall') {
    this.environment = buildEnvironment(scenario);
    if (!this.environment.solids.some(s => s.id === 'history-maintenance-door')
      || !this.environment.solids.some(s => s.id === 'history-stair-0')
      || !this.environment.solids.some(s => s.id === 'history-lower-floor')) {
      this.environment.dispose();
      throw new Error(`${scenario} is not connected to its authored historical hall geometry`);
    }
    this.simulation = new Simulation(scenario, this.environment.solids);
    expect(this.simulation.actors.filter(a => a.id.startsWith('late-civilian-')).map(a => a.id).sort())
      .toEqual([...HALL_RESIDENT_IDS].sort());
    expect(this.simulation.actors.filter(a => a.id.startsWith('evac-crowd-')).map(a => a.id).sort())
      .toEqual([...EVACUATION_RESIDENT_IDS].sort());
    this.navigation = this.simulation.navigation;
    this.goal = [...this.simulation.player.position];
  }

  summary(): string {
    const s = this.simulation;
    return JSON.stringify({ scenario: this.scenario, elapsed: +s.mission.elapsed.toFixed(2), phase: s.mission.phase,
      phases: this.phases, player: round(s.player.position), height: s.player.height, hp: s.player.health,
      failed: s.mission.failed, complete: s.mission.complete, goal: this.goal, next: this.path[0],
      obstruction: s.physics.trace(s.playerEye, [this.goal[0], this.goal[1] + 1.62, this.goal[2]], 'player', true),
      facts: s.mission.facts, safe: s.safeCount, fireInputs: this.inputs.fire, ammo: [s.player.ammo, s.player.reserve],
      trace: this.trace.slice(-6), actors: s.actors.filter(a => !a.down || a.role !== 'enemy').map(a => ({
        id: a.id, position: round(a.position), next: a.path[0], goals: a.goals, safe: a.safe,
        traveled: +(this.traveled.get(a.id) ?? 0).toFixed(2), descended: this.descended.has(a.id),
      })) });
  }

  step(partial: Partial<Intent> = {}): void {
    const s = this.simulation;
    if (s.mission.failed || this.steps >= 600 / FIXED_DT) throw new Error(`Opening replay stopped: ${this.summary()}`);
    const before = new Map(s.actors.map(a => [a.id, [...a.position] as Vec3]));
    const input = { ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...partial };
    if (input.forward || input.right) this.inputs.move++;
    for (const name of ['fire', 'interact', 'skip'] as const) if (input[name]) this.inputs[name]++;
    if (input.interact) this.interactionPhases.add(s.mission.phase);
    s.step(input); this.steps++;
    this.environment.setFacts?.(s.mission.facts);
    if (s.mission.failed) throw new Error(`Opening player failed: ${this.summary()}`);
    if (this.scenario === 'childhood' && (s.player.height !== 1.1 || s.player.health !== 100)) {
      throw new Error(`Child viewpoint/health changed: ${this.summary()}`);
    }
    if (this.scenario === 'childhood' && (s.actors.find(a => a.id === 'father')!.down
      || CHILD_UNSEEN_FACTS.some(fact => s.has(fact)))) {
      throw new Error(`Child viewpoint leaked events after departure: ${this.summary()}`);
    }
    if (this.scenario === 'mainhall' && s.mission.phase === 4) {
      const collapsed = s.has('history-collapse');
      if (collapsed !== s.has('zhou-pinned') || s.player.height !== (collapsed ? 0.65 : 1.8)
        || collapsed !== (s.mission.phaseTime >= OPENING_TIMELINE.mainhall.collapse)) {
        throw new Error(`Hall collapse/height changed outside its timeline: ${this.summary()}`);
      }
    }
    if (this.phases.at(-1) !== s.mission.phase) this.phases.push(s.mission.phase);
    for (const fact of s.mission.facts) if (!this.factsAt.has(fact)) this.factsAt.set(fact, this.steps);
    for (const actor of s.actors) {
      const last = before.get(actor.id);
      if (last) {
        this.traveled.set(actor.id, (this.traveled.get(actor.id) ?? 0) + distance(last, actor.position));
        if (actor.role === 'worker' && distance3(last, actor.position) > 0.36) {
          throw new Error(`Objective resident ${actor.id} moved discontinuously: ${this.summary()}`);
        }
      }
      if (actor.role === 'worker' && actor.position[0] < H.stairsStart[0] - 1 && actor.position[0] > H.stairsEnd[0] + 0.5
        && actor.position[1] < -0.2 && actor.position[1] > -2.3) this.descended.add(actor.id);
      if (actor.role === 'worker' && actor.safe && !this.safeArrival.has(actor.id)) {
        this.safeArrival.set(actor.id, { step: this.steps, position: [...actor.position] });
      }
    }
    if (this.scenario === 'mainhall' && (s.aliveEnemies.length > 8 || s.mission.spawned > 18
      || s.aliveEnemies.filter(a => a.aiming).length > 2)) throw new Error(`S02 pressure bound exceeded: ${this.summary()}`);
    if (this.steps % 120 === 0) this.trace.push({ time: +s.mission.elapsed.toFixed(2), phase: s.mission.phase,
      player: round(s.player.position), goal: round(this.goal), safe: s.safeCount });
  }

  drive(goal: Vec3, options: { interact?: boolean; combat?: boolean; range?: number } = {}): void {
    const s = this.simulation;
    this.goal = goal;
    if (this.destination !== goal.join(',') || this.navigation !== s.navigation) {
      this.path = []; this.destination = goal.join(','); this.navigation = s.navigation;
    }
    let mx = 0, mz = 0;
    if (s.mission.control !== 'staged' && distance(s.player.position, goal) > (options.range ?? 1.6)) {
      if (!this.path.length) this.path = s.navigation.path(s.player.position, goal);
      while (this.path.length && distance(s.player.position, this.path[0]) < 0.3) this.path.shift();
      const next = this.path[0] ?? goal;
      const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2], length = Math.max(0.001, Math.hypot(dx, dz));
      mx = dx / length; mz = dz / length;
    }
    const target = options.combat !== false && s.mission.control === 'combat' ? s.aliveEnemies.slice()
      .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
      .find(a => s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
    let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
    if (target) {
      const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2];
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz));
    }
    this.step({ yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
      right: Math.cos(yaw) * mx - Math.sin(yaw) * mz, sprint: !target, ads: !!target, fire: !!target,
      reload: s.mission.control === 'combat' && s.player.ammo === 0 && s.player.reload === 0,
      interact: !!options.interact && this.steps % 12 === 0 });
  }

  until(label: string, condition: () => boolean, action: () => void, seconds = 120): void {
    const deadline = this.steps + seconds / FIXED_DT;
    while (!condition()) {
      if (this.steps >= deadline) throw new Error(`${label} timed out after ${seconds}s: ${this.summary()}`);
      action();
    }
  }

  restoreStagedHall(): void {
    const snapshot = this.simulation.checkpoint, storage = new MemoryStorage();
    expect(snapshot.mission.phase).toBe(4);
    expect(snapshot.mission.phaseTime).toBe(0);
    expect(snapshot.player.height).toBe(1.8);
    expect(snapshot.mission.facts).toContain('history-timeline-v2');
    expect(snapshot.mission.facts).not.toContain('history-collapse');
    expect(snapshot.mission.facts).not.toContain('zhou-pinned');
    expect(new SaveStore(storage).save('campaign', snapshot, { chapter: 'campaign', stage: 'S02', elapsedBefore: 80 })).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('campaign');
    expect(loaded.warning).toBeUndefined();
    expect(loaded.save!.snapshot).toEqual(snapshot);
    const resumed = new Simulation('mainhall', this.environment.solids, loaded.save!.snapshot);
    expect(resumed.snapshot()).toEqual(snapshot);
    expect(resumed.ballistics.projectiles).toHaveLength(0);
    this.simulation.dispose(); this.simulation = resumed;
    this.navigation = resumed.navigation; this.path = []; this.restored = true;
  }
  dispose(): void { this.simulation.dispose(); this.environment.dispose(); }
}

function terminalActors(s: Simulation, ids: string[]) {
  return ids.map(id => {
    const a = s.actors.find(a => a.id === id)!;
    return { id, position: a.position, yaw: a.yaw, health: a.health, down: a.down, safe: a.safe, goals: a.goals, path: a.path };
  });
}

function expectEvacuationCrowdSafe(s: Simulation): void {
  EVACUATION_RESIDENT_IDS.forEach((id, i) => {
    const actor = s.actors.find(a => a.id === id)!;
    expect(actor.safe, id).toBe(true);
    expect(actor.down, id).toBe(false);
    expect(distance3(actor.position, H.evacCrowdSafe[i]), id).toBeLessThan(0.001);
  });
}

function playChild(replay: OpeningReplay, skip: boolean): void {
  replay.until('S01 work and handover', () => replay.simulation.mission.phase === 3, () => {
    const point = [H.lunch, H.mattress, H.gateOutside][replay.simulation.mission.phase];
    replay.drive(point, { interact: replay.simulation.mission.phase < 2, combat: false });
  });
  expect(replay.simulation.mission.facts).toEqual(expect.arrayContaining(['lunch-packed', 'mattress-cleared', 'history-gate-open']));
  expect(replay.simulation.mission.facts).not.toContain('child-handed-over');
  if (!skip) recordVisualFixture(replay.simulation, 'child-timeline-3');
  replay.until('S01 fixed evacuation', () => replay.simulation.mission.complete, () => replay.step({ skip }), 30);
  const s = replay.simulation;
  expect(replay.phases).toEqual([0, 1, 2, 3, 4]);
  expect([...replay.interactionPhases]).toEqual([0, 1]);
  expect(s.player.height).toBe(1.1); expect(s.player.ammo).toBe(0); expect(s.mission.failed).toBe(false);
  expect(distance3(s.player.position, [H.womanEnd[0] + 0.9, H.womanEnd[1], H.womanEnd[2] + 1])).toBeLessThan(0.001);
  expect(distance3(s.actors.find(a => a.id === 'evacuator')!.position, H.womanEnd)).toBeLessThan(0.001);
  expect(distance3(s.actors.find(a => a.id === 'daughter')!.position, H.childSafe)).toBeLessThan(0.001);
  expect(s.actors.find(a => a.id === 'father')!.down).toBe(false);
  expect(s.actors.find(a => a.id === 'father')!.health).toBeGreaterThan(0);
  expect(s.mission.facts).toEqual(expect.arrayContaining(['history-heavy-losses', 'child-handed-over',
    'father-rifle-collected', 'father-charged-defense', 'child-evacuated', 'child-out-of-sight', 'history-partition-closed',
    'history-dense-crowd-v1']));
  expectEvacuationCrowdSafe(s);
  for (const id of HALL_RESIDENT_IDS) expect(s.actors.find(a => a.id === id)!.down, id).toBe(false);
  for (const fact of CHILD_UNSEEN_FACTS) expect(s.mission.facts).not.toContain(fact);
  if (!skip) {
    expect(replay.factsAt.get('history-heavy-losses')!).toBeLessThan(replay.factsAt.get('child-handed-over')!);
    expect(replay.factsAt.get('child-handed-over')!).toBeLessThan(replay.factsAt.get('father-charged-defense')!);
    expect(replay.factsAt.get('father-charged-defense')!).toBeLessThan(replay.factsAt.get('child-out-of-sight')!);
  }
}

function reachHallStaging(replay: OpeningReplay, recordTimelineFixture = false): void {
  const s = replay.simulation;
  expect(s.workers.map(a => a.id)).toEqual(Array.from({ length: 6 }, (_, i) => `worker-${i}`));
  expect(s.mission.facts).not.toContain('shao-identified-by-zhou');
  replay.until('S02 gate and connected defense positions', () => s.mission.phase === 3, () => {
    const previous = s.mission.phase;
    replay.drive([H.gatePanel, H.defenseA, H.defenseB][s.mission.phase], { interact: s.mission.phase === 0 });
    if (previous === 0 && s.mission.phase === 1 && recordTimelineFixture) recordVisualFixture(s, 'hall-autonomy-1');
  });
  expect(s.safeCount).toBeLessThan(6);
  replay.step({ skip: true });
  expect(s.mission.phase).toBe(3); expect(s.mission.complete).toBe(false);
  replay.until('S02 six residents physically descend west', () => s.mission.phase === 4, () => {
    const threat = s.aliveEnemies.filter(enemy => s.workers.some(worker => !worker.safe && distance(enemy.position, worker.position) < 10))
      .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))[0];
    replay.drive(threat ? [Math.round(threat.position[0]), 0, Math.round(threat.position[2])] : H.defenseB, { range: threat ? 2.5 : 1.6 });
  });
  expect(s.player.height).toBe(1.8); expect(s.safeCount).toBe(6);
  expect(s.mission.phaseTime).toBe(0);
  expect([...replay.interactionPhases]).toEqual([0]);
  expect(s.mission.facts).toEqual(expect.arrayContaining(['zhou-trusts-zhao', 'hall-front-secured', 'hall-side-secured',
    'civilians-evacuated', 'child-evacuated', 'child-out-of-sight', 'history-partition-closed', 'history-timeline-v2']));
  expect(s.has('history-bombardment')).toBe(false);
  expect(s.has('history-collapse')).toBe(false);
  expect(s.has('zhou-pinned')).toBe(false);
  for (const id of ['evacuator', 'daughter', 'young-lu']) {
    const actor = s.actors.find(a => a.id === id)!;
    expect(actor.position[0], `${id} has not crossed the partition`).toBeLessThan(H.partitionX);
    expect(actor.down).toBe(false);
  }
  for (const worker of s.workers) {
    expect(replay.traveled.get(worker.id), replay.summary()).toBeGreaterThan(20);
    expect(replay.descended.has(worker.id), replay.summary()).toBe(true);
    const arrival = replay.safeArrival.get(worker.id)!;
    expect(arrival.position[0]).toBeLessThan(H.partitionX);
    expect(arrival.position[1]).toBeLessThan(-2.1);
    expect(distance(arrival.position, H.childSafe)).toBeLessThan(5);
    expect(replay.factsAt.get('civilians-evacuated')!).toBeGreaterThanOrEqual(arrival.step);
  }
  if (recordTimelineFixture) recordVisualFixture(s, 'hall-timeline-4');
}

function finishHall(replay: OpeningReplay, skip: boolean): void {
  const before = replay.simulation.workers.map(a => ({ id: a.id, position: [...a.position] as Vec3 }));
  replay.until('S02 fixed loss after evacuation', () => replay.simulation.mission.complete, () => replay.step({ skip }), 30);
  const s = replay.simulation;
  expect(replay.phases).toEqual([0, 1, 2, 3, 4, 5]);
  expect(s.mission.failed).toBe(false); expect(s.player.height).toBe(0.65); expect(s.player.health).toBe(42);
  expect(s.safeCount).toBe(6); expect(s.player.name).toBe('周延 · 二十三岁');
  expect(s.mission.facts).toEqual(expect.arrayContaining(['civilians-evacuated', 'history-bombardment', 'history-collapse',
    'zhou-pinned', 'history-enemy-breach', 'history-crowd-attacked', 'history-crowd-massacred', 'zhao-reaches-rifle',
    'zhao-captured', 'shao-identified-by-zhou', 'zhao-defiant-shout', 'zhao-executed', 'zhou-unconscious', 'zhou-survived-hall',
    'history-dense-crowd-v1']));
  expectEvacuationCrowdSafe(s);
  HALL_RESIDENT_IDS.forEach((id, i) => {
    const actor = s.actors.find(a => a.id === id)!;
    expect(actor.down, id).toBe(true);
    expect(actor.health, id).toBe(0);
    expect(s.has(`history-crowd-victim-${i}`), id).toBe(true);
  });
  for (const saved of before) {
    const worker = s.workers.find(a => a.id === saved.id)!;
    expect(worker.safe).toBe(true); expect(worker.down).toBe(false);
    expect(distance3(worker.position, saved.position)).toBeLessThan(0.05);
    expect(replay.factsAt.get('history-collapse')!).toBeGreaterThanOrEqual(replay.safeArrival.get(worker.id)!.step);
  }
  expect(s.actors.find(a => a.id === 'zhao')!.down).toBe(true);
  expect(s.actors.find(a => a.id === 'shao')!.role).toBe('opponent');
  expect(distance3(s.player.position, H.rubblePlayer)).toBeLessThan(0.001);
}

describe('S01/S02 historical hall: public-input scene regressions', () => {
  it(CHILD_CASE, () => {
    const results: Array<{ facts: string[]; player: Vec3; actors: ReturnType<typeof terminalActors> }> = [];
    for (const skip of [false, true]) {
      const replay = new OpeningReplay('childhood');
      try {
        for (let i = 0; i < 60 / FIXED_DT; i++) replay.step({ crouch: i % 2 === 0, skip: i % 12 === 0, fire: i % 12 === 0 });
        expect(replay.simulation.mission.phase).toBe(0);
        expect(replay.simulation.mission.facts).toEqual([]);
        expect(replay.simulation.player.health).toBe(100);
        playChild(replay, skip);
        results.push({ facts: storyFacts(replay.simulation), player: replay.simulation.player.position,
          actors: terminalActors(replay.simulation, ['father', 'evacuator', 'daughter', ...CROWD_IDS]) });
        console.info(`OPENING_REPLAY S01 skip=${skip}`, replay.summary());
      } finally { replay.dispose(); }
    }
    const [natural, skipped] = results;
    expect(skipped.facts).toEqual(natural.facts);
    expect(skipped.player).toEqual(natural.player);
    expect(skipped.actors.map(({ position, ...state }) => state))
      .toEqual(natural.actors.map(({ position, ...state }) => state));
    skipped.actors.forEach((actor, i) => {
      if (actor.id.startsWith('late-civilian-')) {
        // These living background residents keep their Rapier grounding for
        // different durations; allow sub-millimetre settling, not a new pose.
        expect(distance3(actor.position, natural.actors[i].position), actor.id).toBeLessThan(0.001);
      } else expect(actor.position, actor.id).toEqual(natural.actors[i].position);
    });
  }, 60_000);

  it('uses the in-scene commander for S02 friendly-fire feedback without changing the father’s fate', () => {
    const replay = new OpeningReplay('mainhall');
    try {
      replay.step({ interact: true });
      const s = replay.simulation, father = s.actors.find(a => a.id === 'father')!;
      expect(s.mission.phase).toBe(1);
      expect(s.actors.some(a => a.id === 'zheng')).toBe(false);
      const health = father.health, ammo = s.player.ammo;
      const dx = father.position[0] - s.player.position[0], dz = father.position[2] - s.player.position[2];
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(father.position[1] + 1.5 - s.playerEye[1], Math.hypot(dx, dz));
      for (let i = 0; i < 10; i++) replay.step({ yaw, pitch, fire: i === 0 });
      expect(s.player.ammo).toBe(ammo - 1);
      expect(s.mission.subtitle).toBe('停火，自己人！');
      expect(s.mission.speaker).toBe('赵启明');
      expect(father.health).toBe(health); expect(father.down).toBe(false);
      expect(s.has('father-died')).toBe(false);
      expect(s.mission.failed).toBe(false);
    } finally { replay.dispose(); }
  });

  it(HALL_CASE, () => {
    const results: unknown[] = [];
    for (const skip of [false, true]) {
      const replay = new OpeningReplay('mainhall');
      try {
        reachHallStaging(replay, !skip); finishHall(replay, skip);
        results.push({ facts: storyFacts(replay.simulation), player: replay.simulation.player.position,
          actors: terminalActors(replay.simulation, ['father', 'evacuator', 'daughter', 'young-lu', 'zhao', 'shao', ...CROWD_IDS]) });
        expect(replay.inputs.fire).toBeGreaterThan(0);
        expect(replay.simulation.hits).toBeGreaterThan(0);
        console.info(`OPENING_REPLAY S02 skip=${skip}`, replay.summary());
      } finally { replay.dispose(); }
    }
    expect(results[1]).toEqual(results[0]);
  }, 90_000);

  it('restores the genuine standing hall-entry checkpoint, then collapses at the authored time with six residents safe', () => {
    const replay = new OpeningReplay('mainhall');
    try {
      reachHallStaging(replay); replay.restoreStagedHall();
      expect(replay.restored).toBe(true); expect(replay.simulation.safeCount).toBe(6);
      replay.until('S02 restored standing view before bombardment and collapse',
        () => replay.simulation.has('history-collapse'), () => replay.step(), 10);
      expect(replay.simulation.mission.phaseTime).toBeGreaterThanOrEqual(OPENING_TIMELINE.mainhall.collapse);
      expect(replay.simulation.mission.phaseTime).toBeLessThan(OPENING_TIMELINE.mainhall.collapse + FIXED_DT * 2);
      expect(replay.simulation.has('zhou-pinned')).toBe(true);
      expect(replay.simulation.player.height).toBe(0.65);
      finishHall(replay, false);
      console.info('OPENING_REPLAY S02 restored standing entry then collapse', replay.summary());
    } finally { replay.dispose(); }
  }, 60_000);

  it('restores residents already walking through the gate without releasing them again or requiring E', () => {
    const replay = new OpeningReplay('mainhall');
    try {
      replay.until('S02 first autonomous departure', () => replay.simulation.mission.phase === 2, () => {
        const s = replay.simulation;
        replay.drive(s.mission.phase === 0 ? H.gatePanel : H.defenseA, { interact: s.mission.phase === 0 });
      });
      replay.until('S02 first resident completes the first route leg', () => replay.simulation.workers.slice(0, 3)
        .some(a => a.goals.length && distance(a.goals[0], H.gateOutside) > 1), () => replay.drive(H.defenseB));
      expect(replay.simulation.mission.phase).toBe(2);
      const snapshot = replay.simulation.snapshot(), store = new SaveStore(new MemoryStorage());
      expect(store.save('campaign', snapshot, { chapter: 'campaign', stage: 'S02', elapsedBefore: 80 })).toEqual({ ok: true });
      const loaded = store.load('campaign');
      expect(loaded.warning).toBeUndefined();
      const resumed = new Simulation('mainhall', replay.environment.solids, loaded.save!.snapshot);
      expect(resumed.snapshot()).toEqual(snapshot);
      replay.simulation.dispose(); replay.simulation = resumed; replay.restored = true;
      const remaining = resumed.workers.slice(0, 3).map(a => ({ id: a.id, goals: structuredClone(a.goals) }));
      for (let i = 0; i < 60; i++) {
        replay.drive(H.defenseB);
        for (const before of remaining) {
          const a = resumed.workers.find(a => a.id === before.id)!;
          // Continued navigation may consume route legs; it may not reinsert a
          // completed doorway or reset the character to their old waiting spot.
          expect(a.goals).toEqual(before.goals.slice(before.goals.length - a.goals.length));
        }
      }
      reachHallStaging(replay); finishHall(replay, false);
      expect(resumed.safeCount).toBe(6);
      expect([...replay.interactionPhases]).toEqual([0]);
    } finally { replay.dispose(); }
  }, 60_000);
});
