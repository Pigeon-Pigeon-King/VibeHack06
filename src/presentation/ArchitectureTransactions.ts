import { Box3, BufferAttribute, BufferGeometry, Euler, Group, InstancedMesh, Material, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
export type Q4 = readonly [number, number, number, number];
export type ModuleSemantic = 'floor-panel' | 'wall-panel' | 'roof-panel' | 'beam' | 'cargo-container' | 'cover'
  | 'pipe-straight' | 'pipe-elbow' | 'ice-bank' | 'facade-module' | 'arch-shell' | 'bridge-deck' | 'pier' | 'booth' | 'landmark';
export interface ModelLease { root: Group; dispose(): void }
export interface SourceBasis { quaternion: Q4; description: string; evidence: string }
export interface ArchitectureAsset {
  id: string; semantic: ModuleSemantic; basis: SourceBasis;
  /** First source is at distance zero. Every extra source must be a generated/decimated GLB. */
  sourceId: string;
  lods?: readonly { sourceId: string; distance: number }[];
  /** No material guessing: lower LOD node paths/material slots must match the base GLB. */
  materialContract: 'same-node-material-slots';
  fit: 'uniform' | 'bounded-stretch';
  maxAspectDistortion?: number;
  castShadow?: boolean;
}
export interface ArchitecturePlacement {
  id: string; assetId: string; semantic: ModuleSemantic;
  /** Metres, local to parent (environment root by default). No simulation/collider transform is changed. */
  position: V3; size: V3; anchor: 'center' | 'bottom-center'; yaw: number;
  /** Optional spatial chunk; keeps material batching while allowing chunk frustum culling. */
  batchKey?: string;
  /** Optional pitch/roll for beam and pipe axes; rotation order is XYZ with yaw as Y. */
  pitch?: number; roll?: number; parent?: Object3D;
}
export interface VisualTarget { mesh: Mesh; indices?: readonly number[] }
export interface ReplacementSpec { id: string; targets: readonly VisualTarget[]; placements: readonly ArchitecturePlacement[] }
export type JobState = 'loading' | 'ready' | 'error' | 'disposed';
export interface ReplacementReport { id: string; state: JobState; error?: string; placements: number; drawBatches: number }
export interface ReplacementHandle { readonly ready: Promise<ReplacementReport>; readonly report: ReplacementReport; dispose(): void }
export interface ArchitectureOptions {
  assets: readonly ArchitectureAsset[];
  acquire(assetId: string): Promise<ModelLease>;
  /** Connect the owner's pre-traversal disposal hook, or call dispose() before any generic tree cleanup. */
  registerDisposer?(root: Group, callback: () => void): () => void;
}
export interface SourceMeasurement {
  sourceId: string; rawBounds: { min: number[]; max: number[] }; orientedBounds: { min: number[]; max: number[] };
  orientedSize: number[]; materialBatches: number; sourceMeshes: number; triangles: number; basis: SourceBasis;
}
interface Part { geometry: BufferGeometry; material: Material; slots: string[]; renderOrder: number }
interface Compiled { parts: Part[]; bounds: Box3; measurement: SourceMeasurement }
interface Entry { key: string; refs: number; retired: boolean; promise: Promise<Compiled>; lease?: ModelLease; compiled?: Compiled }
interface Level { distance: number; source: Compiled; meshes: InstancedMesh[]; matrices: Matrix4[] }
interface RenderSet { parent: Object3D; root: Group; placements: ArchitecturePlacement[]; levels: Level[]; selected: number[] }
interface TargetSnapshot { mesh: Mesh; visible: boolean; matrices?: Map<number, Matrix4> }
interface Job { spec: ReplacementSpec; report: ReplacementReport; handle: ReplacementHandle; finish(report: ReplacementReport): void;
  entries: Entry[]; sets: RenderSet[]; snapshots: TargetSnapshot[]; released: boolean }

const tuple = (v: readonly number[], n: number) => v.length === n && v.every(Number.isFinite);
const boundsJSON = (b: Box3) => ({ min: b.min.toArray(), max: b.max.toArray() });
const inside = (root: Object3D, node: Object3D): boolean => { for (let p: Object3D | null = node; p; p = p.parent) if (p === root) return true; return false; };
const slotPath = (root: Object3D, node: Object3D): string => {
  const path: string[] = [];
  for (let p = node; p !== root && p.parent; p = p.parent) path.unshift(`${p.parent.children.indexOf(p)}:${p.name}`);
  return path.join('/');
};

/** Own copies only. Bake all attributes, including UV/color/tangent, and all source node transforms. */
function extract(geometry: BufferGeometry, start: number, count: number, transform: Matrix4): BufferGeometry {
  const result = new BufferGeometry();
  const mirrored = transform.determinant() < 0;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (name === 'skinIndex' || name === 'skinWeight') throw new Error('Skinned architecture is not a static module');
    const values = new Float32Array(count * attribute.itemSize);
    for (let i = 0; i < count; i++) {
      const corner = mirrored && i % 3 ? i + (i % 3 === 1 ? 1 : -1) : i;
      const index = geometry.index ? geometry.index.getX(start + corner) : start + corner;
      for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(index, c);
      if (mirrored && name === 'tangent') values[i * attribute.itemSize + 3] *= -1;
    }
    result.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
  }
  result.applyMatrix4(transform);
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}

