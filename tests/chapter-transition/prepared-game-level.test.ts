import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { ModelLibrary } from '../../src/assets/ModelLibrary';
import type { ModelAcquireOptions, ModelLease, ModelSource, ModelTemplate } from '../../src/assets/model-contracts';
import { SCENE_ASSETS } from '../../src/assets/scene-asset-catalog';
import * as sceneCatalog from '../../src/assets/scene-asset-catalog';
import { characterAssetFor, playerCharacterIdentity } from '../../src/assets/character-catalog';
import type { EnvironmentModel, ScenarioId } from '../../src/contracts';
import * as simulations from '../../src/mission/Simulation';
import type { Actor, Snapshot } from '../../src/mission/Simulation';
import * as environments from '../../src/presentation/environment';
import * as sceneAssets from '../../src/presentation/GeneratedSceneAssets';
import * as architectureAssets from '../../src/presentation/GeneratedArchitecture';
import * as worldWeapons from '../../src/presentation/GeneratedWorldWeapons';
import type { ArchitectureStatus } from '../../src/presentation/GeneratedArchitecture';
import type { GeneratedSceneAssetStatus, GeneratedSceneAssetsOptions } from '../../src/presentation/GeneratedSceneAssets';
import { initializePhysics } from '../../src/runtime/Physics';
import { SaveStore } from '../../src/persistence/SaveStore';
import { createGameLevel, prepareGameLevel, type GameLevelOptions } from '../../src/chapter-transition/PreparedGameLevel';

const baseURL = 'https://example.invalid/ganymede/index.html';
const options: GameLevelOptions = { scenario: 'mainhall', baseURL };
const cleanup: Array<() => void> = [];
function own<T extends { dispose(): void }>(value: T): T { cleanup.push(() => value.dispose()); return value; }
function abortController() { const value = new AbortController(); cleanup.push(() => value.abort()); return value; }
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function actor(id: string, role: Actor['role'], name = id): Actor {
  return { id, role, name, position: [0, 0, 0], health: 100, yaw: 0, goals: [], path: [], walk: 0, aiming: false,
    aimTime: 0, cooldown: 0, safe: false, released: false, down: false };
}
function lease() {
  const root = new Group();
  return { root, animations: [], mixer: new AnimationMixer(root), dispose: vi.fn(() => root.removeFromParent()) } satisfies ModelLease;
}
function pendingLibrary() {
  const pending: Array<{ source: ModelSource; options?: ModelAcquireOptions; task: ReturnType<typeof deferred<ModelLease>> }> = [];
  const library = { acquire: vi.fn((source: ModelSource, options?: ModelAcquireOptions) => {
    const task = deferred<ModelLease>(); pending.push({ source, options, task }); return task.promise;
  }) };
  return { library, pending };
}
function start(library: Pick<ModelLibrary, 'acquire'>, opts = options, progress = vi.fn<(fraction: number) => void>()) {
  const controller = abortController();
  const promise = prepareGameLevel(library, opts, controller.signal, progress);
  void promise.catch(() => {}); // Tests deliberately hold/reject tasks before awaiting their result.
  return { promise, controller, progress };
}

