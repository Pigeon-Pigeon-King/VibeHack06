import {
  AnimationClip, Bone, Box3, Matrix3, Matrix4, PropertyBinding, Quaternion, QuaternionKeyframeTrack,
  SkinnedMesh, Vector3, VectorKeyframeTrack, type Group, type Interpolant, type KeyframeTrack, type Object3D,
} from 'three';
import type { CharacterAsset } from '../assets/character-catalog';

export interface RigNode {
  name: string; parent?: string; bone: boolean;
  position: Vector3; quaternion: Quaternion; scale: Vector3; world: Matrix4;
}
export interface CharacterRig {
  nodes: RigNode[]; bones: Map<string, Bone>; bounds: Box3;
  forward: Vector3; origin: Vector3; legLength: number;
}
const identity = new Matrix4();

/** Capture the fresh GLB bind pose before an action, mount transform or procedural pose is applied. */
export function inspectCharacterRig(root: Group, requireSkin = true): CharacterRig {
  root.updateMatrixWorld(true);
  const nodes: RigNode[] = [], bones = new Map<string, Bone>(), bounds = new Box3();
  root.traverse(object => {
    const bone = object instanceof Bone;
    if (bone && bones.has(object.name)) throw new Error(`重复骨骼：${object.name}`);
    if (bone) bones.set(object.name, object);
    // Meshes are not ancestors of bones in this exact production batch.
    if (!(object instanceof SkinnedMesh)) nodes.push({ name: object.name, parent: object === root ? undefined : object.parent?.name,
      bone, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), world: object.matrixWorld.clone() });
    if (object instanceof SkinnedMesh) {
      if (object.skeleton.bones.length !== 41) throw new Error('人物不是已审核的 41 骨绑定。');
      for (let i = 0; i < 41; i++) {
        const bind = object.skeleton.bones[i].matrixWorld.clone().multiply(object.skeleton.boneInverses[i]);
        if (bind.elements.some((value, j) => !Number.isFinite(value) || Math.abs(value - identity.elements[j]) > 0.0001)) {
          throw new Error('人物节点并非原始绑定姿势。');
        }
      }
      object.computeBoundingBox();
      bounds.union(object.boundingBox!.clone().applyMatrix4(object.matrixWorld));
    }
  });
  if (bones.size !== 41 || (requireSkin && bounds.isEmpty())) throw new Error('人物绑定或蒙皮缺失。');
  const at = (name: string) => {
    const bone = bones.get(name); if (!bone) throw new Error(`缺少关节：${name}`);
    return bone.getWorldPosition(new Vector3());
  };
  const forward = at('L_ToeBase').sub(at('L_Foot')).add(at('R_ToeBase').sub(at('R_Foot'))); forward.y = 0; forward.normalize();
  // These generated meshes and the canonical travel both face source +X.
  if (forward.x < 0.98) throw new Error('人物朝向不属于已审核的 +X 原始坐标。');
  const origin = at('L_Foot').add(at('R_Foot')).multiplyScalar(0.5); origin.y = bounds.isEmpty() ? 0 : bounds.min.y;
  const legLength = (at('L_Thigh').distanceTo(at('L_Calf')) + at('L_Calf').distanceTo(at('L_Foot'))
    + at('R_Thigh').distanceTo(at('R_Calf')) + at('R_Calf').distanceTo(at('R_Foot'))) / 2;
  return { nodes, bones, bounds, forward, origin, legLength };
}

const clips = new WeakMap<AnimationClip, Map<string, AnimationClip>>();
const qAt = (matrix: Matrix4) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix)).normalize();
const compose = (node: RigNode) => new Matrix4().compose(node.position, node.quaternion, node.scale);

/**
 * Runtime extension of the production viewer's canonical-adapter.js method.
 * The original canonical whitelist remains untouched. The runtime catalog pins
 * each target revision; tests audit every target, including the child's own rig.
 * Output tracks use unique bone names, so buffers can be shared by independent mixers.
 */
