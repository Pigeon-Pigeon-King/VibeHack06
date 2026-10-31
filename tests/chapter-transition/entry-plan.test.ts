import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CHAPTER_STAGES, type ChapterStageId } from '../../src/content/chapter-flow';
import { planCampaignEntry, type CampaignEntryIntent } from '../../src/chapter-transition/CampaignEntryPlan';
import { CAMPAIGN_OPENING, CHAPTER_BRIDGES } from '../../src/chapter-transition/catalog';
import { TransitionController } from '../../src/chapter-transition/TransitionController';
import type { CampaignOpening, ChapterBridge, NarrationPlayback, TransitionScript } from '../../src/chapter-transition/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function setupOpening(intent: 'new-game' | 'restart-campaign' = 'new-game') {
  const plan = planCampaignEntry(intent)!;
  const load = deferred<{ stage: ChapterStageId }>();
  const voices: { pending: ReturnType<typeof deferred<'ended' | 'unavailable'>>; signal: AbortSignal; stop: ReturnType<typeof vi.fn> }[] = [];
  const preload = vi.fn((_script: TransitionScript, _signal: AbortSignal) => load.promise);
  const play = vi.fn((_cue: CampaignOpening['cues'][number], signal: AbortSignal): NarrationPlayback => {
    const pending = deferred<'ended' | 'unavailable'>(), stop = vi.fn();
    voices.push({ pending, signal, stop });
    return { finished: pending.promise, pause() {}, resume() {}, stop };
  });
  const enter = vi.fn(), release = vi.fn();
  const controller = new TransitionController({ preload, enter, release, narration: { play } });
  const finishNarration = async () => {
    for (let index = 0; index < plan.bridge.cues.length; index++) {
      voices[index].pending.resolve('ended'); await flush(); controller.tick(0);
    }
  };
  return { plan, controller, load, preload, play, voices, enter, release, finishNarration };
}

