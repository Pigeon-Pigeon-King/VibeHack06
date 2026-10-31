import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Box3, Group, Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelLease, ModelSource } from '../src/assets/model-contracts';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import { ak47Source, AK47_ASSET } from '../src/assets/weapon-catalog';
import { buildEnvironment } from '../src/presentation/environment';
import { GeneratedWorldWeapons, readGeneratedWorldWeaponBindings } from '../src/presentation/GeneratedWorldWeapons';

const baseURL = 'https://example.invalid/game/';
const cleanups: Array<() => void> = [];
const runtimeRecords: unknown[] = [];
afterAll(() => {
  if (process.env.RECORD_PROP_COVERAGE !== '1') return;
  mkdirSync('artifacts/asset-coverage-fix-20261031', { recursive: true });
  writeFileSync('artifacts/asset-coverage-fix-20261031/world-weapons-runtime-checks.json', JSON.stringify({
    generatedAt: new Date().toISOString(), scope: 'Actual AK GLB geometry/nodes/calibration; image decode substituted; browser visual acceptance pending.',
    source: AK47_ASSET, scenarios: runtimeRecords,
  }, null, 2) + '\n');
});
afterEach(() => cleanups.splice(0).reverse().forEach(dispose => dispose()));
function own<T extends { dispose(): void }>(value: T): T { cleanups.push(() => value.dispose()); return value; }
async function sourceGeometry(): Promise<Group> {
  const bytes = readFileSync(new URL('../public/models/weapons/ak47-world-r1.glb', import.meta.url)), loader = new GLTFLoader();
  loader.register(() => ({ name: 'images-only-test-fixture', loadTexture: async () => new Texture() }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function visibleBounds(root: Group): Box3 {
  const out = new Box3(); root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (let ancestor = object.parent; ancestor && ancestor !== root; ancestor = ancestor.parent) if (!ancestor.visible) return;
    if (!object.visible) return;
    object.geometry.computeBoundingBox(); out.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
  });
  return out;
}

describe('authored world weapon replacement', () => {
  it.each(['childhood', 'mainhall'] as const)('%s uses one real AK template for three independent state hosts', async scenario => {
    const environment = own(buildEnvironment(scenario));
    const bindings = readGeneratedWorldWeaponBindings(environment.root);
    expect(bindings.map(binding => binding.id)).toEqual(['history-source-rifle', 'history-fallen-rifle', 'history-commander-rifle']);
    environment.setFacts!([]);
    const old = bindings.map(binding => ({ position: binding.host.position.clone(), rotation: binding.host.quaternion.clone(), visible: binding.host.visible }));
    const solids = JSON.stringify(environment.solids), template = await sourceGeometry();
    const receiver = template.getObjectByName('WeaponBodyGeometry') as Mesh, freed = vi.spyOn(receiver.geometry, 'dispose');
    const loader = vi.fn(async (_source: ModelSource) => ({ scene: template, animations: [] })), library = own(new ModelLibrary(loader));
    const weapons = own(new GeneratedWorldWeapons(library, { parent: environment.root, baseURL }));
    expect((await weapons.ready).map(status => status.state)).toEqual(['ready', 'ready', 'ready']);
    expect(loader).toHaveBeenCalledTimes(1); expect(loader.mock.calls[0][0]).toEqual(ak47Source(baseURL));
    const meshes: Mesh[] = [];
    bindings.forEach((binding, index) => {
      expect(binding.host.position).toEqual(old[index].position); expect(binding.host.quaternion.equals(old[index].rotation)).toBe(true);
      expect(binding.host.visible).toBe(old[index].visible); expect(binding.fallback.every(object => !object.visible)).toBe(true);
      const pose = binding.host.getObjectByName(`generated-world-weapon:${binding.id}`) as Group;
      expect(pose.parent).toBe(binding.host);
      const bounds = visibleBounds(pose);
      expect(bounds.min.y).toBeCloseTo(binding.host.position.y, 6);
      expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(.87); expect(bounds.getSize(new Vector3()).x).toBeLessThan(.91);
      const muzzle = pose.getObjectByName('MuzzleDeviceTip')!.getWorldPosition(new Vector3());
      const grip = pose.getObjectByName('ganymede-firing-grip')!.getWorldPosition(new Vector3());
      expect(muzzle.x - grip.x).toBeGreaterThan(.35);
      const front = pose.getObjectByName('ganymede-front-sight')!.getWorldPosition(new Vector3());
      const rear = pose.getObjectByName('ganymede-rear-sight')!.getWorldPosition(new Vector3());
      expect(front.sub(rear).normalize().dot(new Vector3(1, 0, 0))).toBeGreaterThan(.999);
      meshes.push(pose.getObjectByName('WeaponBodyGeometry') as Mesh);
    });
    runtimeRecords.push({ scenario, modelInstances: bindings.length, statuses: weapons.getStatus(),
      bindings: bindings.map(binding => ({ id: binding.id, pose: binding.pose, position: binding.host.position.toArray() })) });
    expect(meshes[0].geometry).toBe(meshes[1].geometry); expect(meshes[1].geometry).toBe(meshes[2].geometry);
    environment.setFacts!(['history-gate-open', 'history-defender-0-down', 'father-died', 'history-collapse']);
    expect(bindings.map(binding => binding.host.visible)).toEqual([true, true, true]);
    environment.setFacts!(['history-gate-open', 'history-defender-0-down', 'father-rifle-collected', 'father-died']);
    expect(bindings.map(binding => binding.host.visible)).toEqual([false, true, false]);
    const pose = bindings[1].host.getObjectByName(`generated-world-weapon:${bindings[1].id}`)!;
    const before = pose.getWorldPosition(new Vector3()); bindings[1].host.position.x += 2;
    expect(pose.getWorldPosition(new Vector3()).x - before.x).toBeCloseTo(2);
    expect(JSON.stringify(environment.solids)).toBe(solids);
    weapons.dispose(); weapons.dispose();
    expect(freed).toHaveBeenCalledTimes(1);
    expect(bindings.map(binding => binding.host.visible)).toEqual([false, true, false]);
    for (const binding of bindings) { expect(binding.fallback.every(object => object.visible)).toBe(true); expect(binding.host.children.some(child => child.name.startsWith('generated-world-weapon:'))).toBe(false); }
  });

  it('replaces S03 rack parts with four complete upright AKs and restores the existing pickup fact', async () => {
    const environment = own(buildEnvironment('nightshift')), before = JSON.stringify(environment.solids);
    const bindings = readGeneratedWorldWeaponBindings(environment.root);
    expect(bindings).toHaveLength(4); expect(bindings.every(binding => binding.pose === 'upright-rack')).toBe(true);
    environment.setFacts!(['weapon-collected']);
    const loader = vi.fn(async (_source: ModelSource) => ({ scene: await sourceGeometry(), animations: [] }));
    const library = own(new ModelLibrary(loader)), weapons = own(new GeneratedWorldWeapons(library, { parent: environment.root, baseURL }));
    expect((await weapons.ready).every(status => status.state === 'ready')).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    for (const [i, binding] of bindings.entries()) {
      const pose = binding.host.getObjectByName(`generated-world-weapon:${binding.id}`) as Group, bounds = visibleBounds(pose);
      expect(binding.fallback.every(object => !object.visible)).toBe(true);
      expect(binding.host.visible).toBe(i !== 1);
      expect(binding.host.userData.generatedWorldWeapon.presentation).toContain('complete AK');
      expect(bounds.min.y).toBeCloseTo(1.1, 6);
      expect(bounds.getSize(new Vector3()).y).toBeGreaterThan(.87); expect(bounds.getSize(new Vector3()).y).toBeLessThan(.91);
      // The whole gun stays in front of the existing 0.55m rack body, within its width.
      expect(bounds.min.z).toBeGreaterThan(-33.725); expect(bounds.min.x).toBeGreaterThan(-12.5); expect(bounds.max.x).toBeLessThan(-7.5);
      const front = pose.getObjectByName('ganymede-front-sight')!.getWorldPosition(new Vector3());
      const rear = pose.getObjectByName('ganymede-rear-sight')!.getWorldPosition(new Vector3());
      expect(front.sub(rear).normalize().dot(new Vector3(0, 1, 0))).toBeGreaterThan(.999);
    }
    runtimeRecords.push({ scenario: 'nightshift', modelInstances: 4, statuses: weapons.getStatus(), collectionFact: 'weapon-collected',
      bindings: bindings.map(binding => ({ id: binding.id, pose: binding.pose, position: binding.host.position.toArray(), visibleAfterCollection: binding.host.visible })) });
    environment.setFacts!([]); expect(bindings.every(binding => binding.host.visible)).toBe(true);
    environment.setFacts!(['weapon-collected']); expect(bindings[1].host.visible).toBe(false);
    weapons.dispose(); expect(bindings[1].host.visible).toBe(false);
    expect(bindings.every(binding => binding.fallback.every(object => object.visible))).toBe(true);
    expect(JSON.stringify(environment.solids)).toBe(before);
  });

  it('retains every old rifle when decoding or source calibration fails', async () => {
    const environment = own(buildEnvironment('childhood')), disposed: ReturnType<typeof vi.fn>[] = [];
    const library = { acquire: vi.fn(async (_source: ModelSource): Promise<ModelLease> => {
      const root = new Group(), dispose = vi.fn(); disposed.push(dispose); return { root, animations: [], mixer: new AnimationMixer(root), dispose };
    }) };
    const weapons = own(new GeneratedWorldWeapons(library, { parent: environment.root, baseURL }));
    const states = await weapons.ready; expect(states.every(status => status.state === 'error')).toBe(true);
    expect(states.every(status => status.message?.includes('lacks'))).toBe(true);
    expect(disposed.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    for (const binding of readGeneratedWorldWeaponBindings(environment.root)) expect(binding.fallback.every(object => object.visible)).toBe(true);
  });

  it('cancels late leases without attaching them or showing a hidden story weapon', async () => {
    const environment = own(buildEnvironment('mainhall')), pending: Array<{ done(value: ModelLease): void; signal: AbortSignal }> = [];
    const weapons = own(new GeneratedWorldWeapons({ acquire: (_source, options) => new Promise<ModelLease>(done => pending.push({ done, signal: options!.signal! })) }, { parent: environment.root, baseURL }));
    expect(pending).toHaveLength(2); weapons.dispose(); expect(pending.every(item => item.signal.aborted)).toBe(true);
    const disposers = pending.map(item => { const root = new Group(), dispose = vi.fn(); item.done({ root, dispose, animations: [], mixer: new AnimationMixer(root) }); return dispose; });
    expect((await weapons.ready).every(status => status.state === 'cancelled')).toBe(true);
    expect(disposers.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    for (const binding of readGeneratedWorldWeaponBindings(environment.root)) { expect(binding.host.visible).toBe(false); expect(binding.fallback.every(object => object.visible)).toBe(true); }
  });

  it('does not request a weapon in scenes without an authored weapon host', async () => {
    const library = { acquire: vi.fn() };
    const weapons = own(new GeneratedWorldWeapons(library, { parent: new Group(), baseURL }));
    expect(await weapons.ready).toEqual([]); expect(library.acquire).not.toHaveBeenCalled();
  });
});
