import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { CharacterRole, ScenarioId, SolidSpec, Vec3 } from '../src/contracts';
import { Simulation } from '../src/mission/Simulation';
import { AIM_IDENTITY_RANGE, queryAimIdentity, resolveAimIdentity, type AimIdentityActor, type AimIdentityHit } from '../src/presentation/AimIdentity';
import { AimIdentityHUD } from '../src/ui/AimIdentityHUD';
import { initializePhysics, Physics } from '../src/runtime/Physics';

beforeAll(initializePhysics);
const actor = (id: string, name: string, role: CharacterRole = 'ally'): AimIdentityActor => ({ id, name, role, health: 100, down: false });
const context = (scenario: ScenarioId = 'mainhall', facts: string[] = []) => ({ scenario, facts });
const floor: SolidSpec = { id: 'aim-floor', position: [0, -0.25, -10], size: [60, 0.5, 60] };
const eye: Vec3 = [0, 1.66, 0], forward: Vec3 = [0, 0, -1];
function query(physics: Physics, actors: AimIdentityActor[], extra: Partial<Parameters<typeof queryAimIdentity>[0]> = {}) {
  return queryAimIdentity({ physics, actors, cameraPosition: eye, worldDirection: forward, ...context(), ...extra });
}

describe('current mission identities, anonymous actors and story knowledge', () => {
  it('keeps the actual S04 worker-0 name 罗敬 while hiding the rest of that numbered cohort', () => {
    const s = new Simulation('workers', []);
    try {
      const luo = s.actors.find(a => a.id === 'worker-0')!;
      expect(luo.name).toBe('罗敬');
      expect(resolveAimIdentity(luo, context('workers'))).toEqual({ id: luo.id, name: luo.name, tone: 'friendly' });
      for (const other of s.workers.filter(a => a !== luo)) expect(resolveAimIdentity(other, context('workers'))).toBeNull();
      expect(resolveAimIdentity(s.actors.find(a => a.id === 'zheng')!, context('workers'))?.name).toBe('郑铎');
    } finally { s.dispose(); }
  });

  it('uses the S01 actor’s current authored title, without revealing the identity behind the imported model', () => {
    const s = new Simulation('childhood', []);
    try {
      expect(resolveAimIdentity(s.actors.find(a => a.id === 'young-zhou')!, context('childhood'))?.name).toBe('年轻的驻军士兵');
      expect(resolveAimIdentity(s.actors.find(a => a.id === 'evacuator')!, context('childhood'))?.name).toBe('带孩子撤离的女人');
      expect(resolveAimIdentity(s.actors.find(a => a.id === 'father')!, context('childhood'))?.name).toBe('陆建平');
      for (const a of s.actors.filter(a => /^(hall-defender-|late-civilian-|evac-crowd-|civilian-)/.test(a.id))) {
        expect(resolveAimIdentity(a, context('childhood')), a.id).toBeNull();
      }
    } finally { s.dispose(); }
  });

  it('allows only the exact important-enemy ID and does not treat every opponent or familiar name as a boss', () => {
    const known = context('mainhall', ['shao-identified-by-zhou']);
    for (const a of [actor('enemy-E00-0', '敌方步枪兵', 'enemy'), actor('enemy-E05-2', '赵启明', 'enemy'),
      actor('hall-invader-0', '邵原', 'opponent'), actor('other-opponent', '邵原', 'opponent')]) {
      expect(resolveAimIdentity(a, known)).toBeNull();
    }
    expect(resolveAimIdentity(actor('shao', '邵原', 'opponent'), known)).toEqual({ id: 'shao', name: '邵原', tone: 'hostile' });
    expect(resolveAimIdentity(actor('shao', '邵原', 'enemy'), known)?.tone).toBe('hostile');
  });

  it('requires the S02 reveal and does not transfer private knowledge to the child or the other protagonist', () => {
    const shao = actor('shao', '邵原', 'opponent');
    for (const facts of [[], ['history-enemy-breach'], ['zhao-captured'], ['full-report-shared']]) {
      expect(resolveAimIdentity(shao, context('mainhall', facts))).toBeNull();
    }
    expect(resolveAimIdentity(shao, context('mainhall', ['shao-identified-by-zhou']))?.name).toBe('邵原');
    expect(resolveAimIdentity(shao, context('childhood', ['shao-identified-by-zhou', 'full-report-shared']))).toBeNull();
    expect(resolveAimIdentity(shao, context('transfer', ['zhou-knows-shaoyuan-time', 'shao-identified-by-zhou']))).toBeNull();
    expect(resolveAimIdentity(shao, context('transfer', ['lu-knows-shaoyuan-time']))?.name).toBe('邵原');
    expect(resolveAimIdentity(shao, context('frontgate', ['lu-knows-shaoyuan-time']))).toBeNull();
    expect(resolveAimIdentity(shao, context('frontgate', ['zhou-knows-shaoyuan-time']))?.name).toBe('邵原');
    expect(resolveAimIdentity(shao, context('escort', ['shaoyuan-departure-confirmed']))?.name).toBe('邵原');
  });

  it('rejects anonymous cohorts, vehicles, empty names and fallen people while preserving story participants', () => {
    for (const id of ['worker-3', 'walker-2', 'relief-1', 'medic-1']) {
      expect(resolveAimIdentity(actor(id, '普通人员', 'civilian'), context())).toBeNull();
    }
    expect(resolveAimIdentity(actor('zhou', '周延 · 救治中', 'cart'), context('medical'))).toBeNull();
    expect(resolveAimIdentity({ ...actor('zhao', '赵启明'), down: true }, context())).toBeNull();
    expect(resolveAimIdentity({ ...actor('zhao', '赵启明'), health: 0 }, context())).toBeNull();
    expect(resolveAimIdentity(actor('courier', '   ', 'civilian'), context())).toBeNull();
    expect(resolveAimIdentity(actor('courier', '医院联络员', 'civilian'), context('transfer'))?.name).toBe('医院联络员');
  });
});

