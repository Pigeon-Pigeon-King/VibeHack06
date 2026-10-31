import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Box3, Group, Matrix4, Mesh, PerspectiveCamera, Texture, Vector3, Vector4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelAcquireOptions, ModelLease, ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { AK47_ASSET, ak47Source } from '../src/assets/weapon-catalog';
import { ImportedWeaponView, type WeaponLoadStatus } from '../src/presentation/ImportedWeaponView';

const source = ak47Source('https://example.invalid/game/index.html');
const raw = readFileSync(new URL('../assets/source/WP-AK47/ak47_reloadable_world.glb', import.meta.url));
const runtime = readFileSync(new URL('../public/models/weapons/ak47-world-r1.glb', import.meta.url));
const glbJson = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.restoreAllMocks(); });

/** Real GLTFLoader geometry/node/material parsing. Node has no image decoder;
 * only image-to-Texture creation is substituted. This is not PBR/render evidence. */
async function geometryTemplate(): Promise<ModelTemplate> {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-image-decode-only', loadTexture: async () => new Texture() }));
  const parsed = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return { scene: parsed.scene, scenes: parsed.scenes, animations: parsed.animations };
}

async function readyView() {
  const library = new ModelLibrary(async () => geometryTemplate());
  cleanups.push(() => library.dispose());
  const statuses: WeaponLoadStatus[] = [];
  let signalReady!: () => void;
  const ready = new Promise<void>(resolve => { signalReady = resolve; });
  const view = new ImportedWeaponView(library, source, status => {
    statuses.push(status); if (status.state === 'ready') signalReady();
  });
  cleanups.push(() => view.dispose());
  await ready;
  return { view, library, statuses };
}

function fakeLease(root = new Group()): ModelLease {
  return { root, animations: [], mixer: new AnimationMixer(root), dispose: vi.fn(() => root.removeFromParent()) };
}

function deferredLibrary() {
  const pending: Array<{ resolve(value: ModelLease): void; reject(error: unknown): void; options?: ModelAcquireOptions }> = [];
  const library = { acquire: (_source: ModelSource, options?: ModelAcquireOptions) => new Promise<ModelLease>((resolve, reject) => pending.push({ resolve, reject, options })) } as unknown as ModelLibrary;
  return { library, pending };
}

