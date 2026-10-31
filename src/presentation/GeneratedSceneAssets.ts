import { Box3, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { readGeneratedPropBindings, type GeneratedPropBinding } from './GeneratedPropBindings';
import type { ScenarioId } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease } from '../assets/model-contracts';
import { generatedScenePlacements, SCENE_ASSETS, sceneAssetSource, type SceneAssetId, type SceneAssetPlacement } from '../assets/scene-asset-catalog';

export interface GeneratedSceneAssetStatus {
  readonly id: string;
  readonly assetId: SceneAssetId;
  readonly state: 'pending' | 'loading' | 'ready' | 'error' | 'cancelled';
  readonly message?: string;
}

export interface GeneratedSceneAssetsOptions {
  readonly parent: Group;
  readonly scenario: ScenarioId;
  /** The same resolved document/build base used by the other project-local model sources. */
  readonly baseURL: string;
  readonly onStatus?: (status: GeneratedSceneAssetStatus) => void;
  readonly placements?: readonly SceneAssetPlacement[];
}

interface Prepared {
  readonly placement: SceneAssetPlacement;
  readonly lease: ModelLease;
  readonly mount: Group;
  released: boolean;
}

/**
 * Scene props and state-bound attachments borrowed from the shared ModelLibrary. Construct after
 * PortKit.flush(), then dispose BEFORE the environment's generic tree disposal.
 * A missing visual slot or failed load leaves all procedural gameplay geometry.
 */
export class GeneratedSceneAssets {
  readonly root = new Group();
  readonly ready: Promise<readonly GeneratedSceneAssetStatus[]>;
  private readonly request = new AbortController();
  private readonly statuses = new Map<string, GeneratedSceneAssetStatus>();
  private readonly prepared = new Set<Prepared>();
  private readonly swapped = new Map<Object3D, boolean>();
  private readonly swappedInstances = new Map<InstancedMesh, Map<number, Matrix4>>();
  private disposed = false;

  constructor(private readonly library: Pick<ModelLibrary, 'acquire'>, private readonly options: GeneratedSceneAssetsOptions) {
    const placements = options.placements ?? generatedScenePlacements(options.scenario);
    const bindings = readGeneratedPropBindings(options.parent);
    for (const placement of [...placements, ...bindings.flatMap(binding => binding.placements)]) {
      if (this.statuses.has(placement.id)) throw new Error(`Duplicate generated scene placement: ${placement.id}`);
      this.statuses.set(placement.id, { id: placement.id, assetId: placement.assetId, state: 'pending' });
    }
    this.root.name = `generated-scene-assets:${options.scenario}`;
    this.root.userData.resourceOwner = 'ModelLibrary leases; dispose GeneratedSceneAssets before traversing environment';
    options.parent.add(this.root);
    this.ready = this.load(placements, bindings);
  }

  getStatus(): readonly GeneratedSceneAssetStatus[] {
    return [...this.statuses.values()].map(status => ({ ...status }));
  }

  private report(placement: SceneAssetPlacement, state: GeneratedSceneAssetStatus['state'], message?: string): void {
    const status = { id: placement.id, assetId: placement.assetId, state, ...(message ? { message } : {}) };
    this.statuses.set(placement.id, status);
    // A diagnostic observer must not break another scene's shared acquisition.
    try { this.options.onStatus?.({ ...status }); } catch { /* Observer owns its errors. */ }
  }

  private async load(placements: readonly SceneAssetPlacement[], bindings: readonly GeneratedPropBinding[]): Promise<readonly GeneratedSceneAssetStatus[]> {
    const grouped = new Map<string, SceneAssetPlacement[]>();
    for (const placement of placements) {
      const key = placement.fallbackSlot ? `slot:${placement.fallbackSlot}` : `item:${placement.id}`;
      const group = grouped.get(key) ?? []; group.push(placement); grouped.set(key, group);
    }
    const groups: Array<{ placements: readonly SceneAssetPlacement[]; binding?: GeneratedPropBinding }> = [
      ...[...grouped.values()].map(placements => ({ placements })),
      ...bindings.map(binding => ({ placements: binding.placements, binding })),
    ];
    let cursor = 0;
    // Avoid starting every PBR download/decode at once. The library
    // remains the sole template cache and shares repeated bench instances.
    await Promise.all(Array.from({ length: Math.min(2, groups.length) }, async () => {
      while (!this.disposed && cursor < groups.length) { const group = groups[cursor++]; await this.loadGroup(group.placements, group.binding); }
    }));
    return this.getStatus();
  }

