import type { ControlMode, RunMode } from '../contracts';
import type { TouchAction } from '../player/TouchInputState';
import { TOUCH_ACTIONS, TOUCH_TOGGLES, TouchGestures, type TouchCallbacks, type TouchControl } from './touch-gestures';
import './touch-controls.css';

interface TouchState {
  enabled: boolean;
  mode: RunMode;
  control: ControlMode;
  interaction: string;
  coverAvailable: boolean;
  skipAvailable: boolean;
  epoch: number;
}

const labels: Record<TouchAction, string> = {
  fire: '开火', ads: '瞄准', sprint: '冲刺', crouch: '蹲伏', jump: '跳跃',
  reload: '换弹', interact: '交互', cover: '请求掩护', skip: '跳过演出',
};

/** View-only touch/mouse controls. Input owns action state and the simulation owns availability. */
export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly app: HTMLElement;
  private readonly events = new AbortController();
  private readonly gestures: TouchGestures;
  private readonly controls = new Map<TouchControl, HTMLElement>();
  private readonly captures = new Map<number, HTMLElement>();
  private readonly hud: HTMLElement[];
  private readonly observer: ResizeObserver;
  private readonly joystick: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly contextActions: HTMLElement;
  private state?: TouchState;
  private layoutFrame = 0;
  private lastStickX = NaN;
  private lastStickY = NaN;
  private disposed = false;

  constructor(container: HTMLElement, private readonly callbacks: TouchCallbacks & { pause(): void }) {
    this.app = container.closest<HTMLElement>('#app') ?? container;
    this.gestures = new TouchGestures(callbacks);
    this.root.className = 'touch-controls';
    this.root.setAttribute('aria-label', '触屏操作');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-look-zone" data-touch-control="look" aria-hidden="true"></div>
      <div class="touch-joystick" data-touch-control="move" role="group" aria-label="移动摇杆">
        <span class="touch-stick-track" aria-hidden="true"></span><span class="touch-stick-knob" aria-hidden="true">移动</span>
      </div>
      <div class="touch-action-grid">
        ${(['reload', 'ads', 'fire', 'sprint', 'crouch', 'jump'] as const).map(action => this.button(action)).join('')}
      </div>
      <div class="touch-context-actions">${(['interact', 'cover', 'skip'] as const).map(action => this.button(action)).join('')}</div>
      <button class="touch-pause" type="button" aria-label="暂停" title="暂停"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg></button>
    `;
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-touch-control]')) this.controls.set(node.dataset.touchControl as TouchControl, node);
    this.joystick = this.controls.get('move')!;
    this.pauseButton = this.root.querySelector<HTMLButtonElement>('.touch-pause')!;
    this.contextActions = this.root.querySelector<HTMLElement>('.touch-context-actions')!;
    container.append(this.root);
    const options = { signal: this.events.signal };
    this.root.addEventListener('pointerdown', this.onPointerDown, options);
    this.root.addEventListener('lostpointercapture', this.onPointerEnd, options);
    this.root.addEventListener('contextmenu', event => event.preventDefault(), options);
    this.root.addEventListener('click', this.onClick, options);
    this.root.addEventListener('keydown', this.onKeyDown, options);
    window.addEventListener('keyup', this.onKeyUp, options);
    this.root.addEventListener('focusout', () => { if (this.gestures.release(-1)) this.syncFeedback(); }, options);
    window.addEventListener('pointermove', this.onPointerMove, { ...options, passive: false });
    window.addEventListener('pointerup', this.onPointerEnd, options);
    window.addEventListener('pointercancel', this.onPointerEnd, options);
    window.addEventListener('blur', this.reset, options);
    window.addEventListener('resize', this.onResize, options);
    window.addEventListener('orientationchange', this.onResize, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); }, options);
    this.hud = [...this.app.querySelectorAll<HTMLElement>('.objective-cluster, .survival-cluster, .ammunition-cluster')];
    this.observer = new ResizeObserver(this.queueLayout);
    this.observer.observe(this.app);
    this.observer.observe(this.contextActions);
    for (const node of this.hud) this.observer.observe(node);
  }

  render(state: TouchState): void {
    if (this.disposed) return;
    const old = this.state;
    if (!old || old.enabled !== state.enabled || old.mode !== state.mode || old.control !== state.control || old.epoch !== state.epoch) this.reset();
    // Holding the old prompt must not also activate a newly arrived interaction.
    if (old?.interaction !== state.interaction) this.cancel('interact');
    this.state = { ...state };
    this.app.classList.toggle('touch-input', state.enabled);
    const hidden = !state.enabled || state.mode !== 'playing';
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    if (this.root.dataset.control !== state.control) this.root.dataset.control = state.control;
    const movement = state.control !== 'staged';
    const freeMovement = state.control === 'combat' || state.control === 'work';
    const visible: Record<TouchControl, boolean> = {
      move: movement, look: movement, fire: state.control === 'combat', ads: state.control === 'combat', reload: state.control === 'combat',
      sprint: freeMovement, crouch: freeMovement, jump: freeMovement,
      interact: movement && Boolean(state.interaction.trim()), cover: movement && state.coverAvailable, skip: state.skipAvailable,
    };
    for (const [control, node] of this.controls) {
      if (!visible[control]) this.cancel(control);
      if (node.hidden === visible[control]) node.hidden = !visible[control];
    }
    const interact = this.controls.get('interact')!;
    if (interact.textContent !== state.interaction) interact.textContent = state.interaction;
    const interactionLabel = state.interaction || labels.interact;
    if (interact.getAttribute('aria-label') !== interactionLabel) interact.setAttribute('aria-label', interactionLabel);
    this.syncFeedback();
    if (!old || old.enabled !== state.enabled || old.mode !== state.mode || old.control !== state.control) this.queueLayout();
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.events.abort();
    this.observer.disconnect();
    cancelAnimationFrame(this.layoutFrame);
    this.root.remove();
    this.app.classList.remove('touch-input');
    this.app.style.removeProperty('--touch-hud-bottom');
    this.app.style.removeProperty('--touch-context-height');
  }

  private button(action: TouchAction): string {
    const icon = action === 'fire' ? '<svg class="touch-fire-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8"/><path d="M16 2v7m0 14v7M2 16h7m14 0h7"/></svg>' : '';
    return `<button class="touch-action-button touch-${action}" data-touch-control="${action}" type="button" aria-label="${labels[action]}"${TOUCH_TOGGLES.includes(action) ? ' aria-pressed="false"' : ''}>${icon}<span>${labels[action]}</span></button>`;
  }

  private live(): boolean { return !this.disposed && Boolean(this.state?.enabled) && this.state?.mode === 'playing' && !document.hidden; }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.live() || event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-control]') : null;
    if (!target || !this.root.contains(target) || target.hidden) return;
    event.preventDefault(); event.stopPropagation();
    const control = target.dataset.touchControl as TouchControl;
    const bounds = target.getBoundingClientRect();
    const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: Math.min(bounds.width, bounds.height) * 0.3 };
    if (!this.gestures.begin(control, event.pointerId, event.clientX, event.clientY, origin)) return;
    this.captures.set(event.pointerId, target);
    try { target.setPointerCapture(event.pointerId); } catch { /* Window end listeners still release an interrupted contact. */ }
    this.syncFeedback();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.gestures.has(event.pointerId)) return;
    if (!this.live()) { this.reset(); return; }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    this.gestures.move(event.pointerId, event.clientX, event.clientY, Math.min(this.app.clientWidth, this.app.clientHeight));
    this.syncFeedback();
  };

  private onPointerEnd = (event: PointerEvent): void => {
    if (!this.gestures.has(event.pointerId)) return;
    event.stopPropagation();
    if (event.type === 'pointerup') this.release(event.pointerId);
    else {
      const control = [...this.controls.keys()].find(key => this.gestures.owner(key) === event.pointerId);
      if (control) this.cancel(control);
    }
    this.syncFeedback();
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target || !this.root.contains(target)) return;
    event.preventDefault(); event.stopPropagation();
    if (target === this.pauseButton && this.live()) { this.reset(); this.callbacks.pause(); }
    // Pointer and keyboard down/up dispatch actions. Do not dispatch the synthesized click a second time.
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.live() || !['Space', 'Enter'].includes(event.code)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target === this.pauseButton) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) { this.reset(); this.callbacks.pause(); }
      return;
    }
    const control = target?.dataset.touchControl as TouchControl | undefined;
    if (!control || !TOUCH_ACTIONS.includes(control as TouchAction) || target?.hidden) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) this.gestures.begin(control, -1, 0, 0);
    this.syncFeedback();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!['Space', 'Enter'].includes(event.code) || !this.gestures.has(-1)) return;
    event.preventDefault(); event.stopPropagation();
    this.gestures.release(-1);
    this.syncFeedback();
  };

  private release(pointerId: number): void {
    this.gestures.release(pointerId);
    const target = this.captures.get(pointerId);
    this.captures.delete(pointerId);
    if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  }

  private cancel(control: TouchControl): void {
    const pointerId = this.gestures.owner(control);
    if (pointerId !== undefined) this.release(pointerId);
    this.gestures.cancel(control);
  }

  private reset = (): void => {
    this.gestures.reset();
    for (const pointerId of this.captures.keys()) this.release(pointerId);
    this.syncFeedback();
  };

  private syncFeedback(): void {
    const stick = this.gestures.joystick();
    if (stick.x !== this.lastStickX) this.joystick.style.setProperty('--stick-x', `${stick.x}px`);
    if (stick.y !== this.lastStickY) this.joystick.style.setProperty('--stick-y', `${stick.y}px`);
    this.lastStickX = stick.x; this.lastStickY = stick.y;
    this.joystick.classList.toggle('is-held', this.gestures.owner('move') !== undefined);
    for (const action of TOUCH_ACTIONS) {
      const node = this.controls.get(action)!;
      node.classList.toggle('is-held', this.gestures.owner(action) !== undefined);
      if (TOUCH_TOGGLES.includes(action)) {
        const pressed = String(this.callbacks.active(action));
        if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed);
      }
    }
  }

  private onResize = (): void => { this.reset(); this.queueLayout(); };

  private queueLayout = (): void => {
    if (this.disposed || this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      if (!this.state?.enabled || this.state.mode !== 'playing') return;
      const bounds = this.app.getBoundingClientRect();
      let bottom = 60;
      for (const node of this.hud) {
        if (!node.getClientRects().length) continue;
        const rect = node.getBoundingClientRect();
        // Portrait status is above the sticks, not part of the top objective row.
        if (rect.top - bounds.top < bounds.height * 0.4) bottom = Math.max(bottom, rect.bottom - bounds.top);
      }
      const hudBottom = `${Math.ceil(bottom)}px`;
      if (this.app.style.getPropertyValue('--touch-hud-bottom') !== hudBottom) this.app.style.setProperty('--touch-hud-bottom', hudBottom);
      // Reserve the same single-button space even while no interaction is nearby.
      const contextHeight = `${Math.max(52, Math.ceil(this.contextActions.getBoundingClientRect().height))}px`;
      if (this.app.style.getPropertyValue('--touch-context-height') !== contextHeight) this.app.style.setProperty('--touch-context-height', contextHeight);
    });
  };
}
