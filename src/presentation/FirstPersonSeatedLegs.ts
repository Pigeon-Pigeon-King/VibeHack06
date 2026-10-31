import { Box2, Box3, BufferAttribute, BufferGeometry, Group, Matrix3, Matrix4, Mesh, Quaternion, Ray, SkinnedMesh, Vector2, Vector3 } from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease } from '../assets/model-contracts';
import { characterAssetFor, characterSource, type CharacterAsset, type CharacterIdentity } from '../assets/character-catalog';
import { sceneAssetSource, SCENE_ASSETS } from '../assets/scene-asset-catalog';
import { CharacterBonePoser, inspectCharacterRig, restoreCharacterRig, type CharacterRig } from './CharacterRig';
import { extractFirstPersonLimbs, type FirstPersonArmsStatus } from './FirstPersonArms';

const sourceToView = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
const braceAsset = SCENE_ASSETS['PROP-ARMOR-LEFT-BRACE'];
interface Loaded {
  body: ModelLease; brace: ModelLease; geometries: BufferGeometry[]; mount: Group; braceMount: Group;
  rig: CharacterRig; poser: CharacterBonePoser; scale: number; proportion: number;
  hipCenter: Vector3; feet: Record<'L' | 'R', Vector3>; braceParts: BracePart[]; braceFitted: boolean;
}

interface BracePart {
  name: 'thigh-cuff' | 'knee-guard' | 'shin-guard'; bone: 'L_Thigh' | 'L_Calf'; mesh: Mesh; frame: Group;
  profiles: { y: number; points: Vector2[] }[]; centerSource: Vector2; centerSkin: Vector2; scale: Vector3;
}
const braceHingeY = .25;
const braceSections = [
  { name: 'thigh-cuff', bone: 'L_Thigh', planes: [.35, .40, .45] },
  { name: 'knee-guard', bone: 'L_Calf', planes: [-.09, -.06, -.03] },
  { name: 'shin-guard', bone: 'L_Calf', planes: [-.46, -.40, -.34] },
] as const;

/** Clip only along two source-space mechanical seams. New boundary vertices
 * are barycentric samples of the original triangle (including UV/normal); no
 * closing cap or replacement primitive is introduced. The leased source stays intact. */
function braceGeometry(source: BufferGeometry, section: number): BufferGeometry {
  const p = source.getAttribute('position'), input = source.index!, indices: number[] = [], triangles: number[] = [];
  const vertices: { ids: number[]; weights: number[] }[] = [], result = new BufferGeometry(), count = input.count;
  type Vertex = { ids: number[]; weights: number[] };
  const yAt = (v: Vertex) => v.ids.reduce((sum, id, i) => sum + p.getY(id) * v.weights[i], 0);
  const blend = (a: Vertex, b: Vertex, t: number): Vertex => ({ ids: a.ids, weights: a.weights.map((w, i) => w * (1 - t) + b.weights[i] * t) });
  const clip = (polygon: Vertex[], y: number, above: boolean): Vertex[] => {
    const out: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], ya = yAt(a), yb = yAt(b);
      const insideA = above ? ya >= y : ya <= y, insideB = above ? yb >= y : yb <= y;
      if (insideA) out.push(a);
      if (insideA !== insideB) out.push(blend(a, b, (y - ya) / (yb - ya)));
    }
    return out;
  };
  for (const group of source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }]) {
    const start = indices.length;
    for (let t = group.start; t + 2 < Math.min(count, group.start + group.count); t += 3) {
      const ids = [input.getX(t), input.getX(t + 1), input.getX(t + 2)];
      let polygon: Vertex[] = [0, 1, 2].map(i => ({ ids, weights: [0, 1, 2].map(j => i === j ? 1 : 0) }));
      if (section === 0) polygon = clip(polygon, .30, true);
      else { polygon = clip(polygon, .30, false); polygon = clip(polygon, -.23, section === 1); }
      for (let i = 1; i + 1 < polygon.length; i++) {
        triangles.push(t / 3);
        for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) { indices.push(vertices.length); vertices.push(vertex); }
      }
    }
    if (indices.length > start) result.addGroup(start, indices.length - start, group.materialIndex ?? 0);
  }
  try {
    for (const [name, a] of Object.entries(source.attributes)) {
      const values = new Float32Array(vertices.length * a.itemSize);
      vertices.forEach((v, i) => { for (let c = 0; c < a.itemSize; c++) values[i * a.itemSize + c] = v.ids.reduce((sum, id, j) => sum + a.getComponent(id, c) * v.weights[j], 0); });
      result.setAttribute(name, new BufferAttribute(values, a.itemSize));
    }
    result.setIndex(indices); result.computeBoundingBox(); result.computeBoundingSphere();
    result.userData = { sourceGeometry: source.uuid, sourceVertexWeights: vertices, sourceTriangleIndices: triangles, sourceSHA256: braceAsset.sha256,
      derivation: 'source triangles clipped at Y=.30/-.23, barycentric position/UV/normal only; no added surface or cap' };
    return result;
  } catch (error) { result.dispose(); throw error; }
}

