import { beforeAll, describe, expect, it } from 'vitest';
import type { EnvironmentModel, ScenarioId, Vec3 } from '../src/contracts';
import type { Intent } from '../src/player/Input';
import { LAYOUT } from '../src/content/layout';
import { buildEnvironment } from '../src/presentation/environment';
import { Simulation, distance, emptyIntent } from '../src/mission/Simulation';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

// This is a deterministic simulation-layer input replay. It is not browser input,
// a balance/fun verdict, or a substitute for human play and presentation review.
const MAX_STEPS = 300 * 60;
beforeAll(async () => { await initializePhysics(); });

class Replay {
  readonly environment: EnvironmentModel;
  readonly simulation: Simulation;
  readonly phases: number[] = [0];
  readonly factsAt = new Map<string, number>();
  readonly traveled = new Map<string, number>();
  readonly safeArrival = new Map<string, { at: number; position: Vec3 }>();
  steps = 0;
  inputs = { move: 0, fire: 0, reload: 0, interact: 0, skip: 0 };
  private destination = '';
  private path: Vec3[] = [];

  constructor(scenario: ScenarioId) {
    this.environment = buildEnvironment(scenario);
    this.simulation = new Simulation(scenario, this.environment.solids);
  }
  summary(): string {
    const s = this.simulation;
    return JSON.stringify({ scenario: s.scenario, elapsed: Number(s.mission.elapsed.toFixed(2)),
      phase: s.mission.phase, phases: this.phases, hp: s.player.health, failed: s.mission.failed,
      complete: s.mission.complete, player: s.player.position.map(v => +v.toFixed(2)),
      objective: s.objective.text, facts: s.mission.facts, inputs: this.inputs,
      hits: s.hits, kills: s.kills, safe: s.safeCount,
      actors: s.actors.filter(a => !a.down).map(a => ({ id: a.id, pos: a.position.map(v => +v.toFixed(2)),
        goals: a.goals, next: a.path[0], safe: a.safe, traveled: +(this.traveled.get(a.id) ?? 0).toFixed(2) })) });
  }
  step(partial: Partial<Intent> = {}): void {
    if (this.steps >= MAX_STEPS) throw new Error(`Replay reached 300 simulated seconds: ${this.summary()}`);
    const s = this.simulation;
    if (s.mission.failed) throw new Error(`Replay player failed: ${this.summary()}`);
    const previous = new Map(s.actors.map(a => [a.id, [...a.position] as Vec3]));
    const input = { ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...partial };
    if (input.forward || input.right) this.inputs.move++;
    for (const key of ['fire', 'reload', 'interact', 'skip'] as const) if (input[key]) this.inputs[key]++;
    s.step(input);
    this.steps++;
    if (this.phases.at(-1) !== s.mission.phase) this.phases.push(s.mission.phase);
    for (const fact of s.mission.facts) if (!this.factsAt.has(fact)) this.factsAt.set(fact, this.steps);
    for (const a of s.actors) {
      const last = previous.get(a.id);
      if (last) this.traveled.set(a.id, (this.traveled.get(a.id) ?? 0) + distance(last, a.position));
      if (a.safe && !this.safeArrival.has(a.id)) this.safeArrival.set(a.id, { at: this.steps, position: [...a.position] });
    }
    if (s.mission.failed) throw new Error(`Replay player failed: ${this.summary()}`);
  }
  /** Aim at a ray-visible enemy and continue moving via ordinary directional intents. */
  drive(goal: Vec3, options: { interact?: boolean; skip?: boolean; combat?: boolean; range?: number } = {}): void {
    const s = this.simulation;
    const range = options.range ?? 1.8;
    const destination = goal.join(',');
    if (destination !== this.destination) { this.path = []; this.destination = destination; }
    let mx = 0, mz = 0;
    if (distance(s.player.position, goal) > range && s.mission.control !== 'staged') {
      if (!this.path.length) this.path = s.navigation.path(s.player.position, goal);
      while (this.path.length && distance(s.player.position, this.path[0]) < 0.30) this.path.shift();
      const next = this.path[0] ?? goal;
      const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2];
      const length = Math.max(0.001, Math.hypot(dx, dz));
      mx = dx / length; mz = dz / length;
    }
    const candidate = options.combat !== false && s.mission.control === 'combat' ? s.aliveEnemies
      .slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position))
      .find(a => {
        const hit = s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player');
        return hit?.id === a.id;
      }) : undefined;
    let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw;
    let pitch = 0;
    if (candidate) {
      const dx = candidate.position[0] - s.player.position[0], dz = candidate.position[2] - s.player.position[2];
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(candidate.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz));
    }
    this.step({ yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz,
      right: Math.cos(yaw) * mx - Math.sin(yaw) * mz,
      sprint: !candidate && s.mission.control !== 'cooperative',
      ads: !!candidate, fire: !!candidate, reload: s.player.ammo === 0,
      interact: !!options.interact && this.steps % 12 === 0,
      skip: !!options.skip && this.steps % 12 === 0 });
  }
  until(condition: () => boolean, action: () => void): void {
    while (!condition()) action();
  }
  dispose(): void { this.simulation.dispose(); this.environment.dispose(); }
}

