import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Group, Scene } from 'three';
import type { EnvironmentModel, RunMode, ScenarioId, SolidSpec } from '../../src/contracts';
import type { ModelLibrary } from '../../src/assets/ModelLibrary';
import type { ModelLease } from '../../src/assets/model-contracts';
import type { DialogueAsset } from '../../src/audio/contracts';
import type { ChapterProgress } from '../../src/content/chapter-flow';
import type { GeneratedSceneAssetsOptions, GeneratedSceneAssetStatus } from '../../src/presentation/GeneratedSceneAssets';
import type { ChapterTransition } from '../../src/chapter-transition/ChapterTransition';
import type { CampaignEntryPlan } from '../../src/chapter-transition/CampaignEntryPlan';
import type { CampaignTransitionPlan } from '../../src/chapter-transition/CampaignTransitionPlan';

interface OverlayActions { skip(): void; retry(): void; menu(): void; togglePause(): void }
const boundaries = vi.hoisted(() => ({
  environment: vi.fn(), scenery: vi.fn(), overlays: [] as OverlayActions[],
}));
vi.mock('../../src/chapter-transition/TransitionOverlay', () => ({
  TransitionOverlay: class {
    constructor(_parent: HTMLElement, actions: OverlayActions) { boundaries.overlays.push(actions); }
    render() {}
    dispose() {}
  },
}));
vi.mock('../../src/presentation/environment', () => ({ buildEnvironment: boundaries.environment }));
vi.mock('../../src/presentation/GeneratedArchitecture', () => ({
  GeneratedArchitecture: class {
    readonly ready = Promise.resolve([]);
    update = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../src/presentation/GeneratedSceneAssets', () => ({
  GeneratedSceneAssets: class {
    readonly ready: Promise<readonly GeneratedSceneAssetStatus[]>;
    readonly dispose: () => void;
    constructor(_library: unknown, options: GeneratedSceneAssetsOptions) {
      const fake = boundaries.scenery(options) as SceneryBatch;
      this.ready = fake.ready; this.dispose = fake.dispose;
    }
  },
}));

import { Game } from '../../src/main';
import * as levels from '../../src/chapter-transition/PreparedGameLevel';
import { carryFacts, stageFor } from '../../src/content/chapter-flow';
import { EPILOGUE } from '../../src/content/epilogue-layout';
import { emptyIntent, Simulation, type Snapshot } from '../../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX, type SavedGame, type StorageLike } from '../../src/persistence/SaveStore';
import { Sound } from '../../src/presentation/Sound';
import { CharacterMotionTracker } from '../../src/presentation/CharacterMotionTracker';
import { initializePhysics } from '../../src/runtime/Physics';

/**
 * Host-boundary tests, not gameplay completion, rendering, or listening evidence.
 * Completion fixtures below are deliberately authored states. Real Simulation,
 * SaveStore, level ownership, Sound's caption queue and the production Game
 * callbacks remain in use; only browser drawing and asset I/O are controlled.
 */
type CampaignPlan = CampaignEntryPlan | CampaignTransitionPlan;
type PreparedCampaign = { level: levels.PreparedGameLevel; plan: CampaignPlan };
interface Host {
  sim: Simulation;
  level?: levels.PreparedGameLevel;
  environment: EnvironmentModel;
  scene: Scene;
  chapter?: ChapterProgress;
  savedCampaign?: SavedGame;
  mode: RunMode;
  qaImported: boolean;
  disposed: boolean;
  transitionPlan?: CampaignPlan;
  transition: ChapterTransition<PreparedCampaign>;
  sound: Sound;
  presentationEpoch: number;
  input: {
    enabled: boolean; yaw: number; pitch: number;
    clear(): void; lock(): void; unlock(): void;
    read(dt: number): typeof emptyIntent;
  };
  monitor?: { screen: Group; dispose(): void };
  createTransition(): ChapterTransition<PreparedCampaign>;
  activateLevel(level: levels.PreparedGameLevel, restored?: boolean): void;
  load(scenario: ScenarioId, snapshot?: Snapshot, facts?: readonly string[]): void;
  startChapter(): void;
  continueChapter(): void;
  advanceChapter(): void;
  finishPresentation(): void;
  simulate(): void;
  begin(): void;
  pause(): void;
  resume(): void;
  menu(): void;
  retry(): void;
  restart(): void;
  persistCheckpoint(snapshot?: Snapshot): void;
  importCheckpoint(file: File): Promise<void>;
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.writes.push(key); this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
const campaignKey = `${SAVE_KEY_PREFIX}campaign`;
const floor: SolidSpec[] = [{ id: 'host-fixture-floor', position: [0, -0.5, 0], size: [200, 1, 200] }];
interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
interface SceneryBatch {
  scenario: ScenarioId;
  ready: Promise<readonly GeneratedSceneAssetStatus[]>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
}
const readiness: Deferred<readonly GeneratedSceneAssetStatus[]>[] = [];
const sceneryBatches: SceneryBatch[] = [];
const environments: EnvironmentModel[] = [];
const ownedLevels: levels.PreparedGameLevel[] = [];
const hosts: Host[] = [];
function delayNextScenery() {
  const gate = deferred<readonly GeneratedSceneAssetStatus[]>(); readiness.push(gate); return gate;
}
async function settled(): Promise<void> {
  // The real preparer has two bounded model workers and several ownership
  // continuations. Drain microtasks; elapsed wall time never implies readiness.
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function fakeBrowser() {
  let now = performance.now(), id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const ui = { inert: false, hidden: false };
  const documentTarget = Object.assign(new EventTarget(), {
    hidden: false, hasFocus: () => true, baseURI: 'https://host-fixture.invalid/game/',
    querySelector: (selector: string) => selector === '#game-ui' ? ui : {},
  });
  // Rapier's browser timer also reads window.performance when a window exists.
  const windowTarget = Object.assign(new EventTarget(), { performance, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
  vi.stubGlobal('document', documentTarget); vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
  return {
    ui, documentTarget, windowTarget, frames,
    frame(milliseconds = 16) {
      now += milliseconds;
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(now);
    },
  };
}
function createLevel(library: Pick<ModelLibrary, 'acquire'>, scenario: ScenarioId, saved?: Snapshot) {
  const level = levels.createGameLevel(library, { scenario, saved, baseURL: document.baseURI });
  ownedLevels.push(level); return level;
}
function setup(options: { scenario?: ScenarioId; chapter?: boolean; complete?: boolean; dialogue?: DialogueAsset[] } = {}) {
  const browser = fakeBrowser(), storage = new MemoryStorage(), store = new SaveStore(storage, () => 12345);
  const leases: ModelLease[] = [];
  const library: Pick<ModelLibrary, 'acquire'> = { acquire: vi.fn(async () => {
    const root = new Group(), lease: ModelLease = { root, animations: [], mixer: new AnimationMixer(root), dispose: vi.fn() };
    leases.push(lease); return lease;
  }) };
  const scenario = options.scenario ?? 'relief';
  const level = createLevel(library, scenario);
  if (options.complete) completeFixture(level.sim, 13);
  const chapter: ChapterProgress | undefined = options.chapter === false ? undefined
    : { chapter: 'campaign', stage: stageFor(scenario)!.id, elapsedBefore: 400 };
  expect(store.save(chapter ? 'campaign' : scenario, level.sim.checkpoint, chapter)).toEqual({ ok: true });
  storage.writes.length = 0;
  const sound = new Sound({
    catalog: {}, dialogue: options.dialogue ?? [],
    createContext: () => { throw new Error('No audio device in host boundary tests.'); },
  });
  const narration = { setVolume: vi.fn(), play: vi.fn(() => ({
    finished: Promise.resolve('unavailable' as const), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(),
  })) };
  const game = Object.assign(Object.create(Game.prototype) as Host, {
    scene: new Scene(), modelLibrary: library, sound, narration, store,
    chapter, savedCampaign: store.load('campaign').save,
    mode: 'menu', qaImported: false, disposed: false, presentationEpoch: 0,
    transitionPlan: undefined, pendingJetApproach: false,
    characterAssetErrors: new Set<string>(), characters: new Map(),
    motionTracker: new CharacterMotionTracker(),
    crowd: { clear: vi.fn() }, feedback: { clear: vi.fn() }, heldItems: { reset: vi.fn() },
    input: { enabled: false, touchEnabled: false, yaw: 0, pitch: 0, clear: vi.fn(), lock: vi.fn(), unlock: vi.fn(), read: vi.fn(() => ({ ...emptyIntent })) },
    touchControls: { render: vi.fn() },
    aimIdentity: { update: vi.fn(), dispose: vi.fn() },
    weapon: { setCharacter: vi.fn(async () => {}), retryArms: vi.fn(async () => {}), armsStatus: { state: 'ready' } },
    renderer: { domElement: { focus: vi.fn() }, capabilities: { maxTextureSize: 4096 } },
    renderQuality: { detachScene: vi.fn(), bindScene: vi.fn(), apply: vi.fn() },
    accumulator: 0, ads: 0, lastFootstep: 0, error: '', pointerError: '', saveNotice: '',
    writeErrors: { checkpoint: '', settings: '' },
  });
  game.transition = game.createTransition();
  game.activateLevel(level, true);
  hosts.push(game);
  const activate = vi.spyOn(game, 'activateLevel');
  const save = vi.spyOn(store, 'save');
  const prepare = vi.spyOn(levels, 'prepareGameLevel');
  return { ...browser, game, storage, store, sound, narration, level, library, leases, activate, save, prepare,
    actions: boundaries.overlays.at(-1)!, originalBytes: storage.getItem(campaignKey) };
}

/** Synthetic, strictly save-valid completion boundary; it does not claim to play a level. */
function completeFixture(sim: Simulation, elapsed: number, extraFacts: readonly string[] = []): void {
  sim.mission.complete = true; sim.mission.failed = false;
  sim.mission.elapsed = elapsed; sim.mission.phaseTime = 0;
  const add = (facts: readonly string[]) => { for (const fact of facts) sim.fact(fact); };
  add(extraFacts);
  if (sim.scenario === 'escort') {
    sim.mission.phase = 15; add(['escort-patient-transferred', 'escort-convoy-arrived', 'escort-manifest-checked', 'lu-keeps-escort-promise']);
  } else if (sim.scenario === 'relief') {
    sim.mission.phase = 10; add(['relief-handover-complete', 'relief-posts-held', 'zhou-accepts-help', 'zhou-wants-to-live']);
  } else if (sim.scenario === 'rescue') {
    sim.mission.phase = 10; sim.mission.control = 'staged'; sim.player.height = 1.1;
    add(['rescue-meng-wounded', 'rescue-meng-lifted', 'rescue-meng-under-cover', 'rescue-zhou-wounded',
      'zhou-reported-injury', 'zhou-requested-rescue', 'rescue-medics-arrived', 'rescue-both-loaded',
      'rescue-transport-departed', 'rescue-both-received']);
    const meng = sim.actors.find(actor => actor.id === 'meng')!;
    meng.role = 'cart'; delete meng.combat;
  } else if (sim.scenario === 'epilogue') {
    sim.mission.phase = 8; sim.mission.control = 'work';
    add(['truthful-report-sent', 'report-includes-losses', 'report-includes-shaoyuan-escape', 'lu-accepts-zheng-report-help',
      'medical-needs-carried', 'reception-reached', 'medical-needs-delivered', 'berth-manifest-confirmed',
      'fleet-reception-acknowledged', 'first-wave-approaching', 'reception-door-open', 'first-workers-entering',
      'first-workers-received', 'first-medical-supplies-received', ...EPILOGUE.shoreVia.map((_, i) => `shore-waypoint-${i}`)]);
    EPILOGUE.workersGoals.forEach((point, i) => {
      const actor = sim.actors.find(candidate => candidate.id === `worker-${i}`)!;
      actor.position = [...point]; actor.safe = true; actor.goals = []; actor.path = [];
    });
    const cart = sim.actors.find(actor => actor.id === 'supply-cart')!;
    cart.position[2] = -6; cart.safe = true; cart.goals = []; cart.path = [];
  } else if (sim.scenario === 'northgate') sim.mission.phase = 3;
  sim.checkpoint = sim.snapshot();
}

beforeAll(initializePhysics);
beforeEach(() => {
  boundaries.overlays.length = 0;
  boundaries.environment.mockImplementation(() => {
    const environment: EnvironmentModel = { root: new Group(), solids: floor, update: vi.fn(), dispose: vi.fn() };
    environments.push(environment); return environment;
  });
  boundaries.scenery.mockImplementation((options: GeneratedSceneAssetsOptions) => {
    const batch: SceneryBatch = { scenario: options.scenario, ready: readiness.shift()?.promise ?? Promise.resolve([]), dispose: vi.fn() };
    sceneryBatches.push(batch); return batch;
  });
});
afterEach(async () => {
  for (const game of hosts.splice(0)) {
    game.transition.dispose(); game.sound.dispose(); game.level?.dispose(); game.monitor?.dispose();
  }
  for (const level of ownedLevels.splice(0)) level.dispose();
  for (const pending of readiness.splice(0)) pending.resolve([]);
  await settled();
  sceneryBatches.length = 0; environments.length = 0;
  boundaries.environment.mockReset(); boundaries.scenery.mockReset();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Game campaign transition host boundaries (no renderer or audio-device acceptance)', () => {
  it('preserves an existing mid-campaign save through opening and skip until actual resources are ready', async () => {
    const h = setup(), ready = delayNextScenery();
    const previous = h.game.sim, original = previous.snapshot(), oldChapter = structuredClone(h.game.chapter);
    const disposeOld = vi.spyOn(h.level, 'dispose');
    h.game.startChapter();
    expect(h.game.transition.snapshot.bridge?.id).toBe('opening-campaign');
    expect(h.game.mode).toBe('transition'); expect(h.ui).toEqual({ inert: true, hidden: true });
    expect(h.game.input.enabled).toBe(false);
    expect(h.game.touchControls.render).toHaveBeenCalledWith(expect.objectContaining({ mode: 'transition', skipAvailable: false }));
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.prepare.mock.calls[0][1]).toMatchObject({ scenario: 'childhood', facts: [] });
    h.actions.skip(); await settled(); h.frame(120_000);
    expect(h.game.transition.snapshot.loadState).toBe('loading');
    expect(h.game.sim).toBe(previous); expect(previous.snapshot()).toEqual(original);
    expect(h.game.chapter).toEqual(oldChapter); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    expect(h.save).not.toHaveBeenCalled(); expect(h.activate).not.toHaveBeenCalled(); expect(disposeOld).not.toHaveBeenCalled();
    ready.resolve([]); await settled();
    expect(h.game.transition.snapshot.loadState).toBe('ready');
    expect(h.save).not.toHaveBeenCalled();
    h.frame();
    expect(h.game.mode).toBe('playing'); expect(h.game.sim.scenario).toBe('childhood');
    expect(h.game.chapter).toEqual({ chapter: 'campaign', stage: 'S01', elapsedBefore: 0 });
    expect(h.activate).toHaveBeenCalledOnce(); expect(disposeOld).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
    expect(h.game.level?.environment.root.parent).toBe(h.game.scene);
    expect(h.store.load('campaign').save?.chapter?.stage).toBe('S01');
    expect(h.storage.getItem(`${campaignKey}.backup`)).toBe(h.originalBytes);
    expect(h.ui).toEqual({ inert: false, hidden: false });
    h.frame(120_000); expect(h.activate).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
  });

  it('cancels ready opening resources from the real menu callback without replacing the old save', async () => {
    const h = setup(); h.game.startChapter(); await settled();
    expect(h.game.transition.snapshot.loadState).toBe('ready');
    const preparedEnvironment = environments.at(-1)!, scenery = sceneryBatches.at(-1)!;
    h.actions.menu();
    expect(h.game.mode).toBe('menu'); expect(h.game.transitionPlan).toBeUndefined();
    expect(h.game.transition.snapshot.phase).toBe('cancelled'); expect(h.frames.size).toBe(0);
    expect(preparedEnvironment.dispose).toHaveBeenCalledOnce(); expect(scenery.dispose).toHaveBeenCalledOnce();
    expect(h.leases.length).toBeGreaterThan(0);
    for (const lease of h.leases) expect(lease.dispose).toHaveBeenCalledOnce();
    expect(h.game.sim).toBe(h.level.sim); expect(h.level.isDisposed).toBe(false);
    expect(h.save).not.toHaveBeenCalled(); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    expect(h.ui).toEqual({ inert: false, hidden: false });
  });

  it('cancels a pending opening through load and disposes it before its delayed asset completion', async () => {
    const h = setup(), ready = delayNextScenery(); h.game.startChapter(); await settled();
    const pendingEnvironment = environments.at(-1)!, pendingScenery = sceneryBatches.at(-1)!;
    h.game.load('northgate');
    expect(h.game.transition.snapshot.phase).toBe('cancelled');
    expect(pendingEnvironment.dispose).toHaveBeenCalledOnce(); expect(pendingScenery.dispose).toHaveBeenCalledOnce();
    ready.resolve([]); await settled(); h.frame(60_000);
    expect(h.game.sim.scenario).toBe('northgate'); expect(h.activate).toHaveBeenCalledOnce();
    expect(pendingEnvironment.dispose).toHaveBeenCalledOnce(); expect(h.save).not.toHaveBeenCalled();
    expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
  });

  it('releases a late prepared result even when an asset adapter ignores cancellation', async () => {
    const h = setup(), late = deferred<levels.PreparedGameLevel>();
    const candidate = createLevel(h.library, 'childhood'), dispose = vi.spyOn(candidate, 'dispose');
    h.prepare.mockReturnValueOnce(late.promise);
    h.game.startChapter(); h.game.menu();
    late.resolve(candidate); await settled(); h.frame(60_000);
    expect(candidate.isDisposed).toBe(true); expect(dispose).toHaveBeenCalledOnce();
    expect(h.activate).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.game.sim).toBe(h.level.sim); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
  });

  it('keeps the old save after a real preparation failure and retries only loading', async () => {
    const h = setup(), failing = delayNextScenery(); h.game.startChapter(); h.actions.skip();
    const failedEnvironment = environments.at(-1)!, failedScenery = sceneryBatches.at(-1)!;
    failing.reject(new Error('fixture scene decode failed')); await settled(); h.frame();
    expect(h.game.transition.snapshot.error).toMatchObject({ stage: 'load', message: 'fixture scene decode failed' });
    expect(failedEnvironment.dispose).toHaveBeenCalledOnce(); expect(failedScenery.dispose).toHaveBeenCalledOnce();
    expect(h.save).not.toHaveBeenCalled(); expect(h.activate).not.toHaveBeenCalled();
    expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    const retryReady = delayNextScenery(); h.actions.retry(); await settled(); h.frame(60_000);
    expect(h.game.transition.snapshot.narrationState).toBe('skipped'); expect(h.narration.play).toHaveBeenCalledOnce();
    expect(h.game.transition.snapshot.loadState).toBe('loading'); expect(h.save).not.toHaveBeenCalled();
    retryReady.resolve([]); await settled(); h.frame();
    expect(h.game.sim.scenario).toBe('childhood'); expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.activate).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
  });

  it('rejects entry after the host is disposed and releases its preparation without activating or saving', async () => {
    const h = setup(); h.game.startChapter(); h.actions.skip(); await settled();
    const preparedEnvironment = environments.at(-1)!, preparedScenery = sceneryBatches.at(-1)!;
    h.game.disposed = true; h.frame();
    expect(h.game.transition.snapshot.error).toMatchObject({ stage: 'enter' });
    expect(preparedEnvironment.dispose).toHaveBeenCalledOnce(); expect(preparedScenery.dispose).toHaveBeenCalledOnce();
    expect(h.game.sim).toBe(h.level.sim); expect(h.level.isDisposed).toBe(false);
    expect(h.game.chapter?.stage).toBe('S09'); expect(h.activate).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
  });

  it.each(['manual', 'blur', 'hidden'] as const)('blocks a ready skipped opening during %s pause and commits exactly once after resume', async reason => {
    const h = setup(), ready = delayNextScenery(); h.game.startChapter(); h.actions.skip();
    if (reason === 'manual') h.game.pause();
    if (reason === 'blur') h.windowTarget.dispatchEvent(new Event('blur'));
    if (reason === 'hidden') { h.documentTarget.hidden = true; h.documentTarget.dispatchEvent(new Event('visibilitychange')); }
    ready.resolve([]); await settled(); h.frame(120_000);
    expect(h.game.transition.snapshot.paused).toBe(true); expect(h.game.transition.snapshot.loadState).toBe('ready');
    expect(h.activate).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    if (reason === 'manual') {
      h.windowTarget.dispatchEvent(new Event('blur')); h.windowTarget.dispatchEvent(new Event('focus'));
      h.frame(); expect(h.activate).not.toHaveBeenCalled(); h.game.resume();
    }
    if (reason === 'blur') h.windowTarget.dispatchEvent(new Event('focus'));
    if (reason === 'hidden') { h.documentTarget.hidden = false; h.documentTarget.dispatchEvent(new Event('visibilitychange')); }
    h.frame(); h.frame(60_000); h.game.resume(); h.windowTarget.dispatchEvent(new Event('focus')); h.frame();
    expect(h.game.mode).toBe('playing'); expect(h.activate).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
  });

  it('continues an unfinished checkpoint directly without opening narration or rewriting its slot', () => {
    const h = setup({ scenario: 'escort' });
    const saved = h.store.load('campaign').save!;
    h.game.continueChapter();
    expect(h.game.mode).toBe('playing'); expect(h.game.chapter).toEqual(saved.chapter);
    expect(h.game.sim.snapshot()).toEqual(saved.snapshot);
    expect(h.game.transition.snapshot.bridge).toBeNull(); expect(h.prepare).not.toHaveBeenCalled();
    expect(h.narration.play).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
  });

  it('continues a completed source checkpoint through its adjacent bridge and preserves it until entry', async () => {
    const h = setup({ scenario: 'escort', complete: true }), ready = delayNextScenery();
    h.game.continueChapter();
    expect(h.game.mode).toBe('transition'); expect(h.game.transition.snapshot.bridge?.id).toBe('bridge-s08-s09');
    expect(h.game.sim.scenario).toBe('escort'); expect(h.game.sim.mission.complete).toBe(true);
    expect(h.game.chapter?.stage).toBe('S08'); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    expect(h.save).not.toHaveBeenCalled();
    h.actions.skip(); ready.resolve([]); await settled(); h.frame();
    expect(h.game.sim.scenario).toBe('relief'); expect(h.game.chapter).toEqual({ chapter: 'campaign', stage: 'S09', elapsedBefore: 413 });
    expect(h.save).toHaveBeenCalledOnce(); expect(h.store.load('campaign').save?.chapter).toEqual(h.game.chapter);
  });

  it('drains the real Sound caption queue after completion before starting the bridge, without stepping or re-saving the completed source', async () => {
    const dialogue: DialogueAsset[] = [
      { assetId: 'host-line-a', scenario: 'escort', speaker: '郑铎', text: '宿主队列第一句。', duration: 0.2 },
      { assetId: 'host-line-b', scenario: 'escort', speaker: '郑铎', text: '宿主队列第二句。', duration: 0.2 },
    ];
    const h = setup({ scenario: 'escort', complete: true, dialogue });
    await h.sound.unlock().catch(() => {});
    dialogue.forEach((line, index) => h.sound.say({ epoch: h.game.presentationEpoch, scenario: 'escort',
      revision: index, speaker: line.speaker, text: line.text, elapsed: 13, expiresAt: 100 }));
    expect(h.sound.getStatus().queuedDialogue).toBe(2);
    h.game.mode = 'playing';
    // The completion step may retain events; Game.simulate must not replay them.
    h.game.sim.events = [{ type: 'checkpoint' }];
    const original = h.game.sim.snapshot(), step = vi.spyOn(h.game.sim, 'step');
    h.game.advanceChapter(); expect(h.prepare).not.toHaveBeenCalled();
    for (let frame = 0; frame < 40; frame++) h.game.simulate();
    expect(h.sound.hasPendingDialogue()).toBe(true); expect(h.prepare).not.toHaveBeenCalled();
    for (let frame = 0; frame < 400 && h.game.mode === 'playing'; frame++) h.game.simulate();
    expect(h.sound.hasPendingDialogue()).toBe(false); expect(h.game.mode).toBe('transition');
    expect(h.prepare).toHaveBeenCalledOnce(); expect(h.game.transition.snapshot.bridge?.id).toBe('bridge-s08-s09');
    expect(step).not.toHaveBeenCalled(); expect(h.game.sim.snapshot()).toEqual(original);
    expect(h.save).not.toHaveBeenCalled(); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
  });

  it.each([
    { scenario: 'epilogue' as const, chapter: true, failed: false, mode: 'complete' },
    { scenario: 'northgate' as const, chapter: false, failed: false, mode: 'complete' },
    { scenario: 'escort' as const, chapter: true, failed: true, mode: 'failed' },
  ])('does not bridge $scenario with chapter=$chapter and failed=$failed', fixture => {
    const h = setup({ scenario: fixture.scenario, chapter: fixture.chapter, complete: !fixture.failed });
    if (fixture.failed) { h.game.sim.mission.failed = true; h.game.sim.mission.complete = false; }
    h.game.finishPresentation(); h.game.advanceChapter();
    expect(h.game.mode).toBe(fixture.mode); expect(h.game.input.enabled).toBe(false);
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.narration.play).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });

  it('commits S08 → S09 → S10 → S11 elapsed time and whitelist facts once per actual entry', async () => {
    const h = setup({ scenario: 'escort' });
    let elapsedBefore = 400;
    const transitions = [
      { stage: 'S09' as const, scenario: 'relief', elapsed: 13, facts: ['full-report-shared', 'lu-has-full-report', 'family-escort-promised'] },
      { stage: 'S10' as const, scenario: 'rescue', elapsed: 17, facts: ['zhou-gives-up-post', 'zhou-family-reply-queued'] },
      { stage: 'S11' as const, scenario: 'medical', elapsed: 23, facts: ['zhou-will-seek-treatment'] },
    ];
    for (const next of transitions) {
      completeFixture(h.game.sim, next.elapsed, [...next.facts, 'host-unrelated-fact', 'medical-needs-recorded']);
      h.game.persistCheckpoint(h.game.sim.snapshot());
      expect(h.store.load('campaign').save?.snapshot).toEqual(h.game.sim.snapshot());
      h.save.mockClear(); h.activate.mockClear(); h.prepare.mockClear();
      const source = h.game.sim, snapshot = source.snapshot(), chapter = structuredClone(h.game.chapter), bytes = h.storage.getItem(campaignKey);
      const facts = carryFacts(next.stage, source.mission.facts), ready = delayNextScenery();
      h.game.finishPresentation(); h.game.advanceChapter();
      expect(h.prepare).toHaveBeenCalledOnce();
      expect(h.prepare.mock.calls[0][1]).toMatchObject({ scenario: next.scenario, facts });
      expect(facts).not.toContain('host-unrelated-fact'); expect(facts).not.toContain('medical-needs-recorded');
      h.actions.skip(); await settled(); h.frame(60_000);
      expect(h.game.sim).toBe(source); expect(source.snapshot()).toEqual(snapshot); expect(h.game.chapter).toEqual(chapter);
      expect(h.storage.getItem(campaignKey)).toBe(bytes); expect(h.save).not.toHaveBeenCalled();
      ready.resolve([]); await settled(); h.frame();
      elapsedBefore += next.elapsed;
      expect(h.game.chapter).toEqual({ chapter: 'campaign', stage: next.stage, elapsedBefore });
      expect(h.game.sim.scenario).toBe(next.scenario); expect(h.game.sim.mission.elapsed).toBe(0);
      expect(h.game.sim.mission.facts).toEqual(expect.arrayContaining(facts));
      expect(h.game.sim.mission.facts).not.toContain('host-unrelated-fact');
      expect(h.game.sim.mission.facts).not.toContain('medical-needs-recorded');
      expect(h.activate).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
      expect(h.store.load('campaign').save?.chapter).toEqual(h.game.chapter);
      h.frame(60_000); h.game.advanceChapter();
      expect(h.activate).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
    }
    expect(h.game.chapter?.elapsedBefore).toBe(453);
    expect(h.game.sim.mission.facts).toContain('zhou-wants-to-live');
    expect(h.game.sim.mission.facts).toContain('zhou-requested-rescue');
    expect(h.game.sim.mission.facts).not.toContain('family-escort-promised');
  });

  it('keeps a real QA checkpoint import isolated through bridge entry, retry and restart', async () => {
    const h = setup(), imported = createLevel(h.library, 'escort');
    completeFixture(imported.sim, 19, ['lu-keeps-escort-promise']);
    const isolated = new MemoryStorage(), importStore = new SaveStore(isolated, () => 456);
    expect(importStore.save('campaign', imported.sim.snapshot(), { chapter: 'campaign', stage: 'S08', elapsedBefore: 90 })).toEqual({ ok: true });
    const file = new File([isolated.getItem(campaignKey)!], 'synthetic-host-boundary.json', { type: 'application/json' });
    // The synchronous import load consumes its own scenery batch; reserve the
    // controlled readiness promise specifically for the following bridge.
    delayNextScenery().resolve([]);
    const ready = delayNextScenery();
    await h.game.importCheckpoint(file);
    expect(h.game.qaImported).toBe(true); expect(h.game.transition.snapshot.bridge?.id).toBe('bridge-s08-s09');
    h.actions.skip(); ready.resolve([]); await settled(); h.frame();
    expect(h.game.sim.scenario).toBe('relief'); expect(h.game.chapter?.elapsedBefore).toBe(109);
    h.game.persistCheckpoint(); h.game.retry(); h.game.restart();
    expect(h.game.qaImported).toBe(true); expect(h.save).not.toHaveBeenCalled();
    expect(h.storage.writes).toEqual([]); expect(h.storage.getItem(campaignKey)).toBe(h.originalBytes);
    expect(h.game.transition.snapshot.bridge?.id).not.toBe('opening-campaign');
  });

  it('retries and restarts within the current chapter without requesting opening or bridge narration', () => {
    const h = setup(); const chapter = structuredClone(h.game.chapter);
    h.game.retry();
    expect(h.game.mode).toBe('playing'); expect(h.game.chapter).toEqual(chapter); expect(h.save).not.toHaveBeenCalled();
    h.game.restart();
    expect(h.game.mode).toBe('playing'); expect(h.game.chapter).toEqual(chapter);
    expect(h.game.sim.scenario).toBe('relief'); expect(h.game.sim.mission.elapsed).toBe(0);
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.narration.play).not.toHaveBeenCalled();
    expect(h.game.transition.snapshot.bridge).toBeNull(); expect(h.save).toHaveBeenCalledOnce();
    expect(h.store.load('campaign').save?.chapter).toEqual(chapter);
  });
});
