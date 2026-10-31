import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SCENARIO_IDS, type ScenarioId, type SolidSpec } from '../src/contracts';
import { SCENARIO_PHASE_LIMITS, type ChapterStageId } from '../src/content/chapter-flow';
import { NIGHT, WORKERS } from '../src/content/chapter-layout';
import { HISTORY } from '../src/content/history-layout';
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

  it.each(['enemy-', ...Array.from({ length: 10 }, (_, i) => `enemy-E0${i}-`)])('rejects reserved/future enemy IDs for %s on both write and load', prefix => {
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

  it('accepts all current scenario snapshots and enforces their own phase limits', () => {
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
    expect(reader.load('campaign').save!.chapter).toEqual({ chapter: 'campaign', stage: 'S04', elapsedBefore: 123 });
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

describe('campaign expansion and version 0.2 chapter compatibility', () => {
  const addedScenes: Array<[ScenarioId, ChapterStageId]> = [
    ['childhood', 'S01'], ['mainhall', 'S02'], ['frontgate', 'S05'], ['transfer', 'S06'], ['flank', 'S07'],
    ['escort', 'S08'], ['relief', 'S09'], ['rescue', 'S10'], ['medical', 'S11'], ['epilogue', 'S12'],
  ];

  it.each(addedScenes)('round-trips the actual %s initial snapshot in campaign stage %s', (scene, stage) => {
    const snapshot = fixture(scene), storage = new MemoryStorage();
    const chapter = { chapter: 'campaign', stage, elapsedBefore: 37 } as const;
    expect(new SaveStore(storage, () => 100).save('campaign', snapshot, chapter)).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('campaign');
    expect(loaded.warning).toBeUndefined();
    expect(loaded.save!.chapter).toEqual(chapter);
    expect(loaded.save!.snapshot).toEqual(snapshot);
    expect(simulation(scene, loaded.save!.snapshot).snapshot()).toEqual(snapshot);
    // Independent validation slots remain distinct, even for these campaign scenes.
    expect(new SaveStore(storage).load(scene)).toEqual({});
  });

  it.each([
    ['childhood', 'young-zhou'], ['mainhall', 'evacuator'], ['mainhall', 'young-lu'], ['frontgate', 'relief'],
  ] as const)('rejects a missing or misidentified required participant in %s', (scene, id) => {
    const original = fixture(scene), storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.save(scene, original)).toEqual({ ok: true });
    const missing = structuredClone(original);
    missing.actors = missing.actors.filter(actor => actor.id !== id);
    expect(store.save(scene, missing).ok).toBe(false);
    const wrongRole = structuredClone(original);
    wrongRole.actors.find(actor => actor.id === id)!.role = 'enemy';
    expect(store.save(scene, wrongRole).ok).toBe(false);
    expect(store.load(scene).save!.snapshot).toEqual(original);
  });

  it.each([4, 5])('preserves a low mainhall staged body and opponents in phase %s without spending enemy IDs', phase => {
    const snapshot = fixture('mainhall');
    // Synthetic staged-save boundary: this tests range and participant validation,
    // not a claim that the player has completed the collapse/escape sequence.
    snapshot.mission.phase = phase; snapshot.mission.control = 'staged'; snapshot.mission.complete = phase === 5;
    snapshot.player.height = 0.65; snapshot.player.position[1] = -2;
    // Optional late crowds may vary between candidate revisions without making
    // an otherwise complete task snapshot unusable.
    snapshot.actors = snapshot.actors.filter(actor => !actor.id.startsWith('late-civilian-'));
    const actor = snapshot.actors.find(actor => actor.id === 'zhao')!;
    snapshot.actors.push({ ...structuredClone(actor), id: 'shao', name: '邵原', role: 'opponent' },
      { ...structuredClone(actor), id: 'guard-save-fixture', name: '固定演出警卫', role: 'opponent' });
    const spawned = snapshot.mission.spawned;
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(snapshot.actors.filter(actor => actor.role === 'worker')).toHaveLength(HISTORY.civilians.length);
    expect(store.save('campaign', snapshot, { chapter: 'campaign', stage: 'S02', elapsedBefore: 81 })).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('campaign');
    expect(loaded.save!.snapshot).toEqual(snapshot);
    expect(loaded.save!.snapshot.mission.spawned).toBe(spawned);
    const rebuilt = simulation('mainhall', loaded.save!.snapshot);
    expect(rebuilt.player.height).toBe(0.65);
    expect(rebuilt.player.position[1]).toBe(-2);
    expect(rebuilt.mission.phase).toBe(phase);
    expect(rebuilt.actors.find(a => a.id === 'shao')!.role).toBe('opponent');
    expect(() => rebuilt.step(emptyIntent)).not.toThrow();
    expect(rebuilt.player.height).toBe(0.65);

    const missingShao = structuredClone(snapshot);
    missingShao.actors = missingShao.actors.filter(a => a.id !== 'shao');
    expect(store.save('mainhall', missingShao).ok).toBe(false);
    const tooShort = structuredClone(snapshot); tooShort.player.height = 0.64;
    expect(store.save('mainhall', tooShort).ok).toBe(false);
    const standing = structuredClone(snapshot); standing.player.height = 1.8;
    expect(store.save('mainhall', standing).ok).toBe(false);
    const premature = structuredClone(snapshot); premature.mission.phase = 3; premature.mission.complete = false;
    expect(store.save('mainhall', premature).ok).toBe(false);
  });

  it('keeps child height and task-worker membership distinct from optional civilian crowds', () => {
    const child = fixture('childhood'), hall = fixture('mainhall'), store = new SaveStore(new MemoryStorage());
    expect(child.player.height).toBe(1.1);
    expect(child.actors.filter(actor => actor.role === 'worker')).toHaveLength(0);
    const extra = structuredClone(child.actors.find(actor => actor.id === 'evacuator')!);
    extra.id = 'optional-civilian-save-fixture';
    child.actors.push(extra);
    expect(store.save('childhood', child)).toEqual({ ok: true });
    const adultHeight = structuredClone(child); adultHeight.player.height = 1.8;
    expect(store.save('childhood', adultHeight).ok).toBe(false);
    const wrongGroup = structuredClone(child); wrongGroup.actors.at(-1)!.role = 'worker';
    expect(store.save('childhood', wrongGroup).ok).toBe(false);
    hall.actors.push(structuredClone(extra));
    expect(store.save('mainhall', hall)).toEqual({ ok: true });
    hall.actors = hall.actors.filter(actor => actor.id !== `worker-${HISTORY.civilians.length - 1}`);
    expect(store.save('mainhall', hall).ok).toBe(false);
  });

  it.each([['nightshift', 'S03'], ['workers', 'S04']] as const)('loads legacy L1/%s at its original stage and upgrades only on a successful save', (scene, stage) => {
    const environment = buildEnvironment(scene);
    try {
      const sim = simulation(scene, undefined, environment.solids);
      const point = scene === 'nightshift' ? NIGHT.fan : WORKERS.observation;
      const path = sim.navigation.path(sim.player.position, point);
      for (let frame = 0; frame < 900 && distance(sim.player.position, point) > 2; frame++) {
        while (path.length && distance(sim.player.position, path[0]) < 0.3) path.shift();
        const next = path[0] ?? point;
        sim.step({ ...emptyIntent, forward: 1, sprint: true,
          yaw: Math.atan2(-(next[0] - sim.player.position[0]), -(next[2] - sim.player.position[2])) });
      }
      expect(distance(sim.player.position, point)).toBeLessThanOrEqual(2);
      const yaw = scene === 'workers' ? Math.atan2(-(WORKERS.convoy[0] - sim.player.position[0]), -(WORKERS.convoy[2] - sim.player.position[2])) : sim.player.yaw;
      sim.step({ ...emptyIntent, yaw, interact: true });
      expect(sim.mission.phase).toBe(1);
      const snapshot = sim.snapshot(), storage = new MemoryStorage();
      const chapter = { chapter: 'L1', stage, elapsedBefore: 123.45 } as const;
      // Raw schema-1 envelope models bytes written by version 0.2, before S01/S02
      // were inserted into the stage list. Reading must never renumber its stage.
      const legacy = JSON.stringify({ schema: 'ganymede-save', version: 1, slot: 'campaign', savedAt: 100, snapshot, chapter });
      storage.values.set(key('campaign'), legacy);
      const loaded = new SaveStore(storage).load('campaign');
      expect(loaded.warning).toBeUndefined();
      expect(loaded.save).toEqual({ snapshot, chapter, savedAt: 100 });
      expect(storage.getItem(key('campaign'))).toBe(legacy);
      expect(storage.writes).toHaveLength(0);
      expect(simulation(scene, loaded.save!.snapshot, environment.solids).snapshot()).toEqual(snapshot);

      storage.failWriteKey = key('campaign');
      expect(new SaveStore(storage).save('campaign', loaded.save!.snapshot, loaded.save!.chapter).ok).toBe(false);
      expect(storage.getItem(key('campaign'))).toBe(legacy);
      expect(new SaveStore(storage).load('campaign').save!.chapter).toEqual(chapter);
      storage.failWriteKey = '';
      expect(new SaveStore(storage, () => 200).save('campaign', loaded.save!.snapshot, loaded.save!.chapter)).toEqual({ ok: true });
      const current = new SaveStore(storage).load('campaign');
      expect(current.save!.chapter).toEqual({ ...chapter, chapter: 'campaign' });
      expect(current.save!.snapshot).toEqual(snapshot);
      expect(loaded.save!.chapter).toEqual(chapter);
      expect(storage.getItem(`${key('campaign')}.backup`)).toBe(legacy);
      expect(storage.getItem(`${key('campaign')}.damaged`)).toBeNull();
    } finally { environment.dispose(); }
  });

  it('rejects a legacy chapter label on newly introduced stages instead of treating it as a valid old save', () => {
    const store = new SaveStore(new MemoryStorage());
    for (const [scene, stage] of addedScenes) {
      expect(store.save('campaign', fixture(scene), { chapter: 'L1', stage, elapsedBefore: 0 }).ok).toBe(false);
    }
  });
});

describe('S06/S07 patient transport save boundaries', () => {
  const scenes = ['transfer', 'flank'] as const;
  const requiredIds = {
    transfer: ['courier', 'xu', 'zhou', 'luo', 'cart-0', 'cart-1', 'cart-2'],
    flank: ['zheng', 'meng', 'worker-0', 'worker-1', 'worker-2', 'cart-0', 'cart-1', 'walker-0', 'walker-1'],
  };

  it.each(scenes)('requires every stable task participant in %s without confusing decorative civilians with patients', scene => {
    const original = fixture(scene), storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(original.actors.filter(a => a.role === 'cart').map(a => a.id)).toEqual(
      scene === 'transfer' ? ['cart-0', 'cart-1', 'cart-2'] : ['cart-0', 'cart-1']);
    if (scene === 'transfer') {
      expect(original.actors.some(a => a.id === 'zheng' || a.id === 'worker-0')).toBe(false);
      expect(original.actors.filter(a => a.role === 'worker').map(a => a.id)).toEqual(['luo']);
    }
    const civilian = structuredClone(original.actors.find(a => a.role === 'civilian')!);
    civilian.id = 'optional-civilian-save-fixture'; original.actors.push(civilian);
    expect(store.save(scene, original)).toEqual({ ok: true });
    const raw = storage.getItem(key(scene));
    for (const id of requiredIds[scene]) {
      const missing = structuredClone(original); missing.actors = missing.actors.filter(a => a.id !== id);
      expect(store.save(scene, missing).ok, `missing ${id}`).toBe(false);
      const wrongRole = structuredClone(original); wrongRole.actors.find(a => a.id === id)!.role = 'enemy';
      expect(store.save(scene, wrongRole).ok, `wrong role for ${id}`).toBe(false);
      expect(storage.getItem(key(scene))).toBe(raw);
    }
  });

  it.each(scenes)('preserves patient positions, route state and occupancy flags in a synthetic %s save boundary', scene => {
    const snapshot = fixture(scene), storage = new MemoryStorage();
    // Deliberately synthetic actor-state fixture, not a claim that a patient
    // reached this location through play. Public-input transport has separate tests.
    const cart = snapshot.actors.find(a => a.id === 'cart-0')!;
    cart.position = [4, -1.5, 12]; cart.goals = [[7, -1.5, 12], [13, 0, 8]];
    cart.path = [[4.5, -1.5, 12], [6.5, -1.5, 12]]; cart.released = true; cart.safe = false;
    const safeCart = snapshot.actors.find(a => a.id === 'cart-1')!;
    safeCart.safe = true; safeCart.released = true;
    snapshot.player.ammo = 13; snapshot.player.reserve = 84;
    const original = structuredClone(snapshot);
    expect(new SaveStore(storage).save(scene, snapshot)).toEqual({ ok: true });
    cart.goals[0][0] = 999; safeCart.safe = false;
    const loaded = new SaveStore(storage).load(scene);
    expect(loaded.warning).toBeUndefined(); expect(loaded.save!.snapshot).toEqual(original);
    const rebuilt = simulation(scene, loaded.save!.snapshot);
    expect(rebuilt.snapshot()).toEqual(original);
    expect(rebuilt.physics.bodies.has('cart-0')).toBe(true);
    expect(rebuilt.physics.bodies.get('cart-0')!.height).toBe(1.15);
    expect(rebuilt.ballistics.projectiles).toHaveLength(0);
    loaded.save!.snapshot.actors.find(a => a.id === 'cart-0')!.path[0][2] = 999;
    expect(new SaveStore(storage).load(scene).save!.snapshot).toEqual(original);
  });

  it.each(scenes)('rejects lifeless mandatory participants in %s and recovers an intact backup without erasing damage', scene => {
    const original = fixture(scene), goodStorage = new MemoryStorage();
    expect(new SaveStore(goodStorage).save(scene, original)).toEqual({ ok: true });
    const raw = goodStorage.getItem(key(scene))!;
    // Synthetic corruption cases: these protected characters cannot die in
    // these missions. Losing their body makes later arrival checks wait forever.
    for (const id of requiredIds[scene]) for (const corrupt of [{ down: true }, { health: 0 }, { health: -1 }]) {
      const snapshot = structuredClone(original); Object.assign(snapshot.actors.find(a => a.id === id)!, corrupt);
      const storage = new MemoryStorage();
      storage.values.set(key(scene), raw); storage.values.set(`${key(scene)}.backup`, raw);
      expect(new SaveStore(storage).save(scene, snapshot).ok, `${id}: ${JSON.stringify(corrupt)}`).toBe(false);
      expect(storage.getItem(key(scene))).toBe(raw);
      const damaged = JSON.stringify({ ...JSON.parse(raw), snapshot }); storage.values.set(key(scene), damaged);
      const loaded = new SaveStore(storage).load(scene);
      expect(loaded.save!.snapshot).toEqual(original); expect(loaded.warning).toContain('备份');
      expect(storage.getItem(key(scene))).toBe(damaged);
    }
    if (scene === 'flank') {
      const defeated = structuredClone(original), enemy = defeated.actors.find(a => a.role === 'enemy')!;
      enemy.health = 0; enemy.down = true;
      expect(new SaveStore(new MemoryStorage()).save(scene, defeated)).toEqual({ ok: true });
    }
  });

  it.each(scenes)('rejects malformed or extra patient carts in %s on save and load while retaining the old bytes', scene => {
    const original = fixture(scene), goodStorage = new MemoryStorage();
    expect(new SaveStore(goodStorage).save(scene, original).ok).toBe(true);
    const raw = goodStorage.getItem(key(scene))!;
    const cases: Array<[string, (snapshot: Snapshot) => void]> = [
      ['missing cart', value => { value.actors = value.actors.filter(a => a.id !== 'cart-0'); }],
      ['renumbered cart', value => { value.actors.find(a => a.id === 'cart-0')!.id = 'cart-77'; }],
      ['extra cart', value => { value.actors.push({ ...structuredClone(value.actors.find(a => a.id === 'cart-0')!), id: 'cart-extra' }); }],
      ['non-finite cart position', value => { value.actors.find(a => a.id === 'cart-0')!.position[1] = NaN; }],
      ['non-finite route', value => { value.actors.find(a => a.id === 'cart-0')!.goals = [[0, Infinity, 1]]; }],
      ['bad path vector', value => { value.actors.find(a => a.id === 'cart-0')!.path = [[1, 2] as unknown as [number, number, number]]; }],
      ['bad patient flag', value => { value.actors.find(a => a.id === 'cart-0')!.safe = 'yes' as unknown as boolean; }],
    ];
    if (scene === 'flank') cases.push(['extra unrouted walker', value => {
      value.actors.push({ ...structuredClone(value.actors.find(a => a.id === 'walker-0')!), id: 'walker-extra' });
    }]);
    for (const [label, corrupt] of cases) {
      const snapshot = structuredClone(original); corrupt(snapshot);
      const storage = new MemoryStorage(); storage.values.set(key(scene), raw);
      const store = new SaveStore(storage);
      expect(store.save(scene, snapshot).ok, label).toBe(false);
      expect(storage.writes, label).toHaveLength(0); expect(storage.getItem(key(scene))).toBe(raw);
      const damaged = JSON.stringify({ ...JSON.parse(raw), snapshot }); storage.values.set(key(scene), damaged);
      const loaded = store.load(scene);
      expect(loaded.save, label).toBeUndefined(); expect(loaded.warning, label).toBeTruthy();
      expect(storage.getItem(key(scene)), label).toBe(damaged);
    }
  });
});

describe('S08/S09 escort and relief save identities', () => {
  const scenes = ['escort', 'relief'] as const;
  const requiredIds = {
    escort: ['luo', 'meng', 'medic', 'relief-0', 'relief-1', 'cart-0', 'cart-1', 'cart-2', 'walker-0', 'walker-1'],
    relief: ['meng', 'zheng', 'relief-0', 'relief-1', 'worker-0', 'worker-1', 'worker-2'],
  };

  it.each(scenes)('keeps every protected %s participant present and alive without overwriting a valid checkpoint', scene => {
    const original = fixture(scene), storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.save(scene, original)).toEqual({ ok: true });
    const raw = storage.getItem(key(scene))!;
    for (const id of requiredIds[scene]) {
      const missing = structuredClone(original); missing.actors = missing.actors.filter(a => a.id !== id);
      expect(store.save(scene, missing).ok, `missing ${id}`).toBe(false);
      for (const patch of [{ role: 'enemy' }, { down: true }, { health: 0 }, { health: -1 }]) {
        const corrupt = structuredClone(original); Object.assign(corrupt.actors.find(a => a.id === id)!, patch);
        expect(store.save(scene, corrupt).ok, `${id}: ${JSON.stringify(patch)}`).toBe(false);
        expect(storage.getItem(key(scene))).toBe(raw);
        const imported = new MemoryStorage(), damaged = JSON.stringify({ ...JSON.parse(raw), snapshot: corrupt });
        imported.values.set(key(scene), damaged); imported.values.set(`${key(scene)}.backup`, raw);
        const loaded = new SaveStore(imported).load(scene);
        expect(loaded.save!.snapshot).toEqual(original); expect(loaded.warning).toContain('备份');
        expect(imported.getItem(key(scene))).toBe(damaged);
      }
    }
  });

  it.each(scenes)('rejects extra %s task-prefix actors even when disguised as decorative civilians', scene => {
    const original = fixture(scene), store = new SaveStore(new MemoryStorage());
    const decorative = { ...structuredClone(original.actors[0]), id: 'bystander-save-fixture', name: '非任务群众', role: 'civilian' as const };
    const withCrowd = structuredClone(original); withCrowd.actors.push(decorative);
    expect(store.save(scene, withCrowd)).toEqual({ ok: true });
    for (const prefix of ['cart-', 'walker-', 'relief-', 'worker-']) {
      const corrupt = structuredClone(original); corrupt.actors.push({ ...structuredClone(decorative), id: `${prefix}extra` });
      expect(store.save(scene, corrupt).ok, prefix).toBe(false);
    }
  });

  it('preserves the S08 spare cart body without treating it as an arrived third patient', () => {
    const snapshot = fixture('escort'), storage = new MemoryStorage();
    const carts = snapshot.actors.filter(a => a.role === 'cart');
    expect(carts.map(a => a.id)).toEqual(['cart-0', 'cart-1', 'cart-2']);
    expect(snapshot.actors.filter(a => a.role === 'worker').map(a => a.id)).toEqual(['luo']);
    expect(carts.find(a => a.id === 'cart-2')!.safe).toBe(false);
    expect(carts.find(a => a.id === 'cart-2')!.released).toBe(false);
    expect(new SaveStore(storage).save('escort', snapshot)).toEqual({ ok: true });
    const loaded = new SaveStore(storage).load('escort');
    expect(loaded.warning).toBeUndefined(); expect(loaded.save!.snapshot).toEqual(snapshot);
    const rebuilt = simulation('escort', loaded.save!.snapshot);
    for (const id of ['cart-0', 'cart-1', 'cart-2']) expect(rebuilt.physics.bodies.get(id)!.height).toBe(1.15);
    expect(rebuilt.snapshot()).toEqual(snapshot);
    const missingSpare = structuredClone(snapshot); missingSpare.actors = missingSpare.actors.filter(a => a.id !== 'cart-2');
    expect(new SaveStore(storage).save('escort', missingSpare).ok).toBe(false);
    expect(new SaveStore(storage).load('escort').save!.snapshot).toEqual(snapshot);
  });

  it('rejects a standing S09 seated-phase body without replacing a prior valid save (synthetic corruption)', () => {
    const snapshot = fixture('relief'), storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.save('relief', snapshot)).toEqual({ ok: true });
    const raw = storage.getItem(key('relief'));
    // Deliberately contradictory import, not a replayed route or claimed ending.
    const corrupt = structuredClone(snapshot); corrupt.mission.phase = 7; corrupt.mission.control = 'staged';
    expect(corrupt.player.height).toBe(1.8);
    expect(store.save('relief', corrupt)).toEqual({ ok: false, error: expect.stringContaining('坐姿') });
    expect(storage.getItem(key('relief'))).toBe(raw);
  });

  it('rejects phase/occupancy contradictions that would follow the wrong S08 patient cart (synthetic corruption)', () => {
    const snapshot = fixture('escort'), storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.save('escort', snapshot)).toEqual({ ok: true });
    const raw = storage.getItem(key('escort'));
    // No claim of driving to these phases: these are intentionally malformed
    // imports. The path test separately restores a real post-transfer snapshot.
    for (const [phase, transferred] of [[11, true], [12, false], [15, false]] as const) {
      const corrupt = structuredClone(snapshot); corrupt.mission.phase = phase;
      if (transferred) corrupt.mission.facts.push('escort-patient-transferred');
      expect(store.save('escort', corrupt)).toEqual({ ok: false, error: expect.stringContaining('换车状态') });
      expect(storage.getItem(key('escort'))).toBe(raw);
    }
  });
});

describe('SaveStore settings and inaccessible storage', () => {
  it('keeps legacy device detection automatic and round-trips an explicit touch preference', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    expect(store.getSettings().settings.touchControls).toBeUndefined();
    expect(store.saveSettings({ ...DEFAULT_SETTINGS, touchControls: true }).ok).toBe(true);
    expect(new SaveStore(storage).getSettings().settings.touchControls).toBe(true);
    expect(store.saveSettings({ ...DEFAULT_SETTINGS, touchControls: false }).ok).toBe(true);
    expect(new SaveStore(storage).getSettings().settings.touchControls).toBe(false);
    expect(store.saveSettings({ ...DEFAULT_SETTINGS, touchControls: 'yes' } as unknown as GameSettings).ok).toBe(false);
    expect(store.getSettings().settings.touchControls).toBe(false);
  });
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
