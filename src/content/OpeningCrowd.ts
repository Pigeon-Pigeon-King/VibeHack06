import type { SolidSpec, Vec3 } from '../contracts';
import { Navigation } from '../actors/Navigation';
import { HISTORY as H } from './history-layout';
import { OPENING_TIMELINE, openingCrowdHitTime } from './opening-timeline';

const T = OPENING_TIMELINE.mainhall;
const STEP = 1 / 60, SEPARATION = 0.66, RADIUS = 0.31;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const length = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export interface OpeningCrowdSample {
  position: Vec3;
  yaw: number;
  /** Authoritative travelled metres, including limited shuffles after arrival. */
  distance: number;
  speed: number;
}
type Frame = { positions: Vec3[]; yaw: number[]; distance: number[] };
type Obstacle = { x: number; z: number; hx: number; hz: number; cos: number; sin: number };

/** Irregular, staggered shoulder spaces fan out behind the four-person throat.
 * Nobody crosses the west threshold: the closed lower partition and the front
 * rank leave the late arrivals stranded on the hall side of the doorway. */
function jamSlots(): Vec3[] {
  // Arrival bands only assign who can reach the front first. These unequal
  // shoulder spaces have neither straight ranks nor shared column coordinates.
  return [
    [-21.20, 4.90], [-21.05, 5.68], [-21.14, 6.50], [-20.96, 7.27],
    [-20.22, 4.29], [-20.43, 5.08], [-20.35, 6.02], [-20.35, 6.85], [-20.13, 7.84],
    [-19.27, 3.78], [-19.46, 4.69], [-19.57, 5.49], [-19.50, 6.37], [-19.42, 7.28], [-19.27, 8.37],
    [-18.42, 4.12], [-18.70, 5.01], [-18.60, 5.88], [-18.50, 6.79], [-18.68, 7.73], [-18.43, 8.50],
    [-17.59, 3.63], [-17.80, 4.55], [-17.74, 5.43], [-17.69, 6.39], [-17.77, 7.31], [-17.60, 8.24],
    [-16.93, 4.19], [-16.76, 5.18], [-16.95, 6.03], [-16.82, 7.02], [-16.76, 7.95],
  ].map(([x, z]) => [x, 0, z] as Vec3);
}

const references = new WeakMap<readonly SolidSpec[], OpeningCrowdPlan>();
const recent = new Map<string, OpeningCrowdPlan>();
/** Reconstructed environments with the same solids share the same immutable
 * trajectory. Retain two shapes at most; reference keys do not keep worlds alive. */
export function openingCrowdPlan(solids: readonly SolidSpec[]): OpeningCrowdPlan {
  const existing = references.get(solids); if (existing) return existing;
  const key = JSON.stringify(solids.map(solid => [solid.position, solid.size, solid.rotationY ?? 0, solid.openFact ?? '']));
  let plan = recent.get(key);
  if (!plan) {
    plan = new OpeningCrowdPlan(solids); recent.set(key, plan);
    if (recent.size > 2) recent.delete(recent.keys().next().value!);
  }
  references.set(solids, plan); return plan;
}

/** Fixed, saved-time choreography, baked once from this level's actual solids.
 * This is deliberately local to S02, not another runtime AI/physics system. */
export class OpeningCrowdPlan {
  readonly targets: readonly Vec3[];
  private readonly frames: Frame[] = [];

