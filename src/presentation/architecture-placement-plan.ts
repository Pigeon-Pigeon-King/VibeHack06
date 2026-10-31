import { Euler, Quaternion, Vector3 } from 'three';
import type { ArchitectureAsset, ArchitecturePlacement, ModuleSemantic, Q4, V3 } from './ArchitectureTransactions';

/** These dimensions describe measured original meshes, not concept-image claims of metres. */
export const SOURCE_PROFILES = {
  'ARCH-FLOOR-METAL': { semantic: 'floor-panel', size: [1.8895001411, 0.1119674891, 1.8869773149], basis: [0, 0, 0, 1], limit: 1.35 },
  'ARCH-WALL-PAINT': { semantic: 'wall-panel', size: [1.8966026306, 0.9395144582, 0.1387816221], basis: [0, 0, 0, 1], limit: 1.5 },
  'ARCH-ROOF-METAL': { semantic: 'roof-panel', size: [1.8950922489, 0.1408181936, 1.8906607628], basis: [0, 0, 0, 1], limit: 1.35 },
  // Beam source +Z is its long axis. Basis maps it to module +Y for generic from/to placement.
  'ARCH-BEAM-STEEL': { semantic: 'beam', size: [0.0866085365, 1, 0.0915544555], basis: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], limit: 1.45 },
  'ARCH-CARGO-CONTAINER': { semantic: 'cargo-container', size: [0.3861933947, 0.3735889494, 1], basis: [0, 0, 0, 1], limit: 1.25 },
  'ARCH-COVER-CONCRETE': { semantic: 'cover', size: [1.8966426849, 0.5576271415, 0.4883289039], basis: [0, 0, 0, 1], limit: 1.4 },
  'ENV-WALLKIT-PANEL': { semantic: 'wall-panel', size: [1.8961840868, 0.7955505848, 0.2567566335], basis: [0, 0, 0, 1], limit: 1.35 },
  'ENV-PIPEKIT-STRAIGHT': { semantic: 'pipe-straight', size: [0.6520778537, 1.8800470829, 0.6318317056], basis: [0, 0, Math.SQRT1_2, Math.SQRT1_2], limit: 1.35 },
  'MAP-C-ICEBANK-01': { semantic: 'ice-bank', size: [1.8940956593, 1.2388576269, 1.3207361698], basis: [0, Math.SQRT1_2, 0, Math.SQRT1_2], limit: 1.025 },
  'MAP-C-FACADE-01': { semantic: 'facade-module', size: [1.8882472515, 1.6354393959, 0.5295301080], basis: [0, 0, 0, 1], limit: 1.025 },
  'BG-HEAT': { semantic: 'landmark', size: [1.0380849838, 1.8990132809, 0.9431426525], basis: [0, 0, 0, 1], limit: 1.025 },
} as const;
export type ProfileId = keyof typeof SOURCE_PROFILES;
export interface PlannedGroup {
  id: string; source: { file: string; line: number }; fallbackScope: string;
  status: 'measured-plan-awaiting-binding-and-visual-review' | 'awaiting-source-calibration';
  placements: ArchitecturePlacement[]; notes: string[];
}
export interface ScenePlacementPlan { scene: 'S05' | 'S11'; readMain: string; readBackup: string; groups: PlannedGroup[]; uncovered: { entity: string; reason: string }[] }

