import type { Vec3 } from '../contracts';

interface Sample { time: number; x: number; z: number; speed: number }
interface FallSample { time: number; down: boolean; started?: number }
export const CHARACTER_FALL_SECONDS = 0.65;

/** Measure simulation displacement once per simulation time, not once per rendered frame. */
export class CharacterMotionTracker {
  private readonly samples = new Map<string, Sample>();
  private readonly falls = new Map<string, FallSample>();

  speed(id: string, position: Vec3, simulationTime: number): number {
    const previous = this.samples.get(id);
    if (!previous || simulationTime < previous.time) {
      this.samples.set(id, { time: simulationTime, x: position[0], z: position[2], speed: 0 });
      return 0;
    }
    if (simulationTime === previous.time) return previous.speed;
    const dt = simulationTime - previous.time;
    const travelled = Math.hypot(position[0] - previous.x, position[2] - previous.z);
    // Saved/story teleports and long suspended intervals do not represent a stride.
    const speed = dt > 0.25 || travelled > Math.max(1, dt * 12) ? 0 : travelled / dt;
    this.samples.set(id, { time: simulationTime, x: position[0], z: position[2], speed });
    return speed;
  }

  /** Existing saved bodies start settled; a newly observed death gets one continuous fall. */
  fallProgress(id: string, down: boolean, simulationTime: number): number {
    const time = Number.isFinite(simulationTime) ? Math.max(0, simulationTime) : 0;
    const previous = this.falls.get(id);
    if (!previous || time < previous.time) {
      this.falls.set(id, { time, down });
      return down ? 1 : 0;
    }
    const started = down ? previous.down ? previous.started : time : undefined;
    this.falls.set(id, { time, down, started });
    return !down ? 0 : started === undefined ? 1 : Math.max(0, Math.min(1, (time - started) / CHARACTER_FALL_SECONDS));
  }

  remove(id: string): void { this.samples.delete(id); this.falls.delete(id); }
  clear(): void { this.samples.clear(); this.falls.clear(); }
}
