import { BufferAttribute, BufferGeometry, Group, MathUtils, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3,
  type InterleavedBufferAttribute } from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelLoadProgress } from '../assets/model-contracts';
import { characterAssetFor, characterSource, type CharacterAsset, type CharacterIdentity } from '../assets/character-catalog';
import { inspectCharacterRig, restoreCharacterRig, type CharacterRig } from './CharacterRig';

export interface FirstPersonArmsStatus {
  state: 'placeholder' | 'loading' | 'ready' | 'error' | 'disposed'; assetId?: string; message?: string; progress?: ModelLoadProgress;
}
export interface FirstPersonArmsPose {
  rightGrip: Vector3; leftSupport: Vector3; reloadFraction: number; magazineGrip?: Vector3;
  /** Carry contacts use the same skin/rig; only the view-frame shoulder placement changes. */
  layout?: 'weapon' | 'carry'; shoulderCenter?: Vector3;
  leftHandDirection?: Vector3; rightHandDirection?: Vector3;
}
interface HandCalibration { palm: Group; offset: Vector3; direction: Vector3; rotation: Quaternion; armLength: number }
interface LoadedArms {
  lease: ModelLease; geometries: BufferGeometry[]; rig: CharacterRig; poser: FirstPersonArmPoser;
  mount: Group; scale: number; shoulderCenter: Vector3; left: HandCalibration; right: HandCalibration;
}
const yAxis = new Vector3(0, 1, 0);
const sourceToView = new Quaternion().setFromAxisAngle(yAxis, Math.PI / 2);
const armName = /^[LR]_(Upperarm|Forearm|Hand)/;
const qAt = (matrix: Matrix4) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix)).normalize();
const bounded = (value: number) => Number.isFinite(value) ? MathUtils.clamp(value, 0, 1) : 0;

/** Copy exact original attribute values, including integer skin indices and normalized UV/color data. */
function selectAttribute(attribute: BufferAttribute | InterleavedBufferAttribute, vertices: readonly number[]): BufferAttribute {
  const values = new (attribute.array.constructor as typeof Float32Array)(vertices.length * attribute.itemSize);
  const interleaved = 'isInterleavedBufferAttribute' in attribute && attribute.isInterleavedBufferAttribute;
  const stride = interleaved ? attribute.data.stride : attribute.itemSize, offset = interleaved ? attribute.offset : 0;
  vertices.forEach((vertex, i) => {
    for (let component = 0; component < attribute.itemSize; component++) values[i * attribute.itemSize + component] = attribute.array[vertex * stride + offset + component];
  });
  const result = new BufferAttribute(values, attribute.itemSize, attribute.normalized); result.name = attribute.name;
  return result;
}

