import type { AudioAsset } from './contracts';

const abortError = () => new DOMException('Audio request cancelled', 'AbortError');
interface Consumer { resolve(value: AudioBuffer): void; reject(error: unknown): void; remove(): void }
interface Job {
  asset: AudioAsset; controller: AbortController; consumers: Set<Consumer>;
  priority: number; cancelled: boolean;
}
export interface AudioCacheOptions {
  fetcher?: typeof fetch;
  baseUrl: string;
  maxBytes?: number;
  maxConcurrent?: number;
}

/** Bounded LRU PCM storage. A decode already in progress retains its concurrency slot until it settles. */
export class AudioBufferCache {
  private readonly buffers = new Map<string, { buffer: AudioBuffer; bytes: number }>();
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private readonly maxBytes: number;
  private readonly maxConcurrent: number;
  private readonly fetcher: typeof fetch;
  private bytes = 0;
  private running = 0;
  private disposed = false;

  constructor(private readonly context: AudioContext, private readonly options: AudioCacheOptions) {
    this.maxBytes = options.maxBytes ?? 48 * 1024 * 1024;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
  }

  peek(id: string): AudioBuffer | undefined {
    const item = this.buffers.get(id);
    if (!item) return undefined;
    this.buffers.delete(id); this.buffers.set(id, item);
    return item.buffer;
  }

  load(asset: AudioAsset, signal: AbortSignal, priority = 0): Promise<AudioBuffer> {
    if (this.disposed || signal.aborted) return Promise.reject(abortError());
    const ready = this.peek(asset.id);
    if (ready) return Promise.resolve(ready);
    let job = this.jobs.get(asset.id);
    if (!job) {
      job = { asset, controller: new AbortController(), consumers: new Set(), priority, cancelled: false };
      this.jobs.set(asset.id, job); this.queue.push(job);
    } else job.priority = Math.max(job.priority, priority);
    const target = job;
    const promise = new Promise<AudioBuffer>((resolve, reject) => {
      const cancel = () => {
        target.consumers.delete(consumer); consumer.remove(); reject(abortError());
        if (!target.consumers.size) {
          target.cancelled = true; target.controller.abort();
          if (this.jobs.get(asset.id) === target) this.jobs.delete(asset.id);
          const index = this.queue.indexOf(target);
          if (index >= 0) this.queue.splice(index, 1);
        }
      };
      const consumer: Consumer = { resolve, reject, remove: () => signal.removeEventListener('abort', cancel) };
      target.consumers.add(consumer); signal.addEventListener('abort', cancel, { once: true });
    });
    this.pump();
    return promise;
  }

  private pump(): void {
    if (this.disposed) return;
    this.queue.sort((a, b) => b.priority - a.priority);
    while (this.running < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.cancelled) continue;
      ++this.running;
      void this.read(job).then(buffer => this.finish(job, buffer), error => this.finish(job, undefined, error)).finally(() => {
        --this.running; this.pump();
      });
    }
  }

  private async read(job: Job): Promise<AudioBuffer> {
    const base = new URL(this.options.baseUrl), url = new URL(job.asset.url, base);
    const localGame = base.protocol === 'game:' && base.host === 'local' && url.protocol === 'game:' && url.host === 'local';
    const sameWeb = ['http:', 'https:'].includes(base.protocol) && ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin;
    if ((!localGame && !sameWeb) || url.username || url.password) throw new Error('音频资源必须来自本项目的同源路径。');
    const response = await this.fetcher(url.href, { signal: job.controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    if (job.cancelled || this.disposed) throw abortError();
    if (data.byteLength > 8 * 1024 * 1024 || data.byteLength === 0) throw new Error('音频文件大小无效。');
    const buffer = await this.context.decodeAudioData(data);
    if (job.cancelled || this.disposed) throw abortError();
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 90 || buffer.numberOfChannels > 2) {
      throw new Error('音频解码结果超出运行预算。');
    }
    return buffer;
  }

  private finish(job: Job, buffer?: AudioBuffer, error?: unknown): void {
    if (this.jobs.get(job.asset.id) === job) this.jobs.delete(job.asset.id);
    if (!job.cancelled && !this.disposed && buffer) {
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      if (bytes <= this.maxBytes) {
        while (this.bytes + bytes > this.maxBytes && this.buffers.size) {
          const [id, oldest] = this.buffers.entries().next().value!;
          this.buffers.delete(id); this.bytes -= oldest.bytes;
        }
        this.buffers.set(job.asset.id, { buffer, bytes }); this.bytes += bytes;
      }
    }
    for (const consumer of job.consumers) {
      consumer.remove();
      if (job.cancelled || this.disposed) consumer.reject(abortError());
      else if (buffer) consumer.resolve(buffer);
      else consumer.reject(error);
    }
    job.consumers.clear();
  }

  get stats() { return { cachedBuffers: this.buffers.size, cachedBytes: this.bytes, pendingLoads: this.jobs.size, concurrentLoads: this.running }; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of this.jobs.values()) {
      job.cancelled = true; job.controller.abort();
      for (const consumer of job.consumers) { consumer.remove(); consumer.reject(abortError()); }
      job.consumers.clear();
    }
    this.jobs.clear(); this.queue.length = 0; this.buffers.clear(); this.bytes = 0;
  }
}
