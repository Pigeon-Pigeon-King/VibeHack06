import type { SolidSpec, Vec3 } from '../contracts';

export interface NavBounds { minX: number; maxX: number; minZ: number; maxZ: number }
type SearchNode = { x: number; z: number; g: number; f: number };
class OpenSet {
  private nodes: SearchNode[] = [];
  get size(): number { return this.nodes.length; }
  push(node: SearchNode): void {
    const a = this.nodes; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= node.f) break;
      a[i] = a[parent]; i = parent;
    }
    a[i] = node;
  }
  pop(): SearchNode {
    const a = this.nodes, first = a[0], tail = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].f < a[child].f) child++;
        if (a[child].f >= tail.f) break;
        a[i] = a[child]; i = child;
      }
      a[i] = tail;
    }
    return first;
  }
}

/** Small authored arenas use a clearance-expanded grid; physics remains authoritative. */
export class Navigation {
  private blocked = new Set<string>();
  private key(x: number, z: number): string { return `${x},${z}`; }
  constructor(solids: SolidSpec[], private readonly bounds: NavBounds = { minX: -29, maxX: 29, minZ: -40, maxZ: 33 }, clearance = 0.42) {
    for (const s of solids) {
      if (s.position[1] + s.size[1] / 2 < 0.35 || s.position[1] - s.size[1] / 2 > 1.8) continue;
      const a = s.rotationY ?? 0;
      const hx = Math.abs(Math.cos(a)) * s.size[0] / 2 + Math.abs(Math.sin(a)) * s.size[2] / 2 + clearance;
      const hz = Math.abs(Math.sin(a)) * s.size[0] / 2 + Math.abs(Math.cos(a)) * s.size[2] / 2 + clearance;
      for (let x = Math.ceil(s.position[0] - hx); x <= Math.floor(s.position[0] + hx); x++) {
        for (let z = Math.ceil(s.position[2] - hz); z <= Math.floor(s.position[2] + hz); z++) this.blocked.add(this.key(x, z));
      }
    }
  }
  private free(x: number, z: number): boolean {
    return x > this.bounds.minX && x < this.bounds.maxX && z > this.bounds.minZ && z < this.bounds.maxZ && !this.blocked.has(this.key(x, z));
  }
  /** Unlike path(), this never silently snaps a tactical slot across a wall. */
  isOpen(point: Vec3): boolean { return this.free(Math.round(point[0]), Math.round(point[2])); }
  private nearest(p: Vec3): [number, number] | undefined {
    const x = Math.round(p[0]), z = Math.round(p[2]);
    for (let r = 0; r < 8; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (this.free(x + dx, z + dz)) return [x + dx, z + dz];
      }
    }
    return undefined;
  }
  path(from: Vec3, to: Vec3): Vec3[] {
    const startPoint = this.nearest(from), endPoint = this.nearest(to);
    if (!startPoint || !endPoint) return [];
    const [sx, sz] = startPoint, [tx, tz] = endPoint;
    const start = this.key(sx, sz), goal = this.key(tx, tz);
    const open = new OpenSet(); open.push({ x: sx, z: sz, g: 0, f: 0 });
    const costs = new Map([[start, 0]]), parent = new Map<string, string>();
    while (open.size) {
      const cur = open.pop(), key = this.key(cur.x, cur.z);
      if (key === goal) {
        const points: Vec3[] = [];
        let k = goal;
        while (k !== start) { const [x, z] = k.split(',').map(Number); points.push([x, 0, z]); k = parent.get(k)!; }
        return points.reverse();
      }
      if (cur.g > (costs.get(key) ?? Infinity)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = cur.x + dx, z = cur.z + dz;
        if (!this.free(x, z) || (dx && dz && (!this.free(cur.x + dx, cur.z) || !this.free(cur.x, cur.z + dz)))) continue;
        const next = this.key(x, z), g = cur.g + Math.hypot(dx, dz);
        if (g >= (costs.get(next) ?? Infinity)) continue;
        costs.set(next, g); parent.set(next, key);
        open.push({ x, z, g, f: g + Math.hypot(tx - x, tz - z) });
      }
    }
    return [];
  }
}
