import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ScenarioId, SolidSpec, Vec3 } from '../src/contracts';
import { WORKERS } from '../src/content/chapter-layout';
import { LAYOUT } from '../src/content/layout';
import { distance, emptyIntent, Simulation } from '../src/mission/Simulation';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

// These are synthetic state/physics fixtures, not a browser playthrough or human acceptance.
// Teleports place participants at a transition boundary; normal step() owns the transition.
const solids: SolidSpec[] = [{ id: 'test-floor', position: [0, -0.5, 0], size: [100, 1, 100] }];
const simulations: Simulation[] = [];
const create = (scenario: ScenarioId, saved?: ReturnType<Simulation['snapshot']>) => {
  const simulation = new Simulation(scenario, solids, saved);
  simulations.push(simulation);
  return simulation;
};
const placePlayer = (simulation: Simulation, position: Vec3) => {
  simulation.player.position = [...position];
  simulation.physics.teleport('player', position);
  simulation.physics.step();
};
const placeActor = (simulation: Simulation, id: string, position: Vec3) => {
  const actor = simulation.actors.find(actor => actor.id === id)!;
  actor.position = [...position]; actor.goals = []; actor.path = [];
  simulation.physics.teleport(id, position);
  simulation.physics.step();
  return actor;
};

beforeAll(() => initializePhysics());
afterEach(() => { for (const simulation of simulations.splice(0)) simulation.dispose(); });

