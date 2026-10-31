/** Project starting budgets, not measured device capabilities or Three.js limits. */
export const RENDER_QUALITY_PROFILES = Object.freeze({
  low: Object.freeze({ maxDpr: 0.75, maxPixels: 589_824, shadowMapSize: 0 }),
  balanced: Object.freeze({ maxDpr: 1, maxPixels: 921_600, shadowMapSize: 1024 }),
  high: Object.freeze({ maxDpr: 1.5, maxPixels: 4_665_600, shadowMapSize: 2048 }),
});

export type RenderQuality = keyof typeof RENDER_QUALITY_PROFILES;
export interface RenderViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
  /** Supply the minimum supported texture/renderbuffer dimension when known. */
  maxBufferDimension?: number;
}
export interface RenderQualityPlan {
  readonly quality: RenderQuality;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly shadowMapSize: number;
}

export function isRenderQuality(value: unknown): value is RenderQuality {
  return value === 'low' || value === 'balanced' || value === 'high';
}

/**
 * No DOM or GPU work. Call on creation, resize, DPR change or quality change.
 * A zero/invalid transient viewport returns null: keep the previous allocation.
 * CSS dimensions stay unchanged, so HUD sizing and input coordinates are not scaled.
 */
export function planRenderQuality(quality: RenderQuality, viewport: RenderViewport): RenderQualityPlan | null {
  const { width, height } = viewport;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const cssWidth = Math.floor(width), cssHeight = Math.floor(height);
  const area = cssWidth * cssHeight;
  if (!Number.isSafeInteger(area)) return null;
  const profile = RENDER_QUALITY_PROFILES[quality];
  const nativeDpr = Number.isFinite(viewport.devicePixelRatio) && viewport.devicePixelRatio > 0 ? viewport.devicePixelRatio : 1;
  const requestedDimension = viewport.maxBufferDimension;
  const maxDimension = requestedDimension !== undefined && Number.isFinite(requestedDimension) && requestedDimension >= 1
    ? Math.min(4096, Math.floor(requestedDimension)) : 4096;
  const pixelRatio = Math.min(nativeDpr, profile.maxDpr, Math.sqrt(profile.maxPixels / area),
    maxDimension / cssWidth, maxDimension / cssHeight);
  const bufferWidth = Math.floor(cssWidth * pixelRatio), bufferHeight = Math.floor(cssHeight * pixelRatio);
  if (bufferWidth < 1 || bufferHeight < 1) return null;
  const shadowMapSize = Math.min(profile.shadowMapSize, 2 ** Math.floor(Math.log2(maxDimension)));
  return { quality, cssWidth, cssHeight, pixelRatio, bufferWidth, bufferHeight, shadowMapSize };
}

export const QUALITY_TIMING = Object.freeze({
  warmupMs: 5000,
  windowMs: 2000,
  slowMeanMs: 40,
  consecutiveSlowWindows: 2,
  cooldownMs: 15000,
  maxContiguousFrameMs: 1000,
});

export type QualityBoundary = 'initial' | 'viewport' | 'scene' | 'lifecycle' | 'context' | 'manual' | 'clock-gap' | 'downshift';
export interface QualityDownshift {
  readonly previous: RenderQuality;
  readonly quality: RenderQuality;
  readonly reason: 'sustained-slow-frames';
  readonly meanFrameMs: number;
  readonly samples: number;
}

/**
 * Optional downshift guard; disabled by default until the lead opts in.
 * It observes raw consecutive RAF timestamps, not the clamped simulation delta.
 * Frame cadence alone cannot classify CPU/GPU bottlenecks or certify performance.
 * It owns no RAF, event listener, timer, renderer, physics clock or game state.
 */
export class RenderQualityPolicy {
  private quality: RenderQuality;
  private adaptive: boolean;
  private previousTime: number | undefined;
  private eligible = false;
  private holdRemainingMs: number = QUALITY_TIMING.warmupMs;
  private windowMs = 0;
  private windowSamples = 0;
  private slowWindows = 0;
  private boundary: QualityBoundary = 'initial';

  constructor(options: { quality?: RenderQuality; adaptive?: boolean } = {}) {
    this.quality = options.quality ?? 'balanced';
    this.adaptive = options.adaptive ?? false;
  }

  get currentQuality(): RenderQuality { return this.quality; }
  get state(): Readonly<{ quality: RenderQuality; adaptive: boolean; holdRemainingMs: number; slowWindows: number; boundary: QualityBoundary }> {
    return { quality: this.quality, adaptive: this.adaptive, holdRemainingMs: this.holdRemainingMs,
      slowWindows: this.slowWindows, boundary: this.boundary };
  }

  /** Manual selections lock the level unless the caller explicitly opts in again. */
  setQuality(quality: RenderQuality, adaptive = false): void {
    this.quality = quality;
    this.adaptive = adaptive;
    this.invalidate('manual');
  }

  /** Keep the chosen level; discard stale observations and restart settling time. */
  invalidate(reason: QualityBoundary): void {
    this.previousTime = undefined;
    this.eligible = false;
    const hold = reason === 'downshift' ? QUALITY_TIMING.cooldownMs : QUALITY_TIMING.warmupMs;
    // Rotating, switching chapters or hiding the page cannot shorten a cooldown.
    this.holdRemainingMs = reason === 'manual' ? hold : Math.max(this.holdRemainingMs, hold);
    this.windowMs = 0;
    this.windowSamples = 0;
    this.slowWindows = 0;
    this.boundary = reason;
  }

  /** eligible = visible && playing && !historySuspended && !contextLost. */
  recordFrame(timestampMs: number, eligible: boolean): QualityDownshift | null {
    if (!eligible || !Number.isFinite(timestampMs) || timestampMs < 0) {
      if (this.eligible || this.previousTime !== undefined) this.invalidate('lifecycle');
      return null;
    }
    if (!this.eligible || this.previousTime === undefined) {
      this.eligible = true;
      this.previousTime = timestampMs;
      return null;
    }
    const elapsed = timestampMs - this.previousTime;
    this.previousTime = timestampMs;
    if (elapsed <= 0 || elapsed > QUALITY_TIMING.maxContiguousFrameMs) {
      this.invalidate('clock-gap');
      this.eligible = true;
      this.previousTime = timestampMs;
      return null;
    }
    if (!this.adaptive || this.quality === 'low') return null;
    if (this.holdRemainingMs > 0) {
      this.holdRemainingMs = Math.max(0, this.holdRemainingMs - elapsed);
      return null;
    }
    this.windowMs += elapsed;
    this.windowSamples++;
    if (this.windowMs < QUALITY_TIMING.windowMs) return null;
    const meanFrameMs = this.windowMs / this.windowSamples, samples = this.windowSamples;
    this.slowWindows = meanFrameMs >= QUALITY_TIMING.slowMeanMs ? this.slowWindows + 1 : 0;
    this.windowMs = 0;
    this.windowSamples = 0;
    if (this.slowWindows < QUALITY_TIMING.consecutiveSlowWindows) return null;
    const previous = this.quality;
    this.quality = previous === 'high' ? 'balanced' : 'low';
    this.invalidate('downshift');
    return { previous, quality: this.quality, reason: 'sustained-slow-frames', meanFrameMs, samples };
  }
}
