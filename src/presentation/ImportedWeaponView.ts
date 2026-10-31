import { Box3, Group, MathUtils, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { WeaponModel } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelLoadProgress, ModelSource } from '../assets/model-contracts';
import { AK47_ASSET } from '../assets/weapon-catalog';
import type { CharacterIdentity } from '../assets/character-catalog';
import { createWeaponView } from './characters';
import { FirstPersonArms, type FirstPersonArmsStatus } from './FirstPersonArms';

export interface WeaponLoadStatus {
  state: 'loading' | 'ready' | 'error';
  message?: string;
  progress?: ModelLoadProgress;
}

interface RestPose { position: Vector3; quaternion: Quaternion }
interface LoadedWeapon {
  lease: ModelLease;
  mount: Group;
  muzzle: Object3D;
  magazine: Object3D;
  handle: Object3D;
  magazineGrip: Object3D;
  magazineRest: RestPose;
  handleRest: RestPose;
  aim: Vector3;
  support: Vector3;
}

const forward = new Vector3(0, 0, -1);
const gripTarget = new Vector3(0, -0.14, -0.02);
const rotationX = new Vector3(1, 0, 0);
const restPose = (node: Object3D): RestPose => ({ position: node.position.clone(), quaternion: node.quaternion.clone() });
const bounded = (value: number) => Number.isFinite(value) ? MathUtils.clamp(value, 0, 1) : 0;

function requireNode(root: Group, name: string): Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`AK-47 asset is missing ${name}`);
  return node;
}

/** Actual POSITION accessors in source-root coordinates, including authored node transforms. */
function pointsInRoot(root: Group, node: Object3D): Vector3[] {
  const points: Vector3[] = [];
  const inverse = root.matrixWorld.clone().invert();
  node.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    for (let i = 0; i < positions.count; i++) points.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform));
  });
  if (!points.length) throw new Error(`AK-47 ${node.name} contains no visible geometry`);
  return points;
}

