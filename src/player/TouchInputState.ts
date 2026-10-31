export type TouchAction = 'fire' | 'ads' | 'sprint' | 'crouch' | 'jump' | 'reload' | 'interact' | 'cover' | 'skip';

type TouchFrame = Record<TouchAction, boolean> & { forward: number; right: number };
const EDGE_ACTIONS = new Set<TouchAction>(['jump', 'reload', 'interact', 'cover', 'skip']);
const axis = (value: number): number => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

/** Touch state only; pointer ownership and joystick dead zones belong to the UI. */
export class TouchInputState {
  private forward = 0;
  private right = 0;
  private down = new Set<TouchAction>();
  private pressed = new Set<TouchAction>();

  setMove(forward: number, right: number): void {
    this.forward = axis(forward);
    this.right = axis(right);
  }

  setAction(action: TouchAction, pressed: boolean): void {
    if (!pressed) { this.down.delete(action); return; }
    if (action === 'sprint') { this.down.delete('ads'); this.down.delete('crouch'); }
    else if (action === 'ads' || action === 'crouch') this.down.delete('sprint');
    if (!this.down.has(action) && EDGE_ACTIONS.has(action)) this.pressed.add(action);
    this.down.add(action);
  }

  isActionDown(action: TouchAction): boolean { return this.down.has(action); }

  read(): TouchFrame {
    const frame: TouchFrame = {
      forward: this.forward, right: this.right,
      fire: this.down.has('fire'), ads: this.down.has('ads'),
      sprint: this.down.has('sprint'), crouch: this.down.has('crouch'),
      jump: this.pressed.has('jump'), reload: this.pressed.has('reload'),
      interact: this.pressed.has('interact'), cover: this.pressed.has('cover'), skip: this.pressed.has('skip'),
    };
    // Releases do not erase a short tap before the next simulation step.
    this.pressed.clear();
    return frame;
  }

  clear(): void {
    this.forward = 0; this.right = 0;
    this.down.clear(); this.pressed.clear();
  }
}
