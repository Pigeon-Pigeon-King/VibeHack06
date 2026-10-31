/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AnimationMixer, BoxGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { SCENARIO_IDS } from '../src/contracts';
import { buildEnvironment } from '../src/presentation/environment';
import { bindArchitecture } from '../src/presentation/architecture-bindings';
import { GeneratedArchitecture } from '../src/presentation/GeneratedArchitecture';
import { PortKit, readPortKitPrimitives, readPortKitSemantics } from '../src/presentation/port-kit';
import { measuredBoxModules } from '../src/presentation/architecture-auto-bindings';
import { SOURCE_PROFILES } from '../src/presentation/architecture-placement-plan';
import { ARCHITECTURE_SOURCES } from '../src/assets/architecture-catalog';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/architecture-solids-0b3b05b.json', import.meta.url), 'utf8'));
const baseURL = new URL('../public/', import.meta.url).href;
const snapshots = (root: Group) => { const out = new Map<InstancedMesh, number[]>(); root.traverse(n => { if (n instanceof InstancedMesh) out.set(n, [...n.instanceMatrix.array]); }); return out; };
const drawn = (root: Group) => { const out: InstancedMesh[] = []; root.traverse(n => { if (n instanceof InstancedMesh && n.userData.generatedArchitecture) out.push(n); }); return out; };
const boundsById = new Map<string, [number[], number[]]>();
function mockSource(id: string) {
  // Use the shipped POSITION bounds, not a self-fulfilling guessed cube. Rendering
  // is mocked; real GLB geometry/material parsing is covered by integration tests.
  const source = ARCHITECTURE_SOURCES.find(r => r.id === id)!;
  const baseId = id.replace(/:lod\d$/, ':lod0');
  if (!boundsById.has(baseId)) {
    const main = ARCHITECTURE_SOURCES.find(r => r.id === baseId)!;
    const bytes = readFileSync(new URL(main.url, baseURL));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION]; boundsById.set(baseId, [accessor.min, accessor.max]);
  }
  const [min, max] = boundsById.get(baseId)!, geometry = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  geometry.translate((max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2);
  const root = new Group(), material = new MeshStandardMaterial(); material.name = 'PBR';
  const mesh = new Mesh(geometry, material); mesh.name = 'module'; root.add(mesh);
  return { root, animations: [], mixer: new AnimationMixer(root), dispose: vi.fn(() => { expect(root.parent).toBeNull(); geometry.dispose(); material.dispose(); }), source };
}

