import { Box3, Group, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease } from '../assets/model-contracts';
import { ak47Source, AK47_ASSET } from '../assets/weapon-catalog';
import { prepareWorldAK47 } from './WorldAK47';

export type WorldWeaponPose = 'lying' | 'upright-rack';
export interface WorldWeaponBinding {
  readonly id: string;
  readonly host: Group;
  readonly fallback: readonly Object3D[];
  readonly pose: WorldWeaponPose;
}
const bindings = new WeakMap<Group, WorldWeaponBinding>();

/** The authored host owns facts/position. Only its old visual children are replaced. */
export function bindGeneratedWorldWeapon(host: Group, id: string, pose: WorldWeaponPose = 'lying'): void {
  if (bindings.has(host)) throw new Error(`Duplicate world weapon host: ${id}`);
  bindings.set(host, { id, host, pose, fallback: [...host.children] });
  host.userData.generatedPropHost = true; // Exclude these old meshes from architecture replacement.
  host.userData.generatedWorldWeapon = { id, assetId: AK47_ASSET.id, pose,
    presentation: 'one complete AK rifle, not disassembled parts' };
}
export function readGeneratedWorldWeaponBindings(root: Group): WorldWeaponBinding[] {
  const result: WorldWeaponBinding[] = [];
  root.traverse(object => { if (object instanceof Group) { const binding = bindings.get(object); if (binding) result.push(binding); } });
  return result;
}

export interface GeneratedWorldWeaponStatus {
  readonly id: string;
  readonly assetId: 'WP-AK47';
  readonly state: 'pending' | 'loading' | 'ready' | 'error' | 'cancelled';
  readonly message?: string;
}
export interface GeneratedWorldWeaponsOptions {
  readonly parent: Group;
  readonly baseURL: string;
  readonly onStatus?: (status: GeneratedWorldWeaponStatus) => void;
}
interface Attached { lease: ModelLease; pose: Group; fallback: Array<{ object: Object3D; visible: boolean }> }

/** Visible geometry only: optional suppressed/optic/spare-magazine meshes never set the resting height. */
function visibleBounds(root: Group): Box3 {
  root.updateMatrixWorld(true);
  const bounds = new Box3(), local = root.matrixWorld.clone().invert();
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(new Matrix4().multiplyMatrices(local, object.matrixWorld)));
  });
  if (bounds.isEmpty() || [...bounds.min.toArray(), ...bounds.max.toArray()].some(value => !Number.isFinite(value))) throw new Error('World weapon has no finite visible geometry');
  return bounds;
}

/** Shared-library owner for dropped/source weapons. No private pool, API, or per-level download path. */
export class GeneratedWorldWeapons {
  readonly ready: Promise<readonly GeneratedWorldWeaponStatus[]>;
  private readonly request = new AbortController();
  private readonly statuses = new Map<string, GeneratedWorldWeaponStatus>();
  private readonly attached = new Set<Attached>();
  private disposed = false;

  constructor(private readonly library: Pick<ModelLibrary, 'acquire'>, private readonly options: GeneratedWorldWeaponsOptions) {
    const entries = readGeneratedWorldWeaponBindings(options.parent);
    for (const entry of entries) {
      if (this.statuses.has(entry.id)) throw new Error(`Duplicate world weapon id: ${entry.id}`);
      this.statuses.set(entry.id, { id: entry.id, assetId: 'WP-AK47', state: 'pending' });
    }
    this.ready = this.load(entries);
  }
  getStatus(): readonly GeneratedWorldWeaponStatus[] { return [...this.statuses.values()].map(status => ({ ...status })); }
  private report(id: string, state: GeneratedWorldWeaponStatus['state'], message?: string): void {
    const status = { id, assetId: 'WP-AK47' as const, state, ...(message ? { message } : {}) };
    this.statuses.set(id, status);
    try { this.options.onStatus?.({ ...status }); } catch { /* Diagnostic observers do not own the lease. */ }
  }
  private async load(entries: readonly WorldWeaponBinding[]): Promise<readonly GeneratedWorldWeaponStatus[]> {
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(2, entries.length) }, async () => {
      while (!this.disposed && cursor < entries.length) await this.attach(entries[cursor++]);
    }));
    return this.getStatus();
  }
  private async attach(entry: WorldWeaponBinding): Promise<void> {
    this.report(entry.id, 'loading');
    let lease: ModelLease | undefined, pose: Group | undefined;
    try {
      lease = await this.library.acquire(ak47Source(this.options.baseURL), { signal: this.request.signal });
      if (this.disposed) { lease.root.removeFromParent(); lease.dispose(); return; }
      if (lease.animations.length) throw new Error('World weapon must use the pinned static AK');
      const calibrated = prepareWorldAK47(lease.root);
      // Preserve the shared helper's sight/grip/source-length calibration. These are
      // rigid whole-gun presentations; no named node is advertised as a new produced part.
      const orientation = new Group(); orientation.name = 'generated-world-weapon-orientation';
      const basis = entry.pose === 'upright-rack'
        ? new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, -1, 0))
        : new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(-1, 0, 0));
      orientation.quaternion.setFromRotationMatrix(basis);
      orientation.add(calibrated);
      pose = new Group(); pose.name = `generated-world-weapon:${entry.id}`; pose.add(orientation);
      const bounds = visibleBounds(pose), center = bounds.getCenter(new Vector3());
      orientation.position.set(-center.x, -bounds.min.y, -center.z);
      lease.root.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      pose.userData.asset = { id: AK47_ASSET.id, sha256: AK47_ASSET.sha256, placement: entry.id,
        length: AK47_ASSET.presentationLengthMeters, calibration: calibrated.userData.calibration,
        pose: entry.pose, presentation: 'complete AK rifle', anchor: 'visible bottom centre at authored host', status: 'geometry-validated-rendering-pending' };
      const fallback = entry.fallback.map(object => ({ object, visible: object.visible }));
      entry.host.add(pose);
      for (const old of fallback) old.object.visible = false;
      this.attached.add({ lease, pose, fallback });
      this.report(entry.id, 'ready');
    } catch (error) {
      pose?.removeFromParent(); lease?.root.removeFromParent(); lease?.dispose();
      if (!this.disposed) this.report(entry.id, 'error', error instanceof Error ? error.message : 'World weapon could not load');
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.request.abort();
    for (const entry of this.attached) {
      entry.pose.removeFromParent(); entry.lease.root.removeFromParent(); entry.lease.dispose(); entry.pose.clear();
      for (const old of entry.fallback) old.object.visible = old.visible;
    }
    this.attached.clear();
    for (const [id, status] of this.statuses) if (status.state === 'pending' || status.state === 'loading') this.statuses.set(id, { ...status, state: 'cancelled' });
  }
}
