import type { TouchAction } from '../player/TouchInputState';

export type TouchControl = 'move' | 'look' | TouchAction;

export interface TouchCallbacks {
  move(forward: number, right: number): void;
  look(deltaYaw: number, deltaPitch: number): void;
  action(action: TouchAction, down: boolean): void;
  active(action: TouchAction): boolean;
}

interface Contact {
  control: TouchControl;
  x: number;
  y: number;
  originX: number;
  originY: number;
  radius: number;
}

export const TOUCH_ACTIONS: readonly TouchAction[] = ['fire', 'ads', 'sprint', 'crouch', 'jump', 'reload', 'interact', 'cover', 'skip'];
export const TOUCH_TOGGLES: readonly TouchAction[] = ['ads', 'sprint', 'crouch'];

/** Pointer ownership and gesture math, shared by real DOM events and deterministic checks. */
export class TouchGestures {
  private readonly contacts = new Map<number, Contact>();
  private readonly owners = new Map<TouchControl, number>();
  private stick = { x: 0, y: 0 };

  constructor(private readonly callbacks: TouchCallbacks) {}

  has(pointerId: number): boolean { return this.contacts.has(pointerId); }
  owner(control: TouchControl): number | undefined { return this.owners.get(control); }
  joystick(): Readonly<{ x: number; y: number }> { return this.stick; }

  begin(control: TouchControl, pointerId: number, x: number, y: number,
    origin = { x, y, radius: 1 }): boolean {
    // A second finger cannot steal a stick/button, or turn its eventual release into
    // the first finger's release. Every control has exactly one owner until it ends.
    if (this.contacts.has(pointerId) || this.owners.has(control)) return false;
    if (![x, y, origin.x, origin.y, origin.radius].every(Number.isFinite)) return false;
    this.contacts.set(pointerId, { control, x, y, originX: origin.x, originY: origin.y, radius: Math.max(1, origin.radius) });
    this.owners.set(control, pointerId);
    if (control === 'move') this.move(pointerId, x, y, 1);
    else if (control !== 'look') this.callbacks.action(control, TOUCH_TOGGLES.includes(control) ? !this.callbacks.active(control) : true);
    return true;
  }

  move(pointerId: number, x: number, y: number, shortSide: number): void {
    const contact = this.contacts.get(pointerId);
    if (!contact || ![x, y].every(Number.isFinite)) return;
    if (contact.control === 'move') {
      const dx = (x - contact.originX) / contact.radius;
      const dy = (y - contact.originY) / contact.radius;
      const distance = Math.hypot(dx, dy);
      const scale = distance > 1 ? 1 / distance : 1;
      this.stick = { x: dx * scale * contact.radius, y: dy * scale * contact.radius };
      // Radial dead zone avoids unintended walking without making diagonals faster.
      const amount = Math.min(1, Math.max(0, (distance - 0.15) / 0.85));
      this.callbacks.move(amount > 0 ? -dy / distance * amount || 0 : 0, amount > 0 ? dx / distance * amount || 0 : 0);
    } else if (contact.control === 'look' || contact.control === 'fire') {
      const scale = 2.6 / Math.max(240, Number.isFinite(shortSide) ? shortSide : 390);
      this.callbacks.look(-(x - contact.x) * scale, -(y - contact.y) * scale);
    }
    contact.x = x;
    contact.y = y;
  }

  release(pointerId: number): boolean {
    const contact = this.contacts.get(pointerId);
    if (!contact) return false;
    this.contacts.delete(pointerId);
    this.owners.delete(contact.control);
    if (contact.control === 'move') {
      this.stick = { x: 0, y: 0 };
      this.callbacks.move(0, 0);
    } else if (contact.control !== 'look' && !TOUCH_TOGGLES.includes(contact.control)) {
      this.callbacks.action(contact.control, false);
    }
    return true;
  }

  cancel(control: TouchControl): void {
    const pointerId = this.owners.get(control);
    if (pointerId !== undefined) this.release(pointerId);
    if (control !== 'move' && control !== 'look' && this.callbacks.active(control)) this.callbacks.action(control, false);
  }

  reset(): void {
    for (const pointerId of this.contacts.keys()) this.release(pointerId);
    this.stick = { x: 0, y: 0 };
    this.callbacks.move(0, 0);
    // Toggles live in Input, not this view. Clear their actual current values too.
    for (const action of TOUCH_ACTIONS) if (this.callbacks.active(action)) this.callbacks.action(action, false);
  }
}
