import type { EnvironmentModel, ScenarioId } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease, ModelSource } from '../assets/model-contracts';
import { canonicalWalkSource, characterAssetFor, characterSource, playerCharacterIdentity } from '../assets/character-catalog';
import { ak47Source } from '../assets/weapon-catalog';
import { sceneAssetSource } from '../assets/scene-asset-catalog';
import { tacticalSource } from '../assets/tactical-catalog';
import { Simulation, type Snapshot } from '../mission/Simulation';
import { buildEnvironment } from '../presentation/environment';
import { GeneratedSceneAssets } from '../presentation/GeneratedSceneAssets';
import { GeneratedArchitecture } from '../presentation/GeneratedArchitecture';
import { GeneratedWorldWeapons } from '../presentation/GeneratedWorldWeapons';
import { patientCartAssets, patientCartPeople } from '../presentation/ImportedPatientCart';

export interface GameLevelOptions {
  readonly scenario: ScenarioId;
  readonly saved?: Snapshot;
  readonly facts?: readonly string[];
  readonly baseURL: string;
}

type SharedModels = Pick<ModelLibrary, 'acquire'>;
const abortError = (): DOMException => new DOMException('关卡准备已取消。', 'AbortError');
const isAbortError = (error: unknown): boolean => !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';

/** Finish every owner even if one cleanup fails; never replace a construction/cancellation error. */
function releaseAll(actions: Array<() => void>): void {
  const errors: unknown[] = [];
  for (const action of actions) {
    try { action(); } catch (error) { errors.push(error); }
  }
  if (errors.length) console.warn('关卡资源释放失败', errors);
}

/**
 * Owns one detached level until the host transfers it into play. No renderer,
 * external scene, mission tick, audio, or SaveStore is touched here. Simulation's
 * constructor still performs its normal physics initialization/in-memory checkpoint.
 */
export class PreparedGameLevel {
  readonly environment: EnvironmentModel;
  readonly sim: Simulation;
  readonly scenery: GeneratedSceneAssets;
  readonly architecture: GeneratedArchitecture;
  readonly worldWeapons: GeneratedWorldWeapons;
  readonly sceneAssetErrors = new Set<string>();
  readonly architectureAssetErrors = new Set<string>();
  readonly worldWeaponAssetErrors = new Set<string>();
  /** Failed warm sources may fall back to the existing procedural character/gun. */
  readonly warmAssetErrors = new Set<string>();
  private readonly warmLeases = new Set<ModelLease>();
  private readonly lifetime = new AbortController();
  private readonly baseURL: string;
  private disposed = false;

  constructor(private readonly library: SharedModels, options: GameLevelOptions) {
    // Bad construction arguments are structural failures, not a successful preload.
    this.baseURL = new URL(options.baseURL).href;
    if (options.saved && options.saved.mission.scenario !== options.scenario) throw new Error('检查点与准备关卡不一致。');
    const environment = buildEnvironment(options.scenario);
    let sim: Simulation | undefined, scenery: GeneratedSceneAssets | undefined, architecture: GeneratedArchitecture | undefined,
      worldWeapons: GeneratedWorldWeapons | undefined;
    try {
      sim = new Simulation(options.scenario, environment.solids, options.saved, options.facts);
      scenery = new GeneratedSceneAssets(library, {
        parent: environment.root, scenario: options.scenario, baseURL: this.baseURL,
        onStatus: status => {
          if (this.disposed) return;
          if (status.state === 'error') this.sceneAssetErrors.add(status.id);
          else this.sceneAssetErrors.delete(status.id);
        },
      });
      worldWeapons = new GeneratedWorldWeapons(library, { parent: environment.root, baseURL: this.baseURL,
        onStatus: status => {
          if (this.disposed) return;
          if (status.state === 'error') this.worldWeaponAssetErrors.add(status.id);
          else this.worldWeaponAssetErrors.delete(status.id);
        },
      });
      architecture = new GeneratedArchitecture(library, {
        parent: environment.root, scenario: options.scenario, baseURL: this.baseURL,
        onStatus: status => {
          if (this.disposed) return;
          if (status.state === 'error') this.architectureAssetErrors.add(status.id);
          else this.architectureAssetErrors.delete(status.id);
        },
      });
      this.environment = environment; this.sim = sim; this.scenery = scenery; this.architecture = architecture; this.worldWeapons = worldWeapons;
      // Synchronous callers need not await this promise. Keep it rejected for an
      // async preparer, while avoiding an unhandled rejection in the sync path.
      void scenery.ready.catch(() => { if (!this.disposed) this.sceneAssetErrors.add('scenery'); });
      void architecture.ready.catch(() => { if (!this.disposed) this.architectureAssetErrors.add('architecture'); });
      void worldWeapons.ready.catch(() => { if (!this.disposed) this.worldWeaponAssetErrors.add('world-weapons'); });
    } catch (error) {
      this.disposed = true;
      // Construction can fail after one asynchronous resource owner exists.
      // Stop it before the environment traverses its borrowed model children.
      releaseAll([() => worldWeapons?.dispose(), () => architecture?.dispose(), () => scenery?.dispose(), () => sim?.dispose(),
        () => environment.root.removeFromParent(), () => environment.dispose()]);
      void scenery?.ready.catch(() => {});
      void architecture?.ready.catch(() => {});
      void worldWeapons?.ready.catch(() => {});
      throw error;
    }
  }

