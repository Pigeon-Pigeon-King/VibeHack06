import type { TransitionSnapshot } from './types';
import { TransitionInputGuard } from './TransitionInputGuard';
import './transition.css';

export interface TransitionOverlayActions {
  skip(): void;
  retry(): void;
  menu(): void;
  togglePause(): void;
}

/** DOM-only presentation. The host retains ownership of gameplay, saves and pointer lock. */
export class TransitionOverlay {
  readonly root: HTMLElement;
  private readonly guard: TransitionInputGuard;
  private readonly nodes = new Map<string, HTMLElement>();
  private lastCue = '';
  private wasActive = false;
  private priorFocus: HTMLElement | null = null;
  private latest?: TransitionSnapshot;

  constructor(parent: HTMLElement, private readonly actions: TransitionOverlayActions) {
    this.root = document.createElement('section');
    this.root.className = 'chapter-transition'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '章节过场'); this.root.tabIndex = -1;
    this.root.innerHTML = `
      <header><span class="ct-stage" data-ct="stage"></span><h2 class="ct-heading" data-ct="heading"></h2></header>
      <div class="ct-story"><p class="ct-kicker" data-ct="kicker"></p><p class="ct-caption" data-ct="caption" aria-live="polite" aria-atomic="true"></p></div>
      <div><p class="ct-error" data-ct="error" role="alert" hidden></p><footer>
        <div class="ct-load"><p class="ct-status" data-ct="status" role="status"></p><div class="ct-track" data-ct="track" role="progressbar" aria-label="下一关加载"><span class="ct-fill" data-ct="fill"></span></div></div>
        <div class="ct-actions"><button type="button" data-ct="retry" data-ct-action="retry" hidden>重试加载</button><button type="button" data-ct="pause" data-ct-action="pause">暂停</button><button type="button" data-ct="skip" data-ct-action="skip" class="ct-skip">左键跳过</button><button type="button" data-ct="menu" data-ct-action="menu">返回菜单</button></div>
      </footer></div>`;
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-ct]')) this.nodes.set(element.dataset.ct!, element);
    parent.append(this.root);
    this.guard = new TransitionInputGuard(window, { click: event => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ct-action]') : null;
      const action = element && this.root.contains(element) ? element.dataset.ctAction : 'skip';
      if (element instanceof HTMLButtonElement && element.disabled) return;
      if (action === 'retry') this.actions.retry();
      else if (action === 'menu') this.actions.menu();
      else if (action === 'pause') this.actions.togglePause();
      else if (!this.latest?.paused && !this.latest?.error) this.actions.skip();
    }, togglePause: () => this.actions.togglePause(), isControlTarget: event => event.target instanceof HTMLButtonElement && this.root.contains(event.target) && !event.target.disabled });
    // A focus loop also works while the gameplay pointer remains locked.
    this.root.addEventListener('keydown', event => {
      if (event.code !== 'Tab') return;
      event.stopPropagation();
      const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.hidden && !button.disabled);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (!buttons.length) return;
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus({ preventScroll: true }); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus({ preventScroll: true }); }
    });
    this.root.addEventListener('keyup', event => { if (event.code === 'Tab') event.stopPropagation(); });
  }

  render(state: TransitionSnapshot, reducedMotion = false): void {
    this.latest = state;
    const active = state.phase === 'active';
    this.guard.setActive(active); this.root.hidden = !active;
    if (active && !this.wasActive) { this.priorFocus = document.activeElement as HTMLElement; this.root.focus({ preventScroll: true }); }
    if (!active && this.wasActive && this.root.contains(document.activeElement)) this.priorFocus?.focus?.({ preventScroll: true });
    this.wasActive = active;
    if (!active || !state.bridge) return;
    const set = (name: string, value: string) => { const node = this.node(name); if (node.textContent !== value) node.textContent = value; };
    this.root.dataset.reducedMotion = String(reducedMotion); this.root.dataset.paused = String(state.paused);
    set('stage', state.bridge.to); set('heading', state.bridge.heading); set('kicker', state.bridge.kicker);
    const visibleCue = state.cue ?? (state.narrationState === 'complete' ? state.bridge.cues.at(-1) : undefined);
    const key = `${state.bridge.id}:${visibleCue?.id ?? state.narrationState}`;
    const text = visibleCue?.text ?? '';
    if (key !== this.lastCue) {
      this.lastCue = key; this.node('caption').textContent = text;
      // Restart a small entrance only on actual cue changes, never every RAF.
      const fresh = this.node('caption').cloneNode(true) as HTMLElement;
      fresh.dataset.reveal = 'true'; this.node('caption').replaceWith(fresh); this.nodes.set('caption', fresh);
    }
    const done = ['complete', 'skipped'].includes(state.narrationState);
    set('status', state.error ? '加载遇到问题' : state.paused ? '已暂停' : done && state.loadState !== 'ready' ? '正在加载下一关…' : state.loadState === 'ready' ? '下一关已准备好' : '正在加载下一关…');
    const error = this.node('error'); error.hidden = !state.error;
    set('error', state.error ? state.error.stage === 'load' ? '下一关加载失败，请重试。' : '进入下一关失败，请返回菜单。' : '');
    this.node('retry').hidden = state.error?.stage !== 'load';
    this.node('skip').hidden = done || !!state.error;
    (this.node('skip') as HTMLButtonElement).disabled = state.paused;
    set('pause', state.paused ? '继续' : '暂停');
    const track = this.node('track');
    const progress = state.loadState === 'ready' ? 1 : state.loadProgress;
    track.dataset.indeterminate = String(progress === null && state.loadState === 'loading');
    if (progress === null) track.removeAttribute('aria-valuenow');
    else track.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    this.node('fill').style.width = progress === null ? '' : `${progress * 100}%`;
  }

  private node(name: string): HTMLElement { return this.nodes.get(name)!; }
  dispose(): void { this.guard.dispose(); this.root.remove(); }
}
