import { describe, expect, it, vi } from 'vitest';
import { Sound } from '../src/presentation/Sound';
import { AudioBufferCache } from '../src/audio/AudioBufferCache';
import { musicForMission } from '../src/audio/music';
import { AUDIO_CATALOG, DIALOGUE_CATALOG } from '../src/audio/catalog';
import type { AudioAsset, DialogueAsset, DialogueCue, MissionAudioState } from '../src/audio/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 20; ++i) await Promise.resolve(); }
class Param {
  value = 1;
  events: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(['exponential', value, time]); }
  setTargetAtTime(value: number, time: number) { this.value = value; this.events.push(['target', value, time]); }
  cancelScheduledValues(time: number) { this.events.push(['cancel', this.value, time]); }
}
class Node {
  disconnected = false;
  connect(node: Node) { return node; }
  disconnect() { this.disconnected = true; }
}
class Gain extends Node { gain = new Param(); }
class Source extends Node {
  buffer?: AudioBuffer & { marker?: number };
  loop = false;
  type = '';
  frequency = new Param();
  onended: (() => void) | null = null;
  starts: number[][] = [];
  stops: number[] = [];
  start(...args: number[]) { this.starts.push(args); }
  stop(time = 0) { this.stops.push(time); }
  finish() { this.onended?.(); }
}
function buffer(marker = 1, duration = 2, length = 200): AudioBuffer {
  return { marker, duration, length, numberOfChannels: 1, sampleRate: 100, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
}
class Context {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 100;
  destination = new Node();
  sources: Source[] = [];
  gains: Gain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => buffer(new Uint8Array(data)[0]));
  createBuffer() { return buffer(); }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createOscillator() { const source = new Source(); this.sources.push(source); return source; }
  createBiquadFilter() { return Object.assign(new Node(), { type: '', frequency: new Param() }); }
  createStereoPanner() { return Object.assign(new Node(), { pan: new Param() }); }
  get native() { return this as unknown as AudioContext; }
}
const asset = (id: string, kind: AudioAsset['kind'] = 'sfx'): AudioAsset => ({ id, kind, url: `audio/${id}.mp3`, sha256: 'test', bytes: 1, duration: 2, gain: 1 });
const state = (patch: Partial<MissionAudioState> = {}): MissionAudioState => ({ scenario: 'medical', phase: 0, control: 'work', facts: [], elapsed: 0, ...patch });
const cue = (patch: Partial<DialogueCue> = {}): DialogueCue => ({ epoch: 1, revision: 7, scenario: 'medical', speaker: '许岚', text: '这批先走。', elapsed: 0, expiresAt: 7, ...patch });
function setup(ids: string[] = [], dialogue: boolean | readonly DialogueAsset[] = true) {
  const context = new Context(), assets = Object.fromEntries(ids.map(id => [id, asset(id, id === 'voice' ? 'voice' : 'sfx')]));
  const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(new Uint8Array([ids.findIndex(id => String(url).includes(`/${id}.mp3`)) + 1])));
  const factory = vi.fn(() => context.native);
  const sound = new Sound({ createContext: factory, fetcher: fetcher as typeof fetch, baseUrl: 'https://game.test/sub/', catalog: assets,
    dialogue: Array.isArray(dialogue) ? dialogue : dialogue ? [{ assetId: 'voice', scenario: 'medical', speaker: '许岚', text: '这批先走。', duration: 2 }] : [] });
  sound.setScene(1, state());
  return { sound, context, fetcher, factory };
}

