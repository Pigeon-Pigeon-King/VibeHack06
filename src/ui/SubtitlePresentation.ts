import type { RunMode } from '../contracts';

interface SubtitleInput {
  mode: RunMode;
  epoch: number;
  time: number;
  revision: number;
  text: string;
  speaker: string;
  reducedMotion: boolean;
}

export interface SubtitleLayer {
  text: string;
  speaker: string;
  opacity: number;
  offsetY: number;
}

export interface SubtitleFrame {
  visible: boolean;
  current: SubtitleLayer;
  outgoing: SubtitleLayer;
  panelOpacity: number;
}

interface Cue {
  text: string;
  speaker: string;
  revision: number;
  startedAt: number;
  endsAt: number;
}

interface LeavingCue extends Cue {
  alpha: number;
  fadeStartedAt: number;
  fadeEndsAt: number;
}

const blank = (): SubtitleLayer => ({ text: '', speaker: '', opacity: 0, offsetY: 0 });
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Presentation only: no dialogue queue and no wall-clock timers. */
export class SubtitlePresentation {
  private epoch?: number;
  private time?: number;
  private current?: Cue;
  private outgoing?: LeavingCue;

  update(input: SubtitleInput): SubtitleFrame {
    const time = Number.isFinite(input.time) ? input.time : this.time ?? 0;
    if (input.epoch !== this.epoch || this.time !== undefined && time < this.time - 0.000001) {
      this.clear();
      this.epoch = input.epoch;
    }
    if (input.mode !== 'playing' && input.mode !== 'paused') {
      this.clear();
      this.epoch = input.epoch;
      this.time = time;
      return this.frame(time, false, input.reducedMotion);
    }
    // Menus hide the HUD, but do not consume the remaining line or its fade.
    if (input.mode === 'paused') return this.frame(this.time ?? time, false, input.reducedMotion);

    this.time = time;
    const hasText = Boolean(input.text) && Number.isFinite(input.revision) && input.revision > time;
    if (hasText && this.current?.text === input.text && this.current.speaker === input.speaker) {
      // Repeated warnings may refresh every simulation tick. Extend the authored
      // deadline without restarting an already visible line's entrance.
      this.current.revision = input.revision;
      this.current.endsAt = input.revision;
    } else if (hasText) {
      this.leaveCurrent(time, input.reducedMotion);
      this.current = {
        text: input.text, speaker: input.speaker, revision: input.revision,
        startedAt: time, endsAt: input.revision,
      };
    } else if (this.current) {
      this.leaveCurrent(time, input.reducedMotion);
      this.current = undefined;
    }
    if (this.outgoing && time >= this.outgoing.fadeEndsAt) this.outgoing = undefined;
    return this.frame(time, true, input.reducedMotion);
  }

  clear(): void {
    this.current = undefined;
    this.outgoing = undefined;
    this.epoch = undefined;
    this.time = undefined;
  }

  private alpha(cue: Cue, time: number, reduced: boolean): number {
    const durationIn = reduced ? 0.035 : 0.16;
    const durationOut = reduced ? 0.035 : 0.18;
    return Math.min(smooth((time - cue.startedAt) / durationIn), smooth((cue.endsAt - time) / durationOut));
  }

  private leavingAlpha(time: number): number {
    const cue = this.outgoing;
    if (!cue || time >= cue.fadeEndsAt) return 0;
    return cue.alpha * (1 - smooth((time - cue.fadeStartedAt) / (cue.fadeEndsAt - cue.fadeStartedAt)));
  }

  private leaveCurrent(time: number, reduced: boolean): void {
    if (!this.current) return;
    const alpha = this.alpha(this.current, time, reduced);
    // During rapid changes retain at most the stronger fading layer. Its original
    // end is never postponed; discarded intermediate lines are never replayed.
    if (alpha <= this.leavingAlpha(time)) return;
    const fadeEndsAt = Math.min(this.current.endsAt, time + (reduced ? 0.035 : 0.12));
    if (alpha <= 0 || fadeEndsAt <= time) return;
    this.outgoing = { ...this.current, alpha, fadeStartedAt: time, fadeEndsAt };
  }

  private frame(time: number, playing: boolean, reduced: boolean): SubtitleFrame {
    const layer = (cue: Cue | undefined, opacity: number): SubtitleLayer => cue && opacity > 0
      ? { text: cue.text, speaker: cue.speaker, opacity, offsetY: reduced ? 0 : (1 - opacity) * 4 }
      : blank();
    // Keep the incoming text in the DOM at opacity zero, so the pair is announced
    // once and its layout is ready before the first visible animation frame.
    const current = this.current ? {
      text: this.current.text, speaker: this.current.speaker,
      opacity: this.alpha(this.current, time, reduced),
      offsetY: reduced ? 0 : (1 - this.alpha(this.current, time, reduced)) * 4,
    } : blank();
    const outgoing = layer(this.outgoing, this.leavingAlpha(time));
    const panelOpacity = Math.max(current.opacity, outgoing.opacity);
    return { current, outgoing, panelOpacity, visible: playing && Boolean(current.text || outgoing.text) };
  }
}
