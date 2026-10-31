import { Bone, Box3, Group, MathUtils, Matrix4, Mesh, Quaternion, SkinnedMesh, Sphere, Vector3 } from 'three';
import type { CharacterModel } from '../contracts';
import { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelLoadProgress } from '../assets/model-contracts';
import { canonicalWalkSource, characterAssetFor, characterSource, type CharacterAsset, type CharacterIdentity } from '../assets/character-catalog';
import { ak47Source } from '../assets/weapon-catalog';
import { TACTICAL_HAND_CALIBRATIONS, TACTICAL_WEAPON_CALIBRATION } from '../assets/tactical-catalog';
import { createCharacter } from './characters';
import { CharacterBonePoser, CharacterClipSampler, inspectCharacterRig, restoreCharacterRig, retargetCharacterWalk, type CharacterRig } from './CharacterRig';
import { sampleCharacterGait } from './CharacterMotion';
import { loadTacticalAnimations, TacticalPoseController, type TacticalAnimationLease } from './TacticalAnimations';
import { attachWorldAK47, type WorldAK47Attachment } from './WorldAK47';

type Pose = Parameters<CharacterModel['setPose']>[0] & { moveSpeed?: number; reloadFraction?: number; animationTime?: number };
export interface CharacterLoadStatus {
  state: 'loading' | 'ready' | 'error' | 'placeholder';
  assetId?: string; message?: string; progress?: ModelLoadProgress;
}
interface LoadedCharacter {
  model: ModelLease; animation: ModelLease; rig: CharacterRig; poser: CharacterBonePoser; walk: CharacterClipSampler;
  scale: number; strideMeters: number; downLift: number; feet: Map<'L' | 'R', Vector3>;
  tactical?: TacticalAnimationLease; tacticalSamplers: Map<string, CharacterClipSampler>;
  headBounds: Box3;
}
const up = new Vector3(0, 1, 0);
const number = (value: number | undefined, fallback = 0) => value !== undefined && Number.isFinite(value) ? value : fallback;
type BonePose = { position: Vector3; quaternion: Quaternion; scale: Vector3 };
const armBone = (name: string) => /^[LR]_(Clavicle|Upperarm|Forearm|Hand)/.test(name);
const sourceForwardToGame = new Quaternion().setFromAxisAngle(up, -Math.PI / 2);
function worldRotation(bone: Bone, quaternion: Quaternion): void {
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(quaternion).normalize());
  bone.updateWorldMatrix(false, true);
}
function pointBone(bone: Bone, child: Bone, target: Vector3): void {
  const origin = bone.getWorldPosition(new Vector3());
  const before = child.getWorldPosition(new Vector3()).sub(origin).normalize(), after = target.clone().sub(origin).normalize();
  worldRotation(bone, new Quaternion().setFromUnitVectors(before, after).multiply(bone.getWorldQuaternion(new Quaternion())));
}

/** Stable-path hand contact only: no tactical pack is enabled for a risky body. */
function fitStableWeaponHands(root: Group, rig: CharacterRig, assetId: string): void {
  const calibration = TACTICAL_HAND_CALIBRATIONS[assetId]; if (!calibration) return;
  root.updateWorldMatrix(true, true);
  const frame = root.getWorldQuaternion(new Quaternion()).multiply(sourceForwardToGame);
  const right = rig.bones.get('R_Hand')!, left = rig.bones.get('L_Hand')!, upper = rig.bones.get('L_Upperarm')!, forearm = rig.bones.get('L_Forearm')!;
  worldRotation(right, frame.clone().multiply(new Quaternion().fromArray(calibration.rightHandToWeaponQuaternion).invert()));
  const target = new Vector3().fromArray(TACTICAL_WEAPON_CALIBRATION.supportFromGripMeters).applyQuaternion(frame).add(right.getWorldPosition(new Vector3()));
  const shoulder = upper.getWorldPosition(new Vector3()), elbow = forearm.getWorldPosition(new Vector3()), hand = left.getWorldPosition(new Vector3());
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(hand), direction = target.clone().sub(shoulder);
  const length = MathUtils.clamp(direction.length(), Math.abs(a - b) + 1e-5, a + b - 1e-5); direction.normalize();
  const along = (a * a - b * b + length * length) / (2 * length);
  const pole = new Vector3(0.35, -1, 0.2).applyQuaternion(root.getWorldQuaternion(new Quaternion()));
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const bend = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  pointBone(upper, forearm, bend); pointBone(forearm, left, target);
  worldRotation(left, frame.clone().multiply(new Quaternion().fromArray(calibration.leftHandGripWorldQuaternion)));
}

