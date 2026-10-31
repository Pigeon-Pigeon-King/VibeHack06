import type { Vec3 } from '../contracts';
import type { Physics } from '../runtime/Physics';
import type { Navigation } from './Navigation';

export const COMBAT_PHASES = ['seek', 'hide', 'peek', 'recover', 'shift', 'hold', 'return'] as const;
export type CombatPhase = typeof COMBAT_PHASES[number];
export interface CoverSlot { solid: string; hide: Vec3; peek: Vec3 }
/** Mission goals are never stored here. This state can be saved mid-peek. */
export interface CombatState {
  anchor: Vec3; phase: CombatPhase; targetId: string; lastSeen: Vec3; seenAt: number;
  until: number; nextThink: number; cycles: number; cover: CoverSlot | null;
  destination: Vec3 | null; path: Vec3[]; crouched: boolean; moving: boolean;
  stuck: number; lastPosition: Vec3;
}
export interface TacticalActor { id: string; position: Vec3; combat?: CombatState }
export interface Threat { id: string; point: Vec3 }
export interface TacticalContext {
  physics: Physics; navigation: Navigation; actors: readonly TacticalActor[];
  now: number; dt: number; leash: number; speed: number;
  openingFireWindow?: number;
}
export interface TacticalMove { vx: number; vz: number; canFire: boolean }
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const eye = (p: Vec3, height: number): Vec3 => [p[0], p[1] + height - 0.14, p[2]];
export const COVER_HEIGHT = 1.18;
const phaseOffset = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % 100 / 100;

/** Local, bounded cover decisions. Rapier remains authoritative for every move and shot. */
export class CombatTactics {
  private clearLine(c: TacticalContext, from: Vec3, to: Vec3): boolean {
    return !c.physics.trace(from, to, '', true);
  }

  private passage(c: TacticalContext, from: Vec3, to: Vec3): boolean {
    const steps = Math.max(1, Math.ceil(dist(from, to) * 4));
    for (let i = 1; i <= steps; i++) {
      const p: Vec3 = [from[0] + (to[0] - from[0]) * i / steps, from[1], from[2] + (to[2] - from[2]) * i / steps];
      if (!c.navigation.isOpen(p) || !c.physics.canOccupy(p)) return false;
    }
    return true;
  }

  private path(c: TacticalContext, from: Vec3, to: Vec3): Vec3[] | null {
    if (dist(from, to) < 0.003) return [];
    if (dist(from, to) < 3 && this.passage(c, from, to)) return [[...to]];
    const path = c.navigation.path(from, to).map(p => [p[0], from[1], p[2]] as Vec3);
    if (!path.length || dist(path[path.length - 1], to) > 0.8) return null;
    path.push([...to]);
    // Do not turn a local cover choice into a tour around a whole building.
    let length = 0, previous = from;
    for (const p of path) { length += dist(previous, p); previous = p; }
    if (length > 18) return null;
    previous = from;
    for (const p of path) { if (!this.passage(c, previous, p)) return null; previous = p; }
    return path;
  }

  private reserved(c: TacticalContext, actor: TacticalActor, point: Vec3): boolean {
    return c.actors.some(other => other.id !== actor.id && Math.abs(other.position[1] - point[1]) < 1.5
      && (dist(other.position, point) < 0.8 || other.combat?.cover
        && (dist(other.combat.cover.hide, point) < 1.25 || dist(other.combat.cover.peek, point) < 0.75)));
  }

