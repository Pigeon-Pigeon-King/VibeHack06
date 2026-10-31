import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import type { Vec3, ScenarioId } from '../../src/contracts';
import { RESCUE as R } from '../../src/content/rescue-layout';
import { MEDICAL as M } from '../../src/content/medical-layout';
import { EPILOGUE as E } from '../../src/content/epilogue-layout';
import { Navigation } from '../../src/actors/Navigation';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, Physics, FIXED_DT as dt } from '../../src/runtime/Physics';

beforeAll(initializePhysics);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const eye = (p: Vec3, height = 1.66): Vec3 => [p[0], p[1] + height, p[2]];
function withWorld(id: ScenarioId, run: (p: Physics, e: ReturnType<typeof buildEnvironment>) => void) {
  const e = buildEnvironment(id), p = new Physics(e.solids);
  try { run(p, e); } finally { p.dispose(); e.dispose(); }
}
function clear(p: Physics, point: Vec3, cart = false) {
  const shape = cart ? new RAPIER.Cuboid(0.45, 0.575, 1.2) : new RAPIER.Capsule(0.62, 0.28);
  const hit = p.world.intersectionWithShape({ x: point[0], y: point[1] + (cart ? 0.6 : 0.925), z: point[2] },
    cart ? { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } : { x: 0, y: 0, z: 0, w: 1 }, shape,
    undefined, undefined, undefined, undefined, c => (p.ids.get(c.handle) ?? '').startsWith('solid:'));
  expect.soft(hit && p.ids.get(hit.handle), `occupied ${cart ? 'bed' : 'person'} point ${point}`).toBeNull();
}
function follow(p: Physics, id: string, goals: Vec3[], speed = 2.1, cart = false) {
  let seconds = 0, travel = 0, maxY = p.foot(id)[1], minY = maxY;
  for (const goal of goals) {
    let steps = 0, old = p.foot(id), progress = old, stuck = 0;
    while (dist(p.foot(id), goal) > 0.09 && seconds < 600 && steps < 12000) {
      const at = p.foot(id), dx = goal[0] - at[0], dz = goal[2] - at[2], len = Math.hypot(dx, dz);
      const v = Math.min(speed, len / dt);
      if (cart) p.orient(id, Math.atan2(dx, dz));
      p.move(id, dx / len * v, dz / len * v, dt); p.step(); steps++; seconds += dt;
      const now = p.foot(id); travel += dist(now, old); maxY = Math.max(maxY, now[1]); minY = Math.min(minY, now[1]); old = now;
      if (steps % 120 === 0) { stuck = dist(now, progress) < 0.1 ? stuck + 1 : 0; progress = now; }
      if (stuck >= 3 || now[1] < -3.9) break;
    }
    expect(dist(p.foot(id), goal), JSON.stringify({ id, goal, at: p.foot(id), seconds, steps })).toBeLessThan(0.10);
  }
  return { seconds, travel, minY, maxY };
}
function navFollow(p: Physics, id: string, goals: Vec3[], nav: Navigation, speed = 2.1, cart = false) {
  let travel = 0, seconds = 0;
  for (const goal of goals) {
    const path = nav.path(p.foot(id), goal);
    expect(path.length || dist(p.foot(id), goal) < 1, `no route ${p.foot(id)} -> ${goal}`).toBeTruthy();
    const result = follow(p, id, [...path, goal], speed, cart); travel += result.travel; seconds += result.seconds;
  }
  return { travel, seconds };
}

it('S10 task, enemy, crew and full bed positions have clearance', () => withWorld('rescue', p => {
  for (const point of [R.spawn, R.entry, R.junction, R.mengStart, R.zhengStart, R.playerAssist, R.zhengAssist, R.carryEnd, R.injury,
    R.pickup, ...R.medicSpawns, R.medicalArrival, ...R.enemyEntries.flat(), ...R.enemyPosts.flat(), ...R.ammo, [-18, 0, 203], [-20, 0, 225]]) clear(p, point);
  for (const point of [R.junction, R.cover, R.pickup, ...R.transportVia]) clear(p, point, true);
}));

