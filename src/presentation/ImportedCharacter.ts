import { Group, MathUtils, Mesh, Quaternion, SkinnedMesh, Sphere, Vector3 } from 'three';
import type { CharacterModel } from '../contracts';
import { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelLoadProgress } from '../assets/model-contracts';
import { canonicalWalkSource, characterAssetFor, characterSource, type CharacterAsset, type CharacterIdentity } from '../assets/character-catalog';
import { ak47Source } from '../assets/weapon-catalog';
import { createCharacter } from './characters';
import { CharacterBonePoser, CharacterClipSampler, inspectCharacterRig, restoreCharacterRig, retargetCharacterWalk, type CharacterRig } from './CharacterRig';
import { sampleCharacterGait } from './CharacterMotion';
import { loadTacticalAnimations, type TacticalAnimationLease } from './TacticalAnimations';
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
}
const up = new Vector3(0, 1, 0);
const number = (value: number | undefined, fallback = 0) => value !== undefined && Number.isFinite(value) ? value : fallback;

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
      // These bodies use the stable path below, so do not fetch unused packs for
      // every civilian or child when a crowd enters the level.
      if (asset.bodyPlan === 'adult' && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(asset.id)) {
        try { tactical = await loadTacticalAnimations(this.library, asset, model.root); }
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
      this.loaded = { model, animation, rig, poser: new CharacterBonePoser(model.root, rig), walk: new CharacterClipSampler(clip, rig),
        tactical, tacticalSamplers: new Map(tactical ? [...tactical.clips].map(([name, clip]) => [name, new CharacterClipSampler(clip, rig)]) : []),
        scale, strideMeters, downLift: rig.bounds.clone().applyMatrix4(this.mount.matrix).max.z, feet };
      acquired.clear();
      for (const mesh of this.fallbackBodies) mesh.visible = false;
      this.root.userData.calibration = { heightMeters: asset.heightMeters, sourceForward: '+X', forward: '+Z', scale, strideMeters,
        legLengthMeters: rig.legLength * scale,
        bodyPlan: asset.bodyPlan, rigBones: 41, walkTracks: clip.tracks.length, retarget: 'target-rest-world-delta',
        animationClips: tactical ? [...tactical.clips.keys()] : ['walk_in_place'], proceduralActions: ['run', 'crouch-walk', 'aim', 'reload', 'kneel', 'carry', 'care', 'fall'],
        contactAnimation: 'procedural approximation; hand, foot and equipment contact awaits visual review' };
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
    // Full packs are target-baked. Only explicit simulation time enables the
    // initial locomotion subset; existing callers and risky bodies keep their
    // tested procedural path. No aiming flag is interpreted as a shot event.
    const tacticalEligible = Number.isFinite(pose.animationTime) && this.asset!.bodyPlan === 'adult'
      && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(this.asset!.id)
      && !down && !kneeling && !pose.care && !pose.carrying && !pose.restrained && !reloading
      && number(pose.reaching) === 0 && number(pose.gesture) === 0;
    const tacticalName = tacticalEligible ? crouched ? moving ? 'crouch_walk' : 'crouch_idle'
      : running >= 1 ? 'run' : !moving ? armed ? 'ready_idle' : 'idle' : undefined : undefined;
    const tacticalSampler = tacticalName ? loaded.tacticalSamplers.get(tacticalName) : undefined;
    const sharedCrouch = !!tacticalSampler && crouched, sharedRun = !!tacticalSampler && tacticalName === 'run';
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
      const time = moving ? walk / 4 / stride * tacticalSampler.duration : number(pose.animationTime);
      tacticalSampler.sample(time, true);
    }
    this.root.userData.tacticalStatus = tacticalSampler ? 'shared-clip-with-stable-upper-body-overlay'
      : loaded.tactical ? 'available-stable-fallback-selected' : 'optional-load-failed-stable-fallback';
    this.root.userData.motion = { clip: tacticalSampler ? tacticalName : undefined, gait: down ? 'down' : kneeling ? 'kneel' : crouched ? moving ? 'crouch-walk' : 'crouch'
      : running > 0 ? 'run' : walking ? 'walk' : 'idle', running, reloadFraction: reloading ? reload : 0,
      source: tacticalSampler ? 'target-baked shared tactical clip; stable upper-body overlay' : gait ? 'procedural on production rig' : walking ? 'canonical walk' : 'procedural pose' };
    this.root.updateWorldMatrix(true, true);
    if (running > 0 && !sharedRun) poser.lean(running * 0.18);
    if (down && kneeling) poser.lean(-Math.sin(Math.PI * MathUtils.clamp(fall / 0.42, 0, 1)) * 0.08);
    for (const side of ['L', 'R'] as const) {
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
    if (kneeling || crouched && !sharedCrouch || running > 0 && !sharedRun) {
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
    poser.head(down ? 0 : MathUtils.clamp(number(pose.lookAway), -1, 1), down ? 0.1 * fallEase : pose.aiming ? -0.04 : MathUtils.clamp(number(pose.reaching), 0, 1) * 0.2);
    if (down && kneeling) {
      this.posture.position.y = MathUtils.lerp(-bodyHeight * 0.25, loaded.downLift, fallEase);
      this.posture.rotation.x = Math.PI / 2 * fallEase;
    }
    // Refresh the posture ancestors and the skin inverse-bind matrix together.
    this.root.updateMatrixWorld(true);
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