  private findCover(a: TacticalActor, c: TacticalContext, relocate: boolean): { slot: CoverSlot; path: Vec3[] } | null {
    const s = a.combat!, target = s.lastSeen;
    const candidates: Vec3[] = [];
    const radius = Math.min(14, c.leash);
    for (let x = Math.ceil(a.position[0] - radius); x <= Math.floor(a.position[0] + radius); x++) {
      for (let z = Math.ceil(a.position[2] - radius); z <= Math.floor(a.position[2] + radius); z++) {
        const p: Vec3 = [x, a.position[1], z];
        if (dist(p, a.position) <= radius && dist(p, s.anchor) <= c.leash && c.navigation.isOpen(p)
          && (!relocate || !s.cover || dist(p, s.cover.hide) > 2) && !this.reserved(c, a, p)) candidates.push(p);
      }
    }
    candidates.sort((p, q) => dist(p, a.position) - dist(q, a.position));
    // Cheap visibility rejection precedes shape/path queries. One search per actor per 1.5+ seconds.
    for (const hide of candidates) {
      const shield = c.physics.trace(eye(hide, COVER_HEIGHT + 0.12), target, '', true);
      if (!shield || shield.distance > 2.6 || !c.physics.trace(eye(hide, 0.75), target, '', true)
        || !c.physics.canOccupy(hide)) continue;
      const options: Vec3[] = [[...hide]];
      for (const step of [1, 2]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        options.push([hide[0] + dx * step, hide[1], hide[2] + dz * step]);
      }
      for (const peek of options) {
        if (dist(peek, s.anchor) > c.leash || this.reserved(c, a, peek)
          || !this.clearLine(c, eye(peek, 1.52), target) || !c.physics.canOccupy(peek)
          || !this.passage(c, hide, peek)) continue;
        const path = this.path(c, a.position, hide);
        if (path) return { slot: { solid: shield.id, hide, peek }, path };
      }
    }
    return null;
  }

  private moveTo(a: TacticalActor, c: TacticalContext, destination: Vec3, phase: CombatPhase): boolean {
    const path = this.path(c, a.position, destination);
    if (!path) return false;
    Object.assign(a.combat!, { phase, destination: [...destination], path, stuck: 0, until: c.now + 10 });
    return true;
  }

  private choose(a: TacticalActor, c: TacticalContext, relocate: boolean): void {
    const s = a.combat!;
    s.nextThink = c.now + 1.5 + phaseOffset(a.id);
    const found = this.findCover(a, c, relocate);
    if (found) {
      Object.assign(s, { cover: found.slot, phase: 'seek', destination: [...found.slot.hide], path: found.path, stuck: 0, until: c.now + 10 });
      return;
    }
    if (relocate && s.cover) { s.phase = 'hide'; s.until = c.now + 0.9; return; }
    s.cover = null;
    // No imaginary cover: use a short, reachable lateral bound, then a firing pause.
    const dx = s.lastSeen[0] - s.anchor[0], dz = s.lastSeen[2] - s.anchor[2], length = Math.max(1, Math.hypot(dx, dz));
    const side = (s.cycles++ + Math.round(phaseOffset(a.id) * 100)) % 2 ? 1 : -1;
    for (const sign of [side, -side]) {
      const step = Math.min(2.5, c.leash);
      const p: Vec3 = [s.anchor[0] + dz / length * step * sign, a.position[1], s.anchor[2] - dx / length * step * sign];
      if (dist(p, a.position) > 0.3 && this.passage(c, a.position, p) && this.moveTo(a, c, p, 'shift')) return;
    }
    s.phase = 'hold'; s.destination = null; s.path = []; s.until = c.now + 1.8;
  }

