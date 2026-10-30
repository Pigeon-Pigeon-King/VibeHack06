import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SCENARIO_IDS, type ScenarioId, type SolidSpec } from '../src/contracts';
import { SCENARIO_PHASE_LIMITS } from '../src/content/chapter-flow';
import { WORKERS } from '../src/content/chapter-layout';
import { LAYOUT } from '../src/content/layout';
import { distance, emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics } from '../src/runtime/Physics';
import { DEFAULT_SETTINGS, SaveStore, SAVE_KEY_PREFIX, SETTINGS_KEY, type GameSettings, type StorageLike } from '../src/persistence/SaveStore';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  failWriteKey = '';
  failReads = false;
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('storage access denied');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    // Web Storage writes are atomic: failure occurs before replacing the old value.
    if (key === this.failWriteKey) throw new Error('simulated interrupted write');
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.removals.push(key); this.values.delete(key); }
}

const floor: SolidSpec[] = [{ id: 'fixture-floor', position: [0, -0.5, 0], size: [100, 1, 100] }];
const simulations: Simulation[] = [];
function simulation(scene: ScenarioId, saved?: Snapshot, solids = floor): Simulation {
  const sim = new Simulation(scene, solids, saved);
  simulations.push(sim);
  return sim;
}
function fixture(scene: ScenarioId = 'northgate'): Snapshot { return simulation(scene).snapshot(); }
const key = (slot: string) => `${SAVE_KEY_PREFIX}${slot}`;

beforeAll(() => initializePhysics());
afterEach(() => { for (const sim of simulations.splice(0)) sim.dispose(); });