/** Caller chooses only sources whose current prepared LODs passed its visual review. No SHA is pinned here. */
export function architectureCatalog(accepted: readonly ProfileId[]): ArchitectureAsset[] {
  return accepted.map(id => {
    const p = SOURCE_PROFILES[id], uniform = p.semantic === 'landmark' || p.semantic === 'ice-bank' || p.semantic === 'facade-module';
    const floor = id === 'ARCH-FLOOR-METAL', background = p.semantic === 'landmark' || p.semantic === 'ice-bank';
    return { id, sourceId: `${id}:lod0`, semantic: p.semantic, materialContract: 'same-node-material-slots',
      basis: { quaternion: [...p.basis] as Q4, description: id === 'ARCH-BEAM-STEEL' || id === 'ENV-PIPEKIT-STRAIGHT' ? 'Long axis mapped to module +Y' : '+Y vertical; module width X, depth Z',
        evidence: 'Original GLB POSITION bounds and identity node transforms read 2026-10-31; signed decorative facing still requires visual review' },
      fit: uniform ? 'uniform' : 'bounded-stretch', maxAspectDistortion: p.limit,
      lods: [{ sourceId: `${id}:lod1`, distance: background ? 70 : floor ? 10 : 18 }, { sourceId: `${id}:lod2`, distance: background ? 130 : floor ? 24 : 45 }], castShadow: false };
  });
}
const p = (id: string, assetId: string, semantic: ModuleSemantic, position: V3, size: V3, yaw = 0): ArchitecturePlacement => ({ id, assetId, semantic, position, size, yaw, anchor: 'bottom-center' });
function group(id: string, file: string, line: number, fallbackScope: string, placements: ArchitecturePlacement[], notes: string[] = []): PlannedGroup {
  return { id, source: { file, line }, fallbackScope, placements, status: 'measured-plan-awaiting-binding-and-visual-review', notes };
}

/** Flush slabs. Ground top remains exactly zero; roof bottoms retain the authored ceiling clearance. */
export function slabGrid(id: string, assetId: 'ARCH-FLOOR-METAL' | 'ARCH-ROOF-METAL', x: number, z: number, width: number, depth: number, bottom: number, thickness: number): ArchitecturePlacement[] {
  const source = SOURCE_PROFILES[assetId].size;
  const nominal = assetId === 'ARCH-ROOF-METAL' ? Math.min(4, thickness / source[1] * source[0] * 1.1) : 4;
  const nx = Math.max(1, Math.round(width / nominal)), nz = Math.max(1, Math.round(depth / nominal)), sx = width / nx, sz = depth / nz, result: ArchitecturePlacement[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) result.push({ ...p(`${id}-${ix}-${iz}`, assetId, assetId === 'ARCH-FLOOR-METAL' ? 'floor-panel' : 'roof-panel',
    [x - width / 2 + sx * (ix + 0.5), bottom, z - depth / 2 + sz * (iz + 0.5)], [sx, thickness, sz]), batchKey: `${id}:chunk-${Math.floor(ix / 8)}-${Math.floor(iz / 8)}` });
  return result;
}

/** Tiles a wall volume with closed generated slabs; every outer face stays inside the original wall box. */
export function wallVolume(id: string, x: number, z: number, length: number, height: number, depth: number, alongZ = false, bottom = 0): ArchitecturePlacement[] {
  const source = SOURCE_PROFILES['ARCH-WALL-PAINT'].size, nx = Math.ceil(length / 4), sx = length / nx;
  const ny = Math.max(1, Math.round(height / (sx * source[1] / source[0]))), sy = height / ny;
  const nd = Math.max(1, Math.round(depth / (sx * source[2] / source[0]))), sd = depth / nd;
  const result: ArchitecturePlacement[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nd; iz++) {
    const a = -length / 2 + sx * (ix + 0.5), b = -depth / 2 + sd * (iz + 0.5);
    result.push({ ...p(`${id}-${ix}-${iy}-${iz}`, 'ARCH-WALL-PAINT', 'wall-panel', [x + (alongZ ? b : a), bottom + sy * iy, z + (alongZ ? -a : b)], [sx, sy, sd], alongZ ? Math.PI / 2 : 0), batchKey: id });
  }
  return result;
}