it('S10 fixed fire uses the established NE lane while the rescued patient has hard cover', () => withWorld('rescue', p => {
  expect(p.trace(R.establishedFire, eye(R.injury), undefined, true)).toBeNull();
  expect(p.trace(R.establishedFire, eye(R.junction, 1.1), undefined, true)).toBeNull();
  expect(p.trace(R.establishedFire, eye(R.cover, 1.1), undefined, true)?.id).toBe('solid:rescue-hard-cover');
  p.add('player', R.carryEnd);
  const result = follow(p, 'player', [R.injury]);
  expect(result.travel).toBeGreaterThan(5.8); expect(result.travel).toBeLessThan(6.2);
  const stations = [R.entry, R.junction];
  for (let group = 0; group < stations.length; group++) {
    const from = eye(stations[group]);
    const visible = R.enemyPosts[group].filter(t => !p.trace(from, eye(t), undefined, true));
    console.info('S10 actual firing lanes', { station: stations[group], visible });
    expect(visible.length).toBeGreaterThan(0);
  }
  for (const from of [[-18, 0, 203], [-20, 0, 225]] as Vec3[]) {
    const visible = R.enemyPosts.flat().filter(t => !p.trace(eye(from), eye(t), undefined, true));
    console.info('S10 allied covering station', { from, visible }); expect(visible.length).toBeGreaterThan(0);
  }
}));

it('S10 player, rescuers and every enemy entry have actual navigable routes', () => withWorld('rescue', (p, e) => {
  const nav = new Navigation(e.solids, R.bounds);
  p.add('player', R.spawn);
  const result = navFollow(p, 'player', [R.entry, R.junction, R.playerAssist, R.carryEnd, R.injury, R.pickup], nav, 3.2);
  console.info('S10 player operation route', result); p.remove('player');
  for (const [id, start, end] of [['meng', R.mengStart, R.junction], ['zheng', R.zhengStart, R.zhengAssist],
    ['medic-0', R.medicSpawns[0], R.cover], ['medic-1', R.medicSpawns[1], R.injury]] as const) {
    p.add(id, start); navFollow(p, id, [end], nav); p.remove(id);
  }
  p.add('covering-zheng', R.zhengStart); navFollow(p, 'covering-zheng', [[-18, 0, 203], [-20, 0, 225], R.zhengAssist], nav); p.remove('covering-zheng');
  for (let group = 0; group < R.enemyEntries.length; group++) for (let i = 0; i < R.enemyEntries[group].length; i++) {
    const id = `enemy-${group}-${i}`; p.add(id, R.enemyEntries[group][i]);
    navFollow(p, id, [R.enemyPosts[group][i]], nav, 1.5); p.remove(id);
  }
}));

it('S10 patient body can be carried into cover and both full beds traverse the medical road', () => withWorld('rescue', (p, e) => {
  p.addCart('meng', R.junction, -Math.PI / 2);
  const carry = follow(p, 'meng', [R.cover], 1.5, true);
  expect(carry.travel).toBeGreaterThan(23.8); expect(carry.maxY).toBeLessThan(0.05); p.remove('meng');
  const nav = new Navigation(e.solids, R.bounds, 1.3);
  for (const [i, start] of [R.cover, R.injury].entries()) {
    const id = `bed-${i}`, offset = i ? 6 : 0;
    p.addCart(id, start, -Math.PI / 2);
    const pickup: Vec3 = [R.pickup[0], 0, R.pickup[2] + offset];
    navFollow(p, id, [pickup], nav, 1.25, true);
    const road = follow(p, id, R.transportVia.map(v => [v[0], v[1], v[2] + offset]), 5.5, true);
    expect(road.travel).toBeGreaterThan(365); expect(road.maxY).toBeLessThan(0.05); expect(road.minY).toBeGreaterThan(-0.05);
    expect(road.seconds).toBeLessThan(80);
    console.info('S10 patient road clearance', { i, ...road }); p.remove(id);
  }
}));

it('S11 tasks, actual beds, doctor and nursing routes are unobstructed', () => withWorld('medical', (p, e) => {
  for (const point of [M.spawn, M.registration, M.equipment, M.recordDesk, M.zhouVisit, M.mengVisit, M.doctor, M.doctorTalk,
    M.xu, M.rest, M.radio, M.exit, M.nurse, ...M.nurseRoute, ...M.doctorRoute]) clear(p, point);
  clear(p, M.zhouBed, true); clear(p, M.mengBed, true);
  const nav = new Navigation(e.solids, M.bounds);
  p.add('player', M.spawn);
  const walk = navFollow(p, 'player', [M.registration, M.equipment, M.recordDesk, M.mengVisit, M.zhouVisit, M.doctorTalk, M.xu, M.rest, M.radio, M.exit], nav);
  console.info('S11 station routes', walk); p.remove('player');
  p.add('doctor', M.doctor); navFollow(p, 'doctor', [...M.doctorRoute, M.doctorTalk], nav); p.remove('doctor');
  p.add('nurse', M.nurse); navFollow(p, 'nurse', M.nurseRoute, nav);
}));

