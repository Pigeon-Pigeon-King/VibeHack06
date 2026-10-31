import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ScenarioId } from '../src/contracts';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelAcquireOptions, ModelLease, ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { generatedScenePlacements, SCENE_ASSETS, sceneAssetSource, type SceneAssetId } from '../src/assets/scene-asset-catalog';
import { GeneratedSceneAssets } from '../src/presentation/GeneratedSceneAssets';
import { buildEnvironment } from '../src/presentation/environment';
import { FRONTGATE } from '../src/content/frontgate-layout';
import { MEDICAL } from '../src/content/medical-layout';
import { EPILOGUE } from '../src/content/epilogue-layout';

const baseURL = 'https://example.invalid/ganymede/index.html';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });

function bytes(id: SceneAssetId) {
  return readFileSync(new URL(`../public/${SCENE_ASSETS[id].runtimePath}`, import.meta.url));
}

/** Real geometry/material parsing; only image decoding is substituted in Node.
 * This deliberately does NOT claim texture rendering or visual acceptance. */
async function realTemplate(id: SceneAssetId): Promise<ModelTemplate> {
  const raw = bytes(id), loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-image-decode-only', loadTexture: async () => new Texture() }));
  const parsed = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return { scene: parsed.scene, scenes: parsed.scenes, animations: parsed.animations };
}

function own<T extends { dispose(): void }>(value: T): T { cleanup.push(() => value.dispose()); return value; }

function fallback(parent: Group, id: string): Group {
  const group = new Group(); group.name = `generated-fallback:${id}`; parent.add(group); return group;
}

function modelBounds(controller: GeneratedSceneAssets, id: string): Box3 {
  const mount = controller.root.getObjectByName(`generated-placement:${id}`)!;
  controller.root.updateMatrixWorld(true);
  return new Box3().setFromObject(mount.getObjectByName('generated-model')!, true);
}

const distanceXZ = (bounds: Box3, point: readonly number[]) => Math.hypot(
  Math.max(bounds.min.x - point[0], 0, point[0] - bounds.max.x),
  Math.max(bounds.min.z - point[2], 0, point[2] - bounds.max.z),
);

function fakeLease(id: SceneAssetId): ModelLease {
  const bounds = SCENE_ASSETS[id].sourceBounds;
  const minimum = new Vector3(...bounds.min), maximum = new Vector3(...bounds.max);
  const size = maximum.clone().sub(minimum), center = maximum.clone().add(minimum).multiplyScalar(0.5);
  const root = new Group(), geometry = new BoxGeometry(size.x, size.y, size.z), material = new MeshStandardMaterial();
  const mesh = new Mesh(geometry, material); mesh.position.copy(center); root.add(mesh);
  return { root, mixer: new AnimationMixer(root), animations: [], dispose: vi.fn(() => { root.removeFromParent(); geometry.dispose(); material.dispose(); }) };
}

function deferredLibrary() {
  const pending: Array<{ source: ModelSource; options?: ModelAcquireOptions; resolve(lease: ModelLease): void; reject(error: Error): void }> = [];
  const library = { acquire: vi.fn((source: ModelSource, options?: ModelAcquireOptions) => new Promise<ModelLease>((resolve, reject) => pending.push({ source, options, resolve, reject }))) };
  return { library, pending };
}

