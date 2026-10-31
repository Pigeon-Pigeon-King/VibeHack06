export const HIT_CONFIRMATION_COLOR = '#f6f8fa';
export const KILL_CONFIRMATION_COLOR = '#ef5656';

export interface HitConfirmation {
  opacity: number;
  color: string;
}

const flashStrength = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Presentation only: Simulation owns hit/kill events and their fade clocks. */
export function hitConfirmation(hitFlash: number, killFlash: number, playing: boolean): HitConfirmation {
  const hit = playing ? flashStrength(hitFlash) : 0;
  const kill = playing ? flashStrength(killFlash) : 0;
  return {
    opacity: Math.max(hit, kill),
    // A simultaneous hit cannot turn a confirmed kill white or dim its marker.
    color: kill > 0 ? KILL_CONFIRMATION_COLOR : HIT_CONFIRMATION_COLOR,
  };
}
