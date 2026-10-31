import { TransitionController } from './TransitionController';
import { TransitionOverlay } from './TransitionOverlay';
import type { ChapterBridge, TransitionPorts, TransitionSnapshot } from './types';

/** Optional browser shell. Keep its instance alive so a held click can be drained after entry. */
export class ChapterTransition<T> {
  private readonly controller: TransitionController<T>;
  private readonly overlay: TransitionOverlay;
  private readonly abort = new AbortController();
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private frame = 0;
  private previousTime = 0;
  private manualPause = false;
  private windowFocused = document.hasFocus();
  private disposed = false;

  constructor(parent: HTMLElement, ports: TransitionPorts<T>, onMenu: () => void) {
    this.controller = new TransitionController(ports);
    this.overlay = new TransitionOverlay(parent, {
      skip: () => this.controller.skip(),
      retry: () => this.controller.retryLoad(),
      menu: () => { this.cancel(); onMenu(); },
      togglePause: () => this.setPaused(!this.manualPause),
    });
    document.addEventListener('visibilitychange', () => this.syncPause(), { signal: this.abort.signal });
    window.addEventListener('blur', () => { this.windowFocused = false; this.syncPause(); }, { signal: this.abort.signal });
    window.addEventListener('focus', () => { this.windowFocused = true; this.syncPause(); }, { signal: this.abort.signal });
  }

  start(bridge: ChapterBridge): boolean {
    if (this.disposed) return false;
    const started = this.controller.start(bridge);
    if (!started) return false;
    this.manualPause = false; this.syncPause();
    this.previousTime = performance.now(); this.draw();
    if (!this.frame) this.frame = requestAnimationFrame(this.animate);
    return true;
  }

  get snapshot(): TransitionSnapshot { return this.controller.snapshot; }

  setPaused(paused: boolean): void { this.manualPause = paused; this.syncPause(); }

  private syncPause(): void {
    this.previousTime = performance.now();
    this.controller.setPaused(this.manualPause || document.hidden || !this.windowFocused);
    this.draw();
  }

  private animate = (now: number): void => {
    this.frame = 0;
    const dt = Math.max(0, (now - this.previousTime) / 1000); this.previousTime = now;
    this.controller.tick(dt); this.draw();
    if (this.controller.snapshot.phase === 'active') this.frame = requestAnimationFrame(this.animate);
  };

  private draw(): void { this.overlay.render(this.controller.snapshot, this.motion.matches); }

  cancel(): void {
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.controller.cancel(); this.draw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.frame = 0;
    this.abort.abort(); this.controller.dispose(); this.overlay.dispose();
  }
}
