import { describe, expect, it } from 'vitest';
import { isRenderQuality, planRenderQuality, RENDER_QUALITY_PROFILES, RenderQualityPolicy, type QualityDownshift, type RenderQuality } from '../../src/mobile-performance/RenderQualityPolicy';

describe('render allocation budgets', () => {
  it('preserves CSS coordinates and updates the pixel budget for native DPR changes', () => {
    const small = planRenderQuality('high', { width: 844, height: 390, devicePixelRatio: 1 })!;
    const retina = planRenderQuality('high', { width: 844, height: 390, devicePixelRatio: 3 })!;
    expect([small.cssWidth, small.cssHeight, retina.cssWidth, retina.cssHeight]).toEqual([844, 390, 844, 390]);
    expect([small.pixelRatio, retina.pixelRatio]).toEqual([1, 1.5]);
    expect([retina.bufferWidth, retina.bufferHeight]).toEqual([1266, 585]);
  });

  it('retains the existing 1080p desktop allocation in high, with an explicit ceiling', () => {
    const plan = planRenderQuality('high', { width: 1920, height: 1080, devicePixelRatio: 3 })!;
    expect([plan.bufferWidth, plan.bufferHeight, plan.shadowMapSize]).toEqual([2880, 1620, 2048]);
  });

  it('bounds large and rotated viewports without imposing a minimum DPR that defeats the cap', () => {
    for (const quality of ['low', 'balanced', 'high'] as const) {
      for (const [width, height] of [[844, 390], [390, 844], [2560, 1440], [7680, 4320], [4320, 7680]]) {
        const plan = planRenderQuality(quality, { width, height, devicePixelRatio: 4 })!;
        expect(plan.bufferWidth * plan.bufferHeight).toBeLessThanOrEqual(RENDER_QUALITY_PROFILES[quality].maxPixels);
        expect(plan.pixelRatio).toBeLessThanOrEqual(RENDER_QUALITY_PROFILES[quality].maxDpr);
        expect(Math.max(plan.bufferWidth, plan.bufferHeight)).toBeLessThanOrEqual(4096);
        expect([plan.cssWidth, plan.cssHeight]).toEqual([width, height]);
      }
    }
    expect(planRenderQuality('low', { width: 7680, height: 4320, devicePixelRatio: 4 })!.pixelRatio).toBeLessThan(0.5);
  });

  it('honours a smaller native DPR and a hardware dimension limit', () => {
    expect(planRenderQuality('balanced', { width: 844, height: 390, devicePixelRatio: 0.8 })!.pixelRatio).toBe(0.8);
    const plan = planRenderQuality('high', { width: 1920, height: 1080, devicePixelRatio: 3, maxBufferDimension: 1024 })!;
    expect(plan.bufferWidth).toBe(1024);
    expect(plan.bufferHeight).toBe(576);
    expect(plan.shadowMapSize).toBe(1024);
  });

  it('does not allocate zero or invalid transient viewports and falls back for invalid DPR', () => {
    for (const width of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(planRenderQuality('balanced', { width, height: 390, devicePixelRatio: 2 })).toBeNull();
    }
    expect(planRenderQuality('balanced', { width: 844, height: 0, devicePixelRatio: 2 })).toBeNull();
    expect(planRenderQuality('balanced', { width: 844, height: 390, devicePixelRatio: NaN })!.pixelRatio).toBe(1);
    expect(planRenderQuality('low', { width: 1_000_000, height: 1, devicePixelRatio: 1 })).toBeNull();
    expect(isRenderQuality('balanced')).toBe(true);
    expect(isRenderQuality('constructor')).toBe(false);
    expect(isRenderQuality(null)).toBe(false);
  });
});

function frames(policy: RenderQualityPolicy, clock: { now: number }, ms: number, stepMs: number, eligible = true): QualityDownshift[] {
  const changes: QualityDownshift[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    clock.now += stepMs;
    const change = policy.recordFrame(clock.now, eligible);
    if (change) changes.push(change);
  }
  return changes;
}