/** Keeps original triangles whose three vertices predominantly belong to the same selected limb. */
export function extractFirstPersonLimbs(mesh: SkinnedMesh, rig: CharacterRig, part: 'arms' | 'legs'): BufferGeometry {
  const source = mesh.geometry, position = source.getAttribute('position'), joints = source.getAttribute('skinIndex'), weights = source.getAttribute('skinWeight');
  if (!position || !joints || !weights || joints.itemSize !== 4 || weights.itemSize !== 4) throw new Error('人物手臂缺少蒙皮属性。');
  const arm = new Int8Array(position.count), point = new Vector3();
  const proximal = part === 'arms' ? 'Upperarm' : 'Thigh';
  const names = part === 'arms' ? armName : /^[LR]_(Thigh|Calf|Foot|ToeBase)/;
  const shoulder = { L: rig.bones.get(`L_${proximal}`)!.getWorldPosition(new Vector3()), R: rig.bones.get(`R_${proximal}`)!.getWorldPosition(new Vector3()) };
  const leftward = shoulder.L.clone().sub(shoulder.R).normalize();
  for (let vertex = 0; vertex < position.count; vertex++) {
    let left = 0, right = 0;
    for (let component = 0; component < 4; component++) {
      const name = mesh.skeleton.bones[joints.getComponent(vertex, component)]?.name;
      if (name && names.test(name)) {
        if (name.startsWith('L_')) left += weights.getComponent(vertex, component); else right += weights.getComponent(vertex, component);
      }
    }
    const side = left >= 0.7 ? 'L' : right >= 0.7 ? 'R' : undefined;
    if (!side) continue;
    point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld).sub(shoulder[side]);
    // Keep shoulder/upper-arm geometry without accepting a torso triangle that
    // happens to have a stray arm weight in this generated mesh.
    if (point.dot(leftward) * (side === 'L' ? 1 : -1) < -0.025) continue;
    if (part === 'legs' && point.y > 0.025) continue;
    arm[vertex] = side === 'L' ? 1 : 2;
  }
  const index = source.index, count = index?.count ?? position.count, selected: number[] = [], vertices: number[] = [], remap = new Map<number, number>();
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [], perArm = [0, 0];
  for (const group of source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }]) {
    const start = selected.length;
    for (let triangle = group.start; triangle + 2 < Math.min(count, group.start + group.count); triangle += 3) {
      const ids = [0, 1, 2].map(k => index ? index.getX(triangle + k) : triangle + k);
      if (!arm[ids[0]] || ids.some(id => arm[id] !== arm[ids[0]])) continue;
      perArm[arm[ids[0]] - 1]++;
      for (const id of ids) {
        let at = remap.get(id); if (at === undefined) { at = vertices.length; vertices.push(id); remap.set(id, at); }
        selected.push(at);
      }
    }
    if (selected.length > start) groups.push({ start, count: selected.length - start, materialIndex: group.materialIndex ?? 0 });
  }
  const geometry = new BufferGeometry();
  try {
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, selectAttribute(attribute, vertices));
    for (const [name, attributes] of Object.entries(source.morphAttributes)) geometry.morphAttributes[name as keyof BufferGeometry['morphAttributes']] = attributes!.map(attribute => selectAttribute(attribute, vertices));
    geometry.morphTargetsRelative = source.morphTargetsRelative; geometry.setIndex(selected);
    for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.name = `${source.name || mesh.name}:first-person-${part}`;
    geometry.userData = { sourceGeometry: source.uuid, sourceVertexIndices: vertices, sourceTriangles: count / 3,
      [part === 'arms' ? 'armTriangles' : 'legTriangles']: { left: perArm[0], right: perArm[1] },
      crop: `same-${part === 'arms' ? 'arm' : 'leg'} skin weight >= 0.7; source triangles and attributes preserved` };
    return geometry;
  } catch (error) { geometry.dispose(); throw error; }
}

export function extractFirstPersonArms(mesh: SkinnedMesh, rig: CharacterRig): BufferGeometry { return extractFirstPersonLimbs(mesh, rig, 'arms'); }