describe('nearest physical hit on the current rendered camera ray', () => {
  it('excludes the player’s capsule and identifies the nearest named actor, independent of list order', () => {
    const physics = new Physics([floor]), near = actor('luo', '罗敬', 'worker'), far = actor('zheng', '郑铎');
    try {
      physics.add('player', [0, 0, 0]); physics.add(far.id, [0, 0, -12]); physics.add(near.id, [0, 0, -5]); physics.step();
      const trace = vi.spyOn(physics, 'trace');
      expect(query(physics, [far, near])).toEqual({ hitId: 'luo', target: { id: 'luo', name: '罗敬', tone: 'friendly' } });
      expect(trace).toHaveBeenCalledTimes(1);
      expect(trace.mock.calls[0][2]).toBe('player');
    } finally { physics.dispose(); }
  });

  it('lets an actual wall block the identity and respects a physically opened door on the same frame', () => {
    const wall: SolidSpec = { id: 'aim-door', position: [0, 1.5, -3], size: [3, 3, 0.4], openFact: 'aim-door-open' };
    const physics = new Physics([floor, wall]), target = actor('zheng', '郑铎');
    try {
      physics.add(target.id, [0, 0, -8]); physics.step();
      expect(query(physics, [target])).toEqual({ hitId: 'solid:aim-door', target: null });
      physics.applyFacts(['aim-door-open']);
      expect(query(physics, [target])?.target?.name).toBe('郑铎');
    } finally { physics.dispose(); }
  });

  it.each([actor('worker-2', '撤离居民', 'worker'), actor('enemy-E00-1', '郑铎', 'enemy')])
    ('does not look through unnamed front actor $id to a named person behind', front => {
      const physics = new Physics([floor]), back = actor('zhao', '赵启明');
      try {
        physics.add(front.id, [0, 0, -4]); physics.add(back.id, [0, 0, -9]); physics.step();
        expect(query(physics, [back, front])).toEqual({ hitId: front.id, target: null });
        physics.remove(front.id); physics.step();
        expect(query(physics, [back, front])?.target?.name).toBe('赵启明');
      } finally { physics.dispose(); }
    });

  it('does not reveal an invisible actor or search beyond its physical hit', () => {
    const physics = new Physics([floor]), front = actor('zhao', '赵启明'), back = actor('zheng', '郑铎');
    try {
      physics.add(front.id, [0, 0, -4]); physics.add(back.id, [0, 0, -9]); physics.step();
      expect(query(physics, [back, front], { isActorVisible: id => id !== front.id })).toEqual({ hitId: front.id, target: null });
    } finally { physics.dispose(); }
  });

  it('normalizes the direction and caps the trace at 24m instead of using actor-list proximity', () => {
    const physics = new Physics([floor]), target = actor('zheng', '郑铎');
    try {
      physics.add(target.id, [0, 0, -24.5]); physics.step();
      expect(AIM_IDENTITY_RANGE).toBe(24);
      expect(query(physics, [target], { worldDirection: [0, 0, -100] })).toBeNull();
      physics.teleport(target.id, [0, 0, -23.9]); physics.step();
      expect(query(physics, [target], { worldDirection: [0, 0, -100] })?.target?.name).toBe('郑铎');
      const trace = vi.spyOn(physics, 'trace');
      expect(query(physics, [target], { worldDirection: [0, 0, 0] })).toBeNull();
      expect(query(physics, [target], { cameraPosition: [NaN, 0, 0] })).toBeNull();
      expect(trace).not.toHaveBeenCalled();
    } finally { physics.dispose(); }
  });

  it('follows the current translated, rotated and pitched Three.js camera, including its world direction', () => {
    const physics = new Physics([floor]), target = actor('luo', '罗敬', 'worker');
    try {
      physics.add(target.id, [8, 0, -4]); physics.step();
      const camera = new PerspectiveCamera(54, 9 / 16, 0.045, 1000);
      camera.position.set(1, 1.4, 3); camera.lookAt(8, 1.3, -4);
      const read = () => query(physics, [target], { cameraPosition: camera.getWorldPosition(new Vector3()).toArray() as Vec3,
        worldDirection: camera.getWorldDirection(new Vector3()).toArray() as Vec3 });
      expect(read()?.target?.name).toBe('罗敬');
      camera.lookAt(8, 4, -4);
      expect(read()).toBeNull();
    } finally { physics.dispose(); }
  });
});

