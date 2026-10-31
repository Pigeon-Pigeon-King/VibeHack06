import { AnimationClip, Bone, Group, Object3D, PropertyBinding, Quaternion, SkinnedMesh } from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CharacterAsset } from '../assets/character-catalog';
import type { CharacterCombatPose, CharacterModel } from '../contracts';
import type { CombatState } from '../actors/CombatTactics';
import type { ModelAcquireOptions } from '../assets/model-contracts';
import { TACTICAL_ASSETS, TACTICAL_CLIP_NAMES, TACTICAL_RIG_CONTRACTS, tacticalSource, type RigTransform, type TacticalClipName } from '../assets/tactical-catalog';

export interface TacticalAnimationLease { clips: Map<string, AnimationClip>; dispose(): void }
const epsilon = 2e-5;
const close = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && Math.abs(v - b[i]) <= epsilon);
function transform(node: Object3D, expected: RigTransform): void {
  if (!close(node.position.toArray(), expected.position) || !close(node.scale.toArray(), expected.scale)
    || node.quaternion.clone().normalize().angleTo(new Quaternion().fromArray(expected.quaternion).normalize()) > 1e-4) throw new Error(`战术动作参考姿势不匹配：${node.name}`);
}
function bones(root: Group): Map<string, Bone> {
  const result = new Map<string, Bone>();
  root.traverse(node => { if (node instanceof Bone) { if (result.has(node.name)) throw new Error('重复骨骼名称'); result.set(node.name, node); } });
  if (result.size !== 41) throw new Error('战术动作需要已记录的 41 骨');
  return result;
}

/** Call with the original bind-pose root, before normalization/mounting or sampling. */
export async function loadTacticalAnimations(library: ModelLibrary, asset: CharacterAsset, root: Group,
  options: ModelAcquireOptions & { baseURL?: string } = {}): Promise<TacticalAnimationLease> {
  const record = TACTICAL_ASSETS.find(item => item.id === asset.id), contract = TACTICAL_RIG_CONTRACTS[asset.id];
  if (!record || !contract || contract.schema !== 'ganymede.rig-binding-contract/1'
    || contract.sourceSHA256 !== asset.sourceSha256 || record.sourceSha256 !== asset.sourceSha256) throw new Error('战术动作源模型 SHA 不匹配');
  const target = bones(root);
  for (const expected of contract.bones) {
    const bone = target.get(expected.name);
    if (!bone || bone.parent?.name !== expected.parent) throw new Error(`战术骨架层级不匹配：${expected.name}`);
    transform(bone, expected);
  }
  const armature = target.get('Root')!.parent;
  if (!armature || armature.name !== 'Armature') throw new Error('缺少原始 Armature');
  transform(armature, contract.armature);
  const skins: SkinnedMesh[] = []; root.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node); });
  if (skins.length !== contract.skins.length) throw new Error('战术蒙皮数量不匹配');
  for (const expected of contract.skins) {
    const mesh = skins.find(item => item.name === expected.meshName);
    if (!mesh || mesh.skeleton.bones.length !== expected.joints.length || !close(mesh.bindMatrix.toArray(), expected.bindMatrix)) throw new Error('战术蒙皮绑定矩阵不匹配');
    transform(mesh, expected.meshTransform);
    const actual = new Map(mesh.skeleton.bones.map((bone, i) => [bone.name, mesh.skeleton.boneInverses[i]]));
    for (const joint of expected.joints) if (!actual.has(joint.name) || !close(actual.get(joint.name)!.toArray(), joint.inverseBindMatrix)) throw new Error(`战术逆绑定不匹配：${joint.name}`);
  }
  const lease = await library.acquire(tacticalSource(asset.id, options.baseURL), options);
  try {
    const metadata = lease.root.userData.ganymedeAnimation;
    if (metadata?.schema !== 'ganymede.tactical-animation/1' || metadata.bakedTargetAsset !== asset.id || metadata.bakedTargetSHA256 !== asset.sourceSha256) throw new Error('战术动作包身份不匹配');
    const reference = bones(lease.root);
    for (const expected of contract.bones) {
      const bone = reference.get(expected.name);
      if (!bone || bone.parent?.name !== expected.parent) throw new Error('战术包骨架层级不匹配');
      transform(bone, expected);
    }
    const clips = new Map<string, AnimationClip>();
    for (const original of lease.animations) {
      if (!TACTICAL_CLIP_NAMES.some(name => name === original.name) || clips.has(original.name) || original.tracks.length !== 123 || !(original.duration > 0)) throw new Error('战术动作片段异常');
      const seen = new Set<string>(), clip = original.clone();
      for (const track of clip.tracks) {
        const parsed = PropertyBinding.parseTrackName(track.name);
        if (!target.has(parsed.nodeName) || !['position', 'quaternion', 'scale'].includes(parsed.propertyName)) throw new Error(`非骨骼名称战术轨道：${track.name}`);
        const name = `${parsed.nodeName}.${parsed.propertyName}`;
        if (seen.has(name) || !track.values.every(Number.isFinite) || !track.times.every(Number.isFinite)) throw new Error('重复或无效战术轨道');
        seen.add(name); track.name = name; // CharacterClipSampler requires names, never instance UUIDs.
      }
      clips.set(clip.name, clip);
    }
    if (clips.size !== 17) throw new Error('战术动作包缺少片段');
    let disposed = false;
    return { clips, dispose() { if (disposed) return; disposed = true; lease.dispose(); clips.clear(); } };
  } catch (error) { lease.dispose(); throw error; }
}

