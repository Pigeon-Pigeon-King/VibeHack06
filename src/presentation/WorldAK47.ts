import { Box3, ConeGeometry, Group, LoadingManager, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelSource } from '../assets/model-contracts';
import { disposeModelTree, registerModelDisposer } from './model-tools';
import { TACTICAL_WEAPON_CALIBRATION } from '../assets/tactical-catalog';

/** Same committed source as ImportedWeaponView, without first-person arms or animation rules. */
export const WORLD_AK47 = {
  id: 'WP-AK47', revision: 'world-r1-d121eb62491e',
  runtimePath: 'models/weapons/ak47-world-r1.glb',
  sha256: 'd121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1',
  bytes: 2_046_524,
  /** Final length in the actor's metre frame after cancelling the legacy weapon socket scale. */
  presentationLengthMeters: 0.89,
  hiddenNodes: ['SpareMagazine', 'Suppressor', 'OpticMount', 'OpticRailAdapterGeometry', 'OpticRailContact'],
  requiredNodes: ['Magazine', 'ChargingHandle', 'FrontIronSight', 'RearIronSight', 'MuzzleDeviceTip', 'FurnitureGeometry', 'Stock'],
} as const;

export type WorldAK47Loader = (url: string, signal: AbortSignal) => Promise<Group>;
export type WorldAK47State = 'loading' | 'ready' | 'error' | 'disposed';
export interface WorldAK47Attachment {
  /** Never rejects; error retains the original gun, disposed never attaches a late result. */
  readonly ready: Promise<Exclude<WorldAK47State, 'loading'>>;
  readonly state: WorldAK47State;
  /** Stable original muzzle object, moved to the imported marker on success. */
  readonly muzzle: Object3D;
  /** Metre offsets in the calibrated +X weapon frame, measured from the original firing grip. */
  readonly gripOffsets: { stock: Vector3; support: Vector3; supportRear: Vector3 } | undefined;
  /** Slide only the contact marker along the measured underside of the existing foregrip. */
  setSupportFraction(fraction: number): void;
  /** Move the imported gun itself to the production hand, preserving its one shared lease. */
  bindToHand(hand?: Object3D, rightHandToWeaponQuaternion?: readonly number[]): void;
  setVisible(visible: boolean): void;
  setShot(simulationTime: number, lastShotAt?: number): void;
  contact(leftHand: Object3D, forward: Vector3): { rightGripError: number; leftGripError: number; sightForwardDot: number } | undefined;
  dispose(): void;
}
export interface WorldAK47Options {
  /** Game integration supplies the same library and exact source as the first-person view. */
  library?: ModelLibrary;
  source?: ModelSource;
  /** Standalone/tool callers may retain the original explicit pool. Ignored when library is supplied. */
  pool?: WorldAK47Pool;
  baseURL?: string;
  pageURL?: string;
}

export function worldAK47Url(baseURL = import.meta.env.BASE_URL, pageURL?: string): string {
  const path = `${baseURL.endsWith('/') ? baseURL : `${baseURL}/`}${WORLD_AK47.runtimePath}`;
  const page = pageURL ?? (typeof location === 'undefined' ? undefined : location.href);
  return page ? new URL(path, page).href : path;
}

const loadWorldAK47: WorldAK47Loader = async (url, signal) => {
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error('World weapon is unavailable');
  const bytes = await response.arrayBuffer(), view = new DataView(bytes);
  if (signal.aborted) throw new Error('World weapon load cancelled');
  if (bytes.byteLength !== WORLD_AK47.bytes || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a
    || view.getUint32(12, true) > bytes.byteLength - 20) throw new Error('Unexpected world weapon GLB');
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, view.getUint32(12, true))));
  if (metadata.scenes?.length !== 1 || metadata.skins?.length || metadata.animations?.length
    || ['images', 'buffers'].some(key => (metadata[key] ?? []).some((item: { uri?: string }) => item.uri !== undefined))) {
    throw new Error('World weapon must be a self-contained static model');
  }
  const manager = new LoadingManager(); let imageFailed = false;
  manager.onError = failed => { imageFailed = true; if (failed.startsWith('blob:')) URL.revokeObjectURL(failed); };
  const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
  if (signal.aborted || imageFailed) { disposeModelTree(gltf.scene); throw new Error('World weapon decode failed or cancelled'); }
  return gltf.scene;
};