describe('new-campaign entry planning', () => {
  it.each(['new-game', 'restart-campaign'] as const)('plans the opening and a clean S01 for %s', intent => {
    expect(planCampaignEntry(intent)).toEqual({
      bridge: CAMPAIGN_OPENING,
      chapter: { chapter: 'campaign', stage: 'S01', elapsedBefore: 0 },
      scenario: 'childhood',
      facts: [],
    });
    expect(planCampaignEntry(intent)?.bridge).toMatchObject({ id: 'opening-campaign', from: null, to: 'S01' });
  });

  it.each(['continue', 'retry-checkpoint', 'restart-stage', 'validation'] satisfies CampaignEntryIntent[])('does not replay the opening for %s', intent => {
    expect(planCampaignEntry(intent)).toBeUndefined();
  });

  it('returns fresh campaign state without polluting later entry plans', () => {
    const first = planCampaignEntry('new-game')!;
    first.chapter.stage = 'S08'; first.chapter.elapsedBefore = 999;
    (first.facts as string[]).push('old-campaign-fact');
    const second = planCampaignEntry('restart-campaign')!;
    expect(second.chapter).toEqual({ chapter: 'campaign', stage: 'S01', elapsedBefore: 0 });
    expect(second.facts).toEqual([]);
    expect(second.chapter).not.toBe(first.chapter); expect(second.facts).not.toBe(first.facts);
  });

  it('keeps null confined to opening metadata rather than inventing a chapter or inherited fact', () => {
    expectTypeOf<ChapterBridge['from']>().toEqualTypeOf<ChapterStageId>();
    expectTypeOf<CampaignOpening['from']>().toEqualTypeOf<null>();
    expectTypeOf<CampaignOpening['to']>().toEqualTypeOf<'S01'>();
    expectTypeOf<TransitionScript['from']>().toEqualTypeOf<ChapterStageId | null>();
    const plan = planCampaignEntry('new-game')!;
    expect(plan.bridge.from).toBeNull(); expect(plan.facts).toEqual([]);
    expect(CHAPTER_STAGES[0].id).toBe('S01'); expect(CHAPTER_STAGES).toHaveLength(12);
    expect(CHAPTER_BRIDGES).toHaveLength(11);
    expect(CHAPTER_BRIDGES.every(bridge => bridge.from !== null && CHAPTER_STAGES.some(stage => stage.id === bridge.from))).toBe(true);
  });

  it.each(['load-first', 'narration-first'] as const)('uses the existing two gates for the opening: %s', async order => {
    const h = setupOpening(); h.controller.start(h.plan.bridge);
    expect(h.preload).toHaveBeenCalledTimes(1); expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.preload.mock.calls[0][0].from).toBeNull();
    expect(h.controller.snapshot.bridge?.from).toBeNull();
    const prepared = { stage: 'S01' as const };
    if (order === 'load-first') {
      h.load.resolve(prepared); await flush(); h.controller.tick(0);
      expect(h.enter).not.toHaveBeenCalled();
      await h.finishNarration();
    } else {
      await h.finishNarration(); expect(h.enter).not.toHaveBeenCalled();
      h.load.resolve(prepared); await flush(); expect(h.enter).not.toHaveBeenCalled();
      h.controller.tick(0);
    }
    expect(h.enter).toHaveBeenCalledExactlyOnceWith(prepared, h.plan.bridge);
    expect(h.play).toHaveBeenCalledTimes(h.plan.bridge.cues.length);
    expect(h.controller.snapshot.phase).toBe('entered');
    h.controller.tick(10); expect(h.enter).toHaveBeenCalledTimes(1);
    h.controller.dispose(); expect(h.release).not.toHaveBeenCalled();
  });

  it('skips opening narration but preserves the existing campaign until S01 is prepared and entered', async () => {
    const h = setupOpening('restart-campaign');
    let persisted = { stage: 'S08', elapsedBefore: 400, facts: ['existing-campaign'] };
    const original = structuredClone(persisted);
    h.enter.mockImplementation(() => {
      persisted = { stage: h.plan.chapter.stage, elapsedBefore: h.plan.chapter.elapsedBefore, facts: [...h.plan.facts] };
    });
    h.controller.start(h.plan.bridge); h.controller.skip(); h.controller.tick(30);
    expect(h.controller.snapshot.narrationState).toBe('skipped');
    expect(h.voices[0].signal.aborted).toBe(true); expect(h.voices[0].stop).toHaveBeenCalledTimes(1);
    expect(persisted).toEqual(original); expect(h.enter).not.toHaveBeenCalled();
    h.load.resolve({ stage: 'S01' }); await flush();
    expect(persisted).toEqual(original);
    h.controller.tick(0);
    expect(persisted).toEqual({ stage: 'S01', elapsedBefore: 0, facts: [] });
    expect(h.enter).toHaveBeenCalledTimes(1); h.controller.dispose();
  });

  it.each(['pending', 'ready'] as const)('cancels a %s opening without replacing the old checkpoint', async loadState => {
    const h = setupOpening('restart-campaign');
    let persisted = { stage: 'S08', facts: ['existing-campaign'] };
    const original = structuredClone(persisted);
    h.enter.mockImplementation(() => { persisted = { stage: h.plan.chapter.stage, facts: [...h.plan.facts] }; });
    h.controller.start(h.plan.bridge);
    const prepared = { stage: 'S01' as const };
    if (loadState === 'ready') { h.load.resolve(prepared); await flush(); }
    h.controller.cancel();
    expect(h.preload.mock.calls[0][1].aborted).toBe(true);
    if (loadState === 'pending') { h.load.resolve(prepared); await flush(); }
    h.controller.tick(100);
    expect(persisted).toEqual(original); expect(h.enter).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledExactlyOnceWith(prepared);
    expect(h.controller.snapshot.phase).toBe('cancelled'); h.controller.dispose();
  });

  it('allows an explicit restart to replay the same opening after the host cancels the prior run', async () => {
    const h = setupOpening(); h.controller.start(h.plan.bridge); h.controller.skip();
    h.load.resolve({ stage: 'S01' }); await flush(); h.controller.tick(0);
    expect(h.enter).toHaveBeenCalledTimes(1);
    h.controller.cancel();
    const restart = planCampaignEntry('restart-campaign')!;
    expect(h.controller.start(restart.bridge)).toBe(true);
    expect(h.controller.snapshot).toMatchObject({ phase: 'active', cueIndex: 0, narrationState: 'playing' });
    expect(h.preload).toHaveBeenCalledTimes(2); expect(h.play).toHaveBeenCalledTimes(2);
    await flush(); h.controller.dispose();
  });
});