function compile(root: Group, sourceId: string, basis: SourceBasis): Compiled {
  if (!tuple(basis.quaternion, 4) || Math.abs(new Quaternion(...basis.quaternion).length() - 1) > 1e-4
    || !basis.description || !basis.evidence) throw new Error('An explicit, normalized source basis and evidence are required');
  root.updateWorldMatrix(true, true);
  const parentInverse = root.parent ? root.parent.matrixWorld.clone().invert() : new Matrix4();
  const rotation = new Matrix4().makeRotationFromQuaternion(new Quaternion(...basis.quaternion));
  const rawBounds = new Box3(), oriented = new Box3();
  const groups = new Map<string, { material: Material; pieces: BufferGeometry[]; slots: Set<string>; renderOrder: number }>();
  const owned = new Set<BufferGeometry>(); let sourceMeshes = 0, triangles = 0;
  try {
    root.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh || Object.keys(object.geometry.morphAttributes).length) throw new Error('Animated architecture requires a dedicated actor');
      sourceMeshes++;
      const geometry = object.geometry, available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
      const ranges = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: available, materialIndex: 0 }];
      if (!ranges.length) throw new Error('Multi-material geometry has no material groups');
      const local = new Matrix4().multiplyMatrices(parentInverse, object.matrixWorld);
      for (let instance = 0; instance < (object instanceof InstancedMesh ? object.count : 1); instance++) {
        const matrix = local.clone();
        if (object instanceof InstancedMesh) { const m = new Matrix4(); object.getMatrixAt(instance, m); matrix.multiply(m); }
        for (const range of ranges) {
          const start = Math.max(range.start, geometry.drawRange.start), end = Math.min(range.start + range.count, geometry.drawRange.start + geometry.drawRange.count, available);
          if (end <= start) continue;
          if (start % 3 || (end - start) % 3) throw new Error('Architecture primitives must be triangle lists');
          const index = range.materialIndex ?? 0;
          const material = Array.isArray(object.material) ? object.material[index] : object.material;
          if (!material) throw new Error('Missing source material slot');
          const piece = extract(geometry, start, end - start, matrix); owned.add(piece);
          rawBounds.union(piece.boundingBox!); piece.applyMatrix4(rotation); piece.computeBoundingBox(); oriented.union(piece.boundingBox!);
          triangles += (end - start) / 3;
          // Attribute-layout splits preserve PBR UV/tangent semantics instead of dropping data to force a merge.
          const layout = Object.entries(piece.attributes).map(([name, a]) => `${name}:${a.itemSize}`).sort().join(',');
          const key = `${material.uuid}|${layout}|${object.renderOrder}`;
          let group = groups.get(key);
          if (!group) { group = { material, pieces: [], slots: new Set(), renderOrder: object.renderOrder }; groups.set(key, group); }
          group.pieces.push(piece); group.slots.add(`${slotPath(root, object)}#${index}`);
        }
      }
    });
    if (oriented.isEmpty() || !oriented.getSize(new Vector3()).toArray().every(n => Number.isFinite(n) && n > 0)) throw new Error('Empty or degenerate architecture geometry');
    const parts: Part[] = [];
    for (const group of groups.values()) {
      const merged = mergeGeometries(group.pieces, false);
      if (!merged) throw new Error('Source attribute layouts cannot be merged');
      owned.add(merged); merged.computeBoundingBox(); merged.computeBoundingSphere();
      parts.push({ geometry: merged, material: group.material, slots: [...group.slots], renderOrder: group.renderOrder });
    }
    for (const part of parts) owned.delete(part.geometry);
    return { parts, bounds: oriented, measurement: { sourceId, rawBounds: boundsJSON(rawBounds), orientedBounds: boundsJSON(oriented),
      orientedSize: oriented.getSize(new Vector3()).toArray(), materialBatches: parts.length, sourceMeshes, triangles, basis } };
  } finally { for (const geometry of owned) geometry.dispose(); }
}

