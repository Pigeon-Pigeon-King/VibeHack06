import { describe, expect, it } from 'vitest';
import { Navigation } from '../src/actors/Navigation';
import type { SolidSpec, Vec3 } from '../src/contracts';

describe('synthetic navigation fixtures', () => {
  it('routes around a blocking crate with capsule clearance instead of cutting its corners', () => {
    const obstacle: SolidSpec = { id: 'crate', position: [0, 1, 0], size: [2, 2, 5] };
    const route = new Navigation([obstacle]).path([-4, 0, 0], [4, 0, 0]);
    expect(route.length).toBeGreaterThan(8);
    expect(route.at(-1)).toEqual([4, 0, 0]);
    expect(route.some(point => Math.abs(point[2]) >= 3)).toBe(true);
    const points: Vec3[] = [[-4, 0, 0], ...route];
    // Sample each grid edge against a crate expanded by the capsule radius.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      for (let sample = 0; sample <= 10; sample++) {
        const t = sample / 10, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        expect(Math.abs(x) >= 1.28 || Math.abs(z) >= 2.78).toBe(true);
      }
    }
  });

  it('returns no route across a wall spanning the navigation domain', () => {
    const navigation = new Navigation([{ id: 'divider', position: [0, 1.5, 0], size: [80, 3, 2] }]);
    expect(navigation.path([0, 0, -5], [0, 0, 5])).toEqual([]);
  });
});
