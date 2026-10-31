import { Euler, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { ScenarioId } from '../contracts';
import type { ArchitectureAsset, ArchitecturePlacement, ModuleSemantic, V3, VisualTarget } from './ArchitectureTransactions';
import { architectureCatalog, SOURCE_PROFILES, s05Plan, s11Plan, type ProfileId } from './architecture-placement-plan';

export interface BoundArchitectureGroup { id: string; targets: VisualTarget[]; placements: ArchitecturePlacement[]; error?: string; }
const EXTRA = {
  'BG-CRANE': { semantic: 'landmark', size: [0.891862, 1.443899, 1.889592] },
  'BG-SHIP': { semantic: 'landmark', size: [0.794420, 0.550143, 1.891632] },
  'ENV-BRIDGEKIT-DECK': { semantic: 'bridge-deck', size: [0.883221, 0.215912, 1.897539] },
  'ENV-LIGHTKIT-POLE': { semantic: 'landmark', size: [0.867866, 1.896112, 0.356282] },
  'ENV-PIPEKIT-ELBOW': { semantic: 'pipe-elbow', size: [1.044530, 1.843092, 1.891701] },
  'MAP-A-ARCH-01': { semantic: 'arch-shell', size: [1.901770, 1.595701, 0.381619] },
  'MAP-B-CORRIDOR-01': { semantic: 'arch-shell', size: [1.244916, 0.987584, 1.899415] },
  'MAP-E-PIER-01': { semantic: 'pier', size: [1.311136, 1.890110, 1.310689] },
  'MAP-F-ROOF-01': { semantic: 'arch-shell', size: [1.893160, 0.929554, 1.427892] },
  'PROP-BOOTH': { semantic: 'booth', size: [1.895350, 1.652386, 1.862850] },
  'PROP-TANK': { semantic: 'landmark', size: [1.626666, 1.898614, 1.620525] },
} as const;
export function allArchitectureAssets(): ArchitectureAsset[] {
  return [...architectureCatalog(Object.keys(SOURCE_PROFILES) as ProfileId[]), ...Object.entries(EXTRA).map(([id, profile]): ArchitectureAsset => ({
    id, sourceId: `${id}:lod0`, semantic: profile.semantic, materialContract: 'same-node-material-slots', fit: 'uniform',
    basis: { quaternion: [0, 0, 0, 1], description: 'glTF +Y up; source hierarchy retained', evidence: 'Frozen runtime-ready POSITION accessors and identity nodes, 2026-10-31' },
    lods: [{ sourceId: `${id}:lod1`, distance: 24 }, { sourceId: `${id}:lod2`, distance: 70 }], castShadow: false,
  }))];
}
export function uniformPlacement(id: string, assetId: keyof typeof EXTRA | ProfileId, at: V3, axis: 0 | 1 | 2, metres: number, yaw = 0): ArchitecturePlacement {
  const profile = assetId in EXTRA ? EXTRA[assetId as keyof typeof EXTRA] : SOURCE_PROFILES[assetId as ProfileId];
  return { id, assetId, semantic: profile.semantic as ModuleSemantic, position: at, size: profile.size.map(n => n * metres / profile.size[axis]) as [number, number, number], anchor: 'bottom-center', yaw };
}

interface Primitive { mesh: InstancedMesh; index: number; position: Vector3; scale: Vector3; matrix: Matrix4; }
/** Capture only root-level immutable PortKit batches, excluding every actor/prop visual slot. */
function primitives(root: Group): Primitive[] {
  const result: Primitive[] = [], q = new Quaternion();
  for (const mesh of root.children) if (mesh instanceof InstancedMesh && mesh.name.startsWith('static-')) for (let index = 0; index < mesh.count; index++) {
    const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(); mesh.getMatrixAt(index, matrix); matrix.decompose(position, q, scale);
    result.push({ mesh, index, position, scale, matrix });
  }
  return result;
}
function collect(items: Primitive[]): VisualTarget[] {
  const targets = new Map<InstancedMesh, Set<number>>();
  for (const item of items) { const indices = targets.get(item.mesh) ?? new Set(); indices.add(item.index); targets.set(item.mesh, indices); }
  return [...targets].map(([mesh, indices]) => ({ mesh, indices: [...indices] }));
}
function named(root: Group, name: string): VisualTarget[] { const node = root.getObjectByName(name); return node instanceof Mesh ? [{ mesh: node }] : []; }
function near(a: number, b: number): boolean { return Math.abs(a - b) < 0.00015; }
function at(items: Primitive[], type: string, p: V3, size?: V3): Primitive[] {
  return items.filter(item => item.mesh.name.startsWith(`static-${type}-`) && item.position.toArray().every((v, i) => near(v, p[i])) && (!size || item.scale.toArray().every((v, i) => near(v, size[i]))));
}
function volume(items: Primitive[], x: number, z: number, width: number, depth: number, height: number, yaw = 0): Primitive[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return items.filter(item => {
    const dx = item.position.x - x, dz = item.position.z - z;
    return item.mesh.name.startsWith('static-box-') && Math.abs(c * dx - s * dz) <= width / 2 + .001 && Math.abs(s * dx + c * dz) <= depth / 2 + .001 && item.position.y >= -.001 && item.position.y <= height + .001;
  });
}
const coverRuns = [[-17, -49.7, 4.5, 0], [-5, -45.7, 4.6, 0], [10, -51.7, 4.2, 0], [15, -36.7, 4.4, 0], [-8, -31.7, 4.2, 0], [7, -26.6, 3.8, 0], [-8, -20.3, 6.2, 0], [10, -12.3, 5.5, 0], [-8, 9.5, 6, 0], [-5, 22.3, 6.2, 0], [26, -35, 4.2, Math.PI / 2], [26.7, -22, 4, Math.PI / 2], [21.7, -14, 4, Math.PI / 2], [30.7, -5, 4.2, Math.PI / 2], [18.3, -2, 7, Math.PI / 2]];
const workshops = [['repair', -49, 20, 8, 18], ['north-west', -22, -64, 10, 12], ['north-east', 28, -61, 12, 18], ['east-long', 42, -64, 18, 30], ['weigh-booth-building', -21, -13, 10, 12], ['rear-building', 16, 43, 16, 12]] as const;
function s05Targets(root: Group, items: Primitive[], id: string): VisualTarget[] {
  if (id === 'S05-ground') return named(root, 'port-ground');
  if (id === 'S05-boundaries') return collect([...[-54, 54].flatMap(x => at(items, 'box', [x, 1.4, -22], [.8, 2.8, 148])), ...[-96, 52].flatMap(z => at(items, 'box', [0, 1.4, z], [108, 2.8, .8]))]);
  if (id === 'S05-worker-screens') return collect([...at(items, 'box', [-42, 1.7, -38], [24, 3.4, .7]), ...at(items, 'box', [-30, 1.7, -.5], [.7, 3.4, 75])]);
  const workshop = workshops.find(([name]) => id === `S05-workshop-${name}`);
  if (workshop) { const [, x, z, w, d] = workshop; return collect([...at(items, 'box', [x, 2.6, z], [w, 5.2, d]), ...at(items, 'box', [x, 5.27, z], [w + .5, .2, d + .5])]); }
  if (id === 'S05-main-gate-structure') return collect([
    ...[[0, -24, 28], [-8, 46.8, 18]].flatMap(([x, z, w]) => [...[-w / 2, w / 2].flatMap(dx => at(items, 'box', [x + dx, 3.3, z], [.45, 6.6, .7])), ...at(items, 'box', [x, 6.65, z], [w + 1, .6, 1])]),
    ...[-42, -22].flatMap(z => at(items, 'box', [40, 3.6, z], [.65, 7.2, .65])), ...at(items, 'box', [40, 7.15, -32], [.8, .6, 20.6]),
  ]);
  if (id === 'S05-pipelines') return collect([...at(items, 'cylinder', [37, 2.5, 19], [.18, 21, .18]), ...at(items, 'cylinder', [38.1, 2.9, 19], [.14, 21, .14])]);
  if (id === 'S05-ice-silhouette') return collect(Array.from({ length: 11 }, (_, i) => at(items, 'cone', [-101 - i % 3 * 18, 5, 42 - i * 16])).flat());
  if (id === 'S05-far-heat-trio') return collect([0, 1, 2].flatMap(i => { const x = 77 + i * 17, z = 30 - i * 19, h = 12 + i * 4; return [...at(items, 'box', [x, h / 2, z], [14, h, 16]), ...at(items, 'box', [x, h + .3, z], [15, .6, 17]), ...at(items, 'cylinder', [x + 3, h + 3, z], [.75, 6, .75])]; }));
  if (id === 'S05-freight-containers') return collect([[-11, -79], [-4, -79], [3, -79], [29, 26]].flatMap(([x, z]) => volume(items, x, z, 2.9, 6.8, 2.68, Math.PI / 2)));
  if (id === 'S05-cover') return collect(coverRuns.flatMap(([x, z, w, yaw]) => volume(items, x, z, w + .18, 1.05, 1.2, yaw)));
  return [];
}
function s11Targets(root: Group, items: Primitive[], id: string): VisualTarget[] {
  if (id === 'S11-ground') return named(root, 'port-ground');
  if (id === 'S11-ceiling') return collect(at(items, 'box', [-402, 5.8, 56], [37, .4, 41]));
  if (id === 'S11-walls') return collect([
    ...[-424, -380].flatMap(x => at(items, 'box', [x, 1.5, 58], [.5, 3, 52])), ...[32, 84].flatMap(z => at(items, 'box', [-402, 1.5, z], [44, 3, .5])),
    ...[-420, -384].flatMap(x => at(items, 'box', [x, 2.8, 56], [.5, 5.6, 40])), ...at(items, 'box', [-402, 2.8, 36], [36, 5.6, .5]),
    ...[[-411.5, 17], [-388, 8]].flatMap(([x, w]) => at(items, 'box', [x, 2.8, 76], [w, 5.6, .5])), ...at(items, 'box', [-398, 4.7, 76], [10, 1.8, .7]),
  ]);
  return [];
}

const expectedFallbackCount = (id: string): number | undefined => ({
  'S05-ground': 1, 'S05-boundaries': 4, 'S05-worker-screens': 2,
  'S05-main-gate-structure': 9, 'S05-pipelines': 2, 'S05-ice-silhouette': 11,
  'S05-far-heat-trio': 9, 'S05-freight-containers': 180, 'S05-cover': 178,
  'S11-ground': 1, 'S11-walls': 10, 'S11-ceiling': 1,
  'S05-secondary-tank': 23, 'S05-north-lamp': 3, 'S12-receiving-warehouse-roof': 1,
}[id] ?? (id.startsWith('S05-workshop-') ? 2 : undefined));
function validateBindings(groups: BoundArchitectureGroup[]): BoundArchitectureGroup[] {
  for (const group of groups) {
    const expected = expectedFallbackCount(group.id);
    const actual = group.targets.reduce((sum, target) => sum + (target.indices?.length ?? 1), 0);
    if (expected !== undefined && actual !== expected) group.error = `Exact fallback scope changed: ${group.id} expected ${expected}, got ${actual}; original visuals retained`;
  }
  return groups;
}

/** Exact static indices are bound once before any asynchronous load; physics is never inspected or changed. */
export function bindArchitecture(root: Group, scenario: ScenarioId): BoundArchitectureGroup[] {
  const items = primitives(root), groups: BoundArchitectureGroup[] = [];
  if (['frontgate', 'transfer', 'flank'].includes(scenario)) for (const g of s05Plan().groups) {
    const targets = s05Targets(root, items, g.id);
    groups.push({ id: g.id, targets, placements: g.placements, ...(targets.length ? {} : { error: `Missing exact fallback: ${g.id}` }) });
  }
  if (scenario === 'medical') for (const g of s11Plan().groups) { const targets = s11Targets(root, items, g.id); groups.push({ id: g.id, targets, placements: g.placements, ...(targets.length ? {} : { error: `Missing exact fallback: ${g.id}` }) }); }
  const add = (id: string, placements: ArchitecturePlacement[], targets: VisualTarget[] = []) => groups.push({ id, placements, targets });
  if (['frontgate', 'transfer', 'flank'].includes(scenario)) {
    // Backdrop façades live on existing non-enterable buildings. Their depth straddles
    // the face; the surface is offset and cannot be coplanar with the retained shell.
    add('S05-far-facades', [3, 4, 5].map(i => uniformPlacement(`facade-${i}`, 'MAP-C-FACADE-01', [77 + i % 3 * 17, 1, 30 - i * 19 + 7.9], 1, 5)));
    add('S05-pipe-return-elbow', [uniformPlacement('pipe-elbow', 'ENV-PIPEKIT-ELBOW', [37, 2.15, 29.65], 1, .7)]);
    // Non-playable side lot, beyond the x=-54 boundary; keeps the service lane clear.
    add('S05-external-inspection-booth', [uniformPlacement('booth', 'PROP-BOOTH', [-60, 0, -65], 1, 3.2, Math.PI / 2)]);
    const tankParts = items.filter(i => i.position.distanceTo(new Vector3(44, i.position.y, 27)) < 3 && i.position.y <= 8 && !i.mesh.name.startsWith('static-cone-'));
    add('S05-secondary-tank', [uniformPlacement('tank', 'PROP-TANK', [44, .4, 27], 0, 4.4)], collect(tankParts));
    const lamp = [...at(items, 'cylinder', [-27, 3.5, -66]), ...at(items, 'box', [-26.5, 7, -66]), ...at(items, 'box', [-26.15, 6.91, -66])];
    add('S05-north-lamp', [uniformPlacement('lamp', 'ENV-LIGHTKIT-POLE', [-27, 0, -66], 1, 7)], collect(lamp));
    // Separate dock silhouette, outside the complete x=54 boundary, not an extra obstacle.
    add('S05-dock-crane', [uniformPlacement('dock-crane', 'BG-CRANE', [88, 0, -48], 1, 24, .45)]);
  }
  if (scenario === 'childhood' || scenario === 'mainhall') {
    // A raised external entry crown. Its bottom is above the 4.6m walk opening;
    // the authored lintel, collapsing roof sections and enemy routes remain intact.
    add('S01-S02-entry-arch-crown', [uniformPlacement('history-arch', 'MAP-A-ARCH-01', [30.45, 7.8, -2], 0, 12.5, Math.PI / 2)]);
  }
  if (scenario === 'transfer' || scenario === 'flank') {
    // Continuation behind the south boundary, separate from the animated shutter.
    add('S06-S07-cargo-corridor', [uniformPlacement('cargo-corridor', 'MAP-B-CORRIDOR-01', [-42, 0, 63], 2, 18)]);
  }
  if (scenario === 'escort') {
    // Repeated original-proportion subdeck modules are entirely below the original
    // walk surface. This does not invent collision or silently reshape the bridges.
    const spans = [[-174, -132, -21, -4], [-174, -132, 5.5, 22.5], [-350, -308, 22, 38]];
    const decks: ArchitecturePlacement[] = [], piers: ArchitecturePlacement[] = [];
    spans.forEach(([minX, maxX, minZ, maxZ], n) => {
      const length = (maxX - minX) / 5, depth = length * EXTRA['ENV-BRIDGEKIT-DECK'].size[0] / EXTRA['ENV-BRIDGEKIT-DECK'].size[2];
      const rise = length * EXTRA['ENV-BRIDGEKIT-DECK'].size[1] / EXTRA['ENV-BRIDGEKIT-DECK'].size[2];
      for (let x = 0; x < 5; x++) for (let z = minZ + depth / 2; z + depth / 2 <= maxZ; z += depth) decks.push(uniformPlacement(`bridge-${n}-${x}-${z}`, 'ENV-BRIDGEKIT-DECK', [minX + (x + .5) * length, -.47 - rise, z], 2, length, Math.PI / 2));
      for (const x of [minX + 7, maxX - 7]) for (const z of [minZ + 2.4, maxZ - 2.4]) piers.push(uniformPlacement(`pier-${n}-${x}-${z}`, 'MAP-E-PIER-01', [x, -7, z], 1, 5.5));
    });
    add('S08-bridge-subdecks', decks); add('S08-bridge-piers', piers);
  }
  if (scenario === 'epilogue') {
    add('S12-receiving-warehouse-roof', [uniformPlacement('shore-roof', 'MAP-F-ROOF-01', [-348, 5.4, 59], 0, 34)], collect(at(items, 'box', [-348, 5.27, 59], [34.5, .2, 20.5])));
    add('S12-offshore-receiving-ship', [uniformPlacement('receiving-ship', 'BG-SHIP', [-180, -1.5, 139], 2, 68, Math.PI / 2)]);
  }
  return validateBindings(groups);
}
