import type { NarrationPlayback, TransitionCue } from './types';

export interface NarrationAsset {
  cueId: string;
  text: string;
  /** Relative to the game's asset base; never a provider download URL. */
  file: string;
  durationSeconds: number;
}

export interface NarrationMedia extends EventTarget {
  src: string;
  preload: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

/** One file per cue. Actual ended events, not manifest durations, advance the story. */
export class HtmlNarrationPlayer {
  private readonly assets = new Map<string, NarrationAsset>();
  private active?: NarrationPlayback;
  private media?: NarrationMedia;
  private volume = 1;
  private disposed = false;

  constructor(
    assets: readonly NarrationAsset[],
    private readonly baseURL: string | URL,
    private readonly createMedia: () => NarrationMedia = () => new Audio(),
  ) {
    for (const asset of assets) {
      if (this.assets.has(asset.cueId)) throw new Error(`旁白 ID 重复：${asset.cueId}`);
      if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0) throw new Error('旁白时长无效。');
      this.assets.set(asset.cueId, { ...asset });
    }
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    if (this.media) this.media.volume = this.volume;
  }

  play(cue: TransitionCue, signal: AbortSignal): NarrationPlayback {
    this.active?.stop();
    const unavailable = (): NarrationPlayback => ({
      finished: Promise.resolve('unavailable'), pause() {}, resume() {}, stop() {},
    });
    const asset = this.assets.get(cue.id);
    // An old recording must never read a revised subtitle.
    if (this.disposed || signal.aborted || !asset || asset.text !== cue.text) return unavailable();
    let url: URL;
    try {
      const base = new URL(this.baseURL);
      if (!asset.file || asset.file.startsWith('/') || asset.file.includes('\\') || asset.file.split('/').includes('..')) return unavailable();
      url = new URL(asset.file, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !['http:', 'https:', 'file:'].includes(url.protocol)) return unavailable();
    } catch { return unavailable(); }
    const media = this.createMedia();
    this.media = media;
    media.preload = 'auto'; media.volume = this.volume;
    let settled = false, paused = false, generation = 0;
    let settle!: (result: 'ended' | 'unavailable') => void;
    const finished = new Promise<'ended' | 'unavailable'>(resolve => { settle = resolve; });
    const finish = (result: 'ended' | 'unavailable') => {
      if (settled) return;
      settled = true; generation++;
      media.removeEventListener('ended', ended); media.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      media.pause(); media.removeAttribute('src'); media.load();
      if (this.media === media) this.media = undefined;
      settle(result);
    };
    const ended = () => finish('ended');
    const failed = () => finish('unavailable');
    const aborted = () => finish('unavailable');
    const begin = () => {
      if (settled || paused) return;
      const attempt = ++generation;
      try {
        void media.play().then(() => {
          // A pending play may resolve after pause/cancel. Never restart it then.
          if (settled || paused) media.pause();
        }, () => { if (!settled && !paused && attempt === generation) finish('unavailable'); });
      } catch { finish('unavailable'); }
    };
    const playback: NarrationPlayback = {
      finished,
      pause: () => { if (!settled) { paused = true; generation++; media.pause(); } },
      resume: () => { if (!settled && paused) { paused = false; begin(); } },
      stop: () => finish('unavailable'),
    };
    this.active = playback;
    media.addEventListener('ended', ended); media.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    media.src = url.href;
    begin();
    return playback;
  }

  dispose(): void { this.disposed = true; this.active?.stop(); this.active = undefined; this.assets.clear(); }
}