function prepareArms(lease: ModelLease, asset: CharacterAsset, frame: Group): LoadedArms {
  const rig = inspectCharacterRig(lease.root), geometries: BufferGeometry[] = [];
  try {
    let left = 0, right = 0;
    lease.root.traverse(object => {
      if (object instanceof SkinnedMesh) {
        const geometry = extractFirstPersonArms(object, rig); geometries.push(geometry); object.geometry = geometry;
        left += geometry.userData.armTriangles.left; right += geometry.userData.armTriangles.right;
        object.visible = !!geometry.index?.count; object.frustumCulled = false;
      } else if (object instanceof Mesh) object.visible = false;
      object.renderOrder = 2;
      if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
    });
    if (left < 100 || right < 100) throw new Error('人物手臂三角面不足，保留占位手臂。');
    const scale = asset.heightMeters / rig.bounds.getSize(new Vector3()).y;
    const shoulderCenter = rig.bones.get('L_Upperarm')!.getWorldPosition(new Vector3()).add(rig.bones.get('R_Upperarm')!.getWorldPosition(new Vector3())).multiplyScalar(0.5);
    const hand = (side: 'L' | 'R'): HandCalibration => {
      const bone = rig.bones.get(`${side}_Hand`)!, inverse = bone.matrixWorld.clone().invert(), offset = new Vector3(); let count = 0;
      lease.root.traverse(object => {
        if (!(object instanceof SkinnedMesh)) return;
        const position = object.geometry.getAttribute('position'), joints = object.geometry.getAttribute('skinIndex'), weights = object.geometry.getAttribute('skinWeight');
        for (let vertex = 0; vertex < position.count; vertex++) {
          let handWeight = 0;
          for (let component = 0; component < 4; component++) if (object.skeleton.bones[joints.getComponent(vertex, component)]?.name === bone.name) handWeight += weights.getComponent(vertex, component);
          if (handWeight < 0.8) continue;
          offset.add(new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(object.matrixWorld).applyMatrix4(inverse)); count++;
        }
      });
      if (count < 3) throw new Error(`缺少 ${side} 手掌几何。`);
      offset.divideScalar(count);
      const restRotation = qAt(rig.nodes.find(node => node.name === bone.name)!.world), direction = offset.clone().applyQuaternion(restRotation).normalize();
      const palm = new Group(); palm.name = `first-person-palm-${side}`; palm.position.copy(offset); bone.add(palm);
      const upper = rig.bones.get(`${side}_Upperarm`)!.getWorldPosition(new Vector3()), elbow = rig.bones.get(`${side}_Forearm`)!.getWorldPosition(new Vector3()), wrist = bone.getWorldPosition(new Vector3());
      return { palm, offset, direction, rotation: restRotation, armLength: (upper.distanceTo(elbow) + elbow.distanceTo(wrist)) * scale };
    };
    const leftHand = hand('L'), rightHand = hand('R'), mount = new Group(); mount.name = 'first-person-arms-calibration';
    mount.scale.setScalar(scale); mount.quaternion.copy(sourceToView); mount.add(lease.root);
    mount.userData.calibration = { assetId: asset.id, sourceSHA256: asset.sourceSha256, runtimeSHA256: asset.sha256, heightMeters: asset.heightMeters,
      leftTriangles: left, rightTriangles: right, geometry: 'cropped from original production skin', visualAcceptance: 'NOT_REVIEWED', handShape: 'Original rigid generated hands; finger articulation unavailable' };
    return { lease, geometries, rig, poser: new FirstPersonArmPoser(rig, frame), mount, scale, shoulderCenter, left: leftHand, right: rightHand };
  } catch (error) { for (const geometry of geometries) geometry.dispose(); throw error; }
}


/** Viewmodel-only IK; the full-body animation module does not own hand contacts. */
class FirstPersonArmPoser {
  private rest;
  private frameInverse = new Matrix4();
  constructor(private rig: CharacterRig, private frame: Group) { this.rest = new Map(rig.nodes.map(node => [node.name, node])); }
  private position(name: string): Vector3 { return this.rig.bones.get(name)!.getWorldPosition(new Vector3()).applyMatrix4(this.frameInverse); }
  private frameRotation(name: string, quaternion: Quaternion): void {
    const bone = this.rig.bones.get(name)!;
    bone.parent!.updateWorldMatrix(true, false);
    const parentRotation = qAt(new Matrix4().multiplyMatrices(this.frameInverse, bone.parent!.matrixWorld));
    bone.quaternion.copy(parentRotation.invert().multiply(quaternion).normalize());
    bone.updateWorldMatrix(false, true);
  }

