import { describe, expect, it, vi } from 'vitest';
import { TransitionController } from '../../src/chapter-transition/TransitionController';
import type { ChapterBridge, NarrationPlayback, TransitionCue } from '../../src/chapter-transition/types';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const cue = (id: string, readingSeconds = 2): TransitionCue => ({ id, text: `${id}的字幕。`, readingSeconds });
const bridge = (cues: readonly TransitionCue[] = [cue('a'), cue('b')], id = 'S01-S02'): ChapterBridge => ({
  id, from: 'S01', to: 'S02', heading: '主厅', kicker: '同一场撤离', cues,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function setup(withVoice = true, content = bridge()) {
  type Prepared = { name: string };
  const loads: { pending: ReturnType<typeof deferred<Prepared>>; signal: AbortSignal; progress: (fraction: number) => void }[] = [];
  const voices: { pending: ReturnType<typeof deferred<'ended' | 'unavailable'>>; signal: AbortSignal; cue: TransitionCue; playback: NarrationPlayback }[] = [];
  const preload = vi.fn((_bridge: ChapterBridge, signal: AbortSignal, progress: (fraction: number) => void) => {
    const pending = deferred<Prepared>();
    loads.push({ pending, signal, progress });
    return pending.promise;
  });
  const play = vi.fn((line: TransitionCue, signal: AbortSignal): NarrationPlayback => {
    const pending = deferred<'ended' | 'unavailable'>();
    const playback: NarrationPlayback = { finished: pending.promise, pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
    voices.push({ pending, signal, cue: line, playback });
    return playback;
  });
  const enter = vi.fn(), release = vi.fn();
  const controller = new TransitionController<Prepared>({ preload, enter, release, narration: withVoice ? { play } : undefined });
  return { controller, content, preload, loads, play, voices, enter, release };
}

describe('chapter transition controller', () => {
  it('starts preload and narration together, then waits for audio even when the chapter is ready', async () => {
    const h = setup(true, bridge([cue('a')]));
    expect(h.controller.start(h.content)).toBe(true);
    expect(h.preload).toHaveBeenCalledTimes(1);
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot).toMatchObject({ phase: 'active', loadState: 'loading', narrationState: 'playing', cueIndex: 0 });
    const prepared = { name: 'next chapter' };
    h.loads[0].pending.resolve(prepared); await flush();
    h.controller.tick(3);
    expect(h.enter).not.toHaveBeenCalled();
    expect(h.controller.snapshot.cue?.id).toBe('a');
    h.voices[0].pending.resolve('ended'); await flush();
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledExactlyOnceWith(prepared, h.content);
    expect(h.controller.snapshot.phase).toBe('entered');
    h.controller.tick(100); h.controller.skip(); h.controller.retryLoad();
    expect(h.controller.start(h.content)).toBe(false);
    expect(h.enter).toHaveBeenCalledTimes(1);
    expect(h.release).not.toHaveBeenCalled();
  });

  it('advances subtitles on each real ended event, then waits indefinitely for loading', async () => {
    const h = setup(); h.controller.start(h.content);
    h.voices[0].pending.resolve('ended'); await flush();
    expect(h.controller.snapshot.cue?.id).toBe('a');
    h.controller.tick(0);
    expect(h.controller.snapshot.cue?.id).toBe('b');
    expect(h.voices[0].signal.aborted).toBe(true);
    h.voices[1].pending.resolve('ended'); await flush(); h.controller.tick(0);
    expect(h.controller.snapshot).toMatchObject({ narrationState: 'complete', loadState: 'loading', cue: null });
    h.controller.tick(10000);
    expect(h.enter).not.toHaveBeenCalled();
    h.loads[0].pending.resolve({ name: 'slow chapter' }); await flush();
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('skips all narration without cancelling loading or synchronously entering', async () => {
    const h = setup(); h.controller.start(h.content);
    h.controller.skip(); h.controller.skip();
    expect(h.controller.snapshot).toMatchObject({ narrationState: 'skipped', cue: null, cueIndex: 2, canSkip: false });
    expect(h.voices[0].playback.stop).toHaveBeenCalledTimes(1);
    expect(h.voices[0].signal.aborted).toBe(true);
    expect(h.loads[0].signal.aborted).toBe(false);
    h.controller.tick(60); expect(h.enter).not.toHaveBeenCalled();
    h.loads[0].pending.resolve({ name: 'ready' });
    h.voices[0].pending.resolve('ended'); await flush();
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledTimes(1);
    expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('uses authored visible time without audio and carries a slow active frame across cues', async () => {
    const h = setup(false, bridge([cue('a', 10), cue('b', 3)]));
    h.controller.start(h.content); h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    h.controller.tick(9.5);
    expect(h.controller.snapshot).toMatchObject({ narrationState: 'reading', cueIndex: 0, cueElapsedSeconds: 9.5 });
    h.controller.tick(1);
    expect(h.controller.snapshot).toMatchObject({ cueIndex: 1, cueElapsedSeconds: 0.5 });
    h.controller.tick(2.5);
    expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'rejected', 'throw'] as const)('falls back to readable subtitles when audio is %s', async outcome => {
    const h = setup(true, bridge([cue('a', 4)]));
    if (outcome === 'throw') h.play.mockImplementationOnce(() => { throw new Error('autoplay blocked'); });
    h.controller.start(h.content); h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    h.controller.tick(1);
    if (outcome === 'unavailable') h.voices[0].pending.resolve('unavailable');
    if (outcome === 'rejected') h.voices[0].pending.reject(new Error('decode failed'));
    await flush(); h.controller.tick(2);
    expect(h.controller.snapshot.narrationState).toBe('reading');
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(1);
    expect(h.enter).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot.error).toBeNull();
  });

  it('does not deadlock when a muted or broken audio provider never settles', async () => {
    const h = setup(true, bridge([cue('a', 12)]));
    h.controller.start(h.content); h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    h.controller.tick(35.5); expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0.5);
    expect(h.enter).toHaveBeenCalledTimes(1);
    expect(h.voices[0].playback.stop).toHaveBeenCalledTimes(1);
    expect(h.voices[0].signal.aborted).toBe(true);
  });

  it('freezes reading while paused and does not commit when loading completes in the background', async () => {
    const h = setup(false, bridge([cue('a', 4)])); h.controller.start(h.content);
    h.controller.tick(1); h.controller.setPaused(true);
    h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    h.controller.tick(1000); h.controller.skip();
    expect(h.controller.snapshot).toMatchObject({ paused: true, loadState: 'ready', cueElapsedSeconds: 1, canSkip: false });
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.setPaused(false);
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(3); expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('holds an audio ended event while paused and resumes only on a later tick', async () => {
    const h = setup(true, bridge([cue('a')])); h.controller.start(h.content);
    h.controller.setPaused(true); h.controller.setPaused(true);
    expect(h.voices[0].playback.pause).toHaveBeenCalledTimes(1);
    h.loads[0].pending.resolve({ name: 'ready' }); h.voices[0].pending.resolve('ended'); await flush();
    h.controller.tick(500); expect(h.controller.snapshot.cue?.id).toBe('a');
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.setPaused(false);
    expect(h.voices[0].playback.resume).not.toHaveBeenCalled();
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0); expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('starts a background transition paused and resumes an unfinished voice once', () => {
    const h = setup(); h.controller.setPaused(true); h.controller.start(h.content);
    expect(h.preload).toHaveBeenCalledTimes(1);
    expect(h.voices[0].playback.pause).toHaveBeenCalledTimes(1);
    h.controller.tick(20); expect(h.controller.snapshot.cueElapsedSeconds).toBe(0);
    h.controller.setPaused(false); h.controller.setPaused(false);
    expect(h.voices[0].playback.resume).toHaveBeenCalledTimes(1);
  });

  it.each(['pause', 'resume'] as const)('falls back safely if the audio adapter throws on %s', async operation => {
    const h = setup(true, bridge([cue('a', 4)])); h.controller.start(h.content);
    if (operation === 'pause') vi.mocked(h.voices[0].playback.pause).mockImplementation(() => { throw new Error('broken pause'); });
    else vi.mocked(h.voices[0].playback.resume).mockImplementation(() => { throw new Error('broken resume'); });
    h.controller.setPaused(true); h.controller.setPaused(false);
    expect(h.controller.snapshot.narrationState).toBe('reading');
    h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    h.controller.tick(4); expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('retains load failure until explicit retry and never restarts narration or mutates a save', async () => {
    const h = setup(), save = { stage: 'S01' };
    h.enter.mockImplementation(() => { save.stage = 'S02'; });
    h.controller.start(h.content); h.loads[0].progress(0.6);
    const failed = new Error('scene unavailable');
    h.loads[0].pending.reject(failed); await flush();
    h.controller.skip(); h.controller.tick(100);
    expect(save.stage).toBe('S01');
    expect(h.controller.snapshot).toMatchObject({ loadState: 'failed', loadProgress: 0.6, error: { stage: 'load', message: 'scene unavailable', cause: failed }, canRetryLoad: true });
    expect(h.controller.start(h.content)).toBe(false);
    expect(h.controller.retryLoad()).toBe(true);
    expect(h.controller.retryLoad()).toBe(false);
    expect(h.loads[0].signal.aborted).toBe(true);
    expect(h.controller.snapshot).toMatchObject({ loadState: 'loading', loadProgress: null, narrationState: 'skipped', error: null });
    expect(h.play).toHaveBeenCalledTimes(1);
    h.loads[1].pending.resolve({ name: 'retry succeeded' }); await flush();
    h.controller.tick(0);
    expect(save.stage).toBe('S02'); expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('turns a synchronous preload throw into a retryable error while narration continues', async () => {
    const h = setup(false, bridge([cue('a')]));
    h.preload.mockImplementationOnce(() => { throw new Error('prepare threw'); });
    h.controller.start(h.content);
    expect(h.controller.snapshot).toMatchObject({ loadState: 'failed', narrationState: 'reading', error: { stage: 'load' } });
    h.controller.tick(2); expect(h.enter).not.toHaveBeenCalled();
    expect(h.controller.retryLoad()).toBe(true);
    h.loads[0].pending.resolve({ name: 'ready' }); await flush(); h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('keeps the current voice running across load retry and blocks duplicate pending retries', async () => {
    const h = setup(); h.controller.start(h.content); h.controller.tick(1);
    h.loads[0].pending.reject(new Error('offline')); await flush();
    expect(h.controller.retryLoad()).toBe(true);
    expect(h.controller.retryLoad()).toBe(false);
    expect(h.controller.snapshot).toMatchObject({ narrationState: 'playing', cueIndex: 0, cueElapsedSeconds: 1 });
    expect(h.voices[0].signal.aborted).toBe(false);
    expect(h.voices[0].playback.stop).not.toHaveBeenCalled();
    expect(h.play).toHaveBeenCalledTimes(1);
    h.voices[0].pending.resolve('ended'); await flush(); h.controller.tick(0);
    expect(h.controller.snapshot.cue?.id).toBe('b');
    expect(h.loads[1].signal.aborted).toBe(false);
  });

  it('reports finite monotonic progress and ignores stale loader updates', async () => {
    const h = setup(false); h.controller.start(h.content);
    for (const value of [NaN, Infinity, -Infinity]) h.loads[0].progress(value);
    expect(h.controller.snapshot.loadProgress).toBeNull();
    h.loads[0].progress(-3); expect(h.controller.snapshot.loadProgress).toBe(0);
    h.loads[0].progress(0.7); h.loads[0].progress(0.2);
    expect(h.controller.snapshot.loadProgress).toBe(0.7);
    h.loads[0].pending.reject('network'); await flush(); h.controller.retryLoad();
    h.loads[0].progress(1); expect(h.controller.snapshot.loadProgress).toBeNull();
    h.loads[1].progress(3); expect(h.controller.snapshot.loadProgress).toBe(1);
  });

  it('aborts cancelled work and releases a late preparation without reviving the run', async () => {
    const h = setup(); h.controller.start(h.content); h.controller.cancel(); h.controller.cancel();
    expect(h.loads[0].signal.aborted).toBe(true); expect(h.voices[0].signal.aborted).toBe(true);
    expect(h.voices[0].playback.stop).toHaveBeenCalledTimes(1);
    const late = { name: 'late' };
    h.loads[0].pending.resolve(late); h.voices[0].pending.resolve('ended'); await flush();
    h.controller.tick(20);
    expect(h.controller.snapshot.phase).toBe('cancelled');
    expect(h.release).toHaveBeenCalledExactlyOnceWith(late);
    expect(h.enter).not.toHaveBeenCalled(); expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('releases already ready work exactly once on cancel and can restart the same bridge', async () => {
    const h = setup(); h.controller.start(h.content);
    const ready = { name: 'ready' }; h.loads[0].pending.resolve(ready); await flush();
    h.controller.cancel(); h.controller.cancel();
    expect(h.release).toHaveBeenCalledExactlyOnceWith(ready);
    expect(h.controller.start(h.content)).toBe(true);
    expect(h.preload).toHaveBeenCalledTimes(2); expect(h.play).toHaveBeenCalledTimes(2);
    h.controller.dispose(); h.controller.dispose();
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('supersedes an active bridge and ignores its eventual load, voice and progress callbacks', async () => {
    const h = setup(); h.controller.start(h.content);
    expect(h.controller.start(h.content)).toBe(false);
    const next = { ...bridge([cue('next')], 'S02-S03'), from: 'S02', to: 'S03' } as const;
    expect(h.controller.start(next)).toBe(true);
    expect(h.loads[0].signal.aborted).toBe(true);
    h.loads[0].progress(1); h.loads[0].pending.resolve({ name: 'obsolete' }); h.voices[0].pending.resolve('ended'); await flush();
    expect(h.controller.snapshot).toMatchObject({ bridge: next, cue: { id: 'next' }, loadState: 'loading', loadProgress: null });
    expect(h.release).toHaveBeenCalledExactlyOnceWith({ name: 'obsolete' });
    h.loads[1].pending.resolve({ name: 'current' }); h.voices[1].pending.resolve('ended'); await flush(); h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledExactlyOnceWith({ name: 'current' }, next);
  });

  it('keeps the controller disposed and releases results that arrive after disposal', async () => {
    const h = setup(); h.controller.start(h.content); h.controller.dispose();
    expect(h.controller.start(h.content)).toBe(false); expect(h.controller.retryLoad()).toBe(false);
    h.controller.skip(); h.controller.setPaused(false); h.controller.tick(100);
    h.loads[0].pending.resolve({ name: 'late' }); h.voices[0].pending.reject(new Error('cancelled voice')); await flush();
    expect(h.controller.snapshot.phase).toBe('disposed');
    expect(h.release).toHaveBeenCalledTimes(1); expect(h.enter).not.toHaveBeenCalled();
  });

  it('does not release or abort a chapter after ownership was successfully transferred', async () => {
    const h = setup(false, bridge([])); h.controller.start(h.content);
    h.loads[0].pending.resolve({ name: 'active' }); await flush();
    // A host can hide/cancel the transition overlay as part of its atomic enter.
    h.enter.mockImplementation(() => h.controller.cancel());
    h.controller.tick(0); h.controller.cancel(); h.controller.dispose();
    expect(h.enter).toHaveBeenCalledTimes(1);
    expect(h.loads[0].signal.aborted).toBe(false);
    expect(h.release).not.toHaveBeenCalled();
  });

  it('makes an atomic enter failure terminal, releases its value once and keeps the error visible', async () => {
    const h = setup(false, bridge([])); h.controller.start(h.content);
    const prepared = { name: 'prepared' }, error = new Error('activation refused');
    h.enter.mockImplementation(() => { throw error; });
    h.loads[0].pending.resolve(prepared); await flush(); h.controller.tick(0);
    expect(h.controller.snapshot).toMatchObject({ phase: 'active', error: { stage: 'enter', cause: error }, canRetryLoad: false, canSkip: false });
    h.controller.tick(100); h.controller.skip();
    expect(h.controller.retryLoad()).toBe(false); expect(h.controller.start(h.content)).toBe(false);
    expect(h.enter).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledExactlyOnceWith(prepared);
    h.controller.cancel(); h.controller.dispose(); expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid deltas and sanitizes invalid or extreme reading durations', async () => {
    const h = setup(false, bridge([cue('zero', 0), cue('negative', -5), cue('nan', NaN), cue('infinite', Infinity), cue('long', 100)]));
    h.controller.start(h.content); h.loads[0].pending.resolve({ name: 'ready' }); await flush();
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) h.controller.tick(dt);
    expect(h.controller.snapshot.cueElapsedSeconds).toBe(0);
    h.controller.tick(2 + 2 + 6 + 6 + 44.5);
    expect(h.controller.snapshot).toMatchObject({ cue: { id: 'long' }, cueElapsedSeconds: 44.5 });
    expect(h.enter).not.toHaveBeenCalled();
    h.controller.tick(0.5); expect(h.enter).toHaveBeenCalledTimes(1);
  });

  it('requires a valid tick even for empty narration and supports undefined prepared values', async () => {
    const enter = vi.fn(), release = vi.fn();
    const controller = new TransitionController<void>({ preload: async () => undefined, enter, release });
    controller.start(bridge([])); await flush();
    expect(controller.snapshot.narrationState).toBe('complete');
    expect(enter).not.toHaveBeenCalled();
    controller.tick(NaN); controller.tick(-1); expect(enter).not.toHaveBeenCalled();
    controller.tick(0); expect(enter).toHaveBeenCalledTimes(1);
    controller.dispose(); expect(release).not.toHaveBeenCalled();
  });
});
