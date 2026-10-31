import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { HISTORY as H } from '../src/content/history-layout';
import { OpeningCrowdPlan, openingCrowdPlan } from '../src/content/OpeningCrowd';
import { OPENING_TIMELINE, openingCrowdHitTime } from '../src/content/opening-timeline';
import { OPENING_JAM_VERSION, openingHallGaze, openingShaoPosition } from '../src/content/OpeningStaging';
import { emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { openingView } from '../src/presentation/OpeningView';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics, Physics } from '../src/runtime/Physics';

const T = OPENING_TIMELINE.mainhall;
beforeAll(initializePhysics);
const tick = (s: Simulation, skip = false) => s.step({ ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, skip });
const person = (s: Simulation, id: string) => s.actors.find(actor => actor.id === id)!;
function advance(s: Simulation, time: number, observe?: () => void): void {
  for (let i = 0; i < (T.finish + 1) * 60 && !s.mission.complete && s.mission.phaseTime < time; i++) { tick(s); observe?.(); }
}
function persisted(snapshot: Snapshot): Snapshot {
  const data = new Map<string, string>();
  const memory: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
  const store = new SaveStore(memory); expect(store.save('mainhall', snapshot)).toEqual({ ok: true });
  const loaded = store.load('mainhall'); expect(loaded.warning).toBeUndefined(); return loaded.save!.snapshot;
}
function boundary(solids: SolidSpec[]): Simulation {
  const seed = new Simulation('mainhall', solids), saved = seed.snapshot(); seed.dispose();
  Object.assign(saved.mission, { phase: 3, phaseTime: 0, elapsed: 60, nextSpawn: 1000, control: 'combat' });
  saved.mission.facts.push('history-gate-open', 'zhou-trusts-zhao', 'hall-front-secured', 'hall-side-secured',
    'father-rifle-collected', 'father-charged-defense', 'father-cover-shot');
  saved.actors = saved.actors.filter(actor => actor.role !== 'enemy');
  saved.actors.filter(actor => actor.role === 'worker').forEach((actor, i) => {
    actor.position = [...H.civilianSafe[i]]; actor.safe = true; actor.released = true;
  });
  for (const [id, position] of [['father', H.fatherFall], ['evacuator', H.womanEnd], ['daughter', H.childSafe],
    ['young-lu', [H.womanEnd[0] + 0.9, -2.4, H.womanEnd[2] + 1]]] as Array<[string, Vec3]>) {
    saved.actors.find(actor => actor.id === id)!.position = [...position];
  }
  const s = new Simulation('mainhall', solids, saved); tick(s); expect(s.mission.phase).toBe(4); return s;
}
function terminal(s: Simulation) {
  return { facts: [...s.mission.facts].sort(), complete: s.mission.complete, failed: s.mission.failed,
    player: { position: s.player.position, yaw: s.player.yaw, pitch: s.player.pitch, height: s.player.height, health: s.player.health },
    actors: s.actors.map(actor => ({ id: actor.id, position: actor.role === 'worker' ? undefined : actor.position,
      down: actor.down, safe: actor.safe, health: actor.health })) };
}