function prepareWeapon(lease: ModelLease): LoadedWeapon {
  const source = lease.root;
  for (const name of AK47_ASSET.requiredNodes) requireNode(source, name);
  for (const name of AK47_ASSET.defaultHiddenNodes) source.getObjectByName(name)?.traverse(node => { node.visible = false; });
  source.updateMatrixWorld(true);
  const bounds = new Box3().setFromPoints(pointsInRoot(source, source));
  const size = bounds.getSize(new Vector3());
  if (!Number.isFinite(size.z) || size.z < 1.3 || size.z > 1.5 || size.y > 0.6) throw new Error('AK-47 geometry does not match the inspected source frame');
  const scale = AK47_ASSET.presentationLengthMeters / size.z;

  const muzzle = requireNode(source, 'MuzzleDeviceTip');
  const sourceMuzzle = source.worldToLocal(muzzle.getWorldPosition(new Vector3()));
  if (Math.abs(sourceMuzzle.x) > 0.01 || Math.abs(sourceMuzzle.z - bounds.min.z) > 0.02) throw new Error('AK-47 muzzle is not on the inspected -Z barrel tip');

  const frontPoints = pointsInRoot(source, requireNode(source, 'FrontIronSight'));
  // The hood is taller than the post. Inspect the central post, not the mesh's max Y.
  const post = frontPoints.filter(point => Math.abs(point.x - sourceMuzzle.x) < 0.002);
  const postTop = Math.max(...post.map(point => point.y));
  const postTip = post.filter(point => Math.abs(point.y - postTop) < 0.000001);
  if (!postTip.length) throw new Error('AK-47 front sight post could not be identified');
  const frontPoint = new Box3().setFromPoints(postTip).getCenter(new Vector3());

  const rearPoints = pointsInRoot(source, requireNode(source, 'RearIronSight'));
  const rearBounds = new Box3().setFromPoints(rearPoints);
  const rearCenterX = (rearBounds.min.x + rearBounds.max.x) / 2;
  const notch = rearPoints.filter(point => Math.abs(point.x - rearCenterX) < 0.0008);
  const notchBottom = Math.max(...notch.map(point => point.y));
  if (!notch.length || rearBounds.max.y - notchBottom < 0.003) throw new Error('AK-47 rear sight notch could not be identified');
  const rearPoint = new Vector3(rearCenterX, (notchBottom + rearBounds.max.y) / 2, rearBounds.max.z);
  const sightDirection = frontPoint.clone().sub(rearPoint).normalize();
  if (sightDirection.dot(forward) < 0.999) throw new Error('AK-47 sights do not face the inspected -Z direction');
  const basis = new Quaternion().setFromUnitVectors(sightDirection, forward);

  const furniture = pointsInRoot(source, requireNode(source, 'FurnitureGeometry'));
  const gripPoints = furniture.filter(point => point.y < -0.065 && point.z > -0.30);
  const supportPoints = furniture.filter(point => point.z < -0.60);
  if (!gripPoints.length || !supportPoints.length) throw new Error('AK-47 grip and handguard geometry could not be identified');
  const grip = new Box3().setFromPoints(gripPoints).getCenter(new Vector3());
  const supportBounds = new Box3().setFromPoints(supportPoints);
  const support = supportBounds.getCenter(new Vector3()); support.y = supportBounds.min.y;
  const mount = new Group(); mount.name = 'imported-weapon-mount';
  mount.scale.setScalar(scale); mount.quaternion.copy(basis);
  mount.position.copy(gripTarget).sub(grip.clone().applyQuaternion(basis).multiplyScalar(scale));
  mount.add(source);
  const toView = (point: Vector3) => point.clone().applyQuaternion(basis).multiplyScalar(scale).add(mount.position);
  const aim = toView(rearPoint);

  const marker = (name: string, at: Vector3) => {
    const node = new Group(); node.name = name; node.position.copy(at); source.add(node); return node;
  };
  marker('ganymede-front-sight', frontPoint);
  marker('ganymede-rear-sight', rearPoint);
  marker('ganymede-firing-grip', grip);
  marker('ganymede-support-grip', support);
  mount.userData.calibration = {
    sourceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    uniformScale: scale, presentationLengthMeters: AK47_ASSET.presentationLengthMeters,
    sourceForward: '-Z', sourceUp: '+Y', sightBasis: basis.toArray(),
    sourceMuzzle: sourceMuzzle.toArray(), sourceFrontPostTip: frontPoint.toArray(),
    sourceRearNotch: rearPoint.toArray(), rearNotchBottom: notchBottom, rearNotchTop: rearBounds.max.y,
    sourceFiringGrip: grip.toArray(), sourceSupportGrip: support.toArray(),
    supplierAnimationClips: lease.animations.length,
    animation: 'Project procedural magazine and charging-handle motion; production character arms when ready, placeholder fallback',
  };
  source.traverse(object => {
    object.renderOrder = 2;
    if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
  });
  const magazine = requireNode(source, 'Magazine'), handle = requireNode(source, 'ChargingHandle');
  const magazineGrip = new Group(); magazineGrip.name = 'ganymede-magazine-grip';
  const magazineCenter = new Box3().setFromPoints(pointsInRoot(source, magazine)).getCenter(new Vector3());
  magazineGrip.position.copy(magazine.worldToLocal(source.localToWorld(magazineCenter))); magazine.add(magazineGrip);
  return { lease, mount, muzzle, magazine, handle, magazineGrip, magazineRest: restPose(magazine), handleRest: restPose(handle), aim, support: toView(support) };
}