/** The authored source is upright +Y, with its front plates on +X and hinge
 * axle along Z. Measure its actual hollow strap, not the outer metal bounding box. */
function aperture(source: BufferGeometry, y: number): Vector2[] {
  const p = source.getAttribute('position'), ix = source.index!, a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  const ray = new Ray(new Vector3(-.06, y, 0)), points: Vector2[] = [];
  for (let n = 0; n < 48; n++) {
    const angle = n / 48 * Math.PI * 2; ray.direction.set(Math.cos(angle), 0, Math.sin(angle)); let nearest = Infinity;
    for (let t = 0; t < ix.count; t += 3) {
      a.fromBufferAttribute(p, ix.getX(t)); b.fromBufferAttribute(p, ix.getX(t + 1)); c.fromBufferAttribute(p, ix.getX(t + 2));
      if (ray.intersectTriangle(a, b, c, false, hit)) nearest = Math.min(nearest, hit.distanceTo(ray.origin));
    }
    if (!Number.isFinite(nearest)) continue; // Authored buckle slots may leave a small opening at a sampled ray.
    points.push(new Vector2(ray.origin.x + ray.direction.x * nearest, ray.direction.z * nearest));
  }
  if (points.length < 32) throw new Error(`支具内圈采样不足：${y}/${points.length}`);
  return points;
}
function cuffFrame(up: Vector3): { front: Vector3; right: Vector3; quaternion: Quaternion } {
  const front = new Vector3(0, 0, -1).addScaledVector(up, up.z).normalize(), right = front.clone().cross(up).normalize();
  return { front, right, quaternion: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(front, up, right)) };
}
function sectionHull(points: Vector2[]): Vector2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Vector2[]) => { const out: Vector2[] = []; for (const p of list) { while (out.length >= 2 && out[out.length - 1].clone().sub(out[out.length - 2]).cross(p.clone().sub(out[out.length - 1])) <= 0) out.pop(); out.push(p); } return out; };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}
function radialLimit(direction: Vector2, polygon: Vector2[], center: Vector2): number {
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i].clone().sub(center), e = polygon[(i + 1) % polygon.length].clone().sub(polygon[i]);
    const cross = direction.cross(e); if (Math.abs(cross) < 1e-12) continue;
    const t = a.cross(e) / cross, u = a.cross(direction) / cross;
    if (t > 0 && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
  }
  return nearest;
}

/** Original protagonist leg skin and articulated pieces of the produced brace. */
export class FirstPersonSeatedLegs {
  readonly root = new Group();
  ready: Promise<void> = Promise.resolve();
  private value: FirstPersonArmsStatus = { state: 'placeholder' };
  private loaded?: Loaded;
  private request?: AbortController;
  private generation = 0;
  private disposed = false;
  private identity?: CharacterIdentity;
  private baseURL = '';
  private key = '';
  private progress = 0;
  private adjusted = false;

