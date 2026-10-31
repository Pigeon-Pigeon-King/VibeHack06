import { beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { HISTORY as H } from '../src/content/history-layout';
import { OPENING_TIMELINE as T, openingCrowdHitTime, openingHallTime } from '../src/content/opening-timeline';
import { emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);

// Constructed phase boundaries isolate the ordered performance and save/restore
// contract. opening-paths exercises the preceding actions in the actual level.
const solids: SolidSpec[] = [
  { id: 'hall-floor', position: [5, -0.25, 0], size: [54, 0.5, 60] },
  { id: 'safe-floor', position: [-37, -2.65, 0], size: [30, 0.5, 60] },
];
const dt = 1 / 60;
const person = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
function tick(s: Simulation, input: Partial<typeof emptyIntent> = {}): void {
  s.step({ ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...input });
}
function until(s: Simulation, time: number): void {
  for (let n = 0; n < 1800 && !s.mission.complete && s.mission.phaseTime < time; n++) tick(s);
}
function stagedBoundary(scenario: 'childhood' | 'mainhall'): Simulation {
  const seed = new Simulation(scenario, solids), saved = seed.snapshot(); seed.dispose();
  saved.mission.phase = 3; saved.mission.elapsed = 60; saved.mission.phaseTime = 0;
  saved.mission.nextSpawn = 1000; saved.mission.control = scenario === 'childhood' ? 'staged' : 'combat';
  saved.mission.facts = ['lunch-packed', 'mattress-cleared', 'history-gate-open'];
  const place = (id: string, position: Vec3) => {
    const a = saved.actors.find(a => a.id === id)!;
    a.position = [...position]; a.goals = []; a.path = [];
  };
  if (scenario === 'childhood') {
    place('father', H.gateOutside); saved.player.position = [...H.womanStart]; saved.player.yaw = -Math.PI / 2;
  } else {
    saved.player.position = [...H.rubblePlayer];
    saved.mission.facts.push('zhou-trusts-zhao', 'hall-front-secured', 'hall-side-secured',
      'father-rifle-collected', 'father-charged-defense', 'father-cover-shot');
    saved.actors.filter(a => a.role === 'worker').forEach((a, i) => {
      a.position = [H.childSafe[0] + i % 2, H.childSafe[1], H.childSafe[2] - 1 + Math.floor(i / 2)];
      a.safe = true; a.released = true;
    });
    place('evacuator', H.womanEnd); place('daughter', H.childSafe); place('young-lu', H.childSafe);
    place('father', H.fatherFall);
  }
  const s = new Simulation(scenario, solids, saved);
  if (scenario === 'mainhall') { tick(s); expect(s.mission.phase).toBe(4); }
  return s;
}
function terminal(s: Simulation) {
  const ids = ['father', 'evacuator', 'daughter', ...(s.scenario === 'mainhall' ? ['young-lu', 'zhao', 'shao', 'hall-invader-0', 'hall-invader-1'] : [])];
  return {
    phase: s.mission.phase, complete: s.mission.complete, failed: s.mission.failed,
    facts: [...s.mission.facts].sort(),
    player: { position: s.player.position, yaw: s.player.yaw, pitch: s.player.pitch, height: s.player.height, health: s.player.health },
    actors: ids.map(id => { const a = person(s, id); return { id, position: a.position, down: a.down, safe: a.safe, health: a.health }; }),
    defenders: [0, 1].map(i => person(s, `hall-defender-${i}`).down),
    crowd: H.crowd.map((_, i) => person(s, `late-civilian-${i}`).down),
    evacCrowd: H.evacCrowd.map((_, i) => {
      const a = person(s, `evac-crowd-${i}`);
      return { position: a.position, safe: a.safe, down: a.down, released: a.released };
    }),
  };
}
class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
function persisted(snapshot: Snapshot): Snapshot {
  const store = new SaveStore(new MemoryStorage());
  expect(store.save(snapshot.mission.scenario, snapshot)).toEqual({ ok: true });
  const result = store.load(snapshot.mission.scenario);
  expect(result.warning).toBeUndefined(); expect(result.save).toBeDefined();
  return result.save!.snapshot;
}

describe('opening chronology and perspective boundary', () => {
  it('shows defense, evacuation and losses before the child leaves; he never witnesses the later killings', () => {
    const s = stagedBoundary('childhood');
    const order = ['history-defense-active', 'history-evacuation-underway', 'history-defender-0-down',
      'history-heavy-losses', 'child-handed-over', 'father-charged-defense', 'child-out-of-sight'];
    const first = new Map<string, number>();
    const crowd = H.evacCrowd.map((_, i) => person(s, `evac-crowd-${i}`));
    let previous = crowd.map(a => [...a.position] as Vec3), closest = Infinity, largestStep = 0, nearby = 0;
    const crossed = new Set<string>(), departures = new Map<string, number>(), arrivals = new Map<string, number>();
    try {
      expect(H.crowd).toHaveLength(32); expect(crowd).toHaveLength(12);
      expect(crowd.every(a => a.role === 'civilian')).toBe(true); expect(s.workers).toHaveLength(0);
      expect(new Set(crowd.map(a => Math.round(a.yaw * 4))).size).toBeGreaterThanOrEqual(8);
      for (let n = 0; n < 1500 && !s.mission.complete; n++) {
        tick(s, { fire: true, yaw: -Math.PI / 2 });
        order.forEach(f => { if (s.has(f) && !first.has(f)) first.set(f, n * dt); });
        expect(person(s, 'father').down).toBe(false);
        expect(s.player.health).toBe(100); expect(s.player.height).toBe(1.1);
        expect(s.has('father-died') || s.has('history-bombardment') || s.has('history-collapse') || s.has('history-crowd-attacked')).toBe(false);
        expect(H.crowd.every((_, i) => !person(s, `late-civilian-${i}`).down)).toBe(true);
        const floor = Math.max(-2.4, Math.min(0, (s.player.position[0] - H.stairsStart[0]) * 0.3));
        expect(s.player.position[1]).toBeCloseTo(floor, 8);
        crowd.forEach((a, i) => {
          closest = Math.min(closest, Math.hypot(a.position[0] - s.player.position[0], a.position[2] - s.player.position[2]));
          largestStep = Math.max(largestStep, Math.hypot(...a.position.map((v, axis) => v - previous[i][axis])));
          if (a.position[0] < H.partitionX - 1 && a.position[1] < -1.8) crossed.add(a.id);
          if (a.released && !departures.has(a.id)) departures.set(a.id, s.mission.phaseTime);
          if (a.safe && !arrivals.has(a.id)) arrivals.set(a.id, s.mission.phaseTime);
        });
        previous = crowd.map(a => [...a.position] as Vec3);
        if (s.mission.phaseTime >= T.childhood.departure && s.mission.phaseTime < T.childhood.sightLost) {
          nearby = Math.max(nearby, crowd.filter(a => Math.hypot(a.position[0] - s.player.position[0], a.position[2] - s.player.position[2]) < 3).length);
        }
        if (s.has('child-out-of-sight')) {
          expect(s.player.position[0]).toBeLessThan(H.partitionX - 1);
          expect(s.player.position[1]).toBeLessThan(-1.8);
          expect(-Math.sin(s.player.yaw)).toBeLessThan(0); // Camera faces the escape corridor, west.
        }
      }
      expect(s.mission.complete).toBe(true); expect(first.size).toBe(order.length);
      order.slice(1).forEach((f, i) => expect(first.get(f)!).toBeGreaterThan(first.get(order[i])!));
      expect(first.get('child-out-of-sight')!).toBeGreaterThanOrEqual(T.childhood.sightLost - dt);
      expect(person(s, 'father').position).toEqual(H.fatherFall);
      expect(crossed.size).toBe(12); expect(closest).toBeGreaterThanOrEqual(0.9);
      expect(largestStep).toBeLessThan(0.25); expect(nearby).toBeGreaterThanOrEqual(3);
      expect(new Set(departures.values()).size).toBeGreaterThanOrEqual(10);
      expect(new Set(arrivals.values()).size).toBeGreaterThanOrEqual(8);
      expect(Math.max(...arrivals.values())).toBeLessThan(T.childhood.sightLost);
      expect(s.player.position).toEqual([H.womanEnd[0] + 0.9, H.womanEnd[1], H.womanEnd[2] + 1]);
      crowd.forEach((a, i) => { expect(a.position).toEqual(H.evacCrowdSafe[i]); expect(a.safe).toBe(true); });
    } finally { s.dispose(); }
  }, 15000);

  it('starts S02 phase 4 standing after the child and all six protected residents are behind the partition', () => {
    const s = stagedBoundary('mainhall');
    try {
      expect(s.has('history-timeline-v2')).toBe(true); expect(s.has('child-out-of-sight')).toBe(true);
      expect(s.has('history-partition-closed')).toBe(true); expect(s.safeCount).toBe(6);
      expect(s.workers).toHaveLength(6); expect(s.has('history-dense-crowd-v1')).toBe(true);
      expect(H.evacCrowd.every((_, i) => person(s, `evac-crowd-${i}`).safe)).toBe(true);
      expect(s.player.height).toBe(1.8); expect(s.player.crouched).toBe(false);
      expect(s.has('history-bombardment') || s.has('history-collapse') || s.has('zhou-pinned')).toBe(false);
      const restored = new Simulation('mainhall', solids, persisted(s.snapshot()));
      try { tick(restored); expect(restored.player.height).toBe(1.8); expect(restored.has('history-collapse')).toBe(false); }
      finally { restored.dispose(); }
    } finally { s.dispose(); }
  }, 15000);

  it('bombards, collapses, breaches and attacks the crowd before the defiant shout, execution and blackout', () => {
    const s = stagedBoundary('mainhall');
    const order = ['history-bombardment', 'history-collapse', 'history-enemy-breach', 'zhao-reaches-rifle',
      'history-crowd-attacked', 'zhao-captured', 'history-crowd-massacred', 'zhao-defiant-shout',
      'zhao-executed', 'zhou-unconscious', 'father-died'];
    const first = new Map<string, number>(), ammo = s.player.ammo;
    const crowd = H.crowd.map((_, i) => person(s, `late-civilian-${i}`)), falls = new Map<number, number>();
    let shots = 0, fledBeforeShots = false;
    try {
      expect(crowd).toHaveLength(32); expect(crowd.every(a => a.role === 'civilian')).toBe(true);
      const nearest = Math.min(...H.crowd.map(p => Math.hypot(p[0] - H.rubblePlayer[0], p[2] - H.rubblePlayer[2])));
      expect(nearest).toBeGreaterThanOrEqual(5); expect(nearest).toBeLessThanOrEqual(8);
      expect(H.crowd.every(p => Math.abs(p[2] - H.zhaoCaptured[2]) > 2)).toBe(true);
      for (let n = 0; n < 1800 && !s.mission.complete; n++) {
        tick(s, { fire: true, reload: true });
        order.forEach(f => { if (s.has(f) && !first.has(f)) first.set(f, n * dt); });
        shots += s.events.filter(e => e.type === 'shot' && e.enemy).length;
        crowd.forEach((a, i) => { if (a.down && !falls.has(i)) falls.set(i, s.mission.phaseTime); });
        if (s.mission.phaseTime > T.mainhall.breach && s.mission.phaseTime < T.mainhall.crowdAttack) {
          fledBeforeShots ||= crowd.some((a, i) => Math.hypot(a.position[0] - H.crowd[i][0], a.position[2] - H.crowd[i][2]) > 0.3);
        }
        expect(s.player.ammo).toBe(ammo); expect(s.safeCount).toBe(6);
        expect(s.workers.every(a => !a.down && a.safe)).toBe(true);
        expect(s.mission.failed).toBe(false);
        expect(s.player.height).toBe(s.has('history-collapse') ? 0.65 : 1.8);
        if (!s.has('history-enemy-breach')) expect(H.crowd.every((_, i) => !person(s, `late-civilian-${i}`).down)).toBe(true);
        if (s.has('history-crowd-attacked')) expect(s.has('zhou-pinned')).toBe(true);
        if (!s.mission.complete) { expect(person(s, 'father').down).toBe(false); expect(s.has('zhou-survived-hall')).toBe(false); }
        expect(s.actors.filter(a => a.role === 'opponent' && a.aiming).length).toBeLessThanOrEqual(2);
      }
      expect(first.size).toBe(order.length);
      order.slice(1).forEach((f, i) => expect(first.get(f)!).toBeGreaterThan(first.get(order[i])!));
      expect(first.get('zhao-captured')! - first.get('history-enemy-breach')!).toBeLessThan(1.2);
      expect(shots).toBe(H.crowd.length + 1);
      expect(fledBeforeShots).toBe(true); expect(falls.size).toBe(32);
      crowd.forEach((a, i) => {
        expect(falls.get(i)!).toBeGreaterThanOrEqual(openingCrowdHitTime(i));
        expect(falls.get(i)!).toBeLessThan(openingCrowdHitTime(i) + dt + 1e-8);
        expect(s.has(`history-crowd-victim-${i}`)).toBe(true); expect(a.down).toBe(true);
      });
      expect(falls.get(31)! - falls.get(0)!).toBeGreaterThan(5);
      expect(s.mission.complete).toBe(true); expect(s.mission.elapsed).toBeLessThan(90);
      expect(s.player.health).toBe(42); expect(s.mission.subtitle).toContain('失去意识');
      expect(s.mission.subtitle).not.toMatch(/获救|救起|父亲/);
    } finally { s.dispose(); }
  }, 15000);

  it.each(['childhood', 'mainhall'] as const)('%s natural playback and Enter skip preserve the same terminal facts and tableau', scenario => {
    const natural = stagedBoundary(scenario), skipped = stagedBoundary(scenario);
    try {
      until(natural, scenario === 'childhood' ? T.childhood.finish + dt : T.mainhall.finish + dt);
      tick(skipped, { skip: true });
      expect(terminal(skipped)).toEqual(terminal(natural));
    } finally { natural.dispose(); skipped.dispose(); }
  }, 15000);

  it.each([7.5, 18.3])('restores S01 at %s seconds without exposing the child to later events', time => {
    const original = stagedBoundary('childhood');
    let restored: Simulation | undefined;
    try {
      until(original, time);
      restored = new Simulation('childhood', solids, persisted(original.snapshot()));
      tick(restored, { yaw: -Math.PI / 2 });
      expect(person(restored, 'father').down).toBe(false);
      expect(restored.has('father-died') || restored.has('history-collapse')).toBe(false);
      if (time >= T.childhood.sightLost) expect(-Math.sin(restored.player.yaw)).toBeLessThan(0);
      tick(original, { skip: true }); until(restored, T.childhood.finish + dt);
      expect(terminal(restored)).toEqual(terminal(original));
    } finally { original.dispose(); restored?.dispose(); }
  }, 15000);

  it('continues an older phase-3 father route before starting the final performance', () => {
    const seed = stagedBoundary('mainhall'), old = seed.snapshot(); seed.dispose();
    old.mission.phase = 3; old.mission.control = 'combat';
    old.mission.facts = old.mission.facts.filter(f => !f.startsWith('father-') && !['history-timeline-v2', 'civilians-evacuated'].includes(f));
    old.actors = old.actors.filter(a => a.role !== 'opponent');
    old.actors.find(a => a.id === 'father')!.position = [...H.fatherStart];
    const s = new Simulation('mainhall', solids, persisted(old));
    let visitedRifle = false;
    try {
      tick(s); expect(s.mission.phase).toBe(3); expect(person(s, 'father').goals.length).toBeGreaterThan(0);
      for (let n = 0; n < 1800 && s.mission.phase === 3; n++) {
        tick(s);
        if (Math.hypot(person(s, 'father').position[0] - H.rifle[0], person(s, 'father').position[2] - H.rifle[2]) < 1.1) visitedRifle = true;
      }
      expect(visitedRifle).toBe(true); expect(s.has('father-cover-shot')).toBe(true);
      expect(s.mission.phase).toBe(4); expect(s.player.height).toBe(1.8);
      expect(s.has('history-collapse')).toBe(false); expect(s.safeCount).toBe(6);
    } finally { s.dispose(); }
  }, 15000);

  it.each([2, 5, 9.3, 17.2])('restores the S02 performance at %s seconds without replaying previous shots or changing its ending', time => {
    const original = stagedBoundary('mainhall');
    let restored: Simulation | undefined;
    try {
      until(original, time);
      const snapshot = original.snapshot();
      if (time === 9.3) {
        // The former five-person version had no added crowd or their past cues.
        snapshot.actors = snapshot.actors.filter(a => !a.id.startsWith('evac-crowd-')
          && (!a.id.startsWith('late-civilian-') || Number(a.id.slice('late-civilian-'.length)) < 5));
        snapshot.mission.facts = snapshot.mission.facts.filter(f => f !== 'history-dense-crowd-v1'
          && (!f.startsWith('history-crowd-victim-') || Number(f.slice('history-crowd-victim-'.length)) < 5));
      }
      restored = new Simulation('mainhall', solids, persisted(snapshot));
      expect(restored.player.height).toBe(original.player.height);
      tick(restored);
      expect(restored.events.filter(e => e.type === 'shot')).toHaveLength(0);
      expect(restored.actors.filter(a => a.id.startsWith('late-civilian-'))).toHaveLength(32);
      expect(restored.actors.filter(a => a.id.startsWith('evac-crowd-'))).toHaveLength(12);
      H.crowd.forEach((_, i) => expect(person(restored!, `late-civilian-${i}`).down)
        .toBe(restored!.mission.phaseTime >= openingCrowdHitTime(i)));
      // Natural/skip equivalence is checked above; compare the resumed natural
      // path to that canonical ending without replaying two identical worlds.
      tick(original, { skip: true }); until(restored, T.mainhall.finish + dt);
      expect(terminal(restored)).toEqual(terminal(original));
    } finally { original.dispose(); restored?.dispose(); }
  }, 15000);

  it.each([false, true])('does not stand up or revive characters in a legacy collapsed checkpoint (already executed: %s)', executed => {
    const seed = stagedBoundary('mainhall'), old = seed.snapshot(); seed.dispose();
    old.mission.facts = old.mission.facts.filter(f => !['history-timeline-v2', 'history-dense-crowd-v1'].includes(f));
    old.actors = old.actors.filter(a => !a.id.startsWith('hall-defender-') && !a.id.startsWith('hall-invader-')
      && !a.id.startsWith('evac-crowd-') && (!a.id.startsWith('late-civilian-') || Number(a.id.slice('late-civilian-'.length)) < 5));
    old.mission.facts.push('history-collapse');
    old.mission.phaseTime = 0; old.player.height = 0.65; old.player.crouched = true; old.player.health = 42;
    if (executed) {
      old.mission.facts.push('zhao-captured', 'zhao-executed', 'father-died');
      old.actors.filter(a => a.id === 'zhao' || a.id === 'father' || a.id.startsWith('late-civilian-')).forEach(a => { a.down = true; a.health = 0; });
      old.actors.find(a => a.id === 'late-civilian-0')!.position = [4, 0, 11]; // Original sparse-tableau location.
    }
    const s = new Simulation('mainhall', solids, persisted(old));
    try {
      tick(s);
      expect(s.mission.phaseTime).toBeGreaterThanOrEqual(executed ? T.mainhall.execution : T.mainhall.collapse);
      expect(s.player.height).toBe(0.65); expect(s.events.some(e => e.type === 'shot')).toBe(false);
      expect(s.has('history-timeline-v2')).toBe(false);
      if (executed) {
        expect(person(s, 'zhao').down).toBe(true); expect(person(s, 'father').down).toBe(true);
        expect(person(s, 'late-civilian-0').position).toEqual([4, 0, 11]);
        expect(H.crowd.every((_, i) => person(s, `late-civilian-${i}`).down)).toBe(true);
      }
      let futureShots = 0;
      for (let n = 0; n < 1800 && !s.mission.complete; n++) {
        tick(s); expect(s.player.height).toBe(0.65);
        futureShots += s.events.filter(e => e.type === 'shot').length;
      }
      expect(s.mission.complete).toBe(true);
      expect(futureShots).toBe(executed ? 0 : H.crowd.length + 1);
    } finally { s.dispose(); }
  }, 15000);

  it('uses saved milestones as a monotonic clock floor while preserving later valid time', () => {
    expect(openingHallTime(0, ['history-collapse'])).toBe(T.mainhall.collapse);
    expect(openingHallTime(2, ['zhao-executed', 'history-collapse'])).toBe(T.mainhall.execution);
    expect(openingHallTime(19, ['zhao-executed'])).toBe(19);
    expect(openingHallTime(NaN, ['zhou-unconscious'])).toBe(T.mainhall.unconscious);
    expect(openingHallTime(-1, [])).toBe(0);
    expect(openingHallTime(0, ['history-crowd-victim-31'])).toBe(T.mainhall.massacreEnd);
    expect(openingCrowdHitTime(0)).toBe(7.2); expect(openingCrowdHitTime(31)).toBe(12.4);
    expect(openingCrowdHitTime(-2)).toBe(7.2); expect(openingCrowdHitTime(Infinity)).toBe(7.2);
    expect(openingCrowdHitTime(50)).toBe(12.4); expect(openingCrowdHitTime(0, 1)).toBe(7.2);
    expect(H.crowd.every((_, i) => !i || openingCrowdHitTime(i) > openingCrowdHitTime(i - 1))).toBe(true);
    expect(new Set(H.civilianSafe.map(point => point.join(','))).size).toBe(6);
    expect(H.civilianSafe.every(point => Math.hypot(point[0] - H.childSafe[0], point[2] - H.childSafe[2]) < 5)).toBe(true);
  });
});