function requireNode(root: Group, name: string): Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`World weapon lacks ${name}`);
  return node;
}

/** Read actual vertices in the source frame; hidden accessories cannot inflate the fitted length. */
function pointsInRoot(root: Group, node: Object3D): Vector3[] {
  const points: Vector3[] = [], inverse = root.matrixWorld.clone().invert();
  node.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) throw new Error('World weapon cannot contain a skin');
    const positions = object.geometry.getAttribute('position');
    const transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    for (let i = 0; i < positions.count; i++) points.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform));
  });
  if (!points.length) throw new Error(`World weapon ${node.name} lacks geometry`);
  return points;
}

interface WorldCalibration {
  bounds: Box3; scale: number; sourceMuzzle: Vector3; front: Vector3; rear: Vector3;
  basis: Quaternion; grip: Vector3; support: Vector3; supportRear: Vector3; stock: Vector3;
}
const calibrations = new WeakMap<BufferGeometry, WorldCalibration>();
const gripAnchor = new Vector3(0, -0.14, -0.02);

/** Geometry-derived calibration; a shared geometry revision is measured only once. */
function measureWorldAK47(source: Group): WorldCalibration {
  const bounds = new Box3().setFromPoints(pointsInRoot(source, source)), size = bounds.getSize(new Vector3());
  if (!Number.isFinite(size.z) || size.z < 1.3 || size.z > 1.5 || size.y > 0.6) throw new Error('Unexpected AK source frame');
  const scale = WORLD_AK47.presentationLengthMeters / size.z;
  const sourceMuzzle = source.worldToLocal(requireNode(source, 'MuzzleDeviceTip').getWorldPosition(new Vector3()));
  if (Math.abs(sourceMuzzle.x) > 0.01 || Math.abs(sourceMuzzle.z - bounds.min.z) > 0.02) throw new Error('AK muzzle is not at the -Z barrel tip');
  const frontPoints = pointsInRoot(source, requireNode(source, 'FrontIronSight'));
  const post = frontPoints.filter(point => Math.abs(point.x - sourceMuzzle.x) < 0.002);
  const postTop = Math.max(...post.map(point => point.y));
  const postTip = post.filter(point => Math.abs(point.y - postTop) < 0.000001);
  if (!postTip.length) throw new Error('AK front post could not be identified');
  const front = new Box3().setFromPoints(postTip).getCenter(new Vector3());
  const rearPoints = pointsInRoot(source, requireNode(source, 'RearIronSight'));
  const rearBounds = new Box3().setFromPoints(rearPoints), rearX = (rearBounds.min.x + rearBounds.max.x) / 2;
  const notch = rearPoints.filter(point => Math.abs(point.x - rearX) < 0.0008);
  const notchBottom = Math.max(...notch.map(point => point.y));
  if (!notch.length || rearBounds.max.y - notchBottom < 0.003) throw new Error('AK rear notch could not be identified');
  const rear = new Vector3(rearX, (notchBottom + rearBounds.max.y) / 2, rearBounds.max.z);
  const direction = front.clone().sub(rear).normalize(), forward = new Vector3(0, 0, -1);
  if (direction.dot(forward) < 0.999) throw new Error('AK sights do not face -Z');
  const basis = new Quaternion().setFromUnitVectors(direction, forward);
  const furniture = pointsInRoot(source, requireNode(source, 'FurnitureGeometry'));
  const gripPoints = furniture.filter(point => point.y < -0.065 && point.z > -0.30);
  const supportPoints = furniture.filter(point => point.z < -0.60);
  if (!gripPoints.length || !supportPoints.length) throw new Error('AK grip geometry could not be identified');
  const grip = new Box3().setFromPoints(gripPoints).getCenter(new Vector3());
  const supportBounds = new Box3().setFromPoints(supportPoints), support = supportBounds.getCenter(new Vector3()); support.y = supportBounds.min.y;
  const supportRear = new Vector3(support.x, support.y, supportBounds.max.z - .005);
  const stockPoints = pointsInRoot(source, requireNode(source, 'StockButtpadGeometry'));
  const stockRear = Math.max(...stockPoints.map(point => point.z));
  const stock = new Box3().setFromPoints(stockPoints.filter(point => stockRear - point.z < .002)).getCenter(new Vector3());
  return { bounds, scale, sourceMuzzle, front, rear, basis, grip, support, supportRear, stock };
}

