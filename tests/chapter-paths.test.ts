import { beforeAll, describe, expect, it } from 'vitest';
import type { EnvironmentModel, Vec3 } from '../src/contracts';
import { NIGHT, WORKERS } from '../src/content/chapter-layout';
import { Simulation, distance, emptyIntent } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import type { Intent } from '../src/player/Input';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

// These deterministic headless drivers choose ordinary public Intent inputs from
// simulation observations. No player/NPC state, facts, physics body, or phase is
// edited. They prove simulation routes, not browser controls or human playability.
beforeAll(async () => { await initializePhysics(); });
const round = (p: Vec3) => p.map(n => +n.toFixed(3));

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

interface DriveOptions {
  direct?: boolean; combat?: boolean; interact?: boolean; skip?: boolean;
  range?: number; lookAt?: Vec3; sprint?: boolean;
}

class ChapterReplay {
  readonly environment: EnvironmentModel;
  simulation: Simulation;
  readonly phases: number[] = [0];
  readonly factsAt = new Map<string, number>();
  readonly traveled = new Map<string, number>();
  readonly safeArrival = new Map<string, { at: number; position: Vec3 }>();
  readonly originalWorkerIds: string[];
  readonly inputs = { move: 0, fire: 0, reload: 0, interact: 0, skip: 0, jump: 0 };
  readonly trace: Array<{ seconds: number; phase: number; position: number[]; goal: number[] }> = [];
  readonly checkpoints: Array<{ phase: number; facts: string[] }> = [];
  steps = 0;
  maxActive = 0;
  maxAimers = 0;
  carrySteps = 0;
  private destination = '';
  private path: Vec3[] = [];
  private lastNavigation: Simulation['navigation'];
  private goal: Vec3;

  constructor(readonly scenario: 'nightshift' | 'workers') {
    this.environment = buildEnvironment(scenario);
    this.simulation = new Simulation(scenario, this.environment.solids);
    this.lastNavigation = this.simulation.navigation;
    this.goal = [...this.simulation.player.position];
    this.originalWorkerIds = this.simulation.workers.map(a => a.id);
  }

  summary(): string {
    const s = this.simulation;
    return JSON.stringify({ scenario: this.scenario, seconds: +s.mission.elapsed.toFixed(2), phase: s.mission.phase,
      phases: this.phases, complete: s.mission.complete, failed: s.mission.failed, hp: s.player.health,
      player: round(s.player.position), goal: round(this.goal), next: this.path[0],
      directTrace: s.physics.trace(s.playerEye, [this.goal[0], this.goal[1] + 1.6, this.goal[2]], 'player', true),
      facts: s.mission.facts, ammo: [s.player.ammo, s.player.reserve], kills: s.kills, hits: s.hits,
      maxActive: this.maxActive, maxAimers: this.maxAimers, inputs: this.inputs, safe: s.safeCount,
      trace: this.trace.slice(-8), actors: s.actors.filter(a => !a.down).map(a => ({ id: a.id, at: round(a.position),
        goals: a.goals, next: a.path[0], safe: a.safe, traveled: +(this.traveled.get(a.id) ?? 0).toFixed(2) })) });
  }