/** Imported gun and optional current-protagonist arms, with stable held-item/muzzle interfaces. */
export class ImportedWeaponView implements WeaponModel {
  private readonly placeholder = createWeaponView();
  readonly root = this.placeholder.root;
  readonly muzzle = new Group();
  private readonly proxyGun = this.root.getObjectByName('carbine-placeholder')!;
  private readonly rightHand = this.root.getObjectByName('right-grip-arm')!;
  private readonly leftHand = this.root.getObjectByName('left-support-arm')!;
  private readonly rightRest = restPose(this.rightHand);
  private readonly temporaryRotation = new Quaternion();
  private readonly arms: FirstPersonArms;
  private request?: AbortController;
  private loaded?: LoadedWeapon;
  private generation = 0;
  private disposed = false;
  private pose: [number, number, number, number] = [0, 0, 0, 0];
  private viewportAspect = 16 / 9;

  constructor(private readonly library: ModelLibrary, private readonly source: ModelSource,
    private readonly onStatus: (status: WeaponLoadStatus) => void) {
    this.muzzle.name = 'viewmodel-muzzle'; this.muzzle.userData.forward = '-Z';
    this.placeholder.muzzle.add(this.muzzle);
    this.arms = new FirstPersonArms(library, status => {
      this.rightHand.visible = this.leftHand.visible = status.state !== 'ready';
      this.root.userData.armsStatus = status.state; this.root.userData.armsAssetId = status.assetId;
      this.updateAssetStatus();
    });
    this.root.add(this.arms.root);
    this.retry();
  }

  /** Call on protagonist/scenario changes, using identity rather than crouched eye height. */
  setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void> { return this.arms.setCharacter(identity, baseURL); }
  get armsReady(): Promise<void> { return this.arms.ready; }
  get armsStatus(): FirstPersonArmsStatus { return this.arms.status; }
  retryArms(): Promise<void> { return this.arms.retry(); }

  private updateAssetStatus(): void {
    this.root.userData.assetStatus = this.loaded ? this.arms.status.state === 'ready' ? 'imported-weapon-character-arms' : 'imported-weapon-placeholder-arms' : 'placeholder';
  }

  retry(): void {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.request?.abort();
    this.releaseImported();
    const request = new AbortController(); this.request = request;
    this.onStatus({ state: 'loading', message: '装备载入中' });
    if (!this.current(generation, request)) return;
    void this.load(generation, request);
  }

  setViewportAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.viewportAspect = aspect;
    this.setPose(...this.pose);
  }

  setPose(recoil: number, reloadFraction: number, ads: number, walk: number): void {
    if (this.disposed) return;
    this.pose = [bounded(recoil), bounded(reloadFraction), bounded(ads), Number.isFinite(walk) ? walk : 0];
    this.placeholder.setPose(...this.pose);
    // Keep the receiver in the portrait frame without changing model proportions
    // or the independently calibrated iron-sight line at full ADS.
    const hipX = Math.min(0.22, this.viewportAspect * 0.20);
    const loaded = this.loaded;
    if (!loaded) {
      this.root.position.x -= (0.22 - hipX) * (1 - this.pose[2]);
      this.arms.setPose({ rightGrip: gripTarget, leftSupport: new Vector3(-0.055, -0.085, -0.48), reloadFraction: this.pose[1] }); return;
    }
    const [kick, phase, aim, stride] = this.pose;
    const reload = phase > 0 ? Math.sin(Math.PI * phase) : 0;
    // Re-establish the base pose each frame. HeldItemMotion may then lower this root.
    this.root.position.x = MathUtils.lerp(hipX, -loaded.aim.x, aim) + Math.sin(stride) * 0.008 * (1 - aim);
    this.root.position.y = MathUtils.lerp(-0.25, -loaded.aim.y, aim) - reload * 0.09 + Math.sin(stride * 2) * 0.007 * (1 - aim);
    this.rightHand.position.copy(gripTarget); this.rightHand.position.x += 0.035;
    this.rightHand.quaternion.copy(this.rightRest.quaternion);
    this.leftHand.position.copy(loaded.support);
    this.leftHand.position.x -= 0.030; this.leftHand.position.y -= 0.025 + reload * 0.20; this.leftHand.position.z += reload * 0.26;
    this.leftHand.rotation.set(0, 0, reload * 0.35);

    const withdrawal = phase > 0 ? Math.sin(Math.PI * MathUtils.clamp((phase - 0.12) / 0.70, 0, 1)) : 0;
    loaded.magazine.position.copy(loaded.magazineRest.position);
    loaded.magazine.position.y -= withdrawal * 0.32;
    loaded.magazine.position.z += withdrawal * 0.08;
    loaded.magazine.quaternion.copy(loaded.magazineRest.quaternion).multiply(this.temporaryRotation.setFromAxisAngle(rotationX, -withdrawal * 0.28));
    const charge = phase > 0 ? Math.sin(Math.PI * MathUtils.clamp((phase - 0.78) / 0.20, 0, 1)) : 0;
    loaded.handle.position.copy(loaded.handleRest.position); loaded.handle.position.z += Math.max(kick, charge) * 0.08;
    loaded.handle.quaternion.copy(loaded.handleRest.quaternion);
    this.root.updateWorldMatrix(true, true);
    const magazineGrip = this.root.worldToLocal(loaded.magazineGrip.getWorldPosition(new Vector3()));
    this.arms.setPose({ rightGrip: gripTarget, leftSupport: loaded.support, magazineGrip, reloadFraction: phase });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; ++this.generation;
    this.request?.abort(); this.request = undefined;
    this.arms.dispose();
    this.releaseImported();
    this.muzzle.removeFromParent();
    // The imported subtree was detached and its lease released before this owning
    // procedural factory traverses and disposes its private geometry/materials.
    this.placeholder.dispose();
  }

  private current(generation: number, request: AbortController): boolean {
    return !this.disposed && generation === this.generation && !request.signal.aborted;
  }

  private async load(generation: number, request: AbortController): Promise<void> {
    let lease: ModelLease | undefined;
    try {
      lease = await this.library.acquire(this.source, {
        signal: request.signal,
        onProgress: progress => { if (this.current(generation, request)) this.onStatus({ state: 'loading', message: '装备载入中', progress }); },
      });
      // acquire may already be resolved when retry/dispose runs, before this await resumes.
      if (!this.current(generation, request)) { lease.dispose(); return; }
      const loaded = prepareWeapon(lease);
      this.loaded = loaded;
      this.root.add(loaded.mount);
      this.proxyGun.visible = false;
      loaded.muzzle.add(this.muzzle);
      this.muzzle.position.set(0, 0, 0); this.muzzle.quaternion.identity(); this.muzzle.scale.setScalar(1);
      this.updateAssetStatus();
      this.root.userData.weaponSource = { id: this.source.id, revision: this.source.revision };
      this.setPose(...this.pose);
      this.request = undefined;
      this.onStatus({ state: 'ready' });
    } catch (error) {
      if (lease && this.loaded?.lease !== lease) lease.dispose();
      if (!this.current(generation, request)) return;
      this.request = undefined;
      console.warn('AK-47 model import failed', error);
      this.onStatus({ state: 'error', message: '装备载入失败' });
    }
  }

  private releaseImported(): void {
    this.muzzle.removeFromParent();
    this.loaded?.mount.removeFromParent();
    this.loaded?.lease.dispose();
    this.loaded = undefined;
    this.placeholder.muzzle.add(this.muzzle);
    this.muzzle.position.set(0, 0, 0); this.muzzle.quaternion.identity(); this.muzzle.scale.setScalar(1);
    this.proxyGun.visible = true;
    this.rightHand.position.copy(this.rightRest.position); this.rightHand.quaternion.copy(this.rightRest.quaternion);
    this.updateAssetStatus();
    delete this.root.userData.weaponSource;
    if (!this.disposed) this.setPose(...this.pose);
  }
}
