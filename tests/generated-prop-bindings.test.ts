import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import type { ModelLease, ModelSource } from '../src/assets/model-contracts';
import { generatedScenePlacements, SCENE_ASSETS, type SceneAssetId } from '../src/assets/scene-asset-catalog';
import { SCENARIO_IDS, type ScenarioId } from '../src/contracts';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { GeneratedSceneAssets } from '../src/presentation/GeneratedSceneAssets';
import { bindGeneratedProp, propPlacement, readGeneratedPropBindings } from '../src/presentation/GeneratedPropBindings';
import { buildEnvironment } from '../src/presentation/environment';
import { PortKit, readPortKitPrimitives, readPortKitSemantics } from '../src/presentation/port-kit';
import { disposeModelTree } from '../src/presentation/model-tools';

const baseURL = 'https://example.invalid/game/';
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).reverse().forEach(dispose => dispose()));
function own<T extends { dispose(): void }>(value: T): T { cleanups.push(() => value.dispose()); return value; }
function lease(id: SceneAssetId): ModelLease {
  const b = SCENE_ASSETS[id].sourceBounds, min = new Vector3(...b.min), max = new Vector3(...b.max);
  const size = max.clone().sub(min), root = new Group();
  const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), new MeshStandardMaterial());
  mesh.position.copy(min.add(max).multiplyScalar(0.5)); root.add(mesh);
  return { root, mixer: new AnimationMixer(root), animations: [], dispose: vi.fn(() => { root.removeFromParent(); disposeModelTree(root); }) };
}
const library = () => ({ acquire: vi.fn(async (source: ModelSource) => lease(source.id as SceneAssetId)) });
const matrixAt = (mesh: { getMatrixAt(index: number, matrix: Matrix4): void }, index: number) => { const matrix = new Matrix4(); mesh.getMatrixAt(index, matrix); return matrix; };
const required: Partial<Record<ScenarioId, readonly SceneAssetId[]>> = {
  childhood: ['PROP-BENCH', 'PROP-TOOL-LUNCHBOX', 'PROP-TOOL-BAG', 'PROP-DOOR-LEAF'],
  mainhall: ['PROP-BENCH', 'PROP-TOOL-LUNCHBOX', 'PROP-TOOL-BAG', 'PROP-DOOR-LEAF'],
  nightshift: ['PROP-CARGO', 'PROP-FAN', 'PROP-TOOL-ROLL', 'PROP-TOOL-BAG', 'PROP-SAMPLE-CABINET', 'PROP-TRANSFER'],
  workers: ['PROP-VEH-TRANSPORT', 'PROP-DOOR-LEAF', 'PROP-TERMINAL-CONSOLE'],
  frontgate: ['PROP-VEH-TUG', 'PROP-FILTER', 'PROP-PUMP'],
  transfer: ['PROP-DOOR-LEAF', 'PROP-DOOR-LOCK', 'PROP-MEDICAL-BAG', 'PROP-LIFE-MUG', 'PROP-TOOL-ROLL', 'PROP-RADIO-PACK', 'PROP-SAMPLE-CABINET', 'PROP-FILTER'],
  flank: ['PROP-FILTER', 'PROP-TERMINAL-CONSOLE'],
  escort: ['PROP-BENCH', 'PROP-CARGO', 'PROP-SAMPLE-CABINET', 'PROP-DOOR-LEAF', 'PROP-TERMINAL-CONSOLE'],
  relief: ['PROP-BENCH', 'PROP-CARGO', 'PROP-SAMPLE-CABINET', 'PROP-LIFE-MUG', 'PROP-RADIO-PACK', 'PROP-ARMOR-LEFT-BRACE'],
  rescue: ['PROP-CARGO'],
  medical: ['PROP-CARGO', 'PROP-TERMINAL-HANDHELD', 'PROP-SAMPLE-CABINET', 'PROP-BENCH'],
  epilogue: ['PROP-TERMINAL-CONSOLE', 'PROP-DOOR-LEAF'],
};
const campaign = [...SCENARIO_IDS];
required.northgate = ['PROP-VEH-TUG', 'PROP-TERMINAL-CONSOLE'];
required.handover = ['PROP-VEH-TUG', 'PROP-TERMINAL-CONSOLE', 'PROP-SAMPLE-CABINET'];
required.prologue = [];

