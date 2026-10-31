import { Box3, Euler, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { ScenarioId } from '../contracts';
import type { ArchitecturePlacement, ModuleSemantic, V3, VisualTarget } from './ArchitectureTransactions';
import type { BoundArchitectureGroup } from './architecture-bindings';
import { SOURCE_PROFILES, type ProfileId } from './architecture-placement-plan';
import { readPortKitPrimitives, readPortKitSemantics, type PortKitPrimitive } from './port-kit';
import { HISTORY } from '../content/history-layout';
import { NIGHT, WORKERS } from '../content/chapter-layout';
import { FRONTGATE } from '../content/frontgate-layout';
import { ESCORT } from '../content/escort-layout';
import { RELIEF } from '../content/relief-layout';
import { RESCUE } from '../content/rescue-layout';
import { MEDICAL } from '../content/medical-layout';
import { EPILOGUE } from '../content/epilogue-layout';

export interface ArchitectureGap { parent: string; entity: string; kind: string; reason: string; position?: number[] }
export interface AutomaticArchitecturePlan { groups: BoundArchitectureGroup[]; uncovered: ArchitectureGap[]; informationPrimitives: number; delegatedPrimitives: number }
const measurements = {
  'PROP-TANK': { semantic: 'landmark', size: [1.626666, 1.898614, 1.620525] },
  'ENV-LIGHTKIT-POLE': { semantic: 'landmark', size: [.867866, 1.896112, .356282] },
} as const;
const ownProp = (parent: Group): boolean => {
  for (let node: Group | null = parent; node; node = node.parent as Group | null) if (node.userData.generatedSlot || node.userData.generatedPropHost) return true;
  return false;
};
const tuple = (v: Vector3) => v.toArray() as [number, number, number];
const isInformation = (p: PortKitPrimitive) => {
  if (p.surface === 'signal') return true;
  const size = new Vector3().setFromMatrixScale(p.matrix);
  return p.kind === 'box' && ((p.surface === 'amber' && !p.semantic && Math.min(size.x, size.y, size.z) <= .045 && Math.max(size.x, size.y, size.z) >= .4)
    || (p.surface === 'white' && size.y <= .04 && Math.max(size.x, size.z) >= .5 && Math.min(size.x, size.z) <= .35));
};
const transform = (center: V3, rotation = new Quaternion()) => new Matrix4().compose(new Vector3(...center), rotation, new Vector3(1, 1, 1));

/** Integer subdivisions keep each module within the measured source aspect contract.
 * All cells remain inside the original box. No arbitrary large stretch or filled facade. */
export function measuredBoxModules(id: string, assetId: ProfileId, size: V3, matrix: Matrix4, parent: Group): ArchitecturePlacement[] {
  const profile = SOURCE_PROFILES[assetId], source = profile.size, ratios = size.map((n, i) => n / source[i]);
  if (!size.every(n => Number.isFinite(n) && n > 0)) throw new Error(`Invalid structural envelope ${id}`);
  let best: { n: number[]; cost: number; size: number[] } | undefined;
  const limit = profile.limit - .002, max = Math.min(...ratios);
  // Enumerate scale breakpoints plus a small deterministic grid. A small last cell
  // is never stretched out of contract; reduce the common cell size instead.
  const scales = new Set<number>();
  for (let i = 0; i < 40; i++) scales.add(max / (1 + i / 8));
  for (let axis = 0; axis < 3; axis++) {
    const first = Math.max(1, Math.floor(ratios[axis] / max));
    for (let n = first; n <= first + 12; n++) scales.add(ratios[axis] / n);
  }
  for (const scale of scales) {
    const n = ratios.map(r => Math.max(1, Math.round(r / scale))), cell = size.map((v, i) => v / n[i]);
    const fit = cell.map((v, i) => v / source[i]), distortion = Math.max(...fit) / Math.min(...fit), cost = n[0] * n[1] * n[2];
    if (distortion <= limit && cost <= 4096 && (!best || cost < best.cost)) best = { n, cost, size: cell };
  }
  if (!best) throw new Error(`${id}: no bounded module assembly for ${size.join('/')}`);
  const quaternion = new Quaternion().setFromRotationMatrix(matrix), rotation = new Euler().setFromQuaternion(quaternion);
  const result: ArchitecturePlacement[] = [];
  for (let x = 0; x < best.n[0]; x++) for (let y = 0; y < best.n[1]; y++) for (let z = 0; z < best.n[2]; z++) {
    const point = new Vector3(-size[0] / 2 + (x + .5) * best.size[0], -size[1] / 2 + (y + .5) * best.size[1], -size[2] / 2 + (z + .5) * best.size[2]).applyMatrix4(matrix);
    result.push({ id: `${id}:${x}:${y}:${z}`, assetId, semantic: profile.semantic, position: tuple(point), size: best.size as [number, number, number],
      anchor: 'center', yaw: rotation.y, pitch: rotation.x, roll: rotation.z, parent,
      batchKey: `${assetId}:${Math.floor(point.x / 32)}:${Math.floor(point.z / 32)}` });
  }
  return result;
}
function uniform(id: string, assetId: keyof typeof measurements | ProfileId, maxSize: V3, matrix: Matrix4, parent: Group, anchor: 'center' | 'bottom-center' = 'center'): ArchitecturePlacement {
  const p = assetId in measurements ? measurements[assetId as keyof typeof measurements] : SOURCE_PROFILES[assetId as ProfileId];
  const scale = Math.min(...maxSize.map((v, i) => v / p.size[i]));
  const position = new Vector3().setFromMatrixPosition(matrix), rotation = new Euler().setFromRotationMatrix(matrix);
  return { id, assetId, semantic: p.semantic as ModuleSemantic, position: tuple(position), size: p.size.map(v => v * scale) as [number, number, number],
    anchor, yaw: rotation.y, pitch: rotation.x, roll: rotation.z, parent, batchKey: `${assetId}:${Math.floor(position.x / 32)}:${Math.floor(position.z / 32)}` };
}
function primitiveBox(p: PortKitPrimitive): { size: [number, number, number]; matrix: Matrix4 } {
  const center = new Vector3(), q = new Quaternion(), size = new Vector3(); p.matrix.decompose(center, q, size);
  return { size: tuple(size), matrix: transform(tuple(center), q) };
}
function beamBox(id: string, size: V3, matrix: Matrix4, parent: Group): ArchitecturePlacement[] {
  const axis = size.indexOf(Math.max(...size)), q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0));
  const local = new Matrix4().makeRotationFromQuaternion(q), inverse = local.clone().invert();
  const orientedSize = new Vector3(...size).applyMatrix4(inverse); orientedSize.set(Math.abs(orientedSize.x), Math.abs(orientedSize.y), Math.abs(orientedSize.z));
  return measuredBoxModules(id, 'ARCH-BEAM-STEEL', tuple(orientedSize), matrix.clone().multiply(local), parent);
}
function wallBox(id: string, size: V3, matrix: Matrix4, parent: Group, asset: 'ARCH-WALL-PAINT' | 'ENV-WALLKIT-PANEL' = 'ARCH-WALL-PAINT'): ArchitecturePlacement[] {
  if (size[0] < size[2]) return measuredBoxModules(id, asset, [size[2], size[1], size[0]], matrix.clone().multiply(new Matrix4().makeRotationY(Math.PI / 2)), parent);
  return measuredBoxModules(id, asset, size, matrix, parent);
}
function tableStructure(id: string, size: V3, matrix: Matrix4, parent: Group): ArchitecturePlacement[] {
  const [w, h, d] = size, top = Math.min(.10, h / 5), leg = Math.min(.09, w / 8, d / 8);
  const result = measuredBoxModules(`${id}:top`, 'ARCH-FLOOR-METAL', [w, top, d], matrix.clone().multiply(new Matrix4().makeTranslation(0, h / 2 - top / 2, 0)), parent);
  for (const x of [-w / 2 + leg / 2, w / 2 - leg / 2]) for (const z of [-d / 2 + leg / 2, d / 2 - leg / 2]) {
    result.push(...beamBox(`${id}:leg:${x}:${z}`, [leg, h - top, leg], matrix.clone().multiply(new Matrix4().makeTranslation(x, -top / 2, z)), parent));
  }
  return result;
}
/** Reuse produced roof panels/steel beams on eight chords selected from the
 * existing 20-segment arch. Every chord lies inside the original outer polygon.
 * Its thickness is limited by the original inner curve; the passage stays open. */
