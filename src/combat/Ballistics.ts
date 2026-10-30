import type { Vec3 } from '../contracts';
import type { TraceHit } from '../runtime/Physics';
import { GRAVITY } from '../runtime/Physics';

export interface Projectile {
  id: number; owner: string; position: Vec3; previous: Vec3; velocity: Vec3;
  age: number; damage: number; tracer: boolean;
}
export interface ShotImpact { projectile: Projectile; hit: TraceHit }
export class Ballistics {
  projectiles: Projectile[] = [];
  fired = 0;
  private serial = 0;
  constructor(private trace: (from: Vec3, to: Vec3, exclude: string) => TraceHit | null) {}
  fire(owner: string, position: Vec3, direction: Vec3, damage: number, speed = 420): Projectile {
    const length = Math.hypot(...direction) || 1;
    const bullet: Projectile = { id: ++this.serial, owner, position: [...position], previous: [...position],
      velocity: direction.map(v => v / length * speed) as Vec3, age: 0, damage, tracer: this.serial % 3 === 0 };
    this.projectiles.push(bullet); this.fired++;
    // No query and no damage occurs until simulation advances.
    return bullet;
  }
  update(dt: number): ShotImpact[] {
    const hits: ShotImpact[] = [], alive: Projectile[] = [];
    for (const p of this.projectiles) {
      p.previous = [...p.position];
      const drag = Math.exp(-0.025 * dt);
      p.velocity[0] *= drag; p.velocity[2] *= drag;
      p.velocity[1] = p.velocity[1] * drag - GRAVITY * dt;
      const next = p.position.map((v, i) => v + p.velocity[i] * dt) as Vec3;
      const hit = this.trace(p.position, next, p.owner);
      p.age += dt;
      if (hit) { p.position = hit.point; hits.push({ projectile: p, hit }); }
      else if (p.age < 2.5 && next[1] > -20) { p.position = next; alive.push(p); }
    }
    this.projectiles = alive;
    return hits;
  }
  clear(): void { this.projectiles = []; }
}
