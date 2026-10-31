import type { Group } from 'three';

export interface DeferredAirCoverController {
  setFacts(facts: readonly string[]): void;
  update(simTimeSeconds: number): void;
  dispose(): void;
}

export interface DeferredAirCoverModule {
  EpilogueAirCover: new (parent: Group) => DeferredAirCoverController;
}

export type DeferredAirCoverLoader = () => Promise<DeferredAirCoverModule>;

// Keep the source-heavy aircraft factory behind this literal dynamic import.
const loadAirCover: DeferredAirCoverLoader = () => import('./EpilogueAirCover');

/** Optional S12 presentation. Loading and failures never own or advance mission facts. */
export class DeferredAirCover {
  private controller?: DeferredAirCoverController;
  private facts: readonly string[] = [];
  private time?: number;
  private requested = false;
  private disposed = false;
  private warned = false;

  constructor(private readonly parent: Group, private readonly loader: DeferredAirCoverLoader = loadAirCover) {
    parent.userData.airCoverStatus = 'idle';
  }

  setFacts(facts: readonly string[]): void {
    if (this.disposed) return;
    this.facts = [...facts];
    if (this.controller) {
      try { this.controller.setFacts(this.facts); } catch (error) { this.fail(error); }
    } else if (!this.requested && this.facts.includes('first-wave-approaching')) {
      this.requested = true;
      this.parent.userData.airCoverStatus = 'loading';
      void this.load();
    }
  }

  update(simTimeSeconds: number): void {
    if (this.disposed || !Number.isFinite(simTimeSeconds) || simTimeSeconds < 0) return;
    this.time = simTimeSeconds;
    if (this.controller) {
      try { this.controller.update(simTimeSeconds); } catch (error) { this.fail(error); }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const controller = this.controller; this.controller = undefined;
    try { controller?.dispose(); } catch (error) { this.warn(error); }
    this.facts = []; this.time = undefined;
    this.parent.userData.airCoverStatus = 'disposed';
  }

  private async load(): Promise<void> {
    try {
      const module = await this.loader();
      // A module import cannot be aborted. A late result must not construct even
      // one aircraft after its scene has left, including an already-resolved Promise.
      if (this.disposed) return;
      const controller = new module.EpilogueAirCover(this.parent);
      if (this.disposed) { controller.dispose(); return; }
      this.controller = controller;
      controller.setFacts(this.facts);
      if (this.disposed) return;
      // Feed only the latest host sample; never replay download time or wall time.
      if (this.time !== undefined) controller.update(this.time);
      if (!this.disposed) this.parent.userData.airCoverStatus = 'ready';
    } catch (error) {
      if (!this.disposed) this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const controller = this.controller; this.controller = undefined;
    try { controller?.dispose(); } catch { /* The original failure is the one diagnostic for this scene. */ }
    this.parent.userData.airCoverStatus = 'error';
    this.warn(error);
    // requested stays true. A new scene creates a new wrapper and may try again.
  }

  private warn(error: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('S12 air cover could not be loaded or updated', error);
  }
}