describe('generated runtime assets and real geometry', () => {
  it('ships eight self-contained local models with frozen source and resized runtime checksums', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/assets/generated/production-20261031/manifest.json', import.meta.url), 'utf8'));
    const originalManifest = readFileSync(new URL('../artifacts/asset-integration/scenery/source-manifest.json', import.meta.url));
    expect(createHash('sha256').update(originalManifest).digest('hex')).toBe(manifest.sourceManifestSha256);
    expect(manifest.assets).toHaveLength(8);
    for (const id of Object.keys(SCENE_ASSETS) as SceneAssetId[]) {
      const asset = SCENE_ASSETS[id], raw = bytes(id);
      const glb = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
      const record = manifest.assets.find((entry: { id: string }) => entry.id === id);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(asset.sha256);
      expect(raw.length).toBe(asset.bytes); expect(record.sha256).toBe(asset.sha256);
      expect(record.sourceSha256).toBe(asset.sourceSha256);
      expect(asset.sha256).not.toBe(asset.sourceSha256);
      expect(glb.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
      expect(glb.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && Number.isInteger(image.bufferView))).toBe(true);
      expect(glb.meshes).toHaveLength(1); expect(glb.materials).toHaveLength(1); expect(glb.images).toHaveLength(3);
      expect(glb.skins ?? []).toEqual([]); expect(glb.animations ?? []).toEqual([]); expect(glb.extensionsRequired ?? []).toEqual([]);
      expect(record.textureBudget.images.every((image: { runtimeDimensions: number[] }) => Math.max(...image.runtimeDimensions) <= 1024)).toBe(true);
      expect(record.textureBudget.estimatedRGBA8WithMipmapsBytes.runtime).toBeLessThanOrEqual(16 * 1024 * 1024);
      expect(sceneAssetSource(id, baseURL).url).toBe(`https://example.invalid/ganymede/${asset.runtimePath}`);
      expect(sceneAssetSource(id, 'file:///app/dist/index.html').url).toBe(`file:///app/dist/${asset.runtimePath}`);
    }
  });

  it.each(['frontgate', 'transfer', 'flank', 'medical', 'epilogue'] as ScenarioId[])('loads actual %s meshes at ground/support height without editing authored solids', async scenario => {
    const environment = own(buildEnvironment(scenario));
    const solidsBefore = JSON.stringify(environment.solids);
    const library = own(new ModelLibrary(source => realTemplate(source.id as SceneAssetId)));
    const controller = own(new GeneratedSceneAssets(library, { parent: environment.root, scenario, baseURL }));
    const statuses = await controller.ready;
    expect(statuses.every(status => status.state === 'ready')).toBe(true);
    expect(JSON.stringify(environment.solids)).toBe(solidsBefore);
    for (const placement of generatedScenePlacements(scenario)) {
      const bounds = modelBounds(controller, placement.id);
      expect(bounds.min.y).toBeCloseTo(placement.position[1], 6);
      // Rotation of an asymmetric body can move its world-AABB centre. The
      // calibrated source bottom-centre must stay within its real footprint.
      expect(bounds.min.x).toBeLessThan(placement.position[0]); expect(bounds.max.x).toBeGreaterThan(placement.position[0]);
      expect(bounds.min.z).toBeLessThan(placement.position[2]); expect(bounds.max.z).toBeGreaterThan(placement.position[2]);
      const mesh = controller.root.getObjectByName(`generated-placement:${placement.id}`)!.getObjectByProperty('isMesh', true) as Mesh;
      expect(mesh.geometry.getAttribute('normal').count).toBe(mesh.geometry.getAttribute('position').count);
      expect(mesh.geometry.getAttribute('uv').count).toBe(mesh.geometry.getAttribute('position').count);
      expect(mesh.geometry.index!.count / 3).toBe(SCENE_ASSETS[placement.assetId].sourceCost.triangles);
      expect((mesh.material as MeshStandardMaterial).map).toBeInstanceOf(Texture);
      expect((mesh.material as MeshStandardMaterial).normalMap).toBeInstanceOf(Texture);
      expect((mesh.material as MeshStandardMaterial).metalnessMap).toBeInstanceOf(Texture);
      expect((mesh.material as MeshStandardMaterial).transparent).toBe(false);
      if (placement.fallbackSlot) expect(environment.root.getObjectByName(`generated-fallback:${placement.fallbackSlot}`)!.visible).toBe(false);
      if (placement.foundation) {
        // The non-traversable landmark has an actual visual footing, not an unsupported model beyond the ground mesh.
        const foundation = environment.root.getObjectByName(`generated-foundation:${placement.id}`)!;
        const foundationBounds = new Box3().setFromObject(foundation, true);
        expect(foundationBounds.max.y).toBeCloseTo(bounds.min.y, 6);
        expect(bounds.min.x).toBeGreaterThan(foundationBounds.min.x);
        expect(bounds.max.x).toBeLessThan(foundationBounds.max.x);
        expect(bounds.min.z).toBeGreaterThan(foundationBounds.min.z);
        expect(bounds.max.z).toBeLessThan(foundationBounds.max.z);
        expect(foundationBounds.min.x).toBeGreaterThan(FRONTGATE.bounds.maxX + 0.4);
      }
    }
    if (scenario === 'medical') {
      for (const [placementId, solidId] of [['medical-bench-left', 'medical-rest-bench'], ['medical-bench-right', 'medical-rest-bench-1']]) {
        const bounds = modelBounds(controller, placementId), solid = environment.solids.find(solid => solid.id === solidId)!;
        expect(bounds.getSize(new Vector3()).toArray()).toEqual(expect.arrayContaining([expect.closeTo(1.8, 6), expect.closeTo(0.5068846642971039, 6), expect.closeTo(0.45368186831474306, 6)]));
        expect(bounds.max.y).toBeCloseTo(solid.position[1] + solid.size[1] / 2, 6);
        expect(bounds.min.y).toBeCloseTo(solid.position[1] - solid.size[1] / 2, 6);
      }
      const bag = modelBounds(controller, 'medical-supply-bag'), mug = modelBounds(controller, 'medical-water-mug');
      expect(bag.min.y - 1.06).toBeCloseTo(0.002, 6); expect(bag.min.x).toBeGreaterThan(-417.8); expect(bag.max.x).toBeLessThan(-416.2);
      expect(mug.min.y - 0.96).toBeCloseTo(0.002, 6); expect(mug.max.x).toBeLessThan(-413.95); expect(mug.max.z).toBeLessThan(60.6);
      expect(distanceXZ(mug, [-414.5, 0, 60.2])).toBeGreaterThan(0.15);
      for (const placement of generatedScenePlacements(scenario)) {
        const bounds = modelBounds(controller, placement.id);
        for (const point of [MEDICAL.registration, MEDICAL.equipment, MEDICAL.recordDesk, MEDICAL.zhouVisit, MEDICAL.mengVisit, MEDICAL.rest, ...MEDICAL.nurseRoute, ...MEDICAL.doctorRoute]) {
          expect(distanceXZ(bounds, point)).toBeGreaterThan(0.9);
        }
      }
    } else if (scenario === 'epilogue') {
      const bounds = modelBounds(controller, 'epilogue-reception-console');
      expect(bounds.min.x).toBeGreaterThan(-1); // Six-metre north doorway and the crew lane stay clear.
      expect(distanceXZ(bounds, EPILOGUE.terminal)).toBeGreaterThan(1.3);
      for (const point of [EPILOGUE.door, EPILOGUE.exit, ...EPILOGUE.shoreVia]) expect(distanceXZ(bounds, point)).toBeGreaterThan(1.3);
    } else {
      for (const placement of generatedScenePlacements(scenario)) {
        const bounds = modelBounds(controller, placement.id);
        for (const point of [FRONTGATE.spawn, FRONTGATE.observe, FRONTGATE.weighA, FRONTGATE.weighB, FRONTGATE.eastPost, FRONTGATE.rearPost, ...FRONTGATE.workerVia, ...FRONTGATE.workerSafe]) {
          expect(distanceXZ(bounds, point)).toBeGreaterThan(1.5);
        }
        expect(bounds.min.x).toBeGreaterThan(16); // Keep the entire central north/south lane free.
      }
    }
    controller.dispose();
    expect(controller.root.parent).toBeNull();
    for (const placement of generatedScenePlacements(scenario)) {
      if (placement.fallbackSlot) expect(environment.root.getObjectByName(`generated-fallback:${placement.fallbackSlot}`)!.visible).toBe(true);
    }
    expect(JSON.stringify(environment.solids)).toBe(solidsBefore);
  });
});