export function prepareWorldAK47(source: Group): Group {
  for (const name of WORLD_AK47.requiredNodes) requireNode(source, name);
  for (const name of WORLD_AK47.hiddenNodes) source.getObjectByName(name)?.traverse(node => { node.visible = false; });
  source.updateMatrixWorld(true);
  const receiver = requireNode(source, 'WeaponBodyGeometry');
  if (!(receiver instanceof Mesh)) throw new Error('World weapon receiver lacks geometry');
  let calibration = calibrations.get(receiver.geometry);
  if (!calibration) { calibration = measureWorldAK47(source); calibrations.set(receiver.geometry, calibration); }
  const { bounds, scale, sourceMuzzle, front, rear, basis, grip, support, supportRear, stock } = calibration;
  const mount = new Group(); mount.name = 'world-ak47-mount';
  mount.scale.setScalar(scale); mount.quaternion.copy(basis);
  mount.position.copy(gripAnchor).sub(grip.clone().applyQuaternion(basis).multiplyScalar(scale));
  mount.add(source);
  for (const [name, position] of [['ganymede-front-sight', front], ['ganymede-rear-sight', rear],
    ['ganymede-firing-grip', grip], ['ganymede-support-grip', support], ['ganymede-stock-contact', stock]] as const) {
    const marker = new Group(); marker.name = name; marker.position.copy(position); source.add(marker);
  }
  source.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = true; } });
  mount.userData.calibration = { sourceForward: '-Z', sourceUp: '+Y', uniformScale: scale,
    sourceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    presentationLengthMeters: WORLD_AK47.presentationLengthMeters, lengthFrame: 'weapon-parent-local-before-existing-outer-scale',
    sourceMuzzle: sourceMuzzle.toArray(), sourceFiringGrip: grip.toArray(), sourceSupportGrip: support.toArray(), sourceSupportRear: supportRear.toArray(), sourceStockContact: stock.toArray(),
    sightBasis: basis.toArray(), supplierAnimationClips: 0, handContact: 'runtime-review-pending' };
  return mount;
}

interface PoolEntry { refs: number; retired: boolean; controller: AbortController; promise: Promise<Group>; template?: Group }
interface WeaponLease { template: Promise<Group>; instance?: boolean; release(): void }

/** One instance lease in the existing game library; no second download/texture/GPU ownership pool. */
function acquireLibraryWeapon(library: ModelLibrary, source: ModelSource): WeaponLease {
  const controller = new AbortController(); let current: ModelLease | undefined, released = false;
  const template = library.acquire(source, { signal: controller.signal }).then(lease => {
    // acquire can have resolved immediately before the owning NPC is disposed.
    if (released || controller.signal.aborted) { lease.dispose(); throw new Error('World weapon request released'); }
    current = lease;
    try {
      if (lease.animations.length) throw new Error('World AK requires the pinned static model');
      return prepareWorldAK47(lease.root);
    } catch (error) { current = undefined; lease.dispose(); throw error; }
  });
  return { template, instance: true, release() {
    if (released) return;
    released = true; controller.abort(); current?.dispose(); current = undefined;
  } };
}

