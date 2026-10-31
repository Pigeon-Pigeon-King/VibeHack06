import { beforeAll, describe, expect, it } from 'vitest';
import type { ScenarioId, Vec3 } from '../src/contracts';
import { WORKERS } from '../src/content/chapter-layout';
import { FRONTGATE } from '../src/content/frontgate-layout';
import { FLANK } from '../src/content/flank-layout';
import { ESCORT } from '../src/content/escort-layout';
import { RELIEF } from '../src/content/relief-layout';
import { EPILOGUE } from '../src/content/epilogue-layout';
import { CROWD_STAGING_FACT, LEGACY_CROWD_STOPS } from '../src/content/crowd-layout';
import { emptyIntent, Simulation } from '../src/mission/Simulation';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, Physics } from '../src/runtime/Physics';

beforeAll(initializePhysics);
const groups: Array<{ scenario: ScenarioId; points: Vec3[][] }> = [
  { scenario: 'workers', points: [WORKERS.workers, WORKERS.workerSafe] },
  { scenario: 'frontgate', points: [FRONTGATE.workers, FRONTGATE.workerSafe] },
  { scenario: 'flank', points: [FLANK.technicians, FLANK.technicianStops, FLANK.walkerSpawns, FLANK.walkerSafe] },
  { scenario: 'escort', points: [ESCORT.walkerSpawns, ...ESCORT.convoyLegs.map(leg => leg.walkerStops)] },
  { scenario: 'relief', points: [RELIEF.techSpawns, RELIEF.technicianStops] },
  { scenario: 'epilogue', points: [EPILOGUE.workersSpawns, EPILOGUE.workersGoals] },
];

describe('authored crowd placement safety', () => {
  for (const { scenario, points } of groups) it(`${scenario}: irregular waiting and arrival groups retain floor support, standing clearance and distinct places`, () => {
    const environment = buildEnvironment(scenario), physics = new Physics(environment.solids);
    try {
      for (const group of points) for (let i = 0; i < group.length; i++) {
        expect(physics.canOccupy(group[i]), `${scenario} blocked or unsupported ${group[i]}`).toBe(true);
        for (const other of group.slice(i + 1)) {
          expect(Math.hypot(group[i][0] - other[0], group[i][2] - other[2]), `${scenario} overlapping arrival places`).toBeGreaterThan(0.9);
        }
      }
    } finally { physics.dispose(); environment.dispose(); }
  });

  it('individual poses are repeatable and a checkpoint keeps the actual saved poses', () => {
    const environment = buildEnvironment('workers');
    const first = new Simulation('workers', environment.solids), second = new Simulation('workers', environment.solids);
    let restored: Simulation | undefined;
    try {
      expect(first.snapshot().random).toBe(second.snapshot().random);
      const poses = (s: Simulation) => s.workers.map(a => [a.yaw, a.walk]);
      expect(poses(first)).toEqual(poses(second));
      expect(new Set(first.workers.map(a => a.yaw.toFixed(2))).size).toBeGreaterThan(5);
      first.workers[0].yaw = 1.1; first.workers[0].walk = 12.5;
      restored = new Simulation('workers', environment.solids, first.snapshot());
      expect(poses(restored)).toEqual(poses(first));
    } finally { first.dispose(); second.dispose(); restored?.dispose(); environment.dispose(); }
  });

  // Construct old-version arrival checkpoints to exercise compatibility gates;
  // these are mechanism tests, not normal campaign playthrough evidence.
  for (const scenario of ['flank', 'escort', 'epilogue'] as const) it(`${scenario}: an old in-flight save can finish its original crowd destinations`, () => {
    const environment = buildEnvironment(scenario), source = new Simulation(scenario, environment.solids);
    let restored: Simulation | undefined;
    try {
      const saved = source.snapshot();
      saved.mission.facts = saved.mission.facts.filter(f => f !== CROWD_STAGING_FACT);
      saved.mission.phaseTime = 3; saved.mission.elapsed = 100; saved.mission.control = 'work';
      const place = (id: string, point: Vec3) => {
        const actor = saved.actors.find(a => a.id === id)!;
        actor.position = [...point]; actor.goals = []; actor.path = []; actor.released = true; actor.safe = false;
      };
      if (scenario === 'flank') {
        saved.mission.phase = 4;
        LEGACY_CROWD_STOPS.flankWalkers.forEach((p, i) => place(`walker-${i}`, p));
        FLANK.cartSafe.forEach((p, i) => place(`cart-${i}`, p));
      } else if (scenario === 'escort') {
        saved.mission.phase = 12; saved.mission.facts.push('escort-patient-transferred');
        LEGACY_CROWD_STOPS.escortWalkers[2].forEach((p, i) => place(`walker-${i}`, p));
        place('cart-2', ESCORT.convoyLegs[2].cartStops[0]); place('cart-1', ESCORT.convoyLegs[2].cartStops[1]);
      } else {
        saved.mission.phase = 7; saved.mission.control = 'cooperative'; saved.player.position = [...EPILOGUE.holdDoor];
        saved.mission.facts.push('first-workers-entering', 'reception-door-open');
        LEGACY_CROWD_STOPS.epilogueWorkers.forEach((p, i) => place(`worker-${i}`, p));
        place('supply-cart', [-4, 0, -6]);
      }
      restored = new Simulation(scenario, environment.solids, saved);
      restored.step(emptyIntent);
      expect(restored.mission.phase).toBe(saved.mission.phase + 1);
      if (scenario === 'epilogue') expect(restored.mission.complete).toBe(true);
    } finally { source.dispose(); restored?.dispose(); environment.dispose(); }
  });
});
