import { vi } from 'vitest';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function flush() { for (let i = 0; i < 20; ++i) await Promise.resolve(); }
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
export function buffer(marker = 1, duration = 2, length = 200): AudioBuffer {
  return { marker, duration, length, numberOfChannels: 1, sampleRate: 100, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
}
export class Context {
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
