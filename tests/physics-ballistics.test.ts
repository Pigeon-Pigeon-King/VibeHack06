import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Ballistics } from '../src/combat/Ballistics';
import { FIXED_DT, GRAVITY, initializePhysics, Physics } from '../src/runtime/Physics';
import type { SolidSpec } from '../src/contracts';

const floor: SolidSpec = { id: 'floor', position: [0, -0.5, 0], size: [100, 1, 100] };
const worlds: Physics[] = [];
const physics = (solids: SolidSpec[] = []) => {
  const world = new Physics([floor, ...solids]);
  worlds.push(world);
  return world;
};

beforeAll(() => initializePhysics());
afterEach(() => { for (const world of worlds.splice(0)) world.dispose(); });

describe('synthetic projectile and collision fixtures', () => {
  it('stops the patient bed front at a shutter and moves its full body through after opening', () => {
    const world = physics([{ id: 'shutter', position: [0, 1.5, 0], size: [5, 3, 0.2], openFact: 'gate-open' }]);
    world.addCart('cart-0', [0, 0, -3]); world.step();
    for (let i = 0; i < 180; i++) { world.move('cart-0', 0, 1.25, FIXED_DT); world.step(); }
    expect(world.foot('cart-0')[2]).toBeGreaterThan(-1.4);
    expect(world.foot('cart-0')[2]).toBeLessThan(-1.29);
    expect(world.foot('cart-0')[1]).toBeGreaterThanOrEqual(-0.01);
    expect(world.foot('cart-0')[1]).toBeLessThan(0.04);
    expect(world.applyFacts(['gate-open'])).toBe(true);
    for (let i = 0; i < 300; i++) { world.move('cart-0', 0, 1.25, FIXED_DT); world.step(); }
    expect(world.foot('cart-0')[2]).toBeGreaterThan(4.5);
    expect(world.foot('cart-0')[1]).toBeGreaterThanOrEqual(-0.01);
    expect(world.foot('cart-0')[1]).toBeLessThan(0.04);
  });

  it('does not perform a collision query at the instant a shot is created', () => {
    const trace = vi.fn(() => null);
    const shots = new Ballistics(trace);
    const shot = shots.fire('player', [0, 1.5, 0], [0, 0, -1], 34);
    expect(trace).not.toHaveBeenCalled();
    expect(shot.age).toBe(0);
    expect(shot.position).toEqual([0, 1.5, 0]);
    expect(shots.projectiles).toHaveLength(1);
  });

  it('takes longer to reach a distant target and drops under the configured gravity', () => {
    const impactTime = (range: number) => {
      const world = physics();
      world.add('target', [0, 0, -range]);
      world.step();
      const shots = new Ballistics((a, b, owner) => world.trace(a, b, owner));
      shots.fire('player', [0, 1.2, 0], [0, 0, -1], 34, 60);
      for (let i = 0; i < 90; i++) {
        const impacts = shots.update(FIXED_DT);
        if (impacts.length) {
          expect(impacts[0].hit.id).toBe('target');
          return impacts[0].projectile.age;
        }
      }
      throw new Error(`No impact at ${range} m`);
    };
    const near = impactTime(6), far = impactTime(21);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near + 0.2);

    const freeFlight = new Ballistics(() => null);
    const shot = freeFlight.fire('player', [0, 10, 0], [0, 0, -1], 1, 60);
    for (let i = 0; i < 12; i++) freeFlight.update(FIXED_DT);
    const idealDrop = 0.5 * GRAVITY * 0.2 ** 2;
    expect(10 - shot.position[1]).toBeCloseTo(idealDrop, 2);
    expect(shot.position[2]).toBeLessThan(-11.9);
  });

  it('intercepts a high-speed projectile at the nearest thin wall without a second hit', () => {
    const world = physics([
      { id: 'near-wall', position: [0, 1.5, -3], size: [8, 3, 0.015] },
      { id: 'far-wall', position: [0, 1.5, -5], size: [8, 3, 0.015] },
    ]);
    world.add('enemy-behind-cover', [0, 0, -8]);
    world.step();
    const shots = new Ballistics((a, b, owner) => world.trace(a, b, owner));
    shots.fire('player', [0, 1.2, 0], [0, 0, -1], 34, 900);
    const impacts = shots.update(FIXED_DT);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].hit.id).toBe('solid:near-wall');
    expect(impacts[0].hit.point[2]).toBeCloseTo(-2.9925, 3);
    expect(shots.projectiles).toHaveLength(0);
    expect(shots.update(FIXED_DT)).toHaveLength(0);
  });

  it('hits a body in front of a wall and excludes the firing body', () => {
    const world = physics([{ id: 'wall', position: [0, 1.5, -5], size: [8, 3, 0.02] }]);
    world.add('player', [0, 0, 0]);
    world.add('enemy-in-front', [0, 0, -2]);
    world.step();
    const shots = new Ballistics((a, b, owner) => world.trace(a, b, owner));
    shots.fire('player', [0, 1.2, 0], [0, 0, -1], 34, 900);
    expect(shots.update(FIXED_DT).map(impact => impact.hit.id)).toEqual(['enemy-in-front']);
  });

  it('keeps a sprinting capsule outside a wall', () => {
    const world = physics([{ id: 'wall', position: [0, 1.5, -2], size: [8, 3, 0.2] }]);
    world.add('player', [0, 0, 0]);
    world.step();
    for (let i = 0; i < 120; i++) { world.move('player', 0, -6.3, FIXED_DT); world.step(); }
    const position = world.foot('player');
    expect(position[2]).toBeGreaterThan(-1.65);
    expect(position[2]).toBeLessThan(-1.4);
    expect(position[1]).toBeGreaterThanOrEqual(-0.01);
    expect(position[1]).toBeLessThan(0.05);
  });

  it('blocks standing under a low ceiling and permits standing after moving clear', () => {
    const world = physics([{ id: 'ceiling', position: [0, 1.65, 0], size: [4, 0.3, 4] }]);
    const body = world.add('player', [0, 0, 0], 1.2);
    world.step();
    expect(world.setHeight('player', 1.8)).toBe(false);
    expect(body.height).toBe(1.2);
    expect(world.foot('player')[1]).toBeCloseTo(0, 3);
    world.teleport('player', [5, 0, 0]);
    world.step();
    expect(world.setHeight('player', 1.8)).toBe(true);
    expect(body.height).toBe(1.8);
    expect(world.foot('player')[0]).toBeCloseTo(5);
    expect(world.foot('player')[1]).toBeCloseTo(0, 3);
  });

  it('preserves airborne momentum and foot position when the capsule crouches', () => {
    const world = physics();
    const body = world.add('player', [0, 3, 0]);
    world.step();
    for (let i = 0; i < 30; i++) { world.move('player', 0, 0, FIXED_DT); world.step(); }
    const velocity = body.verticalSpeed, foot = world.foot('player');
    expect(velocity).toBeLessThan(-0.6);
    expect(body.grounded).toBe(false);
    expect(world.setHeight('player', 1.2)).toBe(true);
    expect(world.foot('player')[1]).toBeCloseTo(foot[1], 4);
    expect(body.verticalSpeed).toBeCloseTo(velocity, 8);
  });
});