/** Explicit reference counting: no scene owns another character's shared geometry/materials. */
export class WorldAK47Pool {
  private readonly entries = new Map<string, PoolEntry>();
  constructor(private readonly loader: WorldAK47Loader = loadWorldAK47) {}
  acquire(url: string): WeaponLease {
    let entry = this.entries.get(url);
    if (!entry) {
      const current: PoolEntry = { refs: 0, retired: false, controller: new AbortController(), promise: undefined! };
      this.entries.set(url, current); entry = current;
      current.promise = Promise.resolve().then(() => {
        if (current.retired) throw new Error('World weapon request released');
        return this.loader(url, current.controller.signal);
      }).then(source => {
        if (current.retired) { disposeModelTree(source); throw new Error('World weapon request released'); }
        try { current.template = prepareWorldAK47(source); return current.template; }
        catch (error) { disposeModelTree(source); throw error; }
      });
    }
    const current = entry; current.refs++; let released = false;
    return { template: current.promise, release: () => {
      if (released) return;
      released = true;
      if (--current.refs) return;
      current.retired = true; current.controller.abort();
      if (this.entries.get(url) === current) this.entries.delete(url);
      if (current.template) { disposeModelTree(current.template); current.template = undefined; }
    } };
  }
}

const sharedWorldWeapons = new WorldAK47Pool();
const attachments = new WeakMap<Group, WorldAK47Attachment>();

/**
 * Pass only makeCarbine/makeSidearm's gun root, never the actor or first-person arms root.
 * Its transform/visibility remain owned by the existing character pose. The registered
 * pre-disposal callback detaches borrowed resources before disposeModelTree traverses them.
 */