/** Shoulder contact overrides only arm rotations, after clip blending; pelvis/legs/trunk keep their sampled tracks. */
function fitShoulderedWeapon(root: Group, rig: CharacterRig, assetId: string, weapon: WorldAK47Attachment, preserveAim: boolean, headBounds: Box3): void {
  const calibration = TACTICAL_HAND_CALIBRATIONS[assetId], offsets = weapon.gripOffsets;
  if (!calibration || !offsets) return;
  root.updateMatrixWorld(true);
  const rootQ = root.getWorldQuaternion(new Quaternion()), right = rig.bones.get('R_Hand')!, left = rig.bones.get('L_Hand')!;
  const frame = preserveAim ? right.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().fromArray(calibration.rightHandToWeaponQuaternion))
    : rootQ.clone().multiply(sourceForwardToGame);
  const forward = new Vector3(1, 0, 0).applyQuaternion(frame).normalize();
  const actualShoulder = rig.bones.get('R_Upperarm')!.getWorldPosition(new Vector3()), inverseRoot = root.matrixWorld.clone().invert();
  const shoulderLocal = actualShoulder.clone().applyMatrix4(inverseRoot).add(new Vector3(-.025, .01, .015));
  const headFrame = new Matrix4().multiplyMatrices(inverseRoot, rig.bones.get('Head')!.matrixWorld);
  const envelope = headBounds.clone().applyMatrix4(headFrame), directionLocal = forward.clone().applyQuaternion(rootQ.clone().invert());
  const headTravel = Math.max(0, envelope.max.z - shoulderLocal.z);
  // Original helmet/head size varies by identity. Keep the rifle's upper
  // receiver outside that measured envelope, rather than assuming one head width.
  const headSide = envelope.min.x - .05 - Math.max(0, directionLocal.x / Math.max(.5, directionLocal.z)) * headTravel;
  const outside = shoulderLocal.clone(); outside.x = Math.min(outside.x, headSide);
  const below = shoulderLocal.clone(); below.y = Math.min(below.y, envelope.min.y - .11 - Math.max(0, directionLocal.y) * headTravel);
  const originalShoulderLocal = actualShoulder.clone().applyMatrix4(inverseRoot);
  // Wide helmets may need a slightly lower shoulder seat instead of moving
  // the entire rifle far out from the deltoid. Choose the nearer safe seat.
  shoulderLocal.copy(originalShoulderLocal.distanceTo(outside) <= originalShoulderLocal.distanceTo(below) ? outside : below);
  const shoulder = shoulderLocal.applyMatrix4(root.matrixWorld);
  const grip = shoulder.clone().sub(offsets.stock.clone().applyQuaternion(frame));
  const solve = (side: 'L' | 'R', target: Vector3) => {
    const upper = rig.bones.get(`${side}_Upperarm`)!, lower = rig.bones.get(`${side}_Forearm`)!, hand = rig.bones.get(`${side}_Hand`)!;
    const start = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3()), wrist = hand.getWorldPosition(new Vector3());
    const a = start.distanceTo(elbow), b = elbow.distanceTo(wrist), direction = target.clone().sub(start);
    const distance = MathUtils.clamp(direction.length(), Math.abs(a - b) + 1e-5, a + b - 1e-5); direction.normalize();
    // In the +Z-forward character frame anatomical right is -X.
    const pole = new Vector3(side === 'L' ? .65 : -.65, -1, -.15).applyQuaternion(rootQ);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const bend = start.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    pointBone(upper, lower, bend); pointBone(lower, hand, target);
    return hand.getWorldPosition(new Vector3()).distanceTo(target);
  };
  const rightError = solve('R', grip);
  worldRotation(right, frame.clone().multiply(new Quaternion().fromArray(calibration.rightHandToWeaponQuaternion).invert()));
  const support = right.getWorldPosition(new Vector3()).add(offsets.support.clone().applyQuaternion(frame));
  const rearSupport = right.getWorldPosition(new Vector3()).add(offsets.supportRear.clone().applyQuaternion(frame));
  // Protract the left clavicle only as much as the fixed arm needs to reach
  // across the chest. The shoulder segment is rotated, never lengthened.
  const clavicle = rig.bones.get('L_Clavicle')!, upper = rig.bones.get('L_Upperarm')!, lower = rig.bones.get('L_Forearm')!;
  const clavicleAt = clavicle.getWorldPosition(new Vector3()), upperAt = upper.getWorldPosition(new Vector3());
  const reach = upperAt.distanceTo(lower.getWorldPosition(new Vector3())) + lower.getWorldPosition(new Vector3()).distanceTo(left.getWorldPosition(new Vector3()));
  const restQ = clavicle.quaternion.clone();
  const protract = (target: Vector3) => {
    clavicle.quaternion.copy(restQ); clavicle.updateWorldMatrix(false, true);
    if (upperAt.distanceTo(target) <= reach * .98) return upperAt.distanceTo(target);
    const initial = upperAt.clone().sub(clavicleAt).normalize(), desired = target.clone().sub(clavicleAt).normalize();
    const turn = new Quaternion().setFromUnitVectors(initial, desired), angle = initial.angleTo(desired);
    const maxFraction = angle > 1e-6 ? Math.min(1, .80 / angle) : 0;
    const apply = (fraction: number) => {
      clavicle.quaternion.copy(restQ); clavicle.updateWorldMatrix(false, true);
      const direction = initial.clone().applyQuaternion(new Quaternion().slerp(turn, fraction));
      pointBone(clavicle, upper, clavicleAt.clone().add(direction));
      return upper.getWorldPosition(new Vector3()).distanceTo(target);
    };
    let low = 0, high = maxFraction;
    if (apply(high) <= reach * .98) for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2; if (apply(middle) > reach * .98) low = middle; else high = middle;
    }
    return apply(high);
  };
  let supportFraction = 0;
  if (protract(support) > reach * .98) {
    // Shorter limbs may grip nearer the rear of the same measured wooden
    // foregrip. Do not stretch a bone or move a hand into empty space.
    let low = 0, high = 1;
    if (protract(rearSupport) <= reach * .98) for (let i = 0; i < 10; i++) {
      const middle = (low + high) / 2;
      if (protract(support.clone().lerp(rearSupport, middle)) > reach * .98) low = middle; else high = middle;
    }
    supportFraction = high; support.lerp(rearSupport, high); protract(support);
  }
  weapon.setSupportFraction(supportFraction);
  const leftError = solve('L', support);
  worldRotation(left, frame.clone().multiply(new Quaternion().fromArray(calibration.leftHandGripWorldQuaternion)));
  root.updateMatrixWorld(true);
  const stock = root.getObjectByName('ganymede-stock-contact')?.getWorldPosition(new Vector3());
  root.userData.shoulderContact = { rightErrorMeters: rightError, leftErrorMeters: leftError,
    stockShoulderErrorMeters: stock?.distanceTo(shoulder), shoulderOffsetMeters: actualShoulder.distanceTo(shoulder), supportFraction, shoulder: shoulder.toArray(), forward: forward.toArray(),
    constraint: 'original stock rear face at right shoulder; fixed arm lengths; no weapon-only translation', visualAcceptance: 'NOT_REVIEWED' };
}