/** Mocks only construction boundaries. The actual PreparedGameLevel code owns these objects. */
function harness(actors: Actor[] = [], scenario: ScenarioId = 'mainhall', realScenery = false, holdArchitecture = false) {
  const order: string[] = [], rootsAtEnvironmentDisposal: string[][] = [];
  const environment: EnvironmentModel = {
    root: new Group(), solids: [], update: vi.fn(), setFacts: vi.fn(),
    dispose: vi.fn(() => { order.push('environment'); rootsAtEnvironmentDisposal.push(environment.root.children.map(node => node.name)); }),
  };
  const sim = { scenario, actors, player: { name: '周延 · 三十三岁', height: 1.8 }, mission: { elapsed: 0, facts: [] }, step: vi.fn(),
    dispose: vi.fn(() => { order.push('simulation'); }) } as unknown as simulations.Simulation;
  const ready = deferred<readonly GeneratedSceneAssetStatus[]>(), root = new Group(); root.name = 'borrowed-scenery';
  const scenery = { root, ready: ready.promise,
    dispose: vi.fn(() => { order.push('scenery'); root.removeFromParent(); }), getStatus: () => [],
  } as unknown as sceneAssets.GeneratedSceneAssets;
  const architectureReady = deferred<readonly ArchitectureStatus[]>(), architectureRoot = new Group(); architectureRoot.name = 'borrowed-architecture';
  if (!holdArchitecture) architectureReady.resolve([]);
  const architecture = { root: architectureRoot, ready: architectureReady.promise, update: vi.fn(),
    dispose: vi.fn(() => { order.push('architecture'); architectureRoot.removeFromParent(); }),
  } as unknown as architectureAssets.GeneratedArchitecture;
  let architectureOptions: ConstructorParameters<typeof architectureAssets.GeneratedArchitecture>[1] | undefined;
  let sceneryOptions: GeneratedSceneAssetsOptions | undefined;
  const build = vi.spyOn(environments, 'buildEnvironment').mockReturnValue(environment);
  const simulation = vi.spyOn(simulations, 'Simulation').mockImplementation(class {
    constructor(..._args: ConstructorParameters<typeof simulations.Simulation>) { return sim; }
  } as typeof simulations.Simulation);
  const scene = realScenery ? undefined : vi.spyOn(sceneAssets, 'GeneratedSceneAssets').mockImplementation(class {
    constructor(_library: Pick<ModelLibrary, 'acquire'>, options: GeneratedSceneAssetsOptions) {
      sceneryOptions = options; options.parent.add(root); return scenery;
    }
  } as typeof sceneAssets.GeneratedSceneAssets);
  const structure = vi.spyOn(architectureAssets, 'GeneratedArchitecture').mockImplementation(class {
    constructor(_library: Pick<ModelLibrary, 'acquire'>, options: ConstructorParameters<typeof architectureAssets.GeneratedArchitecture>[1]) {
      architectureOptions = options; options.parent.add(architectureRoot); return architecture;
    }
  } as typeof architectureAssets.GeneratedArchitecture);
  return { environment, sim, scenery, ready, build, simulation, scene, order, rootsAtEnvironmentDisposal,
    architecture, architectureReady, structure,
    reportArchitecture: (status: ArchitectureStatus) => architectureOptions?.onStatus?.(status),
    report: (status: GeneratedSceneAssetStatus) => sceneryOptions?.onStatus?.(status) };
}

function template() {
  const geometry = new BoxGeometry(), map = new Texture(), material = new MeshStandardMaterial({ map });
  const scene = new Group(); scene.add(new Mesh(geometry, material));
  const disposed = { geometry: vi.fn(), material: vi.fn(), texture: vi.fn() };
  geometry.addEventListener('dispose', disposed.geometry); material.addEventListener('dispose', disposed.material); map.addEventListener('dispose', disposed.texture);
  return { value: { scene, animations: [] } satisfies ModelTemplate, disposed };
}

