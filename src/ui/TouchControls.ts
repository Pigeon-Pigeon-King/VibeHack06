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
  private readonly rotationNotice = document.createElement('div');
  private readonly gameInterface: HTMLElement | null;
  private portraitBlocked = false;
  private portraitPauseRequested = false;
  private previousInterfaceInert = false;
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
      <div class="touch-move-zone" data-touch-control="move" role="group" aria-label="左侧拖动移动">
        <span class="touch-move-hint" aria-hidden="true">拖动移动</span>
        <div class="touch-joystick" aria-hidden="true" hidden>
          <span class="touch-stick-track"></span><span class="touch-stick-knob">移动</span>
        </div>
      </div>
      <div class="touch-action-grid">
        ${(['reload', 'ads', 'fire', 'sprint', 'crouch', 'jump'] as const).map(action => this.button(action)).join('')}
      </div>
      <div class="touch-context-actions">${(['interact', 'cover', 'skip'] as const).map(action => this.button(action)).join('')}</div>
      <button class="touch-pause" type="button" aria-label="暂停" title="暂停"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg></button>
    `;
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-touch-control]')) this.controls.set(node.dataset.touchControl as TouchControl, node);
    this.joystick = this.root.querySelector<HTMLElement>('.touch-joystick')!;
    this.pauseButton = this.root.querySelector<HTMLButtonElement>('.touch-pause')!;
    this.contextActions = this.root.querySelector<HTMLElement>('.touch-context-actions')!;
    this.gameInterface = container.querySelector<HTMLElement>('.game-interface');
    this.rotationNotice.className = 'touch-rotation-notice';
    this.rotationNotice.hidden = true;
    this.rotationNotice.tabIndex = -1;
    this.rotationNotice.setAttribute('role', 'dialog');
    this.rotationNotice.setAttribute('aria-modal', 'true');
    this.rotationNotice.setAttribute('aria-label', '横屏游玩');
    this.rotationNotice.innerHTML = '<svg viewBox="0 0 96 72" aria-hidden="true"><rect x="19" y="18" width="60" height="36" rx="6"/><path d="M69 29v14M12 34V20a12 12 0 0 1 12-12h18M34 2l8 6-8 6M84 38v14a12 12 0 0 1-12 12H54M62 58l-8 6 8 6"/></svg><strong>横屏游玩</strong><p>请将手机横过来</p>';
    container.append(this.root);
    // Chapter loading hides #game-ui; the portrait guard must remain above it.
    this.app.append(this.rotationNotice);
    const options = { signal: this.events.signal };
    // Registered before the chapter overlay's capture handlers. A tap on the
    // rotate notice must not become a skip/continue underneath it.
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup']) {
      document.addEventListener(type, this.guardPortrait, { ...options, capture: true });
    }
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
    window.visualViewport?.addEventListener('resize', this.onResize, options);
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
    this.syncOrientation();
    const hidden = !state.enabled || state.mode !== 'playing' || this.portraitBlocked;
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
    this.rotationNotice.remove();
    if (this.portraitBlocked && this.gameInterface) this.gameInterface.inert = this.previousInterfaceInert;
    this.app.classList.remove('touch-input');
    this.app.classList.remove('touch-portrait');
    this.app.style.removeProperty('--touch-hud-bottom');
    this.app.style.removeProperty('--touch-context-height');
  }

  private button(action: TouchAction): string {
    const icon = action === 'fire' ? '<svg class="touch-fire-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="8"/><path d="M16 2v7m0 14v7M2 16h7m14 0h7"/></svg>' : '';
    return `<button class="touch-action-button touch-${action}" data-touch-control="${action}" type="button" aria-label="${labels[action]}"${TOUCH_TOGGLES.includes(action) ? ' aria-pressed="false"' : ''}>${icon}<span>${labels[action]}</span></button>`;
  }

  private live(): boolean { return !this.disposed && !this.portraitBlocked && Boolean(this.state?.enabled) && this.state?.mode === 'playing' && !document.hidden; }

  private guardPortrait = (event: Event): void => {
    if (!this.portraitBlocked || this.disposed) return;
    if ((event.type === 'keydown' || event.type === 'keyup') && ((event as KeyboardEvent).metaKey || (event as KeyboardEvent).ctrlKey)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.live() || event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-touch-control]') : null;
    if (!target || !this.root.contains(target) || target.hidden) return;
    event.preventDefault(); event.stopPropagation();
    const control = target.dataset.touchControl as TouchControl;
    const bounds = target.getBoundingClientRect();
    // Every new left-thumb contact starts neutral at that touch, not at a fixed
    // button centre. Keep the established 38.4px travel/deadzone and Input path.
    const origin = { x: event.clientX, y: event.clientY, radius: 38.4 };
    if (!this.gestures.begin(control, event.pointerId, event.clientX, event.clientY, origin)) return;
    if (control === 'move') {
      this.joystick.style.left = `${event.clientX - bounds.left}px`;
      this.joystick.style.top = `${event.clientY - bounds.top}px`;
    }
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
    const moving = this.gestures.owner('move') !== undefined;
    this.joystick.hidden = !moving;
    this.joystick.classList.toggle('is-held', moving);
    this.controls.get('move')!.classList.toggle('is-held', moving);
    for (const action of TOUCH_ACTIONS) {
      const node = this.controls.get(action)!;
      node.classList.toggle('is-held', this.gestures.owner(action) !== undefined);
      if (TOUCH_TOGGLES.includes(action)) {
        const pressed = String(this.callbacks.active(action));
        if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed);
      }
    }
  }

  private onResize = (): void => {
    this.reset();
    this.syncOrientation();
    if (this.state) this.root.hidden = !this.state.enabled || this.state.mode !== 'playing' || this.portraitBlocked;
    this.queueLayout();
  };

  private syncOrientation(): void {
    const width = this.app.clientWidth, height = this.app.clientHeight;
    // An intermediate zero-size viewport must not dismiss an existing guard.
    const blocked = Boolean(this.state?.enabled) && (width > 0 && height > 0 ? height > width : this.portraitBlocked);
    if (blocked !== this.portraitBlocked) {
      this.portraitBlocked = blocked;
      this.rotationNotice.hidden = !blocked;
      this.app.classList.toggle('touch-portrait', blocked);
      this.reset();
      if (this.gameInterface) {
        if (blocked) { this.previousInterfaceInert = this.gameInterface.inert; this.gameInterface.inert = true; }
        else this.gameInterface.inert = this.previousInterfaceInert;
      }
      if (blocked) this.rotationNotice.focus({ preventScroll: true });
      else if (this.state?.mode === 'paused') this.gameInterface?.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus({ preventScroll: true });
    }
    if (!blocked || this.state?.mode !== 'playing' && this.state?.mode !== 'transition') this.portraitPauseRequested = false;
    else if (!this.portraitPauseRequested) {
      this.portraitPauseRequested = true;
      // Use the existing game pause; never resume combat on rotation alone.
      if (this.state?.mode === 'transition') {
        // showTransition renders this view just before transition.start().
        // Defer until that synchronous setup has finished; don't pause its old run.
        queueMicrotask(() => {
          if (!this.disposed && this.portraitBlocked && this.state?.mode === 'transition') this.callbacks.pause();
        });
      } else this.callbacks.pause();
    }
  }

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
