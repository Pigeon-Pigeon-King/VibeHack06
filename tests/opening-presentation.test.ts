import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { SceneFrame } from '../src/contracts';
import { OPENING_TIMELINE } from '../src/content/opening-timeline';
import { openingView } from '../src/presentation/OpeningView';
import { buildEnvironment } from '../src/presentation/environment';
import { createCharacter } from '../src/presentation/characters';
import { Simulation } from '../src/mission/Simulation';
import { initializePhysics } from '../src/runtime/Physics';
import { SaveStore, type StorageLike } from '../src/persistence/SaveStore';

const frame = (time: number): SceneFrame => ({ scenario: 'mainhall', phase: 4, phaseTime: time, lowMotion: false });
const T = OPENING_TIMELINE.mainhall;
const facts = ['history-timeline-v2', 'history-bombardment', 'history-collapse'];
beforeAll(initializePhysics);

describe('opening presentation follows saved story time', () => {
  it('shows bombardment before lowering multiple roof sections, with a continuous fall', () => {
    const env = buildEnvironment('mainhall'), camera = new Vector3(-10, 1.66, 4);
    try {
      const panel = env.root.getObjectByName('history-roof-section-1')!;
      expect(env.root.children.filter(o => o.name.startsWith('history-roof-section-'))).toHaveLength(12);
      env.setFacts!(['history-timeline-v2', 'history-bombardment']); env.update(100, camera, frame(T.bombardment + 0.5));
      expect(panel.position.y).toBe(7.95);
      env.setFacts!(facts); env.update(102.6, camera, frame(T.collapse + 0.6));
      const middle = panel.position.y;
      expect(middle).toBeLessThan(7.95); expect(middle).toBeGreaterThan(4.45);
      env.update(104, camera, frame(T.collapse + 2)); expect(panel.position.y).toBeCloseTo(4.45);
      const debris = env.root.getObjectByName('history-collapse-debris')!;
      expect(debris.visible).toBe(true); expect(debris.position.y).toBe(0);
    } finally { env.dispose(); }
  });
  it('reconstructs the same intermediate scene after restore and stays fixed at paused story time', () => {
    const a = buildEnvironment('mainhall'), b = buildEnvironment('mainhall'), camera = new Vector3();
    try {
      for (const env of [a, b]) { env.setFacts!(structuredClone(facts)); env.update(100, camera, frame(T.collapse + 0.6)); }
      const before = a.root.getObjectByName('history-roof-section-4')!.position.clone();
      a.update(100, camera, frame(T.collapse + 0.6));
      expect(a.root.getObjectByName('history-roof-section-4')!.position).toEqual(before);
      expect(b.root.getObjectByName('history-roof-section-4')!.position).toEqual(before);
    } finally { a.dispose(); b.dispose(); }
  });
  it('keeps the prisoner visible through the execution and only fades after unconsciousness', () => {
    expect(openingView(frame(T.execution + 3), [...facts, 'zhao-executed']).blackout).toBe(0);
    const unconscious = [...facts, 'zhao-executed', 'zhou-unconscious'];
    expect(openingView(frame(T.unconscious + 1), unconscious).blackout).toBeCloseTo(0.5);
    expect(openingView(frame(T.unconscious + 2), unconscious).blackout).toBe(1);
  });
  it('does not raise the camera or replay falling debris for legacy collapsed saves', () => {
    const legacy = openingView(frame(0), ['history-collapse']);
    expect(legacy.fall).toBe(1); expect(legacy.eyeLift).toBe(0);
    expect(openingView(frame(T.collapse + 0.6), facts).eyeLift).toBeGreaterThan(0);
    expect(openingView(frame(T.collapse), ['history-collapse', 'history-bombardment']).shake).toBeCloseTo(0);
    expect(openingView(frame(T.bombardment + 0.5), ['history-timeline-v2', 'history-bombardment']).shake).not.toBe(0);
    expect(openingView({ ...frame(T.bombardment + 0.5), lowMotion: true }, ['history-timeline-v2', 'history-bombardment']).shake).toBe(0);
  });
  it('distinguishes the unarmed reach, restraint and eventual fallen pose', () => {
    const model = createCharacter('ally');
    try {
      model.setPose({ walk: 0, aiming: false, down: false, armed: false, reaching: 1 });
      expect(model.root.getObjectByName('pose-root')!.rotation.x).toBeGreaterThan(0.3);
      expect(model.root.getObjectByName('carbine-placeholder')!.visible).toBe(false);
      model.setPose({ walk: 0, aiming: false, down: false, armed: false, kneeling: true, restrained: true });
      expect(model.root.getObjectByName('pose-root')!.rotation.x).toBe(0);
      expect(model.root.getObjectByName('pose-root')!.position.y).toBeLessThan(0);
      model.setPose({ walk: 0, aiming: false, down: true, armed: false });
      expect(model.root.getObjectByName('pose-root')!.rotation.x).toBeCloseTo(Math.PI / 2);
    } finally { model.dispose(); }
  });
  it('keeps the child viewpoint and later chapters outside the collapse and blackout', () => {
    for (const scenario of ['childhood', 'nightshift'] as const) {
      const state = openingView({ ...frame(24), scenario }, [...facts, 'zhou-unconscious']);
      expect(state.blackout).toBe(0); expect(state.collapsed).toBe(false); expect(state.eyeLift).toBe(0);
    }
  });
  it('accepts standing pre-collapse and legacy pinned saves, rejecting a mismatched body state', () => {
    // Constructed validation boundary, separate from the public-input opening replays.
    const s = new Simulation('mainhall', []);
    const data = new Map<string, string>();
    const memory: StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
    try {
      s.createActor('shao', '邵原', 'opponent', [18, 0, -2]);
      const snapshot = s.snapshot(); snapshot.mission.phase = 4; snapshot.mission.control = 'staged';
      snapshot.mission.facts.push('history-timeline-v2');
      const store = new SaveStore(memory);
      expect(store.save('mainhall', snapshot).ok).toBe(true);
      snapshot.mission.facts.push('history-collapse');
      expect(store.save('mainhall', snapshot).ok).toBe(false);
      snapshot.player.height = 0.65; expect(store.save('mainhall', snapshot).ok).toBe(true);
      snapshot.mission.facts = ['history-collapse']; expect(store.save('mainhall', snapshot).ok).toBe(true);
      snapshot.mission.facts = ['history-timeline-v2']; expect(store.save('mainhall', snapshot).ok).toBe(false);
    } finally { s.dispose(); }
  });
});