export function attachWorldAK47(parentWeaponRoot: Group, options: WorldAK47Options = {}): WorldAK47Attachment {
  const existing = attachments.get(parentWeaponRoot); if (existing) return existing;
  const found = parentWeaponRoot.getObjectByName('muzzle'), muzzle = found ?? new Group();
  if (!found) { muzzle.name = 'muzzle'; muzzle.position.set(0, 0.018, -0.97); parentWeaponRoot.add(muzzle); }
  const rest = { parent: muzzle.parent!, position: muzzle.position.clone(), quaternion: muzzle.quaternion.clone(),
    scale: muzzle.scale.clone(), matrix: muzzle.matrix.clone(), autoUpdate: muzzle.matrixAutoUpdate };
  const fallback: { mesh: Mesh; visible: boolean }[] = [];
  parentWeaponRoot.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) if (ancestor === muzzle) return;
    fallback.push({ mesh: object, visible: object.visible });
  });
  let state: WorldAK47State = 'loading', mount: Group | undefined;
  const flash = new Mesh(new ConeGeometry(0.045, 0.16, 5), new MeshBasicMaterial({ color: 0xffd189, toneMapped: false, depthWrite: false }));
  flash.name = 'world-ak47-shot-flash'; flash.rotation.x = -Math.PI / 2; flash.position.z = -0.07; flash.visible = false; muzzle.add(flash);
  let handBinding: { hand: Object3D; quaternion: Quaternion } | undefined, requestedVisible = true;
  const oldStatus = parentWeaponRoot.userData.assetStatus, oldWeapon = parentWeaponRoot.userData.worldWeapon;
  const source = options.source ?? { id: WORLD_AK47.id, revision: WORLD_AK47.revision, url: worldAK47Url(options.baseURL, options.pageURL) };
  const lease = options.library ? acquireLibraryWeapon(options.library, source) : (options.pool ?? sharedWorldWeapons).acquire(source.url);
  let resolveReady!: (value: Exclude<WorldAK47State, 'loading'>) => void;
  const ready = new Promise<Exclude<WorldAK47State, 'loading'>>(resolve => { resolveReady = resolve; });
  let unregister = () => {};
  const restoreMuzzle = () => {
    rest.parent.add(muzzle); muzzle.position.copy(rest.position); muzzle.quaternion.copy(rest.quaternion); muzzle.scale.copy(rest.scale);
    muzzle.matrixAutoUpdate = rest.autoUpdate; muzzle.matrix.copy(rest.matrix); muzzle.matrixWorldNeedsUpdate = true;
  };
  const placeMount = () => {
    if (!mount) return;
    const calibration = mount.userData.calibration;
    if (handBinding) {
      const { hand, quaternion } = handBinding;
      hand.updateWorldMatrix(true, false);
      const scale = hand.getWorldScale(new Vector3());
      if (!(scale.x > 0) || !scale.toArray().every(Number.isFinite)
        || Math.abs(scale.y - scale.x) > 1e-5 || Math.abs(scale.z - scale.x) > 1e-5) throw new Error('World weapon hand must have a positive uniform scale');
      if (WORLD_AK47.sha256 !== TACTICAL_WEAPON_CALIBRATION.sha256
        || new Vector3().fromArray(calibration.sourceFiringGrip).distanceTo(new Vector3().fromArray(TACTICAL_WEAPON_CALIBRATION.sourceGrip)) > 1e-5) throw new Error('World weapon grip calibration does not match the pinned model');
      // The hand already inherits the character's source-to-metres scale. No legacy 0.68 socket remains in this path.
      mount.scale.setScalar(TACTICAL_WEAPON_CALIBRATION.sourceUniformScaleToMeters / scale.x);
      mount.quaternion.copy(quaternion).multiply(new Quaternion().fromArray(TACTICAL_WEAPON_CALIBRATION.sourceToForwardXQuaternion)).normalize();
      mount.position.fromArray(TACTICAL_WEAPON_CALIBRATION.sourceGrip).applyQuaternion(mount.quaternion).multiplyScalar(-mount.scale.x);
      hand.add(mount); mount.visible = requestedVisible;
      mount.userData.calibration = { ...calibration, socket: hand.name, socketScale: scale.x, socketScaleCompensation: 1 / scale.x,
        lengthFrame: 'world-metres-through-production-hand', handContact: 'measured-right-grip; left-contact-numerically-inspected; visual-review-pending' };
    } else {
      const socketScale = parentWeaponRoot.scale.x;
      if (!(socketScale > 0) || !Number.isFinite(socketScale) || Math.abs(parentWeaponRoot.scale.y - socketScale) > 1e-6
        || Math.abs(parentWeaponRoot.scale.z - socketScale) > 1e-6) throw new Error('World weapon socket must have a positive uniform scale');
      mount.scale.setScalar(calibration.uniformScale / socketScale);
      mount.quaternion.fromArray(calibration.sightBasis);
      mount.position.copy(gripAnchor).sub(new Vector3().fromArray(calibration.sourceFiringGrip).applyQuaternion(mount.quaternion).multiplyScalar(mount.scale.x));
      parentWeaponRoot.add(mount); mount.visible = true;
      mount.userData.calibration = { ...calibration, socket: 'fallback', socketScale, socketScaleCompensation: 1 / socketScale,
        lengthFrame: 'actor-metres-after-legacy-socket-scale' };
    }
    mount.updateMatrix();
  };
  const attachment: WorldAK47Attachment = { ready, muzzle, get state() { return state; },
    get gripOffsets() {
      if (!mount || state !== 'ready') return undefined;
      const calibration = mount.userData.calibration, grip = new Vector3().fromArray(calibration.sourceFiringGrip);
      const rotation = new Quaternion().fromArray(TACTICAL_WEAPON_CALIBRATION.sourceToForwardXQuaternion);
      const offset = (value: number[]) => new Vector3().fromArray(value).sub(grip).multiplyScalar(TACTICAL_WEAPON_CALIBRATION.sourceUniformScaleToMeters).applyQuaternion(rotation);
      return { stock: offset(calibration.sourceStockContact), support: offset(calibration.sourceSupportGrip), supportRear: offset(calibration.sourceSupportRear) };
    },
    setSupportFraction(fraction) {
      if (!mount || state !== 'ready') return;
      const at = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)), calibration = mount.userData.calibration;
      requireNode(mount, 'ganymede-support-grip').position.fromArray(calibration.sourceSupportGrip).lerp(new Vector3().fromArray(calibration.sourceSupportRear), at);
      mount.userData.supportContactFraction = at;
    },
    bindToHand(hand, quaternion) {
      if (state === 'disposed') return;
      if (hand && (!quaternion || quaternion.length !== 4 || !quaternion.every(Number.isFinite))) throw new Error('Missing production hand weapon axes');
      handBinding = hand ? { hand, quaternion: new Quaternion().fromArray(quaternion!).normalize() } : undefined;
      placeMount();
    },
    setVisible(visible) { requestedVisible = visible; if (handBinding && mount) mount.visible = visible; },
    setShot(time, at) { flash.visible = state !== 'disposed' && requestedVisible && Number.isFinite(time)
      && at !== undefined && Number.isFinite(at) && time >= at && time - at < 0.055; },
    contact(leftHand, forward) {
      if (!handBinding || !mount || state !== 'ready') return undefined;
      mount.updateWorldMatrix(true, true);
      const grip = requireNode(mount, 'ganymede-firing-grip').getWorldPosition(new Vector3());
      const support = requireNode(mount, 'ganymede-support-grip').getWorldPosition(new Vector3());
      const front = requireNode(mount, 'ganymede-front-sight').getWorldPosition(new Vector3());
      const rear = requireNode(mount, 'ganymede-rear-sight').getWorldPosition(new Vector3());
      return { rightGripError: grip.distanceTo(handBinding.hand.getWorldPosition(new Vector3())),
        leftGripError: support.distanceTo(leftHand.getWorldPosition(new Vector3())), sightForwardDot: front.sub(rear).normalize().dot(forward.clone().normalize()) };
    }, dispose() {
    if (state === 'disposed') return;
    state = 'disposed'; unregister();
    flash.removeFromParent(); flash.geometry.dispose(); flash.material.dispose();
    // Detach first: the caller's tree cleanup must not visit reference-counted GPU resources.
    restoreMuzzle(); mount?.removeFromParent(); mount = undefined; lease.release();
    for (const part of fallback) part.mesh.visible = part.visible;
    if (!found) muzzle.removeFromParent();
    if (oldStatus === undefined) delete parentWeaponRoot.userData.assetStatus; else parentWeaponRoot.userData.assetStatus = oldStatus;
    if (oldWeapon === undefined) delete parentWeaponRoot.userData.worldWeapon; else parentWeaponRoot.userData.worldWeapon = oldWeapon;
    attachments.delete(parentWeaponRoot); resolveReady('disposed');
  } };
  attachments.set(parentWeaponRoot, attachment);
  unregister = registerModelDisposer(parentWeaponRoot, () => attachment.dispose());
  parentWeaponRoot.userData.worldWeapon = { id: WORLD_AK47.id, revision: WORLD_AK47.revision, state };
  void lease.template.then(template => {
    if (state === 'disposed') return;
    mount = lease.instance ? template : template.clone(true);
    placeMount();
    const marker = requireNode(mount, 'MuzzleDeviceTip');
    marker.add(muzzle); muzzle.position.set(0, 0, 0); muzzle.quaternion.identity(); muzzle.scale.setScalar(1);
    muzzle.matrixAutoUpdate = true; muzzle.updateMatrix(); muzzle.userData.forward = '-Z';
    for (const part of fallback) part.mesh.visible = false;
    state = 'ready'; parentWeaponRoot.userData.assetStatus = 'imported-world-weapon';
    parentWeaponRoot.userData.worldWeapon = { id: WORLD_AK47.id, revision: WORLD_AK47.revision, state, sha256: WORLD_AK47.sha256 };
    resolveReady('ready');
  }).catch(() => {
    if (state === 'disposed') return;
    restoreMuzzle(); mount?.removeFromParent(); mount = undefined; lease.release();
    for (const part of fallback) part.mesh.visible = part.visible;
    state = 'error'; parentWeaponRoot.userData.worldWeapon = { id: WORLD_AK47.id, revision: WORLD_AK47.revision, state };
    resolveReady('error');
  });
  return attachment;
}