// Tests exercise the real Sound class and its cache through a controllable Web Audio boundary.
describe('asset audio lifecycle', () => {
  it('creates one context only after the gesture and never stacks ambience on repeated unlock', async () => {
    const { sound, context, factory } = setup();
    expect(factory).not.toHaveBeenCalled();
    await sound.unlock(); await sound.unlock();
    expect(factory).toHaveBeenCalledTimes(1); expect(context.sources).toHaveLength(2);
    expect(sound.getStatus().activeSources).toBe(2); sound.dispose();
  });
  it('does not create sound nodes when an old unlock completes after pause', async () => {
    const { sound, context } = setup(), resume = deferred<void>();
    context.resume.mockImplementation(() => resume.promise);
    const unlock = sound.unlock(); sound.pause(); resume.resolve(); await unlock;
    expect(context.sources).toHaveLength(0); expect(sound.getStatus().unlocked).toBe(false); sound.dispose();
  });
  it('allows a fresh resume while an older unlock is unresolved, ignoring the old continuation', async () => {
    const { sound, context, factory } = setup(), old = deferred<void>(), next = deferred<void>();
    context.resume.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise);
    const first = sound.unlock(); sound.pause(); const second = sound.unlock();
    context.state = 'running'; next.resolve(); await second;
    expect(context.sources).toHaveLength(2);
    old.resolve(); await first; expect(context.sources).toHaveLength(2); expect(factory).toHaveBeenCalledTimes(1); sound.dispose();
  });
  it('ignores stale unlock rejection, reports a current failure, and permits another gesture retry', async () => {
    const { sound, context } = setup(), old = deferred<void>();
    context.resume.mockImplementationOnce(() => old.promise);
    const first = sound.unlock(); sound.pause(); old.reject(new Error('old policy failure')); await first;
    expect(sound.getStatus().errors).toEqual([]);
    context.resume.mockRejectedValueOnce(new Error('current policy failure'));
    await expect(sound.unlock()).rejects.toThrow('current policy failure');
    expect(sound.getStatus().errors[0]).toContain('音频启动');
    await sound.unlock(); expect(sound.getStatus().unlocked).toBe(true); sound.dispose();
  });
  it('rejects a resolved resume whose device is still suspended', async () => {
    const { sound, context } = setup(); context.resume.mockImplementation(async () => {});
    await expect(sound.unlock()).rejects.toThrow('音频设备'); expect(context.sources).toHaveLength(0); sound.dispose();
  });
  it('disposes idempotently and never revives after a pending unlock or later public calls', async () => {
    const { sound, context } = setup(), pending = deferred<void>();
    context.resume.mockImplementation(() => pending.promise);
    const unlock = sound.unlock(); sound.dispose(); sound.dispose(); pending.resolve(); await unlock;
    await sound.unlock(); sound.shot(); sound.say(cue()); sound.updateMission(state()); sound.setScene(2, state());
    expect(context.sources).toHaveLength(0); expect(context.close).toHaveBeenCalledTimes(1); expect(sound.getStatus().disposed).toBe(true);
  });
  it('handles suspend/close rejection without leaking a rejected promise', async () => {
    const { sound, context } = setup(); await sound.unlock();
    context.suspend.mockRejectedValueOnce(new Error('device interruption')); context.close.mockRejectedValueOnce(new Error('already closed'));
    sound.pause(); await flush(); expect(sound.getStatus().errors[0]).toContain('音频暂停'); sound.dispose(); await flush();
  });
});

