import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SolidSpec, Vec3 } from '../src/contracts';
import { buildEnvironment } from '../src/presentation/environment';
import { FIXED_DT, GRAVITY, initializePhysics, Physics } from '../src/runtime/Physics';

const floor: SolidSpec = { id: 'floor', position: [0, -0.5, 0], size: [100, 1, 100] };
const worlds: Physics[] = [];
beforeAll(() => initializePhysics());
afterEach(() => { for (const world of worlds.splice(0)) world.dispose(); });

function physics(solids: SolidSpec[] = [floor], height = 1.8, foot: Vec3 = [0, 0.03, 0]): Physics {
  const world = new Physics(solids); worlds.push(world);
  // Start clear of the floor, then establish a real controller contact. The
  // jump assertion must not depend on a synthetic grounded flag or penetration.
  world.add('player', foot, height); world.step();
  settle(world);
  expect(world.bodies.get('player')!.grounded).toBe(true);
  return world;
}

function settle(world: Physics, frames = 60): void {
  for (let frame = 0; frame < frames; frame++) { world.move('player', 0, 0, FIXED_DT); world.step(); }
}

interface Sample { time: number; foot: Vec3; rise: number; velocity: number; grounded: boolean }
function jump(world: Physics, speed = 0, secondPressFrame = -1) {
  const start = world.foot('player'), samples: Sample[] = [];
  let leftGround = false;
  for (let frame = 1; frame <= 180; frame++) {
    // Keyboard and touch both send an edge, not a held jump on every tick.
    world.move('player', speed, 0, FIXED_DT, frame === 1 || frame === secondPressFrame);
    world.step();
    const body = world.bodies.get('player')!, foot = world.foot('player');
    const sample = { time: frame * FIXED_DT, foot, rise: foot[1] - start[1], velocity: body.verticalSpeed, grounded: body.grounded };
    samples.push(sample);
    leftGround ||= !body.grounded;
    // The authored spawn may initially be below the controller's 1.5 cm skin.
    // Allow that settling correction, but not its earlier airborne ground probe.
    if (leftGround && body.grounded && sample.rise <= 0.02) break;
  }
  const peak = samples.reduce((best, sample) => sample.rise > best.rise ? sample : best);
  return { start, samples, peak, landing: samples.find(sample => sample.time > peak.time && sample.grounded && sample.rise <= 0.02) };
}

describe('real Rapier player jump trajectory', () => {
  it('keeps rising after one jump edge, then returns to the same floor under the configured gravity', () => {
    const trajectory = jump(physics());
    expect(trajectory.samples[0].grounded).toBe(false);
    expect(trajectory.samples[1].velocity).toBeGreaterThan(1.5);
    // v0 is the existing design input. Gravity alone cannot prescribe jump height.
    const takeoffSpeed = 1.65;
    expect(GRAVITY).toBe(1.428);
    expect(Math.abs(trajectory.peak.rise - takeoffSpeed ** 2 / (2 * GRAVITY))).toBeLessThan(0.02);
    expect(Math.abs(trajectory.peak.time - takeoffSpeed / GRAVITY)).toBeLessThan(FIXED_DT);
    expect(trajectory.landing).toBeDefined();
    expect(Math.abs(trajectory.landing!.time - 2 * takeoffSpeed / GRAVITY)).toBeLessThan(0.06);
    expect(trajectory.landing!.foot[1]).toBeCloseTo(trajectory.start[1], 2);
  });

  it('preserves the vertical arc while moving horizontally at sprint speed', () => {
    const stationary = jump(physics()), moving = jump(physics(), 6.3);
    expect(stationary.peak.rise).toBeGreaterThan(0.9);
    expect(moving.peak.rise).toBeCloseTo(stationary.peak.rise, 3);
    expect(moving.peak.time).toBe(stationary.peak.time);
    expect(moving.landing).toBeDefined();
    expect(moving.landing!.foot[0] - moving.start[0]).toBeGreaterThan(13.5);
  });

  it('does not grant a second impulse when jump is pressed again in midair', () => {
    const single = jump(physics()), repeated = jump(physics(), 0, 30);
    expect(repeated.samples[28].grounded).toBe(false);
    expect(repeated.samples[29].velocity).toBeLessThan(repeated.samples[28].velocity);
    expect(repeated.peak.rise).toBeGreaterThan(0.9);
    expect(repeated.samples.map(sample => sample.rise)).toEqual(single.samples.map(sample => sample.rise));
  });

  it('allows another full jump after landing normally', () => {
    const world = physics(), first = jump(world);
    expect(first.landing).toBeDefined();
    settle(world, 12);
    expect(world.bodies.get('player')!.grounded).toBe(true);
    const second = jump(world);
    expect(second.samples[0].grounded).toBe(false);
    expect(second.peak.rise).toBeGreaterThan(0.9);
    expect(second.peak.rise).toBeCloseTo(first.peak.rise, 3);
    expect(second.landing).toBeDefined();
  });

  it.each([
    { stance: 'standing', height: 1.8, ceilingBottom: 2.4, expectedRise: 0.57 },
    { stance: 'crouched', height: 1.2, ceilingBottom: 1.5, expectedRise: 0.27 },
  ])('clips a $stance capsule against a real low ceiling and then lands', ({ height, ceilingBottom, expectedRise }) => {
    const ceiling: SolidSpec = { id: 'ceiling', position: [0, ceilingBottom + 0.15, 0], size: [4, 0.3, 4] };
    const trajectory = jump(physics([floor, ceiling], height));
    expect(Math.abs(trajectory.peak.rise - expectedRise)).toBeLessThan(0.02);
    expect(trajectory.peak.foot[1] + height).toBeLessThan(ceilingBottom);
    expect(trajectory.peak.foot[1] + height).toBeGreaterThan(ceilingBottom - 0.03);
    const headContact = trajectory.samples.find((sample, index, samples) => index > 0 && samples[index - 1].velocity > 0 && sample.velocity === 0);
    expect(headContact).toBeDefined();
    expect(headContact!.grounded).toBe(false);
    expect(trajectory.samples.some(sample => sample.time > headContact!.time && sample.velocity < 0)).toBe(true);
    expect(trajectory.landing).toBeDefined();
    expect(trajectory.landing!.foot[1]).toBeCloseTo(trajectory.start[1], 2);
  });

  it('also leaves the floor at the actual north-frontline spawn', () => {
    const environment = buildEnvironment('frontgate');
    try {
      const trajectory = jump(physics(environment.solids, 1.8, [-8, 0, 40]));
      expect(trajectory.samples[0].grounded).toBe(false);
      expect(trajectory.peak.rise).toBeGreaterThan(0.9);
      expect(trajectory.peak.rise).toBeLessThan(0.97);
      expect(trajectory.landing).toBeDefined();
    } finally { environment.dispose(); }
  });
});