describe('authored scenes: simulation-layer input paths', () => {
  it('northgate reaches all seven workers, physical handoff, then southern withdrawal', () => {
    const replay = new Replay('northgate');
    const s = replay.simulation, l = LAYOUT.northgate;
    try {
      replay.until(() => s.mission.complete, () => {
        if (s.mission.phase === 0) replay.drive(l.terminal, { interact: true });
        else if (s.mission.phase < 3) replay.drive(l.post);
        else if (!s.mission.facts.includes('handoff')) replay.drive(l.post, { interact: true });
        else replay.drive(l.exit);
      });
      expect(s.safeCount, replay.summary()).toBe(7);
      expect(s.mission.failed).toBe(false);
      expect(replay.phases).toEqual([0, 1, 2, 3]);
      expect(s.mission.facts).toEqual(expect.arrayContaining(['evac-line-open', 'all-workers-safe', 'handoff']));
      expect(replay.factsAt.get('handoff')!).toBeGreaterThanOrEqual(replay.factsAt.get('all-workers-safe')!);
      expect(distance(s.actors.find(a => a.id === 'zheng')!.position, l.post)).toBeLessThan(1);
      expect(distance(s.player.position, l.exit)).toBeLessThan(2.8);
      for (const worker of s.workers) {
        expect(replay.traveled.get(worker.id), replay.summary()).toBeGreaterThan(20);
        expect(distance(replay.safeArrival.get(worker.id)!.position, l.safe)).toBeLessThan(5);
      }
      expect(replay.inputs.fire).toBeGreaterThan(0);
      expect(s.hits).toBeGreaterThan(0);
      console.info('SCENARIO_REPLAY northgate', replay.summary());
    } finally { replay.dispose(); }
  }, 60_000);

  it.each([false, true])('prologue completes real evacuation with carry skip=%s', skipCarry => {
    const replay = new Replay('prologue');
    const s = replay.simulation, l = LAYOUT.prologue;
    try {
      replay.until(() => s.mission.phase === 1, () => replay.drive(l.terminal, { interact: true, combat: false }));
      expect(s.mission.control).toBe('staged');
      replay.until(() => s.mission.phase === 2, () => replay.drive(l.post, { skip: skipCarry, combat: false }));
      expect(s.player.name).toBe('周延 · 二十三岁');
      expect(s.player.height).toBe(1.8);
      expect(s.mission.facts).toContain('father-and-child-through-door');
      expect(distance(s.actors.find(a => a.id === 'father')!.position, l.post)).toBeLessThan(0.05);
      // Enter is ignored during this unfinished combat objective.
      replay.step({ skip: true });
      expect(s.mission.complete).toBe(false);
      expect(s.safeCount).toBeLessThan(s.workers.length);
      replay.until(() => s.mission.complete, () => {
        if (s.mission.phase === 2) replay.drive([0, 0, 17]);
        else replay.drive(l.exit, { skip: true });
      });
      expect(replay.phases).toEqual([0, 1, 2, 3]);
      expect(s.mission.failed).toBe(false);
      expect(s.mission.facts).toContain('hall-evacuated');
      expect(s.safeCount).toBe(3);
      for (const worker of s.workers) {
        expect(replay.traveled.get(worker.id), replay.summary()).toBeGreaterThan(12);
        expect(distance(replay.safeArrival.get(worker.id)!.position, l.safe)).toBeLessThan(5);
      }
      if (!skipCarry) expect(replay.traveled.get('father')).toBeGreaterThan(12);
      console.info(`SCENARIO_REPLAY prologue skip=${skipCarry}`, replay.summary());
    } finally { replay.dispose(); }
  }, 60_000);

  it('handover preserves informed escort → growth → rescue → medical cause order', () => {
    const replay = new Replay('handover');
    const s = replay.simulation, l = LAYOUT.handover;
    let carriedFrames = 0;
    try {
      replay.until(() => s.mission.complete, () => {
        const phase = s.mission.phase;
        if (phase === 0) replay.drive(l.terminal, { interact: true });
        else if (phase === 1 || phase === 2) replay.drive(l.post, { interact: true });
        else if (phase === 3) replay.drive(l.rescue, { interact: true });
        else if (phase === 4) {
          const before = s.player.ammo;
          replay.drive(l.safe);
          expect(s.player.ammo).toBe(before);
          if (s.mission.phase === 4) {
            const meng = s.actors.find(a => a.id === 'meng')!;
            expect(distance(meng.position, s.player.position)).toBeCloseTo(1, 5);
            expect(distance(s.actors.find(a => a.id === 'zheng')!.position, s.player.position)).toBeCloseTo(2, 4);
            carriedFrames++;
          }
        } else replay.drive(l.safe, { skip: false });
      });
      expect(replay.phases).toEqual([0, 1, 2, 3, 4, 5]);
      expect(s.mission.failed).toBe(false);
      expect(s.safeCount).toBe(2);
      expect(carriedFrames).toBeGreaterThan(60);
      const order = ['knows-shaoyuan-route', 'knows-escort-risk', 'lu-keeps-promise', 'zhou-growth-complete',
        'zhou-accepts-protection', 'meng-rescued', 'zhou-wounded-asks-help', 'medical-handoff',
        'meng-survives', 'zhou-dies-after-treatment'];
      for (const fact of order) expect(s.mission.facts, replay.summary()).toContain(fact);
      for (let i = 1; i < order.length; i++) expect(replay.factsAt.get(order[i])!).toBeGreaterThanOrEqual(replay.factsAt.get(order[i - 1])!);
      expect(replay.factsAt.get('zhou-wounded-asks-help')!).toBeGreaterThan(replay.factsAt.get('zhou-growth-complete')!);
      expect(replay.factsAt.get('zhou-dies-after-treatment')!).toBeGreaterThan(replay.factsAt.get('medical-handoff')!);
      expect(distance(s.actors.find(a => a.id === 'medic')!.position, [16, 0, 25])).toBeLessThan(0.05);
      expect(s.player.health).toBeGreaterThan(0);
      console.info('SCENARIO_REPLAY handover', replay.summary());
    } finally { replay.dispose(); }
  }, 60_000);
});