// These tests substitute asset envelopes; the existing generated-scene-assets suite separately
// decodes every shipped GLB. Neither substitutes for a browser visual check.
describe('authored prop attachments', () => {
  it.each(campaign)('%s attaches actual authored instances without changing gameplay solids', async scenario => {
    const environment = own(buildEnvironment(scenario)), before = JSON.stringify(environment.solids);
    const bindings = readGeneratedPropBindings(environment.root);
    const placements = [...generatedScenePlacements(scenario), ...bindings.flatMap(binding => binding.placements)];
    for (const id of required[scenario]!) expect(placements.some(placement => placement.assetId === id), `${scenario}: ${id}`).toBe(true);
    expect(new Set(placements.map(placement => placement.id)).size).toBe(placements.length);
    const assets = own(new GeneratedSceneAssets(library(), { parent: environment.root, scenario, baseURL }));
    expect((await assets.ready).every(status => status.state === 'ready')).toBe(true);
    for (const binding of bindings) {
      for (const placement of binding.placements) expect(binding.parent.getObjectByName(`generated-placement:${placement.id}`)?.parent).toBe(binding.parent);
      for (const fallback of binding.fallback) expect(fallback.visible).toBe(false);
      for (const { mesh, indices } of binding.members ?? []) for (const index of indices) expect(matrixAt(mesh, index).determinant()).toBe(0);
    }
    expect(JSON.stringify(environment.solids)).toBe(before);
    assets.dispose();
    expect(JSON.stringify(environment.solids)).toBe(before);
    for (const binding of bindings) for (const placement of binding.placements) expect(binding.parent.getObjectByName(`generated-placement:${placement.id}`)).toBeUndefined();
  });

  it('decodes real production GLBs at every authored attachment and optionally records coverage', async () => {
    const library = new ModelLibrary(async source => {
      const asset = SCENE_ASSETS[source.id as SceneAssetId];
      const bytes = readFileSync(new URL(`../public/${asset.runtimePath}`, import.meta.url));
      const loader = new GLTFLoader();
      loader.register(() => ({ name: 'texture-decode-fixture', loadTexture: async () => new Texture() }));
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
    });
    const scenarios = [];
    try {
      for (const scenario of SCENARIO_IDS) {
        const environment = buildEnvironment(scenario), before = JSON.stringify(environment.solids);
        const bindings = readGeneratedPropBindings(environment.root);
        const assets = new GeneratedSceneAssets(library, { parent: environment.root, scenario, baseURL });
        try {
          const statuses = await assets.ready;
          expect(statuses.every(status => status.state === 'ready'), scenario).toBe(true);
          expect(JSON.stringify(environment.solids)).toBe(before);
          const placements = [...generatedScenePlacements(scenario), ...bindings.flatMap(binding => binding.placements)];
          scenarios.push({ scenario, explicitBindingGroups: bindings.length, modelInstances: placements.length,
            bindings: bindings.map(binding => ({ id: binding.id, parent: binding.parent.name, fallbackObjects: binding.fallback.length,
              fallbackInstances: binding.members?.reduce((sum, member) => sum + member.indices.length, 0) ?? 0,
              placements: binding.placements })), fixed: generatedScenePlacements(scenario), statuses });
        } finally { assets.dispose(); environment.dispose(); }
      }
    } finally { library.dispose(); }
    if (process.env.RECORD_PROP_COVERAGE === '1') {
      mkdirSync('artifacts/asset-coverage-fix-20261031', { recursive: true });
      writeFileSync('artifacts/asset-coverage-fix-20261031/props-runtime-checks.json', JSON.stringify({
        scope: '15 real environment builders + production GLB parse and source-frame calibration; texture decode mocked. No WebGL/browser/visual/performance acceptance.',
        generatedAt: new Date().toISOString(), sourceCatalog: 'src/assets/scene-asset-catalog.ts', scenarios,
        knownAdaptations: ['S04 transfer bus reuses PROP-VEH-TRANSPORT; transport-truck body rather than a dedicated bus.',
          'Terminal head uses a compact uniformly scaled CONSOLE; architecture owns its generated structural pedestal.',
          'Existing radio-pack body also serves as the spare/table field radio; no new radio model is claimed.',
          'S03 has four complete AK rack displays via GeneratedWorldWeapons; separate weapon parts are not claimed. See world-weapons-runtime-checks.json.'],
        partContractGaps: ['PROP-FAN is one static mesh; production impeller separation remains required. Old rotor is hidden after successful replacement.',
          'PROP-DOOR-LEAF and PROP-DOOR-LOCK move as intact authored hosts; internal mechanism / hinges are not individually articulated.',
          'PROP-TOOL-LUNCHBOX is a closed intact box; open lid, loose food and utensils are not produced parts.'],
        existingBaseNeedsCalibration: ['S01/S02 toppled and fire cabinets have very different thin collision envelopes; SAMPLE-CABINET exists but a rigid pose/fit contract is still needed.',
          'S01/S02 fallen cabinet door can reuse DOOR-LEAF after a lying pose/envelope calibration.'],
        noExactProducedProp: ['S03 four exposed ice cores and eight end caps; a closed SAMPLE-CORECASE does not supply independently verified core geometry', 'S01/S02 mattress in flat and upright states', 'S06 basin/faucet, drinking bottle and medical bandage roll',
          'S08 transferred pillow/identity-card holder', 'S09 drinking bottle', 'S11 IV stand/bag/tube and privacy curtain'],
      }, null, 2) + '\n');
    }
  }, 20000);

  it('replaces both S04 transport bodies at their authored locations', async () => {
    const environment = own(buildEnvironment('workers'));
    const bindings = readGeneratedPropBindings(environment.root).filter(binding => binding.placements.some(placement => placement.assetId === 'PROP-VEH-TRANSPORT'));
    expect(bindings.length).toBeGreaterThanOrEqual(2);
    expect(bindings.some(binding => binding.id === 'workers-transfer-vehicle')).toBe(true);
    expect(bindings.some(binding => binding.id.startsWith('workers-military-truck-'))).toBe(true);
    const assets = own(new GeneratedSceneAssets(library(), { parent: environment.root, scenario: 'workers', baseURL })); await assets.ready;
    for (const binding of bindings) expect(binding.fallback.every(child => !child.visible)).toBe(true);
    expect(environment.root.getObjectByName('generated-placement:front-transport-vehicle')).toBeUndefined();
  });

  it('restores S03 collected/delivered visibility and never spins the complete generated fan', async () => {
    const environment = own(buildEnvironment('nightshift'));
    environment.setFacts!(['supplies-collected', 'supplies-delivered', 'fan-cleared', 'fan-restarted']);
    const source = environment.root.getObjectByName('night-supplies-source')!, delivered = environment.root.getObjectByName('night-supplies-delivered')!;
    const assets = own(new GeneratedSceneAssets(library(), { parent: environment.root, scenario: 'nightshift', baseURL })); await assets.ready;
    expect(source.visible).toBe(false); expect(delivered.visible).toBe(true);
    expect(source.getObjectByName('generated-placement:night-supplies-source')).toBeDefined();
    const fan = environment.root.getObjectByName('generated-placement:night-fan-body')!;
    const rotation = fan.rotation.toArray(); environment.update(1, new Vector3()); environment.update(2, new Vector3());
    expect(fan.rotation.toArray()).toEqual(rotation);
    const rotor = environment.root.getObjectByName('night-fan-rotor')!;
    expect(rotor.visible).toBe(false); expect(rotor.userData.productionAnimationPending).toBe('separate impeller');
    environment.setFacts!([]); expect(source.visible).toBe(true); expect(delivered.visible).toBe(false);
    assets.dispose(); expect(source.visible).toBe(true); expect(delivered.visible).toBe(false);
  });

  it.each([
    ['workers', 'checkpoint-gate-panel--1', 'checkpoint-open', 'x'],
    ['transfer', 'transfer-shutter', 'transfer-gate-open', 'x'],
    ['escort', 'escort-loading-door', 'escort-convoy-started', 'z'],
    ['childhood', 'history-maintenance-door', 'history-gate-open', 'z'],
  ] as const)('keeps %s generated door leaves on the state-owned moving node', async (scenario, name, fact, axis) => {
    const environment = own(buildEnvironment(scenario)); environment.setFacts!([]);
    const assets = own(new GeneratedSceneAssets(library(), { parent: environment.root, scenario, baseURL })); await assets.ready;
    const host = environment.root.getObjectByName(name)!;
    expect(host, name).toBeDefined();
    const mount = host.children.find(child => child.name.startsWith('generated-placement:'))!;
    const before = mount.getWorldPosition(new Vector3())[axis], local = mount.position.clone();
    environment.setFacts!([fact]);
    const after = mount.getWorldPosition(new Vector3())[axis];
    expect(Math.abs(after - before)).toBeGreaterThan(1);
    expect(mount.position).toEqual(local); expect(host.visible).toBe(true);
  });

  it('loads the restored S12 open door at the same raised position as its host', async () => {
    const environment = own(buildEnvironment('epilogue')); environment.setFacts!(['reception-door-open']);
    const assets = own(new GeneratedSceneAssets(library(), { parent: environment.root, scenario: 'epilogue', baseURL })); await assets.ready;
    const door = environment.root.getObjectByName('epilogue-reception-door')!;
    expect(door.position.y).toBeCloseTo(5.2);
    const mount = door.children.find(child => child.name.startsWith('generated-placement:'))!;
    environment.root.updateMatrixWorld(true);
    expect(new Box3().setFromObject(mount).min.y).toBeCloseTo(3.5, 5);
  });

  it('retains a hidden state host, commits a whole prop group atomically, and restores old children', async () => {
    const parent = new Group(), host = new Group(), fallback = new Group(); host.add(fallback); parent.add(host); host.visible = false;
    bindGeneratedProp(host, 'care-kit', [propPlacement('bag', 'PROP-MEDICAL-BAG', [0, 0, 0], 1), propPlacement('mug', 'PROP-LIFE-MUG', [1, 0, 0], 0.2)]);
    const pending: Array<{ resolve(value: ModelLease): void; reject(error: Error): void }> = [];
    const controller = own(new GeneratedSceneAssets({ acquire: () => new Promise<ModelLease>((resolve, reject) => pending.push({ resolve, reject })) }, { parent, scenario: 'nightshift', baseURL }));
    const bag = lease('PROP-MEDICAL-BAG'); pending[0].resolve(bag); await Promise.resolve();
    expect(host.children).toEqual([fallback]); expect(fallback.visible).toBe(true);
    pending[1].reject(new Error('decode failed')); await controller.ready;
    expect(host.visible).toBe(false); expect(fallback.visible).toBe(true); expect(bag.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().every(status => status.state === 'error')).toBe(true);
    controller.dispose(); expect(host.visible).toBe(false);
  });

  it('cancels a late dynamic attachment without exposing the hidden host', async () => {
    const parent = new Group(), host = new Group(), fallback = new Group(); host.add(fallback); parent.add(host); host.visible = false;
    bindGeneratedProp(host, 'crate', [propPlacement('crate', 'PROP-CARGO', [0, 0, 0], 1)]);
    let resolve!: (value: ModelLease) => void;
    const assets = own(new GeneratedSceneAssets({ acquire: () => new Promise<ModelLease>(done => { resolve = done; }) }, { parent, scenario: 'nightshift', baseURL }));
    assets.dispose(); const late = lease('PROP-CARGO'); resolve(late); await assets.ready;
    expect(late.dispose).toHaveBeenCalledTimes(1); expect(host.children).toEqual([fallback]); expect(host.visible).toBe(false);
    expect(assets.getStatus()[0].state).toBe('cancelled');
  });

  it('replaces exact tractor/terminal members, preserves the shared terminal base, and applies located transforms once', async () => {
    const kit = new PortKit(); cleanups.push(() => disposeModelTree(kit.root));
    kit.box('steel', [100, 1, 100], [1, 2, 1]);
    kit.located([20, 0, -10], 0.4, () => { kit.tractor(2, 4, -0.2); kit.terminal([10, 0, 8]); }); kit.flush();
    const semantics = readPortKitSemantics(kit.root), terminal = semantics.find(item => item.kind === 'terminal')!;
    const base = readPortKitPrimitives(kit.root).find(item => item.semantic === terminal && item.surface === 'steel')!;
    const baseBefore = matrixAt(base.mesh!, base.index);
    const binding = readGeneratedPropBindings(kit.root).find(item => item.placements[0].assetId === 'PROP-VEH-TUG')!;
    const originals = binding.members!.map(member => member.indices.map(index => matrixAt(member.mesh, index)));
    const assets = own(new GeneratedSceneAssets(library(), { parent: kit.root, scenario: 'nightshift', baseURL })); await assets.ready;
    expect(matrixAt(base.mesh!, base.index)).toEqual(baseBefore);
    const placement = binding.placements[0], mount = kit.root.getObjectByName(`generated-placement:${placement.id}`)!;
    expect(mount.getWorldPosition(new Vector3()).distanceTo(new Vector3(...placement.position).applyMatrix4(binding.originMatrix!))).toBeLessThan(1e-6);
    assets.dispose();
    binding.members!.forEach((member, i) => member.indices.forEach((index, j) => expect(matrixAt(member.mesh, index)).toEqual(originals[i][j])));
    expect(matrixAt(base.mesh!, base.index)).toEqual(baseBefore);
  });
});
