import type {
  NarrationPlayback, TransitionCue, TransitionError, TransitionLoadState,
  TransitionNarrationState, TransitionPhase, TransitionPorts, TransitionScript, TransitionSnapshot,
} from './types';

interface LoadAttempt {
  readonly abort: AbortController;
}

interface Voice {
  readonly abort: AbortController;
  playback?: NarrationPlayback;
  outcome: 'pending' | 'ended' | 'unavailable';
}

interface Run<T> {
  readonly bridge: TransitionScript;
  phase: TransitionPhase;
  loadState: TransitionLoadState;
  loadProgress: number | null;
  loadAttempt?: LoadAttempt;
  /** A wrapper allows undefined to be a valid prepared value. */
  prepared?: { value: T };
  narrationState: TransitionNarrationState;
  cueIndex: number;
  cueElapsedSeconds: number;
  voice?: Voice;
  entryAttempted: boolean;
  error: TransitionError | null;
}

/** Seconds for which a missing voice still leaves its subtitle readable. */
function readingSeconds(cue: TransitionCue): number {
  return Number.isFinite(cue.readingSeconds) ? Math.min(45, Math.max(2, cue.readingSeconds)) : 6;
}

function failure(stage: TransitionError['stage'], cause: unknown): TransitionError {
  const fallback = stage === 'load' ? '下一段加载失败。' : '下一段进入失败。';
  return { stage, message: cause instanceof Error ? cause.message || fallback : typeof cause === 'string' && cause ? cause : fallback, cause };
}

/**
 * Owns narration and preparation before chapter entry, not mission completion or persistence.
 * Promise callbacks only record outcomes. Narration advances and enter commits in tick.
 */
export class TransitionController<T> {
  private run?: Run<T>;
  private paused = false;
  private disposed = false;

  constructor(private readonly ports: TransitionPorts<T>) {}

  get snapshot(): TransitionSnapshot {
    const run = this.run;
    const active = run?.phase === 'active';
    const cue = active ? run.bridge.cues[run.cueIndex] ?? null : null;
    return {
      phase: this.disposed ? 'disposed' : run?.phase ?? 'idle',
      bridge: run?.bridge ?? null,
      paused: this.paused,
      loadState: run?.loadState ?? 'idle',
      loadProgress: run?.loadProgress ?? null,
      narrationState: run?.narrationState ?? 'idle',
      cue,
      cueIndex: active ? run.cueIndex : -1,
      cueCount: run?.bridge.cues.length ?? 0,
      cueElapsedSeconds: cue ? run!.cueElapsedSeconds : 0,
      error: run?.error ?? null,
      canSkip: Boolean(active && !this.paused && !run.entryAttempted && !this.narrationFinished(run)),
      canRetryLoad: Boolean(active && !run.entryAttempted && run.loadState === 'failed'),
    };
  }

  /** Same active/entered bridge ID is idempotent; another bridge cancels the old run. */
  start(bridge: TransitionScript): boolean {
    if (this.disposed) return false;
    if (this.run && (this.run.phase === 'active' || this.run.phase === 'entered') && this.run.bridge.id === bridge.id) return false;
    this.cancel();
    // Keep authoring data stable even if the caller later replaces or edits its object.
    const copiedBridge: TransitionScript = { ...bridge, cues: bridge.cues.map(cue => ({ ...cue })) };
    const run: Run<T> = {
      bridge: copiedBridge, phase: 'active', loadState: 'idle', loadProgress: null,
      narrationState: 'idle', cueIndex: 0, cueElapsedSeconds: 0,
      entryAttempted: false, error: null,
    };
    this.run = run;
    this.beginLoad(run);
    if (this.isActive(run)) this.beginCue(run);
    return true;
  }