  private async loadGroup(placements: readonly SceneAssetPlacement[], binding?: GeneratedPropBinding): Promise<void> {
    const slot = binding ? undefined : placements[0].fallbackSlot;
    const fallback = slot ? this.options.parent.getObjectByName(`generated-fallback:${slot}`) : undefined;
    if (slot && !fallback) {
      for (const placement of placements) this.report(placement, 'error', `Missing isolated fallback slot: ${slot}`);
      return;
    }
    for (const placement of placements) this.report(placement, 'loading');
    const results = await Promise.allSettled(placements.map(async placement => {
      const lease = await this.library.acquire(sceneAssetSource(placement.assetId, this.options.baseURL), { signal: this.request.signal });
      if (this.disposed) { lease.root.removeFromParent(); lease.dispose(); throw new Error('Scene disposed during model acquisition'); }
      try {
        const prepared = this.prepare(placement, lease);
        this.prepared.add(prepared);
        return prepared;
      } catch (error) { lease.root.removeFromParent(); lease.dispose(); throw error; }
    }));
    const loaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (this.disposed || failure) {
      for (const prepared of loaded) this.release(prepared);
      if (!this.disposed) {
        const message = failure?.status === 'rejected' && failure.reason instanceof Error ? failure.reason.message : 'Scene model acquisition failed';
        for (const placement of placements) this.report(placement, 'error', message);
      }
      return;
    }
    // Multi-part replacement (two benches) is atomic. Partial success never
    // hides the old slot or draws a new model through its fallback geometry.
    for (const prepared of loaded) {
      if (binding?.originMatrix) prepared.mount.applyMatrix4(binding.originMatrix);
      (binding?.parent ?? this.root).add(prepared.mount);
    }
    for (const target of binding?.fallback ?? (fallback ? [fallback] : [])) {
      this.swapped.set(target, target.visible); target.visible = false;
    }
    for (const { mesh, indices } of binding?.members ?? []) {
      const saved = this.swappedInstances.get(mesh) ?? new Map<number, Matrix4>();
      for (const index of indices) {
        const original = new Matrix4(); mesh.getMatrixAt(index, original);
        if (!saved.has(index)) saved.set(index, original);
        mesh.setMatrixAt(index, new Matrix4().makeScale(0, 0, 0));
      }
      this.swappedInstances.set(mesh, saved); mesh.instanceMatrix.needsUpdate = true;
    }
    for (const placement of placements) this.report(placement, 'ready');
  }

  private prepare(placement: SceneAssetPlacement, lease: ModelLease): Prepared {
    const source = lease.root;
    source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(source, true);
    const size = bounds.getSize(new Vector3());
    const values = [...bounds.min.toArray(), ...bounds.max.toArray(), ...size.toArray(), ...placement.position, placement.yaw, placement.size.metres];
    if (values.some(value => !Number.isFinite(value)) || size.toArray().some(value => value <= 0) || placement.size.metres <= 0) {
      throw new Error(`Invalid geometry or scale for ${placement.assetId}`);
    }
    const expected = SCENE_ASSETS[placement.assetId].sourceBounds;
    if (bounds.min.distanceTo(new Vector3(...expected.min)) > 0.0001 || bounds.max.distanceTo(new Vector3(...expected.max)) > 0.0001) {
      throw new Error(`Source frame changed for ${placement.assetId}; recalibration required`);
    }
    const scale = placement.size.metres / size[placement.size.axis];
    const center = bounds.getCenter(new Vector3());
    const mount = new Group(); mount.name = `generated-placement:${placement.id}`; mount.position.fromArray(placement.position);
    const heading = new Group(); heading.name = 'generated-model'; heading.rotation.y = placement.yaw; mount.add(heading);
    const normalized = new Group(); normalized.name = 'generated-bottom-centre';
    normalized.scale.setScalar(scale); normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    normalized.add(source); heading.add(normalized);
    source.traverse(object => {
      if (object instanceof Mesh) { object.castShadow = placement.castShadow ?? true; object.receiveShadow = true; }
    });
    mount.userData.asset = { id: placement.assetId, placement: placement.id, sha256: SCENE_ASSETS[placement.assetId].sha256,
      sourceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, uniformScale: scale,
      basis: 'glTF +Y up, explicit per-placement yaw', collision: 'authored level proxy; no generated mesh collider',
      status: 'integrated-geometry-rendering-pending' };
    mount.updateMatrixWorld(true);
    return { placement, lease, mount, released: false };
  }

  private release(prepared: Prepared): void {
    if (prepared.released) return;
    prepared.released = true; this.prepared.delete(prepared);
    prepared.mount.removeFromParent();
    prepared.lease.root.removeFromParent(); prepared.lease.dispose();
    prepared.mount.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.request.abort();
    // Detach borrowed resources before the parent's generic disposal traversal.
    this.root.removeFromParent();
    for (const prepared of [...this.prepared]) this.release(prepared);
    for (const [fallback, visible] of this.swapped) fallback.visible = visible;
    for (const [mesh, instances] of this.swappedInstances) {
      for (const [index, matrix] of instances) mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.swappedInstances.clear(); this.swapped.clear(); this.root.clear();
    for (const [id, status] of this.statuses) {
      if (status.state === 'pending' || status.state === 'loading') this.statuses.set(id, { ...status, state: 'cancelled' });
    }
  }
}