describe('AK-47 local asset and measured geometry', () => {
  it('ships the exact licensed source with embedded resources and no supplier animation clips', () => {
    expect(runtime.equals(raw)).toBe(true);
    expect(raw.length).toBe(AK47_ASSET.bytes);
    expect(createHash('sha256').update(runtime).digest('hex')).toBe(AK47_ASSET.sha256);
    expect(glbJson.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    expect(glbJson.images).toHaveLength(6);
    expect(glbJson.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && Number.isInteger(image.bufferView))).toBe(true);
    expect(glbJson.animations ?? []).toEqual([]);
    expect(ak47Source('file:///package/dist/index.html').url).toBe('file:///package/dist/models/weapons/ak47-world-r1.glb');
    expect(source.url).toBe('https://example.invalid/game/models/weapons/ak47-world-r1.glb');
    const license = readFileSync(new URL('../public/licenses/WP-AK47/LICENSE', import.meta.url), 'utf8');
    expect(license).toContain('Copyright (c) 2026 AetherRadar');
    expect(license).toContain('MIT License');
  });

  it('replaces the gun body while retaining block arms, hidden extras and a uniform metre scale', async () => {
    const { view } = await readyView();
    expect(view.root.getObjectByName('carbine-placeholder')!.visible).toBe(false);
    expect(view.root.getObjectByName('right-glove-sleeve')).toBeDefined();
    expect(view.root.getObjectByName('left-glove-sleeve')).toBeDefined();
    const mount = view.root.getObjectByName('imported-weapon-mount')!;
    expect(mount.scale.x).toBeCloseTo(0.89 / 1.4000500738620758, 8);
    expect(mount.scale.x).toBe(mount.scale.y); expect(mount.scale.x).toBe(mount.scale.z);
    expect(mount.userData.calibration.supplierAnimationClips).toBe(0);
    for (const name of AK47_ASSET.defaultHiddenNodes) expect(view.root.getObjectByName(name)!.visible).toBe(false);
    let triangles = 0, meshes = 0;
    mount.traverseVisible(object => { if (object instanceof Mesh) { meshes++; triangles += object.geometry.index!.count / 3; } });
    expect(meshes).toBe(10); expect(triangles).toBe(23_644);
    const grip = view.root.getObjectByName('ganymede-firing-grip')!;
    view.root.updateMatrixWorld(true);
    expect(view.root.worldToLocal(grip.getWorldPosition(new Vector3())).distanceTo(new Vector3(0, -0.14, -0.02))).toBeLessThan(0.000001);
  });

  it.each([[1366, 768], [844, 390], [390, 844]])('aligns the actual front post and rear notch at ADS in %s × %s', async (width, height) => {
    const { view } = await readyView();
    const camera = new PerspectiveCamera(54, width / height, 0.045, 1000);
    view.setViewportAspect(width / height);
    camera.add(view.root); view.setPose(0, 0, 1, 0); camera.updateMatrixWorld(true);
    const front = view.root.getObjectByName('ganymede-front-sight')!;
    // Independently measured source post top, not the taller sight hood.
    expect(front.position.y).toBeCloseTo(0.08114868402481079, 8);
    expect(front.position.z).toBeCloseTo(-1.0902529954910278, 7);
    const rear = view.root.getObjectByName('ganymede-rear-sight')!;
    expect(rear.position.y).toBeGreaterThan(0.07754378020763397);
    expect(rear.position.y).toBeLessThan(0.08311186730861664);
    for (const sight of [front, rear]) {
      const projected = sight.getWorldPosition(new Vector3()).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.000001);
      expect(Math.abs(projected.y)).toBeLessThan(0.000001);
      expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
    }
    const muzzle = view.muzzle.getWorldPosition(new Vector3());
    expect(muzzle.distanceTo(view.root.getObjectByName('MuzzleDeviceTip')!.getWorldPosition(new Vector3()))).toBeLessThan(0.000001);
    expect(muzzle.z).toBeLessThan(front.getWorldPosition(new Vector3()).z);
    expect(new Vector3(0, 0, -1).transformDirection(view.muzzle.matrixWorld).dot(new Vector3(0, 0, -1))).toBeGreaterThan(0.999);
  });

  it('keeps the actual receiver centre inside portrait and landscape hip-fire frames', async () => {
    const { view } = await readyView();
    for (const [width, height] of [[390, 844], [844, 390], [1366, 768]]) {
      const camera = new PerspectiveCamera(75, width / height, 0.045, 1000);
      camera.add(view.root); view.setViewportAspect(width / height); view.setPose(0, 0, 0, 0);
      camera.updateMatrixWorld(true);
      const receiver = view.root.getObjectByName('WeaponBodyGeometry')!;
      const centre = new Box3().setFromObject(receiver).getCenter(new Vector3()).project(camera);
      expect(Math.abs(centre.x)).toBeLessThan(0.85);
      expect(centre.z).toBeGreaterThan(-1); expect(centre.z).toBeLessThan(1);
    }
  });

  it('restores the original magazine/handle transforms after procedural reload and recoil', async () => {
    const { view } = await readyView();
    const magazine = view.root.getObjectByName('Magazine')!, handle = view.root.getObjectByName('ChargingHandle')!;
    const magAt = magazine.position.clone(), magRotation = magazine.quaternion.clone(), handleAt = handle.position.clone();
    view.setPose(1, 0.45, 0, 0);
    expect(magazine.position.y).toBeLessThan(magAt.y - 0.2);
    expect(handle.position.z).toBeGreaterThan(handleAt.z + 0.05);
    view.setPose(0, 0.88, 0, 0);
    expect(handle.position.z).toBeGreaterThan(handleAt.z + 0.05);
    view.setPose(0, 0, 1, 0);
    expect(magazine.position.equals(magAt)).toBe(true);
    expect(magazine.quaternion.angleTo(magRotation)).toBeLessThan(0.0000001);
    expect(handle.position.equals(handleAt)).toBe(true);
    const base = view.root.position.clone();
    view.root.position.y -= 0.62; view.root.rotation.x -= 0.55;
    view.setPose(0, 0, 1, 0);
    expect(view.root.position.distanceTo(base)).toBeLessThan(0.0000001);
    expect(view.root.rotation.x).toBe(0);
  });

  it('keeps the imported geometry below the viewport when HeldItemMotion fully lowers it', async () => {
    const { view } = await readyView();
    const camera = new PerspectiveCamera(75, 1366 / 768, 0.045, 1000);
    const vertex = new Vector3(), clip = new Vector4(), matrix = new Matrix4();
    let maximumBottomMargin = -Infinity;
    for (const ads of [0, 0.5, 1]) for (const recoil of [0, 1]) for (const reload of [0, 0.35, 0.65, 0.9]) for (const walk of [0, 2]) {
      view.setPose(recoil, reload, ads, walk);
      view.root.position.y -= 0.62; view.root.position.z += 0.18; view.root.rotation.x -= 0.55;
      view.root.updateMatrixWorld(true); camera.fov = 75 - ads * 21; camera.updateProjectionMatrix();
      view.root.traverseVisible(object => {
        if (!(object instanceof Mesh)) return;
        const position = object.geometry.getAttribute('position');
        matrix.multiplyMatrices(camera.projectionMatrix, object.matrixWorld);
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i); clip.set(vertex.x, vertex.y, vertex.z, 1).applyMatrix4(matrix);
          maximumBottomMargin = Math.max(maximumBottomMargin, clip.y + clip.w);
        }
      });
    }
    expect(maximumBottomMargin).toBeLessThan(0);
  });
});