function placementMatrix(placement: ArchitecturePlacement, asset: ArchitectureAsset, bounds: Box3): Matrix4 {
  if (!tuple(placement.position, 3) || !tuple(placement.size, 3) || !placement.size.every(n => n > 0)
    || ![placement.yaw, placement.pitch ?? 0, placement.roll ?? 0].every(Number.isFinite)) throw new Error(`Invalid metres/rotation: ${placement.id}`);
  const size = bounds.getSize(new Vector3()), scale = new Vector3(...placement.size).divide(size);
  const ratios = scale.toArray(), distortion = Math.max(...ratios) / Math.min(...ratios);
  const limit = asset.fit === 'uniform' ? 1.025 : asset.maxAspectDistortion ?? 1.35;
  if (distortion > limit) throw new Error(`${placement.id}: measured source ${size.toArray().join('/')} cannot fit target ${placement.size.join('/')} within ${limit} aspect ratio`);
  if (asset.fit === 'uniform') scale.setScalar(Math.min(...ratios));
  const center = bounds.getCenter(new Vector3()); if (placement.anchor === 'bottom-center') center.y = bounds.min.y;
  return new Matrix4().compose(new Vector3(...placement.position), new Quaternion().setFromEuler(new Euler(placement.pitch ?? 0, placement.yaw, placement.roll ?? 0)), scale)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
}