  constructor(solids: readonly SolidSpec[]) {
    // The evacuation door has already opened. Include fallen defenders and the
    // father's occupied cover position as staging clearances, not new colliders.
    const blockers: SolidSpec[] = [
      { id: 'staged-fallen-defender', position: [-15.25, 0.55, 8], size: [2.35, 1.1, 0.9] },
      { id: 'staged-father-cover', position: H.fatherFall, size: [1.25, 2, 1.25] },
    ];
    const active = [...solids.filter(solid => !solid.openFact), ...blockers];
    const obstacles: Obstacle[] = active.filter(solid => solid.position[1] + solid.size[1] / 2 > 0.28
      && solid.position[1] - solid.size[1] / 2 < 1.8).map(solid => ({
      x: solid.position[0], z: solid.position[2], hx: solid.size[0] / 2 + RADIUS, hz: solid.size[2] / 2 + RADIUS,
      cos: Math.cos(solid.rotationY ?? 0), sin: Math.sin(solid.rotationY ?? 0),
    }));
    const freeSegment = (a: Vec3, b: Vec3): boolean => {
      const steps = Math.ceil(length(a, b) / 0.12);
      for (let step = 0; step <= steps; step++) {
        const u = step / Math.max(1, steps), x = lerp(a[0], b[0], u), z = lerp(a[2], b[2], u);
        if (obstacles.some(o => Math.abs((x - o.x) * o.cos - (z - o.z) * o.sin) < o.hx
          && Math.abs((x - o.x) * o.sin + (z - o.z) * o.cos) < o.hz)) return false;
      }
      return true;
    };
    const projectObstacles = (point: Vec3): void => {
      for (const o of obstacles) {
        let x = (point[0] - o.x) * o.cos - (point[2] - o.z) * o.sin;
        let z = (point[0] - o.x) * o.sin + (point[2] - o.z) * o.cos;
        if (Math.abs(x) >= o.hx || Math.abs(z) >= o.hz) continue;
        if (o.hx - Math.abs(x) < o.hz - Math.abs(z)) x = Math.sign(x || 1) * (o.hx + 0.001);
        else z = Math.sign(z || 1) * (o.hz + 0.001);
        point[0] = o.x + x * o.cos + z * o.sin; point[2] = o.z - x * o.sin + z * o.cos;
      }
    };
    const slots = jamSlots(), order = H.crowd.map((_, i) => i).sort((a, b) =>
      length(H.crowd[a], [-22, 0, 6]) - length(H.crowd[b], [-22, 0, 6]));
    const targets: Vec3[] = H.crowd.map(() => [0, 0, 0]);
    let first = 0;
    for (const count of [4, 5, 6, 6, 6, 5]) {
      const rank = order.slice(first, first + count).sort((a, b) => H.crowd[a][2] - H.crowd[b][2]);
      rank.forEach((index, column) => { targets[index] = slots[first + column]; }); first += count;
    }
    this.targets = targets;
    const nav = new Navigation(active, H.bounds, 0.48);
    const routes = H.crowd.map((start, index) => {
      const target = targets[index], path = [...nav.path(start, target), target];
      const route: Vec3[] = [start];
      for (let from = 0; from < path.length;) {
        let next = path.length - 1;
        while (next > from && !freeSegment(route[route.length - 1], path[next])) next--;
        route.push(path[next]); from = next + 1;
      }
      return route;
    });
    const routeLengths = routes.map(route => route.slice(1).reduce((sum, point, i) => sum + length(point, route[i]), 0));
    const departures = H.crowd.map((_, i) => 0.12 + H.crowdReactionDelay[i] * 2 + (i % 3) * 0.07);
    const speeds = routeLengths.map((distance, i) => Math.min(4.85, distance / (7.2 + order.indexOf(i) * 0.145 - departures[i])));
    const positions = H.crowd.map(point => [...point] as Vec3), nextWaypoint = positions.map(() => 1);
    const distance = positions.map(() => 0), yaw = [...H.crowdFacing], arrivals = positions.map(() => Infinity);
    const copy = (): Frame => ({ positions: positions.map(point => [...point] as Vec3), yaw: [...yaw], distance: [...distance] });
    this.frames.push(copy());
    for (let frame = 1; frame <= Math.ceil(T.massacreEnd / STEP) + 1; frame++) {
      const time = frame * STEP, previous = positions.map(point => [...point] as Vec3);
      const fixed = positions.map((_, i) => time < departures[i] || time >= openingCrowdHitTime(i));
      positions.forEach((point, i) => {
        if (fixed[i]) return;
        const route = routes[i];
        while (nextWaypoint[i] < route.length - 1 && length(point, route[nextWaypoint[i]]) < 0.18) nextWaypoint[i]++;
        let target = route[nextWaypoint[i]];
        if (nextWaypoint[i] === route.length - 1 && length(point, target) < 0.18) arrivals[i] = Math.min(arrivals[i], time);
        if (Number.isFinite(arrivals[i])) {
          // Two finite, staggered attempts to press forward/find a lateral gap.
          // Return to the same place; no loop drags a blocked person forever.
          const age = time - arrivals[i] - 0.35 - (i % 5) * 0.11;
          const pulse = (start: number) => { const u = (age - start) / 1.15; return u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0; };
          const push = pulse(0) + pulse(2.7);
          target = [targets[i][0] - 0.11 * push, 0, targets[i][2] + (i % 2 ? 1 : -1) * 0.14 * push];
        }
        const gap = length(point, target);
        const speed = Number.isFinite(arrivals[i]) ? 0.52 : speeds[i] * clamp((time - departures[i]) / 0.35);
        const step = Math.min(gap, speed * STEP);
        if (gap > 1e-6) { point[0] += (target[0] - point[0]) / gap * step; point[2] += (target[2] - point[2]) / gap * step; }
        projectObstacles(point);
      });
      // Keep each living capsule outside the others, including those already
      // struck. Corrections are deterministic and baked, never applied on load.
      for (let pass = 0; pass < 12; pass++) {
        let overlap = false;
        for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i], b = positions[j], gap = length(a, b);
          if (gap >= SEPARATION || fixed[i] && fixed[j]) continue;
          overlap = true;
          const dx = (b[0] - a[0]) / Math.max(gap, 1e-6), dz = (b[2] - a[2]) / Math.max(gap, 1e-6);
          const shift = (SEPARATION - gap + 0.00001) / (fixed[i] || fixed[j] ? 1 : 2);
          if (!fixed[i]) { a[0] -= dx * shift; a[2] -= dz * shift; projectObstacles(a); }
          if (!fixed[j]) { b[0] += dx * shift; b[2] += dz * shift; projectObstacles(b); }
        }
        if (!overlap) break;
      }
      positions.forEach((point, i) => {
        const travelled = length(previous[i], point); distance[i] += travelled;
        if (fixed[i]) return;
        const glanceAge = time - T.breach - 0.15 - (i % 5) * 0.18;
        const glance = Number.isFinite(arrivals[i]) && glanceAge > 0 && glanceAge < 1.8 ? Math.sin(Math.PI * glanceAge / 1.8) ** 2 : 0;
        const heading = Number.isFinite(arrivals[i]) ? -Math.PI / 2 + (i % 2 ? 1 : -1) * glance * 1.0
          : travelled > 0.0002 ? Math.atan2(point[0] - previous[i][0], point[2] - previous[i][2]) : yaw[i];
        const delta = Math.atan2(Math.sin(heading - yaw[i]), Math.cos(heading - yaw[i]));
        yaw[i] += Math.max(-3.2 * STEP, Math.min(3.2 * STEP, delta));
      });
      this.frames.push(copy());
    }
  }

  sample(index: number, time: number): OpeningCrowdSample {
    const t = Math.max(0, Math.min(Number.isFinite(time) ? time : 0, openingCrowdHitTime(index)));
    const frame = Math.min(this.frames.length - 2, Math.floor(t / STEP)), u = t / STEP - frame;
    const a = this.frames[frame], b = this.frames[frame + 1], point = a.positions[index], next = b.positions[index];
    const delta = Math.atan2(Math.sin(b.yaw[index] - a.yaw[index]), Math.cos(b.yaw[index] - a.yaw[index]));
    return { position: [lerp(point[0], next[0], u), 0, lerp(point[2], next[2], u)],
      yaw: a.yaw[index] + delta * u, distance: lerp(a.distance[index], b.distance[index], u),
      speed: time >= openingCrowdHitTime(index) ? 0 : length(point, next) / STEP };
  }
}