describe('detached level construction and construction rollback', () => {
  it('constructs the real environment/simulation without ticking, saving, warming or attaching a live scene', async () => {
    await initializePhysics();
    // Keep environment/Simulation real while isolating the three asynchronous I/O owners.
    vi.spyOn(sceneAssets, 'GeneratedSceneAssets').mockImplementation(class {
      ready = Promise.resolve([]); dispose() {}
    } as unknown as typeof sceneAssets.GeneratedSceneAssets);
    vi.spyOn(architectureAssets, 'GeneratedArchitecture').mockImplementation(class {
      ready = Promise.resolve([]); dispose() {}
    } as unknown as typeof architectureAssets.GeneratedArchitecture);
    vi.spyOn(worldWeapons, 'GeneratedWorldWeapons').mockImplementation(class {
      ready = Promise.resolve([]); dispose() {}
    } as unknown as typeof worldWeapons.GeneratedWorldWeapons);
    const save = vi.spyOn(SaveStore.prototype, 'save'), step = vi.spyOn(simulations.Simulation.prototype, 'step');
    const getItem = vi.fn(), setItem = vi.fn(); vi.stubGlobal('localStorage', { getItem, setItem });
    const library = { acquire: vi.fn(() => Promise.reject(new Error('no model request expected'))) };
    const old = own(createGameLevel(library, { scenario: 'nightshift', baseURL }));
    const live = new Group(); live.add(old.environment.root);
    const before = old.sim.snapshot(), facts = ['prior-test-fact'];
    const next = own(createGameLevel(library, { scenario: 'nightshift', baseURL, facts }));
    await next.scenery.ready;
    expect(next.environment.root.parent).toBeNull(); expect(live.children).toEqual([old.environment.root]);
    expect(next.sim).not.toBe(old.sim); expect(next.sim.mission.elapsed).toBe(0); expect(next.sim.mission.facts).toContain('prior-test-fact');
    expect(old.sim.snapshot()).toEqual(before); expect(facts).toEqual(['prior-test-fact']);
    expect(step).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled();
    expect(library.acquire).not.toHaveBeenCalled();
    next.dispose(); next.dispose(); expect(next.isDisposed).toBe(true); expect(old.isDisposed).toBe(false);
    expect(live.children).toEqual([old.environment.root]); expect(old.sim.snapshot()).toEqual(before);
  });

  it('passes saved state/facts to construction and keeps status/errors local to its own level', () => {
    const h = harness(), library = pendingLibrary(), saved = { mission: { scenario: 'mainhall' } } as Snapshot, facts = ['existing-fact'];
    const oldErrors = new Set(['old-placement']);
    const level = own(createGameLevel(library.library, { ...options, saved, facts }));
    expect(h.simulation).toHaveBeenCalledWith('mainhall', h.environment.solids, saved, facts);
    expect(h.environment.root.parent).toBeNull(); expect(library.library.acquire).not.toHaveBeenCalled();
    h.report({ id: 'next-placement', assetId: 'PROP-BENCH', state: 'error' });
    expect(level.sceneAssetErrors).toEqual(new Set(['next-placement'])); expect(oldErrors).toEqual(new Set(['old-placement']));
    h.report({ id: 'next-placement', assetId: 'PROP-BENCH', state: 'ready' }); expect(level.sceneAssetErrors.size).toBe(0);
    level.dispose(); h.report({ id: 'late', assetId: 'PROP-BENCH', state: 'error' }); expect(level.sceneAssetErrors.size).toBe(0);
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']); expect(h.rootsAtEnvironmentDisposal).toEqual([[]]);
  });

  it.each(['environment', 'simulation', 'scenery', 'architecture'] as const)('rejects a structural %s failure and releases every successfully constructed earlier owner', async stage => {
    const h = harness(), failure = new Error(`broken ${stage}`), library = pendingLibrary();
    if (stage === 'environment') h.build.mockImplementation(() => { throw failure; });
    else if (stage === 'simulation') h.simulation.mockImplementation(class { constructor() { throw failure; } } as unknown as typeof simulations.Simulation);
    else if (stage === 'scenery') h.scene!.mockImplementation(class { constructor() { throw failure; } } as unknown as typeof sceneAssets.GeneratedSceneAssets);
    else h.structure.mockImplementation(class { constructor() { throw failure; } } as unknown as typeof architectureAssets.GeneratedArchitecture);
    const run = start(library.library);
    await expect(run.promise).rejects.toBe(failure);
    expect(library.library.acquire).not.toHaveBeenCalled();
    expect(h.order).toEqual(stage === 'environment' ? [] : stage === 'simulation' ? ['environment']
      : stage === 'architecture' ? ['scenery', 'simulation', 'environment'] : ['simulation', 'environment']);
  });

  it('rejects mismatched checkpoints before constructing the environment', async () => {
    const h = harness(), run = start(pendingLibrary().library, { ...options, saved: { mission: { scenario: 'epilogue' } } as Snapshot });
    await expect(run.promise).rejects.toThrow('检查点'); expect(h.build).not.toHaveBeenCalled();
  });
});