  constructor(private readonly library: ModelLibrary, private readonly onStatus: (status: FirstPersonArmsStatus) => void = () => {}) {
    this.root.name = 'first-person-production-seated-legs'; this.root.visible = false;
  }
  get status(): FirstPersonArmsStatus { return { ...this.value }; }
  private notify(status: FirstPersonArmsStatus): void {
    this.value = status; this.root.userData.assetStatus = status.state; this.root.userData.assetId = status.assetId;
    try { this.onStatus({ ...status }); } catch { /* Observer cannot own resource lifetime. */ }
  }
  private current(generation: number, request: AbortController): boolean { return !this.disposed && generation === this.generation && !request.signal.aborted; }

  setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void> {
    if (this.disposed) return this.ready;
    const asset = characterAssetFor(identity), key = asset ? `${asset.id}:${asset.sha256}:${baseURL}` : '';
    if (key && key === this.key && ['ready', 'loading'].includes(this.value.state)) return this.ready;
    this.identity = { ...identity }; this.baseURL = baseURL; this.key = key;
    this.request?.abort(); this.release(); const generation = ++this.generation;
    if (!asset) { this.notify({ state: 'placeholder' }); this.ready = Promise.resolve(); return this.ready; }
    const request = new AbortController(); this.request = request;
    this.notify({ state: 'loading', assetId: asset.id, message: '护理身体载入中' });
    this.ready = this.load(asset, generation, request); return this.ready;
  }
  retry(): Promise<void> { if (!this.identity || this.disposed) return this.ready; this.key = ''; return this.setCharacter(this.identity, this.baseURL); }