describe('SaveStore: real simulation snapshots with injected storage', () => {
  it('persists a progressed snapshot across store instances and reconstructs the same simulation state', () => {
    const sim = simulation('northgate');
    // Position is a synthetic fixture. Simulation.step owns input and mission changes.
    sim.physics.teleport('player', LAYOUT.northgate.terminal);
    sim.player.position = [...LAYOUT.northgate.terminal];
    sim.physics.step();
    sim.step({ ...emptyIntent, interact: true });
    sim.step({ ...emptyIntent, fire: true });
    sim.step({ ...emptyIntent, reload: true });
    const snapshot = sim.snapshot();
    expect(snapshot.mission.phase).toBe(1);
    expect(snapshot.player.ammo).toBe(24);
    expect(snapshot.player.reload).toBeGreaterThan(0);
    const storage = new MemoryStorage();
    expect(new SaveStore(storage, () => 123456).save('northgate', snapshot)).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('northgate');
    expect(loaded.warning).toBeUndefined();
    expect(loaded.save!.savedAt).toBe(123456);
    expect(loaded.save!.snapshot).toEqual(snapshot);
    const rebuilt = simulation('northgate', loaded.save!.snapshot);
    expect(rebuilt.snapshot()).toEqual(snapshot);
    expect(rebuilt.player.ammo).toBe(24);
    expect(rebuilt.mission.facts).toContain('workers-released');
    expect(rebuilt.random.state).toBe(snapshot.random);
    expect(rebuilt.ballistics.projectiles).toHaveLength(0);
  });

  it('round-trips a real S04 first-wave combat snapshot reached through public movement and report inputs', () => {
    const environment = buildEnvironment('workers');
    try {
      const sim = simulation('workers', undefined, environment.solids);
      // Walk from the authored spawn; no position, actor, fact or phase edits.
      for (let frame = 0; frame < 240 && distance(sim.player.position, WORKERS.observation) > 1; frame++) {
        sim.step({ ...emptyIntent, forward: 1, sprint: true, yaw: 0 });
      }
      expect(distance(sim.player.position, WORKERS.observation)).toBeLessThanOrEqual(1);
      const reportYaw = Math.atan2(-(WORKERS.convoy[0] - sim.player.position[0]), -(WORKERS.convoy[2] - sim.player.position[2]));
      sim.step({ ...emptyIntent, yaw: reportYaw, interact: true });
      expect(sim.mission.phase).toBe(1);
      expect(sim.mission.control).toBe('combat');
      expect(sim.aliveEnemies.map(actor => actor.id)).toEqual(['enemy-E01-0', 'enemy-E01-1', 'enemy-E01-2', 'enemy-E01-3']);
      const target = sim.aliveEnemies[0].position;
      sim.step({ ...emptyIntent, fire: true, ads: true,
        yaw: Math.atan2(-(target[0] - sim.player.position[0]), -(target[2] - sim.player.position[2])) });
      const snapshot = sim.snapshot();
      expect(snapshot.player.ammo).toBe(24);
      expect(snapshot.mission.spawned).toBe(4);
      expect(snapshot.mission.facts).toEqual(expect.arrayContaining(['convoy-reported', 'zhou-adopts-lu-report']));
      const storage = new MemoryStorage();
      expect(new SaveStore(storage, () => 456).save('workers', snapshot)).toEqual({ ok: true });
      const loaded = new SaveStore(storage).load('workers');
      expect(loaded.warning).toBeUndefined();
      expect(loaded.save?.snapshot).toEqual(snapshot);
      const rebuilt = simulation('workers', loaded.save!.snapshot, environment.solids);
      expect(rebuilt.snapshot()).toEqual(snapshot);
      expect(rebuilt.ballistics.projectiles).toHaveLength(0);
      rebuilt.step({ ...emptyIntent, yaw: snapshot.player.yaw, pitch: snapshot.player.pitch });
      expect(rebuilt.mission.phase).toBe(1);
      expect(new Set(rebuilt.actors.map(actor => actor.id)).size).toBe(rebuilt.actors.length);
    } finally { environment.dispose(); }
  });

  it.each(['enemy-', 'enemy-E01-', 'enemy-E02-', 'enemy-E03-'])('rejects reserved/future enemy IDs for %s on both write and load', prefix => {
    const base = fixture('workers');
    const enemy = fixture().actors.find(actor => actor.role === 'enemy')!;
    // Deliberately synthetic corruption fixtures, not gameplay progression.
    const candidate = (suffix: number): Snapshot => {
      const snapshot = structuredClone(base);
      snapshot.mission.spawned = 4;
      snapshot.actors.push({ ...structuredClone(enemy), id: `${prefix}${suffix}` });
      return snapshot;
    };
    expect(new SaveStore(new MemoryStorage()).save('workers', candidate(3))).toEqual({ ok: true });
    for (const suffix of [4, 9]) {
      const storage = new MemoryStorage(), snapshot = candidate(suffix), store = new SaveStore(storage);
      const result = store.save('workers', snapshot);
      expect(result.ok, `${prefix}${suffix}`).toBe(false);
      expect(result.error).toContain('入场计数');
      expect(storage.writes).toHaveLength(0);
      const damaged = JSON.stringify({ schema: 'ganymede-save', version: 1, slot: 'workers', savedAt: 456, snapshot });
      storage.values.set(key('workers'), damaged);
      const loaded = new SaveStore(storage).load('workers');
      expect(loaded.save).toBeUndefined();
      expect(loaded.warning).toContain('入场计数');
      expect(storage.getItem(key('workers'))).toBe(damaged);
    }
  });

  it('does not share mutable snapshot references with callers or later loads', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const snapshot = fixture(), original = structuredClone(snapshot);
    expect(store.save('northgate', snapshot).ok).toBe(true);
    snapshot.player.ammo = 0; snapshot.actors[0].position[0] = 999;
    const first = store.load('northgate').save!;
    expect(first.snapshot).toEqual(original);
    first.snapshot.mission.facts.push('mutated-after-load');
    expect(store.load('northgate').save!.snapshot).toEqual(original);
  });

  it('accepts all five current scenario snapshots and enforces their own phase limits', () => {
    const store = new SaveStore(new MemoryStorage());
    for (const scene of SCENARIO_IDS) {
      const snapshot = fixture(scene);
      expect(store.save(scene, snapshot), `${scene} current snapshot`).toEqual({ ok: true });
      snapshot.mission.phase = SCENARIO_PHASE_LIMITS[scene] + 1;
      expect(store.save(scene, snapshot).ok, `${scene} out-of-range phase`).toBe(false);
      expect(store.load(scene).save!.snapshot.mission.phase).toBe(0);
    }
  });

  it('keeps campaign progression and standalone slots independent', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage, () => 10);
    const first = fixture('nightshift'), second = fixture('workers'), northgate = fixture();
    const chapter = { chapter: 'L1', stage: 'S03', elapsedBefore: 0 } as const;
    expect(store.save('campaign', first, chapter)).toEqual({ ok: true });
    expect(store.save('nightshift', first)).toEqual({ ok: true });
    expect(store.save('northgate', northgate)).toEqual({ ok: true });
    expect(store.save('campaign', second, { chapter: 'L1', stage: 'S04', elapsedBefore: 123 })).toEqual({ ok: true });
    const reader = new SaveStore(storage);
    expect(reader.load('campaign').save!.snapshot.mission.scenario).toBe('workers');
    expect(reader.load('campaign').save!.chapter).toEqual({ chapter: 'L1', stage: 'S04', elapsedBefore: 123 });
    expect(reader.load('nightshift').save!.snapshot).toEqual(first);
    expect(reader.load('northgate').save!.snapshot).toEqual(northgate);
  });

  it('rejects wrong slot, missing chapter, wrong stage and invalid chapter time without writes', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const snapshot = fixture('nightshift');
    expect(store.save('northgate', snapshot).ok).toBe(false);
    expect(store.save('campaign', snapshot).ok).toBe(false);
    expect(store.save('campaign', snapshot, { chapter: 'L1', stage: 'S04', elapsedBefore: 0 }).ok).toBe(false);
    expect(store.save('campaign', snapshot, { chapter: 'L1', stage: 'S03', elapsedBefore: Number.NaN }).ok).toBe(false);
    expect(store.save('nightshift', snapshot, { chapter: 'L1', stage: 'S03', elapsedBefore: 0 }).ok).toBe(false);
    expect(storage.writes).toHaveLength(0);
  });

  it('rejects malformed numeric, vector, enum, identity and required-participant data', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const initial = fixture();
    const cases: Array<[string, (snapshot: Snapshot) => void]> = [
      ['non-finite coordinate', value => { value.player.position[1] = Number.NaN; }],
      ['infinite yaw', value => { value.player.yaw = Infinity; }],
      ['fractional ammunition', value => { value.player.ammo = 2.5; }],
      ['bad random state', value => { value.random = -1; }],
      ['malformed vector', value => { value.actors[0].path = [[0, 1] as unknown as [number, number, number]]; }],
      ['sparse vector', value => { value.player.position = new Array(3) as [number, number, number]; }],
      ['invalid control enum', value => { (value.mission as unknown as Record<string, unknown>).control = ['combat']; }],
      ['duplicate actor', value => { value.actors.push(structuredClone(value.actors[0])); }],
      ['player ID conflict', value => { value.actors[0].id = 'player'; }],
      ['missing required actor', value => { value.actors = value.actors.filter(actor => actor.id !== 'zheng'); }],
      ['wrong role', value => { value.actors.find(actor => actor.id === 'zheng')!.role = 'enemy'; }],
      ['duplicate fact', value => { value.mission.facts = ['same', 'same']; }],
      ['contradictory result', value => { value.mission.failed = true; value.mission.complete = true; }],
      ['missing field', value => { delete (value.player as unknown as Record<string, unknown>).height; }],
      ['oversized participants', value => { value.actors = Array.from({ length: 257 }, () => structuredClone(value.actors[0])); }],
    ];
    for (const [name, mutate] of cases) {
      const snapshot = structuredClone(initial); mutate(snapshot);
      const result = store.save('northgate', snapshot);
      expect(result.ok, name).toBe(false);
      expect(result.error, name).toBeTruthy();
    }
    expect(storage.writes).toHaveLength(0);
  });

  it('leaves the old primary readable when the final atomic write fails after backing it up', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage, () => 20);
    const original = fixture();
    expect(store.save('northgate', original).ok).toBe(true);
    const originalRaw = storage.getItem(key('northgate'))!;
    const replacement = structuredClone(original); replacement.player.ammo = 9;
    storage.failWriteKey = key('northgate');
    const failed = store.save('northgate', replacement);
    expect(failed.ok).toBe(false); expect(failed.error).toBeTruthy();
    expect(storage.getItem(key('northgate'))).toBe(originalRaw);
    expect(storage.getItem(`${key('northgate')}.backup`)).toBe(originalRaw);
    expect(new SaveStore(storage).load('northgate').save!.snapshot).toEqual(original);
    expect(storage.removals).toHaveLength(0);
  });

  it('does not replace the primary when preserving the preceding version fails', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const original = fixture();
    expect(store.save('northgate', original).ok).toBe(true);
    const originalRaw = storage.getItem(key('northgate'));
    storage.failWriteKey = `${key('northgate')}.backup`;
    const replacement = structuredClone(original); replacement.player.ammo = 4;
    expect(store.save('northgate', replacement).ok).toBe(false);
    expect(storage.getItem(key('northgate'))).toBe(originalRaw);
  });

  it('reads a valid backup after damage without deleting or rewriting the damaged record', () => {
    const storage = new MemoryStorage(); let time = 100;
    const store = new SaveStore(storage, () => time++), first = fixture();
    expect(store.save('northgate', first).ok).toBe(true);
    const second = structuredClone(first); second.player.ammo = 14;
    expect(store.save('northgate', second).ok).toBe(true);
    const damaged = '{"schema":"ganymede-save",';
    storage.values.set(key('northgate'), damaged);
    const writesBefore = storage.writes.length;
    const loaded = new SaveStore(storage).load('northgate');
    expect(loaded.save!.snapshot).toEqual(first);
    expect(loaded.save!.savedAt).toBe(100);
    expect(loaded.warning).toContain('备份');
    expect(storage.getItem(key('northgate'))).toBe(damaged);
    expect(storage.writes).toHaveLength(writesBefore);
    expect(storage.removals).toHaveLength(0);
    // A subsequent authorized save preserves damaged bytes before replacing them.
    expect(store.save('northgate', second).ok).toBe(true);
    expect(storage.getItem(`${key('northgate')}.damaged`)).toBe(damaged);
    expect(store.load('northgate').save!.snapshot).toEqual(second);
  });

  it('rejects damaged or unsupported records without inventing a usable snapshot', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.load('northgate')).toEqual({});
    for (const raw of ['not-json', '{}', 'x'.repeat(1_000_001)]) {
      storage.values.set(key('northgate'), raw);
      const loaded = store.load('northgate');
      expect(loaded.save).toBeUndefined(); expect(loaded.warning).toBeTruthy();
      expect(storage.getItem(key('northgate'))).toBe(raw);
    }
    expect(storage.removals).toHaveLength(0);
  });

  it('refuses future-version primaries, may read an older backup, and never overwrites the future record', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage), original = fixture();
    expect(store.save('northgate', original).ok).toBe(true);
    const valid = storage.getItem(key('northgate'))!;
    const future = JSON.stringify({ ...JSON.parse(valid), version: 99 });
    storage.values.set(key('northgate'), future);
    expect(store.load('northgate').save).toBeUndefined();
    expect(store.load('northgate').warning).toContain('更新版本');
    storage.values.set(`${key('northgate')}.backup`, valid);
    const loaded = store.load('northgate');
    expect(loaded.save!.snapshot).toEqual(original);
    expect(loaded.warning).toContain('更新版本');
    expect(store.save('northgate', original).ok).toBe(false);
    expect(storage.getItem(key('northgate'))).toBe(future);
  });

  it('rejects swapping valid records between slots and keeps both bytes untouched', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.save('northgate', fixture()).ok).toBe(true);
    const raw = storage.getItem(key('northgate'))!;
    storage.values.set(key('prologue'), raw);
    expect(store.load('prologue').save).toBeUndefined();
    expect(store.load('prologue').warning).toContain('槽位');
    expect(storage.getItem(key('prologue'))).toBe(raw);
  });
});

