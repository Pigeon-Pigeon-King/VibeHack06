import { beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { HISTORY as H } from '../src/content/history-layout';
import { OPENING_TIMELINE } from '../src/content/opening-timeline';
import { openingEnemyCombatLeash } from '../src/mission/Opening';
import { distance, emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { openingView } from '../src/presentation/OpeningView';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';

beforeAll(initializePhysics);
const T = OPENING_TIMELINE.mainhall;
const outsideHall = (point: Vec3) => point[0] > H.hall.maxX + 0.65 || point[2] < H.hall.minZ - 0.65;
const person = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const invaders = (s: Simulation) => s.actors.filter(a => a.id === 'shao' || a.id.startsWith('hall-invader-'));
const tick = (s: Simulation, input: Partial<typeof emptyIntent> = {}) => s.step({
  ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...input,
});
function until(s: Simulation, time: number): void {
  for (let n = 0; n < (T.finish + 1) / FIXED_DT && s.mission.phaseTime < time && !s.mission.complete; n++) tick(s);
}
function persisted(snapshot: Snapshot): Snapshot {
  const data = new Map<string, string>();
  const storage: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); } };
  const store = new SaveStore(storage);
  expect(store.save(snapshot.mission.scenario, snapshot)).toEqual({ ok: true });
  return store.load(snapshot.mission.scenario).save!.snapshot;
}

// This constructed boundary isolates the already-completed defense. The actual
// public-input defense and physical evacuation are covered by opening-paths.
function evacuatedBoundary(solids: SolidSpec[]): Simulation {
  const initial = new Simulation('mainhall', solids), saved = initial.snapshot(); initial.dispose();
  Object.assign(saved.mission, { phase: 3, phaseTime: 0, elapsed: 60, nextSpawn: 1000, control: 'combat' });
  saved.mission.facts.push('history-gate-open', 'zhou-trusts-zhao', 'hall-front-secured', 'hall-side-secured',
    'father-rifle-collected', 'father-charged-defense', 'father-cover-shot');
  saved.actors = saved.actors.filter(a => a.role !== 'enemy');
  saved.player.position = [...H.rubblePlayer];
  saved.actors.filter(a => a.role === 'worker').forEach((a, i) => {
    a.position = [...H.civilianSafe[i]]; a.safe = true; a.released = true;
  });
  for (const [id, point] of [['father', H.fatherFall], ['evacuator', H.womanEnd],
    ['daughter', H.childSafe], ['young-lu', H.childSafe]] as Array<[string, Vec3]>) {
    saved.actors.find(a => a.id === id)!.position = [...point];
  }
  const s = new Simulation('mainhall', solids, saved); tick(s);
  expect(s.mission.phase).toBe(4);
  return s;
}