describe('event-owned audio', () => {
  it('resolves every approved scene/speaker/text binding, including optional and compatibility branches', async () => {
    const voices = Object.fromEntries(Object.entries(AUDIO_CATALOG).filter(([, asset]) => asset.kind === 'voice'));
    for (const line of DIALOGUE_CATALOG) {
      const context = new Context();
      const sound = new Sound({ createContext: () => context.native, baseUrl: 'https://game.test/', catalog: voices,
        fetcher: async () => new Response(new Uint8Array([1])) });
      sound.setScene(1, state({ scenario: line.scenario }));
      sound.say(cue({ scenario: line.scenario, speaker: line.speaker, text: line.text, expiresAt: 0.5 }));
      await sound.unlock(); await flush();
      expect(sound.getStatus().voice, line.assetId).toBe(line.assetId);
      expect(sound.getDialoguePresentation()?.text, line.assetId).toBe(line.text); sound.dispose();
    }
  });
  it('plays an initial current line queued before unlock once, without a render replay', async () => {
    const { sound, context } = setup(['voice']); sound.say(cue());
    expect(context.sources).toHaveLength(0); await sound.unlock(); await flush();
    expect(sound.getStatus().voice).toBe('voice'); const count = context.sources.length;
    sound.say(cue()); sound.updateMission(state({ elapsed: 1 })); await flush(); expect(context.sources).toHaveLength(count); sound.dispose();
  });
  it('requires the exact scenario, speaker and text, accepting the matching age-qualified player label', async () => {
    const { sound, context } = setup(['voice']); await sound.unlock();
    sound.say(cue({ scenario: 'childhood' })); sound.say(cue({ speaker: '陆闻川' })); sound.say(cue({ text: '这批先走。 ' }));
    await flush(); expect(context.sources).toHaveLength(2);
    sound.say(cue({ revision: 8, speaker: '许岚 · 无线电' })); await flush(); expect(sound.getStatus().voice).toBe('voice'); sound.dispose();
  });
  it.each(['pause', 'skip', 'replace', 'dispose'] as const)('suppresses a late voice decode after %s', async action => {
    const { sound, context } = setup(['voice']), decode = deferred<AudioBuffer>();
    context.decodeAudioData.mockImplementation(() => decode.promise);
    await sound.unlock(); sound.say(cue()); await flush();
    if (action === 'pause') sound.pause();
    if (action === 'skip') sound.stopTransient();
    if (action === 'replace') sound.setScene(2, state());
    if (action === 'dispose') sound.dispose();
    const currentSources = context.sources.length;
    decode.resolve(buffer()); await flush(); expect(context.sources).toHaveLength(currentSources);
    expect(sound.getStatus().voice).toBeUndefined(); sound.dispose();
  });
  it('resumes the current recording at its paused offset and never replays it from a restored checkpoint', async () => {
    const { sound, context } = setup(['voice']); await sound.unlock(); sound.say(cue()); await flush();
    context.currentTime = 0.75; sound.advanceDialogue(0.25);
    sound.pause(); const frozen = sound.getDialoguePresentation();
    sound.advanceDialogue(0.25); expect(sound.getDialoguePresentation()).toEqual(frozen);
    await sound.unlock(); await flush(); expect(sound.getStatus().voice).toBe('voice');
    expect(context.sources.at(-1)!.starts).toEqual([[0, 0.75]]);
    const sources = context.sources.length; sound.say(cue()); await flush(); expect(context.sources).toHaveLength(sources);
    sound.setScene(2, state({ elapsed: 3 })); await flush(); expect(sound.hasPendingDialogue()).toBe(false); sound.dispose();
  });
  it('rejects stale arrivals but does not discard already queued dialogue after its old subtitle deadline', async () => {
    const { sound } = setup(['voice']); sound.updateMission(state({ elapsed: 8 })); sound.say(cue());
    expect(sound.hasPendingDialogue()).toBe(false);
    sound.say(cue({ revision: 9, elapsed: 8, expiresAt: 9 }));
    sound.updateMission(state({ elapsed: 20 })); await sound.unlock(); await flush();
    expect(sound.getStatus().voice).toBe('voice'); sound.dispose();
  });
  it('plays the entire decoded recording even when the old authored subtitle window was too short', async () => {
    const { sound, context, fetcher } = setup(['voice']); context.decodeAudioData.mockResolvedValue(buffer(1, 8));
    await sound.unlock(); sound.say(cue({ expiresAt: 1 })); await flush();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(sound.getStatus().voice).toBe('voice');
    expect(sound.getDialoguePresentation()).toMatchObject({ text: '这批先走。', time: 0, until: 8 });
    sound.updateMission(state({ elapsed: 20 })); expect(context.sources.at(-1)!.disconnected).toBe(false); sound.dispose();
  });
  it('keeps both same-step story utterances in order, with captions belonging to the playing recording', async () => {
    const lines: DialogueAsset[] = [
      { assetId: 'first', scenario: 'medical', speaker: '许岚', text: '第一句。', duration: 2 },
      { assetId: 'second', scenario: 'medical', speaker: '许岚', text: '第二句。', duration: 2 },
    ];
    const { sound, context } = setup(['first', 'second'], lines); await sound.unlock();
    sound.say(cue({ text: '第一句。', expiresAt: 0.5 })); sound.say(cue({ text: '第二句。', expiresAt: 0.5 })); await flush();
    expect(sound.getStatus().queuedDialogue).toBe(2); expect(sound.getDialoguePresentation()?.text).toBe('第一句。');
    context.sources.at(-1)!.finish(); sound.advanceDialogue(0.13); await flush();
    expect(sound.getStatus().voice).toBe('second'); expect(sound.getDialoguePresentation()?.text).toBe('第二句。');
    context.sources.at(-1)!.finish(); expect(sound.hasPendingDialogue()).toBe(false); sound.dispose();
  });
  it('does not resurrect a finished or skipped voiced caption, while retaining unvoiced mission prompts', async () => {
    const { sound, context } = setup(['voice']); await sound.unlock(); sound.say(cue()); await flush();
    context.sources.at(-1)!.finish();
    expect(sound.getDialoguePresentation(cue())).toBeUndefined();
    sound.say(cue({ revision: 8 })); await flush(); sound.stopTransient();
    expect(sound.getDialoguePresentation(cue())).toBeUndefined();
    expect(sound.getDialoguePresentation(cue({ text: '接收台已接通。', speaker: '' }))?.text).toBe('接收台已接通。'); sound.dispose();
  });
  it('uses one monotonic presentation clock after restoring a late checkpoint and switching between voice and mission prompts', async () => {
    const { sound, context } = setup(['voice']); sound.setScene(2, state({ elapsed: 250 }));
    expect(sound.getDialogueTime()).toBe(250);
    await sound.unlock(); sound.say(cue({ epoch: 2, elapsed: 250, expiresAt: 251 })); await flush();
    sound.advanceDialogue(0.25); expect(sound.getDialoguePresentation()?.time).toBe(250.25);
    context.sources.at(-1)!.finish();
    const fallback = sound.getDialoguePresentation(cue({ text: '未配音的任务提示。', elapsed: 250.25, expiresAt: 251 }));
    expect(fallback?.time).toBe(250.25); expect(fallback?.until).toBe(251);
    sound.pause(); sound.advanceDialogue(0.25); expect(sound.getDialogueTime()).toBe(250.25); sound.dispose();
  });
  it('keeps the queued successor across pause without starting two voice sources', async () => {
    const { sound, context } = setup(['voice']); await sound.unlock(); sound.say(cue()); await flush();
    sound.say(cue({ revision: 8 })); context.currentTime = 1; sound.pause();
    await sound.unlock(); await flush(); expect(sound.getStatus().queuedDialogue).toBe(2);
    expect(context.sources.at(-1)!.starts).toEqual([[0, 1]]);
    context.sources.at(-1)!.finish(); sound.advanceDialogue(0.13); await flush();
    expect(sound.getStatus().queuedDialogue).toBe(1); expect(context.sources.at(-1)!.starts).toEqual([[0, 0]]); sound.dispose();
  });
  it('aborts a stalled fetch, preserves a complete readable caption, and drains without a device or file', async () => {
    const { sound, context, fetcher } = setup(['voice']); const pending = deferred<Response>();
    fetcher.mockImplementation(() => pending.promise);
    await sound.unlock(); sound.say(cue()); await flush();
    for (let i = 0; i < 7; ++i) sound.advanceDialogue(0.25);
    expect(sound.getDialoguePresentation()?.text).toBe('这批先走。');
    const count = context.sources.length; pending.resolve(new Response(new Uint8Array([1]))); await flush();
    expect(context.sources).toHaveLength(count);
    for (let i = 0; i < 9; ++i) sound.advanceDialogue(0.25);
    expect(sound.hasPendingDialogue()).toBe(false); sound.dispose();
    const failed = setup(['voice']); failed.context.resume.mockRejectedValueOnce(new Error('device unavailable'));
    failed.sound.say(cue()); await expect(failed.sound.unlock()).rejects.toThrow();
    for (let i = 0; i < 18; ++i) failed.sound.advanceDialogue(0.25);
    expect(failed.sound.hasPendingDialogue()).toBe(false); failed.sound.dispose();
  });
  it('converts a device interruption into the remaining caption rather than hanging completion', async () => {
    const { sound, context } = setup(['voice']); await sound.unlock(); sound.say(cue()); await flush();
    context.currentTime = 1; context.state = 'suspended'; sound.advanceDialogue(0.1);
    expect(sound.getStatus().voice).toBeUndefined(); expect(sound.getDialoguePresentation()?.until).toBeCloseTo(1.1);
    for (let i = 0; i < 5; ++i) sound.advanceDialogue(0.25);
    expect(sound.hasPendingDialogue()).toBe(false); sound.dispose();
  });
  it.each(['skip', 'retry', 'rewind'] as const)('clears current and future sentences on %s', async action => {
    const { sound } = setup(['voice']); await sound.unlock(); sound.say(cue()); sound.say(cue({ revision: 8 })); await flush();
    if (action === 'skip') sound.stopTransient();
    if (action === 'retry') sound.setScene(2, state());
    if (action === 'rewind') { sound.updateMission(state({ elapsed: 5 })); sound.updateMission(state({ elapsed: 2 })); }
    sound.advanceDialogue(0.25); await flush(); expect(sound.hasPendingDialogue()).toBe(false); expect(sound.getStatus().voice).toBeUndefined(); sound.dispose();
  });
  it('cancels the executed speaker but keeps another speaker, and clears all speech at unconsciousness', async () => {
    const lines: DialogueAsset[] = [
      { assetId: 'first', scenario: 'mainhall', speaker: '赵启明', speakerId: 'zhao.base', text: '第一句。', duration: 2 },
      { assetId: 'second', scenario: 'mainhall', speaker: '周延', text: '第二句。', duration: 2 },
    ];
    const { sound, context } = setup(['first', 'second'], lines); sound.setScene(1, state({ scenario: 'mainhall' })); await sound.unlock();
    sound.say(cue({ scenario: 'mainhall', speaker: '赵启明', text: '第一句。' })); await flush(); const dead = context.sources.at(-1)!;
    sound.say(cue({ scenario: 'mainhall', speaker: '周延', text: '第二句。' }));
    sound.updateMission(state({ scenario: 'mainhall', facts: ['zhao-executed'] })); await flush();
    expect(dead.disconnected).toBe(true); expect(sound.getStatus().voice).toBe('second');
    sound.say(cue({ scenario: 'mainhall', revision: 9, speaker: '赵启明', text: '第一句。' }));
    expect(sound.getStatus().queuedDialogue).toBe(1);
    sound.updateMission(state({ scenario: 'mainhall', facts: ['zhao-executed', 'zhou-unconscious'] }));
    expect(sound.hasPendingDialogue()).toBe(false); sound.dispose();
  });
  it.each([
    { scenario: 'childhood' as const, speaker: '父亲', speakerId: 'lu_jianping', facts: ['child-out-of-sight'] },
    { scenario: 'medical' as const, speaker: '周延', speakerId: 'zhou.a33', facts: ['zhou-death-confirmed'] },
  ])('stops and suppresses the caption at the $scenario hard perspective/death boundary', async ({ scenario, speaker, speakerId, facts }) => {
    const { sound, context } = setup(['voice'], [{ assetId: 'voice', scenario, speaker, speakerId, text: '这批先走。', duration: 2 }]);
    sound.setScene(1, state({ scenario })); await sound.unlock(); sound.say(cue({ scenario, speaker })); await flush();
    const source = context.sources.at(-1)!; sound.updateMission(state({ scenario, facts }));
    expect(source.disconnected).toBe(true); expect(sound.getDialoguePresentation(cue({ scenario, speaker }))).toBeUndefined(); sound.dispose();
  });
  it('does not allow a friendly-fire bark to interrupt or backlog story dialogue', async () => {
    const lines: DialogueAsset[] = [
      { assetId: 'first', scenario: 'medical', speaker: '许岚', text: '第一句。', duration: 2 },
      { assetId: 'second', scenario: 'medical', speaker: '郑铎', text: '停火，自己人！', duration: 2, optional: true },
    ];
    const { sound } = setup(['first', 'second'], lines); await sound.unlock(); sound.say(cue({ text: '第一句。' }));
    sound.say(cue({ speaker: '郑铎', text: '停火，自己人！' })); await flush();
    expect(sound.getStatus().queuedDialogue).toBe(1); expect(sound.getStatus().voice).toBe('first'); sound.dispose();
  });
  it('uses one hit OR kill cue per real hit event', async () => {
    const { sound, context } = setup(['ui.hit_confirm.01', 'ui.kill_confirm.01']); await sound.unlock(); await flush();
    sound.hit(); sound.hit(true); expect(context.sources.slice(2).map(source => source.buffer?.marker)).toEqual([1, 2]); sound.dispose();
  });
  it('falls back immediately for an uncached shot and does not replay it when decoding finishes', async () => {
    const { sound, context } = setup(['ak47-near-01', 'ak47-near-02', 'ak47-near-03']), decode = deferred<AudioBuffer>();
    context.decodeAudioData.mockImplementation(() => decode.promise);
    await sound.unlock(); sound.shot(); const count = context.sources.length; expect(count).toBe(4);
    decode.resolve(buffer()); await flush(); expect(context.sources).toHaveLength(count);
    sound.shot(); expect(context.sources).toHaveLength(count + 1); sound.dispose();
  });
  it('bounds rapid weapon tails and disconnects all graphs when paused', async () => {
    const { sound, context } = setup(); await sound.unlock();
    for (let i = 0; i < 80; i++) sound.shot(); expect(sound.getStatus().activeSources).toBeLessThanOrEqual(18);
    sound.pause(); expect(sound.getStatus().activeSources).toBe(0); expect(context.sources.every(source => source.disconnected)).toBe(true); sound.dispose();
  });
  it('keeps a failed asset nonblocking, reports the failure, and retries on scene retry', async () => {
    const { sound, context, fetcher } = setup(['voice']); fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sound.unlock(); sound.say(cue()); await flush(); expect(sound.getStatus().errors[0]).toContain('HTTP 404');
    sound.setScene(2, state()); sound.say(cue({ epoch: 2 })); await flush(); expect(sound.getStatus().voice).toBe('voice');
    expect(sound.getStatus().errors).toEqual([]);
    expect(context.sources.some(source => source.buffer?.marker === 1)).toBe(true); sound.dispose();
  });
  it('clamps volume, keeps pause muted, and applies separate groups to the common master', async () => {
    const { sound, context } = setup(); await sound.unlock(); sound.setVolume(2); expect(sound.volume).toBe(1);
    sound.setVolume(NaN); expect(sound.volume).toBe(1); sound.setGroupVolume('music', 0.1); expect(context.gains[3].gain.value).toBe(0.1);
    sound.pause(); sound.setVolume(0.8); expect(context.gains[0].gain.value).toBe(0); sound.dispose();
  });
});