function curvedRoof(id: string, size: V3, matrix: Matrix4, parent: Group): ArchitecturePlacement[] {
  const [w, h, depth] = size, result: ArchitecturePlacement[] = [], stops = [0, 2, 5, 7, 10, 12, 15, 17, 20];
  const rib = depth <= .6;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = Math.PI - stops[i] * Math.PI / 20, b = Math.PI - stops[i + 1] * Math.PI / 20;
    const start = new Vector3(Math.cos(a) * w * .5, Math.sin(a) * h * .5, 0);
    const end = new Vector3(Math.cos(b) * w * .5, Math.sin(b) * h * .5, 0);
    const delta = end.clone().sub(start), initialLength = delta.length(), angle = Math.atan2(delta.y, delta.x);
    const tangent = delta.clone().normalize(), normal = new Vector3(-tangent.y, tangent.x, 0);
    const mid = (a + b) / 2, inner = new Vector3(Math.cos(mid) * w * .46, Math.sin(mid) * h * .46, 0);
    const clearance = start.clone().add(end).multiplyScalar(.5).sub(inner).dot(normal);
    const thickness = rib ? Math.min(depth, clearance * .8) : Math.min(.14,
      initialLength * SOURCE_PROFILES['ARCH-ROOF-METAL'].size[1] / SOURCE_PROFILES['ARCH-ROOF-METAL'].size[0] * 1.1, clearance * .8);
    // Trim only the terminal cap edges so their inner corners do not dip below
    // the original baseline of this arch.
    if (i === 0) start.addScaledVector(tangent, thickness * normal.y / Math.max(.001, tangent.y));
    if (i === stops.length - 2) end.addScaledVector(tangent, -thickness * normal.y / Math.max(.001, -tangent.y));
    const length = start.distanceTo(end), center = start.add(end).multiplyScalar(.5).addScaledVector(normal, -thickness / 2);
    const at = matrix.clone().multiply(new Matrix4().makeTranslation(...tuple(center))).multiply(new Matrix4().makeRotationZ(angle));
    result.push(...(rib ? beamBox(`${id}:rib:${i}`, [length, thickness, depth], at, parent)
      : measuredBoxModules(`${id}:arc:${i}`, 'ARCH-ROOF-METAL', [length, thickness, depth], at, parent)));
  }
  return result;
}
/** Exterior skins stay within the old non-enterable building body; no interior/nav claim. */
function warehouse(id: string, size: V3, matrix: Matrix4, parent: Group, facade: boolean): ArchitecturePlacement[] {
  const [w, h, d] = size, thickness = Math.min(.30, w / 8, d / 8);
  const at = (p: V3) => matrix.clone().multiply(new Matrix4().makeTranslation(...p));
  const result = [
    ...wallBox(`${id}:back`, [w, h, thickness], at([0, 0, -d / 2 + thickness / 2]), parent),
    ...wallBox(`${id}:left`, [thickness, h, d], at([-w / 2 + thickness / 2, 0, 0]), parent),
    ...wallBox(`${id}:right`, [thickness, h, d], at([w / 2 - thickness / 2, 0, 0]), parent),
  ];
  const profile = SOURCE_PROFILES['MAP-C-FACADE-01'], count = Math.max(1, Math.round(w / (h * profile.size[0] / profile.size[1]))), cell = w / count;
  const facadeScale = Math.min(cell / profile.size[0], h / profile.size[1], d / 3 / profile.size[2]), inset = facade ? profile.size[2] * facadeScale : 0;
  result.push(...wallBox(`${id}:front`, [w, h, thickness], at([0, 0, d / 2 - inset - thickness / 2]), parent));
  if (facade) for (let i = 0; i < count; i++) {
    const panel = uniform(`${id}:facade:${i}`, 'MAP-C-FACADE-01', [cell, h, inset], at([-w / 2 + cell * (i + .5), 0, d / 2 - inset / 2]), parent);
    result.push(panel);
  }
  return result;
}
function targets(parts: readonly PortKitPrimitive[]): VisualTarget[] {
  const map = new Map<NonNullable<PortKitPrimitive['mesh']>, Set<number>>();
  for (const p of parts) if (p.mesh) { const set = map.get(p.mesh) ?? new Set(); set.add(p.index); map.set(p.mesh, set); }
  return [...map].map(([mesh, ids]) => ({ mesh, indices: [...ids] }));
}
function boundsFor(scenario: ScenarioId) {
  if (scenario === 'childhood' || scenario === 'mainhall') return HISTORY.bounds;
  if (scenario === 'nightshift') return NIGHT.bounds;
  if (scenario === 'workers') return WORKERS.bounds;
  if (['frontgate', 'transfer', 'flank'].includes(scenario)) return FRONTGATE.bounds;
  if (scenario === 'escort') return ESCORT.bounds;
  if (scenario === 'relief') return RELIEF.bounds;
  if (scenario === 'rescue') return RESCUE.bounds;
  if (scenario === 'medical') return MEDICAL.bounds;
  if (scenario === 'epilogue') return EPILOGUE.bounds;
  return { minX: -30, maxX: 30, minZ: -42, maxZ: 34 };
}

