import type { ChapterStageId } from '../content/chapter-flow';

export interface TransitionCue {
  readonly id: string;
  readonly text: string;
  readonly readingSeconds: number;
}

export interface ChapterBridge {
  readonly id: string;
  readonly from: ChapterStageId;
  readonly to: ChapterStageId;
  readonly heading: string;
  readonly kicker: string;
  readonly cues: readonly TransitionCue[];
}

/** The new-campaign introduction has no preceding chapter or inherited facts. */
export interface CampaignOpening {
  readonly id: string;
  readonly from: null;
  readonly to: 'S01';
  readonly heading: string;
  readonly kicker: string;
  readonly cues: readonly TransitionCue[];
}

export type TransitionScript = ChapterBridge | CampaignOpening;

export interface NarrationPlayback {
  /** Settle even when muted; unavailable covers missing, blocked or failed audio. */
  readonly finished: Promise<'ended' | 'unavailable'>;
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface TransitionPorts<T> {
  /** Prepare without activating the next chapter or changing the current save. */
  preload(bridge: TransitionScript, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<T>;
  /** Synchronous, atomic ownership transfer. A throw means no activation or save occurred. */
  enter(prepared: T, bridge: TransitionScript): void;
  /** Release controller-owned preparations, including late results after cancellation. */
  release(prepared: T): void;
  readonly narration?: {
    play(cue: TransitionCue, signal: AbortSignal): NarrationPlayback;
  };
}

export type TransitionPhase = 'idle' | 'active' | 'entered' | 'cancelled' | 'disposed';
export type TransitionLoadState = 'idle' | 'loading' | 'ready' | 'failed';
export type TransitionNarrationState = 'idle' | 'playing' | 'reading' | 'complete' | 'skipped';

export interface TransitionError {
  readonly stage: 'load' | 'enter';
  readonly message: string;
  readonly cause: unknown;
}

export interface TransitionSnapshot {
  readonly phase: TransitionPhase;
  readonly bridge: TransitionScript | null;
  readonly paused: boolean;
  readonly loadState: TransitionLoadState;
  /** 0..1 when supplied by the loader; null means indeterminate. */
  readonly loadProgress: number | null;
  readonly narrationState: TransitionNarrationState;
  readonly cue: TransitionCue | null;
  /** Zero-based while showing a cue; cueCount after completion or skip; -1 when inactive. */
  readonly cueIndex: number;
  readonly cueCount: number;
  readonly cueElapsedSeconds: number;
  readonly error: TransitionError | null;
  readonly canSkip: boolean;
  readonly canRetryLoad: boolean;
}