describe('music and aircraft', () => {
  it('maps actual story facts and leaves execution, treatment and the argument silent', () => {
    expect(musicForMission(state({ scenario: 'frontgate' }))).toBe('combat-northgate-hold-v2');
    expect(musicForMission(state({ scenario: 'frontgate', facts: ['east-road-warned'] }))).toBe('combat-reinforcement-v2');
    expect(musicForMission(state({ scenario: 'frontgate', facts: ['front-workers-safe'] }))).toBe('after-combat-breath');
    expect(musicForMission(state({ scenario: 'mainhall', phase: 4, facts: ['history-collapse'] }))).toBeUndefined();
    expect(musicForMission(state({ scenario: 'medical' }))).toBeUndefined(); expect(musicForMission(state({ scenario: 'transfer', phase: 4 }))).toBeUndefined();
    expect(musicForMission(state({ scenario: 'epilogue', facts: ['first-wave-approaching'] }))).toBe('receive-s12');
  });
  it('plays approved full tracks once; onended never causes a new cue or gameplay action', async () => {
    const { sound, context } = setup(['memory-fragments']); sound.setScene(1, state({ scenario: 'childhood' })); await sound.unlock(); await flush();
    const music = context.sources.find(source => source.buffer?.marker === 1 && !source.loop)!;
    expect(music).toBeDefined(); music.finish(); sound.updateMission(state({ scenario: 'childhood', elapsed: 30 })); await flush();
    expect(context.sources.filter(source => source.buffer?.marker === 1 && !source.loop)).toHaveLength(1); sound.dispose();
  });
  it('preserves music playback offset across pause/resume and crossfades on a real fact change', async () => {
    const { sound, context } = setup(['combat-northgate-hold-v2', 'combat-reinforcement-v2']);
    context.decodeAudioData.mockImplementation(async data => buffer(new Uint8Array(data)[0], 48, 4800));
    sound.setScene(1, state({ scenario: 'frontgate' })); await sound.unlock(); await flush();
    context.currentTime = 12; sound.pause(); await sound.unlock(); await flush();
    const music = context.sources.filter(source => source.buffer?.marker === 1 && !source.loop).at(-1)!;
    expect(music.starts[0]).toEqual([0, 12]);
    sound.updateMission(state({ scenario: 'frontgate', facts: ['east-road-warned'] })); await flush();
    expect(music.stops).toContain(13.5); expect(sound.getStatus().music).toBe('combat-reinforcement-v2'); sound.dispose();
  });
  it('does not autoplay jet audio from restored facts and cancels a late approach on retry', async () => {
    const { sound, context } = setup(['jet.aircover.approach.01']), pending = deferred<AudioBuffer>();
    context.decodeAudioData.mockImplementation(() => pending.promise);
    sound.setScene(1, state({ scenario: 'epilogue', facts: ['first-wave-approaching'] })); await sound.unlock(); await flush();
    expect(context.sources).toHaveLength(2); sound.jetApproach(); sound.setScene(2, state()); pending.resolve(buffer()); await flush();
    expect(context.sources).toHaveLength(4); expect(sound.getStatus().activeSources).toBe(2); sound.dispose();
  });
});