  /** Two-link arm IK with a fixed bend-plane roll basis, for viewmodel hand contacts. */
  arm(side: 'L' | 'R', target: Vector3, pole: Vector3, handRotation: Quaternion): number {
    // Solve in the arms/weapon frame. Removing the full ancestor affine matrix
    // first keeps even non-uniformly scaled parents out of the IK rotations.
    this.frame.updateWorldMatrix(true, false); this.frameInverse.copy(this.frame.matrixWorld).invert();
    const upper = this.rig.bones.get(`${side}_Upperarm`)!, forearm = this.rig.bones.get(`${side}_Forearm`)!, hand = this.rig.bones.get(`${side}_Hand`)!;
    const shoulder = this.position(upper.name), elbow = this.position(forearm.name), wrist = this.position(hand.name);
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist), direction = target.clone().sub(shoulder);
    const distance = Math.max(Math.abs(a - b) + 1e-5, Math.min(a + b - 1e-5, direction.length()));
    if (direction.lengthSq() < 1e-12) direction.set(0, 0, -1); else direction.normalize();
    const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
    if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
    bend.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const desiredElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    const restAt = (name: string) => new Vector3().setFromMatrixPosition(this.rest.get(name)!.world);
    const originalUpper = restAt(forearm.name).sub(restAt(upper.name)).normalize();
    const originalLower = restAt(hand.name).sub(restAt(forearm.name)).normalize();
    const restNormal = originalUpper.clone().cross(originalLower).normalize(), normal = direction.clone().cross(bend).normalize();
    const orient = (name: string, initial: Vector3, desired: Vector3) => {
      const axis = desired.normalize();
      const from = new Matrix4().makeBasis(initial, restNormal.clone().cross(initial).normalize(), restNormal);
      const to = new Matrix4().makeBasis(axis, normal.clone().cross(axis).normalize(), normal);
      this.frameRotation(name, qAt(to.multiply(from.invert())).multiply(qAt(this.rest.get(name)!.world)));
    };
    orient(upper.name, originalUpper, desiredElbow.clone().sub(shoulder));
    orient(forearm.name, originalLower, target.clone().sub(this.position(forearm.name)));
    this.frameRotation(hand.name, handRotation);
    return this.position(hand.name).distanceTo(target);
  }
}

/** Asset-backed first-person arms; no gun, physics, camera or gameplay ownership. */
export class FirstPersonArms {
  readonly root = new Group();
  ready: Promise<void> = Promise.resolve();
  private value: FirstPersonArmsStatus = { state: 'placeholder' };
  private loaded?: LoadedArms;
  private request?: AbortController;
  private generation = 0;
  private disposed = false;
  private identity?: CharacterIdentity;
  private baseURL = '';
  private key = '';
  private pose: FirstPersonArmsPose = { rightGrip: new Vector3(0, -0.14, -0.02), leftSupport: new Vector3(-0.055, -0.085, -0.48), reloadFraction: 0 };

  constructor(private readonly library: ModelLibrary, private readonly onStatus: (status: FirstPersonArmsStatus) => void = () => {}) {
    this.root.name = 'first-person-character-arms'; this.root.visible = false;
  }
  get status(): FirstPersonArmsStatus { return { ...this.value }; }

  setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void> {
    if (this.disposed) return this.ready;
    const asset = characterAssetFor(identity), key = asset ? `${asset.id}:${asset.sha256}:${baseURL}` : '';
    if (key && key === this.key && (this.value.state === 'ready' || this.value.state === 'loading')) return this.ready;
    this.identity = { ...identity }; this.baseURL = baseURL; this.key = key;
    this.request?.abort(); this.release();
    const generation = ++this.generation;
    if (!asset) { this.notify({ state: 'placeholder' }); this.ready = Promise.resolve(); return this.ready; }
    const request = new AbortController(); this.request = request;
    this.notify({ state: 'loading', assetId: asset.id, message: '手臂载入中' });
    if (!this.current(generation, request)) return this.ready;
    this.ready = this.load(asset, generation, request); return this.ready;
  }
  retry(): Promise<void> {
    if (!this.identity || this.disposed) return this.ready;
    this.key = ''; return this.setCharacter(this.identity, this.baseURL);
  }
  private notify(status: FirstPersonArmsStatus): void {
    this.value = status; this.root.userData.assetStatus = status.state; this.root.userData.assetId = status.assetId;
    try { this.onStatus({ ...status }); } catch { /* Observers do not own resource lifetime. */ }
  }
  private current(generation: number, request: AbortController): boolean { return !this.disposed && generation === this.generation && !request.signal.aborted; }
  private async load(asset: CharacterAsset, generation: number, request: AbortController): Promise<void> {
    let lease: ModelLease | undefined;
    try {
      lease = await this.library.acquire(characterSource(asset, this.baseURL), { signal: request.signal,
        onProgress: progress => { if (this.current(generation, request)) this.notify({ state: 'loading', assetId: asset.id, progress }); } });
      if (!this.current(generation, request)) { lease.dispose(); return; }
      this.loaded = prepareArms(lease, asset, this.root); this.root.add(this.loaded.mount); this.root.visible = true;
      this.setPose(this.pose); this.request = undefined;
      this.notify({ state: 'ready', assetId: asset.id });
    } catch (error) {
      if (lease && this.loaded?.lease !== lease) lease.dispose();
      if (!this.current(generation, request)) return;
      this.release(); this.request = undefined;
      console.warn(`人物手臂 ${asset.id} 载入失败`, error); this.notify({ state: 'error', assetId: asset.id, message: '手臂载入失败，使用占位手臂' });
    }
  }