it('S11 curtain visibly progresses and resumes the same closed/open state', () => withWorld('medical', (_p, e) => {
  const curtain = e.root.getObjectByName('medical-treatment-curtain')!;
  e.setFacts?.([]); e.update(0, new Vector3());
  const start = curtain.scale.x; e.setFacts?.(['medical-curtain-closed']); e.update(0.1, new Vector3());
  expect(curtain.scale.x).toBeGreaterThan(start); expect(curtain.scale.x).toBeLessThan(1);
  for (let t = 0.2; t < 1.7; t += 0.1) e.update(t, new Vector3());
  expect(curtain.scale.x).toBeCloseTo(1, 6);
  e.setFacts?.(['medical-curtain-closed', 'medical-curtain-open']);
  for (let t = 1.7; t < 3.4; t += 0.1) e.update(t, new Vector3());
  expect(curtain.scale.x).toBeCloseTo(0.06, 6);
}));

it('S12 the real safe shoreline connects the west station to C03 without teleportation', () => withWorld('epilogue', (p, e) => {
  for (const point of [E.spawn, E.report, E.needs, ...E.shoreVia, E.reception, E.terminal, E.holdDoor, E.luo, E.zheng, ...E.workersSpawns, ...E.workersGoals]) clear(p, point);
  const nav = new Navigation(e.solids, E.bounds);
  p.add('player', E.spawn);
  const result = navFollow(p, 'player', [E.report, E.needs, ...E.shoreVia, E.reception, E.terminal, E.holdDoor], nav, 3.2);
  console.info('S12 actual shore route', result);
  expect(result.travel).toBeGreaterThan(405); expect(result.travel).toBeLessThan(470);
}));

it('S12 door blocks before opening, rises visibly, then all three workers physically pass through', () => withWorld('epilogue', (p, e) => {
  const door = e.root.getObjectByName('epilogue-reception-door')!;
  expect(p.trace(eye([-4, 0, 3]), eye([-4, 0, -2]), undefined, true)?.id).toBe('solid:epilogue-reception-door');
  e.setFacts?.([]); e.update(0, new Vector3());
  e.setFacts?.(['reception-door-open']); p.applyFacts(['reception-door-open']);
  e.update(0.1, new Vector3());
  expect(door.position.y).toBeGreaterThan(1.7); expect(door.position.y).toBeLessThan(5.2);
  for (let t = 0.2; t <= 2.2; t += 0.1) e.update(t, new Vector3());
  expect(door.position.y).toBeCloseTo(5.2, 6);
  expect(p.trace(eye([-4, 0, 3]), eye([-4, 0, -2]), undefined, true)).toBeNull();
  const nav = new Navigation(e.solids.filter(s => !s.openFact), E.bounds);
  for (let i = 0; i < E.workersSpawns.length; i++) {
    const id = `worker-${i}`; p.add(id, E.workersSpawns[i]);
    navFollow(p, id, [E.door, E.workersGoals[i]], nav);
    expect(p.foot(id)[2]).toBeLessThan(-4.9); p.remove(id);
  }
  const cartNav = new Navigation(e.solids.filter(s => !s.openFact), E.bounds, 1.3);
  p.addCart('supply-cart', [8, 0, 23], Math.PI);
  navFollow(p, 'supply-cart', [[-4, 0, 12], [-4, 0, 5], E.door, [-4, 0, -6]], cartNav, 1.25, true);
  expect(p.foot('supply-cart')[2]).toBeLessThan(-5.9);
}));

it('S10-S12 static geometry costs remain explicit and exclude browser-only labels and actors', () => {
  for (const id of ['rescue', 'medical', 'epilogue'] as const) {
    const e = buildEnvironment(id); let instances = 0, triangles = 0, batches = 0;
    e.root.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const count = o instanceof InstancedMesh ? o.count : 1;
      if (o instanceof InstancedMesh) { batches++; instances += count; }
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3 * count;
    });
    console.info('S10-S12 geometry', { id, solids: e.solids.length, batches, instances, triangles }); e.dispose();
  }
});
