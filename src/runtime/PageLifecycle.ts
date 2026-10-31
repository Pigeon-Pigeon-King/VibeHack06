interface PageLifecycleActions {
  suspend(): void;
  restore(): void;
  dispose(): void;
}

/** A cached page keeps its resources; returning never resumes combat automatically. */
export function bindPageLifecycle(target: EventTarget, actions: PageLifecycleActions, signal: AbortSignal): void {
  let cached = false;
  let disposed = false;
  target.addEventListener('pagehide', event => {
    if (disposed) return;
    if ((event as PageTransitionEvent).persisted) {
      if (!cached) { cached = true; actions.suspend(); }
    } else {
      disposed = true; cached = false; actions.dispose();
    }
  }, { signal });
  target.addEventListener('pageshow', event => {
    if (!disposed && cached && (event as PageTransitionEvent).persisted) {
      cached = false; actions.restore();
    }
  }, { signal });
}