describe('ImportedWeaponView asynchronous ownership', () => {
  it('does not dispose shared GLB resources through the owning procedural fallback', async () => {
    const { view, library } = await readyView();
    const sibling = await library.acquire(source);
    const mesh = sibling.root.getObjectByName('WeaponBodyGeometry') as Mesh;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, 'dispose');
    view.dispose(); view.dispose();
    expect(disposeGeometry).not.toHaveBeenCalled(); expect(disposeMaterial).not.toHaveBeenCalled();
    sibling.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1); expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it('disposes a resolved lease if the view is destroyed before the await continuation', async () => {
    const lease = fakeLease();
    const library = { acquire: () => Promise.resolve(lease) } as unknown as ModelLibrary;
    const statuses: WeaponLoadStatus[] = [];
    const view = new ImportedWeaponView(library, source, value => statuses.push(value));
    view.dispose();
    await Promise.resolve();
    expect(lease.dispose).toHaveBeenCalledTimes(1);
    expect(statuses.some(value => value.state === 'ready')).toBe(false);
    expect(view.root.children).toHaveLength(0);
  });

  it('aborts retry and releases a late old lease without replacing the new model', async () => {
    const { library, pending } = deferredLibrary();
    const statuses: WeaponLoadStatus[] = [];
    const view = new ImportedWeaponView(library, source, value => statuses.push(value));
    cleanups.push(() => view.dispose());
    view.retry();
    expect(pending[0].options?.signal?.aborted).toBe(true);
    const template = await geometryTemplate();
    const latest = fakeLease(template.scene);
    pending[1].resolve(latest); await Promise.resolve();
    expect(statuses.at(-1)?.state).toBe('ready');
    const loaded = view.root.getObjectByName('imported-weapon-mount');
    const obsolete = fakeLease(); pending[0].resolve(obsolete); await Promise.resolve();
    expect(obsolete.dispose).toHaveBeenCalledTimes(1);
    expect(view.root.getObjectByName('imported-weapon-mount')).toBe(loaded);
    expect(statuses.filter(value => value.state === 'ready')).toHaveLength(1);
  });

  it('keeps a playable fallback after a bad node contract and can retry to the real model', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { library, pending } = deferredLibrary();
    const statuses: WeaponLoadStatus[] = [];
    const view = new ImportedWeaponView(library, source, value => statuses.push(value));
    cleanups.push(() => view.dispose());
    const bad = fakeLease(); pending[0].resolve(bad); await Promise.resolve();
    expect(bad.dispose).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ state: 'error', message: '装备载入失败' });
    expect(view.root.getObjectByName('carbine-placeholder')!.visible).toBe(true);
    const muzzle = view.muzzle;
    view.retry();
    pending[1].resolve(fakeLease((await geometryTemplate()).scene)); await Promise.resolve();
    expect(statuses.at(-1)?.state).toBe('ready');
    expect(view.muzzle).toBe(muzzle);
    expect(view.root.getObjectByName('carbine-placeholder')!.visible).toBe(false);
  });
});