export function automaticArchitecture(root: Group, scenario: ScenarioId): AutomaticArchitecturePlan {
  const all = readPortKitPrimitives(root), semantics = readPortKitSemantics(root), groups: BoundArchitectureGroup[] = [], uncovered: ArchitectureGap[] = [], claimed = new Set<PortKitPrimitive>();
  const scopes = new Map<Group, number>(); root.traverse(node => { if (node instanceof Group) scopes.set(node, scopes.size); });
  const key = (parent: Group, id: string) => `auto:${scopes.get(parent)}:${id}`;
  const gap = (parent: Group, id: string, kind: string, reason: string, position?: number[]) => uncovered.push({ parent: parent.name, entity: id, kind, reason, ...(position ? { position } : {}) });
  const add = (id: string, parent: Group, parts: readonly PortKitPrimitive[], produce: () => ArchitecturePlacement[]) => {
    const physical = parts.filter(p => !isInformation(p));
    if (!physical.length) return;
    try {
      const placements = produce(); if (!placements.length) throw new Error('No matching generated placements');
      groups.push({ id: key(parent, id), targets: targets(physical), placements }); physical.forEach(p => claimed.add(p));
    } catch (e) { gap(parent, id, 'unsupported-fit', e instanceof Error ? e.message : String(e)); physical.forEach(p => claimed.add(p)); }
  };
  // Every ground mesh is its own atomic surface; this includes the three S08 banks
  // and S01/S02's lower floor parent translation, without closing their gullies.
  root.traverse(node => {
    if (!(node instanceof Mesh) || !node.userData.architectureGround || ownProp(node.parent as Group)) return;
    node.updateMatrix(); const geometry = node.geometry; geometry.computeBoundingBox();
    const box = geometry.boundingBox!, size = box.getSize(new Vector3()), position = box.getCenter(new Vector3());
    const matrix = node.matrix.clone().multiply(new Matrix4().makeTranslation(...tuple(position)));
    const id = `ground-${groups.length}`;
    try { groups.push({ id: key(node.parent as Group, id), targets: [{ mesh: node }], placements: measuredBoxModules(id, 'ARCH-FLOOR-METAL', tuple(size), matrix, node.parent as Group) }); }
    catch (e) { gap(node.parent as Group, id, 'ground', String(e)); }
  });
  for (const semantic of semantics) {
    if (ownProp(semantic.parent) || semantic.kind === 'tractor') continue;
    const parts = all.filter(p => p.semantic === semantic), id = semantic.id, args = semantic.args as number[], parent = semantic.parent;
    const origin = semantic.originMatrix;
    const at = (p: V3, yaw = 0) => origin.clone().multiply(new Matrix4().makeRotationY(yaw).setPosition(...p));
    if (semantic.kind === 'terminal') {
      // The prop owner owns the generated console and all screen/desk members.
      // This single exact pedestal is independently generated from structural steel.
      const pedestal = parts.filter(p => p.kind === 'box' && p.surface === 'steel');
      add(`${id}:pedestal`, parent, pedestal, () => pedestal.flatMap(p => { const b = primitiveBox(p); return beamBox(id, b.size, b.matrix, parent); })); continue;
    }
    if (semantic.kind === 'cover') add(id, parent, parts, () => measuredBoxModules(id, 'ARCH-COVER-CONCRETE', [args[2] + .18, 1.2, 1.05], at([args[0], .6, args[1]], args[3]), parent));
    else if (semantic.kind === 'container') add(id, parent, parts, () => measuredBoxModules(id, 'ARCH-CARGO-CONTAINER', [2.9, 2.68, 6.7], at([args[0], 1.34, args[1]], args[2]), parent));
    else if (semantic.kind === 'workshop') add(id, parent, parts, () => {
      const [x, z, w, d] = args;
      return [...warehouse(id, [w, 5.2, d], at([x, 2.6, z]), parent, true),
        ...measuredBoxModules(`${id}:roof`, 'ARCH-ROOF-METAL', [w + .5, .2, d + .5], at([x, 5.27, z]), parent)];
    });
    else if (semantic.kind === 'tank') add(id, parent, parts, () => [uniform(id, 'PROP-TANK', [args[2] * 2.15, args[3] + .4, args[2] * 2.15], at([args[0], 0, args[1]]), parent, 'bottom-center')]);
    else if (semantic.kind === 'light') add(id, parent, parts, () => [uniform(id, 'ENV-LIGHTKIT-POLE', [args[2], args[2], args[2]], at([args[0], 0, args[1]]), parent, 'bottom-center')]);
    else if (semantic.kind === 'beam') add(id, parent, parts, () => parts.flatMap(p => { const b = primitiveBox(p); return measuredBoxModules(id, 'ARCH-BEAM-STEEL', b.size, b.matrix, parent); }));
  }
  const bounds = boundsFor(scenario);
  for (const p of all) {
    if (claimed.has(p) || ownProp(p.parent) || p.semantic || isInformation(p)) continue;
    const id = p.solidId ?? `primitive-${p.batch}-${p.index}`, { size, matrix } = primitiveBox(p), [w, h, d] = size;
    const position = tuple(new Vector3().setFromMatrixPosition(matrix)), name = `${p.parent.name}/${id}`;
    const specialty = p.solidId ?? (p.parent === root ? '' : p.parent.name);
    if (p.kind === 'box' && p.solidId && /table|desk|(?:tool|work)-?bench/.test(p.solidId) && !p.openFact) {
      add(id, p.parent, [p], () => tableStructure(id, size, matrix, p.parent)); continue;
    }
    if (p.openFact || /curtain|cabinet|bed|mattress|lunch|weapon|rifle|pillow|fan|crate|radio|supply|tool|monitor|greenhouse|port-map/i.test(specialty)) continue;
    if (p.kind === 'arch') { add(id, p.parent, [p], () => curvedRoof(id, size, matrix, p.parent)); continue; }
    if (p.kind === 'box' && p.parent.name === 'history-collapse-debris') {
      add(id, p.parent, [p], () => measuredBoxModules(id, 'ARCH-FLOOR-METAL', size, matrix, p.parent)); continue;
    }
    if (p.kind === 'cone' && p.surface === 'ice') {
      add(id, p.parent, [p], () => [uniform(id, 'MAP-C-ICEBANK-01', [w * 2, h, d * 2], matrix, p.parent)]); continue;
    }
    if (p.kind === 'cylinder' && p.surface !== 'rubber' && p.surface !== 'ice' && w >= .10 && h >= w * 5) {
      add(id, p.parent, [p], () => measuredBoxModules(id, 'ENV-PIPEKIT-STRAIGHT', [w * 2, h, d * 2], matrix, p.parent)); continue;
    }
    if (p.kind !== 'box' || p.surface === 'glass') continue;
    const outside = position[0] + w / 2 < bounds.minX || position[0] - w / 2 > bounds.maxX || position[2] + d / 2 < bounds.minZ || position[2] - d / 2 > bounds.maxZ;
    if (outside && ['paint', 'steel', 'pale', 'concrete'].includes(p.surface) && Math.min(w, d) >= 8 && h >= 6) {
      add(id, p.parent, [p], () => warehouse(id, size, matrix, p.parent, true)); continue;
    }
    const isRoof = /roof|ceiling/.test(name) || (outside && h <= 1.1 && w >= 8 && d >= 8 && ['steel', 'pale'].includes(p.surface));
    const isFloor = /ground|floor|deck|landing|gallery/.test(name) && h <= .6 && w >= 1 && d >= 1;
    const isWall = !!p.solidId && (/wall|boundary|divider|separation|checkpoint-line|yard-line|overlap|reception|medical-side|medical-back|rest-back|bulkhead|route-screen|worker-screen/.test(name)
      || (['paint', 'concrete', 'pale', 'steel'].includes(p.surface) && Math.max(w, d) >= 2.5 && h >= 1.7)) && Math.min(w, d) <= 1.5 && h >= .5;
    const isBeam = /column|pillar|header|lintel|post|leg|support|brace|rail|curb|edge|frame/.test(name)
      || (['steel', 'pale', 'paint'].includes(p.surface) && Math.max(w, h, d) / Math.max(.01, [w, h, d].sort((a,b)=>a-b)[1]) >= 5 && Math.min(w, h, d) >= .055);
    const step = !!p.solidId && /(?:stair-\d|platform-(?:up|down)-\d|service-platform|walker-(?:up|down)-\d|upper-stair|lower-stair|landing|crane-base|crane-pedestal|filter-base|staging-block|control-pedestal)/.test(p.solidId);
    if (step) {
      add(id, p.parent, [p], () => {
        const top = Math.min(.08, Math.min(w, d) * .045, h / 3);
        return [...warehouse(id, size, matrix, p.parent, false), ...measuredBoxModules(`${id}:tread`, 'ARCH-FLOOR-METAL', [w, top, d],
          matrix.clone().multiply(new Matrix4().makeTranslation(0, h / 2 - top / 2, 0)), p.parent)];
      }); continue;
    }
    if (isRoof && h <= 1.1 && w >= 1 && d >= 1) add(id, p.parent, [p], () => measuredBoxModules(id, 'ARCH-ROOF-METAL', size, matrix, p.parent));
    else if (isFloor) add(id, p.parent, [p], () => measuredBoxModules(id, 'ARCH-FLOOR-METAL', size, matrix, p.parent));
    else if (isWall) add(id, p.parent, [p], () => wallBox(id, size, matrix, p.parent, p.surface === 'concrete' ? 'ENV-WALLKIT-PANEL' : 'ARCH-WALL-PAINT'));
    else if (!p.solidId && h >= .05 && h <= .4 && w >= .4 && d >= .4 && h / Math.min(w, d) <= .12 && ['steel', 'pale', 'white', 'concrete'].includes(p.surface))
      add(id, p.parent, [p], () => measuredBoxModules(id, 'ARCH-FLOOR-METAL', size, matrix, p.parent));
    else if (!p.solidId && h >= .6 && Math.min(w, d) <= .5 && Math.max(w, d) >= .6 && Math.min(w, d) / Math.max(w, h, d) <= .18 && ['steel', 'pale', 'paint', 'concrete'].includes(p.surface))
      add(id, p.parent, [p], () => wallBox(id, size, matrix, p.parent));
    else if (p.solidId && /^(?:stair|descent)-edge-/.test(p.solidId))
      add(id, p.parent, [p], () => measuredBoxModules(id, 'ARCH-COVER-CONCRETE', [d, h, w], matrix.clone().multiply(new Matrix4().makeRotationY(Math.PI / 2)), p.parent));
    else if (isBeam) add(id, p.parent, [p], () => beamBox(id, size, matrix, p.parent));
  }
  // Uncollidable lane tint and metal deck seams sit millimetres over a floor.
  // Replace their surface/detail with that same generated floor
  // atomically, keeping the independent white/amber wayfinding markings.
  const substrate: { group: BoundArchitectureGroup; parent: Group; box: Box3 }[] = [];
  for (const group of groups) {
    if (!group.placements.some(p => p.assetId === 'ARCH-FLOOR-METAL')) continue;
    for (const target of group.targets) {
      if (target.mesh.userData.architectureGround) {
        target.mesh.geometry.computeBoundingBox(); target.mesh.updateMatrix();
        substrate.push({ group, parent: target.mesh.parent as Group, box: target.mesh.geometry.boundingBox!.clone().applyMatrix4(target.mesh.matrix) });
      }
      for (const p of all) if (target.mesh === p.mesh && target.indices?.includes(p.index) && p.kind === 'box') {
        const size = new Vector3().setFromMatrixScale(p.matrix);
        if ((size.y <= .6 || /stair|landing|service-platform/.test(p.solidId ?? '')) && size.x >= .5 && size.z >= .5) substrate.push({ group, parent: p.parent,
          box: new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5)).applyMatrix4(p.matrix) });
      }
    }
  }
  for (const p of all) {
    if (claimed.has(p) || p.semantic || p.solidId || ownProp(p.parent) || p.kind !== 'box' || !['rubber', 'pale', 'steel'].includes(p.surface)) continue;
    const size = new Vector3().setFromMatrixScale(p.matrix);
    if (size.y > .03 || Math.max(size.x, size.z) < .5 || (p.surface === 'rubber' && Math.min(size.x, size.z) < 3)) continue;
    const box = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5)).applyMatrix4(p.matrix);
    const support = substrate.find(s => s.parent === p.parent && box.min.y >= s.box.max.y - .01 && box.max.y <= s.box.max.y + .06
      && box.min.x >= s.box.min.x - .01 && box.max.x <= s.box.max.x + .01 && box.min.z >= s.box.min.z - .01 && box.max.z <= s.box.max.z + .01);
    if (support) { support.group.targets.push(...targets([p])); claimed.add(p); }
  }
  let informationPrimitives = 0, delegatedPrimitives = 0;
  for (const p of all) {
    if (isInformation(p)) { informationPrimitives++; continue; }
    if (ownProp(p.parent) || p.semantic?.kind === 'tractor' || p.semantic?.kind === 'terminal' && !claimed.has(p)) { delegatedPrimitives++; continue; }
    if (!claimed.has(p)) gap(p.parent, p.solidId ?? `${p.batch}[${p.index}]`, p.kind, p.kind === 'arch' ? 'Dedicated shallow-vault/canopy source needed; current arch assets do not match this envelope' : 'No explicit compatible production-module contract; fallback retained', tuple(new Vector3().setFromMatrixPosition(p.matrix)));
  }
  // Consolidate single-source static jobs by owning parent/source. They still
  // swap atomically; chunk keys retain local frustum culling and per-instance LOD.
  const combined = new Map<string, BoundArchitectureGroup>(), result: BoundArchitectureGroup[] = [];
  for (const group of groups) {
    const ids = new Set(group.placements.map(p => p.assetId)), parents = new Set(group.placements.map(p => p.parent));
    if (ids.size !== 1 || parents.size !== 1) { result.push(group); continue; }
    const k = `${scopes.get(group.placements[0].parent as Group)}:${group.placements[0].assetId}`;
    const existing = combined.get(k);
    if (existing) { existing.targets.push(...group.targets); existing.placements.push(...group.placements); }
    else { const copy = { ...group, id: `auto-batch:${k}`, targets: [...group.targets], placements: [...group.placements] }; combined.set(k, copy); result.push(copy); }
  }
  // A batch can receive disjoint members from many logical objects; normalize
  // them into one target to make duplicate ownership checks unambiguous.
  for (const group of result) {
    const map = new Map<Mesh, Set<number> | undefined>();
    for (const t of group.targets) { if (!t.indices) map.set(t.mesh, undefined); else { const set = map.get(t.mesh) ?? new Set<number>(); t.indices.forEach(i => set.add(i)); map.set(t.mesh, set); } }
    group.targets = [...map].map(([mesh, indices]) => ({ mesh, ...(indices ? { indices: [...indices] } : {}) }));
  }
  return { groups: result, uncovered, informationPrimitives, delegatedPrimitives };
}
