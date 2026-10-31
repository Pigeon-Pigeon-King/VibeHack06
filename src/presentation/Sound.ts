import { Random } from '../runtime/random';
import { AudioBufferCache } from '../audio/AudioBufferCache';
import { AUDIO_CATALOG, DIALOGUE_CATALOG } from '../audio/catalog';
import { musicForMission } from '../audio/music';
import type { AudioAsset, AudioGroup, AudioStatus, DialogueAsset, DialogueCue, DialoguePresentation, MissionAudioState } from '../audio/contracts';

interface Playback {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  group: AudioGroup;
  id?: string;
  started: number;
  offset: number;
  duration: number;
  cleanup(): void;
}
export interface SoundOptions {
  createContext?: () => AudioContext;
  fetcher?: typeof fetch;
  baseUrl?: string;
  catalog?: Readonly<Record<string, AudioAsset>>;
  dialogue?: readonly DialogueAsset[];
  cacheBytes?: number;
}
interface QueuedVoice {
  cue: DialogueCue;
  line: DialogueAsset;
  duration: number;
  offset: number;
  state: 'waiting' | 'playing' | 'caption';
  waitingSince?: number;
  captionStarted?: number;
}
const clamp = (value: number, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const aborted = (error: unknown) => error instanceof Error && error.name === 'AbortError';
const speakerName = (speaker: string) => speaker.split(' · ')[0];

/** One gesture-unlocked AudioContext. Simulation events own timing; audio never advances a mission. */
export class Sound {
  volume = 0.7;
  private context?: AudioContext;
  private master?: GainNode;
  private cache?: AudioBufferCache;
  private noise?: AudioBuffer;
  private readonly buses = new Map<AudioGroup, GainNode>();
  private readonly levels: Record<AudioGroup, number> = { sfx: 0.8, voice: 0.95, music: 0.28, ambience: 0.65 };
  private readonly active = new Set<Playback>();
  private readonly catalog: Readonly<Record<string, AudioAsset>>;
  private readonly dialogue: readonly DialogueAsset[];
  private readonly errors: string[] = [];
  private readonly failures = new Map<string, number>();
  private readonly warming = new Set<string>();
  private readonly seenDialogue = new Set<string>();
  private readonly handledCaptions = new Set<string>();
  private ambience?: Playback;
  private fan?: Playback;
  private fanGain?: GainNode;
  private ventilation = false;
  private disposed = false;
  private desiredPlaying = false;
  private unlockGeneration = 0;
  private generation = 0;
  private requests = new AbortController();
  private epoch = 0;
  private mission?: MissionAudioState;
  private desiredMusic?: string;
  private music?: Playback;
  private musicRevision = 0;
  private musicPending?: number;
  private finishedMusic?: string;
  private musicOffset = 0;
  private voice?: Playback;
  private voiceRevision = 0;
  private voiceRequest?: { controller: AbortController };
  private readonly voiceQueue: QueuedVoice[] = [];
  private dialogueClock = 0;
  private dialogueGapUntil = 0;
  private dialoguePaused = true;
  private shotVariant = 0;
  private stepVariant = 0;

  constructor(private readonly options: SoundOptions = {}) {
    this.catalog = options.catalog ?? AUDIO_CATALOG;
    this.dialogue = options.dialogue ?? DIALOGUE_CATALOG;
  }

  private get playable(): boolean {
    return !this.disposed && this.desiredPlaying && this.context?.state === 'running' && !!this.master;
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    this.desiredPlaying = true;
    this.dialoguePaused = false;
    const generation = ++this.unlockGeneration;
    try {
      if (!this.context) {
        const context = this.options.createContext?.() ?? new AudioContext();
        this.context = context;
        this.master = context.createGain(); this.master.gain.value = 0;
        this.master.connect(context.destination);
        for (const group of ['sfx', 'voice', 'music', 'ambience'] as const) {
          const gain = context.createGain(); gain.gain.value = this.levels[group];
          gain.connect(this.master); this.buses.set(group, gain);
        }
        const baseUrl = this.options.baseUrl ?? new URL(import.meta.env.BASE_URL, document.baseURI).href;
        this.cache = new AudioBufferCache(context, { baseUrl, fetcher: this.options.fetcher, maxBytes: this.options.cacheBytes });
        this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = this.noise.getChannelData(0), random = new Random(833);
        for (let i = 0; i < data.length; i++) data[i] = random.next() * 2 - 1;
      }
      await this.context.resume();
      if (this.disposed || !this.desiredPlaying || generation !== this.unlockGeneration) return;
      if (this.context.state !== 'running') throw new Error('音频设备尚未恢复，请再次继续。');
      this.clearError('音频启动'); this.clearError('音频暂停');
      this.master!.gain.value = this.volume * 0.65;
      this.startAmbience(); this.ensureMusic(); this.playPendingVoice(); this.warmEffects();
    } catch (error) {
      if (this.disposed || !this.desiredPlaying || generation !== this.unlockGeneration) return;
      this.desiredPlaying = false; this.invalidateRequests();
      this.stopAll();
      if (this.master) this.master.gain.value = 0;
      this.recordError('音频启动', error);
      throw error;
    }
  }

  /** Called after replacing a Simulation. Restored facts select music but never replay old speech/SFX. */
  setScene(epoch: number, state: MissionAudioState): void {
    if (this.disposed) return;
    this.invalidateRequests(); this.stopAll();
    this.epoch = epoch; this.seenDialogue.clear(); this.handledCaptions.clear(); this.failures.clear(); this.errors.length = 0; this.voiceQueue.length = 0;
    this.dialogueClock = Number.isFinite(state.elapsed) ? Math.max(0, state.elapsed) : 0; this.dialogueGapUntil = this.dialogueClock;
    this.desiredMusic = undefined; this.finishedMusic = undefined; this.musicOffset = 0;
    this.setVentilation(false); this.updateMission(state);
    if (this.playable) { this.startAmbience(); this.warmEffects(); }
  }

  /** Safe at fixed-step frequency; a finished full track is not restarted by repeated state updates. */
  updateMission(state: MissionAudioState): void {
    if (this.disposed) return;
    if (this.mission && (state.scenario !== this.mission.scenario || state.elapsed < this.mission.elapsed - 0.001)) this.stopTransient();
    this.mission = { ...state, facts: [...state.facts] };
    this.cancelInaudibleDialogue();
    const next = musicForMission(state);
    if (next !== this.desiredMusic) {
      ++this.musicRevision; this.musicPending = undefined;
      if (this.music) this.fadeOut(this.music, 1.5);
      this.music = undefined; this.musicOffset = 0; this.finishedMusic = undefined; this.desiredMusic = next;
    }
    this.ensureMusic();
  }

  /** Invoke only when Simulation.say changes, including the initial line of a genuinely new scene. */
  say(cue: DialogueCue): void {
    if (this.disposed || cue.epoch !== this.epoch || cue.scenario !== this.mission?.scenario) return;
    if (!Number.isFinite(cue.elapsed) || !Number.isFinite(cue.expiresAt) || cue.expiresAt <= cue.elapsed || cue.expiresAt <= this.mission.elapsed) return;
    const key = JSON.stringify([cue.revision, cue.speaker, cue.text]);
    if (this.seenDialogue.has(key)) return;
    this.seenDialogue.add(key);
    if (this.seenDialogue.size > 256) this.seenDialogue.delete(this.seenDialogue.values().next().value!);
    const line = this.dialogue.find(line => line.scenario === cue.scenario && line.text === cue.text
      && [line.speaker, ...(line.aliases ?? [])].some(name => speakerName(name) === speakerName(cue.speaker)));
    if (!line) return;
    this.handledCaptions.add(JSON.stringify([speakerName(cue.speaker), cue.text]));
    if (this.handledCaptions.size > 256) this.handledCaptions.delete(this.handledCaptions.values().next().value!);
    if (!this.audible(line) || (line.optional && this.voiceQueue.length > 0)) return;
    if (this.voiceQueue.length >= 32) {
      this.recordError('对白队列', new Error('对白事件过多，已保留当前播放顺序')); return;
    }
    this.voiceQueue.push({ cue: { ...cue }, line, duration: line.duration, offset: 0, state: 'waiting' });
    this.playPendingVoice();
  }

  /** Presentation time keeps advancing after mission completion, but never changes mission facts. */
  advanceDialogue(dt: number): void {
    if (this.disposed || this.dialoguePaused || !Number.isFinite(dt) || dt <= 0) return;
    this.dialogueClock += Math.min(dt, 0.25);
    const head = this.voiceQueue[0];
    if (!head) return;
    if (head.state === 'playing' && !this.playable) {
      this.captureVoiceOffset(); this.voice?.cleanup(); this.voice = undefined;
      this.captionFallback(head);
    }
    if (head.state === 'waiting' && this.dialogueClock >= this.dialogueGapUntil) {
      head.waitingSince ??= this.dialogueClock;
      // A missing/slow file cannot hold the completion screen forever. The
      // complete subtitle remains readable; a late decode must not resurrect it.
      if (this.dialogueClock - head.waitingSince >= 1.5) {
        this.voiceRequest?.controller.abort(); this.voiceRequest = undefined; ++this.voiceRevision;
        this.captionFallback(head);
      }
    }
    if (head.state === 'caption' && this.dialogueClock - head.captionStarted! >= head.duration - head.offset) this.finishVoice(head);
    this.playPendingVoice();
  }

  hasPendingDialogue(): boolean { return this.voiceQueue.length > 0; }

  getDialogueTime(): number { return this.dialogueClock; }

  getDialoguePresentation(fallback?: Pick<DialogueCue, 'text' | 'speaker' | 'elapsed' | 'expiresAt'>): DialoguePresentation | undefined {
    const head = this.voiceQueue[0];
    if (!head) {
      if (!fallback?.text || fallback.expiresAt <= fallback.elapsed
        || this.handledCaptions.has(JSON.stringify([speakerName(fallback.speaker), fallback.text]))) return undefined;
      // Unvoiced mission prompts share the same monotonic presentation clock.
      return { text: fallback.text, speaker: fallback.speaker, time: this.dialogueClock,
        until: this.dialogueClock + fallback.expiresAt - fallback.elapsed };
    }
    const elapsed = head.state === 'playing' && this.voice && this.context
      ? Math.max(0, this.context.currentTime - this.voice.started)
      : head.state === 'caption' ? this.dialogueClock - head.captionStarted! : 0;
    return { text: head.cue.text, speaker: head.cue.speaker, time: this.dialogueClock,
      until: this.dialogueClock + Math.max(0.1, head.duration - head.offset - elapsed) };
  }

  private captionFallback(head: QueuedVoice): void {
    head.state = 'caption'; head.captionStarted = this.dialogueClock; this.setDucking(false);
  }

  private captureVoiceOffset(): void {
    const head = this.voiceQueue[0];
    if (head && this.voice && this.context) head.offset = Math.min(head.duration,
      this.voice.offset + Math.max(0, this.context.currentTime - this.voice.started));
  }

  private finishVoice(head: QueuedVoice): void {
    if (this.voiceQueue[0] !== head) return;
    this.voice?.cleanup(); this.voice = undefined; this.setDucking(false);
    this.voiceRequest?.controller.abort(); this.voiceRequest = undefined; ++this.voiceRevision;
    this.voiceQueue.shift(); this.dialogueGapUntil = this.dialogueClock + 0.12;
  }

  private audible(line: DialogueAsset): boolean {
    const facts = this.mission?.facts ?? [];
    if (facts.includes('zhou-death-confirmed') && (line.speakerId?.startsWith('zhou.') || speakerName(line.speaker) === '周延')) return false;
    if (this.mission?.scenario === 'mainhall') {
      if (facts.includes('zhou-unconscious')) return false;
      if (facts.includes('zhao-executed') && (line.speakerId === 'zhao' || speakerName(line.speaker) === '赵启明')) return false;
    }
    if (this.mission?.scenario === 'childhood' && facts.includes('child-out-of-sight')
      && (['lu_jianping', 'zhao'].includes(line.speakerId ?? '') || ['父亲', '赵启明'].includes(speakerName(line.speaker)))) return false;
    return true;
  }

  private cancelInaudibleDialogue(): void {
    const head = this.voiceQueue[0];
    if (head && !this.audible(head.line)) {
      this.voiceRequest?.controller.abort(); this.voiceRequest = undefined; ++this.voiceRevision;
      this.voice?.cleanup(); this.voice = undefined; this.setDucking(false);
      this.dialogueGapUntil = this.dialogueClock;
    }
    for (let i = this.voiceQueue.length - 1; i >= 0; --i) if (!this.audible(this.voiceQueue[i].line)) this.voiceQueue.splice(i, 1);
    this.playPendingVoice();
  }

  private playPendingVoice(): void {
    const head = this.voiceQueue[0];
    if (!head || head.state !== 'waiting' || this.voiceRequest || this.dialoguePaused
      || !this.playable || this.dialogueClock < this.dialogueGapUntil) return;
    head.waitingSince ??= this.dialogueClock;
    const generation = this.generation, revision = this.voiceRevision;
    const request = { controller: new AbortController() };
    this.voiceRequest = request;
    void this.load(head.line.assetId, 3, request.controller.signal).then(buffer => {
      if (generation !== this.generation || revision !== this.voiceRevision || head !== this.voiceQueue[0]
        || head.state !== 'waiting' || this.dialoguePaused || !this.playable) return;
      if (!buffer) { this.captionFallback(head); return; }
      head.duration = buffer.duration;
      if (head.offset >= buffer.duration) { this.finishVoice(head); return; }
      const playback = this.playBuffer(head.line.assetId, buffer, 'voice', 1, 0, head.offset);
      this.voice = playback; head.state = 'playing'; this.setDucking(true);
      playback.source.onended = () => this.finishVoice(head);
    }).finally(() => { if (this.voiceRequest === request) this.voiceRequest = undefined; });
  }

  private ensureMusic(): void {
    const id = this.desiredMusic, revision = this.musicRevision;
    if (!id || !this.playable || this.music || this.finishedMusic === id || this.musicPending === revision) return;
    if (!this.canRetry(id)) return;
    this.musicPending = revision;
    const generation = this.generation;
    void this.load(id, 2).then(buffer => {
      if (generation !== this.generation || revision !== this.musicRevision) return;
      this.musicPending = undefined;
      if (!buffer || !this.playable || this.desiredMusic !== id) return;
      if (this.musicOffset >= buffer.duration) { this.finishedMusic = id; return; }
      const playback = this.playBuffer(id, buffer, 'music', 1, 0, this.musicOffset, 1.5);
      this.music = playback;
      playback.source.onended = () => {
        playback.cleanup();
        if (this.music === playback) { this.music = undefined; this.finishedMusic = id; this.musicOffset = 0; }
      };
    });
  }

  private setDucking(on: boolean): void {
    const bus = this.buses.get('music');
    if (bus && this.context) bus.gain.setTargetAtTime(this.levels.music * (on ? 0.45 : 1), this.context.currentTime, 0.12);
  }

  setVolume(value: number): void {
    this.volume = clamp(value, this.volume);
    if (this.master) this.master.gain.value = this.desiredPlaying ? this.volume * 0.65 : 0;
  }

  setGroupVolume(group: AudioGroup, value: number): void {
    this.levels[group] = clamp(value, this.levels[group]);
    const bus = this.buses.get(group);
    if (bus) bus.gain.value = this.levels[group] * (group === 'music' && this.voice ? 0.45 : 1);
  }

  setVentilation(on: boolean): void {
    this.ventilation = on;
    if (this.context && this.fanGain) this.fanGain.gain.setTargetAtTime(on ? 0.075 : 0, this.context.currentTime, 0.25);
  }

  private startAmbience(): void {
    if (!this.playable || this.ambience) return;
    const ctx = this.context!;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise!; source.loop = true;
    filter.type = 'lowpass'; filter.frequency.value = 180; gain.gain.value = 0.12;
    source.connect(filter).connect(gain).connect(this.buses.get('ambience')!);
    this.ambience = this.track(source, gain, 'ambience', [filter]); source.start();
    const fan = ctx.createOscillator(), fanGain = ctx.createGain();
    fan.type = 'sine'; fan.frequency.value = 62; fanGain.gain.value = this.ventilation ? 0.075 : 0;
    fan.connect(fanGain).connect(this.buses.get('ambience')!);
    this.fanGain = fanGain; this.fan = this.track(fan, fanGain, 'ambience'); fan.start();
  }

  private track(source: AudioScheduledSourceNode, gain: GainNode, group: AudioGroup, nodes: AudioNode[] = [],
    id?: string, duration = 0, offset = 0): Playback {
    // Bound weapon tails and synthetic fallback nodes; no queued catch-up gunshots.
    const same = [...this.active].filter(item => item.group === group);
    const limit = group === 'sfx' ? 16 : group === 'music' ? 2 : group === 'voice' ? 1 : 2;
    while (same.length >= limit) same.shift()!.cleanup();
    let cleaned = false;
    const playback: Playback = {
      source, gain, group, id, duration, offset, started: this.context!.currentTime,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true; source.onended = null;
        try { source.stop(); } catch { /* Already ended or never started. */ }
        source.disconnect(); gain.disconnect(); for (const node of nodes) node.disconnect();
        this.active.delete(playback);
      },
    };
    this.active.add(playback); source.onended = playback.cleanup;
    return playback;
  }

  private playBuffer(id: string, buffer: AudioBuffer, group: AudioGroup, level: number, pan = 0, offset = 0, fade = 0): Playback {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    const target = level * (this.catalog[id]?.gain ?? 1);
    gain.gain.setValueAtTime(fade ? 0 : target, ctx.currentTime);
    if (fade) gain.gain.linearRampToValueAtTime(target, ctx.currentTime + fade);
    source.connect(gain);
    const nodes: AudioNode[] = [];
    if (group === 'sfx') {
      const panner = ctx.createStereoPanner(); panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      gain.connect(panner).connect(this.buses.get(group)!); nodes.push(panner);
    } else gain.connect(this.buses.get(group)!);
    const playback = this.track(source, gain, group, nodes, id, buffer.duration, offset);
    source.start(0, offset);
    return playback;
  }

  private fadeOut(playback: Playback, seconds: number): void {
    const ctx = this.context;
    if (!ctx || !this.playable) { playback.cleanup(); return; }
    playback.gain.gain.cancelScheduledValues(ctx.currentTime);
    playback.gain.gain.setValueAtTime(playback.gain.gain.value, ctx.currentTime);
    playback.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    playback.source.onended = playback.cleanup;
    playback.source.stop(ctx.currentTime + seconds);
  }

  private canRetry(id: string): boolean { return (this.failures.get(id) ?? -Infinity) <= (this.context?.currentTime ?? 0); }

  private async load(id: string, priority = 0, signal = this.requests.signal): Promise<AudioBuffer | undefined> {
    const asset = this.catalog[id];
    if (!asset || !this.cache || !this.canRetry(id)) return undefined;
    const generation = this.generation;
    try {
      const buffer = await this.cache.load(asset, signal, priority);
      if (generation === this.generation && !this.disposed) this.clearError(id);
      return buffer;
    }
    catch (error) {
      if (!aborted(error) && !this.disposed && generation === this.generation) {
        this.failures.set(id, (this.context?.currentTime ?? 0) + 5); this.recordError(id, error);
      }
      return undefined;
    }
  }

  private warm(id: string): void {
    if (!this.catalog[id] || !this.playable || this.cache?.peek(id) || this.warming.has(id) || !this.canRetry(id)) return;
    this.warming.add(id); const generation = this.generation;
    void this.load(id, -1).finally(() => { if (generation === this.generation) this.warming.delete(id); });
  }

  private warmEffects(): void {
    ['ak47-near-01', 'ak47-near-02', 'ak47-near-03', 'reload-generic-airsoft', 'ui.hit_confirm.01', 'ui.kill_confirm.01',
      'move.run.grating.01', 'move.run.grating.02', 'move.run.grating.03', 'move.run.grating.04'].forEach(id => this.warm(id));
    if (this.mission?.scenario === 'mainhall') ['history.bombardment.near.01', 'history.collapse.beam.01', 'history.collapse.debris.01'].forEach(id => this.warm(id));
    if (this.mission?.scenario === 'epilogue') this.warm('jet.aircover.approach.01');
    // Short fixed prologue performances have hard death/viewpoint boundaries.
    // Warm their local voices at lower priority than the current utterance;
    // cache and decoder concurrency remain bounded by AudioBufferCache.
    if (this.mission?.scenario === 'childhood' || this.mission?.scenario === 'mainhall') {
      for (const line of this.dialogue) if (line.scenario === this.mission.scenario) this.warm(line.assetId);
    }
  }

  private effect(id: string, level: number, pan: number, fallback: () => void): void {
    if (!this.playable || this.volume <= 0) return;
    const buffer = this.cache?.peek(id);
    if (buffer) this.playBuffer(id, buffer, 'sfx', level, pan);
    else { this.warm(id); fallback(); }
  }

  private pulse(frequency: number, duration: number, gainValue: number, noise: boolean, pan = 0): void {
    const ctx = this.context;
    if (!ctx || !this.playable || this.volume <= 0) return;
    const source = noise ? ctx.createBufferSource() : ctx.createOscillator();
    if (noise) (source as AudioBufferSourceNode).buffer = this.noise!;
    else {
      const oscillator = source as OscillatorNode;
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.5, ctx.currentTime + duration);
    }
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), panner = ctx.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = frequency;
    panner.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    gain.gain.setValueAtTime(gainValue, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(panner).connect(this.buses.get('sfx')!);
    this.track(source, gain, 'sfx', [filter, panner]); source.start(); source.stop(ctx.currentTime + duration);
  }

  shot(enemy = false, pan = 0): void {
    const id = `ak47-near-0${++this.shotVariant % 3 + 1}`;
    this.effect(id, enemy ? 0.32 : 0.65, pan, () => {
      this.pulse(enemy ? 1200 : 2600, 0.11, enemy ? 0.28 : 0.6, true, pan);
      this.pulse(95, 0.13, enemy ? 0.07 : 0.25, false, pan);
    });
  }
  hit(killed = false): void {
    this.effect(killed ? 'ui.kill_confirm.01' : 'ui.hit_confirm.01', 0.45, 0, () => this.pulse(killed ? 820 : 1100, killed ? 0.11 : 0.055, 0.16, false));
  }
  hurt(): void { this.pulse(80, 0.24, 0.25, true); }
  blast(): void { this.effect('history.bombardment.near.01', 0.55, 0, () => { this.pulse(75, 0.65, 0.3, false); this.pulse(240, 1, 0.32, true); }); }
  collapse(): void {
    this.effect('history.collapse.beam.01', 0.55, 0, () => this.pulse(180, 0.9, 0.3, true));
    this.effect('history.collapse.debris.01', 0.38, 0, () => this.pulse(55, 0.5, 0.18, false));
  }
  reload(): void { this.effect('reload-generic-airsoft', 0.55, 0, () => this.pulse(1800, 0.08, 0.2, true)); }
  objective(): void { this.pulse(660, 0.18, 0.1, false); }
  footstep(surface: 'grating' | 'hard_ground' = 'grating'): void {
    this.effect(`move.run.${surface}.0${++this.stepVariant % 4 + 1}`, 0.22, 0, () => this.pulse(400, 0.065, 0.13, true));
  }
  /** Actual first approach only. Full approved jet cue; never loop or substitute rotor recordings. */
  jetApproach(pan = 0): void {
    if (!this.playable) return;
    const generation = this.generation;
    void this.load('jet.aircover.approach.01', 2).then(buffer => {
      if (buffer && generation === this.generation && this.playable) this.playBuffer('jet.aircover.approach.01', buffer, 'sfx', 0.24, pan);
    });
  }

  private invalidateRequests(): void {
    ++this.generation; ++this.voiceRevision; ++this.musicRevision;
    this.voiceRequest?.controller.abort(); this.voiceRequest = undefined;
    this.requests.abort(); this.requests = new AbortController(); this.warming.clear(); this.musicPending = undefined;
  }

  /** Skip/retry cancellation: no pending dialogue or weapon event survives, current music may continue. */
  stopTransient(): void {
    this.invalidateRequests(); this.voiceQueue.length = 0; this.voice = undefined; this.dialogueGapUntil = this.dialogueClock;
    for (const source of [...this.active]) if (source.group === 'sfx' || source.group === 'voice') source.cleanup();
    this.setDucking(false);
  }

  private stopAll(): void {
    for (const source of [...this.active]) source.cleanup();
    this.ambience = undefined; this.fan = undefined; this.fanGain = undefined; this.music = undefined; this.voice = undefined;
    this.setDucking(false);
  }

  pause(): void {
    if (this.disposed) return;
    if (this.music && this.context) this.musicOffset = Math.min(this.music.duration, this.music.offset + this.context.currentTime - this.music.started);
    this.captureVoiceOffset();
    const head = this.voiceQueue[0];
    if (head?.state === 'playing') { head.state = 'waiting'; head.waitingSince = undefined; }
    this.dialoguePaused = true;
    this.desiredPlaying = false; ++this.unlockGeneration;
    this.invalidateRequests(); this.stopAll();
    if (this.master) this.master.gain.value = 0;
    void this.context?.suspend().catch(error => { if (!this.disposed) this.recordError('音频暂停', error); });
  }

  getStatus(): AudioStatus {
    return { unlocked: this.playable, disposed: this.disposed, contextState: this.context?.state ?? 'uninitialized', activeSources: this.active.size,
      ...(this.cache?.stats ?? { cachedBuffers: 0, cachedBytes: 0, pendingLoads: 0, concurrentLoads: 0 }),
      music: this.music?.id, voice: this.voice?.id, queuedDialogue: this.voiceQueue.length, errors: [...this.errors] };
  }

  private recordError(id: string, error: unknown): void {
    const message = `${id}：${error instanceof Error ? error.message : String(error)}（保留字幕及玩法反馈）`;
    if (this.errors.includes(message)) return;
    this.errors.push(message); if (this.errors.length > 8) this.errors.shift();
  }

  private clearError(id: string): void {
    for (let i = this.errors.length - 1; i >= 0; --i) if (this.errors[i].startsWith(`${id}：`)) this.errors.splice(i, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.desiredPlaying = false; ++this.unlockGeneration;
    this.invalidateRequests(); this.voiceQueue.length = 0; this.stopAll(); this.cache?.dispose();
    this.master?.disconnect(); for (const bus of this.buses.values()) bus.disconnect(); this.buses.clear();
    void this.context?.close().catch(() => { /* Closed contexts cannot be revived by a late unlock. */ });
  }
}
