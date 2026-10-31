import { AnimationMixer } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { ModelAcquireOptions, ModelLease, ModelLoader, ModelLoadProgress, ModelSource, ModelTemplate } from './model-contracts';
import { disposeModelInstance, disposeModelTemplate } from './model-disposal';
import { loadModel, modelAbortError } from './model-loading';

interface Waiter {
  pending: boolean;
  options: ModelAcquireOptions;
  abort: () => void;
  resolve: (lease: ModelLease) => void;
  reject: (error: unknown) => void;
}
interface Entry {
  key: string;
  source: ModelSource;
  controller: AbortController;
  state: 'loading' | 'ready' | 'retired';
  waiters: Set<Waiter>;
  leases: Set<ModelLease>;
  template?: ModelTemplate;
  progress?: ModelLoadProgress;
}

/** Shares immutable template resources; a successful acquire transfers one lease to its caller. */
export class ModelLibrary {
  private entries = new Map<string, Entry>();
  private disposed = false;

  constructor(private readonly loader: ModelLoader = loadModel) {}

  /** The signal cancels pending acquisition. After fulfillment, the caller owns lease.dispose(). */
  acquire(source: ModelSource, options: ModelAcquireOptions = {}): Promise<ModelLease> {
    if (this.disposed) return Promise.reject(new Error('模型资源库已释放。'));
    if (options.signal?.aborted) return Promise.reject(modelAbortError());
    const key = JSON.stringify([source.id, source.revision, source.url]);
    let entry = this.entries.get(key), start = false;
    if (!entry) {
      entry = { key, source: { ...source }, controller: new AbortController(), state: 'loading', waiters: new Set(), leases: new Set() };
      this.entries.set(key, entry); start = true;
    }
    const current = entry;
    const result = new Promise<ModelLease>((resolve, reject) => {
      const waiter: Waiter = {
        pending: true, options: { ...options }, resolve, reject,
        abort: () => this.rejectWaiter(current, waiter, modelAbortError()),
      };
      current.waiters.add(waiter);
      options.signal?.addEventListener('abort', waiter.abort, { once: true });
      if (options.signal?.aborted) waiter.abort();
      else {
        if (current.progress) this.notify(waiter, current.progress);
        if (current.state === 'ready') this.deliver(current, waiter);
      }
    });
    if (start && current.state === 'loading') void this.load(current);
    return result;
  }

  private async load(entry: Entry): Promise<void> {
    try {
      const template = await this.loader(entry.source, entry.controller.signal, value => {
        if (entry.state !== 'loading') return;
        entry.progress = { ...value };
        for (const waiter of [...entry.waiters]) this.notify(waiter, value);
      });
      if (entry.state === 'retired' || this.disposed) { disposeModelTemplate(template); return; }
      entry.template = template; entry.state = 'ready';
      for (const waiter of [...entry.waiters]) this.deliver(entry, waiter);
      this.releaseUnused(entry);
    } catch (error) {
      if (entry.state === 'retired') return;
      for (const waiter of [...entry.waiters]) this.rejectWaiter(entry, waiter, error);
      this.releaseUnused(entry);
    }
  }

  private notify(waiter: Waiter, progress: ModelLoadProgress): void {
    if (!waiter.pending) return;
    // An observer must not fail a download shared by other callers.
    try { waiter.options.onProgress?.({ ...progress }); } catch { /* Observer owns its UI errors. */ }
  }

  private detachWaiter(entry: Entry, waiter: Waiter): void {
    waiter.pending = false;
    entry.waiters.delete(waiter);
    waiter.options.signal?.removeEventListener('abort', waiter.abort);
  }
  private rejectWaiter(entry: Entry, waiter: Waiter, error: unknown): void {
    if (!waiter.pending) return;
    this.detachWaiter(entry, waiter); waiter.reject(error); this.releaseUnused(entry);
  }

  private deliver(entry: Entry, waiter: Waiter): void {
    if (!waiter.pending || entry.state !== 'ready' || !entry.template) return;
    try {
      const root = clone(entry.template.scene) as ModelTemplate['scene'], mixer = new AnimationMixer(root);
      if (!waiter.pending || this.disposed || entry.controller.signal.aborted) { disposeModelInstance(root); return; }
      let released = false;
      const lease: ModelLease = {
        root, animations: Object.freeze([...entry.template.animations]), mixer,
        dispose: () => {
          if (released) return;
          released = true;
          try {
            mixer.stopAllAction(); mixer.uncacheRoot(root);
            disposeModelInstance(root); root.removeFromParent();
          } finally { entry.leases.delete(lease); this.releaseUnused(entry); }
        },
      };
      entry.leases.add(lease);
      this.detachWaiter(entry, waiter); waiter.resolve(lease);
    } catch (error) { this.rejectWaiter(entry, waiter, error); }
  }

  private releaseUnused(entry: Entry): void {
    if (entry.state === 'retired' || entry.waiters.size || entry.leases.size) return;
    entry.state = 'retired';
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    entry.controller.abort();
    if (entry.template) { const template = entry.template; entry.template = undefined; disposeModelTemplate(template); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of [...this.entries.values()]) {
      for (const waiter of [...entry.waiters]) this.rejectWaiter(entry, waiter, modelAbortError());
      for (const lease of [...entry.leases]) lease.dispose();
      this.releaseUnused(entry);
    }
  }
}
