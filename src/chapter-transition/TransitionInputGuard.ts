export interface TransitionInputActions {
  click(event: MouseEvent): void;
  togglePause(): void;
  isControlTarget?(event: Event): boolean;
}

/** Capture before document gameplay handlers, including pointer-locked canvas clicks. */
export class TransitionInputGuard {
  private active = false;
  private ownsClick = false;
  private readonly blockedKeys = new Set<string>();
  private readonly freshKeys = new Set<string>();
  private drainKeys = false;
  private readonly abort = new AbortController();

  constructor(target: EventTarget, private readonly actions: TransitionInputActions) {
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'contextmenu', 'keydown', 'keyup']) {
      target.addEventListener(type, this.handle as EventListener, { capture: true, signal: this.abort.signal });
    }
  }

  setActive(active: boolean): void {
    if (active && !this.active) { this.drainKeys = true; this.freshKeys.clear(); }
    this.active = active;
  }

  private handle = (event: Event): void => {
    if (event.type === 'keydown' || event.type === 'keyup') {
      const key = event as KeyboardEvent;
      if (!this.active) {
        if (!this.drainKeys) return;
        if (event.type === 'keydown' && !key.repeat) { this.blockedKeys.delete(key.code); this.freshKeys.add(key.code); return; }
        const blocked = this.blockedKeys.has(key.code) || (event.type === 'keydown' && key.repeat && !this.freshKeys.has(key.code));
        if (event.type === 'keyup') { this.blockedKeys.delete(key.code); this.freshKeys.delete(key.code); }
        if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); }
        return;
      }
      if (event.type === 'keydown') this.blockedKeys.add(key.code);
      else this.blockedKeys.delete(key.code);
      // The overlay handles the Tab focus loop and stops its bubbling.
      if (key.code === 'Tab') return;
      event.stopImmediatePropagation();
      // Preserve native focused-button activation, without delivering the key to gameplay.
      if (['Enter', 'Space'].includes(key.code) && this.actions.isControlTarget?.(key)) return;
      event.preventDefault();
      if (event.type === 'keydown' && key.code === 'Escape' && !key.repeat) this.actions.togglePause();
      return;
    }
    const mouse = event as MouseEvent;
    if (this.active && (event.type === 'pointerdown' || event.type === 'mousedown') && mouse.button === 0) this.ownsClick = true;
    if (!this.active && !(this.ownsClick && ['pointerup', 'pointercancel', 'mouseup', 'click'].includes(event.type))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.type === 'pointercancel') this.ownsClick = false;
    if (event.type === 'click') {
      const pressedHere = this.ownsClick;
      this.ownsClick = false;
      const keyboardControl = mouse.detail === 0 && this.actions.isControlTarget?.(event);
      if (this.active && mouse.button === 0 && (pressedHere || keyboardControl)) this.actions.click(mouse);
    }
  };

  dispose(): void { this.abort.abort(); this.active = false; this.ownsClick = false; this.blockedKeys.clear(); this.freshKeys.clear(); }
}
