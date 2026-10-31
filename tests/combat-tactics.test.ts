import { beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { CombatTactics, COVER_HEIGHT, type TacticalActor, type TacticalContext } from '../src/actors/CombatTactics';
import { Navigation } from '../src/actors/Navigation';
import { Physics, FIXED_DT, initializePhysics } from '../src/runtime/Physics';
import { Simulation, distance, emptyIntent } from '../src/mission/Simulation';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';

beforeAll(initializePhysics);
const floor: SolidSpec = { id: 'floor', position: [0, -0.25, 0], size: [80, 0.5, 80] };
const covers: SolidSpec[] = [floor,
  { id: 'left-cover', position: [0, 0.85, 0], size: [3, 1.7, 1] },
  { id: 'right-cover', position: [5, 0.85, 1], size: [2, 1.7, 1] },
];
function harness(solids = covers, positions: Vec3[] = [[4, 0, 4]]) {
  const physics = new Physics(solids), navigation = new Navigation(solids), tactics = new CombatTactics();
  const actors: TacticalActor[] = positions.map((position, i) => ({ id: `soldier-${i}`, position: [...position] }));
  actors.forEach(a => physics.add(a.id, a.position)); physics.step();
  const context: TacticalContext = { physics, navigation, actors, now: 0, dt: FIXED_DT, leash: 8, speed: 1.9 };
  let threat: Vec3 = [0, 1.66, -12], alive = true, targetId = 'threat';
  return { actors, physics, context, threat(value: Vec3) { threat = value; }, removeThreat() { alive = false; },
    replaceThreat() { alive = true; targetId = 'replacement'; },
    tick() {
      context.now += FIXED_DT;
      const results = actors.map(a => {
        const height = physics.bodies.get(a.id)!.height;
        const visible = alive && !physics.trace([a.position[0], a.position[1] + height - 0.14, a.position[2]], threat, a.id, true);
        const result = tactics.update(a, visible ? { id: targetId, point: threat } : undefined, alive, context);
        physics.move(a.id, result.vx, result.vz, FIXED_DT); return result;
      });
      physics.step(); actors.forEach(a => { a.position = physics.foot(a.id); });
      return results;
    }, dispose() { physics.dispose(); } };
}
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe('physical combat tactics', () => {
  it('uses authored north-gate cover for both teams during actual gameplay updates', () => {
    const environment = buildEnvironment('northgate'), s = new Simulation('northgate', environment.solids);
    const allyPhases = new Set<string>(), enemyPhases = new Set<string>(), shooters = new Set<string>();
    try {
      for (let i = 0; i < 30 / FIXED_DT && !s.mission.failed; i++) {
        s.step(emptyIntent);
        for (const event of s.events) if (event.type === 'shot') {
          expect(event.actorId).toBeTruthy();
          expect(s.actors.some(a => a.id === event.actorId && (a.role === 'ally' || a.role === 'enemy'))).toBe(true);
          shooters.add(event.actorId!);
        }
        for (const a of s.actors) if (a.combat?.cover) (a.role === 'ally' ? allyPhases : enemyPhases).add(a.combat.phase);
      }
      expect([...allyPhases]).toEqual(expect.arrayContaining(['seek', 'hide', 'peek']));
      expect([...enemyPhases]).toEqual(expect.arrayContaining(['seek', 'hide', 'peek']));
      expect(shooters.size).toBeGreaterThan(0);
    } finally { s.dispose(); environment.dispose(); }
  });
  it('uses the campaign’s 1.2 m concrete cover with a matching low collider and a standing firing window', () => {
    const h = harness([floor, { id: 'campaign-low-cover', position: [0, 0.6, 0], size: [4.2, 1.2, 1.05] }], [[0, 0, 4]]);
    let hidden = 0, exposed = 0;
    try {
      for (let i = 0; i < 900; i++) {
        const [result] = h.tick(), a = h.actors[0];
        if (a.combat?.phase === 'hide') { hidden++; expect(h.physics.bodies.get(a.id)!.height).toBeLessThan(1.2); }
        if (result.canFire) exposed++;
      }
      expect(hidden).toBeGreaterThan(30); expect(exposed).toBeGreaterThan(30);
    } finally { h.dispose(); }
  });
  it('re-enters the cover cycle after losing a target for a single frame while peeking', () => {
    const h = harness(), a = h.actors[0];
    try {
      for (let i = 0; i < 900 && !(a.combat?.phase === 'peek' && !a.combat.moving); i++) h.tick();
      expect(a.combat?.phase).toBe('peek');
      h.removeThreat(); h.tick(); h.replaceThreat();
      const phases = new Set<string>();
      for (let i = 0; i < 900; i++) { h.tick(); phases.add(a.combat!.phase); }
      expect([...phases]).toEqual(expect.arrayContaining(['hide', 'peek', 'recover']));
    } finally { h.dispose(); }
  });
  it('reaches real cover, hides, exposes a clear muzzle, returns and changes position', () => {
    const h = harness(), a = h.actors[0], phases = new Set<string>(), slots = new Set<string>();
    let hidden = 0, firing = 0, traveled = 0;
    try {
      for (let tick = 0; tick < 45 / FIXED_DT; tick++) {
        const before: Vec3 = [...a.position], [result] = h.tick(), s = a.combat!;
        phases.add(s.phase); traveled += distance(before, a.position);
        if (s.cover && s.phase === 'hide') {
          slots.add(s.cover.hide.join(',')); hidden++;
          expect(h.physics.bodies.get(a.id)!.height).toBe(COVER_HEIGHT);
          expect(h.physics.trace([a.position[0], a.position[1] + COVER_HEIGHT - 0.02, a.position[2]], [0, 1.66, -12], a.id, true)).not.toBeNull();
          expect(result.canFire).toBe(false);
        }
        if (result.canFire) {
          firing++;
          expect(s.phase).toBe('peek');
          expect(h.physics.trace([a.position[0], a.position[1] + 1.38, a.position[2]], [0, 1.66, -12], a.id, true)).toBeNull();
        }
      }
      expect([...phases]).toEqual(expect.arrayContaining(['seek', 'hide', 'peek', 'recover']));
      expect(hidden).toBeGreaterThan(30); expect(firing).toBeGreaterThan(30);
      expect(slots.size).toBeGreaterThan(1); expect(traveled).toBeGreaterThan(8);
    } finally { h.dispose(); }
  });
  it('does not reserve the same cover for two bodies', () => {
    const h = harness(covers, [[4, 0, 4], [3, 0, 4]]);
    try {
      for (let i = 0; i < 300; i++) {
        h.tick(); const [a, b] = h.actors.map(a => a.combat!.cover);
        if (a && b) expect(distance(a.hide, b.hide)).toBeGreaterThanOrEqual(1.25);
      }
      expect(h.actors.some(a => a.combat?.cover)).toBe(true);
    } finally { h.dispose(); }
  });
  it('keeps selected hiding and firing positions clear of a player occupying a cover slot', () => {
    const h = harness(), a = h.actors[0];
    try {
      h.tick();
      const occupied: Vec3 = [...a.combat!.cover!.hide];
      h.context.actors = [...h.actors, { id: 'player', position: occupied }];
      delete a.combat;
      h.tick();
      const next = h.actors[0].combat?.cover;
      expect(next).toBeTruthy();
      expect(distance(next!.hide, occupied)).toBeGreaterThanOrEqual(0.8);
      expect(distance(next!.peek, occupied)).toBeGreaterThanOrEqual(0.8);
    } finally { h.dispose(); }
  });
  it('uses reachable lateral movement without cover, then returns to its post when the threat disappears', () => {
    const h = harness([floor]), a = h.actors[0], start: Vec3 = [...a.position];
    let movement = 0;
    try {
      for (let i = 0; i < 600; i++) { const before: Vec3 = [...a.position]; h.tick(); movement += distance(before, a.position); }
      expect(a.combat!.cover).toBeNull(); expect(movement).toBeGreaterThan(5);
      h.removeThreat();
      for (let i = 0; i < 600; i++) expect(h.tick()[0].canFire).toBe(false);
      expect(distance(start, a.position)).toBeLessThan(0.13);
    } finally { h.dispose(); }
  });
  it('releases cover and physically returns when a mission requires the exact post', () => {
    const h = harness(), a = h.actors[0], start: Vec3 = [...a.position];
    try {
      for (let i = 0; i < 300; i++) h.tick();
      h.context.leash = 0;
      for (let i = 0; i < 600; i++) h.tick();
      expect(a.combat!.cover).toBeNull(); expect(distance(start, a.position)).toBeLessThan(0.13);
    } finally { h.dispose(); }
  });
  it('never freezes an authored ingress route to fire, and a new order cancels a tactical route', () => {
    const s = new Simulation('northgate', [floor]);
    try {
      s.mission.nextSpawn = 10000;
      const a = s.aliveEnemies[0];
      // At 4.5 m/s a four-metre approach ends before the 0.8s enemy
      // reaction window. Keep the route long enough to observe fire in motion.
      s.physics.teleport(a.id, [0, 0, -10]); a.position = [0, 0, -10]; s.route(a, [[12, 0, -10]]);
      s.physics.teleport('player', [0, 0, 10]); s.player.position = [0, 0, 10];
      let shotsOnRoute = 0;
      for (let i = 0; i < 240; i++) {
        const routing = a.goals.length > 0; s.step(emptyIntent);
        if (routing && s.events.some(e => e.type === 'shot' && e.enemy)) shotsOnRoute++;
      }
      expect(shotsOnRoute).toBeGreaterThan(0); expect(a.goals).toHaveLength(0);
      s.route(a, [[12, 0, -15]]); expect(a.combat).toBeUndefined();
      // Inspect actual arrival before unrestricted combat starts a new bound.
      for (let i = 0; i < 240 && a.goals.length; i++) s.step(emptyIntent);
      expect(a.goals).toHaveLength(0); expect(distance(a.position, [12, 0, -15])).toBeLessThan(0.86);
    } finally { s.dispose(); }
  });
  it('round-trips tactical state, restores crouched collision, accepts older saves and rejects malformed plans', () => {
    const s = new Simulation('northgate', covers), store = new SaveStore(new Memory());
    try {
      const a = s.aliveEnemies[0]; a.goals = []; a.path = []; a.position = [4, 0, 4]; s.physics.teleport(a.id, a.position);
      s.player.position = [0, 0, -12]; s.physics.teleport('player', s.player.position); s.mission.nextSpawn = 10000;
      for (let i = 0; i < 600 && !a.combat?.crouched; i++) s.step(emptyIntent);
      expect(a.combat?.crouched).toBe(true);
      const snapshot = s.snapshot(); expect(store.save('northgate', snapshot)).toEqual({ ok: true });
      const loaded = store.load('northgate').save!.snapshot; expect(loaded).toEqual(snapshot);
      const restored = new Simulation('northgate', covers, loaded);
      try { expect(restored.physics.bodies.get(a.id)!.height).toBe(COVER_HEIGHT); expect(restored.snapshot()).toEqual(snapshot); }
      finally { restored.dispose(); }
      for (const actor of snapshot.actors) delete actor.combat;
      expect(store.save('northgate', snapshot)).toEqual({ ok: true });
      loaded.actors.find(actor => actor.id === a.id)!.combat!.until = NaN;
      expect(store.save('northgate', loaded).ok).toBe(false);
    } finally { s.dispose(); }
  });
});
