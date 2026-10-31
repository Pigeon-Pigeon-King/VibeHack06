import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Group, Mesh, Quaternion, Ray, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { CHARACTER_ASSETS, characterAssetFor, characterSource, type CharacterIdentity } from '../src/assets/character-catalog';
import { SCENE_ASSETS, type SceneAssetId } from '../src/assets/scene-asset-catalog';
import { CareView } from '../src/presentation/CareView';
import { CarriedSupplyHands } from '../src/presentation/CarriedSupplyHands';

const baseURL = 'https://example.invalid/ganymede/index.html';
const identities: CharacterIdentity[] = [
  { id: 'player', name: '陆闻川 · 十九岁', role: 'ally' },
  { id: 'player', name: '周延 · 二十三岁', role: 'ally' },
  { id: 'player', name: '陆闻川 · 九岁', role: 'child' },
];
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
async function template(source: ModelSource): Promise<ModelTemplate> {
  const asset = CHARACTER_ASSETS.find(asset => asset.id === source.id) ?? SCENE_ASSETS[source.id as SceneAssetId];
  const bytes = readFileSync(new URL(`../public/${asset.runtimePath}`, import.meta.url));
  const loader = new GLTFLoader(); loader.register(() => ({ name: 'node-image-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function library(load = template) { const value = new ModelLibrary(load); cleanup.push(() => value.dispose()); return value; }
function local(root: Group, name: string): Vector3 { root.updateWorldMatrix(true, true); return root.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3())); }
function skin(root: Group): SkinnedMesh { let found!: SkinnedMesh; root.traverse(o => { if (o instanceof SkinnedMesh) found = o; }); return found; }
function bones(root: Group): Map<string, Quaternion> { const result = new Map<string, Quaternion>(); root.traverse(o => { if (o instanceof Bone) result.set(o.name, o.quaternion.clone().normalize()); }); return result; }

describe('source-backed nursing, transfer and supply contacts', () => {
  it.each(identities)('$name keeps original skin attributes and its own rig through seated/transfer/supply modes', async identity => {
    const lib = library(), asset = characterAssetFor(identity)!, original = await lib.acquire(characterSource(asset, baseURL)); cleanup.push(() => original.dispose());
    const care = new CareView(lib), supply = new CarriedSupplyHands(lib); cleanup.push(() => care.dispose(), () => supply.dispose());
    await Promise.all([care.setCharacter(identity, baseURL), supply.setCharacter(identity, baseURL)]);
    expect(care.status.arms).toEqual({ state: 'ready', assetId: asset.id }); expect(care.status.legs).toEqual({ state: 'ready', assetId: asset.id });
    expect(supply.status).toEqual({ state: 'ready', assetId: asset.id });
    const seat = care.root.getObjectByName('first-person-production-seated-legs') as Group, actual = skin(seat), source = skin(original.root);
    const vertices = actual.geometry.userData.sourceVertexIndices as number[];
    expect(actual.geometry).not.toBe(source.geometry); expect(actual.material).toBe(source.material); expect(actual.skeleton).not.toBe(source.skeleton);
    expect(actual.geometry.userData.legTriangles.left).toBeGreaterThan(100); expect(actual.geometry.userData.legTriangles.right).toBeGreaterThan(100);
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      const before = source.geometry.getAttribute(name), after = actual.geometry.getAttribute(name); if (!before) continue;
      for (let vertex = 0; vertex < vertices.length; vertex++) for (let component = 0; component < before.itemSize; component++) expect(after.getComponent(vertex, component)).toBe(before.getComponent(vertices[vertex], component));
    }
    const rest = new Map(actual.skeleton.bones.map(bone => [bone.name, { position: bone.position.clone(), scale: bone.scale.clone() }]));
    const parent = new Group(); parent.position.set(9, 2, -4); parent.rotation.y = .7; parent.add(care.root);
    care.update([5, 0, 3], 1.2, 'seat', .25, false);
    expect(care.root.getObjectByName('care-seated-legs')!.visible).toBe(true); expect(care.root.getObjectByName('care-transfer-hands')!.visible).toBe(false);
    expect(care.root.getObjectByName('care-seated-legs-placeholder')!.visible).toBe(false);
    expect(seat.userData.contact.leftAnkleErrorMeters).toBeLessThan(.0001); expect(seat.userData.contact.rightAnkleErrorMeters).toBeLessThan(.0001);
    expect(seat.userData.contact.adjustment).toBe(.25);
    const brace = care.root.getObjectByName('care-production-left-brace')!; expect(brace.userData.assetId).toBe('PROP-ARMOR-LEFT-BRACE');
    expect(brace.position.toArray().every(Number.isFinite)).toBe(true);
    const first = bones(seat); care.update([5, 0, 3], 1.2, 'seat', .25, false);
    for (const [name, q] of first) expect(q.angleTo(bones(seat).get(name)!)).toBeLessThan(.000001);
    care.update([5, 0, 3], 1.2, 'seat', 0, true); expect(seat.userData.contact.adjustment).toBe(1);
    for (const bone of actual.skeleton.bones) {
      expect(bone.position.distanceTo(rest.get(bone.name)!.position)).toBeLessThan(.000001); expect(bone.scale.distanceTo(rest.get(bone.name)!.scale)).toBeLessThan(.000001);
      expect(bone.quaternion.toArray().every(Number.isFinite)).toBe(true);
    }
    const point = new Vector3();
    for (let vertex = 0; vertex < actual.geometry.getAttribute('position').count; vertex++) { actual.getVertexPosition(vertex, point); expect(point.toArray().every(Number.isFinite)).toBe(true); }
    care.update([5, 0, 3], 1.2, 'transfer', .5, false);
    expect(care.root.getObjectByName('care-seated-legs')!.visible).toBe(false); expect(care.root.getObjectByName('care-transfer-hands-placeholder')!.visible).toBe(false);
    for (const [side, x] of [['L', -.252], ['R', .252]] as const) expect(local(care.root, `first-person-palm-${side}`).distanceTo(new Vector3(x, 1.02, -.72))).toBeLessThan(.0001);
    for (const [side, x] of [['L', -.34], ['R', .34]] as const) expect(local(supply.root, `first-person-palm-${side}`).distanceTo(new Vector3(x, -.02, .035))).toBeLessThan(.0001);
    expect(supply.root.getObjectByName('carried-supply-hands-placeholder')!.visible).toBe(false);
    care.update([5, 0, 3], 1.2, 'none', 1, true); expect(care.root.visible).toBe(false);
    expect(care.root.userData.contactState.visualAcceptance).toBe('NOT_REVIEWED');
  });

  it('fits the produced brace to the bent left thigh/calf using only independently owned source-derived geometry', async () => {
    const lib = library(), asset = SCENE_ASSETS['PROP-ARMOR-LEFT-BRACE'];
    const sourceLease = await lib.acquire({ id: asset.id, revision: asset.revision, url: new URL(asset.runtimePath, baseURL).href }); cleanup.push(() => sourceLease.dispose());
    let source!: Mesh; sourceLease.root.traverse(o => { if (o instanceof Mesh) source = o; });
    const sourcePosition = [...source.geometry.getAttribute('position').array], sourceUV = [...source.geometry.getAttribute('uv').array];
    const sourceDisposed = vi.spyOn(source.geometry, 'dispose');
    const care = new CareView(lib); cleanup.push(() => care.dispose()); await care.setCharacter(identities[1], baseURL);
    care.update([0, 0, 0], 0, 'seat', 1, true); care.root.updateMatrixWorld(true);
    const seat = care.root.getObjectByName('first-person-production-seated-legs') as Group;
    const posed = skin(seat); posed.skeleton.update();
    const pointAt = (name: string) => seat.getObjectByName(name)!.getWorldPosition(new Vector3());
    const knee = pointAt('L_Calf'), thighAxis = pointAt('L_Thigh').sub(knee).normalize(), calfAxis = knee.clone().sub(pointAt('L_Foot')).normalize();
    const legBefore = [pointAt('L_Thigh').distanceTo(knee), knee.distanceTo(pointAt('L_Foot'))];
    const parts = ['thigh-cuff', 'knee-guard', 'shin-guard'].map(name => seat.getObjectByName(`care-brace-${name}-source`) as Mesh);
    const ownedDisposed = parts.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const sourceArea = (positions: ArrayLike<number>, index: ArrayLike<number>) => {
      let area = 0; for (let i = 0; i < index.length; i += 3) {
        const a = new Vector3().fromArray(positions, index[i] * 3), b = new Vector3().fromArray(positions, index[i + 1] * 3), c = new Vector3().fromArray(positions, index[i + 2] * 3);
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      } return area;
    };
    let retainedArea = 0;
    for (const [partIndex, mesh] of parts.entries()) {
      expect(mesh.material).toBe(source.material); expect(mesh.geometry).not.toBe(source.geometry);
      for (const name of ['position','normal','uv']) expect(mesh.geometry.getAttribute(name)).not.toBe(source.geometry.getAttribute(name));
      const raw = mesh.geometry.userData.sourcePosition as number[], refs = mesh.geometry.userData.sourceVertexWeights as Array<{ids:number[];weights:number[]}>;
      for (let v = 0; v < refs.length; v++) for (const [name, data] of [['position', raw], ['uv', mesh.geometry.getAttribute('uv').array]] as const) {
        const attr = source.geometry.getAttribute(name); for (let c = 0; c < attr.itemSize; c++) {
          const expected = refs[v].ids.reduce((sum, id, i) => sum + attr.getComponent(id, c) * refs[v].weights[i], 0);
          expect(data[v * attr.itemSize + c]).toBeCloseTo(expected, 6);
        }
      }
      retainedArea += sourceArea(raw, mesh.geometry.index!.array);
      const origin = mesh.localToWorld(new Vector3()), up = mesh.localToWorld(new Vector3(0, 1, 0)).sub(origin).normalize();
      expect(up.dot(partIndex ? calfAxis : thighAxis)).toBeGreaterThan(.99999);
      expect(mesh.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    }
    expect(retainedArea).toBeCloseTo(sourceArea(source.geometry.getAttribute('position').array, source.geometry.index!.array), 5);
    // Intersect the actual posed skin and actual fitted shell, rather than trusting
    // contact metadata. Check the visible anterior contact; the source skin has
    // open crease/crop surfaces, so rear rays can hit another limb instead.
    const triangles = (mesh: Mesh) => {
      if (mesh instanceof SkinnedMesh) mesh.skeleton.update();
      const positions = Array.from({length:mesh.geometry.getAttribute('position').count}, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
      const ix = mesh.geometry.index!; return Array.from({length:ix.count / 3}, (_, i) => [positions[ix.getX(i * 3)], positions[ix.getX(i * 3 + 1)], positions[ix.getX(i * 3 + 2)]]);
    };
    const bodyTriangles = triangles(posed), hit = new Vector3();
    const nearest = (ray: Ray, list: Vector3[][]) => { let distance = Infinity; for (const tri of list) if (ray.intersectTriangle(tri[0], tri[1], tri[2], false, hit)) distance = Math.min(distance, hit.distanceTo(ray.origin)); return distance; };
    for (const [i, y] of [[0,.40],[1,-.06],[2,-.40]]) {
      const mesh = parts[i], shell = triangles(mesh), center = mesh.localToWorld(new Vector3(-.06, y, 0));
      for (const [x,z] of [[1,0]]) {
        const direction = mesh.localToWorld(new Vector3(-.06+x, y, z)).sub(center).normalize(), ray = new Ray(center, direction);
        const bodyHit = nearest(ray, bodyTriangles), shellHit = nearest(ray, shell);
        expect(Number.isFinite(bodyHit) && Number.isFinite(shellHit)).toBe(true);
        expect(shellHit - bodyHit, JSON.stringify({i,x,z,bodyHit,shellHit,center:center.toArray()})).toBeGreaterThan(-.004); expect(shellHit - bodyHit, JSON.stringify({i,bodyHit,shellHit})).toBeLessThan(.045);
      }
    }
    care.update([0, 0, 0], 0, 'seat', 0, false); care.root.updateMatrixWorld(true);
    expect(pointAt('L_Thigh').distanceTo(pointAt('L_Calf'))).toBeCloseTo(legBefore[0], 7);
    expect(pointAt('L_Calf').distanceTo(pointAt('L_Foot'))).toBeCloseTo(legBefore[1], 7);
    expect([...source.geometry.getAttribute('position').array]).toEqual(sourcePosition); expect([...source.geometry.getAttribute('uv').array]).toEqual(sourceUV);
    care.dispose(); for (const dispose of ownedDisposed) expect(dispose).toHaveBeenCalledTimes(1); expect(sourceDisposed).not.toHaveBeenCalled();
  });

  it('keeps supply palm contacts when its box moves under camera transforms, without a second animation clock', async () => {
    const supply = new CarriedSupplyHands(library()); cleanup.push(() => supply.dispose()); await supply.setCharacter(identities[0], baseURL);
    const camera = new Group(), box = new Group(); camera.position.set(3, 1.8, -5); camera.rotation.set(-.4, .9, .2); camera.scale.set(1.2, .8, 1.1);
    box.position.set(0, -.44, -.72); camera.add(box); box.add(supply.root);
    for (const t of [0, .5, 1]) {
      box.rotation.set(t * .2, t * .3, t * .1); box.position.y = -.44 - t * .6; camera.updateWorldMatrix(true, true);
      for (const [side, x] of [['L', -.34], ['R', .34]] as const) {
        const target = box.localToWorld(new Vector3(x, -.02, .035)), hand = supply.root.getObjectByName(`first-person-palm-${side}`)!;
        expect(hand.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(.0001);
      }
    }
  });

  it('retains the seat fallback if its brace fails, keeps the loaded arms, and retries without changing care facts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); let fail = true;
    const lib = library(async source => { if (source.id === 'PROP-ARMOR-LEFT-BRACE' && fail) throw new Error('injected brace load failure'); return template(source); });
    const care = new CareView(lib); cleanup.push(() => care.dispose()); care.update([2, 0, 4], .6, 'seat', .4, false);
    await care.setCharacter(identities[1], baseURL);
    expect(care.status.legs.state).toBe('error'); expect(care.status.arms.state).toBe('ready');
    expect(care.root.getObjectByName('care-seated-legs-placeholder')!.visible).toBe(true);
    const before = structuredClone(care.root.userData.contactState); fail = false; await care.retry();
    expect(care.status.legs.state).toBe('ready'); expect(care.root.userData.contactState).toEqual(before);
    expect(care.root.position.toArray()).toEqual([2, 0, 4]); expect(care.root.rotation.y).toBe(.6);
    expect(care.root.getObjectByName('care-seated-legs-placeholder')!.visible).toBe(false);
  });

  it('switches identity and disposes only owned cropped buffers while a sibling keeps shared source materials alive', async () => {
    const lib = library(), sibling = await lib.acquire(characterSource(characterAssetFor(identities[0])!, baseURL)); cleanup.push(() => sibling.dispose());
    const care = new CareView(lib), supply = new CarriedSupplyHands(lib); cleanup.push(() => care.dispose(), () => supply.dispose());
    await Promise.all([care.setCharacter(identities[0], baseURL), supply.setCharacter(identities[0], baseURL)]);
    const cropped: SkinnedMesh[] = []; care.root.traverse(o => { if (o instanceof SkinnedMesh) cropped.push(o); });
    const ownedDispose = cropped.map(mesh => vi.spyOn(mesh.geometry, 'dispose')), original = skin(sibling.root), sourceDispose = vi.spyOn(original.geometry, 'dispose');
    const materialDispose = vi.spyOn(Array.isArray(original.material) ? original.material[0] : original.material, 'dispose');
    await care.setCharacter(identities[1], baseURL); for (const dispose of ownedDispose) expect(dispose).toHaveBeenCalledTimes(1);
    expect(care.status.arms.assetId).toBe('CH-ZHOU'); expect(care.status.legs.assetId).toBe('CH-ZHOU');
    care.dispose(); care.dispose(); supply.dispose(); expect(sourceDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    sibling.dispose(); expect(sourceDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('ignores an old body/brace request after protagonist change and releases late decoded geometry', async () => {
    const pending: Array<{ source: ModelSource; resolve(value: ModelTemplate): void }> = [];
    const lib = library(source => new Promise(resolve => pending.push({ source, resolve })));
    const care = new CareView(lib); cleanup.push(() => care.dispose());
    const old = care.setCharacter(identities[0], baseURL), latest = care.setCharacter(identities[1], baseURL);
    const obsoleteBody = pending.find(item => item.source.id === 'CH-LU')!;
    const decoded = await template(obsoleteBody.source), dispose = vi.spyOn(skin(decoded.scene).geometry, 'dispose');
    for (const item of pending.filter(item => item !== obsoleteBody)) item.resolve(await template(item.source));
    await latest; obsoleteBody.resolve(decoded); await old; await Promise.resolve();
    expect(care.status.arms.assetId).toBe('CH-ZHOU'); expect(care.status.legs).toEqual({ state: 'ready', assetId: 'CH-ZHOU' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases already-fulfilled body/brace leases when the view is disposed before their continuation', async () => {
    const lib = library(), body = await lib.acquire(characterSource(characterAssetFor(identities[0])!, baseURL));
    const braceSource: ModelSource = { id: 'PROP-ARMOR-LEFT-BRACE', revision: SCENE_ASSETS['PROP-ARMOR-LEFT-BRACE'].revision,
      url: new URL(SCENE_ASSETS['PROP-ARMOR-LEFT-BRACE'].runtimePath, baseURL).href };
    const brace = await lib.acquire(braceSource); cleanup.push(() => body.dispose(), () => brace.dispose());
    const bodyDispose = vi.spyOn(skin(body.root).geometry, 'dispose');
    const care = new CareView(lib), ready = care.setCharacter(identities[0], baseURL); care.dispose(); await ready;
    expect(care.status.arms.state).toBe('disposed'); expect(care.status.legs.state).toBe('disposed'); expect(bodyDispose).not.toHaveBeenCalled();
    body.dispose(); expect(bodyDispose).toHaveBeenCalledTimes(1);
  });
});