  get isDisposed(): boolean { return this.disposed; }

  /** Pending preparation belongs to signal; after success the caller owns dispose(). */
  static async prepare(library: SharedModels, options: GameLevelOptions, signal: AbortSignal,
    onProgress: (fraction: number) => void = () => {}): Promise<PreparedGameLevel> {
    if (signal.aborted) throw abortError();
    const level = new PreparedGameLevel(library, options);
    try {
      await level.waitUntilReady(signal, onProgress);
      // Includes cancellation after the readiness promise settled but before this continuation.
      if (signal.aborted || level.disposed) throw abortError();
      return level;
    } catch (error) {
      level.dispose();
      throw error;
    }
  }

  private initialModelSources(): ModelSource[] {
    const sources = new Map<string, ModelSource>();
    const add = (source: ModelSource) => sources.set(JSON.stringify([source.id, source.revision, source.url]), source);
    const playerAsset = characterAssetFor(playerCharacterIdentity(this.sim.scenario, this.sim.player.name));
    if (playerAsset) add(characterSource(playerAsset, this.baseURL));
    let needsWalk = false, needsAK = false;
    // S08's off-world camera has its own person/vehicle/doors. They participate
    // in real preparation even though they are not mission actors or solids.
    if (this.sim.scenario === 'escort') {
      const shao = characterAssetFor({ id: 'shao', name: '邵原', role: 'opponent' });
      if (shao) add(characterSource(shao, this.baseURL));
      add(sceneAssetSource('PROP-VEH-TRANSPORT', this.baseURL));
      add(sceneAssetSource('PROP-DOOR-LEAF', this.baseURL)); needsWalk = true;
    }
    for (const actor of this.sim.actors) {
      // Cart, occupant and orderly have separate reusable sources. Warm the
      // same bodies/animation packs that the active presentation will acquire.
      if (actor.role === 'cart') for (const id of patientCartAssets(actor, this.sim.scenario)) add(sceneAssetSource(id, this.baseURL));
      for (const identity of actor.role === 'cart' ? patientCartPeople(actor) : [actor]) {
        const asset = characterAssetFor(identity);
        if (!asset) continue;
        add(characterSource(asset, this.baseURL)); needsWalk = true;
        if (asset.bodyPlan === 'adult' && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(asset.id)) add(tacticalSource(asset.id, this.baseURL));
      }
      if (actor.id.startsWith('hall-invader-') || ['ally', 'enemy', 'opponent', 'father'].includes(actor.role)) needsAK = true;
    }
    if (needsWalk) add(canonicalWalkSource(this.baseURL));
    if (needsAK) add(ak47Source(this.baseURL));
    return [...sources.values()];
  }