export function retargetCharacterWalk(clip: AnimationClip, source: CharacterRig, target: CharacterRig, asset: CharacterAsset): AnimationClip {
  const cached = clips.get(clip)?.get(asset.sha256); if (cached) return cached;
  const sourceByName = new Map(source.nodes.map(node => [node.name, node]));
  const targetBones = target.nodes.filter(node => node.bone);
  for (const bone of targetBones) {
    const original = sourceByName.get(bone.name);
    if (!original?.bone || bone.parent !== original.parent) throw new Error(`骨架层级不匹配：${bone.name}`);
  }
  const tracks = new Map<string, Interpolant>(), times = new Set<number>([0, clip.duration]);
  for (const track of clip.tracks) {
    const parsed = PropertyBinding.parseTrackName(track.name), key = `${parsed.nodeName}.${parsed.propertyName}`;
    if (!source.bones.has(parsed.nodeName) || !['position', 'quaternion', 'scale'].includes(parsed.propertyName) || tracks.has(key)) throw new Error(`非 canonical 轨道：${track.name}`);
    tracks.set(key, (track as KeyframeTrack & { createInterpolant(): Interpolant }).createInterpolant());
    for (const time of track.times) times.add(time);
  }
  if (tracks.size !== 123) throw new Error('canonical 行走必须保留 123 条骨骼轨道。');
  const samples = [...times].sort((a, b) => a - b).filter((time, i, values) => !i || time - values[i - 1] > 1e-6);
  const output = new Map(targetBones.map(node => [node.name, { position: [] as number[], quaternion: [] as number[], scale: [] as number[], last: undefined as Quaternion | undefined }]));
  // Child motion retains child bone lengths. Its hip/translation residuals use
  // its own leg ratio; no adult skeleton, bind matrices or mesh are transplanted.
  const translationRatio = asset.bodyPlan === 'child' ? target.legLength / source.legLength : 1;
  for (const time of samples) {
    const sourceWorld = new Map<string, Matrix4>(), sourceLocal = new Map<string, { position: Vector3; scale: Vector3 }>();
    for (const node of source.nodes) {
      const position = new Vector3().fromArray(tracks.get(`${node.name}.position`)?.evaluate(time) ?? node.position.toArray());
      const quaternion = new Quaternion().fromArray(tracks.get(`${node.name}.quaternion`)?.evaluate(time) ?? node.quaternion.toArray()).normalize();
      const scale = new Vector3().fromArray(tracks.get(`${node.name}.scale`)?.evaluate(time) ?? node.scale.toArray());
      sourceLocal.set(node.name, { position, scale });
      sourceWorld.set(node.name, (sourceWorld.get(node.parent ?? '') ?? identity).clone().multiply(new Matrix4().compose(position, quaternion, scale)));
    }
    const targetWorld = new Map<string, Matrix4>();
    for (const node of target.nodes) {
      const parent = targetWorld.get(node.parent ?? '') ?? identity;
      if (!node.bone) { targetWorld.set(node.name, parent.clone().multiply(compose(node))); continue; }
      const original = sourceByName.get(node.name)!, originalLocal = sourceLocal.get(node.name)!;
      const worldQ = qAt(sourceWorld.get(node.name)!).multiply(qAt(original.world).invert()).multiply(qAt(node.world)).normalize();
      const quaternion = qAt(parent).invert().multiply(worldQ).normalize();
      const delta = originalLocal.position.clone().sub(original.position).multiplyScalar(translationRatio);
      delta.applyMatrix3(new Matrix3().setFromMatrix4(sourceWorld.get(original.parent ?? '') ?? identity));
      delta.applyMatrix3(new Matrix3().setFromMatrix4(parent.clone().invert()));
      const position = node.position.clone().add(delta), scale = node.scale.clone().multiply(originalLocal.scale).divide(original.scale);
      const out = output.get(node.name)!;
      if (out.last && out.last.dot(quaternion) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
      out.position.push(...position.toArray()); out.quaternion.push(...quaternion.toArray()); out.scale.push(...scale.toArray()); out.last = quaternion;
      targetWorld.set(node.name, parent.clone().multiply(new Matrix4().compose(position, quaternion, scale)));
    }
  }
  const result: KeyframeTrack[] = [];
  for (const [name, data] of output) {
    if (![...data.position, ...data.quaternion, ...data.scale].every(Number.isFinite)) throw new Error('行走适配产生无效变换。');
    result.push(new VectorKeyframeTrack(`${name}.position`, samples, data.position), new QuaternionKeyframeTrack(`${name}.quaternion`, samples, data.quaternion), new VectorKeyframeTrack(`${name}.scale`, samples, data.scale));
  }
  const adapted = new AnimationClip(`walk_in_place:${asset.id}`, clip.duration, result);
  let cache = clips.get(clip); if (!cache) { cache = new Map(); clips.set(clip, cache); }
  cache.set(asset.sha256, adapted);
  return adapted;
}

/** Restore only instance transforms. Shared geometry/materials/texture objects are never edited. */
export function restoreCharacterRig(rig: CharacterRig): void {
  for (const node of rig.nodes) {
    const bone = rig.bones.get(node.name); if (!bone) continue;
    bone.position.copy(node.position); bone.quaternion.copy(node.quaternion); bone.scale.copy(node.scale);
  }
}

/** Bone directions are expressed in the game's +Z-forward character frame. */
export class CharacterBonePoser {
  private rest = new Map<string, RigNode>();
  private sourceToGame = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  private gameToSource = this.sourceToGame.clone().invert();
  constructor(private root: Object3D, private rig: CharacterRig) { for (const node of rig.nodes) this.rest.set(node.name, node); }

  aim(name: string, child: string, direction: Vector3): void {
    const rootQ = this.root.getWorldQuaternion(new Quaternion());
    this.aimWorld(name, child, direction.clone().applyQuaternion(this.gameToSource).applyQuaternion(rootQ));
  }
  private aimWorld(name: string, child: string, worldDirection: Vector3): void {
    const rest = this.rest.get(name)!, end = this.rest.get(child)!;
    const initial = new Vector3().setFromMatrixPosition(end.world).sub(new Vector3().setFromMatrixPosition(rest.world)).normalize();
    const rootQ = this.root.getWorldQuaternion(new Quaternion());
    const localDirection = worldDirection.clone().applyQuaternion(rootQ.clone().invert()).normalize();
    const rotation = new Quaternion().setFromUnitVectors(initial, localDirection).multiply(qAt(rest.world));
    this.worldRotation(name, rootQ.multiply(rotation));
  }
  private worldRotation(name: string, quaternion: Quaternion): void {
    const bone = this.rig.bones.get(name)!;
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(quaternion).normalize());
    bone.updateWorldMatrix(false, true);
  }
  head(yaw: number, pitch: number): void {
    const bone = this.rig.bones.get('Head')!;
    const rootQ = this.root.getWorldQuaternion(new Quaternion());
    const current = rootQ.clone().invert().multiply(bone.getWorldQuaternion(new Quaternion()));
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    const nod = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0).applyQuaternion(this.gameToSource), pitch);
    this.worldRotation('Head', rootQ.multiply(turn).multiply(nod).multiply(current));
  }
  side(name: string): number {
    const point = new Vector3().setFromMatrixPosition(this.rest.get(name)!.world).sub(this.rig.origin).applyQuaternion(this.sourceToGame);
    return Math.sign(point.x) || 1;
  }
  /** Analytic two-link knee bend, keeping the authored ankle target and segment lengths. */
  leg(side: 'L' | 'R', target: Vector3, pole: Vector3): void {
    const thigh = this.rig.bones.get(`${side}_Thigh`)!, calf = this.rig.bones.get(`${side}_Calf`)!, foot = this.rig.bones.get(`${side}_Foot`)!;
    const hip = thigh.getWorldPosition(new Vector3()), knee = calf.getWorldPosition(new Vector3()), ankle = foot.getWorldPosition(new Vector3());
    const a = hip.distanceTo(knee), b = knee.distanceTo(ankle), direction = target.clone().sub(hip);
    const distance = Math.max(Math.abs(a - b) + 1e-5, Math.min(a + b - 1e-5, direction.length())); direction.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
    const desiredKnee = hip.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    this.aimWorld(thigh.name, calf.name, desiredKnee.sub(hip));
    this.aimWorld(calf.name, foot.name, target.clone().sub(calf.getWorldPosition(new Vector3())));
    this.worldRotation(foot.name, this.root.getWorldQuaternion(new Quaternion()).multiply(qAt(this.rest.get(foot.name)!.world)));
  }
}
