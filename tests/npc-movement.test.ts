import { beforeAll, describe, expect, it } from 'vitest';
import type { CharacterRole, SolidSpec, Vec3 } from '../src/contracts';
import { EPILOGUE as E } from '../src/content/epilogue-layout';
import { TRANSFER as T } from '../src/content/transfer-layout';
import { distance, emptyIntent, Simulation, type Actor } from '../src/mission/Simulation';
import type { Intent } from '../src/player/Input';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT as dt, initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);

const flat: SolidSpec = { id: 'pace-flat', position: [-200, -0.5, 45], size: [500, 1, 130] };
const arenaFloor: SolidSpec = { id: 'pace-arena-floor', position: [0, -0.5, 0], size: [80, 1, 80] };
const copy = (p: Vec3): Vec3 => [...p];
const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
function tick(s: Simulation, input: Partial<Intent> = {}): void {
  s.step({ ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...input });
}
function advance(s: Simulation, seconds: number, input: Partial<Intent> = {}): void {
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) tick(s, input);
}
function regularSpeed(metres: number, seconds: number, label: string): void {
  // Assert the player's requested 4–5 m/s behavior, not an exported constant.
  expect(metres / seconds, `${label}: physical metres per simulation second`).toBeGreaterThanOrEqual(4);
  expect(metres / seconds, label).toBeLessThanOrEqual(5);
}
function movementStats(steps: number[]) {
  // Count every fixed tick in the average. Exclude only sub-mm contact noise
  // from the moving-frame median, keeping short navigation steps as samples.
  const speeds = steps.filter(metres => metres > 0.001).map(metres => metres / dt).sort((a, b) => a - b);
  const metres = steps.reduce((sum, step) => sum + step, 0);
  return { metres, average: metres / (steps.length * dt), movingFrames: speeds.length,
    median: speeds[Math.floor(speeds.length / 2)] ?? 0, maximum: speeds.at(-1) ?? 0 };
}
function convoyMovingSpeed(speed: number, label: string): void {
  // The authored 4.0 lower bound can land just below 4 in Rapier float output.
  expect(speed, `${label}: moving-frame median`).toBeGreaterThanOrEqual(3.99);
  expect(speed, `${label}: moving-frame median`).toBeLessThanOrEqual(5.01);
}
function subject(s: Simulation, role: CharacterRole, start: Vec3, goal: Vec3): Actor {
  // Synthetic route fixture: initial body creation is explicit. Every later
  // displacement is produced by Simulation -> Rapier, never by teleporting.
  const a = s.createActor('pace-subject', '速度检查角色', role, start);
  s.physics.add(a.id, a.position); s.physics.step();
  s.route(a, [goal]); return a;
}
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe('NPC pace through physical simulation', () => {
  it.each(['ally', 'worker', 'medic', 'enemy'] as const)(
    '%s follows an existing unobstructed route at 4–5 m/s', role => {
      // Separate worlds prevent the enemy fixture from making a worker halt.
      // S12 phase 0 has no automatic advancement or combat orders without E.
      const s = new Simulation('epilogue', [flat]);
      try {
        const start: Vec3 = [-350, 0, 50], goal: Vec3 = [-300, 0, 50];
        const a = subject(s, role, start, goal), seconds = 3;
        advance(s, seconds);
        expect(s.mission.phase).toBe(0); expect(s.mission.failed).toBe(false);
        expect(a.goals).toHaveLength(1);
        regularSpeed(a.position[0] - start[0], seconds, role);
        expect(Math.abs(a.position[2] - start[2])).toBeLessThan(0.02);
        console.info('NPC_PACE route', JSON.stringify({ role, seconds, metres: distance(start, a.position) }));
      } finally { s.dispose(); }
    },
  );

  it('walk cannot keep up with a regular NPC while sprint overtakes it over the same world time', () => {
    const measurements: Array<{ sprint: boolean; player: number; npc: number }> = [];
    for (const sprint of [false, true]) {
      const s = new Simulation('epilogue', [flat]);
      try {
        const zheng = actor(s, 'zheng'), startNpc = copy(zheng.position), startPlayer = copy(s.player.position);
        s.route(zheng, [[-330, 0, startNpc[2]]]);
        advance(s, 3, { yaw: -Math.PI / 2, forward: 1, sprint });
        const player = s.player.position[0] - startPlayer[0], npc = zheng.position[0] - startNpc[0];
        regularSpeed(npc, 3, 'parallel Zheng route');
        // Ground contact slightly reduces the nominal 6.3 sprint. The useful
        // promise is actual overtaking over equal world time, checked below.
        expect(player / 3).toBeGreaterThan(sprint ? 6.0 : 2.0);
        expect(player / 3).toBeLessThan(sprint ? 6.4 : 2.2);
        if (sprint) expect(player).toBeGreaterThan(npc + 3);
        else expect(npc).toBeGreaterThan(player + 4);
        measurements.push({ sprint, player, npc });
      } finally { s.dispose(); }
    }
    console.info('NPC_PACE player-comparison', JSON.stringify({ seconds: 3, measurements }));
  });

  it.each([
    { role: 'enemy' as const, tolerance: 0.86, label: 'ordinary arrival' },
    { role: 'ally' as const, tolerance: 0.012, label: 'precise fractional dock' },
  ])('$label does not overshoot, reverse or jitter after reaching its stop', ({ role, tolerance, label }) => {
    const s = new Simulation('epilogue', [flat]);
    try {
      const start: Vec3 = [-350, 0, 50], goal: Vec3 = [-345.73, 0, 50];
      const a = subject(s, role, start, goal);
      let previous = copy(a.position), maxStep = 0, arrived = -1;
      for (let frame = 0; frame < 3 / dt; frame++) {
        tick(s); maxStep = Math.max(maxStep, distance(previous, a.position));
        expect(a.position[0], label).toBeGreaterThanOrEqual(previous[0] - 0.002);
        expect(a.position[0], label).toBeLessThanOrEqual(goal[0] + 0.002);
        expect(Math.abs(a.position[2] - goal[2]), label).toBeLessThan(0.02);
        if (!a.goals.length && arrived < 0) arrived = (frame + 1) * dt;
        previous = copy(a.position);
      }
      expect(arrived).toBeGreaterThan(0); expect(arrived).toBeLessThan(1.5);
      expect(a.goals).toEqual([]); expect(distance(a.position, goal)).toBeLessThan(tolerance);
      expect(maxStep).toBeLessThanOrEqual(5 * dt + 0.002);
      const stopped = copy(a.position), stoppedWalk = a.walk;
      advance(s, 1);
      expect(distance(stopped, a.position)).toBeLessThan(0.002);
      expect(Math.abs(a.walk - stoppedWalk)).toBeLessThan(0.01);
    } finally { s.dispose(); }
  });

  it('a full ordinary snapshot restores the active route and preserves the faster physical pace', () => {
    const s = new Simulation('epilogue', [flat]); let restored: Simulation | undefined;
    try {
      const zheng = actor(s, 'zheng'); s.route(zheng, [[-330, 0, zheng.position[2]]]);
      advance(s, 1);
      const snapshot = s.snapshot(), store = new SaveStore(new Memory());
      expect(store.save('campaign', snapshot, { chapter: 'campaign', stage: 'S12', elapsedBefore: 2700 })).toEqual({ ok: true });
      const loaded = store.load('campaign'); expect(loaded.warning).toBeUndefined(); expect(loaded.save!.snapshot).toEqual(snapshot);
      restored = new Simulation('epilogue', [flat], loaded.save!.snapshot);
      expect(restored.snapshot()).toEqual(snapshot);
      const startNatural = copy(zheng.position), restoredZheng = actor(restored, 'zheng'), startRestored = copy(restoredZheng.position);
      advance(s, 3); advance(restored, 3);
      regularSpeed(distance(startNatural, zheng.position), 3, 'uninterrupted route');
      regularSpeed(distance(startRestored, restoredZheng.position), 3, 'restored route');
      expect(distance(zheng.position, restoredZheng.position)).toBeLessThan(0.01);
      expect(restoredZheng.goals).toEqual(zheng.goals);
      expect(restored.mission.facts).toEqual(s.mission.facts);
    } finally { restored?.dispose(); s.dispose(); }
  });

  it('both teams use the new pace in actual tactical bounds, including the Simulation speed wiring', () => {
    const s = new Simulation('northgate', [arenaFloor]);
    const samples = { ally: [] as number[], enemy: [] as number[] };
    try {
      // Normal northgate actors, no authored cover: CombatTactics chooses real
      // lateral bounds. This does not pass a speed value directly to tactics.
      for (let frame = 0; frame < 5 / dt && !s.mission.failed; frame++) {
        const before = new Map(s.actors.map(a => [a.id, copy(a.position)])); tick(s);
        for (const a of s.actors) if ((a.role === 'ally' || a.role === 'enemy') && a.combat?.moving && before.has(a.id)) {
          const speed = distance(before.get(a.id)!, a.position) / dt;
          if (speed > 0.01) samples[a.role].push(speed);
        }
      }
      for (const role of ['ally', 'enemy'] as const) {
        const speeds = samples[role].sort((a, b) => a - b);
        expect(speeds.length, `${role} must actually move tactically`).toBeGreaterThan(20);
        // Short final steps are expected; the median moving step exposes the
        // commanded pace while the maximum catches overshoot or teleporting.
        regularSpeed(speeds[Math.floor(speeds.length / 2)], 1, `${role} median moving speed`);
        expect(speeds.at(-1)).toBeLessThanOrEqual(5.02);
      }
      console.info('NPC_PACE tactics', JSON.stringify(Object.fromEntries(Object.entries(samples).map(([role, speeds]) =>
        [role, { movingFrames: speeds.length, median: speeds[Math.floor(speeds.length / 2)], maximum: speeds.at(-1) }]))));
    } finally { s.dispose(); }
  });

  it('a real wall stops gait accumulation even while a stale route still requests movement', () => {
    const wall: SolidSpec = { id: 'pace-blocking-wall', position: [-347.5, 1.5, 50], size: [0.2, 3, 6] };
    const s = new Simulation('epilogue', [flat, wall]);
    try {
      const a = subject(s, 'ally', [-350, 0, 50], [-340, 0, 50]);
      // Fault fixture: a previously planned straight path now meets a wall.
      // Keep the cached path; Rapier must reject travel and the gait must use
      // measured motion, not commanded speed. No body position is overwritten.
      a.path = [[-340, 0, 50]];
      const initialWalk = a.walk; advance(s, 2);
      expect(a.position[0]).toBeGreaterThan(-348.1); expect(a.position[0]).toBeLessThan(-347.8);
      expect(a.goals).toHaveLength(1); expect(a.walk).toBeGreaterThan(initialWalk);
      const stopped = copy(a.position), stoppedWalk = a.walk; advance(s, 0.5);
      expect(distance(stopped, a.position)).toBeLessThan(0.002);
      expect(Math.abs(a.walk - stoppedWalk), 'blocked actor must not keep running in place').toBeLessThan(0.01);
    } finally { s.dispose(); }
  });

  it('a full-size cart sustains its travel pace on a single long straight route', () => {
    const s = new Simulation('epilogue', [flat]);
    try {
      // Use the populated supply cart and its real cuboid controller. This
      // deliberately straight cached leg isolates travel from grid turns,
      // short waypoints and convoy queuing without changing the body's pose.
      const cart = actor(s, 'supply-cart'), start = copy(cart.position);
      const goal: Vec3 = [start[0] - 50, start[1], start[2]];
      s.route(cart, [goal]); cart.path = [copy(goal)];
      const steps: number[] = [], seconds = 3;
      for (let frame = 0; frame < seconds / dt; frame++) {
        const before = copy(cart.position); tick(s); steps.push(distance(before, cart.position));
        expect(cart.position[0]).toBeLessThanOrEqual(before[0] + 0.002);
      }
      const stats = movementStats(steps);
      console.info('NPC_PACE straight-cart', JSON.stringify({ seconds, ...stats }));
      convoyMovingSpeed(stats.median, 'long straight cart');
      expect(stats.movingFrames).toBeGreaterThan(steps.length * 0.95);
      expect(stats.average).toBeGreaterThan(3.95); expect(stats.maximum).toBeLessThanOrEqual(5.02);
      expect(start[0] - cart.position[0]).toBeGreaterThan(seconds * 3.95);
      expect(Math.abs(start[2] - cart.position[2])).toBeLessThan(0.02);
      expect(cart.goals).toHaveLength(1); expect(s.mission.phase).toBe(0); expect(s.mission.failed).toBe(false);
    } finally { s.dispose(); }
  });

  it.each(['transfer', 'escort'] as const)(
    '%s automatic patient carts and their actual accompanying people share the 4–5 m/s transport pace', scenario => {
      const env = scenario === 'transfer' ? buildEnvironment('transfer') : undefined;
      const s = new Simulation(scenario, env?.solids ?? [flat]);
      try {
        let ids: string[], activePhase: number;
        if (scenario === 'transfer') {
          // This is the real floor, gate and whole S06 transport route. Reach
          // the control box with public input, open it, then release the latch.
          expect(s.physics.trace([-42, 1, 22], [-42, 1, 26], '', true)?.id).toBe('solid:transfer-shutter');
          for (let frame = 0; frame < 4 / dt && distance(s.player.position, T.panel) > 1; frame++) {
            const yaw = Math.atan2(-(T.panel[0] - s.player.position[0]), -(T.panel[2] - s.player.position[2]));
            tick(s, { yaw, forward: 1, sprint: true });
          }
          expect(distance(s.player.position, T.panel)).toBeLessThan(1.1);
          tick(s, { interact: true }); tick(s, { interact: true });
          expect(s.has('transfer-gate-open')).toBe(true);
          env!.setFacts?.(s.mission.facts);
          expect(s.physics.trace([-42, 1, 22], [-42, 1, 26], '', true)).toBeNull();
          ids = ['cart-0', 'cart-1', 'cart-2', 'xu']; activePhase = 2;
        } else {
          // Isolated active-convoy fixture, not a completed S08 playthrough.
          // Keep real scenario/IDs/roles and place the first moving leg in its
          // actual combat phase; choose unobstructed parallel paths to measure
          // travel without reproducing all prior encounters and dialogues.
          s.phase(6, '速度回归：第一段车队同行', 'combat');
          ids = ['cart-0', 'cart-1', 'walker-0', 'walker-1', 'meng', 'relief-0', 'relief-1']; activePhase = 6;
          for (const id of ids) {
            const a = actor(s, id); s.route(a, [[-70, 0, a.position[2]]]);
          }
        }
        expect(s.mission.phase).toBe(activePhase);
        for (const id of ids) expect(actor(s, id).goals.length, `${scenario}/${id} needs an active route`).toBeGreaterThan(0);
        const steps = new Map(ids.map(id => [id, [] as number[]]));
        const transit = new Map(ids.map(id => [id, {
          steps: [] as number[], arrival: -1, stoppedFrames: 0, queuedStopFrames: 0, stopRun: 0, longestStop: 0,
        }]));
        const seconds = 2, started = s.mission.elapsed;
        let minimumCartGap = Infinity;
        const sampleFrame = (initialWindow: boolean) => {
          const before = new Map(ids.map(id => [id, copy(actor(s, id).position)]));
          const active = new Set(ids.filter(id => actor(s, id).goals.length));
          tick(s); env?.setFacts?.(s.mission.facts);
          for (const id of ids) {
            const a = actor(s, id), step = distance(before.get(id)!, a.position);
            if (initialWindow) steps.get(id)!.push(step);
            if (scenario === 'transfer') {
              const stats = transit.get(id)!;
              if (active.has(id)) {
                stats.steps.push(step);
                if (step <= 0.001) {
                  stats.stoppedFrames++; stats.stopRun++; stats.longestStop = Math.max(stats.longestStop, stats.stopRun);
                  // Observation of the line ahead, not a recreation of the
                  // controller: a preceding bed within 3.8 m explains queuing.
                  const index = ids.indexOf(id);
                  if (index > 0 && a.role === 'cart' && before.get(ids[index - 1])![2] - before.get(id)![2] < 3.8) stats.queuedStopFrames++;
                } else stats.stopRun = 0;
              }
              if (a.safe && stats.arrival < 0) stats.arrival = s.mission.elapsed - started;
            }
          }
          if (scenario === 'transfer') for (let i = 1; i < 3; i++) {
            minimumCartGap = Math.min(minimumCartGap, actor(s, `cart-${i - 1}`).position[2] - actor(s, `cart-${i}`).position[2]);
          }
        };
        for (let frame = 0; frame < seconds / dt; frame++) sampleFrame(true);
        expect(s.mission.phase).toBe(activePhase); expect(s.mission.failed).toBe(false);
        const speeds = ids.map(id => ({ id, ...movementStats(steps.get(id)!) }));
        console.info('NPC_PACE active-transport', JSON.stringify({ scenario, phase: activePhase, seconds, speeds }));
        for (const measured of speeds) {
          // Different paths have different short steps, turns and queues.
          // Compare real moving pace. S06 proves throughput with the complete
          // real-gate route below, instead of a uniform two-second average.
          convoyMovingSpeed(measured.median, `${scenario}/${measured.id}`);
          if (scenario === 'escort') {
            expect(measured.average, `${scenario}/${measured.id}: whole-window speed`).toBeGreaterThan(3.0);
            expect(measured.movingFrames).toBeGreaterThan(steps.get(measured.id)!.length * 0.6);
          } else expect(measured.movingFrames, `${measured.id}: enough physical samples`).toBeGreaterThan(20);
          expect(measured.maximum).toBeLessThanOrEqual(5.02);
          expect(Math.abs(measured.median - speeds[0].median), 'companions must share the first cart’s moving pace').toBeLessThan(0.15);
        }
        if (scenario === 'transfer') {
          // Continue from that same public-input opening, without assigning
          // routes, injecting facts, skipping a phase or moving a body by hand.
          while (s.mission.phase === 2 && !s.mission.failed && s.mission.elapsed - started < 30) sampleFrame(false);
          const transferSeconds = s.mission.elapsed - started;
          const arrivals = ids.map((id, i) => {
            const a = actor(s, id), stats = transit.get(id)!, target = i < 3 ? T.cartSafe[i] : T.xuSafe;
            return { id, arrivalSeconds: stats.arrival, position: a.position, target, remaining: distance(a.position, target),
              ...movementStats(stats.steps), stoppedFrames: stats.stoppedFrames, queuedStopFrames: stats.queuedStopFrames,
              longestStopSeconds: stats.longestStop * dt };
          });
          console.info('NPC_PACE transfer-throughput', JSON.stringify({ transferSeconds, phase: s.mission.phase, minimumCartGap, arrivals }));
          expect(s.mission.failed).toBe(false); expect(s.mission.phase).toBe(3);
          expect(s.has('transfer-patients-through')).toBe(true); expect(s.has('xu-passed-transfer')).toBe(true);
          // Each bed travels about 24 m: the former 1.25 m/s needs at least
          // 19 s even without waiting. This budget includes the real gate,
          // physical stops, the final slots and Xu's longer accompanying path.
          expect(transferSeconds, 'whole convoy must improve on the old transport time').toBeLessThan(15);
          expect(minimumCartGap, '2.4 m beds must retain order and not overlap nose-to-tail').toBeGreaterThan(2.4);
          for (const reached of arrivals) {
            expect(reached.arrivalSeconds, reached.id).toBeGreaterThan(0);
            expect(reached.remaining, `${reached.id}: physical destination`).toBeLessThan(1.2);
            expect(actor(s, reached.id).goals).toEqual([]); expect(actor(s, reached.id).safe).toBe(true);
          }
        }
      } finally { s.dispose(); env?.dispose(); }
    },
  );

  it('S01 keeps the father at the short-guide pace and the child at 1.55 m/s even with sprint input', () => {
    const floor: SolidSpec = { id: 'pace-childhood-floor', position: [-7, -0.5, 0], size: [100, 1, 80] };
    const s = new Simulation('childhood', [floor]);
    try {
      // The fresh child spawns within reach of the lunch. E starts the actual
      // father-to-mattress route; no phase, actor or position is injected.
      tick(s, { interact: true }); expect(s.mission.phase).toBe(1); expect(s.has('lunch-packed')).toBe(true);
      const father = actor(s, 'father'); expect(father.goals.length).toBeGreaterThan(0);
      let fatherMetres = 0, childMetres = 0;
      const seconds = 2;
      for (let frame = 0; frame < seconds / dt; frame++) {
        const oldFather = copy(father.position), oldChild = copy(s.player.position);
        tick(s, { yaw: Math.PI / 2, forward: 1, sprint: true });
        fatherMetres += distance(oldFather, father.position); childMetres += distance(oldChild, s.player.position);
      }
      expect(s.mission.phase).toBe(1); expect(father.goals.length).toBeGreaterThan(0);
      expect(fatherMetres / seconds).toBeGreaterThan(2.05); expect(fatherMetres / seconds).toBeLessThan(2.15);
      expect(childMetres / seconds).toBeGreaterThan(1.52); expect(childMetres / seconds).toBeLessThan(1.58);
      expect(fatherMetres).toBeGreaterThan(childMetres + 0.8);
      expect(s.player.height).toBe(1.1); expect(s.mission.failed).toBe(false);
      console.info('NPC_PACE childhood-guide', JSON.stringify({ seconds, fatherMetres, childMetres, phase: s.mission.phase }));
    } finally { s.dispose(); }
  });

  it('S12 completes one natural route and Zheng physically reaches the reception dock at the faster pace', () => {
    const env = buildEnvironment('epilogue'), s = new Simulation('epilogue', env.solids);
    const phases = [0], secondsLimit = 240;
    let path: Vec3[] = [], key = '', frames = 0, departure = -1, arrival = -1, traveled = 0;
    try {
      while (!s.mission.complete && !s.mission.failed && frames < secondsLimit / dt) {
        const phase = s.mission.phase, goal = s.objective.point, zheng = actor(s, 'zheng'), before = copy(zheng.position);
        const newKey = `${phase}:${goal[0]}:${goal[2]}`;
        if (key !== newKey) { key = newKey; path = []; }
        if (distance(s.player.position, goal) < 1.4) path = [copy(goal)];
        else if (!path.length) path = s.navigation.path(s.player.position, goal);
        while (path.length && distance(s.player.position, path[0]) < 0.25) path.shift();
        const next = path[0] ?? goal, stop = phase >= 6 ? 0.35 : 0.65;
        const moving = s.mission.control !== 'staged' && distance(s.player.position, goal) > stop;
        const yaw = moving ? Math.atan2(-(next[0] - s.player.position[0]), -(next[2] - s.player.position[2])) : s.player.yaw;
        tick(s, { yaw, forward: moving ? 1 : 0, sprint: s.mission.control !== 'cooperative',
          interact: frames % 12 === 0 && [0, 2, 4, 6].includes(phase) });
        frames++; env.setFacts?.(s.mission.facts);
        traveled += distance(before, zheng.position);
        expect(distance(before, zheng.position)).toBeLessThanOrEqual(5 * dt + 0.003);
        if (departure < 0 && s.has('medical-needs-carried')) departure = s.mission.elapsed;
        if (departure >= 0 && arrival < 0 && !zheng.goals.length && distance(zheng.position, E.shoreVia.at(-1)!) < 0.12) arrival = s.mission.elapsed;
        if (phase !== s.mission.phase) { phases.push(s.mission.phase); path = []; }
      }
      expect(s.mission.failed).toBe(false); expect(s.mission.complete).toBe(true);
      expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(departure).toBeGreaterThan(0); expect(arrival).toBeGreaterThan(departure);
      expect(arrival - departure, 'the shore route must not retain the old 2.1 m/s transit').toBeLessThan(130);
      expect(traveled).toBeGreaterThan(390); expect(actor(s, 'zheng').goals).toEqual([]);
      expect(distance(actor(s, 'zheng').position, E.shoreVia.at(-1)!)).toBeLessThan(0.12);
      for (const id of ['worker-0', 'worker-1', 'worker-2', 'supply-cart']) {
        expect(actor(s, id).safe).toBe(true); expect(actor(s, id).goals).toEqual([]);
      }
      expect(s.has('first-workers-received')).toBe(true); expect(s.has('first-medical-supplies-received')).toBe(true);
      const store = new SaveStore(new Memory()); expect(store.save('epilogue', s.snapshot())).toEqual({ ok: true });
      console.info('NPC_PACE S12 natural', JSON.stringify({ seconds: s.mission.elapsed, departure, arrival,
        shoreTransitSeconds: arrival - departure, zhengMetres: traveled, phases, zheng: actor(s, 'zheng').position }));
    } finally { s.dispose(); env.dispose(); }
  }, 90_000);
});