  update(a: TacticalActor, visible: Threat | undefined, targetAlive: boolean, c: TacticalContext): TacticalMove {
    const s = a.combat ??= { anchor: [...a.position], phase: 'hold', targetId: '', lastSeen: [...a.position], seenAt: 0,
      until: c.now + (c.openingFireWindow ?? 0), nextThink: 0, cycles: 0, cover: null, destination: null, path: [], crouched: false,
      moving: false, stuck: 0, lastPosition: [...a.position] };
    if (visible) { s.targetId = visible.id; s.lastSeen = [...visible.point]; s.seenAt = c.now; }
    const engaged = c.leash > 0 && !!s.targetId && (visible || targetAlive && c.now - s.seenAt < 7);
    s.moving = false;
    if (!engaged) {
      s.targetId = ''; s.cover = null;
      // A transient loss must not leave a cover-less peek/seek state that can never exit.
      if (s.phase !== 'return') { s.phase = 'hold'; s.path = []; s.destination = null; }
      if (dist(a.position, s.anchor) > 0.004 && s.phase !== 'return' && c.now >= s.nextThink) {
        this.moveTo(a, c, s.anchor, 'return'); s.nextThink = c.now + 2;
      } else if (dist(a.position, s.anchor) <= 0.004) { s.phase = 'hold'; s.path = []; s.destination = null; }
    } else if ((s.phase === 'hold' && c.now >= s.until || s.phase === 'return') && c.now >= s.nextThink) {
      this.choose(a, c, false);
    }

    // An opened door / changed threat can remove the protection. Re-evaluate without firing through it.
    if (engaged && s.cover && c.now >= s.nextThink) {
      if (!c.physics.trace(eye(s.cover.hide, COVER_HEIGHT + 0.12), s.lastSeen, '', true)
        || !this.clearLine(c, eye(s.cover.peek, 1.52), s.lastSeen)) {
        s.cover = null; this.choose(a, c, false);
      } else s.nextThink = c.now + 1.5 + phaseOffset(a.id);
    }
    if (engaged && s.cover) {
      if ((s.phase === 'seek' || s.phase === 'recover') && dist(a.position, s.cover.hide) < 0.12) {
        if (s.phase === 'recover' && s.cycles >= 2) { s.cycles = 0; this.choose(a, c, true); }
        else { s.phase = 'hide'; s.path = []; s.destination = null; s.until = c.now + 0.7 + phaseOffset(a.id) * 0.5; }
      } else if (s.phase === 'hide' && c.now >= s.until) {
        this.moveTo(a, c, s.cover.peek, 'peek'); s.until = c.now + 3.5;
      } else if (s.phase === 'peek' && c.now >= s.until) {
        s.cycles++;
        this.moveTo(a, c, s.cover.hide, 'recover');
      }
    }
    if (s.phase === 'shift' && s.destination && dist(a.position, s.destination) < 0.12) {
      s.phase = 'hold'; s.path = []; s.destination = null; s.until = c.now + 1.8 + phaseOffset(a.id);
    }
    s.crouched = !!s.cover && (s.phase === 'hide' || s.phase === 'recover' || s.phase === 'seek' && dist(a.position, s.cover.hide) < 1.5);
    c.physics.setHeight(a.id, s.crouched ? COVER_HEIGHT : 1.8);
    // Standing can fail below geometry; the muzzle must use the actual collider height.
    s.crouched = c.physics.bodies.get(a.id)!.height < 1.5;
    while (s.path.length && dist(a.position, s.path[0]) < (s.phase === 'return' ? 0.004 : 0.1)) s.path.shift();
    let vx = 0, vz = 0;
    const next = s.path[0];
    if (next) {
      const distance = dist(a.position, next), speed = Math.min(c.speed, distance / c.dt);
      vx = (next[0] - a.position[0]) / distance * speed; vz = (next[2] - a.position[2]) / distance * speed;
      s.moving = true;
      s.stuck = dist(a.position, s.lastPosition) < c.dt * 0.1 ? s.stuck + c.dt : 0;
      if (s.stuck > 1.2 || c.now > s.until && s.phase !== 'peek') {
        s.cover = null; s.path = []; s.phase = 'hold'; s.until = c.now + 0.4; s.nextThink = s.until;
        s.moving = false; vx = vz = 0;
      }
    }
    s.lastPosition = [...a.position];
    return { vx, vz, canFire: !!visible && !s.crouched && !s.moving && (s.phase === 'peek' || s.phase === 'hold') };
  }
}