  step(partial: Partial<Intent> = {}): void {
    const s = this.simulation;
    if (this.steps >= 600 / FIXED_DT) throw new Error(`600-second replay limit: ${this.summary()}`);
    if (s.mission.failed) throw new Error(`Player already failed: ${this.summary()}`);
    const previous = new Map(s.actors.map(a => [a.id, [...a.position] as Vec3]));
    const input: Intent = { ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...partial };
    if (input.forward || input.right) this.inputs.move++;
    for (const key of ['fire', 'reload', 'interact', 'skip', 'jump'] as const) if (input[key]) this.inputs[key]++;
    if (this.scenario === 'nightshift' && s.mission.control === 'cooperative') this.carrySteps++;
    s.step(input); this.steps++;
    this.environment.setFacts?.(s.mission.facts);
    if (this.phases.at(-1) !== s.mission.phase) this.phases.push(s.mission.phase);
    for (const fact of s.mission.facts) if (!this.factsAt.has(fact)) this.factsAt.set(fact, this.steps);
    for (const actor of s.actors) {
      const last = previous.get(actor.id);
      if (last) {
        const moved = distance(last, actor.position);
        this.traveled.set(actor.id, (this.traveled.get(actor.id) ?? 0) + moved);
        if (actor.role === 'worker' && moved > 0.1) throw new Error(`Worker moved discontinuously (${actor.id}, ${moved}m): ${this.summary()}`);
      }
      if (actor.safe && !this.safeArrival.has(actor.id)) this.safeArrival.set(actor.id, { at: this.steps, position: [...actor.position] });
    }
    const active = s.aliveEnemies.length, aimers = s.aliveEnemies.filter(a => a.aiming).length;
    this.maxActive = Math.max(this.maxActive, active); this.maxAimers = Math.max(this.maxAimers, aimers);
    if (this.scenario === 'workers') {
      if (active > 8 || aimers > 2) throw new Error(`Encounter pressure cap exceeded: ${this.summary()}`);
      for (const [group, budget] of [['E01', 18], ['E02', 20], ['E03', 18]] as const) {
        if (s.actors.filter(a => a.id.startsWith(`enemy-${group}-`)).length > budget) throw new Error(`Encounter ${group} budget exceeded: ${this.summary()}`);
      }
      if (JSON.stringify(s.workers.map(a => a.id)) !== JSON.stringify(this.originalWorkerIds)) throw new Error(`Technician identity changed: ${this.summary()}`);
    }
    if (this.steps % 120 === 0) this.trace.push({ seconds: +s.mission.elapsed.toFixed(2), phase: s.mission.phase, position: round(s.player.position), goal: round(this.goal) });
    if (s.mission.failed) throw new Error(`Player failed: ${this.summary()}`);
  }

  /** Ground A* selects walk inputs only; authored stair segments bypass ground A*. */
  drive(goal: Vec3, options: DriveOptions = {}): void {
    const s = this.simulation, range = options.range ?? 1.6;
    this.goal = goal;
    const destination = `${goal.join(',')}/${!!options.direct}`;
    if (destination !== this.destination || s.navigation !== this.lastNavigation) {
      this.path = []; this.destination = destination; this.lastNavigation = s.navigation;
    }
    let mx = 0, mz = 0;
    if (distance(s.player.position, goal) > range && s.mission.control !== 'staged') {
      if (!options.direct && !this.path.length) this.path = s.navigation.path(s.player.position, goal);
      while (this.path.length && distance(s.player.position, this.path[0]) < 0.3) this.path.shift();
      const next = options.direct ? goal : this.path[0] ?? goal;
      const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2];
      const length = Math.max(0.001, Math.hypot(dx, dz));
      mx = dx / length; mz = dz / length;
    }
    const candidate = options.combat !== false && s.mission.control === 'combat' ? s.aliveEnemies.slice()
      .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
      .find(a => s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
    let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
    const target = candidate ? [candidate.position[0], candidate.position[1] + 1.62, candidate.position[2]] as Vec3 : options.lookAt;
    if (target) {
      const dx = target[0] - s.player.position[0], dz = target[2] - s.player.position[2];
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target[1] - s.playerEye[1], Math.hypot(dx, dz));
    }
    this.step({ yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
      right: Math.cos(yaw) * mx - Math.sin(yaw) * mz,
      sprint: options.sprint !== false && !candidate && s.mission.control !== 'cooperative',
      ads: !!candidate, fire: !!candidate,
      reload: s.mission.control === 'combat' && s.player.ammo === 0 && s.player.reload === 0,
      interact: !!options.interact && this.steps % 12 === 0,
      skip: !!options.skip && this.steps % 12 === 0 });
  }

  until(label: string, condition: () => boolean, action: () => void, seconds = 90): void {
    const deadline = this.steps + seconds / FIXED_DT;
    while (!condition()) {
      if (this.steps >= deadline) throw new Error(`${label} exceeded ${seconds}s: ${this.summary()}`);
      action();
    }
  }
  walk(goal: Vec3, options: DriveOptions = {}): void {
    this.until(`Walking to ${goal}`, () => distance(this.simulation.player.position, goal) <= (options.range ?? 1.6), () => this.drive(goal, options));
  }

  /** A genuine checkpoint, serialized through the same production SaveStore API. */
  restoreCheckpoint(): void {
    const before = this.simulation.checkpoint;
    const storage = new MemoryStorage();
    const saved = new SaveStore(storage, () => 123456).save('campaign', before,
      { chapter: 'L1', stage: this.scenario === 'nightshift' ? 'S03' : 'S04', elapsedBefore: 0 });
    expect(saved, this.summary()).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('campaign');
    expect(loaded.warning).toBeUndefined();
    expect(loaded.save?.snapshot).toEqual(before);
    const rebuilt = new Simulation(this.scenario, this.environment.solids, loaded.save!.snapshot);
    expect(rebuilt.snapshot()).toEqual(before);
    expect(rebuilt.ballistics.projectiles).toHaveLength(0);
    this.simulation.dispose(); this.simulation = rebuilt;
    this.lastNavigation = rebuilt.navigation; this.path = [];
    this.environment.setFacts?.(rebuilt.mission.facts);
    this.checkpoints.push({ phase: rebuilt.mission.phase, facts: [...rebuilt.mission.facts] });
  }
  dispose(): void { this.simulation.dispose(); this.environment.dispose(); }
}