/** Sync CharacterModel with a real asynchronous view replacement. The game owns the outer root and simulation. */
export class ImportedCharacter implements CharacterModel {
  readonly root = new Group();
  /** Settles after the current attempt; failures are reported as status and retain the procedural fallback. */
  ready: Promise<void> = Promise.resolve();
  private readonly fallback: CharacterModel;
  private readonly fallbackBodies: Mesh[] = [];
  private readonly posture = new Group();
  private readonly mount = new Group();
  private readonly asset?: CharacterAsset;
  private readonly weaponRoot?: Group;
  private weapon?: WorldAK47Attachment;
  private loaded?: LoadedCharacter;
  private controller?: AbortController;
  private generation = 0;
  private disposed = false;
  private pose: Pose = { walk: 0, aiming: false, down: false };
  private readonly tacticalPose = new TacticalPoseController();
  private readonly previousBones = new Map<string, BonePose>();
  private blendFrom?: Map<string, BonePose>;
  private blendAt = 0;
  private sampleTime = -Infinity;
  private selectionKey?: string;

  constructor(private readonly library: ModelLibrary, readonly identity: CharacterIdentity, private readonly baseURL: string,
    private readonly onStatus: (status: CharacterLoadStatus) => void = () => {}) {
    this.asset = characterAssetFor(identity);
    const fallbackRole = identity.id.startsWith('hall-invader-') ? 'enemy' : identity.role;
    this.fallback = createCharacter(fallbackRole);
    this.root.name = `imported-character-${identity.id}`;
    this.root.userData.forward = '+Z'; this.root.userData.assetId = this.asset?.id;
    this.root.userData.identity = { ...identity };
    this.posture.name = 'imported-character-posture'; this.mount.name = 'imported-character-calibration';
    this.posture.add(this.mount); this.root.add(this.fallback.root, this.posture);
    this.fallback.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      let parent = object.parent, weapon = false;
      while (parent && parent !== this.fallback.root) {
        if (parent.name === 'carbine-placeholder' || parent.name === 'sidearm-placeholder') weapon = true;
        parent = parent.parent;
      }
      if (!weapon) this.fallbackBodies.push(object);
    });
    // Only the NPC fallback's gun socket is eligible. Never visit the first-person viewmodel.
    const weapon = this.fallback.root.getObjectByName('carbine-placeholder') ?? this.fallback.root.getObjectByName('sidearm-placeholder');
    if (weapon instanceof Group) { this.weaponRoot = weapon; this.attachWeapon(); }
    this.ready = this.load();
  }

  /** Independent of character-rig readiness: weapon failure retains the original visible gun. */
  get worldWeapon(): WorldAK47Attachment | undefined { return this.weapon; }
  private attachWeapon(): void {
    if (this.weaponRoot) this.weapon = attachWorldAK47(this.weaponRoot, { library: this.library, source: ak47Source(this.baseURL) });
  }

  private notify(status: CharacterLoadStatus): void {
    this.root.userData.assetStatus = status.state;
    try { this.onStatus({ assetId: this.asset?.id, ...status }); } catch { /* Observers do not own model loading. */ }
  }
  private current(generation: number, signal: AbortSignal): boolean { return !this.disposed && generation === this.generation && !signal.aborted; }
  private releaseLoaded(): void {
    this.weapon?.bindToHand();
    this.tacticalPose.reset(); this.previousBones.clear(); this.blendFrom = undefined; this.selectionKey = undefined; this.sampleTime = -Infinity;
    const loaded = this.loaded; this.loaded = undefined;
    if (loaded) {
      // Borrowed GLB subtrees never enter the procedural fallback's dispose traversal.
      loaded.model.root.removeFromParent(); loaded.model.dispose(); loaded.animation.dispose(); loaded.tactical?.dispose();
    }
    this.mount.clear();
    for (const mesh of this.fallbackBodies) mesh.visible = true;
  }

  private async load(): Promise<void> {
    this.controller?.abort(); this.releaseLoaded();
    if (this.disposed) return;
    if (!this.asset) { this.notify({ state: 'placeholder' }); return; }
    const asset = this.asset, generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    const acquired = new Set<ModelLease>();
    const acquire = async (source: ReturnType<typeof characterSource>) => {
      const lease = await this.library.acquire(source, { signal: controller.signal, onProgress: progress => {
        if (this.current(generation, controller.signal)) this.notify({ state: 'loading', message: '人物载入中', progress });
      } });
      // Includes the already-resolved Promise / not-yet-run continuation window.
      if (!this.current(generation, controller.signal)) { lease.dispose(); return undefined; }
      acquired.add(lease); return lease;
    };
    this.notify({ state: 'loading', message: '人物载入中' });
    let tactical: TacticalAnimationLease | undefined;
    try {
      const [model, animation] = await Promise.all([acquire(characterSource(asset, this.baseURL)), acquire(canonicalWalkSource(this.baseURL))]);
      if (!this.current(generation, controller.signal) || !model || !animation) { for (const lease of acquired) lease.dispose(); return; }
      const metadata = animation.root.userData.ganymedeAnimation;
      if (metadata?.schema !== 'ganymede.shared-animation/1' || metadata.referenceAsset !== 'CH-LU'
        || !Array.isArray(metadata.rootMotion?.travel) || !metadata.rootMotion.travel.every(Number.isFinite)) throw new Error('不是本批已转换的 canonical 行走。');
      const source = inspectCharacterRig(animation.root, false), rig = inspectCharacterRig(model.root);
      const headBounds = new Box3(), inverseHead = rig.bones.get('Head')!.matrixWorld.clone().invert();
      model.root.traverse(object => {
        if (!(object instanceof SkinnedMesh)) return;
        const joints = object.geometry.getAttribute('skinIndex'), weights = object.geometry.getAttribute('skinWeight'), point = new Vector3();
        for (let i = 0; i < weights.count; i++) {
          let influence = 0;
          for (let j = 0; j < 4; j++) if (object.skeleton.bones[joints.getComponent(i, j)].name === 'Head') influence += weights.getComponent(i, j);
          if (influence >= .5) headBounds.expandByPoint(object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld).applyMatrix4(inverseHead));
        }
      });
      if (headBounds.isEmpty()) throw new Error('人物缺少可测量的头部蒙皮。');
      // These bodies use the stable path below, so do not fetch unused packs for
      // every civilian or child when a crowd enters the level.
      if (asset.bodyPlan === 'adult' && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(asset.id)) {
        try { tactical = await loadTacticalAnimations(this.library, asset, model.root, { baseURL: this.baseURL, signal: controller.signal }); }
        catch { this.root.userData.tacticalStatus = 'optional-load-failed-stable-fallback'; }
      }
      if (!this.current(generation, controller.signal)) { tactical?.dispose(); for (const lease of acquired) lease.dispose(); return; }
      const original = animation.animations.find(clip => clip.name === 'walk_in_place');
      if (!original) throw new Error('缺少原地行走片段。');
      const clip = retargetCharacterWalk(original, source, rig, asset);
      const height = rig.bounds.getSize(new Vector3()).y;
      if (height < 0.8 || height > 1.2) throw new Error('原始人物单位不符合本批归一化尺寸。');
      const scale = asset.heightMeters / height;
      this.mount.scale.setScalar(scale); this.mount.rotation.set(0, -Math.PI / 2, 0);
      this.mount.position.copy(rig.origin).multiplyScalar(-scale).applyAxisAngle(up, -Math.PI / 2); this.mount.updateMatrix();
      model.root.traverse(object => {
        if (object instanceof SkinnedMesh) {
          object.castShadow = true; object.receiveShadow = true;
          // Instance-owned conservative bound avoids first-frame A-pose culling during large poses.
          object.boundingSphere = new Sphere(rig.bounds.getCenter(new Vector3()), height * 1.2);
        }
      });
      const feet = new Map<'L' | 'R', Vector3>();
      for (const side of ['L', 'R'] as const) feet.set(side, rig.bones.get(`${side}_Foot`)!.getWorldPosition(new Vector3()).applyMatrix4(this.mount.matrix));
      const strideMeters = new Vector3().fromArray(metadata.rootMotion.travel).length() * scale
        * (asset.bodyPlan === 'child' ? rig.legLength / source.legLength : 1);
      if (!(strideMeters > 0.2 && strideMeters < 5)) throw new Error('行走步幅不符合人物尺度。');
      this.mount.add(model.root);
      this.root.updateMatrixWorld(true);
      this.weapon?.bindToHand(rig.bones.get('R_Hand')!, TACTICAL_HAND_CALIBRATIONS[asset.id]?.rightHandToWeaponQuaternion);
      this.loaded = { model, animation, rig, poser: new CharacterBonePoser(model.root, rig), walk: new CharacterClipSampler(clip, rig),
        headBounds,
        tactical, tacticalSamplers: new Map(tactical ? [...tactical.clips].map(([name, clip]) => [name, new CharacterClipSampler(clip, rig)]) : []),
        scale, strideMeters, downLift: rig.bounds.clone().applyMatrix4(this.mount.matrix).max.z, feet };
      acquired.clear();
      for (const mesh of this.fallbackBodies) mesh.visible = false;
      this.root.userData.calibration = { heightMeters: asset.heightMeters, sourceForward: '+X', forward: '+Z', scale, strideMeters,
        legLengthMeters: rig.legLength * scale,
        bodyPlan: asset.bodyPlan, rigBones: 41, walkTracks: clip.tracks.length, retarget: 'target-rest-world-delta',
        animationClips: tactical ? [...tactical.clips.keys()] : ['walk_in_place'], proceduralActions: ['run', 'crouch-walk', 'aim', 'reload', 'kneel', 'carry', 'care', 'fall'],
        contactAnimation: 'authored tactical poses and measured hand socket; procedural care/fall; visual review pending' };
      this.setPose(this.pose);
      this.notify({ state: 'ready' });
    } catch (error) {
      const active = this.current(generation, controller.signal); controller.abort(); tactical?.dispose();
      for (const lease of acquired) lease.dispose();
      if (!active) return;
      this.releaseLoaded(); this.fallback.setPose(this.pose);
      console.warn(`人物 ${asset.id} 载入失败`, error);
      this.notify({ state: 'error', message: '人物载入失败' });
    }
  }

  setPose(pose: Pose): void {
    if (this.disposed) return;
    this.pose = { ...pose }; this.fallback.setPose(pose);
    const weaponVisible = (pose.armed ?? ['ally', 'enemy', 'opponent'].includes(this.identity.role))
      && !pose.down && !pose.carrying && !pose.care && !pose.restrained;
    this.weapon?.setVisible(weaponVisible); this.weapon?.setShot(number(pose.animationTime), pose.lastShotAt);
    const loaded = this.loaded; if (!loaded) return;
    const { rig, poser, model, feet } = loaded;
    restoreCharacterRig(rig);
    const walk = number(pose.walk), down = pose.down, crouched = !down && !!pose.crouched, kneeling = !!pose.kneeling;
    const armed = pose.armed ?? ['ally', 'enemy', 'opponent'].includes(this.identity.role);
    const fall = down ? MathUtils.clamp(number(pose.fallProgress, 1), 0, 1) : 0;
    const support = MathUtils.clamp((fall - (kneeling ? 0.12 : 0)) / (kneeling ? 0.88 : 1), 0, 1);
    const fallEase = support * support * (3 - 2 * support), bodyHeight = this.asset!.heightMeters;
    const moving = !down && !kneeling && (pose.moveSpeed === undefined ? walk !== 0 : number(pose.moveSpeed) > 0.03);
    const running = moving && !crouched ? MathUtils.smoothstep(number(pose.moveSpeed), 2.6, 3.8) : 0;
    const gait = moving && (crouched || running > 0) ? sampleCharacterGait(walk / 4, bodyHeight, crouched ? 'crouch' : 'run', rig.legLength * loaded.scale) : undefined;
    const reload = !down && armed && !pose.carrying && !pose.care && !pose.restrained ? MathUtils.clamp(number(pose.reloadFraction), 0, 1) : 0;
    const reloading = reload > 0 && reload < 1;
    // Keep the high-strain identities and child on their existing stable path.
    const tacticalEligible = Number.isFinite(pose.animationTime) && this.asset!.bodyPlan === 'adult'
      && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(this.asset!.id)
      && pose.tacticalEnabled !== false
      && !down && !kneeling && !pose.care && !pose.carrying && !pose.restrained && !reloading
      && number(pose.reaching) === 0 && number(pose.gesture) === 0;
    const selection = this.tacticalPose.select({ ...pose, armed }, tacticalEligible, moving, running,
      name => loaded.tacticalSamplers.get(name)?.duration ?? 0);
    const tacticalName = selection?.name;
    const tacticalSampler = tacticalName ? loaded.tacticalSamplers.get(tacticalName) : undefined;
    const authoredBody = !!tacticalSampler && tacticalName !== 'idle' && tacticalName !== 'run';
    const sharedCrouch = !!tacticalSampler && (crouched || authoredBody), sharedRun = !!tacticalSampler && tacticalName === 'run';
    this.posture.position.set(0, down && !kneeling ? loaded.downLift * fallEase : tacticalSampler ? 0 : crouched ? -bodyHeight * 0.31 + (gait?.bodyLift ?? 0)
      : kneeling ? -bodyHeight * 0.25 : running * (-bodyHeight * 0.085 + (gait?.bodyLift ?? 0)), 0);
    this.posture.rotation.set(down ? kneeling ? 0 : Math.PI / 2 * fallEase : MathUtils.clamp(number(pose.reaching), 0, 1) * 0.15, 0, 0);
    const walking = moving && !crouched;
    if (walking && !tacticalSampler) {
      // The existing walk phase is travelled metres * 4. No wall clock, root motion or second update loop.
      const cycle = ((walk / 4 / loaded.strideMeters) % 1 + 1) % 1;
      // Fade the complete walk pose to rest before the procedural run overlay;
      // otherwise its unrelated hip cycle would keep moving under the run gait.
      loaded.walk.sample(cycle * loaded.walk.duration, true, 1 - running);
    }
    if (tacticalSampler) {
      const stride = rig.legLength * loaded.scale * (sharedRun ? 3.1 : 1.15);
      const time = moving && (tacticalName === 'run' || tacticalName === 'crouch_walk')
        ? walk / 4 / stride * tacticalSampler.duration : selection!.time;
      tacticalSampler.sample(time, selection!.loop);
    }
    // An armed locomotion layer changes only arm branches, retaining canonical legs/hip/trunk.
    // Full authored cover/crouch clips bypass all procedural upper-body/head overlays below.
    const readyArms = !authoredBody && tacticalEligible && armed ? loaded.tacticalSamplers.get('ready_idle') : undefined;
    if (readyArms) {
      const retain = [...rig.bones].filter(([name]) => !armBone(name)).map(([, bone]) =>
        ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
      readyArms.sample(moving ? walk / 4 : number(pose.animationTime), true);
      for (const p of retain) { p.bone.position.copy(p.position); p.bone.quaternion.copy(p.quaternion); p.bone.scale.copy(p.scale); }
    }
    this.root.userData.tacticalStatus = tacticalSampler ? 'shared-clip-full-authored-pose'
      : loaded.tactical ? 'available-stable-fallback-selected' : 'optional-load-failed-stable-fallback';
    this.root.userData.motion = { clip: tacticalSampler ? tacticalName : undefined, gait: down ? 'down' : kneeling ? 'kneel' : crouched ? moving ? 'crouch-walk' : 'crouch'
      : running > 0 ? 'run' : walking ? 'walk' : 'idle', running, reloadFraction: reloading ? reload : 0,
      loop: selection?.loop, clipTime: selection?.time,
      source: tacticalSampler ? 'target-baked shared tactical clip' : gait ? 'procedural on production rig' : walking ? 'canonical walk' : 'procedural pose' };
    this.root.updateWorldMatrix(true, true);
    if (running > 0 && !sharedRun && !authoredBody) poser.lean(running * 0.18);
    if (down && kneeling) poser.lean(-Math.sin(Math.PI * MathUtils.clamp(fall / 0.42, 0, 1)) * 0.08);
    if (!authoredBody && !readyArms) for (const side of ['L', 'R'] as const) {
      const upper = `${side}_Upperarm`, lower = `${side}_Forearm`, hand = `${side}_Hand`, sign = poser.side(upper);
      let upperDirection: Vector3 | undefined, lowerDirection: Vector3 | undefined;
      let armWeight = 1;
      if (!walking) { upperDirection = new Vector3(sign * 0.08, -1, 0.03); lowerDirection = new Vector3(sign * 0.04, -1, 0.06); }
      else if (running > 0 && gait) {
        const swing = (side === 'L' ? gait.left : gait.right).swing;
        upperDirection = new Vector3(sign * 0.13, -0.85, swing * 0.62);
        lowerDirection = new Vector3(-sign * 0.08, -0.30 + swing * 0.24, 0.80); armWeight = running;
      }
      if (down) {
        upperDirection = pose.restrained ? new Vector3(sign * 0.12, -0.8, -0.45) : new Vector3(sign * 0.08, -1, 0.03);
        lowerDirection = pose.restrained ? new Vector3(-sign * 0.45, 0.1, -0.8) : new Vector3(sign * 0.04, -1, 0.06);
        upperDirection.lerp(new Vector3(sign * 0.35, -0.9, 0.15), fallEase);
        lowerDirection.lerp(new Vector3(sign * 0.2, -1, 0), fallEase);
      }
      else if (pose.restrained) { upperDirection = new Vector3(sign * 0.12, -0.8, -0.45); lowerDirection = new Vector3(-sign * 0.45, 0.1, -0.8); }
      else if (pose.care) { upperDirection = new Vector3(sign * 0.15, -0.9, 0.45); lowerDirection = new Vector3(-sign * 0.15, -0.65, 0.65); }
      else if (pose.carrying) { upperDirection = new Vector3(sign * 0.12, -0.4, 0.8); lowerDirection = new Vector3(-sign * 0.12, 0.2, 0.9); }
      else if (reloading) {
        // Left hand visits the waist/pouch, returns to the magazine, then the
        // right hand briefly reaches the action. The simulation owns progress.
        const pouch = Math.sin(Math.PI * MathUtils.clamp(reload / 0.62, 0, 1)) ** 2;
        const rack = Math.sin(Math.PI * MathUtils.clamp((reload - 0.68) / 0.28, 0, 1)) ** 2;
        upperDirection = side === 'L' ? new Vector3(sign * 0.18, -0.35 - pouch * 0.65, 0.72 - pouch * 0.62)
          : new Vector3(sign * 0.15, -0.30 + rack * 0.22, 0.85);
        lowerDirection = side === 'L' ? new Vector3(-sign * 0.3, 0.18 - pouch * 0.8, 0.85 - pouch * 0.55)
          : new Vector3(-sign * 0.22, 0.12 + rack * 0.28, 0.82);
      }
      else if (pose.aiming && armed) { upperDirection = new Vector3(sign * 0.15, -0.1, 0.9); lowerDirection = new Vector3(-sign * 0.2, 0.05, 0.9); }
      else if (side === 'R' && number(pose.reaching) > 0) { upperDirection = new Vector3(sign * 0.1, -0.55, 0.7); lowerDirection = new Vector3(0, -0.2, 0.9); }
      else if (side === 'R' && !armed && number(pose.gesture) > 0) {
        const amount = MathUtils.clamp(number(pose.gesture), 0, 1);
        upperDirection = new Vector3(sign * 0.2, -1 + amount, amount); lowerDirection = new Vector3(0, -1 + amount * 1.5, amount);
      }
      if (down || pose.restrained || pose.care || pose.carrying || reloading || pose.aiming && armed || number(pose.reaching) > 0 || !armed && number(pose.gesture) > 0) armWeight = 1;
      if (upperDirection) poser.aim(upper, lower, upperDirection, armWeight);
      if (lowerDirection) poser.aim(lower, hand, lowerDirection, armWeight);
    }
    if (!authoredBody && (kneeling || crouched && !sharedCrouch || running > 0 && !sharedRun)) {
      const pole = new Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new Quaternion()));
      for (const side of ['L', 'R'] as const) {
        const target = feet.get(side)!.clone();
        if (kneeling) target.z += (side === 'L' ? -0.20 : 0.10) * bodyHeight;
        else if (gait) {
          const step = side === 'L' ? gait.left : gait.right;
          target.z += step.forward; target.y += step.lift;
        }
        poser.leg(side, target.applyMatrix4(this.root.matrixWorld), pole, down ? 1 - fallEase : crouched || kneeling ? 1 : running);
      }
    }
    if (!authoredBody) poser.head(down ? 0 : MathUtils.clamp(number(pose.lookAway), -1, 1), down ? 0.1 * fallEase : pose.aiming ? -0.04 : MathUtils.clamp(number(pose.reaching), 0, 1) * 0.2);
    if (down && kneeling) {
      this.posture.position.y = MathUtils.lerp(-bodyHeight * 0.25, loaded.downLift, fallEase);
      this.posture.rotation.x = Math.PI / 2 * fallEase;
    }
    if (weaponVisible && !authoredBody && !readyArms && !reloading) fitStableWeaponHands(this.root, rig, this.asset!.id);
    const now = number(pose.animationTime), key = tacticalSampler ? selection!.key : undefined;
    if (!tacticalEligible || now < this.sampleTime) { this.blendFrom = undefined; this.previousBones.clear(); this.selectionKey = key; }
    if (tacticalEligible && key !== this.selectionKey) {
      this.blendFrom = this.previousBones.size ? new Map([...this.previousBones].map(([name, p]) => [name,
        { position: p.position.clone(), quaternion: p.quaternion.clone(), scale: p.scale.clone() }])) : undefined;
      this.blendAt = now; this.selectionKey = key;
    }
    const blend = MathUtils.clamp((now - this.blendAt) / (tacticalName?.includes('fire') ? 0.055 : 0.18), 0, 1);
    if (this.blendFrom && blend < 1) for (const [name, bone] of rig.bones) {
      const from = this.blendFrom.get(name)!;
      bone.position.lerp(from.position, 1 - blend); bone.quaternion.slerp(from.quaternion, 1 - blend); bone.scale.lerp(from.scale, 1 - blend);
    }
    if (blend >= 1) this.blendFrom = undefined;
    if (tacticalEligible) for (const [name, bone] of rig.bones) {
      const previous = this.previousBones.get(name);
      if (previous) { previous.position.copy(bone.position); previous.quaternion.copy(bone.quaternion); previous.scale.copy(bone.scale); }
      else this.previousBones.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() });
    }
    this.sampleTime = now;
    if (weaponVisible && this.weapon && !reloading && !kneeling && this.asset!.bodyPlan === 'adult'
      && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(this.asset!.id)) {
      fitShoulderedWeapon(this.root, rig, this.asset!.id, this.weapon, !!authoredBody || !!readyArms, loaded.headBounds);
    } else delete this.root.userData.shoulderContact;
    // Refresh the posture ancestors and the skin inverse-bind matrix together.
    this.root.updateMatrixWorld(true);
    this.root.userData.weaponContact = this.weapon?.contact(rig.bones.get('L_Hand')!, new Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(new Quaternion())));
  }

  retry(): void {
    if (this.disposed) return;
    if (this.weapon?.state === 'error') { this.weapon.dispose(); this.attachWeapon(); }
    this.ready = this.load();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.controller?.abort(); this.releaseLoaded(); this.weapon?.dispose();
    this.fallback.root.removeFromParent(); this.fallback.dispose(); this.root.removeFromParent(); this.root.clear();
  }
}

export function createImportedCharacter(library: ModelLibrary, identity: CharacterIdentity, baseURL: string,
  onStatus?: (status: CharacterLoadStatus) => void): ImportedCharacter {
  return new ImportedCharacter(library, identity, baseURL, onStatus);
}