describe('late hall crowd jams at the maintenance exit', () => {
  it('converges through actual hall clearances and keeps separate bodies throughout the rush and push', () => {
    const env = buildEnvironment('mainhall'), physics = new Physics(env.solids);
    physics.applyFacts(['history-gate-open']); physics.step();
    try {
      const started = performance.now(), plan = new OpeningCrowdPlan(env.solids), bakeMilliseconds = performance.now() - started;
      let closest = Infinity, maxSpeed = 0;
      const blocked: Array<{ time: number; index: number; point: number[] }> = [];
      for (let frame = 0; frame <= Math.ceil(T.massacreEnd * 60); frame++) {
        const t = frame / 60, states = H.crowd.map((_, i) => plan.sample(i, t));
        for (const [i, state] of states.entries()) {
          if (frame % 6 === 0 && !physics.canOccupy(state.position) && blocked.length < 5) blocked.push({ time: t, index: i, point: state.position });
          maxSpeed = Math.max(maxSpeed, state.speed);
          for (let j = i + 1; j < states.length; j++) closest = Math.min(closest,
            Math.hypot(state.position[0] - states[j].position[0], state.position[2] - states[j].position[2]));
        }
      }
      const breach = H.crowd.map((_, i) => plan.sample(i, T.breach));
      if (process.env.OPENING_JAM_METRICS) console.log(JSON.stringify({ closest, maxSpeed, bakeMilliseconds, blocked,
        breach: breach.map((state, i) => ({ i, p: state.position, gap: Math.hypot(state.position[0] + 22, state.position[2] - 6) })) }));
      expect(blocked).toEqual([]);
      expect(closest).toBeGreaterThanOrEqual(0.64); expect(maxSpeed).toBeLessThan(5.8);
      expect(breach.every(state => state.position[0] > H.gateX + 0.4 && state.position[0] < H.gateX + 6)).toBe(true);
      expect(breach.every(state => state.position[2] > 3.3 && state.position[2] < 8.7)).toBe(true);
      expect(breach.filter(state => state.position[0] < H.gateX + 1.5)).toHaveLength(4);
      expect(new Set(breach.map(state => state.position[2].toFixed(2))).size).toBeGreaterThan(27);
      const cached = openingCrowdPlan(env.solids);
      expect(openingCrowdPlan(env.solids)).toBe(cached);
      expect(openingCrowdPlan(structuredClone(env.solids))).toBe(cached);
      H.crowd.forEach((_, i) => expect(plan.sample(i, T.finish).position).toEqual(plan.sample(i, openingCrowdHitTime(i)).position));
    } finally { physics.dispose(); env.dispose(); }
  }, 15000);

  it('keeps the front blocked while rear arrivals visibly press, sidestep and look back, then stop', () => {
    const env = buildEnvironment('mainhall');
    try {
      const plan = openingCrowdPlan(env.solids), pressed = new Set<number>(), side = new Set<number>(), turned = new Set<number>();
      for (let time = 12; time < T.massacreEnd; time += 1 / 20) for (let i = 0; i < H.crowd.length; i++) {
        if (time >= openingCrowdHitTime(i)) continue;
        const state = plan.sample(i, time), later = plan.sample(i, time + 0.1);
        if (later.position[0] < state.position[0] - 0.008) pressed.add(i);
        if (Math.abs(later.position[2] - state.position[2]) > 0.008) side.add(i);
        if (Math.abs(state.yaw + Math.PI / 2) > 0.35) turned.add(i);
        expect(state.position[0]).toBeGreaterThan(H.gateX + 0.5);
      }
      expect(pressed.size).toBeGreaterThanOrEqual(8); expect(side.size).toBeGreaterThanOrEqual(8); expect(turned.size).toBeGreaterThanOrEqual(20);
      expect(plan.sample(31, openingCrowdHitTime(31) - 0.2).speed).toBeLessThan(0.03);
    } finally { env.dispose(); }
  });

  it('shows the doorway, first impacts, recognition and both execution participants in desktop and portrait views', () => {
    const env = buildEnvironment('mainhall'), physics = new Physics(env.solids);
    physics.applyFacts(['history-gate-open']); physics.step();
    try {
      const plan = openingCrowdPlan(env.solids), eye: Vec3 = [H.rubblePlayer[0], 0.51, H.rubblePlayer[2]];
      expect(physics.canOccupy(H.rubblePlayer)).toBe(true); expect(physics.canOccupy(H.zhaoCaptured)).toBe(true);
      expect(Math.hypot(H.zhaoCaptured[0] - eye[0], H.zhaoCaptured[2] - eye[2])).toBeLessThan(9);
      for (const aspect of [16 / 9, 9 / 16]) {
        const camera = new PerspectiveCamera(75, aspect, 0.045, 1000); camera.position.fromArray(eye);
        const visible = (point: Vec3, time: number) => {
          const look = openingHallGaze(time); camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
          const projected = new Vector3(...point).project(camera);
          return projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95;
        };
        for (const time of [T.breach, T.crowdAttack]) {
          for (let i = 0; i < H.crowd.length; i++) {
            const point = plan.sample(i, time).position; point[1] = 1.25;
            expect(visible(point, time), `crowd ${i}, aspect ${aspect}, t ${time}`).toBe(true);
            expect(physics.trace(eye, point, '', true)).toBeNull();
          }
          expect(visible([H.gateX, 1.3, 6], time)).toBe(true);
        }
        for (const time of [T.recognition, T.execution]) {
          const shao = openingShaoPosition(time), commander: Vec3 = [H.zhaoCaptured[0], 1, H.zhaoCaptured[2]];
          shao[1] = 1.5;
          expect(visible(shao, time), `officer aspect ${aspect}, t ${time}`).toBe(true);
          expect(visible(commander, time), `commander aspect ${aspect}, t ${time}`).toBe(true);
          expect(physics.trace(eye, shao, '', true)).toBeNull(); expect(physics.trace(eye, commander, '', true)).toBeNull();
        }
      }
      let fastest = 0;
      for (let frame = 0; frame < T.finish * 60; frame++) {
        const a = openingHallGaze(frame / 60), b = openingHallGaze((frame + 1) / 60);
        fastest = Math.max(fastest, Math.abs(b.yaw - a.yaw) * 60);
      }
      expect(fastest).toBeLessThan(1.25);
      const f = { scenario: 'mainhall' as const, phase: 4, phaseTime: T.collapse + 0.4, lowMotion: true };
      expect(openingView(f, ['history-timeline-v2', 'history-collapse']).shake).toBe(0);
    } finally { physics.dispose(); env.dispose(); }
  });

  it('runs the true Simulation, restores mid-jam without replaying events, and shares exact normal/skip corpse positions', () => {
    const env = buildEnvironment('mainhall'), natural = boundary(env.solids);
    let restored: Simulation | undefined, skipped: Simulation | undefined;
    try {
      tick(natural); // The existing tableau settles the already-safe family.
      const protectedPeople = natural.actors.filter(actor => actor.role === 'worker' || actor.id.startsWith('evac-crowd-')
        || ['evacuator', 'daughter', 'young-lu'].includes(actor.id));
      const protectedState = structuredClone(protectedPeople.map(actor => ({ id: actor.id, position: actor.position, safe: actor.safe, down: actor.down })));
      const movingIds = ['zhao', 'shao', 'hall-invader-0', 'hall-invader-1'];
      const previous = movingIds.map(id => [...person(natural, id).position] as Vec3);
      const checkRoutes = () => movingIds.forEach((id, i) => {
        const actor = person(natural, id);
        expect(natural.physics.canOccupy(actor.position), `${id} at ${natural.mission.phaseTime}`).toBe(true);
        expect(Math.hypot(...actor.position.map((value, axis) => value - previous[i][axis])) * 60, id).toBeLessThan(6.2);
        previous[i] = [...actor.position];
      });
      advance(natural, T.breach + 0.1, checkRoutes);
      expect(natural.has(OPENING_JAM_VERSION)).toBe(true); expect(natural.safeCount).toBe(6);
      expect(H.crowd.every((_, i) => person(natural, `late-civilian-${i}`).position[0] < -16)).toBe(true);
      const saved = persisted(natural.snapshot());
      restored = new Simulation('mainhall', env.solids, saved); skipped = new Simulation('mainhall', env.solids, saved);
      expect(restored.snapshot()).toEqual(saved);
      tick(natural); tick(restored); expect(restored.snapshot()).toEqual(natural.snapshot());
      expect(restored.events.some(event => event.type === 'shot')).toBe(false);
      tick(skipped, true);
      movingIds.forEach((id, i) => { previous[i] = [...person(natural, id).position]; });
      advance(natural, T.finish + 0.1, checkRoutes); advance(restored, T.finish + 0.1);
      expect(terminal(skipped)).toEqual(terminal(natural)); expect(terminal(restored)).toEqual(terminal(natural));
      for (const expected of protectedState) for (const world of [natural, restored, skipped]) {
        const actual = person(world, expected.id);
        expect(actual.down).toBe(false); expect(actual.safe).toBe(true);
        // From the boundary, resting capsules first acquire the controller's
        // 15mm ground offset. Horizontal travel remains below 1mm; the ending
        // across normal/restore/skip agrees within 1mm in all three axes.
        expect(Math.hypot(actual.position[0] - expected.position[0], actual.position[2] - expected.position[2])).toBeLessThan(0.001);
        expect(Math.abs(actual.position[1] - expected.position[1])).toBeLessThan(0.02);
        expect(Math.hypot(...actual.position.map((value, axis) => value - person(natural, expected.id).position[axis]))).toBeLessThan(0.001);
      }
      expect(natural.mission.facts.filter(fact => /^history-crowd-victim-\d+$/.test(fact))).toHaveLength(32);
      expect(natural.actors.filter(actor => actor.down)).toHaveLength(36); // 32 late arrivals, Zhao, father, two defenders.
    } finally { natural.dispose(); restored?.dispose(); skipped?.dispose(); env.dispose(); }
  }, 15000);

  it('preserves old corpse coordinates and terminal poses without replaying their shots', () => {
    const env = buildEnvironment('mainhall'), seed = boundary(env.solids), old = seed.snapshot(); seed.dispose();
    old.mission.phaseTime = 0; old.mission.facts = old.mission.facts.filter(fact => fact !== OPENING_JAM_VERSION);
    old.mission.facts.push('history-collapse', 'zhao-captured', 'zhao-executed', 'history-crowd-victim-0');
    old.player.height = 0.65; old.player.crouched = true;
    for (const id of ['zhao', 'late-civilian-0']) {
      const actor = old.actors.find(actor => actor.id === id)!; actor.down = true; actor.health = 0; actor.position = [4, 0, id === 'zhao' ? 4 : 11];
    }
    const s = new Simulation('mainhall', env.solids, persisted(old));
    try {
      tick(s);
      expect(person(s, 'zhao').position).toEqual([4, 0, 4]); expect(person(s, 'late-civilian-0').position).toEqual([4, 0, 11]);
      expect(s.events.filter(event => event.type === 'shot')).toEqual([]);
      const view = openingView({ scenario: 'mainhall', phase: s.mission.phase, phaseTime: s.mission.phaseTime, lowMotion: false }, s.mission.facts);
      expect(view.commanderFallProgress).toBe(1); expect(s.has(OPENING_JAM_VERSION)).toBe(false);
      tick(s, true); expect(person(s, 'zhao').position).toEqual([4, 0, 4]);
    } finally { s.dispose(); env.dispose(); }
  });
});