  /** Host supplies active elapsed time and setsPaused for pause, blur and hidden tabs. */
  tick(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) return;
    const run = this.run;
    if (!run || !this.isActive(run) || this.paused || run.entryAttempted) return;
    this.advanceNarration(run, dtSeconds);
    this.tryEnter(run);
  }

  /** Skip the whole bridge narration. Loading and entry remain independently gated. */
  skip(): void {
    const run = this.run;
    if (!run || !this.isActive(run) || this.paused || run.entryAttempted || this.narrationFinished(run)) return;
    run.narrationState = 'skipped';
    run.cueIndex = run.bridge.cues.length;
    run.cueElapsedSeconds = 0;
    this.stopVoice(run);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    const run = this.run, voice = run?.voice;
    if (!run || !this.isActive(run) || !voice?.playback || voice.outcome !== 'pending') return;
    try {
      if (paused) voice.playback.pause();
      else voice.playback.resume();
    } catch {
      this.useReadingFallback(run);
    }
  }

  /** Retries only a failed preload; it never replays or skips narration. */
  retryLoad(): boolean {
    const run = this.run;
    if (!run || !this.isActive(run) || run.entryAttempted || run.loadState !== 'failed') return false;
    this.beginLoad(run);
    return true;
  }

  cancel(): void {
    const run = this.run;
    if (!run || this.disposed || run.phase === 'cancelled' || run.phase === 'disposed') return;
    run.phase = 'cancelled';
    this.cleanUp(run);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    if (this.run) this.run.phase = 'disposed';
  }

  private isActive(run: Run<T>): boolean {
    return !this.disposed && this.run === run && run.phase === 'active';
  }

  private narrationFinished(run: Run<T>): boolean {
    return run.narrationState === 'complete' || run.narrationState === 'skipped';
  }

  private beginLoad(run: Run<T>): void {
    run.loadAttempt?.abort.abort();
    const attempt: LoadAttempt = { abort: new AbortController() };
    run.loadAttempt = attempt;
    run.loadState = 'loading';
    run.loadProgress = null;
    run.error = null;
    const isCurrent = () => this.isActive(run) && run.loadAttempt === attempt && !attempt.abort.signal.aborted && !run.entryAttempted;
    const rejected = (cause: unknown) => {
      if (!isCurrent()) return;
      run.loadState = 'failed';
      run.error = failure('load', cause);
    };
    try {
      const pending = this.ports.preload(run.bridge, attempt.abort.signal, fraction => {
        if (!isCurrent() || run.loadState !== 'loading' || !Number.isFinite(fraction)) return;
        run.loadProgress = Math.max(run.loadProgress ?? 0, Math.min(1, Math.max(0, fraction)));
      });
      Promise.resolve(pending).then(prepared => {
        if (!isCurrent()) {
          this.release(prepared);
          return;
        }
        run.prepared = { value: prepared };
        run.loadState = 'ready';
        run.loadProgress = 1;
      }, rejected);
    } catch (cause) {
      rejected(cause);
    }
  }

  private beginCue(run: Run<T>): void {
    const cue = run.bridge.cues[run.cueIndex];
    run.cueElapsedSeconds = 0;
    if (!cue) {
      run.narrationState = 'complete';
      return;
    }
    if (!this.ports.narration) {
      run.narrationState = 'reading';
      return;
    }
    const voice: Voice = { abort: new AbortController(), outcome: 'pending' };
    run.voice = voice;
    run.narrationState = 'playing';
    try {
      voice.playback = this.ports.narration.play(cue, voice.abort.signal);
      const settled = (outcome: 'ended' | 'unavailable') => {
        if (this.isActive(run) && run.voice === voice && !voice.abort.signal.aborted) voice.outcome = outcome;
      };
      Promise.resolve(voice.playback.finished).then(settled, () => settled('unavailable'));
      if (this.paused) voice.playback.pause();
    } catch {
      this.useReadingFallback(run);
    }
  }

  private advanceNarration(run: Run<T>, dtSeconds: number): void {
    let remaining = dtSeconds;
    while (this.isActive(run) && !this.paused && !this.narrationFinished(run)) {
      const cue = run.bridge.cues[run.cueIndex];
      if (!cue) { run.narrationState = 'complete'; return; }
      const duration = readingSeconds(cue);
      if (run.voice?.outcome === 'ended') {
        this.nextCue(run);
        // The audio event has no timestamp on the host clock; do not charge its
        // preceding frame to the next subtitle.
        remaining = 0;
        continue;
      }
      if (run.voice?.outcome === 'unavailable') this.useReadingFallback(run);
      if (run.narrationState === 'playing') {
        run.cueElapsedSeconds += remaining;
        remaining = 0;
        // A broken/muted adapter must not deadlock a chapter. This is a generous
        // active-time audio watchdog, never a deadline on next-chapter loading.
        if (run.cueElapsedSeconds < Math.max(30, duration * 3)) return;
        this.useReadingFallback(run);
      }
      const consumed = Math.min(remaining, Math.max(0, duration - run.cueElapsedSeconds));
      run.cueElapsedSeconds += consumed;
      remaining -= consumed;
      if (run.cueElapsedSeconds < duration) return;
      this.nextCue(run);
    }
  }

  private nextCue(run: Run<T>): void {
    this.stopVoice(run);
    if (!this.isActive(run)) return;
    run.cueIndex += 1;
    this.beginCue(run);
  }

  private useReadingFallback(run: Run<T>): void {
    this.stopVoice(run);
    if (this.isActive(run) && !this.narrationFinished(run)) run.narrationState = 'reading';
  }

  private stopVoice(run: Run<T>): void {
    const voice = run.voice;
    run.voice = undefined;
    if (!voice) return;
    voice.abort.abort();
    try { voice.playback?.stop(); } catch { /* Cleanup cannot reopen a cancelled run. */ }
  }

  private tryEnter(run: Run<T>): void {
    if (!this.isActive(run) || this.paused || run.entryAttempted || run.error || run.loadState !== 'ready' || !run.prepared || !this.narrationFinished(run)) return;
    const prepared = run.prepared.value;
    run.prepared = undefined;
    run.entryAttempted = true;
    run.phase = 'entered';
    // Detach before calling the host, which may cancel the overlay from enter.
    run.loadAttempt = undefined;
    try {
      this.ports.enter(prepared, run.bridge);
    } catch (cause) {
      this.release(prepared);
      if (this.run === run && run.phase === 'entered') {
        run.phase = 'active';
        run.error = failure('enter', cause);
      }
    }
  }

  private cleanUp(run: Run<T>): void {
    run.loadAttempt?.abort.abort();
    run.loadAttempt = undefined;
    this.stopVoice(run);
    const prepared = run.prepared;
    run.prepared = undefined;
    if (prepared) this.release(prepared.value);
  }

  private release(prepared: T): void {
    try { this.ports.release(prepared); } catch { /* The host owns its cleanup diagnostics. */ }
  }
}