describe('prologue enemy staging in the actual hall and Rapier world', () => {
  it('starts S02 with visible, physically valid enemies outside both public entrances and no combat during the door task', () => {
    const env = buildEnvironment('mainhall'), s = new Simulation('mainhall', env.solids);
    try {
      expect(s.aliveEnemies).toHaveLength(4);
      expect(s.mission.control).toBe('work');
      const starts = s.aliveEnemies.map(a => [...a.position] as Vec3);
      for (const a of s.aliveEnemies) {
        expect(outsideHall(a.position), a.id).toBe(true);
        expect(s.navigation.isOpen(a.position), a.id).toBe(true);
        expect(s.physics.canOccupy(a.position), a.id).toBe(true);
        expect(s.physics.trace([a.position[0], 1.66, a.position[2]], [H.defenseA[0], 1.66, H.defenseA[2]], '', true)).toBeNull();
      }
      for (let n = 0; n < 120; n++) {
        tick(s, { fire: true });
        expect(s.events.some(e => e.type === 'shot')).toBe(false);
      }
      s.aliveEnemies.forEach((a, i) => expect(distance(a.position, starts[i])).toBeLessThan(0.001));
      expect(s.player.health).toBe(100); expect(s.player.ammo).toBe(25);
      expect(s.mission.phase).toBe(0); expect(invaders(s)).toHaveLength(0);
      expect(s.has('history-enemy-breach')).toBe(false);
    } finally { s.dispose(); env.dispose(); }
  });

  it('keeps S01 a 1.1m noncombat child view, with no live AI enemy or later breach knowledge', () => {
    const env = buildEnvironment('childhood'), s = new Simulation('childhood', env.solids);
    try {
      for (let n = 0; n < 120; n++) tick(s, { fire: true, skip: true });
      expect(s.aliveEnemies).toHaveLength(0); expect(invaders(s)).toHaveLength(0);
      expect(s.player.height).toBe(1.1); expect(s.player.health).toBe(100); expect(s.player.ammo).toBe(0);
      expect(s.mission.facts).toEqual([]);
      expect(openingEnemyCombatLeash(s, person(s, 'young-zhou'))).toBeUndefined();
    } finally { s.dispose(); env.dispose(); }
  });

  it('keeps active defense at the entrance, acquires only the adult player, and fires real projectiles without clearing the phase merely by moving outside', () => {
    const env = buildEnvironment('mainhall'), s = new Simulation('mainhall', env.solids);
    let targeted = false, shots = 0, boundedMoves = false;
    try {
      tick(s, { interact: true });
      expect(s.mission.phase).toBe(1); expect(s.mission.spawned).toBe(4);
      expect(s.exposedThreat(H.defenseA, 52)).toBe(true);
      for (let n = 0; n < 360 && !s.mission.failed; n++) {
        tick(s);
        shots += s.events.filter(e => e.type === 'shot' && e.enemy).length;
        for (const a of s.aliveEnemies) {
          expect(outsideHall(a.position), `${a.id}: ${a.position}`).toBe(true);
          expect(a.goals).toEqual([]);
          expect(openingEnemyCombatLeash(s, a)).toBe(0.9);
          if (a.combat) {
            expect(['', 'player']).toContain(a.combat.targetId);
            targeted ||= a.combat.targetId === 'player';
            expect(distance(a.position, a.combat.anchor)).toBeLessThanOrEqual(0.92);
            boundedMoves ||= distance(a.position, a.combat.anchor) > 0.2;
          }
        }
        expect(s.has('history-enemy-breach')).toBe(false);
        expect(s.actors.filter(a => a.role === 'child').every(a => !a.down && a.health === 100)).toBe(true);
      }
      expect(s.mission.failed).toBe(false); expect(s.mission.phase).toBe(1);
      expect(s.workers.every(a => !a.released)).toBe(true);
      expect(targeted).toBe(true); expect(shots).toBeGreaterThan(0); expect(boundedMoves).toBe(true);
      const restored = new Simulation('mainhall', env.solids, persisted(s.snapshot()));
      try {
        expect(restored.snapshot()).toEqual(s.snapshot());
        for (let n = 0; n < 30; n++) {
          tick(restored);
          expect(restored.aliveEnemies.every(a => outsideHall(a.position))).toBe(true);
        }
      } finally { restored.dispose(); }
    } finally { s.dispose(); env.dispose(); }
  });

  it('does not acquire or shoot through an actual wall while residents use the protected route', () => {
    const env = buildEnvironment('mainhall');
    const solids: SolidSpec[] = [...env.solids, { id: 'staging-occlusion-screen', position: [0, 2, -1], size: [0.6, 4, 54] }];
    const s = new Simulation('mainhall', solids);
    try {
      tick(s, { interact: true });
      for (let n = 0; n < 120; n++) {
        tick(s);
        expect(s.events.some(e => e.type === 'shot' && e.enemy)).toBe(false);
        expect(s.aliveEnemies.every(a => !a.combat?.targetId)).toBe(true);
      }
      expect(s.mission.phase).toBe(2); expect(s.player.health).toBe(100);
      expect(s.workers.slice(0, 3).every(a => a.released)).toBe(true);
    } finally { s.dispose(); env.dispose(); }
  });

  it('migrates an old indoor combat save before the first AI step, preserving dead enemies and resident outcomes', () => {
    const env = buildEnvironment('mainhall'), initial = new Simulation('mainhall', env.solids);
    tick(initial, { interact: true });
    const old = initial.snapshot(); initial.dispose();
    old.mission.facts = old.mission.facts.filter(f => f !== 'history-enemy-staging-v1');
    const enemies = old.actors.filter(a => a.role === 'enemy');
    enemies.forEach((a, i) => { a.position = [...H.enemyPosts[i]]; a.goals = [H.enemyPosts[5]]; });
    enemies[0].health = 31; enemies[0].cooldown = 0.63;
    enemies[1].down = true; enemies[1].health = 0;
    const residents = old.actors.filter(a => a.role === 'worker');
    residents[0].safe = true; residents[0].released = true; residents[0].position = [...H.civilianSafe[0]];
    const s = new Simulation('mainhall', env.solids, persisted(old));
    try {
      expect(s.aliveEnemies.every(a => outsideHall(a.position))).toBe(true);
      expect(s.aliveEnemies.every(a => !a.goals.length && !a.path.length)).toBe(true);
      expect(person(s, enemies[0].id).health).toBe(31); expect(person(s, enemies[0].id).cooldown).toBe(0.63);
      expect(person(s, enemies[1].id)).toEqual(enemies[1]);
      expect(s.physics.bodies.has(enemies[1].id)).toBe(false);
      expect(s.workers).toEqual(residents); expect(s.safeCount).toBe(1);
      for (const a of s.aliveEnemies) expect(distance(s.physics.foot(a.id), a.position)).toBeLessThan(0.001);
      const current = persisted(s.snapshot()), again = new Simulation('mainhall', env.solids, current);
      try { expect(again.snapshot()).toEqual(current); }
      finally { again.dispose(); }
    } finally { s.dispose(); env.dispose(); }
  });

  it('upgrades the old empty entry checkpoint once and does not duplicate its exterior wave when the gate opens', () => {
    const env = buildEnvironment('mainhall'), initial = new Simulation('mainhall', env.solids);
    const old = initial.snapshot(); initial.dispose();
    old.mission.facts = old.mission.facts.filter(f => f !== 'history-enemy-staging-v1');
    old.mission.spawned = 0; old.actors = old.actors.filter(a => a.role !== 'enemy');
    const s = new Simulation('mainhall', env.solids, persisted(old));
    try {
      expect(s.aliveEnemies).toHaveLength(4);
      expect(s.aliveEnemies.every(a => outsideHall(a.position))).toBe(true);
      expect(s.mission.spawned).toBe(4); expect(s.mission.control).toBe('work');
      const current = persisted(s.snapshot()), restored = new Simulation('mainhall', env.solids, current);
      try {
        expect(restored.snapshot()).toEqual(current);
        tick(restored, { interact: true });
        expect(restored.mission.phase).toBe(1); expect(restored.mission.spawned).toBe(4);
        expect(restored.aliveEnemies).toHaveLength(4);
      } finally { restored.dispose(); }
    } finally { s.dispose(); env.dispose(); }
  });

  it('holds the authored invaders outside through collapse, then permits the breach and crowd assault in their original order', () => {
    const env = buildEnvironment('mainhall'), s = evacuatedBoundary(env.solids);
    const residents = structuredClone(s.workers);
    try {
      expect(invaders(s)).toHaveLength(3);
      for (let n = 0; n < Math.ceil(T.breach / FIXED_DT) && s.mission.phaseTime < T.breach - FIXED_DT; n++) {
        expect(invaders(s).every(a => outsideHall(a.position))).toBe(true);
        expect(s.has('history-enemy-breach')).toBe(false);
        expect(s.actors.filter(a => a.id.startsWith('late-civilian-')).every(a => !a.down)).toBe(true);
        tick(s, { fire: true });
        expect(s.events.some(e => e.type === 'shot' && e.enemy)).toBe(false);
      }
      expect(s.has('history-collapse')).toBe(true); expect(s.has('zhou-pinned')).toBe(true);
      expect(s.player.height).toBe(0.65); expect(s.player.ammo).toBe(25);
      until(s, T.breach + 0.2);
      expect(s.has('history-enemy-breach')).toBe(true);
      expect(invaders(s).some(a => !outsideHall(a.position))).toBe(true);
      expect(s.has('history-crowd-attacked')).toBe(false);
      expect(openingView({ scenario: 'mainhall', phase: 4, phaseTime: s.mission.phaseTime, lowMotion: false }, s.mission.facts).invaders).toBe(true);
      until(s, T.crowdAttack);
      const shot = s.ballistics.projectiles.find(p => p.owner === 'hall-invader-1');
      expect(shot).toBeDefined(); expect(shot!.damage).toBe(0);
      const victim = person(s, 'late-civilian-0'), gunner = person(s, 'hall-invader-1');
      expect(victim.down).toBe(true);
      expect(Math.atan2(shot!.velocity[0], shot!.velocity[2])).toBeCloseTo(Math.atan2(victim.position[0] - gunner.position[0], victim.position[2] - gunner.position[2]), 8);
      while (s.mission.phaseTime < T.capture) {
        const previous = invaders(s).map(a => [...a.position] as Vec3);
        tick(s);
        invaders(s).forEach((a, i) => {
          // The commander is controlled at gunpoint near the entrance, rather
          // than an invader covering the hall's full width in one second.
          expect(distance(a.position, previous[i])).toBeLessThan(0.12);
          expect(s.physics.canOccupy(a.position), a.id).toBe(true);
        });
      }
      expect(s.has('zhao-captured') && s.has('zhou-pinned') && s.has('history-crowd-attacked')).toBe(true);
      expect(s.has('zhao-defiant-shout')).toBe(false);
      const captor = person(s, 'hall-invader-0');
      expect(captor.aiming).toBe(true);
      expect(s.physics.trace([captor.position[0], 1.38, captor.position[2]],
        [H.zhaoCaptured[0], 1.1, H.zhaoCaptured[2]], captor.id, true)).toBeNull();
      expect(s.workers.map(a => ({ id: a.id, safe: a.safe, down: a.down })))
        .toEqual(residents.map(a => ({ id: a.id, safe: a.safe, down: a.down })));
      s.workers.forEach((a, i) => expect(distance(a.position, residents[i].position)).toBeLessThan(0.001));
    } finally { s.dispose(); env.dispose(); }
  });

  it('repairs old pre-breach actor positions on load without replaying later facts, and preserves a post-breach save', () => {
    const env = buildEnvironment('mainhall'), original = evacuatedBoundary(env.solids);
    const old = original.snapshot(); original.dispose();
    old.mission.facts = old.mission.facts.filter(f => f !== 'history-enemy-staging-v1');
    old.actors.find(a => a.id === 'shao')!.position = [...H.shaoStart];
    old.actors.find(a => a.id === 'hall-invader-0')!.position = [10, 0, 7];
    old.actors.find(a => a.id === 'hall-invader-1')!.position = [22, 0, 5];
    const s = new Simulation('mainhall', env.solids, persisted(old));
    try {
      expect(invaders(s).every(a => outsideHall(a.position))).toBe(true);
      expect(s.has('history-enemy-breach') || s.has('history-crowd-attacked')).toBe(false);
      expect(s.safeCount).toBe(6); expect(s.player.height).toBe(1.8);
      until(s, T.capture + 0.3);
      const saved = persisted(s.snapshot()), restored = new Simulation('mainhall', env.solids, saved);
      try {
        expect(restored.snapshot()).toEqual(saved);
        tick(restored); expect(restored.has('zhao-captured')).toBe(true);
        expect(restored.safeCount).toBe(6); expect(restored.workers.every(a => !a.down)).toBe(true);
        expect(restored.events.some(e => e.type === 'shot')).toBe(false);
      } finally { restored.dispose(); }
    } finally { s.dispose(); env.dispose(); }
  });
});
