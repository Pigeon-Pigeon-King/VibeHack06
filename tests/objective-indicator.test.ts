import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { avoidHud, indicatorBounds, projectObjective } from '../src/ui/objective-projection';

const camera = (fov = 75, width = 1920, height = 1080) => new PerspectiveCamera(fov, width / height, 0.045, 1000);

describe('objective direction in the actual perspective camera', () => {
  it('keeps visible destinations at their projected positions', () => {
    const c = camera();
    const p = projectObjective([2, 1, -10], c, 1920, 1080)!;
    const expected = new Vector3(2, 1, -10).project(c);
    expect(p.offscreen).toBe(false);
    expect(p.x).toBeCloseTo((expected.x + 1) * 960);
    expect(p.y).toBeCloseTo((1 - expected.y) * 540);
  });

  it.each([[-40, -1], [40, 1]])('points toward a lateral goal at x=%s', (x, side) => {
    const p = projectObjective([x, 0, -5], camera(), 1920, 1080)!;
    expect(p.offscreen).toBe(true);
    expect(p.behind).toBe(false);
    expect(Math.sign(p.x - 960)).toBe(side);
    expect(Math.sign(Math.cos(p.angle))).toBe(side);
  });

  it.each([[-8, -1], [8, 1]])('does not mirror a rear goal at x=%s', (x, side) => {
    const p = projectObjective([x, 0, 20], camera(), 1920, 1080)!;
    expect(p.behind).toBe(true);
    expect(p.offscreen).toBe(true);
    expect(Math.sign(p.x - 960)).toBe(side);
  });

  it('holds the previous turn across the directly-behind seam', () => {
    for (const x of [-0.01, 0, 0.01]) {
      expect(projectObjective([x, 0, 10], camera(), 1920, 1080, -1)!.turnSide).toBe(-1);
    }
    expect(projectObjective([2, 0, 10], camera(), 1920, 1080, -1)!.turnSide).toBe(1);
  });

  it.each([[0, 20, -1], [0, -20, 1]])('points vertically without invalid coordinates: y=%s', (_x, y, side) => {
    const p = projectObjective([0, y, 0], camera(), 1920, 1080)!;
    expect(Math.sign(p.y - 540)).toBe(side);
    expect([p.x, p.y, p.angle].every(Number.isFinite)).toBe(true);
  });

  it('uses the current camera rotation and translation, not the previous render matrix', () => {
    const c = camera(); c.position.set(10, 2, 10); c.rotation.y = Math.PI;
    const p = projectObjective([10, 2, 20], c, 1920, 1080)!;
    expect(p.offscreen).toBe(false);
    expect(p.x).toBeCloseTo(960);
  });

  it('responds to ADS field of view', () => {
    expect(projectObjective([10, 0, -10], camera(), 1920, 1080)!.offscreen).toBe(false);
    expect(projectObjective([10, 0, -10], camera(54), 1920, 1080)!.offscreen).toBe(true);
  });

  it.each([[1920, 1080], [1366, 768], [1024, 768], [2560, 1080]])('keeps every offscreen bearing inside %s × %s', (width, height) => {
    const c = camera(75, width, height), b = indicatorBounds(width, height);
    for (let bearing = -Math.PI; bearing <= Math.PI; bearing += 0.025) {
      const p = projectObjective([Math.sin(bearing) * 20, 4, -Math.cos(bearing) * 20], c, width, height)!;
      if (!p.offscreen) continue;
      expect(p.x).toBeGreaterThanOrEqual(b.left - 0.001);
      expect(p.x).toBeLessThanOrEqual(b.right + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(b.top - 0.001);
      expect(p.y).toBeLessThanOrEqual(b.bottom + 0.001);
    }
  });

  it('rejects a zero-length or invalid target and an unusable viewport', () => {
    expect(projectObjective([0, 0, 0], camera(), 1920, 1080)).toBeNull();
    expect(projectObjective([NaN, 0, 1], camera(), 1920, 1080)).toBeNull();
    expect(projectObjective([1, 0, 1], camera(), 0, 1080)).toBeNull();
  });

  it('moves a corner marker clear of objective text and leaves room for its entire label', () => {
    const p = projectObjective([-10, 20, -1], camera(), 1366, 768)!;
    const occupied = [{ left: 32, top: 28, right: 510, bottom: 160 }];
    const result = avoidHud(p, 1366, 768, occupied)!;
    expect(result).not.toBeNull();
    expect(result.x - 70 > 510 || result.y - 21 > 160 || result.x + 70 < 32 || result.y + 21 < 28).toBe(true);
  });

  it('hides instead of covering UI when no free perimeter exists', () => {
    const p = projectObjective([20, 0, 1], camera(), 1920, 1080)!;
    expect(avoidHud(p, 1920, 1080, [{ left: 0, top: 0, right: 1920, bottom: 1080 }])).toBeNull();
  });
});