describe('semantic architecture coverage of all authored scenarios', () => {
  for (const scenario of SCENARIO_IDS) it(`${scenario}: preserves the original complete collider list and binds real structural instances without double ownership`, () => {
    const env = buildEnvironment(scenario), before = JSON.stringify(env.solids), plan = bindArchitecture(env.root, scenario);
    expect(env.solids.length).toBe(baseline.scenarios[scenario].count);
    expect(createHash('sha256').update(before).digest('hex')).toBe(baseline.scenarios[scenario].sha256);
    expect(plan.some(g => g.targets.some(t => t.mesh.userData.architectureGround))).toBe(true);
    expect(plan.some(g => g.targets.length)).toBe(true);
    const claimed = new Map<Mesh, Set<number>>();
    for (const group of plan) {
      expect(group.error).toBeUndefined(); expect(group.placements.length).toBeGreaterThan(0);
      const ids = new Set<string>();
      for (const placement of group.placements) { expect(ids.has(placement.id)).toBe(false); ids.add(placement.id); }
      for (const target of group.targets) for (const index of target.indices ?? [-1]) {
        const set = claimed.get(target.mesh) ?? new Set<number>(); expect(set.has(index), `${scenario}/${group.id}/${target.mesh.name}[${index}]`).toBe(false); set.add(index); claimed.set(target.mesh, set);
      }
    }
    const parts = readPortKitPrimitives(env.root);
    for (const semantic of readPortKitSemantics(env.root)) {
      if (!['workshop', 'container', 'cover', 'tank', 'light'].includes(semantic.kind)) continue;
      let delegated = false; for (let p: Group | null = semantic.parent; p; p = p.parent as Group | null) if (p.userData.generatedSlot || p.userData.generatedPropHost) delegated = true;
      if (delegated) continue;
      const physical = parts.filter(p => p.semantic === semantic && p.surface !== 'signal');
      for (const p of physical) expect(claimed.get(p.mesh!)?.has(p.index), `${scenario}/${semantic.kind}/${p.index}`).toBe(true);
    }
    expect(JSON.stringify(env.solids)).toBe(before); env.dispose();
  });

  it('records located transforms and precise membership without claiming a neighbouring prop or information node', () => {
    const k = new PortKit(); k.box('steel', [0, 0, 0], [1, 1, 1]);
    k.located([4, 2.4, -7], .6, () => { k.cover(1, 3, 4, .2); k.light(8, 9, 6); }); k.flush();
    const [cover, light] = readPortKitSemantics(k.root); expect(cover.originMatrix.elements[13]).toBe(2.4);
    expect(cover.members.flatMap(m => m.mesh.name === 'static-box-steel-true' ? m.indices : [])).not.toContain(0);
    const plan = bindArchitecture(k.root, 'workers');
    const signal = readPortKitPrimitives(k.root).find(p => p.semantic === light && p.surface === 'signal')!;
    expect(plan.flatMap(g => g.targets).some(t => t.mesh === signal.mesh && t.indices?.includes(signal.index))).toBe(false);
  });

  it('keeps generated roof modules attached to the actual collapsing section parent', async () => {
    const env = buildEnvironment('mainhall');
    const owner = new GeneratedArchitecture({ acquire: async source => mockSource(source.id) }, { parent: env.root, scenario: 'mainhall', baseURL });
    expect((await owner.ready).filter(s => s.state !== 'ready')).toEqual([]);
    const section = env.root.getObjectByName('history-roof-section-0')!;
    const before = section.getWorldPosition(new Vector3()); section.position.y -= 2; section.rotation.z = .2;
    const underSection = drawn(env.root).filter(m => { for (let n = m.parent; n; n = n.parent) if (n === section) return true; return false; });
    expect(underSection.length).toBeGreaterThan(0); expect(section.getWorldPosition(new Vector3()).y).toBeCloseTo(before.y - 2);
    expect(owner.coverage().plan.uncovered.some((g: { kind: string }) => g.kind === 'unsupported-fit')).toBe(false);
    owner.dispose(); env.dispose();
  });

  it('all 15 scenes complete the generated swap against shipped model dimensions; far LOD never restores old instances', async () => {
    for (const scenario of SCENARIO_IDS) {
      const env = buildEnvironment(scenario), plan = bindArchitecture(env.root, scenario), original = snapshots(env.root), leases: ReturnType<typeof mockSource>[] = [];
      const owner = new GeneratedArchitecture({ acquire: async source => { const lease = mockSource(source.id); leases.push(lease); return lease; } }, { parent: env.root, scenario, baseURL });
      expect((await owner.ready).filter(s => s.state !== 'ready'), scenario).toEqual([]);
      owner.update(new Vector3(100000, 0, 100000));
      for (const target of plan.flatMap(g => g.targets)) {
        if (target.indices) for (const i of target.indices) { const matrix = new Matrix4(); (target.mesh as InstancedMesh).getMatrixAt(i, matrix); expect(matrix.determinant()).toBe(0); }
        else expect(target.mesh.visible).toBe(false);
      }
      expect(drawn(env.root).filter(m => m.visible).every(m => m.userData.generatedArchitecture.sourceId.endsWith(':lod2'))).toBe(true);
      owner.dispose(); for (const [mesh, values] of original) expect([...mesh.instanceMatrix.array]).toEqual(values);
      for (const lease of leases) expect(lease.dispose).toHaveBeenCalledTimes(1); env.dispose();
    }
  }, 60000);

  it('assembles arched roof skins from produced panels while keeping unmatched greenhouse glass explicit', () => {
    const env = buildEnvironment('workers'), plan = bindArchitecture(env.root, 'workers');
    const primitives = readPortKitPrimitives(env.root), arches = primitives.filter(p => p.kind === 'arch');
    for (const arch of arches) { if (arch.parent.userData.generatedPropHost) continue; expect(plan.some(g => g.targets.some(t => t.mesh === arch.mesh && t.indices?.includes(arch.index)))).toBe(true); }
    expect(env.root.userData.architectureCoveragePlan.uncovered.some((g: { entity: string }) => g.entity === 'yard-greenhouse')).toBe(true); env.dispose();
  });

  it('reuses bounded roof panels above the original inner arch clearance and inside its overall envelope', () => {
    const kit = new PortKit(); kit.part('arch', 'pale', [0, 4, 0], [37, 7.5, 41]); kit.flush();
    const placements = bindArchitecture(kit.root, 'medical').flatMap(g => g.placements);
    expect(placements.length).toBeLessThan(600);
    for (const p of placements) {
      const q = new Quaternion().setFromEuler(new Euler(p.pitch ?? 0, p.yaw, p.roll ?? 0));
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        const point = new Vector3(x * p.size[0], y * p.size[1], z * p.size[2]).applyQuaternion(q).add(new Vector3(...p.position));
        expect(Math.abs(point.x)).toBeLessThanOrEqual(18.5 + 1e-5);
        expect(point.y).toBeGreaterThanOrEqual(4 - 1e-5); expect(point.y).toBeLessThanOrEqual(7.75 + 1e-5);
        expect(Math.abs(point.z)).toBeLessThanOrEqual(20.5 + 1e-5);
        expect((point.x / (37 * .46)) ** 2 + ((point.y - 4) / (7.5 * .46)) ** 2).toBeGreaterThanOrEqual(1 - 1e-5);
      }
    }
  });

  it('leaves portable ice sample tubes for the prop owner instead of converting them to structural pipes', () => {
    const env = buildEnvironment('nightshift'), groups = bindArchitecture(env.root, 'nightshift');
    const tubes = readPortKitPrimitives(env.root).filter(p => p.kind === 'cylinder' && p.surface === 'ice');
    expect(tubes).toHaveLength(4);
    for (const tube of tubes) expect(groups.some(g => g.targets.some(t => t.mesh === tube.mesh && t.indices?.includes(tube.index)))).toBe(false);
    env.dispose();
  });

  it('bounded tiling rejects impossible invalid sizes without relaxing asset aspect constraints', () => {
    const root = new Group();
    expect(() => measuredBoxModules('bad', 'ARCH-FLOOR-METAL', [1, 0, 1], new Matrix4(), root)).toThrow();
    const p = measuredBoxModules('wall', 'ARCH-WALL-PAINT', [24, 5.2, .3], new Matrix4(), root), raw = SOURCE_PROFILES['ARCH-WALL-PAINT'];
    for (const cell of p) { const scales = cell.size.map((n, i) => n / raw.size[i]); expect(Math.max(...scales) / Math.min(...scales)).toBeLessThanOrEqual(raw.limit); }
  });
});