  private async waitUntilReady(signal: AbortSignal, onProgress: (fraction: number) => void): Promise<void> {
    const check = () => { if (signal.aborted || this.disposed) throw abortError(); };
    check();
    const sources = this.initialModelSources(), total = sources.length + 2;
    let completed = 0, cursor = 0;
    const report = () => {
      if (signal.aborted || this.disposed) return;
      try { onProgress(completed / total); } catch { /* A UI observer does not own the preparation. */ }
    };
    const finish = () => { check(); completed++; report(); check(); };
    const cancel = () => this.dispose();
    let rejectCancelled!: (reason: unknown) => void;
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
    // A progress observer can cancel synchronously before Promise.race is installed.
    void cancelled.catch(() => {});
    const onDisposed = () => rejectCancelled(abortError());
    this.lifetime.signal.addEventListener('abort', onDisposed, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    try {
      check(); report(); check();
      const scenery = Promise.all([this.scenery.ready, this.worldWeapons.ready]).then(([statuses, weapons]) => {
        check();
        for (const status of statuses) {
          if (status.state === 'cancelled') throw abortError();
          if (status.state === 'pending' || status.state === 'loading') throw new Error('场景资源准备未结束。');
          if (status.state === 'error') this.sceneAssetErrors.add(status.id);
        }
        for (const status of weapons) {
          if (status.state === 'cancelled') throw abortError();
          if (status.state === 'pending' || status.state === 'loading') throw new Error('场景武器准备未结束。');
          if (status.state === 'error') this.worldWeaponAssetErrors.add(status.id);
        }
        finish();
      });
      const architecture = this.architecture.ready.then(statuses => {
        check();
        for (const status of statuses) {
          if (status.state === 'cancelled') throw abortError();
          if (status.state === 'pending' || status.state === 'loading') throw new Error('建筑资源准备未结束。');
          if (status.state === 'error') this.architectureAssetErrors.add(status.id);
        }
        finish();
      });
      // Count completed tasks (two environment batches and each distinct model), never
      // elapsed wall time. Two warm workers bound extra decode pressure.
      const workers = Array.from({ length: Math.min(2, sources.length) }, async () => {
        while (cursor < sources.length) {
          check();
          const source = sources[cursor++];
          try {
            const lease = await this.library.acquire(source, { signal: this.lifetime.signal });
            // acquire can already be resolved when cancellation reaches us.
            if (signal.aborted || this.disposed) { lease.dispose(); throw abortError(); }
            this.warmLeases.add(lease);
          } catch (error) {
            if (signal.aborted || this.disposed || isAbortError(error)) throw abortError();
            // Download/decode failure is a finished, degraded task. The ordinary
            // character/weapon adapters retain their usable whitebox fallbacks.
            this.warmAssetErrors.add(source.id);
          }
          finish();
        }
      });
      await Promise.race([Promise.all([scenery, architecture, ...workers]), cancelled]);
      check();
    } finally {
      signal.removeEventListener('abort', cancel);
      this.lifetime.signal.removeEventListener('abort', onDisposed);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    const leases = [...this.warmLeases]; this.warmLeases.clear();
    releaseAll([
      // Borrowed architecture/scenery leave before the generic environment traversal.
      () => this.worldWeapons.dispose(),
      () => this.architecture.dispose(),
      () => this.scenery.dispose(),
      ...leases.map(lease => () => { lease.root.removeFromParent(); lease.dispose(); }),
      () => this.sim.dispose(),
      () => this.environment.root.removeFromParent(),
      () => this.environment.dispose(),
    ]);
  }
}

/** Normal synchronous level construction; environment asset owners start their usual async work. */
export function createGameLevel(library: SharedModels, options: GameLevelOptions): PreparedGameLevel {
  return new PreparedGameLevel(library, options);
}

/** Real scenery readiness and initial-actor model warming; does not activate or persist the level. */
export function prepareGameLevel(library: SharedModels, options: GameLevelOptions, signal: AbortSignal,
  onProgress: (fraction: number) => void = () => {}): Promise<PreparedGameLevel> {
  return PreparedGameLevel.prepare(library, options, signal, onProgress);
}