describe('optional rendering-only downshift guard', () => {
  it('does not change a locked selection, even during sustained slow frames', () => {
    const policy = new RenderQualityPolicy({ quality: 'high' });
    expect(frames(policy, { now: 0 }, 60_000, 50)).toEqual([]);
    expect(policy.currentQuality).toBe('high');
  });

  it('warms up, requires two slow windows, then holds the new quality before another change', () => {
    const policy = new RenderQualityPolicy({ quality: 'high', adaptive: true }), clock = { now: 0 };
    policy.recordFrame(0, true);
    expect(frames(policy, clock, 5000, 50)).toEqual([]);
    expect(frames(policy, clock, 2000, 50)).toEqual([]);
    expect(policy.state.slowWindows).toBe(1);
    expect(frames(policy, clock, 2000, 50)).toEqual([
      { previous: 'high', quality: 'balanced', reason: 'sustained-slow-frames', meanFrameMs: 50, samples: 40 },
    ]);
    expect(frames(policy, clock, 15_000, 50)).toEqual([]);
    expect(policy.currentQuality).toBe('balanced');
    expect(frames(policy, clock, 4100, 50).map(change => change.quality)).toEqual(['low']);
    expect(frames(policy, clock, 60_000, 10)).toEqual([]);
    expect(policy.currentQuality).toBe('low');
  });

  it('does not accumulate nonconsecutive slow windows or react to one isolated stall', () => {
    const policy = new RenderQualityPolicy({ quality: 'high', adaptive: true }), clock = { now: 0 };
    policy.recordFrame(0, true);
    frames(policy, clock, 7000, 50);
    expect(policy.state.slowWindows).toBe(1);
    frames(policy, clock, 2100, 30);
    expect(policy.state.slowWindows).toBe(0);
    clock.now += 200;
    expect(policy.recordFrame(clock.now, true)).toBeNull();
    expect(frames(policy, clock, 2100, 16)).toEqual([]);
    expect(policy.currentQuality).toBe('high');
  });

  it('discards paused/background history and starts a fresh warmup after return', () => {
    const policy = new RenderQualityPolicy({ quality: 'balanced', adaptive: true }), clock = { now: 0 };
    policy.recordFrame(0, true);
    frames(policy, clock, 7000, 50);
    expect(policy.state.slowWindows).toBe(1);
    frames(policy, clock, 60_000, 1000, false);
    expect(policy.state.slowWindows).toBe(0);
    expect(frames(policy, clock, 7050, 50)).toEqual([]);
    expect(policy.currentQuality).toBe('balanced');
    expect(frames(policy, clock, 2000, 50).map(change => change.quality)).toEqual(['low']);
  });

  it('resets after viewport/scene boundaries and never shortens an existing cooldown', () => {
    const policy = new RenderQualityPolicy({ quality: 'high', adaptive: true }), clock = { now: 0 };
    policy.recordFrame(0, true);
    frames(policy, clock, 9000, 50);
    expect(policy.currentQuality).toBe('balanced');
    expect(policy.state.holdRemainingMs).toBe(15_000);
    policy.invalidate('viewport');
    expect(policy.state.holdRemainingMs).toBe(15_000);
    frames(policy, clock, 5000, 50);
    const remaining = policy.state.holdRemainingMs;
    policy.invalidate('scene');
    expect(policy.state.holdRemainingMs).toBe(remaining);
    expect(policy.state.slowWindows).toBe(0);
    expect(frames(policy, clock, remaining, 50)).toEqual([]);
  });

  it('ignores clock discontinuities instead of treating them as slow gameplay', () => {
    const policy = new RenderQualityPolicy({ quality: 'high', adaptive: true }), clock = { now: 0 };
    policy.recordFrame(0, true);
    frames(policy, clock, 7000, 50);
    expect(policy.recordFrame(clock.now + 120_000, true)).toBeNull();
    expect(policy.state.boundary).toBe('clock-gap');
    expect(policy.state.slowWindows).toBe(0);
    expect(policy.recordFrame(1, true)).toBeNull();
    expect(policy.recordFrame(NaN, true)).toBeNull();
    expect(policy.currentQuality).toBe('high');
  });

  it('allows deliberate manual selection while disabling automatic changes by default', () => {
    const policy = new RenderQualityPolicy({ quality: 'balanced', adaptive: true });
    policy.setQuality('high');
    expect(policy.state.adaptive).toBe(false);
    expect(frames(policy, { now: 0 }, 60_000, 50)).toEqual([]);
    expect(policy.currentQuality).toBe('high');
  });

  it('treats a steady 30 fps cadence as within the guard band', () => {
    for (const quality of ['balanced', 'high'] as RenderQuality[]) {
      const policy = new RenderQualityPolicy({ quality, adaptive: true });
      expect(frames(policy, { now: 0 }, 60_000, 1000 / 30)).toEqual([]);
      expect(policy.currentQuality).toBe(quality);
    }
  });
});