describe('mission transition and restoration invariants', () => {
  it('blocks a covered physical barrel even when the camera can see over the cover', () => {
    const shootAtFixture = (coverHeight: number) => {
      const cover: SolidSpec[] = coverHeight > 0 ? [{ id: 'muzzle-cover', position: [0, coverHeight / 2, -0.8], size: [6, coverHeight, 0.8] }] : [];
      const simulation = new Simulation('northgate', [...solids, ...cover]);
      simulations.push(simulation);
      placePlayer(simulation, [0, 0, 0]);
      const target = placeActor(simulation, 'enemy-0', [0, 0, -3]);
      const initialHealth = target.health;
      simulation.step({ ...emptyIntent, fire: true, ads: true });
      expect(simulation.player.ammo).toBe(24);
      return { damage: initialHealth - target.health, hits: simulation.hits };
    };
    expect(shootAtFixture(0).damage).toBeGreaterThan(0);
    expect(shootAtFixture(3)).toEqual({ damage: 0, hits: 0 });
    // Camera eye is above this barrier, but the physical barrel is inside it.
    expect(shootAtFixture(1.62)).toEqual({ damage: 0, hits: 0 });
  });

  it('does not finish the north gate from elapsed time, kill counters, skip, or reaching the exit alone', () => {
    const simulation = create('northgate');
    simulation.mission.elapsed = 3600;
    simulation.mission.phaseTime = 3600;
    simulation.kills = 1000;
    placePlayer(simulation, LAYOUT.northgate.exit);
    for (let i = 0; i < 12; i++) simulation.step({ ...emptyIntent, skip: true });
    expect(simulation.mission.phase).toBe(0);
    expect(simulation.mission.complete).toBe(false);
    expect(simulation.safeCount).toBe(0);
    expect(simulation.mission.facts).not.toContain('handoff');
    placePlayer(simulation, LAYOUT.northgate.terminal);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.phase).toBe(1);
    simulation.mission.elapsed += 3600;
    simulation.mission.phaseTime += 3600;
    for (let i = 0; i < 12; i++) simulation.step({ ...emptyIntent, skip: true });
    expect(simulation.safeCount).toBe(0);
    expect(simulation.mission.phase).toBe(1);
    expect(simulation.mission.complete).toBe(false);
  });

  it('requires the receiving teammate to arrive before handoff can permit extraction', () => {
    const simulation = create('northgate');
    // Synthetic prior-evacuation state isolates the final handoff gate.
    simulation.mission.phase = 3;
    simulation.mission.facts = ['evac-line-open', 'workers-released', 'all-workers-safe'];
    for (const worker of simulation.workers) {
      placeActor(simulation, worker.id, LAYOUT.northgate.safe);
      worker.released = true; worker.safe = true;
    }
    placePlayer(simulation, LAYOUT.northgate.post);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.facts).not.toContain('handoff');
    expect(simulation.mission.complete).toBe(false);
    placeActor(simulation, 'zheng', LAYOUT.northgate.post);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.facts).toContain('handoff');
    expect(simulation.mission.complete).toBe(false);
    placePlayer(simulation, LAYOUT.northgate.exit);
    simulation.step(emptyIntent);
    expect(simulation.mission.complete).toBe(true);
  });

  it('restores checkpoint facts, actor state, ammunition and random state without old projectiles', () => {
    const simulation = create('northgate');
    simulation.player.ammo = 13; simulation.player.reserve = 79;
    placePlayer(simulation, LAYOUT.northgate.terminal);
    simulation.step({ ...emptyIntent, interact: true });
    const checkpoint = structuredClone(simulation.checkpoint);
    expect(checkpoint.mission.phase).toBe(1);
    expect(checkpoint.mission.facts).toContain('workers-released');
    simulation.ballistics.fire('player', simulation.playerEye, [0, 0, -1], 34);
    simulation.player.ammo = 1;
    simulation.actors[0].health = 5;
    simulation.mission.facts.push('post-checkpoint-event');
    expect(simulation.ballistics.projectiles).toHaveLength(1);

    const restored = create('northgate', checkpoint);
    expect(restored.player).toEqual(checkpoint.player);
    expect(restored.actors).toEqual(checkpoint.actors);
    expect(restored.mission).toEqual(checkpoint.mission);
    expect(restored.random.state).toBe(checkpoint.random);
    expect(restored.ballistics.projectiles).toHaveLength(0);
    expect(restored.mission.facts).not.toContain('post-checkpoint-event');
    expect(restored.events).toHaveLength(0);
  });

  it('gives natural and skipped father carry the same story outcome, then prevents skipping combat', () => {
    const beginCarry = () => {
      const simulation = create('prologue');
      placePlayer(simulation, LAYOUT.prologue.terminal);
      simulation.step({ ...emptyIntent, interact: true });
      expect(simulation.mission.control).toBe('staged');
      return simulation;
    };
    const natural = beginCarry(), skipped = beginCarry();
    for (let i = 0; i < 900 && natural.mission.phase === 1; i++) natural.step(emptyIntent);
    skipped.step({ ...emptyIntent, skip: true });
    for (const simulation of [natural, skipped]) {
      expect(simulation.mission.phase).toBe(2);
      expect(simulation.mission.control).toBe('combat');
      expect(simulation.player.name).toBe('周延 · 二十三岁');
      expect(simulation.player.height).toBe(1.8);
      expect(simulation.mission.facts).toContain('father-and-child-through-door');
      expect(simulation.aliveEnemies).toHaveLength(3);
      expect(simulation.actors.find(actor => actor.id === 'father')!.goals).toHaveLength(0);
    }
    expect(skipped.mission.facts).toEqual(natural.mission.facts);
    for (let i = 0; i < 12; i++) skipped.step({ ...emptyIntent, skip: true });
    expect(skipped.mission.phase).toBe(2);
    expect(skipped.mission.complete).toBe(false);
    expect(skipped.safeCount).toBe(0);
  });

  const reachMedical = () => {
    const simulation = create('handover');
    placePlayer(simulation, LAYOUT.handover.terminal);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.facts).toEqual(expect.arrayContaining(['knows-shaoyuan-route', 'knows-escort-risk', 'lu-keeps-promise']));
    // Isolate the receiving transition from the already-covered physical movement system.
    simulation.workers.forEach((worker, index) => placeActor(simulation, worker.id, [-2 + index * 2, 0, 1]));
    placePlayer(simulation, LAYOUT.handover.post);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.phase).toBe(2);
    expect(simulation.mission.facts).not.toContain('zhou-growth-complete');
    placeActor(simulation, 'zheng', LAYOUT.handover.post);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.phase).toBe(3);
    expect(simulation.mission.facts).toContain('zhou-growth-complete');
    expect(simulation.mission.facts).not.toContain('zhou-wounded-asks-help');
    simulation.step({ ...emptyIntent, skip: true });
    expect(simulation.mission.phase).toBe(3);
    placePlayer(simulation, LAYOUT.handover.rescue);
    simulation.step({ ...emptyIntent, interact: true });
    expect(simulation.mission.control).toBe('cooperative');
    const facts = simulation.mission.facts;
    expect(facts.indexOf('zhou-growth-complete')).toBeLessThan(facts.indexOf('zhou-wounded-asks-help'));
    placePlayer(simulation, LAYOUT.handover.safe);
    simulation.step(emptyIntent);
    expect(simulation.mission.phase).toBe(5);
    expect(simulation.mission.facts).toContain('medical-handoff');
    return simulation;
  };

  it('keeps growth before injury and the fixed medical result separate from combat failure', () => {
    const simulation = reachMedical();
    simulation.step({ ...emptyIntent, skip: true });
    expect(simulation.mission.complete).toBe(true);
    expect(simulation.mission.failed).toBe(false);
    expect(simulation.player.health).toBeGreaterThan(0);
    expect(simulation.mission.facts).toEqual(expect.arrayContaining(['meng-survives', 'zhou-dies-after-treatment']));
  });

  it('leaves the medical team at its receiving slot after both normal playback and skipping', () => {
    const natural = reachMedical(), skipped = reachMedical();
    for (let i = 0; i < 600 && !natural.mission.complete; i++) natural.step(emptyIntent, FIXED_DT);
    skipped.step({ ...emptyIntent, skip: true });
    expect(natural.mission.complete).toBe(true);
    expect(skipped.mission.complete).toBe(true);
    expect(skipped.mission.facts).toEqual(natural.mission.facts);
    for (const simulation of [natural, skipped]) {
      const medic = simulation.actors.find(actor => actor.id === 'medic')!;
      expect(distance(medic.position, [16, 0, 25])).toBeLessThan(1);
      expect(medic.goals).toHaveLength(0);
    }
  });
});

