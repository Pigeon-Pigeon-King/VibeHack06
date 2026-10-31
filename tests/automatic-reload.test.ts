import { beforeAll, describe, expect, it } from 'vitest';
import { emptyIntent, Simulation } from '../src/mission/Simulation';
import { FIXED_DT, initializePhysics } from '../src/runtime/Physics';
import type { SolidSpec } from '../src/contracts';

beforeAll(initializePhysics);
const floor: SolidSpec[] = [{ id: 'mechanism-test-floor', position: [0, -0.25, 0], size: [500, 0.5, 500] }];
// Constructed mechanism scene, not a normal campaign entry or a full playthrough.
function emptySoon(reserve: number): Simulation {
  const sim = new Simulation('nightshift', floor);
  sim.mission.control = 'combat'; sim.player.ammo = 1; sim.player.reserve = reserve;
  return sim;
}
function wait(sim: Simulation, seconds: number): number {
  let reloads = 0;
  for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
    sim.step(emptyIntent); reloads += sim.events.filter(event => event.type === 'reload').length;
  }
  return reloads;
}

describe('empty magazine automatic reload', () => {
  it('fires the final round, starts one reload after its firing cycle, and uses the normal reload duration', () => {
    const sim = emptySoon(40);
    try {
      sim.step({ ...emptyIntent, fire: true });
      expect(sim.ballistics.fired).toBe(1); expect(sim.player.ammo).toBe(0);
      expect(sim.player.reload).toBe(0);
      expect(wait(sim, 0.25)).toBe(1);
      expect(sim.player.reload).toBeGreaterThan(1.8); expect(sim.player.ammo).toBe(0);
      expect(wait(sim, 2.1)).toBe(0);
      expect(sim.player.ammo).toBe(25); expect(sim.player.reserve).toBe(15);
      expect(sim.ballistics.fired).toBe(1);
    } finally { sim.dispose(); }
  });
  it('loads only the remaining reserve and does nothing when reserve is exhausted', () => {
    const sim = emptySoon(7);
    try {
      sim.step({ ...emptyIntent, fire: true }); expect(wait(sim, 2.4)).toBe(1);
      expect(sim.player.ammo).toBe(7); expect(sim.player.reserve).toBe(0);
      sim.player.ammo = 0;
      expect(wait(sim, 3)).toBe(0); expect(sim.player.ammo).toBe(0); expect(sim.player.reload).toBe(0);
    } finally { sim.dispose(); }
  });
  it('does not start while hands are occupied or during a fixed story scene', () => {
    const sim = emptySoon(20);
    try {
      sim.player.ammo = 0;
      for (const control of ['work', 'cooperative', 'staged'] as const) {
        sim.mission.control = control;
        expect(wait(sim, 0.3)).toBe(0); expect(sim.player.reload).toBe(0);
      }
      sim.mission.control = 'combat'; expect(wait(sim, 0.1)).toBe(1);
    } finally { sim.dispose(); }
  });
  it('keeps manual early reload and resumes an in-progress reload without restarting it', () => {
    const sim = emptySoon(12);
    let restored: Simulation | undefined;
    try {
      sim.player.ammo = 10;
      sim.step({ ...emptyIntent, reload: true });
      expect(sim.events.filter(event => event.type === 'reload')).toHaveLength(1);
      wait(sim, 0.5);
      const remaining = sim.player.reload;
      restored = new Simulation('nightshift', floor, sim.snapshot());
      expect(wait(restored, 0.2)).toBe(0);
      expect(restored.player.reload).toBeLessThan(remaining);
      wait(restored, 2);
      expect(restored.player.ammo).toBe(22); expect(restored.player.reserve).toBe(0);
    } finally { sim.dispose(); restored?.dispose(); }
  });
});
