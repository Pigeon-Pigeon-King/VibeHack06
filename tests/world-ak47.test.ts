import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachWorldAK47, WORLD_AK47, WorldAK47Pool, worldAK47Url, type WorldAK47Loader } from '../src/presentation/WorldAK47';
import { disposeModelTree } from '../src/presentation/model-tools';

const raw = readFileSync(new URL('../public/models/weapons/ak47-world-r1.glb', import.meta.url));
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Actual GLB geometry/nodes/materials. Only image decoding is mocked; no WebGL or rendering claim. */
async function geometry(): Promise<Group> {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-world-image-decode', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return gltf.scene;
}
function proxy(withMuzzle = true) {
  const actor = new Group(), parent = new Group(); parent.name = withMuzzle ? 'carbine-placeholder' : 'sidearm-placeholder';
  parent.userData.assetStatus = 'placeholder'; parent.scale.setScalar(0.68); parent.rotation.y = Math.PI; parent.position.set(0.14, 1.35, 0.30);
  actor.add(parent);
  const material = new MeshStandardMaterial(), gun = new Mesh(new BoxGeometry(0.1, 0.1, 1), material);
  gun.name = 'original-gun'; parent.add(gun);
  const hidden = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), material); hidden.visible = false; parent.add(hidden);
  const actorBody = new Mesh(new BoxGeometry(0.4, 1, 0.3), material); actor.add(actorBody);
  let muzzle: Group | undefined;
  if (withMuzzle) { muzzle = new Group(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0.018, -0.97); parent.add(muzzle); }
  cleanups.push(() => disposeModelTree(actor));
  return { actor, parent, gun, hidden, actorBody, muzzle };
}
function deferred() {
  let resolve!: (root: Group) => void, reject!: (error: unknown) => void, signal!: AbortSignal;
  const loader = vi.fn<WorldAK47Loader>().mockImplementation((_url, current) => {
    signal = current; return new Promise((yes, no) => { resolve = yes; reject = no; });
  });
  return { pool: new WorldAK47Pool(loader), loader, resolve: (root: Group) => resolve(root), reject: () => reject(new Error('unavailable')), signal: () => signal };
}