// A small DOM test adapter verifies element ownership and the text-only sink.
// It does not claim CSS layout, font rendering or a browser screenshot pass.
class DomNode {
  children: DomNode[] = [];
  parent?: DomNode;
  hidden = false;
  className = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  private text = '';
  constructor(readonly ownerDocument: DomDocument, readonly tagName: string) {}
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent() { return this.text; }
  set innerHTML(_value: string) { throw new Error('Identity HUD must not parse HTML'); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(child: DomNode) { child.remove(); this.children.push(child); child.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
}
class DomDocument {
  head = new DomNode(this, 'HEAD');
  body = new DomNode(this, 'BODY');
  created: string[] = [];
  createElement(name: string) { this.created.push(name); return new DomNode(this, name.toUpperCase()); }
}
const named = (id = 'zheng', name = '郑铎', tone: 'friendly' | 'hostile' = 'friendly'): AimIdentityHit => ({
  hitId: id, target: { id, name, tone },
});
function hud() {
  const doc = new DomDocument(), view = new AimIdentityHUD(doc.body as unknown as HTMLElement);
  return { doc, view, element: view.element as unknown as DomNode };
}

describe('single name under the reticle', () => {
  it('fades in briefly and fades off an empty ray within 80ms, without frame-rate-dependent timing', () => {
    const frames = [30, 60, 120].map(fps => {
      const { view, element } = hud();
      try {
        view.update(named(), 1 / fps, true);
        expect(+element.style.opacity).toBeGreaterThan(0); expect(+element.style.opacity).toBeLessThan(1);
        for (let n = 1; n < fps / 10; n++) view.update(named(), 1 / fps, true);
        expect(+element.style.opacity).toBeCloseTo(1);
        view.update(null, 0.04, true); const half = +element.style.opacity;
        expect(element.textContent).toBe('郑铎'); expect(element.hidden).toBe(false);
        view.update(null, 0.041, true);
        expect(element.hidden).toBe(true); expect(element.textContent).toBe('');
        return half;
      } finally { view.dispose(); }
    });
    expect(frames[0]).toBeCloseTo(frames[1], 8); expect(frames[1]).toBeCloseTo(frames[2], 8);
  });

  it('clears an old name immediately on a wall/anonymous actor, and replaces it immediately when switching names', () => {
    const { view, element } = hud();
    try {
      for (const hitId of ['solid:wall', 'enemy-E00-0', 'worker-2']) {
        view.update(named(), 0.1, true);
        view.update({ hitId, target: null }, 0, true);
        expect(element.textContent).toBe(''); expect(element.hidden).toBe(true);
      }
      view.update(named(), 0.1, true);
      view.update(named('shao', '邵原', 'hostile'), 1 / 60, true);
      expect(element.textContent).toBe('邵原'); expect(element.dataset.tone).toBe('hostile');
      expect(+element.style.opacity).toBeLessThan(1);
      view.update(named('shao', '邵原 · 已辨认', 'hostile'), 1 / 60, true);
      expect(element.textContent).toBe('邵原 · 已辨认');
    } finally { view.dispose(); }
  });

  it('clears instantly when the host hides gameplay, then starts cleanly on resume and honors reduced motion', () => {
    const { view, element } = hud();
    try {
      view.update(named(), 0, true, true);
      expect(element.hidden).toBe(false); expect(element.style.opacity).toBe('1');
      view.update(named(), 0, false);
      expect(element.hidden).toBe(true); expect(element.textContent).toBe('');
      view.update(named('luo', '罗敬'), 0, true);
      expect(element.hidden).toBe(true); expect(element.textContent).toBe('罗敬');
      view.update(named('luo', '罗敬'), 0, true, true);
      expect(element.hidden).toBe(false);
      view.update(null, 0, true, true);
      expect(element.hidden).toBe(true); expect(element.textContent).toBe('');
    } finally { view.dispose(); }
  });

  it('uses only textContent for names and releases both DOM and style without global timers or duplicate ownership', () => {
    const { doc, view, element } = hud();
    const second = new AimIdentityHUD(doc.body as unknown as HTMLElement);
    const text = '<img src=x onerror=alert(1)> & 姓名';
    try {
      view.update(named('story-person', text), 0.1, true);
      expect(element.textContent).toBe(text); expect(element.children).toHaveLength(0);
      expect(doc.created).toEqual(['style', 'div', 'style', 'div']);
      expect(doc.head.children).toHaveLength(2); expect(doc.body.children).toHaveLength(2);
      view.dispose(); view.dispose(); view.update(named(), 0.1, true);
      expect(doc.head.children).toHaveLength(1); expect(doc.body.children).toHaveLength(1);
      second.update(named('luo', '罗敬'), 0.1, true);
      expect(second.element.textContent).toBe('罗敬');
    } finally { view.dispose(); second.dispose(); }
    expect(doc.head.children).toHaveLength(0); expect(doc.body.children).toHaveLength(0);
  });
});
