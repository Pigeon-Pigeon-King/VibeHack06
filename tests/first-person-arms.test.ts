import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Group, PerspectiveCamera, Quaternion, SkinnedMesh, Texture, Vector3, Vector4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import { characterAssetFor, characterSource, type CharacterIdentity } from '../src/assets/character-catalog';
import { ak47Source } from '../src/assets/weapon-catalog';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { FirstPersonArms } from '../src/presentation/FirstPersonArms';
import { ImportedWeaponView } from '../src/presentation/ImportedWeaponView';

const baseURL = 'https://example.invalid/game/index.html';
const identities: CharacterIdentity[] = [
  { id: 'player', name: '陆闻川 · 十九岁', role: 'ally' },
  { id: 'player', name: '周延 · 二十三岁', role: 'ally' },
  { id: 'player', name: '陆闻川 · 九岁', role: 'child' },
];
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
/** Real production mesh, skin, node, material and UV data. Image decoding alone is substituted. */
async function template(source: ModelSource): Promise<ModelTemplate> {
  const bytes = readFileSync(new URL(`../public/models/${source.url.split('/models/')[1]}`, import.meta.url));
  const loader = new GLTFLoader(); loader.register(() => ({ name: 'node-image-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function library(load = template) { const library = new ModelLibrary(load); cleanup.push(() => library.dispose()); return library; }
function skins(root: Group) { const result: SkinnedMesh[] = []; root.traverse(object => { if (object instanceof SkinnedMesh) result.push(object); }); return result; }
function local(root: Group, name: string) { root.updateWorldMatrix(true, true); return root.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3())); }
function pose(root: Group) {
  const result = new Map<string, Quaternion>(); root.traverse(object => { if (object instanceof Bone) result.set(object.name, object.quaternion.clone().normalize()); }); return result;
}
function poseDelta(a: ReturnType<typeof pose>, b: ReturnType<typeof pose>) { return Math.max(...[...a].map(([name, q]) => q.angleTo(b.get(name)!))); }
async function weapon(lib = library()) {
  let done!: () => void; const ready = new Promise<void>(resolve => { done = resolve; });
  const view = new ImportedWeaponView(lib, ak47Source(baseURL), status => { if (status.state === 'ready') done(); });
  cleanup.push(() => view.dispose()); await ready; return view;
}

describe('production protagonist arms in the first-person weapon view', () => {
  it.each(identities)('$name uses original source triangles/UV/weights/material and removes torso/head geometry', async identity => {
    const lib = library(), asset = characterAssetFor(identity)!, source = await lib.acquire(characterSource(asset, baseURL)); cleanup.push(() => source.dispose());
    const arms = new FirstPersonArms(lib); cleanup.push(() => arms.dispose()); await arms.setCharacter(identity, baseURL);
    expect(arms.status).toEqual({ state: 'ready', assetId: asset.id });
    const actual = skins(arms.root), originals = skins(source.root);
    expect(actual).toHaveLength(originals.length);
    let triangles = 0;
    actual.forEach((mesh, i) => {
      const original = originals[i], vertices = mesh.geometry.userData.sourceVertexIndices as number[];
      expect(mesh.material).toBe(original.material); expect(mesh.geometry).not.toBe(original.geometry);
      expect(mesh.skeleton).not.toBe(original.skeleton); expect(mesh.bindMatrix.equals(original.bindMatrix)).toBe(true);
      expect(mesh.geometry.userData.armTriangles.left).toBeGreaterThan(100); expect(mesh.geometry.userData.armTriangles.right).toBeGreaterThan(100);
      expect(mesh.geometry.index!.count).toBeLessThan(original.geometry.index!.count * 0.4);
      for (const [name, attribute] of Object.entries(original.geometry.attributes)) {
        const copied = mesh.geometry.getAttribute(name); expect(copied.itemSize).toBe(attribute.itemSize); expect(copied.normalized).toBe(attribute.normalized);
        for (let vertex = 0; vertex < vertices.length; vertex++) for (let component = 0; component < attribute.itemSize; component++) {
          expect(copied.getComponent(vertex, component)).toBe(attribute.getComponent(vertices[vertex], component));
        }
      }
      const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      for (let vertex = 0; vertex < vertices.length; vertex++) {
        let armWeight = 0;
        for (let component = 0; component < 4; component++) if (/^[LR]_(Upperarm|Forearm|Hand)/.test(mesh.skeleton.bones[joints.getComponent(vertex, component)].name)) armWeight += weights.getComponent(vertex, component);
        expect(armWeight).toBeGreaterThanOrEqual(0.7);
      }
      triangles += mesh.geometry.index!.count / 3;
    });
    if (process.env.FIRST_PERSON_ARMS_METRICS) process.stdout.write(JSON.stringify({ asset: asset.id, triangles }) + '\n');
  });

  it.each(identities)('$name follows real gun grips and magazine motion with repeatable IK and unchanged gun/muzzle calibration', async identity => {
    const view = await weapon();
    const muzzle = view.muzzle, baseSight = local(view.root, 'ganymede-rear-sight');
    await view.setCharacter(identity, baseURL);
    expect(view.root.getObjectByName('right-grip-arm')!.visible).toBe(false); expect(view.root.getObjectByName('left-support-arm')!.visible).toBe(false);
    expect(view.root.userData.armsAssetId).toBe(characterAssetFor(identity)!.id);
    view.setPose(0, 0, 0, 0);
    expect(local(view.root, 'first-person-palm-R').distanceTo(local(view.root, 'ganymede-firing-grip'))).toBeLessThan(0.0001);
    expect(local(view.root, 'first-person-palm-L').distanceTo(local(view.root, 'ganymede-support-grip'))).toBeLessThan(0.0001);
    let previous: ReturnType<typeof pose> | undefined, maxStep = 0, maxContact = 0;
    for (let frame = 0; frame <= 120; frame++) {
      view.setPose(frame === 5 ? 1 : 0, frame / 120, 0.5, 1.2);
      const current = pose(view.root); if (previous) maxStep = Math.max(maxStep, poseDelta(previous, current));
      view.setPose(frame === 5 ? 1 : 0, frame / 120, 0.5, 1.2);
      expect(poseDelta(current, pose(view.root))).toBeLessThan(0.000001); previous = current;
      const contact = view.root.getObjectByName('first-person-character-arms')!.userData.contact;
      maxContact = Math.max(maxContact, contact.leftErrorMeters, contact.rightErrorMeters);
      expect(local(view.root, 'first-person-palm-R').distanceTo(local(view.root, 'ganymede-firing-grip'))).toBeLessThan(0.0001);
      if (frame === 48) expect(local(view.root, 'first-person-palm-L').distanceTo(local(view.root, 'ganymede-magazine-grip'))).toBeLessThan(0.0001);
    }
    expect(maxStep).toBeLessThan(0.3); expect(maxContact).toBeLessThan(0.0001);
    expect(view.muzzle).toBe(muzzle); expect(local(view.root, 'ganymede-rear-sight').distanceTo(baseSight)).toBeLessThan(0.000001);
    if (process.env.FIRST_PERSON_ARMS_METRICS) process.stdout.write(JSON.stringify({ asset: characterAssetFor(identity)!.id, maxStep, maxContact }) + '\n');
  });

  it('switches on protagonist identity and releases only its own cropped buffers', async () => {
    const lib = library(), firstSource = characterSource(characterAssetFor(identities[0])!, baseURL), sibling = await lib.acquire(firstSource); cleanup.push(() => sibling.dispose());
    const view = await weapon(lib); await view.setCharacter(identities[0], baseURL);
    const cropped = skins(view.root), geometryDispose = cropped.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const original = skins(sibling.root)[0], originalDispose = vi.spyOn(original.geometry, 'dispose'), materialDispose = vi.spyOn(Array.isArray(original.material) ? original.material[0] : original.material, 'dispose');
    const acquire = vi.spyOn(lib, 'acquire');
    await view.setCharacter({ ...identities[0], name: '陆闻川 · 十九岁' }, baseURL); expect(acquire).not.toHaveBeenCalled();
    await view.setCharacter(identities[1], baseURL);
    expect(view.armsStatus.assetId).toBe('CH-ZHOU'); for (const dispose of geometryDispose) expect(dispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    const next = skins(view.root).map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    view.dispose(); view.dispose(); for (const dispose of next) expect(dispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).not.toHaveBeenCalled(); sibling.dispose(); expect(originalDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps contacts under yaw/pitch/scaled ancestors and after HeldItemMotion lowers the outer root', async () => {
    const view = await weapon(); await view.setCharacter(identities[0], baseURL);
    const scene = new Group(), parent = new Group(), camera = new PerspectiveCamera(75, 16 / 9, 0.045, 1000);
    scene.add(parent); parent.add(camera); camera.add(view.root);
    parent.position.set(11, -3, 5); parent.rotation.set(0.2, 1.1, -0.1); parent.scale.set(1.2, 0.8, 1.1);
    camera.position.set(-2, 1.7, -5); camera.rotation.set(-0.35, -0.8, 0.07); camera.scale.setScalar(0.9);
    for (const reload of [0, 0.4]) for (const ads of [0, 1]) {
      view.setPose(0.8, reload, ads, 2.4);
      // The existing host applies these after setPose; contacts must transform
      // with the same outer held-item root, without a second arm animation tick.
      view.root.position.y -= 0.62; view.root.position.z += 0.18; view.root.rotation.x -= 0.55;
      scene.updateMatrixWorld(true);
      const at = (name: string) => view.root.getObjectByName(name)!.getWorldPosition(new Vector3());
      expect(at('first-person-palm-R').distanceTo(at('ganymede-firing-grip'))).toBeLessThan(0.0001);
      expect(at('first-person-palm-L').distanceTo(at(reload ? 'ganymede-magazine-grip' : 'ganymede-support-grip'))).toBeLessThan(0.0001);
    }
  });

  it.each(identities)('$name has finite visible arm skin at desktop/mobile hip fire and clears the view when lowered', async identity => {
    const view = await weapon(); await view.setCharacter(identity, baseURL);
    const camera = new PerspectiveCamera(75, 16 / 9, 0.045, 1000); camera.add(view.root);
    const point = new Vector3(), clip = new Vector4();
    for (const aspect of [16 / 9, 844 / 390, 390 / 844]) {
      camera.aspect = aspect; camera.fov = 75; camera.updateProjectionMatrix(); view.setViewportAspect(aspect); view.setPose(0, 0, 0, 0); camera.updateMatrixWorld(true);
      const visible = { L: 0, R: 0 };
      for (const mesh of skins(view.root)) {
        const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld).project(camera);
          expect(point.toArray().every(Number.isFinite)).toBe(true);
          if (Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1 || Math.abs(point.z) >= 1) continue;
          let left = 0, right = 0;
          for (let component = 0; component < 4; component++) {
            const name = mesh.skeleton.bones[joints.getComponent(vertex, component)].name;
            if (/^L_(Upperarm|Forearm|Hand)/.test(name)) left += weights.getComponent(vertex, component);
            if (/^R_(Upperarm|Forearm|Hand)/.test(name)) right += weights.getComponent(vertex, component);
          }
          if (left >= 0.7) visible.L++; if (right >= 0.7) visible.R++;
        }
      }
      expect(visible.L).toBeGreaterThan(10); expect(visible.R).toBeGreaterThan(10);
      if (process.env.FIRST_PERSON_ARMS_METRICS) process.stdout.write(JSON.stringify({ asset: characterAssetFor(identity)!.id, aspect, visible }) + '\n');
      for (const ads of [0, 1]) for (const reload of [0, 0.4, 0.88]) {
        view.setPose(0, reload, ads, 0); camera.fov = 75 - ads * 21; camera.updateProjectionMatrix();
        view.root.position.y -= 0.62; view.root.position.z += 0.18; view.root.rotation.x -= 0.55; camera.updateMatrixWorld(true);
        let projected = 0;
        for (const mesh of skins(view.root)) for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
          clip.set(point.x, point.y, point.z, 1).applyMatrix4(camera.projectionMatrix);
          if (clip.w > 0 && Math.abs(clip.x) <= clip.w && Math.abs(clip.y) <= clip.w && Math.abs(clip.z) <= clip.w) projected++;
        }
        expect(projected).toBe(0);
      }
    }
  });

  it('ignores an obsolete real character load and destroys the late decoded resources', async () => {
    const pending: Array<{ source: ModelSource; resolve(value: ModelTemplate): void }> = [];
    const lib = library(source => new Promise(resolve => pending.push({ source, resolve })));
    const arms = new FirstPersonArms(lib); cleanup.push(() => arms.dispose());
    const first = arms.setCharacter(identities[0], baseURL), latest = arms.setCharacter(identities[1], baseURL);
    const old = await template(pending[0].source), dispose = vi.spyOn(skins(old.scene)[0].geometry, 'dispose');
    pending[1].resolve(await template(pending[1].source)); await latest;
    pending[0].resolve(old); await first; await Promise.resolve();
    expect(arms.status).toEqual({ state: 'ready', assetId: 'CH-ZHOU' }); expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases an already-resolved real lease when disposed before its continuation', async () => {
    const lib = library(), lease = await lib.acquire(characterSource(characterAssetFor(identities[0])!, baseURL));
    const dispose = vi.spyOn(lease, 'dispose'), bridge = { acquire: () => Promise.resolve(lease) } as unknown as ModelLibrary;
    const arms = new FirstPersonArms(bridge); const ready = arms.setCharacter(identities[0], baseURL); arms.dispose(); await ready;
    expect(dispose).toHaveBeenCalledTimes(1); expect(arms.status.state).toBe('disposed'); expect(arms.root.children).toHaveLength(0);
  });

  it('retains visible fallback arms on failure and retries without replacing the gun', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); let fail = true;
    const lib = library(async source => { if (source.id.startsWith('CH-') && fail) throw new Error('injected download failure'); return template(source); });
    const view = await weapon(lib), gun = view.root.getObjectByName('imported-weapon-mount');
    await view.setCharacter(identities[0], baseURL);
    expect(view.armsStatus.state).toBe('error'); expect(view.root.getObjectByName('right-grip-arm')!.visible).toBe(true);
    expect(view.root.getObjectByName('carbine-placeholder')!.visible).toBe(false);
    fail = false; await view.retryArms(); expect(view.armsStatus.state).toBe('ready');
    expect(view.root.getObjectByName('right-grip-arm')!.visible).toBe(false); expect(view.root.getObjectByName('imported-weapon-mount')).toBe(gun);
  });
});