  private async load(asset: CharacterAsset, generation: number, request: AbortController): Promise<void> {
    const results = await Promise.allSettled([
      this.library.acquire(characterSource(asset, this.baseURL), { signal: request.signal }),
      this.library.acquire(sceneAssetSource('PROP-ARMOR-LEFT-BRACE', this.baseURL), { signal: request.signal }),
    ]);
    const leases = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!this.current(generation, request)) { leases.forEach(lease => lease.dispose()); return; }
    try {
      const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
      const [body, brace] = leases; this.loaded = this.prepare(body, brace, asset);
      this.root.add(this.loaded.mount, this.loaded.braceMount); this.root.visible = true;
      this.setPose(this.progress, this.adjusted); this.request = undefined; this.notify({ state: 'ready', assetId: asset.id });
    } catch (error) {
      if (this.loaded) this.release(); else leases.forEach(lease => lease.dispose());
      this.request = undefined;
      console.warn(`护理身体 ${asset.id} 载入失败`, error);
      this.notify({ state: 'error', assetId: asset.id, message: '护理身体载入失败，使用占位视图' });
    }
  }

  private prepare(body: ModelLease, brace: ModelLease, asset: CharacterAsset): Loaded {
    const rig = inspectCharacterRig(body.root), geometries: BufferGeometry[] = [];
    try {
      let left = 0, right = 0;
      body.root.traverse(object => {
        if (object instanceof SkinnedMesh) {
          const geometry = extractFirstPersonLimbs(object, rig, 'legs'); geometries.push(geometry); object.geometry = geometry;
          left += geometry.userData.legTriangles.left; right += geometry.userData.legTriangles.right;
          object.visible = !!geometry.index?.count; object.frustumCulled = false;
        } else if (object instanceof Mesh) object.visible = false;
        if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; }
      });
      if (left < 100 || right < 100) throw new Error('护理双腿的源三角面不足。');
      const scale = asset.heightMeters / rig.bounds.getSize(new Vector3()).y, proportion = asset.heightMeters / 1.75;
      const hipCenter = rig.bones.get('L_Thigh')!.getWorldPosition(new Vector3()).add(rig.bones.get('R_Thigh')!.getWorldPosition(new Vector3())).multiplyScalar(.5);
      const foot = (side: 'L' | 'R') => {
        const at = rig.bones.get(`${side}_Foot`)!.getWorldPosition(new Vector3());
        const hip = rig.bones.get(`${side}_Thigh`)!.getWorldPosition(new Vector3()).sub(hipCenter).applyQuaternion(sourceToView).multiplyScalar(scale);
        return new Vector3(hip.x, (at.y - rig.bounds.min.y) * scale, -.52 * proportion);
      };
      const feet = { L: foot('L'), R: foot('R') }, mount = new Group(); mount.name = 'seated-body-calibration';
      mount.scale.setScalar(scale); mount.quaternion.copy(sourceToView); mount.add(body.root);
      const bounds = new Box3().setFromObject(brace.root, true), size = bounds.getSize(new Vector3());
      if (!size.toArray().every(value => Number.isFinite(value) && value > 0)
        || bounds.min.distanceTo(new Vector3(...braceAsset.sourceBounds.min)) > .0001
        || bounds.max.distanceTo(new Vector3(...braceAsset.sourceBounds.max)) > .0001) throw new Error('左膝支具源坐标已改变。');
      const braceMount = new Group(); braceMount.name = 'care-production-left-brace';
      const meshes: Mesh[] = []; brace.root.traverse(o => { if (o instanceof Mesh) meshes.push(o); });
      if (meshes.length !== 1 || meshes[0] instanceof SkinnedMesh || !meshes[0].geometry.index) throw new Error('支具源分件布局已改变。');
      const source = meshes[0]; brace.root.updateWorldMatrix(true, true);
      const local = brace.root.matrixWorld.clone().invert().multiply(source.matrixWorld);
      if (local.elements.some((n, i) => Math.abs(n - (i % 5 === 0 ? 1 : 0)) > 1e-5)) throw new Error('支具源局部轴已改变。');
      const braceParts: BracePart[] = braceSections.map((section, i) => {
        const geometry = braceGeometry(source.geometry, i); geometries.push(geometry);
        const mesh = source.clone(false); mesh.geometry = geometry; mesh.name = `care-brace-${section.name}-source`; mesh.castShadow = false; mesh.receiveShadow = false;
        const frame = new Group(); frame.name = `care-brace-${section.name}`; frame.add(mesh); braceMount.add(frame);
        return { name: section.name, bone: section.bone, mesh, frame,
          profiles: section.planes.map(y => ({ y, points: aperture(source.geometry, y) })),
          centerSource: new Vector2(), centerSkin: new Vector2(), scale: new Vector3(1, .42 * proportion / size.y, 1) };
      });
      braceMount.userData.assetId = braceAsset.id;
      mount.userData.calibration = { assetId: asset.id, sourceSHA256: asset.sourceSha256, runtimeSHA256: asset.sha256,
        geometry: 'original leg triangles/UV/weights, independently posed source skeleton', leftTriangles: left, rightTriangles: right,
        braceSHA256: braceAsset.sha256, visualAcceptance: 'NOT_REVIEWED', braceArticulation: 'original surfaces clipped at source mechanical seams with barycentric UV provenance; thigh cuff follows thigh, knee/shin guards follow calf; source +X faces anterior' };
      return { body, brace, geometries, mount, braceMount, rig, poser: new CharacterBonePoser(body.root, rig), scale, proportion, hipCenter, feet, braceParts, braceFitted: false };
    } catch (error) { geometries.forEach(geometry => geometry.dispose()); throw error; }
  }

  setPose(progress: number, adjusted: boolean): void {
    if (this.disposed) return;
    this.progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0; this.adjusted = adjusted;
    const loaded = this.loaded; if (!loaded) return;
    const { rig, mount, scale, proportion, poser } = loaded; restoreCharacterRig(rig);
    mount.position.set(0, .53 * proportion, -.06 * proportion).sub(loaded.hipCenter.clone().applyQuaternion(sourceToView).multiplyScalar(scale));
    this.root.updateWorldMatrix(true, true);
    const origin = this.root.getWorldPosition(new Vector3()), forward = this.root.localToWorld(new Vector3(0, 0, -1)).sub(origin).normalize();
    const errors: number[] = [];
    for (const side of ['L', 'R'] as const) {
      const target = this.root.localToWorld(loaded.feet[side].clone()); poser.leg(side, target, forward);
      errors.push(rig.bones.get(`${side}_Foot`)!.getWorldPosition(new Vector3()).distanceTo(target));
    }
    const knee = this.root.worldToLocal(rig.bones.get('L_Calf')!.getWorldPosition(new Vector3()));
    const ankle = this.root.worldToLocal(rig.bones.get('L_Foot')!.getWorldPosition(new Vector3()));
    const hip = this.root.worldToLocal(rig.bones.get('L_Thigh')!.getWorldPosition(new Vector3()));
    const adjustment = this.adjusted ? 1 : this.progress;
    this.root.updateMatrixWorld(true);
    if (!loaded.braceFitted) { this.fitBrace(loaded, knee, hip, ankle); loaded.braceFitted = true; }
    for (const part of loaded.braceParts) {
      const up = (part.bone === 'L_Thigh' ? hip.clone().sub(knee) : knee.clone().sub(ankle)).normalize(), frame = cuffFrame(up);
      part.frame.position.copy(knee); part.frame.quaternion.copy(frame.quaternion);
      const loose = 1 + (1 - adjustment) * .035;
      part.mesh.scale.set(part.scale.x * loose, part.scale.y, part.scale.z * loose);
      part.mesh.position.set(part.centerSkin.x - part.centerSource.x * part.mesh.scale.x,
        -braceHingeY * part.scale.y, part.centerSkin.y - part.centerSource.y * part.mesh.scale.z);
    }
    this.root.updateMatrixWorld(true);
    this.root.userData.contact = { leftAnkleErrorMeters: errors[0], rightAnkleErrorMeters: errors[1], adjustment,
      source: 'simulation care progress / brace-adjusted fact', braceFit: 'three source-mesh pieces; measured skin sections, fixed leg lengths', visualAcceptance: 'NOT_REVIEWED' };
  }

  private fitBrace(loaded: Loaded, knee: Vector3, hip: Vector3, ankle: Vector3): void {
    const skins: { mesh: SkinnedMesh; points: Vector3[] }[] = [];
    loaded.body.root.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return; o.skeleton.update();
      const points = Array.from({ length: o.geometry.getAttribute('position').count }, (_, i) => this.root.worldToLocal(o.getVertexPosition(i, new Vector3()).applyMatrix4(o.matrixWorld)).sub(knee));
      skins.push({ mesh: o, points });
    });
    for (const part of loaded.braceParts) {
      const up = (part.bone === 'L_Thigh' ? hip.clone().sub(knee) : knee.clone().sub(ankle)).normalize(), frame = cuffFrame(up);
      const sections = part.profiles.map(profile => {
        const distance = (profile.y - braceHingeY) * part.scale.y, points: Vector2[] = [];
        for (const { mesh, points: vertices } of skins) {
          const ix = mesh.geometry.index!, joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          for (let t = 0; t < ix.count; t += 3) {
            const ids = [0, 1, 2].map(c => ix.getX(t + c)); let relevance = 0;
            for (const v of ids) for (let w = 0; w < 4; w++) if (mesh.skeleton.bones[joints.getComponent(v, w)]?.name.startsWith(part.bone)) relevance += weights.getComponent(v, w);
            if (relevance < 1.2) continue;
            for (let edge = 0; edge < 3; edge++) {
              const a = vertices[ids[edge]], b = vertices[ids[(edge + 1) % 3]], ya = a.dot(up), yb = b.dot(up);
              if ((ya - distance) * (yb - distance) <= 0 && Math.abs(ya - yb) > 1e-9) {
                const p = a.clone().lerp(b, (distance - ya) / (yb - ya)); points.push(new Vector2(p.dot(frame.front), p.dot(frame.right)));
              }
            }
          }
        }
        if (points.length < 8) throw new Error('支具接触处的真实腿部截面不足。');
        return { profile, points };
      });
      const sourceBox = new Box2().setFromPoints(part.profiles.flatMap(p => p.points)), skinBox = new Box2().setFromPoints(sections.flatMap(s => s.points));
      sourceBox.getCenter(part.centerSource); skinBox.getCenter(part.centerSkin);
      const sourceSize = sourceBox.getSize(new Vector2()), skinSize = skinBox.getSize(new Vector2()), clearance = .003 * loaded.proportion;
      part.scale.x = (skinSize.x + clearance * 2) / sourceSize.x; part.scale.z = (skinSize.y + clearance * 2) / sourceSize.y;
      // A circular cuff cannot fit a block-shaped limb by uniform enlargement:
      // that leaves an empty halo and can reach the other leg. Seat only this
      // independent source shell radially around the measured skin outline,
      // preserving its authored wall thickness, axial coordinates and UVs.
      const envelope = sectionHull(sections.flatMap(s => s.points));
      const profiles = sections.map(s => ({ y: s.profile.y, source: s.profile.points, skin: envelope })).sort((a, b) => a.y - b.y);
      const warp = (point: Vector3): Vector3 => {
        const radial = new Vector2((point.x - part.centerSource.x) * part.scale.x, (point.z - part.centerSource.y) * part.scale.z), radius = radial.length();
        if (radius < 1e-8) return point.clone();
        radial.divideScalar(radius);
        const sourceDirection = new Vector2(radial.x / part.scale.x, radial.y / part.scale.z);
        const offsetAt = (profile: typeof profiles[number]) => {
          const inner = radialLimit(sourceDirection, profile.source, part.centerSource), body = radialLimit(radial, profile.skin, part.centerSkin);
          if (!Number.isFinite(inner) || !Number.isFinite(body)) throw new Error(`支具接触截面不完整：${part.name}/${profile.y}/${inner}/${body}`);
          return body + clearance - inner;
        };
        let lo = profiles[0], hi = lo;
        for (const profile of profiles) { if (profile.y <= point.y) lo = profile; if (profile.y >= point.y) { hi = profile; break; } hi = profile; }
        const t = hi.y === lo.y ? 0 : Math.max(0, Math.min(1, (point.y - lo.y) / (hi.y - lo.y)));
        const next = radius + offsetAt(lo) * (1 - t) + offsetAt(hi) * t;
        return new Vector3(part.centerSource.x + radial.x * next / part.scale.x, point.y, part.centerSource.y + radial.y * next / part.scale.z);
      };
      const geometry = part.mesh.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
      geometry.userData.sourcePosition = Array.from(position.array); geometry.userData.sourceNormal = normal ? Array.from(normal.array) : undefined;
      const normalMatrix = new Matrix3(), step = .0001;
      for (let i = 0; i < position.count; i++) {
        const original = new Vector3().fromBufferAttribute(position, i), changed = warp(original); position.setXYZ(i, changed.x, changed.y, changed.z);
        if (normal) {
          const dx = warp(original.clone().add(new Vector3(step, 0, 0))).sub(changed).divideScalar(step);
          const dy = warp(original.clone().add(new Vector3(0, step, 0))).sub(changed).divideScalar(step);
          const dz = warp(original.clone().add(new Vector3(0, 0, step))).sub(changed).divideScalar(step);
          normalMatrix.set(dx.x, dy.x, dz.x, dx.y, dy.y, dz.y, dx.z, dy.z, dz.z).invert().transpose();
          const n = new Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize(); normal.setXYZ(i, n.x, n.y, n.z);
        }
      }
      position.needsUpdate = true; if (normal) normal.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      part.frame.userData.fit = { sourceSHA256: braceAsset.sha256, bone: part.bone, sourcePlanes: part.profiles.map(p => p.y),
        sourceCenter: part.centerSource.toArray(), skinCenter: part.centerSkin.toArray(), scale: part.scale.toArray(), clearanceMeters: clearance,
        rule: 'owned source shell radially seated around posed limb cross sections; source wall thickness/UV preserved; no body vertex or bone translation changes' };
    }
  }

  private release(): void {
    const loaded = this.loaded; this.loaded = undefined;
    if (loaded) {
      loaded.mount.removeFromParent(); loaded.braceMount.removeFromParent();
      loaded.geometries.forEach(geometry => geometry.dispose()); loaded.body.dispose(); loaded.brace.dispose();
    }
    this.root.clear(); this.root.visible = false; delete this.root.userData.contact;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.request?.abort(); this.request = undefined;
    this.release(); this.root.removeFromParent(); this.notify({ state: 'disposed' });
  }
}
