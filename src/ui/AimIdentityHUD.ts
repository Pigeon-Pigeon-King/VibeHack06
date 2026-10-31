import type { AimIdentityHit, AimIdentityTarget } from '../presentation/AimIdentity';

const FADE_IN = 0.10;
const FADE_OUT = 0.08;
const STYLE = `
.aim-identity-hud {
  position: fixed; left: 50%; top: calc(50% + 29px);
  transform: translateX(-50%); z-index: 6; pointer-events: none;
  max-width: min(28rem, calc(100vw - 40px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  padding: 0 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  color: #c9e5e5; opacity: 0; text-align: center;
  font: 550 clamp(14px, 1.4vw, 16px)/1.35 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: .06em; text-shadow: 0 1px 2px #050a0e, 0 0 5px #050a0e;
  user-select: none;
}
.aim-identity-hud[data-tone="hostile"] { color: #f0c3c3; }
.aim-identity-hud[hidden] { display: none !important; }
`;

/** A single screen-space name. The host owns camera/mission visibility; no RAF or timers. */
export class AimIdentityHUD {
  readonly element: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private current?: AimIdentityTarget;
  private opacity = 0;
  private disposed = false;

  constructor(parent: HTMLElement = document.body) {
    const doc = parent.ownerDocument;
    this.style = doc.createElement('style'); this.style.textContent = STYLE;
    this.style.dataset.aimIdentityStyle = '';
    doc.head.append(this.style);
    this.element = doc.createElement('div'); this.element.className = 'aim-identity-hud';
    this.element.hidden = true; this.element.setAttribute('aria-hidden', 'true');
    parent.append(this.element);
  }

  update(hit: AimIdentityHit | null, dt: number, visible: boolean, reduceMotion = false): void {
    if (this.disposed) return;
    // Menus, pause, staging, death and new occluders clear immediately. No old
    // friendly name may linger on an anonymous enemy or through a wall.
    if (!visible || hit && (!hit.target || hit.target.id !== hit.hitId || !hit.target.name.trim())) {
      this.clear(); return;
    }
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
    if (!hit) {
      this.opacity = reduceMotion ? 0 : Math.max(0, this.opacity - step / FADE_OUT);
      if (!this.opacity) { this.clear(); return; }
    } else {
      const target = hit.target!;
      if (!this.current || this.current.id !== target.id || this.current.name !== target.name || this.current.tone !== target.tone) {
        this.current = { ...target }; this.opacity = 0;
        this.element.textContent = target.name;
        this.element.dataset.tone = target.tone;
      }
      this.opacity = reduceMotion ? 1 : Math.min(1, this.opacity + step / FADE_IN);
    }
    this.element.hidden = this.opacity <= 0;
    this.element.style.opacity = String(this.opacity);
  }

  private clear(): void {
    this.current = undefined; this.opacity = 0;
    this.element.hidden = true; this.element.textContent = ''; this.element.style.opacity = '0';
    delete this.element.dataset.tone;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear(); this.element.remove(); this.style.remove(); this.disposed = true;
  }
}
