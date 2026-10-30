import { Random } from '../runtime/random';

/** Temporary synthesized feedback; no claim of final Foley or recorded dialogue. */
export class Sound {
  volume = 0.7;
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private ambience?: AudioBufferSourceNode;
  private fan?: OscillatorNode;
  private fanGain?: GainNode;
  private ventilation = false;
  private active = new Set<AudioScheduledSourceNode>();
  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = this.volume * 0.65;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0), random = new Random(833);
      for (let i = 0; i < data.length; i++) data[i] = random.next() * 2 - 1;
    }
    await this.context.resume();
    if (!this.ambience) {
      const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
      source.buffer = this.noise!; source.loop = true;
      filter.type = 'lowpass'; filter.frequency.value = 180; gain.gain.value = 0.12;
      source.connect(filter).connect(gain).connect(this.master!); source.start(); this.ambience = source;
      this.fan = this.context.createOscillator(); this.fan.type = 'sine'; this.fan.frequency.value = 62;
      this.fanGain = this.context.createGain(); this.fanGain.gain.value = this.ventilation ? 0.075 : 0;
      this.fan.connect(this.fanGain).connect(this.master!); this.fan.start();
    }
  }
  setVentilation(on: boolean): void {
    if (this.ventilation === on) return;
    this.ventilation = on;
    if (this.context && this.fanGain) this.fanGain.gain.setTargetAtTime(on ? 0.075 : 0, this.context.currentTime, 0.25);
  }
  setVolume(value: number): void { this.volume = value; if (this.master) this.master.gain.value = value * 0.65; }
  private pulse(frequency: number, duration: number, gainValue: number, noise: boolean, pan = 0): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.master || this.volume <= 0) return;
    const source = noise ? ctx.createBufferSource() : ctx.createOscillator();
    if (source instanceof AudioBufferSourceNode) source.buffer = this.noise!;
    else { source.type = 'triangle'; source.frequency.setValueAtTime(frequency, ctx.currentTime); source.frequency.exponentialRampToValueAtTime(frequency * 0.5, ctx.currentTime + duration); }
    const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), panner = ctx.createStereoPanner();
    filter.type = 'lowpass'; filter.frequency.value = frequency; panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.gain.setValueAtTime(gainValue, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(panner).connect(this.master);
    source.start(); source.stop(ctx.currentTime + duration); this.active.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); this.active.delete(source); };
  }
  shot(enemy = false, pan = 0): void { this.pulse(enemy ? 1200 : 2600, 0.11, enemy ? 0.28 : 0.6, true, pan); this.pulse(95, 0.13, enemy ? 0.07 : 0.25, false, pan); }
  hit(): void { this.pulse(1100, 0.055, 0.16, false); }
  hurt(): void { this.pulse(80, 0.24, 0.25, true); }
  reload(): void { this.pulse(1800, 0.08, 0.2, true); }
  objective(): void { this.pulse(660, 0.18, 0.1, false); }
  footstep(): void { this.pulse(400, 0.065, 0.13, true); }
  pause(): void { this.stopTransient(); void this.context?.suspend(); }
  stopTransient(): void { for (const source of this.active) { try { source.stop(); } catch { /* Already ended. */ } } this.active.clear(); }
  dispose(): void { this.stopTransient(); this.ambience?.stop(); this.fan?.stop(); void this.context?.close(); }
}