  setPose(pose: FirstPersonArmsPose): void {
    if (this.disposed) return;
    this.pose = { ...pose, rightGrip: pose.rightGrip.clone(), leftSupport: pose.leftSupport.clone(), magazineGrip: pose.magazineGrip?.clone(),
      shoulderCenter: pose.shoulderCenter?.clone(), leftHandDirection: pose.leftHandDirection?.clone(), rightHandDirection: pose.rightHandDirection?.clone(), reloadFraction: bounded(pose.reloadFraction) };
    const loaded = this.loaded; if (!loaded) return;
    const { rig, mount, scale, poser } = loaded; restoreCharacterRig(rig);
    const phase = this.pose.reloadFraction;
    const takingMagazine = MathUtils.smoothstep(phase, 0, 0.16) * (1 - MathUtils.smoothstep(phase, 0.80, 1));
    const magazine = this.pose.magazineGrip ?? this.pose.leftSupport.clone().add(new Vector3(0, -Math.sin(phase * Math.PI) * 0.20, Math.sin(phase * Math.PI) * 0.26));
    const leftGrip = this.pose.leftSupport.clone().lerp(magazine, takingMagazine);
    // Viewmodel shoulder placement preserves each model's scale and limb lengths.
    // The child has its own shorter rig; this is a technical hand placement,
    // never permission to enable child combat or approve the adult rifle fit.
    const armLength = Math.min(loaded.left.armLength, loaded.right.armLength);
    const shoulder = this.pose.shoulderCenter ?? (this.pose.layout === 'carry'
      ? leftGrip.clone().add(this.pose.rightGrip).multiplyScalar(0.5).add(new Vector3(0, armLength * 0.10, armLength * 0.28))
      : new Vector3(0, -0.22, Math.min(0.04, this.pose.leftSupport.z + loaded.left.armLength * 0.82)));
    mount.position.copy(shoulder).sub(loaded.shoulderCenter.clone().applyQuaternion(sourceToView).multiplyScalar(scale));
    this.root.updateWorldMatrix(true, true);
    const errors: number[] = [];
    for (const side of ['L', 'R'] as const) {
      const hand = side === 'L' ? loaded.left : loaded.right, grip = side === 'L' ? leftGrip : this.pose.rightGrip;
      const direction = side === 'L' ? this.pose.leftHandDirection : this.pose.rightHandDirection;
      const finger = direction?.clone().normalize() ?? (side === 'L' ? new Vector3(0.80, -0.12, -0.60).lerp(new Vector3(0.1, -1, 0), takingMagazine).normalize() : new Vector3(-0.06, -1, -0.08).normalize());
      const orientation = new Quaternion().setFromUnitVectors(hand.direction, finger).multiply(hand.rotation).normalize();
      const wrist = grip.clone().sub(hand.offset.clone().applyQuaternion(orientation).multiplyScalar(scale));
      const pole = new Vector3(side === 'L' ? -0.6 : 0.6, -1, 0.18).normalize();
      errors.push(poser.arm(side, wrist, pole, orientation));
    }
    loaded.lease.root.updateMatrixWorld(true);
    this.root.userData.contact = { leftErrorMeters: errors[0], rightErrorMeters: errors[1], reloadFraction: phase, visualAcceptance: 'NOT_REVIEWED' };
  }

  private release(): void {
    const loaded = this.loaded; this.loaded = undefined;
    if (loaded) {
      loaded.mount.removeFromParent(); loaded.lease.root.removeFromParent();
      for (const geometry of loaded.geometries) geometry.dispose();
      loaded.lease.dispose();
    }
    this.root.visible = false; this.root.clear(); delete this.root.userData.contact;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.request?.abort(); this.request = undefined;
    this.release(); this.root.removeFromParent(); this.notify({ state: 'disposed' });
  }
}
