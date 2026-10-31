export type HeldItem = 'none' | 'weapon' | 'supply';
export interface HeldItemPose { weapon: number; supply: number; wall: number }

const smooth = (value: number) => value * value * (3 - 2 * value);
const toward = (value: number, target: number, delta: number) => value < target
  ? Math.min(target, value + delta) : Math.max(target, value - delta);

/** Presentation only: never changes weapon permissions, ammunition or carry facts. */
export class HeldItemMotion {
  private weapon = 0;
  private supply = 0;
  private wall = 0;

  reset(item: HeldItem): void {
    this.weapon = item === 'weapon' ? 1 : 0;
    this.supply = item === 'supply' ? 1 : 0;
    this.wall = 0;
  }

  update(item: HeldItem, dt: number, lowMotion: boolean, firing: boolean, wallBlocked: boolean): HeldItemPose {
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    // A real shot must have a visible weapon. Do not delay the simulation's shot
    // or leave a muzzle flash on an invisible, partially raised view model.
    if (item === 'weapon' && firing && seconds > 0) { this.weapon = 1; this.supply = 0; }
    else {
      const speed = lowMotion ? 0.10 : 0.32;
      if (item !== 'weapon') this.weapon = toward(this.weapon, 0, seconds / speed);
      if (item !== 'supply') this.supply = toward(this.supply, 0, seconds / speed);
      // Hands release the old item before taking the new one. This also makes a
      // mid-animation reversal continuous without showing two pairs of arms.
      if (item === 'weapon' && this.supply === 0) this.weapon = toward(this.weapon, 1, seconds / speed);
      if (item === 'supply' && this.weapon === 0) this.supply = toward(this.supply, 1, seconds / (lowMotion ? 0.10 : 0.42));
    }
    this.wall = toward(this.wall, wallBlocked ? 1 : 0, seconds / 0.14);
    return { weapon: smooth(this.weapon), supply: smooth(this.supply), wall: smooth(this.wall) };
  }
}