describe('SaveStore settings and inaccessible storage', () => {
  it('returns fresh defaults and persists bounded settings across instances', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const defaults = store.getSettings();
    expect(defaults).toEqual({ settings: DEFAULT_SETTINGS });
    defaults.settings.volume = 0;
    expect(store.getSettings().settings.volume).toBe(0.7);
    expect(store.saveSettings({ sensitivity: 100, volume: -3, lowMotion: true })).toEqual({ ok: true });
    expect(new SaveStore(storage).getSettings()).toEqual({ settings: { sensitivity: 2.5, volume: 0, lowMotion: true } });
    expect(store.saveSettings({ sensitivity: -100, volume: 20, lowMotion: false }).ok).toBe(true);
    expect(store.getSettings().settings).toEqual({ sensitivity: 0.25, volume: 1, lowMotion: false });
  });

  it('rejects malformed settings and reports a failed write while preserving previous settings', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const original = { sensitivity: 1.5, volume: 0.4, lowMotion: true };
    expect(store.saveSettings(original).ok).toBe(true);
    expect(store.saveSettings({ ...original, sensitivity: NaN }).ok).toBe(false);
    expect(store.saveSettings({ ...original, lowMotion: 'yes' } as unknown as GameSettings).ok).toBe(false);
    storage.failWriteKey = SETTINGS_KEY;
    const result = store.saveSettings({ ...original, volume: 1 });
    expect(result.ok).toBe(false); expect(result.error).toBeTruthy();
    expect(new SaveStore(storage).getSettings().settings).toEqual(original);
  });

  it('warns when imported settings need bounds, and recovers a valid settings backup after damage', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const original = { sensitivity: 0.9, volume: 0.5, lowMotion: false };
    expect(store.saveSettings(original).ok).toBe(true);
    const valid = storage.getItem(SETTINGS_KEY)!;
    storage.values.set(SETTINGS_KEY, JSON.stringify({ ...JSON.parse(valid), settings: { sensitivity: 8, volume: 2, lowMotion: false } }));
    expect(store.getSettings()).toEqual({ settings: { sensitivity: 2.5, volume: 1, lowMotion: false }, warning: '设置超出范围，已限制到支持范围。' });
    storage.values.set(`${SETTINGS_KEY}.backup`, valid);
    storage.values.set(SETTINGS_KEY, 'damaged');
    expect(store.getSettings().settings).toEqual(original);
    expect(store.getSettings().warning).toContain('备份');
    expect(storage.getItem(SETTINGS_KEY)).toBe('damaged');
  });

  it('returns readable errors or default settings when browser storage is unavailable', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    storage.failReads = true;
    expect(store.load('northgate').save).toBeUndefined();
    expect(store.load('northgate').warning).toBeTruthy();
    const settings = store.getSettings();
    expect(settings.settings).toEqual(DEFAULT_SETTINGS); expect(settings.warning).toBeTruthy();
    expect(store.save('northgate', fixture()).ok).toBe(false);
    expect(store.saveSettings({ ...DEFAULT_SETTINGS }).ok).toBe(false);
    expect(storage.writes).toHaveLength(0);
  });
});