export function beamRun(id: string, from: V3, to: V3, width: number, depth = width): ArchitecturePlacement[] {
  const a = new Vector3(...from), delta = new Vector3(...to).sub(a), length = delta.length(), source = SOURCE_PROFILES['ARCH-BEAM-STEEL'].size;
  let best: { x: number; y: number; z: number; cost: number } | undefined;
  for (let x = 1; x <= 4; x++) for (let z = 1; z <= 4; z++) {
    const sx = width / x / source[0], sz = depth / z / source[2], near = Math.max(1, Math.round(length / Math.sqrt(sx * sz)));
    for (const y of new Set([Math.max(1, near - 1), near, near + 1])) {
      const sy = length / y, distortion = Math.max(sx, sy, sz) / Math.min(sx, sy, sz), cost = x * y * z;
      if (distortion <= SOURCE_PROFILES['ARCH-BEAM-STEEL'].limit && (!best || cost < best.cost)) best = { x, y, z, cost };
    }
  }
  if (!best) throw new Error(`No measured beam tiling fits ${id}`);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize()), rotation = new Euler().setFromQuaternion(q), result: ArchitecturePlacement[] = [];
  for (let x = 0; x < best.x; x++) for (let y = 0; y < best.y; y++) for (let z = 0; z < best.z; z++) {
    const offset = new Vector3(-width / 2 + width * (x + 0.5) / best.x, 0, -depth / 2 + depth * (z + 0.5) / best.z).applyQuaternion(q);
    result.push({ ...p(`${id}-${x}-${y}-${z}`, 'ARCH-BEAM-STEEL', 'beam', a.clone().addScaledVector(delta, (y + 0.5) / best.y).add(offset).toArray() as [number, number, number],
      [width / best.x, length / best.y, depth / best.z], rotation.y), anchor: 'center', pitch: rotation.x, roll: rotation.z, batchKey: id });
  }
  return result;
}

function warehouse(id: string, x: number, z: number, width: number, depth: number, height = 5.2): ArchitecturePlacement[] {
  // Enclosing surfaces, never a facade scaled into a filled building. The existing solid remains authoritative.
  return [...wallVolume(`${id}-front`, x, z + depth / 2 - 0.125, width, height, 0.25),
    ...wallVolume(`${id}-back`, x, z - depth / 2 + 0.125, width, height, 0.25),
    ...wallVolume(`${id}-left`, x - width / 2 + 0.125, z, depth, height, 0.25, true),
    ...wallVolume(`${id}-right`, x + width / 2 - 0.125, z, depth, height, 0.25, true),
    ...slabGrid(`${id}-roof`, 'ARCH-ROOF-METAL', x, z, width + 0.5, depth + 0.5, height - 0.03, 0.2)];
}