describe('generated scene lease ownership and cancellation', () => {
  const benches = generatedScenePlacements('medical').slice(0, 2);

  it('shares GPU resources across scene instances, releases once, and detaches before generic disposal', async () => {
    const template = await realTemplate('PROP-BENCH');
    const mesh = template.scene.getObjectByProperty('isMesh', true) as Mesh;
    const geometryDisposed = vi.fn(), materialDisposed = vi.fn();
    mesh.geometry.addEventListener('dispose', geometryDisposed); (mesh.material as MeshStandardMaterial).addEventListener('dispose', materialDisposed);
    const loader = vi.fn(async () => template), library = own(new ModelLibrary(loader));
    const parentA = new Group(), parentB = new Group(); fallback(parentA, 'medical-rest-bench'); fallback(parentB, 'medical-rest-bench');
    const a = own(new GeneratedSceneAssets(library, { parent: parentA, scenario: 'medical', baseURL, placements: benches }));
    const b = own(new GeneratedSceneAssets(library, { parent: parentB, scenario: 'medical', baseURL, placements: benches }));
    await Promise.all([a.ready, b.ready]);
    expect(loader).toHaveBeenCalledTimes(1);
    const meshA = a.root.getObjectByProperty('isMesh', true) as Mesh, meshB = b.root.getObjectByProperty('isMesh', true) as Mesh;
    expect(meshA.geometry).toBe(meshB.geometry); expect(meshA.material).toBe(meshB.material); expect(meshA).not.toBe(meshB);
    a.dispose(); a.dispose();
    expect(parentA.getObjectByProperty('isMesh', true)).toBeUndefined();
    expect(geometryDisposed).not.toHaveBeenCalled(); expect(materialDisposed).not.toHaveBeenCalled();
    b.dispose(); b.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(materialDisposed).toHaveBeenCalledTimes(1);
  });

  it('does not overlay a merged placeholder if the required isolated slot is missing', async () => {
    const { library } = deferredLibrary(), parent = new Group();
    const controller = own(new GeneratedSceneAssets(library, { parent, scenario: 'medical', baseURL, placements: benches }));
    expect((await controller.ready).every(status => status.state === 'error')).toBe(true);
    expect(library.acquire).not.toHaveBeenCalled(); expect(controller.root.children).toHaveLength(0);
  });

  it('keeps the whole fallback and releases a partial bench swap when another acquire fails', async () => {
    const { library, pending } = deferredLibrary(), parent = new Group(), old = fallback(parent, 'medical-rest-bench');
    const controller = own(new GeneratedSceneAssets(library, { parent, scenario: 'medical', baseURL, placements: benches }));
    const first = fakeLease('PROP-BENCH'); pending[0].resolve(first); pending[1].reject(new Error('decode failed'));
    expect((await controller.ready).every(status => status.state === 'error')).toBe(true);
    expect(first.dispose).toHaveBeenCalledTimes(1); expect(old.visible).toBe(true); expect(controller.root.children).toHaveLength(0);
  });

  it('cancels pending acquisition and releases a late lease without attaching to an old scene', async () => {
    const { library, pending } = deferredLibrary(), parent = new Group(), old = fallback(parent, 'medical-rest-bench');
    const controller = own(new GeneratedSceneAssets(library, { parent, scenario: 'medical', baseURL, placements: benches.slice(0, 1) }));
    controller.dispose(); expect(pending[0].options!.signal!.aborted).toBe(true);
    const late = fakeLease('PROP-BENCH'); pending[0].resolve(late); await controller.ready;
    expect(late.dispose).toHaveBeenCalledTimes(1); expect(late.root.parent).toBeNull(); expect(controller.root.parent).toBeNull();
    expect(old.visible).toBe(true); expect(controller.getStatus()[0].state).toBe('cancelled');
  });

  it('rejects a changed source frame instead of silently placing mis-scaled geometry', async () => {
    const { library, pending } = deferredLibrary(), parent = new Group(), old = fallback(parent, 'medical-rest-bench');
    const controller = own(new GeneratedSceneAssets(library, { parent, scenario: 'medical', baseURL, placements: benches.slice(0, 1) }));
    const changed = fakeLease('PROP-BENCH'); changed.root.scale.y = 10; pending[0].resolve(changed);
    const statuses = await controller.ready;
    expect(statuses[0].state).toBe('error'); expect(statuses[0].message).toContain('recalibration');
    expect(changed.dispose).toHaveBeenCalledTimes(1); expect(old.visible).toBe(true);
  });

  it('continues independent dressing after one asset failure and disposes owned foundations once', async () => {
    const placements = generatedScenePlacements('frontgate').filter(placement => ['front-tug', 'front-background-light'].includes(placement.id));
    const { library, pending } = deferredLibrary(), parent = new Group(); fallback(parent, 'front-tug');
    const controller = own(new GeneratedSceneAssets(library, { parent, scenario: 'frontgate', baseURL, placements }));
    pending[0].reject(new Error('offline')); pending[1].resolve(fakeLease('ENV-LIGHTKIT-POLE'));
    expect((await controller.ready).map(status => status.state)).toEqual(['error', 'ready']);
    const foundation = parent.getObjectByName('generated-foundation:front-background-light') as Mesh;
    const disposed = vi.fn(); foundation.geometry.addEventListener('dispose', disposed);
    controller.dispose(); controller.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('keeps unrelated scenarios free of new model loads', async () => {
    const { library } = deferredLibrary();
    const controller = own(new GeneratedSceneAssets(library, { parent: new Group(), scenario: 'childhood', baseURL }));
    expect(await controller.ready).toEqual([]); expect(library.acquire).not.toHaveBeenCalled();
  });
});
