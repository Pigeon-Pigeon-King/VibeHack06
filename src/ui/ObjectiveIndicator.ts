import type { PerspectiveCamera } from 'three';
import type { ControlMode, RunMode, Vec3 } from '../contracts';
import { avoidHud, projectObjective } from './objective-projection';
import './objective-indicator.css';

/** Read-only navigation. No mission, save, camera or input state is owned by this view. */
export class ObjectiveIndicator {
  private readonly root = document.createElement('div');
  private readonly arrow = document.createElement('span');
  private readonly text = document.createElement('span');
  private readonly hud: HTMLElement[];
  private turnSide = 1;

  constructor(private readonly container: HTMLElement) {
    this.root.className = 'objective-direction';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '目标方向');
    this.arrow.className = 'objective-direction-arrow';
    this.arrow.setAttribute('aria-hidden', 'true');
    this.arrow.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4l8 8-8 8" /></svg>';
    this.text.className = 'objective-direction-label';
    this.root.append(this.arrow, this.text);
    this.hud = [...container.querySelectorAll<HTMLElement>('.objective-cluster, .hud-session, .radio-subtitle, .survival-cluster, .ammunition-cluster, .game-error, .game-diagnostics, .interaction-prompt, .touch-joystick, .touch-action-button, .touch-context-actions, .touch-pause')];
    container.append(this.root);
  }

  update(camera: PerspectiveCamera, point: Vec3, player: Vec3, mode: RunMode, control: ControlMode): void {
    this.root.hidden = true;
    if (mode !== 'playing' || control === 'staged') { this.turnSide = 1; return; }
    const range = Math.hypot(...point.map((n, i) => n - player[i]));
    if (!Number.isFinite(range) || range < 1) return;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    // Goal points are floor/interaction anchors; a torso-height point avoids aiming at the floor.
    const projected = projectObjective([point[0], point[1] + 1.2, point[2]], camera, width, height, this.turnSide);
    if (!projected) return;
    this.turnSide = projected.turnSide;
    // Existing depth-tested world markers take over as soon as the destination enters the view.
    if (!projected.offscreen) return;
    const origin = this.container.getBoundingClientRect();
    const occupied = this.hud.filter(node => node.getClientRects().length > 0).map(node => {
      const r = node.getBoundingClientRect();
      return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top };
    });
    const position = avoidHud(projected, width, height, occupied);
    if (!position) return;
    this.root.dataset.behind = String(projected.behind);
    this.root.style.left = `${position.x}px`; this.root.style.top = `${position.y}px`;
    this.arrow.style.transform = `rotate(${projected.angle}rad)`;
    const label = `${projected.behind ? '身后' : '目标'} ${Math.round(range)} m`;
    if (this.text.textContent !== label) this.text.textContent = label;
    this.root.hidden = false;
  }

  dispose(): void { this.root.remove(); }
}