export function s05Plan(): ScenePlacementPlan {
  const file = 'src/presentation/frontgate-environment.ts', groups: PlannedGroup[] = [];
  groups.push(group('S05-ground', file, 94, 'named mesh port-ground; front-ground collider retained', slabGrid('S05-ground', 'ARCH-FLOOR-METAL', 0, -22, 108, 148, -0.2, 0.2), ['999 floor tiles, 20 spatial chunks; no raised rim permitted. Top remains y=0.']));
  const boundary: ArchitecturePlacement[] = [];
  for (const x of [-54, 54]) for (let i = 0; i < 24; i++) boundary.push(p(`boundary-x${x}-${i}`, 'ENV-WALLKIT-PANEL', 'wall-panel', [x, 0, -96 + (i + 0.5) * 148 / 24], [148 / 24, 2.8, 0.8], Math.PI / 2));
  for (const z of [-96, 52]) for (let i = 0; i < 17; i++) boundary.push(p(`boundary-z${z}-${i}`, 'ENV-WALLKIT-PANEL', 'wall-panel', [-54 + (i + 0.5) * 108 / 17, 0, z], [108 / 17, 2.8, 0.8]));
  groups.push(group('S05-boundaries', file, 96, 'exact 4 boundary box instances, not the entire static concrete batch', boundary));
  groups.push(group('S05-worker-screens', file, 39, 'worker-screen-north/east box instances only; retain stripe/sign overlays', [
    ...wallVolume('worker-north', -42, -38, 24, 3.4, 0.7), ...wallVolume('worker-east', -30, -0.5, 75, 3.4, 0.7, true)], ['Service route x≈-42 and the east threat-divider footprint remain unchanged. Steel cap/ribs require separate beam placements.']));
  for (const [id, x, z, width, depth] of [['repair', -49, 20, 8, 18], ['north-west', -22, -64, 10, 12], ['north-east', 28, -61, 12, 18],
    ['east-long', 42, -64, 18, 30], ['weigh-booth-building', -21, -13, 10, 12], ['rear-building', 16, 43, 16, 12]] as const) {
    groups.push(group(`S05-workshop-${id}`, file, id === 'repair' ? 54 : id === 'rear-building' ? 160 : 110,
      `PortKit.workshop(${x},${z},${width},${depth}) body+roof only; its facade accessories remain uncovered until bound separately`, warehouse(`workshop-${id}`, x, z, width, depth),
      ['Existing entire workshop collider remains non-enterable. This is visual shell construction, not newly navigable interior. Door/window/vent pieces need exact accessory mapping or dedicated assets.']));
  }
  const frame: ArchitecturePlacement[] = [];
  for (const [x, z, width] of [[0, -24, 28], [-8, 46.8, 18]]) {
    for (const dx of [-width / 2, width / 2]) frame.push(...beamRun(`gantry-${x}-${z}-${dx}`, [x + dx, 0, z], [x + dx, 6.6, z], 0.45, 0.7));
    frame.push(...beamRun(`header-${x}-${z}`, [x - (width + 1) / 2, 6.65, z], [x + (width + 1) / 2, 6.65, z], 0.6, 1.0));
  }
  for (const z of [-42, -22]) frame.push(...beamRun(`east-post-${z}`, [40, 0, z], [40, 7.2, z], 0.65));
  frame.push(...beamRun('east-header', [40, 7.15, -42.3], [40, 7.15, -21.7], 0.8, 0.6));
  groups.push(group('S05-main-gate-structure', file, 11, 'specified posts/headers; GUI labels and state indicator meshes excluded', frame.map(p => ({ ...p, batchKey: 'S05-gate-structure' })), ['Bases, braces, hoist cable and actuator boxes are separately uncovered; do not hide a mixed global steel batch.']));
  const pipes: ArchitecturePlacement[] = [];
  for (const [x, y, diameter] of [[37, 2.5, 0.36], [38.1, 2.9, 0.28]]) {
    const size = SOURCE_PROFILES['ENV-PIPEKIT-STRAIGHT'].size, count = Math.round(21 / (diameter * size[1] / Math.max(size[0], size[2])));
    for (let i = 0; i < count; i++) pipes.push({ ...p(`pipe-${x}-${i}`, 'ENV-PIPEKIT-STRAIGHT', 'pipe-straight', [x, y, 8.5 + 21 * (i + 0.5) / count], [diameter, 21 / count, diameter]), anchor: 'center', pitch: Math.PI / 2 });
  }
  groups.push(group('S05-pipelines', file, 152, 'two long cylinder instances only', pipes, ['No invented elbows: existing lines are straight. Filter-bank bodies are not interchangeable with these pipe segments.']));
  const ice = SOURCE_PROFILES['MAP-C-ICEBANK-01'].size;
  groups.push(group('S05-ice-silhouette', file, 72, '11 distant cone instances', Array.from({ length: 11 }, (_, i) => {
    const h = 34 + i % 4 * 7; return p(`ice-${i}`, 'MAP-C-ICEBANK-01', 'ice-bank', [-101 - i % 3 * 18, 5 - h / 2, 42 - i * 16], [h * ice[0] / ice[1], h, h * ice[2] / ice[1]], i * 0.45);
  }), ['Uniform scale; deliberately buried lower half matches old silhouette base. Check rotated bounds stay west of x=-54 before acceptance; no navigation is added.']));
  const heat = SOURCE_PROFILES['BG-HEAT'].size;
  groups.push(group('S05-far-heat-trio', file, 76, 'distant building indices i=0,1,2 body+roof+chimney only', [0, 1, 2].map(i => {
    const h = 12 + i * 4; return p(`heat-${i}`, 'BG-HEAT', 'landmark', [77 + i * 17, 0, 30 - i * 19], [h * heat[0] / heat[1], h, h * heat[2] / heat[1]]);
  }), ['One generated heat tower instanced three times; no interiors. Remaining five far warehouse bodies still need shell mapping.']));
  const cargo = [[-11, -79], [-4, -79], [3, -79], [29, 26]].map(([x, z], i) => p(`cargo-${i}`, 'ARCH-CARGO-CONTAINER', 'cargo-container', [x, 0, z], [2.9, 2.68, 6.7], Math.PI / 2));
  groups.push(group('S05-freight-containers', file, 109, 'four PortKit.container visual scopes, all corrugation/locking-bar members', cargo, ['Actual Tripo long axis is +Z; quarter-turn retains existing shipping-container footprint. Closed exterior; no new enterable interior. Use ARCH-CARGO-CONTAINER only, never the small PROP-CARGO crate.']));
  const covers: [number, number, number, number][] = [[-17, -49.7, 4.5, 0], [-5, -45.7, 4.6, 0], [10, -51.7, 4.2, 0], [15, -36.7, 4.4, 0], [-8, -31.7, 4.2, 0], [7, -26.6, 3.8, 0],
    [-8, -20.3, 6.2, 0], [10, -12.3, 5.5, 0], [-8, 9.5, 6, 0], [-5, 22.3, 6.2, 0], [26, -35, 4.2, Math.PI / 2], [26.7, -22, 4, Math.PI / 2], [21.7, -14, 4, Math.PI / 2], [30.7, -5, 4.2, Math.PI / 2], [18.3, -2, 7, Math.PI / 2]];
  const coverProfile = SOURCE_PROFILES['ARCH-COVER-CONCRETE'], coverPlacements = covers.flatMap(([x, z, length, yaw], i) => {
    const total = length + 0.18, maxWidth = coverProfile.size[0] * Math.min(1.2 / coverProfile.size[1], 1.05 / coverProfile.size[2]) * coverProfile.limit;
    const count = Math.ceil(total / maxWidth), width = total / count;
    return Array.from({ length: count }, (_, j) => {
      const offset = -total / 2 + width * (j + 0.5);
      return p(`cover-${i}-${j}`, 'ARCH-COVER-CONCRETE', 'cover', [x + Math.cos(yaw) * offset, 0, z - Math.sin(yaw) * offset], [width, 1.2, 1.05], yaw);
    });
  });
  groups.push(group('S05-cover', file, 113, '15 PortKit.cover scopes; preserve warning color overlays if used as information', coverPlacements,
    ['19 actual-bound modules fill 15 unchanged collider envelopes. 6–7m runs split into two; every part preserves 1.2m height and 1.05m maximum depth, bounded aspect ≤1.4. End-plane seams need visual review; no automatic overlap or geometry trimming.']));
  return { scene: 'S05', readMain: '7361276', readBackup: '8d14c1a', groups, uncovered: [
    { entity: 'worker repair shallow-vault roof, 18×14m', reason: 'Existing MAP-A/MAP-F source aspect does not match shallow 18m span; requires approved shallow canopy arrangement or a dedicated module.' },
    { entity: 'workshop door/window/vent accessories and five remaining far buildings', reason: 'Bind measured facade modules to front surfaces only; never use one facade to replace a full building cube.' },
    { entity: 'filterBank, racks, gate actuator/hoist, bases, screen caps/ribs, staging block', reason: 'Distinct mechanical/structural visual scopes still need exact generated components; no automatic material-based guessing.' },
    { entity: 'weigh deck', reason: '8×22×0.12m deck needs floor tiles with measured thickness fit or dedicated bridge deck; fine scale markings remain information overlays.' },
    { entity: 'existing lamp/tank/tug/crane fallback LOD system', reason: 'Owner must remove far-whitebox behavior and mark only real generated visuals as existing-generated; this plan does not claim their coverage automatically.' },
  ] };
}