describe('real readiness, deduplicated warming and resource ownership', () => {
  it.each([
    ['childhood', '陆闻川', 'child', 'CH-LU-CHILD'],
    ['prologue', '陆闻川 · 九岁', 'child', 'CH-LU-CHILD'],
    ['medical', '陆闻川 · 十九岁', 'ally', 'CH-LU'],
    ['rescue', '周延 · 三十三岁', 'ally', 'CH-ZHOU'],
  ] as const)('warms the authored player identity in %s without using crouched or injured height', async (scenario, name, role, assetId) => {
    const h = harness([], scenario), acquire = vi.fn(async (_source: ModelSource) => lease());
    h.sim.player.name = name; h.sim.player.height = 0.65;
    const identity = playerCharacterIdentity(scenario, name);
    expect(identity).toEqual({ id: 'player', name, role }); expect(characterAssetFor(identity)?.id).toBe(assetId);
    const run = start({ acquire }, { scenario, baseURL }); h.ready.resolve([]);
    const level = own(await run.promise);
    expect(acquire).toHaveBeenCalledOnce(); expect(acquire.mock.calls[0][0]).toMatchObject({ id: assetId });
    expect(level.warmAssetErrors.size).toBe(0);
  });

  it('waits for architecture readiness after scenery and player warming finish, then records failures locally', async () => {
    const h = harness([], 'mainhall', false, true), library = { acquire: vi.fn(async () => lease()) };
    const oldErrors = new Set(['old-building']);
    const run = start(library); h.ready.resolve([]);
    let entered = false; void run.promise.then(() => { entered = true; });
    await flush(); expect(entered).toBe(false); expect(run.progress.mock.calls.at(-1)).toEqual([2 / 3]);
    h.reportArchitecture({ id: 'new-building', state: 'error', error: 'decode failed; fallback retained' });
    h.architectureReady.resolve([{ id: 'new-building', state: 'error', error: 'decode failed; fallback retained' }]);
    const level = own(await run.promise);
    expect(level.architecture).toBe(h.architecture); expect(level.architectureAssetErrors).toEqual(new Set(['new-building']));
    expect(level.sceneAssetErrors.size).toBe(0); expect(oldErrors).toEqual(new Set(['old-building']));
    expect(run.progress.mock.calls.at(-1)).toEqual([1]); expect(h.architecture.update).not.toHaveBeenCalled();
    level.dispose(); h.reportArchitecture({ id: 'late-building', state: 'error' });
    expect(level.architectureAssetErrors).toEqual(new Set(['new-building']));
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
    expect(h.rootsAtEnvironmentDisposal).toEqual([[]]);
  });

  it.each(['cancel', 'cancelled-result', 'reject'] as const)('releases architecture before other owners on %s while readiness is pending', async outcome => {
    const h = harness([], 'mainhall', false, true), acquired = lease(), run = start({ acquire: vi.fn(async () => acquired) });
    h.ready.resolve([]); await flush();
    const progress = run.progress.mock.calls.length;
    if (outcome === 'cancel') run.controller.abort();
    else if (outcome === 'cancelled-result') h.architectureReady.resolve([{ id: 'cancelled-building', state: 'cancelled' }]);
    else h.architectureReady.reject(new Error('architecture readiness crashed'));
    if (outcome === 'reject') await expect(run.promise).rejects.toThrow('architecture readiness crashed');
    else await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
    expect(acquired.dispose).toHaveBeenCalledOnce(); expect(h.environment.root.parent).toBeNull();
    if (outcome === 'cancel') h.architectureReady.resolve([{ id: 'late-building', state: 'ready' }]);
    await flush(); expect(run.progress.mock.calls).toHaveLength(progress);
  });

  it('awaits the real GeneratedSceneAssets ready promise instead of mere factory construction', async () => {
    const consolePlacement = sceneCatalog.generatedScenePlacements('epilogue').find(item => item.id === 'epilogue-reception-console')!;
    vi.spyOn(sceneCatalog, 'generatedScenePlacements').mockReturnValue([consolePlacement]);
    const h = harness([], 'epilogue', true), library = pendingLibrary();
    const slot = new Group(); slot.name = 'generated-fallback:epilogue-reception-console'; h.environment.root.add(slot);
    const run = start(library.library, { scenario: 'epilogue', baseURL });
    let settled = false; void run.promise.then(() => { settled = true; });
    await flush(); expect(settled).toBe(false); expect(slot.visible).toBe(true); expect(run.progress.mock.calls).toEqual([[0], [1 / 3]]);
    expect(library.pending).toHaveLength(2); expect(library.pending[0].source.id).toBe('PROP-TERMINAL-CONSOLE');
    const bounds = SCENE_ASSETS['PROP-TERMINAL-CONSOLE'].sourceBounds;
    const min = new Vector3(...bounds.min), max = new Vector3(...bounds.max), size = max.clone().sub(min), center = max.clone().add(min).multiplyScalar(0.5);
    const acquired = lease(), geometry = new BoxGeometry(size.x, size.y, size.z), material = new MeshStandardMaterial(), mesh = new Mesh(geometry, material);
    cleanup.push(() => { geometry.dispose(); material.dispose(); }); mesh.position.copy(center); acquired.root.add(mesh);
    library.pending[0].task.resolve(acquired);
    library.pending[1].task.resolve(lease());
    const level = own(await run.promise);
    expect(level.scenery.getStatus()[0].state).toBe('ready'); expect(slot.visible).toBe(false); expect(h.environment.root.parent).toBeNull();
    expect(run.progress.mock.calls.map(([fraction]) => fraction)).toEqual([0, 1 / 3, 2 / 3, 1]); expect(acquired.dispose).not.toHaveBeenCalled();
    level.dispose(); expect(slot.visible).toBe(true); expect(acquired.dispose).toHaveBeenCalledOnce();
    expect(h.rootsAtEnvironmentDisposal[0]).toEqual(['generated-fallback:epilogue-reception-console']);
  });

  it('warms crowd skins, separate cart assets and compatible tactical packs once per source, retaining templates across activation', async () => {
    const h = harness([actor('guard-a', 'ally'), actor('guard-b', 'ally'), actor('young-lu', 'child'), actor('hall-invader-0', 'civilian'),
      actor('late-civilian-0', 'civilian'), actor('evac-crowd-0', 'civilian'), actor('civilian-0', 'civilian'), actor('patient', 'cart')]);
    const fixtures = new Map<string, ReturnType<typeof template>>();
    const loader = vi.fn(async (source: ModelSource) => { const item = template(); fixtures.set(source.id, item); return item.value; });
    const library = own(new ModelLibrary(loader)), acquire = vi.spyOn(library, 'acquire');
    const run = start(library); h.ready.resolve([]);
    const level = own(await run.promise);
    const sources = loader.mock.calls.map(([source]) => source);
    const expected = ['ANIM-WALK-CANONICAL', 'CH-DOCTOR', 'CH-ENEMY', 'CH-LU-CHILD', 'CH-SHEN', 'CH-ZHOU', 'PROP-TRANSFER', 'TACTICAL-CH-ENEMY', 'TACTICAL-CH-ZHOU', 'WP-AK47'];
    expect(sources.map(source => source.id).sort()).toEqual(expected);
    // Count leases as well as downloads: the library cache alone could hide
    // duplicate warm acquisitions for the three anonymous resident identities.
    expect(acquire.mock.calls.map(([source]) => source.id).sort()).toEqual(expected);
    expect(sources.every(source => source.url.startsWith(baseURL.replace('index.html', '')))).toBe(true);
    expect(run.progress.mock.calls.map(([fraction]) => fraction)).toEqual(Array.from({ length: 13 }, (_, i) => i / 12));
    for (const item of fixtures.values()) for (const spy of Object.values(item.disposed)) expect(spy).not.toHaveBeenCalled();
    const active = await library.acquire(sources.find(source => source.id === 'CH-ZHOU')!);
    const shared = fixtures.get('CH-ZHOU')!;
    expect(loader).toHaveBeenCalledTimes(10); expect(active.root.getObjectByProperty('isMesh', true)).toBeDefined();
    const live = new Group(); live.add(level.environment.root, active.root);
    // Cancellation after fulfilled preparation does not destroy the transferred active level.
    run.controller.abort(); expect(level.isDisposed).toBe(false);
    level.dispose(); level.dispose(); expect(level.environment.root.parent).toBeNull();
    for (const [id, item] of fixtures) for (const spy of Object.values(item.disposed)) expect(spy).toHaveBeenCalledTimes(id === 'CH-ZHOU' ? 0 : 1);
    expect(active.root.parent).toBe(live); active.dispose();
    for (const spy of Object.values(shared.disposed)) expect(spy).toHaveBeenCalledOnce();
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
  });

  it('does not report warm readiness while a model is pending, and progress only changes on actual completion', async () => {
    const h = harness([actor('doctor', 'medic')]), library = pendingLibrary(), run = start(library.library);
    let ready = false; void run.promise.then(() => { ready = true; });
    h.ready.resolve([]); await flush();
    expect(ready).toBe(false); expect(library.pending).toHaveLength(2); expect(run.progress.mock.calls).toEqual([[0], [1 / 5], [2 / 5]]);
    await flush(); expect(run.progress.mock.calls).toEqual([[0], [1 / 5], [2 / 5]]);
    const one = lease(), two = lease(); library.pending[0].task.resolve(one); await flush();
    expect(ready).toBe(false); expect(run.progress.mock.calls.at(-1)).toEqual([3 / 5]);
    library.pending[1].task.resolve(two); await flush();
    expect(ready).toBe(false); expect(library.pending).toHaveLength(3);
    const three = lease(); library.pending[2].task.resolve(three); const level = own(await run.promise);
    expect(run.progress.mock.calls.at(-1)).toEqual([1]); expect(one.dispose).not.toHaveBeenCalled(); expect(two.dispose).not.toHaveBeenCalled();
    level.dispose(); expect(one.dispose).toHaveBeenCalledOnce(); expect(two.dispose).toHaveBeenCalledOnce(); expect(three.dispose).toHaveBeenCalledOnce();
  });

  it('allows completed decode failures to use whitebox fallback and reports both scene and warm failures', async () => {
    const h = harness([actor('zheng', 'ally')]), calls: ModelSource[] = [];
    const library = { acquire: vi.fn(async (source: ModelSource) => { calls.push(source); throw new Error('图片解码失败'); }) };
    const run = start(library);
    h.ready.resolve([{ id: 'failed-terminal', assetId: 'PROP-TERMINAL-CONSOLE', state: 'error', message: '纹理不可用' }]);
    const level = own(await run.promise);
    expect(level.sceneAssetErrors).toEqual(new Set(['failed-terminal']));
    expect(level.warmAssetErrors).toEqual(new Set(['CH-ZHOU', 'CH-ZHENG', 'TACTICAL-CH-ZHENG', 'ANIM-WALK-CANONICAL', 'WP-AK47']));
    expect(calls).toHaveLength(5); expect(level.isDisposed).toBe(false); expect(run.progress.mock.calls.at(-1)).toEqual([1]);
    expect(h.sim.step).not.toHaveBeenCalled(); expect(h.environment.setFacts).not.toHaveBeenCalled(); expect(h.environment.update).not.toHaveBeenCalled();
  });

  it('rejects an unexpected scenery readiness error and cancels other pending model acquisitions', async () => {
    const h = harness([actor('doctor', 'medic')]), library = pendingLibrary(), run = start(library.library);
    const failure = new Error('broken scenery preparation'); h.ready.reject(failure);
    await expect(run.promise).rejects.toBe(failure);
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
    for (const item of library.pending) { expect(item.options!.signal!.aborted).toBe(true); const late = lease(); item.task.resolve(late); await flush(); expect(late.dispose).toHaveBeenCalledOnce(); }
  });
});

