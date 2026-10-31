import { beforeAll, expect, it } from 'vitest';
import type { SolidSpec } from '../src/contracts';
import { Simulation, emptyIntent } from '../src/mission/Simulation';
import { initializePhysics } from '../src/runtime/Physics';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SaveStore } from '../src/persistence/SaveStore';
beforeAll(initializePhysics);
const floor: SolidSpec = { id: 'floor', position: [0, -0.25, 0], size: [80, 0.5, 80] };
function fixture(extra: SolidSpec[] = []) {
  const sim = new Simulation('northgate', [floor, ...extra]);
  const target = sim.aliveEnemies[0];
  for (const a of sim.actors) {
    a.cooldown = 60;
    if (a !== target && sim.physics.bodies.has(a.id)) sim.physics.remove(a.id);
  }
  target.position = [0, 0, 0]; sim.physics.teleport(target.id, target.position);
  sim.route(target, [[0, 0, -20]]); sim.mission.nextSpawn = 10000;
  sim.player.position = [0, 0, 12]; sim.physics.teleport('player', sim.player.position);
  sim.physics.step(); return { sim, target };
}
it('confirms only real player impacts: nonlethal hit first, red-priority kill second, then fades and resets on retry', () => {
  const { sim, target } = fixture();
  try {
    if (process.env.RECORD_COMBAT_VISUAL === '1') {
      const snapshot = sim.snapshot(); snapshot.player.position = [0, 0, 22];
      for (const actor of snapshot.actors) if (actor.role === 'enemy') {
        if (actor.id === target.id) actor.position = [0, 0, 14];
        else { actor.down = true; actor.health = 0; }
      }
      const data = new Map<string, string>();
      const store = new SaveStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } });
      expect(store.save('northgate', snapshot)).toEqual({ ok: true });
      const directory = new URL('../artifacts/runs/combat/', import.meta.url); mkdirSync(directory, { recursive: true });
      writeFileSync(new URL('hit-checkpoint.json', directory), data.get('ganymede.save.northgate')!);
      writeFileSync(new URL('hit-checkpoint.source.json', directory), JSON.stringify({ kind: 'synthetic-render-checkpoint',
        source: 'tests/combat-feedback.test.ts', purpose: 'Actual keyboard fire and real projectile hit/kill rendering; not a campaign playthrough.' }, null, 2));
    }
    const fire = () => {
      sim.step({ ...emptyIntent, fire: true, ads: true });
      for (let i = 0; i < 4 && sim.ballistics.projectiles.some(p => p.owner === 'player'); i++) sim.step(emptyIntent);
    };
    fire(); expect(target.health).toBe(34); expect(sim.hitFlash).toBeGreaterThan(0); expect(sim.killFlash).toBe(0);
    for (let i = 0; i < 15; i++) sim.step(emptyIntent);
    fire(); expect(target.down).toBe(true); expect(sim.kills).toBe(1); expect(sim.killFlash).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) sim.step(emptyIntent);
    expect(sim.hitFlash).toBe(0); expect(sim.killFlash).toBe(0);
    const retry = new Simulation('northgate', [floor], sim.checkpoint);
    try { expect(retry.killFlash).toBe(0); expect(retry.hitFlash).toBe(0); } finally { retry.dispose(); }
  } finally { sim.dispose(); }
});
it('does not report a wall impact as a hit or kill', () => {
  const { sim, target } = fixture([{ id: 'wall', position: [0, 1.5, 5], size: [8, 3, 0.2] }]);
  try {
    sim.step({ ...emptyIntent, fire: true }); for (let i = 0; i < 5; i++) sim.step(emptyIntent);
    expect(target.health).toBe(68); expect(sim.hitFlash).toBe(0); expect(sim.killFlash).toBe(0);
  } finally { sim.dispose(); }
});
it('does not credit a teammate projectile to the player’s hit marker', () => {
  const { sim, target } = fixture();
  try {
    sim.ballistics.fire('zheng', [0, 1.2, 2], [0, 0, -1], 17, 420);
    for (let i = 0; i < 5; i++) sim.step(emptyIntent);
    expect(target.health).toBe(51); expect(sim.hits).toBe(0); expect(sim.hitFlash).toBe(0); expect(sim.killFlash).toBe(0);
  } finally { sim.dispose(); }
});
