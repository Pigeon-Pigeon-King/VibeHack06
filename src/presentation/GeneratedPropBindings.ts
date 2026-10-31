import { Group, type InstancedMesh, type Matrix4, type Object3D } from 'three';
import { SCENE_ASSETS, type SceneAssetId, type SceneAssetPlacement, type SceneAssetPoint } from '../assets/scene-asset-catalog';
import { readPortKitPrimitives, readPortKitSemantics, type PortKit } from './port-kit';

export interface GeneratedPropBinding {
  readonly id: string;
  /** Stable authored host: facts keep ownership of its visibility and transform. */
  readonly parent: Group;
  readonly placements: readonly SceneAssetPlacement[];
  readonly fallback: readonly Object3D[];
  readonly members?: readonly { mesh: InstancedMesh; indices: readonly number[] }[];
  readonly originMatrix?: Matrix4;
}

const bindings = new WeakMap<Group, GeneratedPropBinding[]>();

export function propPlacement(id: string, assetId: SceneAssetId, position: SceneAssetPoint,
  metres: number, axis: 'x' | 'y' | 'z' = 'z', yaw = 0): SceneAssetPlacement {
  return { id, assetId, position, size: { axis, metres }, yaw, role: 'replacement', support: 'authored prop host; original gameplay collision and state retained' };
}

/** Register before asynchronous model work. Hide only old children, never this state-owning host. */
export function bindGeneratedProp(parent: Group, id: string, placements: readonly SceneAssetPlacement[],
  fallback: readonly Object3D[] = [...parent.children]): Group {
  const current = bindings.get(parent) ?? [];
  if (current.some(binding => binding.id === id)) throw new Error(`Duplicate prop binding: ${id}`);
  current.push({ id, parent, placements, fallback: [...fallback] }); bindings.set(parent, current);
  parent.userData.generatedPropHost = true;
  parent.userData.generatedPropIds = current.flatMap(binding => binding.placements.map(placement => placement.assetId));
  return parent;
}

export function propSlot(kit: PortKit, id: string, placements: readonly SceneAssetPlacement[], build: (slot: PortKit) => void): Group {
  const host = kit.visualSlot(id, build);
  return bindGeneratedProp(host, id, placements);
}

/** Repeat intact leaf modules without stretching their thickness or rotating the complete gate as a motor. */
export function doorLeaves(id: string, center: SceneAssetPoint, width: number, height: number, yaw = Math.PI / 2): SceneAssetPlacement[] {
  const frame = SCENE_ASSETS['PROP-DOOR-LEAF'].sourceBounds;
  const leafWidth = (frame.max[2] - frame.min[2]) / (frame.max[1] - frame.min[1]) * height;
  const count = Math.max(1, Math.ceil(width / leafWidth));
  const step = count === 1 ? 0 : Math.max(0, (width - leafWidth) / (count - 1));
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - (count - 1) / 2) * step;
    return propPlacement(`${id}-leaf-${i}`, 'PROP-DOOR-LEAF',
      [center[0] + Math.sin(yaw) * offset, center[1], center[2] + Math.cos(yaw) * offset], height, 'y', yaw);
  });
}

export function benchRow(id: string, center: SceneAssetPoint, length: number, alongZ = false): SceneAssetPlacement[] {
  const count = Math.max(1, Math.round(length / 2)), step = length / count;
  return Array.from({ length: count }, (_, i) => propPlacement(`${id}-${i}`, 'PROP-BENCH',
    [center[0] + (alongZ ? 0 : (i - (count - 1) / 2) * step), center[1], center[2] + (alongZ ? (i - (count - 1) / 2) * step : 0)],
    step, 'z', alongZ ? 0 : Math.PI / 2));
}

export function cabinetRow(id: string, center: SceneAssetPoint, width: number, height: number): SceneAssetPlacement[] {
  const b = SCENE_ASSETS['PROP-SAMPLE-CABINET'].sourceBounds;
  const w = (b.max[0] - b.min[0]) / (b.max[1] - b.min[1]) * height;
  const count = Math.max(1, Math.floor(width / w)), step = width / count;
  return Array.from({ length: count }, (_, i) => propPlacement(`${id}-${i}`, 'PROP-SAMPLE-CABINET',
    [center[0] + (i - (count - 1) / 2) * step, center[1], center[2]], height, 'y'));
}

export function readGeneratedPropBindings(root: Group): GeneratedPropBinding[] {
  const result: GeneratedPropBinding[] = [];
  root.traverse(object => { if (object instanceof Group) result.push(...(bindings.get(object) ?? [])); });
  const primitives = readPortKitPrimitives(root);
  for (const entity of readPortKitSemantics(root)) {
    if (entity.kind !== 'tractor' && entity.kind !== 'terminal') continue;
    let owned = false;
    for (let parent: Object3D | null = entity.parent; parent; parent = parent.parent) {
      if (parent.userData.generatedSlot || parent.userData.generatedPropHost) { owned = true; break; }
      if (parent === root) break;
    }
    if (owned || !entity.members.length) continue;
    const id = `prop-${entity.kind}-${result.length}-${entity.id}`;
    const placement = entity.kind === 'tractor'
      ? propPlacement(id, 'PROP-VEH-TUG', [entity.args[0] as number, 0, entity.args[1] as number], 4.35, 'x', Math.PI / 2 + (entity.args[2] as number))
      : (() => { const at = entity.args[0] as SceneAssetPoint;
        // Keep the original narrow interaction-side footprint; this is a compact terminal variant.
        return propPlacement(id, 'PROP-TERMINAL-CONSOLE', [at[0] + 1.45, 1.1, at[2] - 0.30], 1.1, 'z', Math.PI / 2); })();
    const base = entity.kind === 'terminal' ? primitives.find(part => part.semantic === entity && part.kind === 'box' && part.surface === 'steel') : undefined;
    const members = entity.members.map(member => ({ mesh: member.mesh, indices: member.indices.filter(index => !(base?.mesh === member.mesh && base.index === index)) })).filter(member => member.indices.length);
    result.push({ id, parent: entity.parent, placements: [placement], fallback: [], members, originMatrix: entity.originMatrix });
  }
  return result;
}