const NIGHT_FACTS = ['fan-cleared', 'fan-restarted', 'supplies-collected', 'supplies-delivered',
  'fleet-approaching', 'briefing-zhou-spoke', 'zhou-postponed-family-reply', 'sharing-promised', 'handoff-planned', 'weapon-collected', 'departed-for-port'];
function advanceNight(replay: ChapterReplay, skip: boolean): void {
  const points = [NIGHT.fan, NIGHT.fanReset, NIGHT.supplies, NIGHT.delivery, NIGHT.map, NIGHT.map, NIGHT.weapons, NIGHT.exit];
  replay.drive(points[replay.simulation.mission.phase], { interact: [0, 1, 2, 3, 6].includes(replay.simulation.mission.phase), skip, combat: false });
}
function finishNight(replay: ChapterReplay, skip: boolean): void {
  replay.until('S03 departure', () => replay.simulation.mission.complete, () => advanceNight(replay, skip), 180);
  const s = replay.simulation;
  expect(replay.phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(s.mission.facts).toEqual(NIGHT_FACTS);
  expect(s.player.ammo).toBe(25); expect(s.player.reserve).toBe(150);
  expect(s.player.name).toBe('陆闻川 · 十九岁');
  expect(s.mission.failed).toBe(false);
  expect(distance(s.player.position, NIGHT.exit)).toBeLessThan(2.8);
  expect(replay.carrySteps).toBeGreaterThan(12 / FIXED_DT);
  expect(replay.inputs.move).toBeGreaterThan(0);
  expect(replay.inputs.fire).toBe(0);
  for (let i = 1; i < NIGHT_FACTS.length; i++) expect(replay.factsAt.get(NIGHT_FACTS[i])!).toBeGreaterThanOrEqual(replay.factsAt.get(NIGHT_FACTS[i - 1])!);
}

function gateTrace(replay: ChapterReplay, z: number) {
  return replay.simulation.physics.trace([0, 1.6, z + 0.8], [0, 1.6, z - 0.8], 'player', true);
}

function escortWorkers(replay: ChapterReplay): void {
  const s = replay.simulation;
  // A stationary bot at the bus cannot see every attacker pinning the arriving
  // convoy. Patrol toward those positions using ground paths and normal fire.
  const threat = s.aliveEnemies.filter(enemy => distance(enemy.position, WORKERS.safe) < 24
    || s.workers.some(worker => !worker.safe && distance(worker.position, enemy.position) < 10))
    .sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))[0];
  const point: Vec3 = threat ? [Math.round(threat.position[0]), 0, Math.round(threat.position[2])] : WORKERS.safe;
  replay.drive(point, { range: threat ? 2.5 : 1.6 });
}