type Pose = Parameters<CharacterModel['setPose']>[0];
export function characterCombatPose(combat?: CombatState): CharacterCombatPose | undefined {
  if (!combat) return undefined;
  const cover = combat.cover;
  const dx = cover ? combat.lastSeen[0] - cover.hide[0] : 0, dz = cover ? combat.lastSeen[2] - cover.hide[2] : 1;
  const lateral = cover ? (cover.peek[0] - cover.hide[0]) * dz - (cover.peek[2] - cover.hide[2]) * dx : 0;
  return { phase: combat.phase, moving: combat.moving, side: lateral >= 0 ? 'left' : 'right',
    coverKey: cover ? `${cover.solid}:${cover.hide.join(',')}` : undefined };
}
export interface TacticalSelection { name: TacticalClipName; time: number; loop: boolean; key: string }
type ObservedState = { time: number; crouched: boolean; cover?: string; phase?: string; side?: string };
/** A small, disposable presenter clock. It never advances on render delta or writes a save. */
export class TacticalPoseController {
  private previous?: ObservedState;
  private transition?: { name: TacticalClipName; at: number };
  private peekAt = 0;
  reset(): void { this.previous = undefined; this.transition = undefined; this.peekAt = 0; }

  select(pose: Pose, eligible: boolean, moving: boolean, running: number,
    duration: (name: TacticalClipName) => number): TacticalSelection | undefined {
    const now = pose.animationTime;
    if (!eligible || !Number.isFinite(now)) { this.reset(); return undefined; }
    const time = now!, combat = pose.combat;
    if (this.previous && time < this.previous.time) this.reset(); // retry/seek; never replay a stale shot
    // Approach crouching has its own down/up transition; entry begins on arrival at the actual slot.
    const inCover = !!combat?.coverKey && ['hide', 'peek', 'recover'].includes(combat.phase);
    const current: ObservedState = { time, crouched: !!pose.crouched, cover: inCover ? combat!.coverKey : undefined,
      phase: combat?.phase, side: combat?.side };
    const previous = this.previous;
    const oneShot = (name: TacticalClipName, at: number, offset = 0): TacticalSelection =>
      ({ name, time: Math.max(0, time - at + offset), loop: false, key: `${name}:${at}` });
    const loop = (name: TacticalClipName): TacticalSelection => ({ name, time, loop: true, key: name });
    if (previous) {
      if (current.cover && current.cover !== previous.cover) this.transition = { name: 'cover_enter', at: time };
      else if (!current.cover && previous.cover) this.transition = { name: 'cover_exit', at: time };
      else if (!current.cover && current.crouched !== previous.crouched) {
        this.transition = { name: current.crouched ? 'crouch_down' : 'stand_up', at: time };
      }
      if (current.cover && current.phase === 'peek' && (previous.phase !== 'peek' || previous.side !== current.side)) this.peekAt = time;
    } else this.peekAt = time;
    this.previous = current;
    // A real shot interrupts observation/entry. Aiming on its own never selects fire.
    if (inCover && combat!.phase === 'peek' && !combat!.moving && pose.armed !== false) {
      const side = combat!.side, shot = pose.lastShotAt;
      const fire = `cover_fire_${side}` as TacticalClipName;
      if (Number.isFinite(shot) && time >= shot! && time - shot! < duration(fire) - 0.055) {
        this.transition = undefined;
        return oneShot(fire, shot!, 0.055); // existing controller event coincides with authored recoil event
      }
      if (pose.aiming) { this.transition = undefined; return loop(`cover_aim_${side}`); }
    }
    if (inCover && combat!.phase === 'peek') {
      this.transition = undefined;
      const peek = `cover_peek_${combat!.side}` as TacticalClipName;
      if (time - this.peekAt < duration(peek)) return oneShot(peek, this.peekAt);
      return loop('cover_idle');
    }
    if (this.transition && time - this.transition.at < duration(this.transition.name)) {
      return oneShot(this.transition.name, this.transition.at);
    }
    this.transition = undefined;
    if (inCover) return loop('cover_idle');
    if (pose.crouched) return loop(moving ? 'crouch_walk' : 'crouch_idle');
    if (running >= 1) return loop('run');
    if (!moving) return loop(pose.armed ? 'ready_idle' : 'idle');
    return undefined; // ordinary walking stays on the user-approved canonical clip
  }
}
