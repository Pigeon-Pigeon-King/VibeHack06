import { beforeAll, describe, expect, it } from 'vitest';
import type { ScenarioId } from '../src/contracts';
import { distance, emptyIntent, Simulation, type Snapshot } from '../src/mission/Simulation';
import { EPILOGUE } from '../src/content/epilogue-layout';
import { SaveStore, SAVE_KEY_PREFIX, type StorageLike } from '../src/persistence/SaveStore';
import { buildEnvironment } from '../src/presentation/environment';
import { initializePhysics } from '../src/runtime/Physics';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

beforeAll(initializePhysics);

function withInitial(scene: ScenarioId, run: (snapshot: Snapshot) => void): void {
  const environment = buildEnvironment(scene), sim = new Simulation(scene, environment.solids);
  try { run(sim.snapshot()); }
  finally { sim.dispose(); environment.dispose(); }
}

/** Corrupt a real initial snapshot; this is import validation, not a gameplay replay. */
function rejectsWithoutReplacing(original: Snapshot, mutate: (snapshot: Snapshot) => void): void {
  const scene = original.mission.scenario, key = `${SAVE_KEY_PREFIX}${scene}`;
  const storage = new MemoryStorage(), store = new SaveStore(storage, () => 100);
  expect(store.save(scene, original)).toEqual({ ok: true });
  const raw = storage.getItem(key)!;
  const damagedSnapshot = structuredClone(original); mutate(damagedSnapshot);
  const writesBefore = storage.writes.length;
  expect(store.save(scene, damagedSnapshot).ok).toBe(false);
  expect(storage.writes).toHaveLength(writesBefore);
  expect(storage.getItem(key)).toBe(raw);
  const damaged = JSON.stringify({ ...JSON.parse(raw), snapshot: damagedSnapshot });
  storage.data.set(key, damaged); storage.data.set(`${key}.backup`, raw);
  const loaded = new SaveStore(storage).load(scene);
  expect(loaded.save!.snapshot).toEqual(original);
  expect(loaded.warning).toContain('备份');
  expect(storage.getItem(key)).toBe(damaged);
}

