import { describe, expect, it } from 'vitest';
import { HeldItemMotion, type HeldItem } from '../src/presentation/HeldItemMotion';

const frame = (motion: HeldItemMotion, item: HeldItem, dt = 1 / 60, low = false, firing = false, wall = false) => motion.update(item, dt, low, firing, wall);

describe('first-person item handover presentation', () => {
  it('lowers the weapon before hiding it and raises a carried item without overlapping hands', () => {
    const motion = new HeldItemMotion(); motion.reset('weapon');
    const first = frame(motion, 'supply');
    expect(first.weapon).toBeGreaterThan(0); expect(first.weapon).toBeLessThan(1); expect(first.supply).toBe(0);
    let pose = first, observedPickup = false;
    for (let i = 0; i < 60; i++) {
      pose = frame(motion, 'supply');
      expect(pose.weapon === 0 || pose.supply === 0).toBe(true);
      if (pose.supply > 0 && pose.supply < 1) observedPickup = true;
    }
    expect(observedPickup).toBe(true); expect(pose).toEqual({ weapon: 0, supply: 1, wall: 0 });
  });

  it('holds the exact in-progress pose during pause, then continues from it', () => {
    const motion = new HeldItemMotion(); motion.reset('supply');
    const midway = frame(motion, 'none', 0.1, false, false, true);
    for (let i = 0; i < 180; i++) expect(frame(motion, 'none', 0, false, false, true)).toEqual(midway);
    const resumed = frame(motion, 'none'); expect(resumed.supply).toBeLessThan(midway.supply); expect(resumed.supply).toBeGreaterThan(0);
  });

  it('reverses an interrupted draw continuously and never leaks another scene item after reset', () => {
    const motion = new HeldItemMotion(); motion.reset('none');
    const before = frame(motion, 'weapon', 0.16);
    const reversed = frame(motion, 'none');
    expect(reversed.weapon).toBeLessThan(before.weapon); expect(reversed.weapon).toBeGreaterThan(0);
    expect(before.weapon - reversed.weapon).toBeLessThan(0.1);
    motion.reset('supply'); expect(frame(motion, 'supply', 0)).toEqual({ weapon: 0, supply: 1, wall: 0 });
    motion.reset('none'); expect(frame(motion, 'none', 0)).toEqual({ weapon: 0, supply: 0, wall: 0 });
  });

  it('shows a raised weapon on a real shot without adding a new firing delay', () => {
    const motion = new HeldItemMotion(); motion.reset('supply');
    expect(frame(motion, 'weapon', 1 / 60, false, true)).toEqual({ weapon: 1, supply: 0, wall: 0 });
    // A leftover cooldown must not resurrect a rifle in a work/carry phase.
    expect(frame(motion, 'none', 0.32, false, true).weapon).toBe(0);
  });

  it('uses the same progress at 30 and 120 fps and shortens unnecessary motion when requested', () => {
    const slow = new HeldItemMotion(), fast = new HeldItemMotion();
    for (let i = 0; i < 6; i++) frame(slow, 'supply', 1 / 30);
    for (let i = 0; i < 24; i++) frame(fast, 'supply', 1 / 120);
    expect(frame(slow, 'supply', 0).supply).toBeCloseTo(frame(fast, 'supply', 0).supply, 10);
    const reduced = new HeldItemMotion(); expect(frame(reduced, 'supply', 0.1, true).supply).toBe(1);
  });

  it('blends wall avoidance both ways and ignores invalid or backwards time', () => {
    const motion = new HeldItemMotion(); motion.reset('weapon');
    const blocked = frame(motion, 'weapon', 0.07, false, false, true);
    expect(blocked.wall).toBeGreaterThan(0); expect(blocked.wall).toBeLessThan(1);
    expect(frame(motion, 'weapon', NaN, false, false, true)).toEqual(blocked);
    expect(frame(motion, 'weapon', -2, false, false, true)).toEqual(blocked);
    expect(frame(motion, 'weapon', 0.14).wall).toBe(0);
  });
});