describe('S03/S04 authored geometry: public-input simulation regressions', () => {
  it('S03 work, actual box carry, conversation, equipment and departure preserve normal/skip facts', () => {
    const results: string[][] = [];
    for (const skip of [false, true]) {
      const replay = new ChapterReplay('nightshift');
      try {
        // Skip at spawn cannot finish work, collect a weapon, or substitute for E.
        replay.step({ skip: true });
        expect(replay.simulation.mission.phase).toBe(0);
        expect(replay.simulation.mission.facts).toEqual([]);
        finishNight(replay, skip);
        results.push([...replay.simulation.mission.facts]);
        console.info(`CHAPTER_REPLAY S03 skip=${skip}`, replay.summary());
      } finally { replay.dispose(); }
    }
    expect(results[1]).toEqual(results[0]);
  }, 60_000);

  it('S03 real carry checkpoint survives SaveStore reload and finishes the remaining route', () => {
    const replay = new ChapterReplay('nightshift');
    try {
      replay.until('S03 pick up supplies', () => replay.simulation.mission.phase === 3, () => advanceNight(replay, false));
      replay.restoreCheckpoint();
      expect(replay.simulation.mission.control).toBe('cooperative');
      expect(replay.simulation.mission.facts).toContain('supplies-collected');
      expect(replay.simulation.mission.facts).not.toContain('supplies-delivered');
      expect(replay.simulation.player.ammo).toBe(0);
      finishNight(replay, false);
      expect(replay.checkpoints.map(c => c.phase)).toEqual([3]);
      console.info('CHAPTER_REPLAY S03 restored', replay.summary());
    } finally { replay.dispose(); }
  }, 60_000);

  it.each([false, true])('S04 observes, climbs/descends and hands off nine stable IDs (restore doors=%s)', restoreDoors => {
    const replay = new ChapterReplay('workers'), w = WORKERS;
    try {
      expect(gateTrace(replay, 0)?.id).toBe('solid:checkpoint-gate');
      expect(gateTrace(replay, -78)?.id).toBe('solid:yard-gate');
      // Walk into the closed checkpoint before any report; collision must hold.
      replay.walk([0, 0, 1], { direct: true, combat: false, range: 0.6 });
      for (let i = 0; i < 120; i++) replay.drive([0, 0, -2], { direct: true, combat: false, range: 0.1 });
      expect(replay.simulation.player.position[2], replay.summary()).toBeGreaterThan(0.45);
      expect(replay.simulation.mission.phase).toBe(0);
      replay.walk(w.observation, { combat: false, range: 1 });
      const p = replay.simulation.player.position;
      const towardConvoy = Math.atan2(-(w.convoy[0] - p[0]), -(w.convoy[2] - p[2]));
      replay.step({ yaw: towardConvoy + Math.PI, interact: true, skip: true });
      expect(replay.simulation.mission.phase).toBe(0);
      expect(replay.simulation.mission.facts).not.toContain('convoy-reported');
      replay.step({ yaw: towardConvoy });
      expect(replay.simulation.mission.phase).toBe(1);
      expect(replay.simulation.mission.facts).toEqual(expect.arrayContaining(['convoy-reported', 'zhou-adopts-lu-report']));

      replay.until('S04 checkpoint interaction', () => replay.simulation.mission.phase === 2, () => replay.drive(w.checkpoint, { interact: true }));
      expect(gateTrace(replay, 0), replay.summary()).toBeNull();
      if (restoreDoors) replay.restoreCheckpoint();
      expect(replay.simulation.mission.phase).toBe(2);
      expect(gateTrace(replay, 0), replay.summary()).toBeNull();
      expect(gateTrace(replay, -78)?.id).toBe('solid:yard-gate');
      replay.walk([0, 0, -3], { direct: true, range: 0.6 });
      expect(replay.simulation.player.position[2]).toBeLessThan(-2.4);
      replay.until('S04 lower access panel', () => replay.simulation.mission.phase === 3, () => replay.drive(w.lower, { interact: true }));

      replay.walk(w.stairStart, { range: 0.35 });
      expect(replay.simulation.player.position[1], replay.summary()).toBeLessThan(0.3);
      replay.walk(w.stairTop, { direct: true, range: 0.3, sprint: false });
      expect(replay.simulation.player.position[1], replay.summary()).toBeGreaterThan(2.8);
      expect(replay.simulation.player.position[1]).toBeLessThan(3.3);
      replay.until('S04 upper observation', () => replay.simulation.mission.phase === 4,
        () => replay.drive(w.overlook, { direct: true, range: 0.8, sprint: false }));
      expect(replay.simulation.player.position[1], replay.summary()).toBeGreaterThan(2.8);
      replay.walk(w.descent, { direct: true, range: 0.3, sprint: false });
      for (let i = 0; i < 30; i++) replay.step();
      expect(replay.simulation.player.position[1], replay.summary()).toBeLessThan(0.3);
      expect(replay.inputs.jump).toBe(0);

      replay.walk(w.yardGate, { range: 0.6 });
      for (let i = 0; i < 120; i++) replay.drive([0, 0, -80], { direct: true, range: 0.1 });
      expect(replay.simulation.player.position[2], replay.summary()).toBeGreaterThan(-77.55);
      expect(replay.simulation.mission.phase).toBe(4);
      replay.until('S04 rear gate', () => replay.simulation.mission.phase === 5, () => replay.drive(w.yardGate, { interact: true }));
      expect(gateTrace(replay, -78), replay.summary()).toBeNull();
      if (restoreDoors) replay.restoreCheckpoint();
      expect(replay.simulation.mission.phase).toBe(5);
      expect(replay.simulation.mission.facts).toEqual(expect.arrayContaining(['checkpoint-open', 'yard-open', 'maintenance-access', 'maintenance-overlook-secured']));
      expect(gateTrace(replay, 0)).toBeNull(); expect(gateTrace(replay, -78)).toBeNull();
      replay.walk([0, 0, -81], { direct: true, range: 0.6 });
      expect(replay.simulation.player.position[2]).toBeLessThan(-80.4);
      replay.until('S04 release technicians', () => replay.simulation.mission.phase === 6, () => replay.drive(w.release));
      replay.until('S04 safe arrival', () => replay.simulation.mission.phase === 7, () => escortWorkers(replay), 240);
      replay.until('S04 handoff', () => replay.simulation.mission.complete, () => replay.drive(w.post, { interact: true }));

      const s = replay.simulation;
      expect(replay.phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(s.mission.failed).toBe(false); expect(s.safeCount).toBe(9);
      expect(s.workers.map(a => a.id)).toEqual(Array.from({ length: 9 }, (_, i) => `worker-${i}`));
      expect(s.workers[0].name).toBe('罗敬');
      for (const worker of s.workers) {
        expect(replay.traveled.get(worker.id), replay.summary()).toBeGreaterThan(20);
        expect(distance(replay.safeArrival.get(worker.id)!.position, w.safe), replay.summary()).toBeLessThan(5);
        expect(worker.goals).toEqual([]);
      }
      expect(distance(s.actors.find(a => a.id === 'meng')!.position, w.post)).toBeLessThan(1);
      expect(s.mission.facts).toEqual(expect.arrayContaining(['technicians-received', 'family-escort-promised', 'reception-damage-known']));
      expect(replay.factsAt.get('technicians-received')!).toBeGreaterThanOrEqual(Math.max(...[...replay.safeArrival.values()].map(a => a.at)));
      expect(replay.factsAt.get('family-escort-promised')!).toBeGreaterThan(replay.factsAt.get('technicians-received')!);
      expect(replay.checkpoints.map(c => c.phase)).toEqual(restoreDoors ? [2, 5] : []);
      expect(replay.inputs.fire).toBeGreaterThan(0); expect(s.hits).toBeGreaterThan(0);
      // Progress is tied to physical objectives; the full reinforcement budget is not a kill quota.
      expect(s.actors.filter(a => a.id.startsWith('enemy-E01-')).length).toBeLessThan(18);
      expect(replay.maxActive).toBeLessThanOrEqual(8); expect(replay.maxAimers).toBeLessThanOrEqual(2);
      console.info(`CHAPTER_REPLAY S04 restore doors=${restoreDoors}`, replay.summary());
    } finally { replay.dispose(); }
  }, 90_000);
});
