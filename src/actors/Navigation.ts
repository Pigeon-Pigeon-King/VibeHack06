import type { SolidSpec, Vec3 } from '../contracts';

/** Small authored arenas use a clearance-expanded grid; physics remains authoritative. */
export class Navigation {
  private blocked = new Set<string>();
  private key(x: number, z: number): string { return `${x},${z}`; }
  constructor(solids: SolidSpec[]) {
    for (const s of solids) {
      if (s.position[1] + s.size[1] / 2 < 0.35 || s.position[1] - s.size[1] / 2 > 1.8) continue;
      const a = s.rotationY ?? 0;
      const hx = Math.abs(Math.cos(a)) * s.size[0] / 2 + Math.abs(Math.sin(a)) * s.size[2] / 2 + 0.42;
      const hz = Math.abs(Math.sin(a)) * s.size[0] / 2 + Math.abs(Math.cos(a)) * s.size[2] / 2 + 0.42;
      for (let x = Math.ceil(s.position[0] - hx); x <= Math.floor(s.position[0] + hx); x++) {
        for (let z = Math.ceil(s.position[2] - hz); z <= Math.floor(s.position[2] + hz); z++) this.blocked.add(this.key(x, z));
      }
    }
  }
  private free(x: number, z: number): boolean {
    return x > -29 && x < 29 && z > -40 && z < 33 && !this.blocked.has(this.key(x, z));
  }
  private nearest(p: Vec3): [number, number] {
    const x = Math.round(p[0]), z = Math.round(p[2]);
    for (let r = 0; r < 8; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (this.free(x + dx, z + dz)) return [x + dx, z + dz];
      }
    }
    return [x, z];
  }
  path(from: Vec3, to: Vec3): Vec3[] {
    const [sx, sz] = this.nearest(from), [tx, tz] = this.nearest(to);
    const start = this.key(sx, sz), goal = this.key(tx, tz);
    const open: Array<{ x: number; z: number; g: number; f: number }> = [{ x: sx, z: sz, g: 0, f: 0 }];
    const costs = new Map([[start, 0]]), parent = new Map<string, string>();
    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift()!, key = this.key(cur.x, cur.z);
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