export function s11Plan(): ScenePlacementPlan {
  const file = 'src/presentation/medical-environment.ts', groups: PlannedGroup[] = [];
  groups.push(group('S11-ground', file, 22, 'port-ground AND the medical-ground box instance; one atomic transaction', slabGrid('S11-ground', 'ARCH-FLOOR-METAL', -402, 58, 44, 52, -0.2, 0.2), ['143 tiles / 4 spatial chunks. Both coincident old floor visuals must hide, while both authored solid definitions stay untouched.']));
  const walls = [...wallVolume('boundary-west', -424, 58, 52, 3, 0.5, true), ...wallVolume('boundary-east', -380, 58, 52, 3, 0.5, true),
    ...wallVolume('boundary-north', -402, 32, 44, 3, 0.5), ...wallVolume('boundary-south', -402, 84, 44, 3, 0.5),
    ...wallVolume('ward-west', -420, 56, 40, 5.6, 0.5, true), ...wallVolume('ward-east', -384, 56, 40, 5.6, 0.5, true),
    ...wallVolume('ward-north', -402, 36, 36, 5.6, 0.5), ...wallVolume('entry-west', -411.5, 76, 17, 5.6, 0.5), ...wallVolume('entry-east', -388, 76, 8, 5.6, 0.5),
    ...wallVolume('entry-lintel', -398, 76, 10, 1.8, 0.7, false, 3.8)];
  groups.push(group('S11-walls', file, 24, 'exact boundary/wall/entry/lintel box instances; no global pale/paint batch hide', walls,
    ['Keep entrance x=-403..-392 open below lintel y=3.8; current 10m lintel and authored posts remain unchanged.', 'Panels are based on measured ≈2:1 source, tiled in roughly 2m rows, not scaled to concept 4×3m slabs.']));
  groups.push(group('S11-ceiling', file, 31, 'medical-roof flat box only, not the separate arch geometry', slabGrid('S11-ceiling', 'ARCH-ROOF-METAL', -402, 56, 37, 41, 5.6, 0.3),
    ['Existing roof solid spans y=5.6..6.0. Generated skin stays within it. Shallow vault remains explicitly uncovered.']));
  return { scene: 'S11', readMain: '7361276', readBackup: '8d14c1a', groups, uncovered: [
    { entity: '37×41m shallow vaulted outer roof at y=6', reason: 'MAP-F-ROOF uniform span37 gives ≈18.17m rise, unlike old ≈3.75m rise. Do not stretch it to fit; dedicated shallow-vault asset/segmentation is needed.' },
    { entity: 'medical-treatment-curtain and its rail', reason: 'Dynamic scale.x animation must retain a dedicated curtain actor. No replacement with a static wall slab.' },
    { entity: 'patient carts, mattresses, wheeled mechanisms, IV stand/tube/bag', reason: 'Require dedicated separated generated asset and motion ownership; architecture loader rejects animated meshes.' },
    { entity: 'supply lockers/bins, water table, rest-back, four desks/screens', reason: 'Map exact dedicated prop IDs and measured envelopes via independent prop owner; no blanket steel-box replacement.' },
    { entity: 'bench version difference', reason: 'Main a67757d still has a 4.5m bench collider; backup8d14c1a has two1.8m generated stools with calibrated solids. Owner must preserve the merged version and avoid reinstating the old collider.' },
    { entity: 'signs and three ceiling signal strips', reason: 'Retain semantic text/light color overlays via declareInformation; physical lamp housings need generated bodies.' },
  ] };
}