describe('synthetic snapshot pressure boundaries (not chapter input playthroughs)', () => {
  it('S04 opens the checkpoint with eight distant survivors without overfilling the next group', () => {
    const snapshot = create('workers').snapshot();
    const enemy = create('northgate').snapshot().actors.find(actor => actor.role === 'enemy')!;
    // E01 has spent its 18-person budget, with eight survivors outside the
    // checkpoint interaction radius. Only this initial Snapshot is synthetic.
    snapshot.player.position = [...WORKERS.checkpoint];
    Object.assign(snapshot.mission, { phase: 1, control: 'combat', elapsed: 100, phaseTime: 10,
      spawned: 18, nextSpawn: 1000, facts: ['convoy-reported', 'zhou-adopts-lu-report'] });
    snapshot.kills = 10;
    snapshot.actors.push(...Array.from({ length: 18 }, (_, index) => ({
      ...structuredClone(enemy), id: `enemy-E01-${index}`, position: [-40 + index % 8 * 1.5, 0, -35] as Vec3,
      goals: [], path: [], health: index < 8 ? 68 : 0, down: index >= 8, cooldown: 10, aiming: false, aimTime: 0,
    })));
    const simulation = create('workers', snapshot);
    expect(simulation.aliveEnemies).toHaveLength(8);
    expect(simulation.aliveEnemies.every(actor => distance(actor.position, WORKERS.checkpoint) > 19)).toBe(true);

    simulation.step({ ...emptyIntent, interact: true });

    expect(simulation.mission.phase).toBe(2);
    expect(simulation.mission.facts).toContain('checkpoint-open');
    expect(simulation.mission.failed).toBe(false);
    expect(simulation.aliveEnemies.length).toBeLessThanOrEqual(8);
    for (const [group, budget] of [['E01', 18], ['E02', 20], ['E03', 18]] as const) {
      expect(simulation.actors.filter(actor => actor.id.startsWith(`enemy-${group}-`)).length).toBeLessThanOrEqual(budget);
    }
    expect(simulation.mission.spawned).toBeLessThanOrEqual(18 + 20 + 18);
    expect(new Set(simulation.actors.map(actor => actor.id)).size).toBe(simulation.actors.length);
  });

  it('northgate advances its east-pressure phase with six survivors without exceeding active or total budgets', () => {
    const snapshot = create('northgate').snapshot();
    const enemy = snapshot.actors.find(actor => actor.role === 'enemy')!;
    // All 24 budgeted enemies have entered; six remain. Three workers have
    // already reached the receiving lane. Normal step owns the phase change.
    Object.assign(snapshot.mission, { phase: 1, control: 'combat', elapsed: 100, phaseTime: 10,
      spawned: 24, nextSpawn: 1000, facts: ['evac-line-open', 'workers-released'] });
    snapshot.kills = 18;
    snapshot.actors = snapshot.actors.filter(actor => actor.role !== 'enemy');
    snapshot.actors.filter(actor => actor.role === 'worker').forEach((worker, index) => {
      worker.released = true; worker.safe = index < 3; worker.goals = []; worker.path = [];
      if (index < 3) worker.position = [...LAYOUT.northgate.safe];
    });
    snapshot.actors.push(...Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(enemy), id: `enemy-${index}`, position: [-24 + index % 6 * 2, 0, -30] as Vec3,
      goals: [], path: [], health: index < 6 ? 68 : 0, down: index >= 6, cooldown: 10, aiming: false, aimTime: 0,
    })));
    const simulation = create('northgate', snapshot);
    expect(simulation.aliveEnemies).toHaveLength(6);
    expect(simulation.safeCount).toBe(3);

    simulation.step(emptyIntent);

    expect(simulation.mission.phase).toBe(2);
    expect(simulation.mission.failed).toBe(false);
    expect(simulation.aliveEnemies.length).toBeLessThanOrEqual(6);
    expect(simulation.mission.spawned).toBeLessThanOrEqual(24);
    expect(simulation.actors.filter(actor => actor.role === 'enemy').length).toBeLessThanOrEqual(24);
    expect(new Set(simulation.actors.map(actor => actor.id)).size).toBe(simulation.actors.length);
  });
});