describe('cancellation never becomes a successful fallback preload', () => {
  it('rejects a cancelled scenery result even if its ready promise resolves normally', async () => {
    const h = harness(), run = start(pendingLibrary().library);
    h.ready.resolve([{ id: 'left-scene', assetId: 'PROP-BENCH', state: 'cancelled' }]);
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']); expect(run.progress.mock.calls.at(-1)![0]).toBeLessThan(1);
  });

  it('does not construct anything for an already aborted signal', async () => {
    const h = harness(), controller = abortController(), library = pendingLibrary(); controller.abort();
    await expect(prepareGameLevel(library.library, options, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.build).not.toHaveBeenCalled(); expect(library.library.acquire).not.toHaveBeenCalled();
  });

  it('rejects promptly while scene.ready hangs and releases ignored-abort model results on arrival', async () => {
    const h = harness([actor('doctor', 'medic')]), library = pendingLibrary(), run = start(library.library);
    const before = run.progress.mock.calls.length; run.controller.abort();
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']); expect(h.environment.root.parent).toBeNull();
    for (const item of library.pending) { const late = lease(); item.task.resolve(late); await flush(); expect(late.dispose).toHaveBeenCalledOnce(); expect(late.root.parent).toBeNull(); }
    h.ready.resolve([]); await flush(); expect(run.progress.mock.calls).toHaveLength(before);
  });

  it('releases leases resolved just before abort, before await continuations can retain them', async () => {
    const h = harness([actor('doctor', 'medic')]), library = pendingLibrary(), run = start(library.library);
    const leases = library.pending.map(() => lease());
    library.pending.forEach((item, index) => item.task.resolve(leases[index])); h.ready.resolve([]); run.controller.abort();
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' }); await flush();
    for (const item of leases) expect(item.dispose).toHaveBeenCalledOnce();
    expect(run.progress.mock.calls).toEqual([[0]]); expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
  });

  it('stops before starting more work when the progress observer cancels synchronously', async () => {
    const h = harness([actor('doctor', 'medic')]), library = pendingLibrary(), controller = abortController();
    await expect(prepareGameLevel(library.library, options, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(library.library.acquire).not.toHaveBeenCalled(); expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
  });

  it('treats an AbortError from a disposed shared library as cancellation, not a decode fallback', async () => {
    const h = harness([actor('doctor', 'medic')]); h.ready.resolve([]);
    const library = { acquire: vi.fn(async () => { throw new DOMException('owner left', 'AbortError'); }) };
    const run = start(library);
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' }); expect(h.order).toEqual(['architecture', 'scenery', 'simulation', 'environment']);
    expect(run.progress.mock.calls.at(-1)![0]).toBeLessThan(1);
  });

  it('preserves active anonymous body and walk leases across cancelled preparation and re-entry', async () => {
    const residents = () => [actor('late-civilian-0', 'civilian'), actor('evac-crowd-0', 'civilian'),
      actor('civilian-0', 'civilian')];
    const h = harness(residents()), fixtures = new Map<string, ReturnType<typeof template>>();
    const loader = vi.fn(async (source: ModelSource) => { const value = template(); fixtures.set(source.id, value); return value.value; });
    const library = own(new ModelLibrary(loader));
    const run = start(library); await flush();
    const sources = loader.mock.calls.map(([source]) => source);
    expect(sources.map(source => source.id).sort()).toEqual(['ANIM-WALK-CANONICAL', 'CH-SHEN', 'CH-ZHOU']);
    // A live imported resident owns both the body and canonical walk source.
    const body = own(await library.acquire(sources.find(source => source.id === 'CH-SHEN')!));
    const walk = own(await library.acquire(sources.find(source => source.id === 'ANIM-WALK-CANONICAL')!));
    const player = own(await library.acquire(sources.find(source => source.id === 'CH-ZHOU')!));
    const oldScene = new Group(); oldScene.add(body.root);
    run.controller.abort(); await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(body.root.parent).toBe(oldScene); expect(loader).toHaveBeenCalledTimes(3);
    for (const fixture of fixtures.values()) for (const spy of Object.values(fixture.disposed)) expect(spy).not.toHaveBeenCalled();

    const next = harness(residents()), reentry = start(library); next.ready.resolve([]);
    const level = own(await reentry.promise);
    h.ready.resolve([]); await flush(); // The cancelled scenery result cannot affect either current owner.
    expect(level.isDisposed).toBe(false); expect(body.root.parent).toBe(oldScene);
    expect(loader).toHaveBeenCalledTimes(3); expect(reentry.progress.mock.calls.at(-1)).toEqual([1]);
    body.dispose(); walk.dispose(); player.dispose();
    for (const fixture of fixtures.values()) for (const spy of Object.values(fixture.disposed)) expect(spy).not.toHaveBeenCalled();
    level.dispose();
    for (const fixture of fixtures.values()) for (const spy of Object.values(fixture.disposed)) expect(spy).toHaveBeenCalledOnce();
  });
});
