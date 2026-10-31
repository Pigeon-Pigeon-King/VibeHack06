import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { objectiveFocusOpacity, smoothObjectiveOpacity } from '../src/ui/objective-focus';

const camera = (fov = 75, aspect = 16 / 9) => new PerspectiveCamera(fov, aspect, 0.045, 1000);

describe('objective marker yields to the player’s gaze', () => {
  it('leaves the centre clear and restores markers away from the line of sight', () => {
    expect(objectiveFocusOpacity(camera(), [0, -1.2, -20])).toBeCloseTo(0.04);
    expect(objectiveFocusOpacity(camera(), [15, -1.2, -20])).toBe(1);
  });
  it('fades continuously as the gaze approaches, without a visibility threshold', () => {
    const c = camera(); let previous = 1;
    for (let x = 15; x >= 0; x -= 0.1) {
      const opacity = objectiveFocusOpacity(c, [x, -1.2, -20]);
      expect(opacity).toBeLessThanOrEqual(previous + 1e-6);
      expect(previous - opacity).toBeLessThan(0.03); previous = opacity;
    }
  });
  it('handles translated and rotated cameras, ADS and different aspect ratios', () => {
    for (const fov of [54, 75]) for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      const c = camera(fov, aspect); c.position.set(5, 4, 9); c.lookAt(new Vector3(30, 7.2, 17));
      expect(objectiveFocusOpacity(c, [30, 6, 17])).toBeCloseTo(0.04);
    }
  });
  it('fades a large nearby label when its footprint crosses the centre even if its anchor is off to the side', () => {
    expect(objectiveFocusOpacity(camera(), [1.2, -3.2, -2])).toBeCloseTo(0.04);
  });
  it('keeps rear guidance independent and rejects invalid marker coordinates', () => {
    expect(objectiveFocusOpacity(camera(), [0, 0, 10])).toBe(1);
    expect(objectiveFocusOpacity(camera(), [NaN, 0, -10])).toBe(0);
  });
  it('restores smoothly at different frame rates, holds at zero time, and respects low motion', () => {
    const values = [30, 60, 120].map(fps => {
      let opacity = 0.04;
      for (let frame = 0; frame < fps / 2; frame++) opacity = smoothObjectiveOpacity(opacity, 1, 1 / fps);
      return opacity;
    });
    expect(values[0]).toBeCloseTo(values[1], 8); expect(values[1]).toBeCloseTo(values[2], 8);
    expect(values[0]).toBeGreaterThan(0.99);
    expect(smoothObjectiveOpacity(0.4, 1, 0)).toBe(0.4);
    expect(smoothObjectiveOpacity(1, 0.04, 1 / 60, true)).toBe(0.04);
  });
});