describe('S10–S12 stable rescue and reception save identities', () => {
  it('does not accept a missing, swapped or ordinary-dead rescue participant', () => withInitial('rescue', original => {
    for (const id of ['meng', 'zheng', 'medic', 'medic-1', 'zhou-cart']) {
      rejectsWithoutReplacing(original, value => { value.actors = value.actors.filter(a => a.id !== id); });
      for (const corrupt of [{ role: 'enemy' }, { down: true }, { health: 0 }]) {
        rejectsWithoutReplacing(original, value => Object.assign(value.actors.find(a => a.id === id)!, corrupt));
      }
    }
    // Changing the person to a bed before cooperative lifting must not silently
    // switch the collision body or create a second copy of the same patient.
    rejectsWithoutReplacing(original, value => { value.actors.find(a => a.id === 'meng')!.role = 'cart'; });
    rejectsWithoutReplacing(original, value => {
      value.actors.push({ ...structuredClone(value.actors.find(a => a.id === 'zhou-cart')!), id: 'extra-patient-cart' });
    });
  }));

  it('keeps both patient identities and the care team while rejecting invented treatment outcomes', () => withInitial('medical', original => {
    for (const id of ['zhou', 'meng', 'doctor', 'nurse', 'xu', 'zheng']) {
      rejectsWithoutReplacing(original, value => { value.actors = value.actors.filter(a => a.id !== id); });
      for (const corrupt of [{ role: 'enemy' }, { down: true }, { health: 0 }]) {
        rejectsWithoutReplacing(original, value => Object.assign(value.actors.find(a => a.id === id)!, corrupt));
      }
    }
    for (const fact of ['zhou-death-confirmed', 'medical-records-delivered', 'medical-curtain-open']) {
      rejectsWithoutReplacing(original, value => { value.mission.facts.push(fact); });
    }
    rejectsWithoutReplacing(original, value => { value.mission.facts = value.mission.facts.filter(f => f !== 'meng-treatment-continues'); });
    rejectsWithoutReplacing(original, value => { value.mission.control = 'combat'; });
    rejectsWithoutReplacing(original, value => { value.mission.failed = true; value.player.health = 0; });
  }));

  it('requires Luo, all three arriving workers and the supply cart without accepting a premature reception', () => withInitial('epilogue', original => {
    expect(original.actors.filter(a => a.role === 'worker').map(a => a.id)).toEqual(['luo', 'worker-0', 'worker-1', 'worker-2']);
    expect(original.actors.filter(a => a.role === 'cart').map(a => a.id)).toEqual(['supply-cart']);
    for (const id of ['luo', 'zheng', 'worker-0', 'worker-1', 'worker-2', 'supply-cart']) {
      rejectsWithoutReplacing(original, value => { value.actors = value.actors.filter(a => a.id !== id); });
      rejectsWithoutReplacing(original, value => { value.actors.find(a => a.id === id)!.down = true; });
    }
    for (const fact of ['zhou-death-confirmed', 'meng-treatment-continues', 'medical-needs-recorded', 'reception-contact-received']) {
      rejectsWithoutReplacing(original, value => { value.mission.facts = value.mission.facts.filter(f => f !== fact); });
    }
    for (const fact of ['reception-door-open', 'first-workers-received', 'first-medical-supplies-received']) {
      rejectsWithoutReplacing(original, value => { value.mission.facts.push(fact); });
    }
    rejectsWithoutReplacing(original, value => { value.mission.complete = true; });
    rejectsWithoutReplacing(original, value => {
      value.actors.push({ ...structuredClone(value.actors.find(a => a.id === 'supply-cart')!), id: 'unexpected-supply-cart' });
    });
  }));

  it('rejects a forged finish before real passage and a displaced arrival after the public-input gate handover', () => {
    const environment = buildEnvironment('epilogue'), sim = new Simulation('epilogue', environment.solids);
    try {
      // Drive only public Intent from the authored entrance. The separate path
      // suite owns full-campaign claims; this reaches the actual save boundary.
      let path: typeof sim.player.position[] = [], key = '';
      for (let frame = 0; frame < 360 * 60 && sim.mission.phase < 7; frame++) {
        const goal = sim.objective.point, nextKey = `${sim.mission.phase}:${goal.join(',')}`;
        if (key !== nextKey) { key = nextKey; path = []; }
        if (!path.length && distance(sim.player.position, goal) > 0.35) path = sim.navigation.path(sim.player.position, goal);
        while (path.length && distance(sim.player.position, path[0]) < 0.3) path.shift();
        const next = path[0] ?? goal;
        const moving = sim.mission.control !== 'staged' && distance(sim.player.position, goal) > 0.35;
        const yaw = moving ? Math.atan2(-(next[0] - sim.player.position[0]), -(next[2] - sim.player.position[2])) : sim.player.yaw;
        sim.step({ ...emptyIntent, yaw, forward: moving ? 1 : 0, sprint: true, interact: frame % 12 === 0, skip: true });
      }
      expect(sim.mission.phase).toBe(7);
      expect(sim.has('reception-door-open')).toBe(true);
      expect(sim.has('first-workers-received')).toBe(false);
      const beforePassage = sim.snapshot();
      rejectsWithoutReplacing(beforePassage, value => { value.mission.complete = true; });
      for (let frame = 0; frame < 90 * 60 && !sim.mission.complete; frame++) sim.step({ ...emptyIntent, yaw: sim.player.yaw });
      expect(sim.mission.complete).toBe(true);
      const received = sim.snapshot();
      expect(new SaveStore(new MemoryStorage()).save('epilogue', received)).toEqual({ ok: true });
      rejectsWithoutReplacing(received, value => { value.actors.find(a => a.id === 'worker-0')!.position = [...EPILOGUE.workersSpawns[0]]; });
      rejectsWithoutReplacing(received, value => { value.actors.find(a => a.id === 'supply-cart')!.position[2] = 12; });
      rejectsWithoutReplacing(received, value => { value.actors.find(a => a.id === 'supply-cart')!.goals = [[-4, 0, -6]]; });
    } finally { sim.dispose(); environment.dispose(); }
  }, 30_000);
});
