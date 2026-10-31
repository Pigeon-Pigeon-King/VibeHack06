export interface Intent {
  forward: number; right: number; sprint: boolean; crouch: boolean; jump: boolean;
  fire: boolean; ads: boolean; reload: boolean; interact: boolean; skip: boolean;
  yaw: number; pitch: number;
  cover?: boolean;
}
export class Input {
  enabled = false;
  yaw = 0; pitch = 0; sensitivity = 1;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouse = new Set<number>();
  private abort = new AbortController();
  constructor(private canvas: HTMLCanvasElement, private pause: () => void, private error: (message: string) => void) {
    const options = { signal: this.abort.signal };
    document.addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Escape') this.pause();
    }, options);
    document.addEventListener('keyup', e => this.keys.delete(e.code), options);
    document.addEventListener('mousemove', e => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0018 * this.sensitivity;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * 0.0018 * this.sensitivity));
    }, options);
    document.addEventListener('mousedown', e => { if (this.enabled && document.pointerLockElement === canvas) this.mouse.add(e.button); }, options);
    document.addEventListener('mouseup', e => this.mouse.delete(e.button), options);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), options);
    canvas.addEventListener('click', () => { if (this.enabled && document.pointerLockElement !== canvas) this.lock(); }, options);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.error('');
      else if (this.enabled) this.pause();
    }, options);
    document.addEventListener('pointerlockerror', () => this.error('锁定鼠标未获允许；方向键可转向。点击画面可重试。'), options);
    window.addEventListener('blur', () => { this.clear(); if (this.enabled) this.pause(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (this.enabled) this.pause(); } }, options);
  }
  lock(): void {
    try {
      const result = this.canvas.requestPointerLock();
      if (result instanceof Promise) result.catch(() => this.error('锁定鼠标未获允许；方向键可转向。点击画面可重试。'));
    } catch { this.error('鼠标锁定不可用；方向键可转向。'); }
  }
  unlock(): void { if (document.pointerLockElement) document.exitPointerLock(); }
  clear(): void { this.keys.clear(); this.pressed.clear(); this.mouse.clear(); }
  read(dt: number): Intent {
    const k = (code: string) => this.keys.has(code) ? 1 : 0;
    this.yaw += (k('ArrowLeft') - k('ArrowRight')) * dt * 1.4;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + (k('ArrowUp') - k('ArrowDown')) * dt));
    const result: Intent = {
      forward: k('KeyW') - k('KeyS'), right: k('KeyD') - k('KeyA'),
      sprint: !!(k('ShiftLeft') || k('ShiftRight')), crouch: !!(k('KeyC') || k('ControlLeft')),
      jump: this.pressed.has('Space'), fire: this.mouse.has(0) || !!k('KeyF'), ads: this.mouse.has(2),
      reload: this.pressed.has('KeyR'), interact: this.pressed.has('KeyE'), cover: this.pressed.has('KeyQ'), skip: this.pressed.has('Enter'), yaw: this.yaw, pitch: this.pitch,
    };
    this.pressed.clear();
    return result;
  }
  dispose(): void { this.enabled = false; this.clear(); this.unlock(); this.abort.abort(); }
}