describe('world AK actual-source calibration', () => {
  it('uses the pinned, self-contained AK source and resolves Vite/package subpaths', () => {
    expect(raw.length).toBe(WORLD_AK47.bytes);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(WORLD_AK47.sha256);
    const metadata = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
    expect(metadata.images).toHaveLength(6); expect(metadata.animations ?? []).toEqual([]);
    for (const item of [...metadata.images, ...metadata.buffers]) expect(item.uri).toBeUndefined();
    expect(worldAK47Url('/game/', 'https://example.test/game/index.html')).toBe('https://example.test/game/models/weapons/ak47-world-r1.glb');
    expect(worldAK47Url('./', 'file:///package/dist/index.html')).toBe('file:///package/dist/models/weapons/ak47-world-r1.glb');
    expect(worldAK47Url('./', 'game://local/index.html')).toBe('game://local/models/weapons/ak47-world-r1.glb');
    expect(worldAK47Url('/')).toBe('/models/weapons/ak47-world-r1.glb');
  });
  it('keeps the old body until success, preserves outer transforms and calibrates the real muzzle/grip', async () => {
    const d = deferred(), p = proxy(), at = p.parent.position.clone(), scale = p.parent.scale.clone(), rotation = p.parent.quaternion.clone();
    const attachment = attachWorldAK47(p.parent, { pool: d.pool });
    expect(attachment.muzzle).toBe(p.muzzle); expect(p.gun.visible).toBe(true); expect(attachment.state).toBe('loading');
    await flush(); d.resolve(await geometry()); expect(await attachment.ready).toBe('ready');
    expect(p.gun.visible).toBe(false); expect(p.actorBody.visible).toBe(true); expect(p.parent.visible).toBe(true);
    expect(p.parent.position.equals(at)).toBe(true); expect(p.parent.scale.equals(scale)).toBe(true); expect(p.parent.quaternion.equals(rotation)).toBe(true);
    const mount = p.parent.getObjectByName('world-ak47-mount')!;
    expect(mount.scale.x).toBeCloseTo(0.89 / 1.4000500738620758, 8);
    expect(mount.scale.x).toBe(mount.scale.y); expect(mount.scale.x).toBe(mount.scale.z);
    expect(mount.userData.calibration.presentationLengthMeters).toBe(0.89);
    for (const name of WORLD_AK47.hiddenNodes) expect(mount.getObjectByName(name)!.visible).toBe(false);
    let meshes = 0, triangles = 0;
    mount.traverseVisible(object => { if (object instanceof Mesh) { meshes++; triangles += object.geometry.index!.count / 3; } });
    expect(meshes).toBe(10); expect(triangles).toBe(23_644);
    p.actor.updateMatrixWorld(true);
    const grip = mount.getObjectByName('ganymede-firing-grip')!;
    expect(p.parent.worldToLocal(grip.getWorldPosition(new Vector3())).distanceTo(new Vector3(0, -0.14, -0.02))).toBeLessThan(1e-6);
    const sourceMuzzle = mount.getObjectByName('MuzzleDeviceTip')!;
    expect(attachment.muzzle.getWorldPosition(new Vector3()).distanceTo(sourceMuzzle.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
    const direction = new Vector3(0, 0, -1).transformDirection(attachment.muzzle.matrixWorld);
    expect(direction.dot(new Vector3(0, 0, -1).transformDirection(p.parent.matrixWorld))).toBeGreaterThan(0.999);
    p.parent.position.set(-1, 2, 3); p.parent.rotation.set(-0.4, 0.6, 0); p.actor.updateMatrixWorld(true);
    expect(attachment.muzzle.getWorldPosition(new Vector3()).distanceTo(sourceMuzzle.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
    attachment.dispose(); attachment.dispose();
    expect(p.gun.visible).toBe(true); expect(p.hidden.visible).toBe(false); expect(p.muzzle!.parent).toBe(p.parent);
    expect(p.muzzle!.position.toArray()).toEqual([0, 0.018, -0.97]); expect(p.parent.getObjectByName('world-ak47-mount')).toBeUndefined();
    expect(p.parent.userData.assetStatus).toBe('placeholder');
  });
  it('supports a sidearm placeholder without making its actor or weapon visible', async () => {
    const p = proxy(false); p.parent.visible = false;
    const attachment = attachWorldAK47(p.parent, { pool: new WorldAK47Pool(async () => geometry()) });
    expect(await attachment.ready).toBe('ready'); expect(p.parent.visible).toBe(false);
    expect(attachment.muzzle.parent!.name).toBe('MuzzleDeviceTip');
    attachment.dispose(); expect(p.parent.getObjectByName('muzzle')).toBeUndefined(); expect(p.parent.visible).toBe(false);
  });
});

describe('world AK shared ownership', () => {
  it('loads once, keeps independent nodes and releases shared resources only after the last owning tree', async () => {
    const source = await geometry(), body = source.getObjectByName('WeaponBodyGeometry') as Mesh;
    const freeGeometry = vi.spyOn(body.geometry, 'dispose'), material = Array.isArray(body.material) ? body.material[0] : body.material;
    const freeMaterial = vi.spyOn(material, 'dispose');
    const map = new Texture(), close = vi.fn(); map.image = { close };
    (material as MeshStandardMaterial).map = map; const freeMap = vi.spyOn(map, 'dispose');
    const loader = vi.fn<WorldAK47Loader>().mockResolvedValue(source), pool = new WorldAK47Pool(loader);
    const a = proxy(), b = proxy();
    const first = attachWorldAK47(a.parent, { pool }), second = attachWorldAK47(b.parent, { pool });
    expect(attachWorldAK47(a.parent, { pool })).toBe(first);
    expect(await Promise.all([first.ready, second.ready])).toEqual(['ready', 'ready']); expect(loader).toHaveBeenCalledTimes(1);
    const left = a.parent.getObjectByName('WeaponBodyGeometry') as Mesh, right = b.parent.getObjectByName('WeaponBodyGeometry') as Mesh;
    expect(left).not.toBe(right); expect(left.geometry).toBe(right.geometry); expect(left.material).toBe(right.material);
    a.parent.getObjectByName('Magazine')!.position.y -= 1;
    expect(a.parent.getObjectByName('Magazine')!.position.y).not.toBe(b.parent.getObjectByName('Magazine')!.position.y);
    disposeModelTree(a.actor);
    expect(first.state).toBe('disposed'); expect(second.state).toBe('ready'); expect(freeGeometry).not.toHaveBeenCalled(); expect(freeMaterial).not.toHaveBeenCalled();
    expect(b.parent.getObjectByName('world-ak47-mount')).toBeDefined();
    disposeModelTree(b.actor); disposeModelTree(b.actor);
    expect(freeGeometry).toHaveBeenCalledTimes(1); expect(freeMaterial).toHaveBeenCalledTimes(1); expect(freeMap).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  });
  it('cancels one pending owner without aborting its sibling', async () => {
    const d = deferred(), a = proxy(), b = proxy();
    const first = attachWorldAK47(a.parent, { pool: d.pool }), second = attachWorldAK47(b.parent, { pool: d.pool });
    await flush(); disposeModelTree(a.actor);
    expect(await first.ready).toBe('disposed'); expect(d.signal().aborted).toBe(false);
    d.resolve(await geometry()); expect(await second.ready).toBe('ready'); expect(a.actor.children).toHaveLength(0);
  });
  it('aborts the last pending request and frees a late result without attaching', async () => {
    const d = deferred(), p = proxy(), attachment = attachWorldAK47(p.parent, { pool: d.pool });
    await flush(); const source = await geometry(), body = source.getObjectByName('WeaponBodyGeometry') as Mesh, freed = vi.spyOn(body.geometry, 'dispose');
    disposeModelTree(p.actor); expect(d.signal().aborted).toBe(true); expect(await attachment.ready).toBe('disposed');
    d.resolve(source); await flush(); expect(freed).toHaveBeenCalledTimes(1); expect(p.actor.children).toHaveLength(0); expect(source.children).toHaveLength(0);
  });
  it('keeps a fallback on network or model-contract failure without retry loops', async () => {
    const d = deferred(), p = proxy(), attachment = attachWorldAK47(p.parent, { pool: d.pool });
    await flush(); d.reject(); expect(await attachment.ready).toBe('error'); expect(p.gun.visible).toBe(true);
    expect(attachWorldAK47(p.parent, { pool: d.pool })).toBe(attachment); expect(d.loader).toHaveBeenCalledTimes(1);
    const bad = new Group(), mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); bad.add(mesh);
    const freed = vi.spyOn(mesh.geometry, 'dispose'), q = proxy();
    const invalid = attachWorldAK47(q.parent, { pool: new WorldAK47Pool(async () => bad) });
    expect(await invalid.ready).toBe('error'); expect(q.gun.visible).toBe(true); expect(freed).toHaveBeenCalledTimes(1);
  });
  it('does not attach a resolved source after immediate parent disposal', async () => {
    const p = proxy(), source = await geometry(), freed = vi.spyOn((source.getObjectByName('WeaponBodyGeometry') as Mesh).geometry, 'dispose');
    const loader = vi.fn<WorldAK47Loader>().mockResolvedValue(source), attachment = attachWorldAK47(p.parent, { pool: new WorldAK47Pool(loader) });
    await Promise.resolve(); disposeModelTree(p.actor);
    expect(await attachment.ready).toBe('disposed'); await flush(); expect(freed).toHaveBeenCalledTimes(1); expect(p.actor.children).toHaveLength(0);
  });
  it('rejects an HTML/non-GLB response before decoding and keeps the original gun', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>fallback</html>', { status: 200 })); vi.stubGlobal('fetch', fetcher);
    const p = proxy(), attachment = attachWorldAK47(p.parent, { pool: new WorldAK47Pool(), baseURL: '/demo/', pageURL: 'https://example.test/demo/' });
    expect(await attachment.ready).toBe('error'); expect(p.gun.visible).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://example.test/demo/models/weapons/ak47-world-r1.glb', expect.objectContaining({ credentials: 'same-origin', redirect: 'error' }));
  });
});
