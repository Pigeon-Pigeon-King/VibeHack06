import { TouchInputState, type TouchAction } from './TouchInputState';

export interface Intent {
  forward: number; right: number; sprint: boolean; crouch: boolean; jump: boolean;
  fire: boolean; ads: boolean; reload: boolean; interact: boolean; skip: boolean;
  yaw: number; pitch: number;
  cover?: boolean;
}
const POINTER_LOCK_ERROR = '锁定鼠标未获允许；方向键可转向。点击画面可重试。';
const clampPitch = (pitch: number): number => Math.max(-1.35, Math.min(1.35, pitch));
const clampAxis = (axis: number): number => Math.max(-1, Math.min(1, axis));

export class Input {
  yaw = 0; pitch = 0; sensitivity = 1;
  private _enabled = false;
  private _touchEnabled = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  private touch = new TouchInputState();
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouse = new Set<number>();
  private abort = new AbortController();
  private lockGeneration = 0;
  private pendingLock: number | null = null;
  private ignoreTouchUnlock = false;
  private disposed = false;

  get enabled(): boolean { return this._enabled; }
  set enabled(enabled: boolean) {
    this._enabled = enabled && !this.disposed;
    if (!this._enabled) { this.clear(); this.cancelPendingLock(); }
  }
  get touchEnabled(): boolean { return this._touchEnabled; }

  constructor(private canvas: HTMLCanvasElement, private pause: () => void, private error: (message: string) => void) {
    const options = { signal: this.abort.signal };
    document.addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Escape') { this.clear(); this.pause(); }
    }, options);
    document.addEventListener('keyup', e => this.keys.delete(e.code), options);
    document.addEventListener('mousemove', e => {
      if (!this.enabled || this.touchEnabled || document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0018 * this.sensitivity;
      this.pitch = clampPitch(this.pitch - e.movementY * 0.0018 * this.sensitivity);
    }, options);
    document.addEventListener('mousedown', e => { if (this.enabled && !this.touchEnabled && document.pointerLockElement === canvas) this.mouse.add(e.button); }, options);
    document.addEventListener('mouseup', e => this.mouse.delete(e.button), options);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), options);
    canvas.addEventListener('click', () => { if (this.enabled && document.pointerLockElement !== canvas) this.lock(); }, options);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) {
        this.pendingLock = null;
        if (this.touchEnabled || !this.enabled) this.releaseTouchLock();
        else { this.ignoreTouchUnlock = false; this.error(''); }
      } else if (this.ignoreTouchUnlock) this.ignoreTouchUnlock = false;
      else if (this.enabled && !this.touchEnabled) { this.clear(); this.pause(); }
    }, options);
    document.addEventListener('pointerlockerror', () => {
      if (this.pendingLock !== null) this.reportLockError(this.pendingLock, POINTER_LOCK_ERROR);
    }, options);
    window.addEventListener('blur', () => { this.clear(); if (this.enabled) this.pause(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (this.enabled) this.pause(); } }, options);
  }

  setTouchEnabled(enabled: boolean): void {
    if (this._touchEnabled === enabled) return;
    this._touchEnabled = enabled;
    this.clear(); this.cancelPendingLock(); this.error('');
    if (enabled) this.releaseTouchLock();
  }
  setTouchMove(forward: number, right: number): void {
    if (this.enabled && this.touchEnabled) this.touch.setMove(forward, right);
  }
  addTouchLook(deltaYaw: number, deltaPitch: number): void {
    if (!this.enabled || !this.touchEnabled) return;
    const sensitivity = Number.isFinite(this.sensitivity) ? this.sensitivity : 1;
    // The UI supplies signed radians, not a velocity; never scale these by dt.
    const yaw = this.yaw + deltaYaw * sensitivity, pitch = this.pitch + deltaPitch * sensitivity;
    if (Number.isFinite(deltaYaw) && Number.isFinite(yaw)) this.yaw = yaw;
    if (Number.isFinite(deltaPitch) && Number.isFinite(pitch)) this.pitch = clampPitch(pitch);
  }
  setTouchAction(action: TouchAction, pressed: boolean): void {
    if (this.enabled && this.touchEnabled) this.touch.setAction(action, pressed);
  }
  isTouchActionDown(action: TouchAction): boolean { return this.touch.isActionDown(action); }
  clearTouch(): void { this.touch.clear(); }

  lock(): void {
    if (this.touchEnabled || this.disposed) return;
    const request = ++this.lockGeneration;
    this.pendingLock = request;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') void result.catch(() => this.reportLockError(request, POINTER_LOCK_ERROR));
    } catch { this.reportLockError(request, '鼠标锁定不可用；方向键可转向。'); }
  }
  unlock(): void { this.cancelPendingLock(); if (document.pointerLockElement) document.exitPointerLock(); }
  private cancelPendingLock(): void { this.lockGeneration++; this.pendingLock = null; }
  private reportLockError(request: number, message: string): void {
    if (request !== this.pendingLock || request !== this.lockGeneration || !this.enabled || this.touchEnabled || this.disposed) return;
    this.pendingLock = null;
    this.error(message);
  }
  private releaseTouchLock(): void {
    if (document.pointerLockElement !== this.canvas) return;
    this.ignoreTouchUnlock = true;
    this.unlock();
  }
  clear(): void { this.keys.clear(); this.pressed.clear(); this.mouse.clear(); this.clearTouch(); }
  read(dt: number): Intent {
    const k = (code: string) => this.keys.has(code) ? 1 : 0;
    const touch = this.touch.read();
    this.yaw += (k('ArrowLeft') - k('ArrowRight')) * dt * 1.4;
    this.pitch = clampPitch(this.pitch + (k('ArrowUp') - k('ArrowDown')) * dt);
    const result: Intent = {
      forward: clampAxis(k('KeyW') - k('KeyS') + touch.forward), right: clampAxis(k('KeyD') - k('KeyA') + touch.right),
      sprint: !!(k('ShiftLeft') || k('ShiftRight')) || touch.sprint, crouch: !!(k('KeyC') || k('ControlLeft')) || touch.crouch,
      jump: this.pressed.has('Space') || touch.jump, fire: this.mouse.has(0) || !!k('KeyF') || touch.fire, ads: this.mouse.has(2) || touch.ads,
      reload: this.pressed.has('KeyR') || touch.reload, interact: this.pressed.has('KeyE') || touch.interact,
      cover: this.pressed.has('KeyQ') || touch.cover, skip: this.pressed.has('Enter') || touch.skip, yaw: this.yaw, pitch: this.pitch,
    };
    this.pressed.clear();
    return result;
  }
  dispose(): void { this.disposed = true; this.enabled = false; this.clear(); this.unlock(); this.abort.abort(); }
}