/** An environment-owned visual transaction manager. It never reads or edits collision/navigation data. */
export class ArchitectureTransactions {
  private readonly catalog = new Map<string, ArchitectureAsset>();
  private readonly entries = new Map<string, Entry>();
  private readonly jobs = new Map<string, Job>();
  private readonly generatedRoots = new Set<Group>();
  private readonly declarations = new Map<Object3D, { kind: 'information' | 'existing-generated'; reason: string }>();
  private readonly measurements = new Map<string, SourceMeasurement>();
  private readonly cameraPoint = new Vector3();
  private readonly worldPlacement = new Vector3();
  private disposed = false;
  private unregister: () => void;
  constructor(readonly environment: Group, private readonly options: ArchitectureOptions) {
    for (const asset of options.assets) {
      if (this.catalog.has(asset.id)) throw new Error(`Duplicate architecture asset ${asset.id}`);
      let prior = 0;
      for (const lod of asset.lods ?? []) { if (!Number.isFinite(lod.distance) || lod.distance <= prior) throw new Error('LOD distances must increase above zero'); prior = lod.distance; }
      this.catalog.set(asset.id, asset);
    }
    this.unregister = options.registerDisposer?.(environment, () => this.dispose()) ?? (() => {});
  }
  private retain(sourceId: string, basis: SourceBasis): Entry {
    const key = JSON.stringify([sourceId, basis.quaternion]); let entry = this.entries.get(key);
    if (!entry) {
      const current: Entry = { key, refs: 0, retired: false, promise: undefined! }; this.entries.set(key, current); entry = current;
      current.promise = Promise.resolve().then(() => {
        if (current.retired) throw new Error('Architecture owner disposed');
        return this.options.acquire(sourceId);
      }).then(lease => {
        if (current.retired) { lease.root.removeFromParent(); lease.dispose(); throw new Error('Architecture result arrived late'); }
        current.lease = lease;
        current.compiled = compile(lease.root, sourceId, basis);
        this.measurements.set(key, current.compiled.measurement);
        return current.compiled;
      });
    }
    entry.refs++; return entry;
  }
  private release(entry: Entry): void {
    if (entry.retired || --entry.refs > 0) return;
    entry.retired = true; this.entries.delete(entry.key);
    // These geometries are our baked copies. Materials/textures belong solely to the lease owner.
    for (const part of entry.compiled?.parts ?? []) part.geometry.dispose();
    entry.lease?.root.removeFromParent(); entry.lease?.dispose(); entry.lease = undefined; entry.compiled = undefined;
  }
  replaceMesh(id: string, mesh: Mesh, placements: readonly ArchitecturePlacement[]): ReplacementHandle {
    if (mesh instanceof InstancedMesh) throw new Error('Use replaceBatch for explicit instance ownership');
    return this.replace({ id, targets: [{ mesh }], placements });
  }
  replaceBatch(id: string, mesh: InstancedMesh, indices: readonly number[], placements: readonly ArchitecturePlacement[]): ReplacementHandle {
    return this.replace({ id, targets: [{ mesh, indices }], placements });
  }
  replace(spec: ReplacementSpec): ReplacementHandle {
    if (this.disposed || this.jobs.has(spec.id)) throw new Error('Architecture owner disposed or replacement ID duplicated');
    if (!spec.placements.length) throw new Error('Architecture needs explicit placements');
    const ids = new Set<string>();
    for (const placement of spec.placements) {
      const asset = this.catalog.get(placement.assetId);
      if (!asset || asset.semantic !== placement.semantic) throw new Error(`Unmapped semantic: ${placement.id}`);
      if (ids.has(placement.id)) throw new Error(`Duplicate placement: ${placement.id}`); ids.add(placement.id);
      if (!inside(this.environment, placement.parent ?? this.environment)) throw new Error('Placement parent is outside its environment');
    }
    const claimed: VisualTarget[] = [];
    for (const target of spec.targets) {
      if (!inside(this.environment, target.mesh)) throw new Error('Visual target is outside its environment');
      if (target.indices && (!(target.mesh instanceof InstancedMesh) || !target.indices.length || new Set(target.indices).size !== target.indices.length
        || target.indices.some(i => !Number.isInteger(i) || i < 0 || i >= (target.mesh as InstancedMesh).count))) throw new Error('Invalid target instance indices');
      if (claimed.some(other => other.mesh === target.mesh && (!other.indices || !target.indices || other.indices.some(i => target.indices!.includes(i))))) throw new Error('Duplicate target inside replacement');
      claimed.push(target);
      for (const job of this.jobs.values()) if (!job.released && job.spec.targets.some(other => other.mesh === target.mesh
        && (!other.indices || !target.indices || other.indices.some(i => target.indices!.includes(i))))) throw new Error('Visual target already belongs to a live replacement');
    }
    let finish!: (report: ReplacementReport) => void;
    const ready = new Promise<ReplacementReport>(resolve => { finish = resolve; });
    const report: ReplacementReport = { id: spec.id, state: 'loading', placements: spec.placements.length, drawBatches: 0 };
    const job = { spec, report, entries: [], sets: [], snapshots: [], released: false, finish } as unknown as Job;
    job.handle = { ready, report, dispose: () => this.disposeJob(job) }; this.jobs.set(spec.id, job);
    void this.prepare(job); return job.handle;
  }
  private async prepare(job: Job): Promise<void> {
    try {
      const used = new Map<string, { asset: ArchitectureAsset; entries: Entry[] }>();
      for (const p of job.spec.placements) if (!used.has(p.assetId)) {
        const asset = this.catalog.get(p.assetId)!;
        const entries = [asset.sourceId, ...(asset.lods ?? []).map(lod => lod.sourceId)].map(id => this.retain(id, asset.basis));
        job.entries.push(...entries); used.set(p.assetId, { asset, entries });
      }
      await Promise.all(job.entries.map(entry => entry.promise));
      if (job.released) return;
      const sets = new Map<string, { parent: Object3D; asset: ArchitectureAsset; entries: Entry[]; placements: ArchitecturePlacement[] }>();
      for (const p of job.spec.placements) {
        const parent = p.parent ?? this.environment, key = `${parent.uuid}|${p.assetId}|${p.batchKey ?? ''}`;
        let set = sets.get(key);
        if (!set) { set = { parent, ...used.get(p.assetId)!, placements: [] }; sets.set(key, set); }
        set.placements.push(p);
      }
      for (const set of sets.values()) {
        const root = new Group(); root.name = `generated-architecture:${job.spec.id}:${set.asset.id}`;
        // Start with generated coarse geometry, avoiding an all-high-detail first frame on large tiled floors.
        const render: RenderSet = { parent: set.parent, root, placements: set.placements, levels: [], selected: set.placements.map(() => set.entries.length - 1) };
        job.sets.push(render);
        const canonical = new Map<string, Material>();
        for (const part of set.entries[0].compiled!.parts) for (const slot of part.slots) canonical.set(slot, part.material);
        for (const [levelIndex, entry] of set.entries.entries()) {
          const source = entry.compiled!;
          // Keep one physical normalization for every level. Simplification can discard extremal
          // vertices; independently refitting its smaller bounds would make the module swell/pop.
          const matrices = set.placements.map(p => placementMatrix(p, set.asset, set.entries[0].compiled!.bounds));
          const level: Level = { distance: levelIndex ? set.asset.lods![levelIndex - 1].distance : 0, source, matrices, meshes: [] }; render.levels.push(level);
          for (const part of source.parts) {
            const materials = new Set(part.slots.map(slot => canonical.get(slot)));
            const material = [...materials][0];
            if (materials.size !== 1 || !material || material.name !== part.material.name || material.type !== part.material.type) throw new Error(`LOD material slot mismatch: ${set.asset.id}`);
            const mesh = new InstancedMesh(part.geometry, material, set.placements.length); level.meshes.push(mesh);
            mesh.name = `${set.asset.id}:lod${levelIndex}:${material.name || 'material'}`; mesh.renderOrder = part.renderOrder;
            mesh.castShadow = set.asset.castShadow ?? false; mesh.receiveShadow = true; root.add(mesh);
            mesh.userData.generatedArchitecture = { assetId: set.asset.id, sourceId: source.measurement.sourceId, materialSourceId: set.asset.sourceId, placementIds: set.placements.map(p => p.id) };
          }
        }
        this.writeInstances(render);
      }
      // Entire transaction is prepared before any visual target changes. No asynchronous work after this point.
      for (const target of job.spec.targets) {
        if (!inside(this.environment, target.mesh)) throw new Error('Visual target was detached while loading');
        if (target.indices && target.indices.some(i => i >= (target.mesh as InstancedMesh).count)) throw new Error('Target batch changed while loading');
      }
      for (const render of job.sets) {
        if (!inside(this.environment, render.parent)) throw new Error('Placement parent was detached while loading');
        render.parent.add(render.root); this.generatedRoots.add(render.root);
      }
      for (const target of job.spec.targets) {
        const snapshot: TargetSnapshot = { mesh: target.mesh, visible: target.mesh.visible }; job.snapshots.push(snapshot);
        if (target.indices) {
          const batch = target.mesh as InstancedMesh; snapshot.matrices = new Map();
          for (const index of target.indices) { const original = new Matrix4(); batch.getMatrixAt(index, original); snapshot.matrices.set(index, original); batch.setMatrixAt(index, new Matrix4().makeScale(0, 0, 0)); }
          batch.instanceMatrix.needsUpdate = true;
        } else target.mesh.visible = false;
      }
      job.report.state = 'ready'; job.report.drawBatches = job.sets.reduce((n, set) => n + set.levels.reduce((m, level) => m + level.meshes.length, 0), 0);
      job.finish({ ...job.report });
    } catch (error) {
      if (job.released) return;
      this.cleanup(job); job.report.state = 'error'; job.report.error = error instanceof Error ? error.message : 'Architecture replacement failed'; job.finish({ ...job.report });
    }
  }
  private writeInstances(set: RenderSet): void {
    for (let n = 0; n < set.levels.length; n++) {
      const level = set.levels[n];
      for (const mesh of level.meshes) {
        let count = 0;
        for (let i = 0; i < set.placements.length; i++) if (set.selected[i] === n) mesh.setMatrixAt(count++, level.matrices[i]);
        mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true;
        if (count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
      }
    }
  }
  /** Distances select generated geometry only. A far model never re-enables its whitebox target. */
  update(cameraPosition: V3 | Vector3): void {
    if (this.disposed) return;
    const camera = cameraPosition instanceof Vector3 ? cameraPosition : this.cameraPoint.set(...cameraPosition);
    for (const job of this.jobs.values()) if (job.report.state === 'ready') for (const set of job.sets) {
      set.parent.updateWorldMatrix(true, false); let changed = false;
      for (let i = 0; i < set.placements.length; i++) {
        const distanceSquared = this.worldPlacement.set(...set.placements[i].position).applyMatrix4(set.parent.matrixWorld).distanceToSquared(camera);
        let chosen = 0; for (let n = 1; n < set.levels.length; n++) if (distanceSquared >= set.levels[n].distance ** 2) chosen = n;
        if (chosen !== set.selected[i]) { set.selected[i] = chosen; changed = true; }
      }
      if (changed) this.writeInstances(set);
    }
  }
  declareInformation(node: Object3D, reason: string): void { this.declare(node, 'information', reason); }
  declareExistingGenerated(node: Object3D, assetId: string): void { this.declare(node, 'existing-generated', assetId); }
  private declare(node: Object3D, kind: 'information' | 'existing-generated', reason: string): void {
    if (!inside(this.environment, node) || !reason) throw new Error('Declaration needs an owned node and explicit evidence');
    this.declarations.set(node, { kind, reason });
  }
  coverage(): { sources: SourceMeasurement[]; replacements: ReplacementReport[]; visible: { uuid: string; name: string; status: string; reason?: string; uncoveredInstances?: number[] }[] } {
    const visible: ReturnType<ArchitectureTransactions['coverage']>['visible'] = [];
    this.environment.traverseVisible(node => {
      if (!(node instanceof Mesh)) return;
      let declared: { kind: string; reason: string } | undefined;
      for (let p: Object3D | null = node; p; p = p.parent) {
        if (this.generatedRoots.has(p as Group)) return;
        declared ??= this.declarations.get(p);
      }
      if (declared) { visible.push({ uuid: node.uuid, name: node.name, status: declared.kind, reason: declared.reason }); return; }
      const covered = new Set<number>(); let pending = false;
      for (const job of this.jobs.values()) for (const target of job.spec.targets) if (target.mesh === node) {
        if (job.report.state === 'ready') for (const index of target.indices ?? []) covered.add(index);
        else if (job.report.state === 'loading') pending = true;
      }
      const uncovered = node instanceof InstancedMesh ? Array.from({ length: node.count }, (_, i) => i).filter(i => !covered.has(i)) : undefined;
      if (uncovered && !uncovered.length) return;
      visible.push({ uuid: node.uuid, name: node.name, status: 'uncovered', ...(pending ? { reason: 'replacement-pending' } : {}), ...(uncovered ? { uncoveredInstances: uncovered } : {}) });
    });
    return { sources: [...this.measurements.values()], replacements: [...this.jobs.values()].map(job => ({ ...job.report })), visible };
  }
  private cleanup(job: Job): void {
    if (job.released) return; job.released = true;
    // Detach borrowed-material draws before releasing any lease or allowing the owner's generic traversal.
    for (const set of job.sets) {
      set.root.removeFromParent(); this.generatedRoots.delete(set.root);
      for (const level of set.levels) for (const mesh of level.meshes) mesh.dispose(); set.root.clear();
    }
    for (const snapshot of job.snapshots) {
      snapshot.mesh.visible = snapshot.visible;
      if (snapshot.matrices) { const batch = snapshot.mesh as InstancedMesh; for (const [index, matrix] of snapshot.matrices) batch.setMatrixAt(index, matrix); batch.instanceMatrix.needsUpdate = true; }
    }
    for (const entry of job.entries) this.release(entry);
    job.entries = []; job.sets = []; job.snapshots = [];
  }
  private disposeJob(job: Job): void { this.cleanup(job); job.report.state = 'disposed'; job.finish({ ...job.report }); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.unregister();
    for (const job of this.jobs.values()) this.disposeJob(job); this.declarations.clear();
  }
}