describe('bounded audio buffer loading', () => {
  it('shares downloads/decodes while one caller cancellation leaves the other alive', async () => {
    const ctx = new Context(), pending = deferred<AudioBuffer>(), fetcher = vi.fn(async () => new Response(new Uint8Array([1])));
    ctx.decodeAudioData.mockImplementation(() => pending.promise);
    const cache = new AudioBufferCache(ctx.native, { baseUrl: 'https://game.test/', fetcher }), a = new AbortController(), b = new AbortController();
    const first = cache.load(asset('a'), a.signal), second = cache.load(asset('a'), b.signal);
    const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' }); a.abort(); await cancelled;
    pending.resolve(buffer()); await expect(second).resolves.toMatchObject({ duration: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1); cache.dispose();
  });
  it('all cancellation discards late decode and does not exceed two simultaneous decoder slots', async () => {
    const ctx = new Context(), decodes: Array<ReturnType<typeof deferred<AudioBuffer>>> = [];
    ctx.decodeAudioData.mockImplementation(() => { const d = deferred<AudioBuffer>(); decodes.push(d); return d.promise; });
    const cache = new AudioBufferCache(ctx.native, { baseUrl: 'https://game.test/', fetcher: async () => new Response(new Uint8Array([1])) });
    const abort = new AbortController(); const promises = ['a', 'b', 'c', 'd'].map(id => cache.load(asset(id), abort.signal).catch(error => error));
    await flush(); expect(decodes).toHaveLength(2); abort.abort(); await Promise.all(promises);
    const current = new AbortController(); const next = cache.load(asset('e'), current.signal); await flush(); expect(decodes).toHaveLength(2);
    decodes[0].resolve(buffer()); decodes[1].resolve(buffer()); await flush(); expect(decodes).toHaveLength(3);
    decodes[2].resolve(buffer()); await next; expect(cache.stats.cachedBuffers).toBe(1); expect(cache.peek('a')).toBeUndefined(); cache.dispose();
  });
  it('evicts least-used PCM by byte budget without mutating a buffer already held by a source', async () => {
    const ctx = new Context(), cache = new AudioBufferCache(ctx.native, { baseUrl: 'https://game.test/', maxBytes: 1600, fetcher: async () => new Response(new Uint8Array([1])) });
    const signal = new AbortController().signal;
    const a = await cache.load(asset('a'), signal); await cache.load(asset('b'), signal); await cache.load(asset('c'), signal);
    expect(cache.stats.cachedBytes).toBe(1600); expect(cache.peek('a')).toBeUndefined(); expect(a.length).toBe(200); cache.dispose(); expect(cache.stats.cachedBytes).toBe(0);
  });
  it('retries an HTTP/decode failure on a later request', async () => {
    const ctx = new Context(), fetcher = vi.fn(async () => new Response(new Uint8Array([1])));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const cache = new AudioBufferCache(ctx.native, { baseUrl: 'https://game.test/', fetcher }), signal = new AbortController().signal;
    await expect(cache.load(asset('a'), signal)).rejects.toThrow('HTTP 503');
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('bad codec')); await expect(cache.load(asset('a'), signal)).rejects.toThrow('bad codec');
    await expect(cache.load(asset('a'), signal)).resolves.toMatchObject({ duration: 2 }); cache.dispose();
  });
  it('accepts Electron game://local paths but rejects other hosts, cross-protocol URLs and credentials', async () => {
    const ctx = new Context(), fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(new Uint8Array([1])));
    const cache = new AudioBufferCache(ctx.native, { baseUrl: 'game://local/app/', fetcher }), signal = new AbortController().signal;
    await cache.load(asset('a'), signal); expect(fetcher.mock.calls[0][0]).toBe('game://local/app/audio/a.mp3');
    for (const url of ['game://other/audio/a.mp3', 'https://local/audio/a.mp3', 'game://user:pass@local/audio/a.mp3']) {
      await expect(cache.load({ ...asset(url), url }, signal)).rejects.toThrow('同源');
    }
    cache.dispose();
  });
});
