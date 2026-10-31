import { beforeAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Vec3 } from '../../src/contracts';
import { distance, emptyIntent, Simulation } from '../../src/mission/Simulation';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, FIXED_DT as dt } from '../../src/runtime/Physics';

beforeAll(initializePhysics);
const copy = (p: Vec3): Vec3 => [...p];
const norm = (p: Vec3) => Math.hypot(...p);
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const actor = (s: Simulation, id: string) => s.actors.find(a => a.id === id)!;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// Read-only distance from a swept projectile segment to the vertical capsule
// axis used for the target. The actual Rapier trace remains authoritative.
function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let s = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) return norm(r);
  if (a < 1e-12) t = clamp(f / e);
  else {
    const c = dot(d1, r);
    if (e < 1e-12) s = clamp(-c / a);
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      if (denom !== 0) s = clamp((b * f - c * e) / denom);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return norm(p1.map((v, i) => v + d1[i] * s - p2[i] - d2[i] * t) as Vec3);
}

it('records the unchanged 25-second Q request, projectiles and actual target movement', () => {
  const wallStart = performance.now(), startedAt = new Date().toISOString();
  const environment = buildEnvironment('rescue'), sim = new Simulation('rescue', environment.solids);
  const sourceFiles = ['src/mission/Simulation.ts', 'src/actors/CombatTactics.ts', 'src/combat/Ballistics.ts',
    'src/runtime/Physics.ts', 'src/mission/Rescue.ts', 'tests/finale-interactions.test.ts'];
  const sourceHashes = Object.fromEntries(sourceFiles.map(path => [path, hash(readFileSync(path, 'utf8'))]));
  const initialDigest = hash(JSON.stringify(sim.snapshot()));
  const initialSeed = sim.random.state;
  let frame = 0, qTime: number | null = null;
  let phase = 'approach';
  let frameStart = new Map<string, Vec3>();
  let lastVelocity = new Map<string, Vec3>();
  const shots: any[] = [], shotById = new Map<number, any>(), snapshots: any[] = [], inputs: any[] = [];
  const damageEvents: any[] = [];
  const playerAmmo = sim.player.ammo;
  let initialHealth = new Map<string, number>();
  let ownProjectileSeen = false, actualDamage = false, shotEvents = 0, beforeShots = 0;
  const state = (id: string) => {
    const a = actor(sim, id), body = sim.physics.bodies.get(id);
    return { id, position: copy(a.position), health: a.health, down: a.down,
      height: body?.height, combat: a.combat?.phase, crouched: a.combat?.crouched,
      moving: a.combat?.moving, goals: a.goals.map(copy), lastVelocity: lastVelocity.get(id) ?? [0, 0, 0] };
  };
  const originalFire = sim.ballistics.fire.bind(sim.ballistics);
  // Observers call the original methods exactly once, without altering args,
  // RNG, intent, health, position, cooldown, target, projectile or returned hits.
  sim.ballistics.fire = (owner, position, direction, damage, speed) => {
    const bullet = originalFire(owner, position, direction, damage, speed);
    if (owner === 'zheng') {
      const zheng = actor(sim, 'zheng'), targetId = zheng.combat?.targetId;
      const target = targetId ? actor(sim, targetId) : undefined;
      const height = target ? sim.physics.bodies.get(target.id)?.height ?? 1.8 : 1.8;
      const targetPoint: Vec3 | undefined = target ? [target.position[0], target.position[1] + height - 0.14, target.position[2]] : undefined;
      const range = targetPoint ? norm(sub(targetPoint, position)) : null;
      const velocity = targetId ? lastVelocity.get(targetId) ?? [0, 0, 0] : [0, 0, 0];
      const unit = targetPoint && range ? sub(targetPoint, position).map(v => v / range) as Vec3 : [0, 0, 0] as Vec3;
      const lateralVelocity = norm(velocity.map((v, i) => v - dot(velocity as Vec3, unit) * unit[i]) as Vec3);
      const record = { id: bullet.id, at: sim.mission.elapsed, sinceQ: qTime === null ? null : sim.mission.elapsed - qTime,
        frame, targetId, shooter: state(owner), target: targetId ? state(targetId) : null,
        muzzle: copy(position), targetPoint, direction: copy(direction), velocity: copy(bullet.velocity),
        speed: norm(bullet.velocity), range, estimatedFlightSeconds: range === null ? null : range / norm(bullet.velocity),
        lateralSpeed: lateralVelocity, expectedLateralTravel: range === null ? null : lateralVelocity * range / norm(bullet.velocity),
        staticBlockAtFire: targetPoint ? sim.physics.trace(position, targetPoint, owner, true)?.id ?? null : null,
        anyBlockAtFire: targetPoint ? sim.physics.trace(position, targetPoint, owner)?.id ?? null : null,
        closest: null, impact: null, frames: [] };
      shots.push(record); shotById.set(bullet.id, record);
    }
    return bullet;
  };
  const originalUpdate = sim.ballistics.update.bind(sim.ballistics);
  sim.ballistics.update = (delta) => {
    const tracked = sim.ballistics.projectiles.filter(p => p.owner === 'zheng').map(p => ({ p, start: copy(p.position) }));
    const impacts = originalUpdate(delta);
    for (const { p, start } of tracked) {
      const record = shotById.get(p.id);
      if (!record) continue;
      const target = record.targetId ? actor(sim, record.targetId) : undefined;
      const body = target ? sim.physics.bodies.get(target.id) : undefined;
      const impact = impacts.find(hit => hit.projectile.id === p.id);
      if (impact) record.impact = { id: impact.hit.id, point: copy(impact.hit.point), time: sim.mission.elapsed,
        age: p.age, distance: norm(sub(impact.hit.point, record.muzzle)), targetAtImpact: target ? state(target.id) : null };
      if (target && body) {
        const low: Vec3 = [target.position[0], target.position[1] + 0.28, target.position[2]];
        const high: Vec3 = [target.position[0], target.position[1] + body.height - 0.28, target.position[2]];
        const separation = segmentDistance(start, p.position, low, high) - 0.28;
        const previous = frameStart.get(target.id) ?? target.position;
        const actualVelocity = sub(target.position, previous).map(v => v / dt) as Vec3;
        const sample = { age: p.age, at: sim.mission.elapsed, segment: [start, copy(p.position)],
          target: state(target.id), actualVelocity, separation };
        if (!record.closest || separation < record.closest.separation) record.closest = sample;
        if (p.age < 0.25 || impact) record.frames.push(sample);
      }
    }
    return impacts;
  };
  const step = (input: typeof emptyIntent) => {
    inputs.push([phase, input.yaw, input.forward, input.sprint, input.crouch, input.cover]);
    frameStart = new Map(sim.actors.map(a => [a.id, copy(a.position)]));
    const previousHealth = new Map(sim.actors.map(a => [a.id, a.health]));
    sim.step(input);
    lastVelocity = new Map(sim.actors.map(a => [a.id, sub(a.position, frameStart.get(a.id) ?? a.position).map(v => v / dt) as Vec3]));
    for (const a of sim.actors) if (a.health < (previousHealth.get(a.id) ?? a.health)) damageEvents.push({ at: sim.mission.elapsed, id: a.id, before: previousHealth.get(a.id), after: a.health });
    if (frame % 60 === 0) snapshots.push({ at: sim.mission.elapsed, phase, missionPhase: sim.mission.phase,
      player: { position: copy(sim.player.position), health: sim.player.health }, actors: sim.actors.filter(a => a.id === 'zheng' || a.role === 'enemy').map(a => state(a.id)) });
    frame++;
  };
  let zhengStart: Vec3 = copy(actor(sim, 'zheng').position);
  try {
    const target: Vec3 = [-6, 0, 189];
    let path = sim.navigation.path(sim.player.position, target);
    for (let i = 0; i < 5 / dt && distance(sim.player.position, target) > 0.25 && !sim.mission.failed; i++) {
      if (distance(sim.player.position, target) < 1.4) path = [copy(target)];
      while (path.length && distance(sim.player.position, path[0]) < 0.20) path.shift();
      const next = path[0] ?? target;
      const yaw = Math.atan2(-(next[0] - sim.player.position[0]), -(next[2] - sim.player.position[2]));
      step({ ...emptyIntent, yaw, forward: 1, sprint: true });
    }
    expect(distance(sim.player.position, target)).toBeLessThan(0.3);
    zhengStart = copy(actor(sim, 'zheng').position);
    phase = 'before-Q';
    for (let i = 0; i < 2 / dt; i++) {
      step({ ...emptyIntent, yaw: sim.player.yaw, crouch: true });
      if (sim.ballistics.projectiles.some(p => p.owner === 'zheng')) beforeShots++;
    }
    expect(distance(zhengStart, actor(sim, 'zheng').position)).toBeLessThan(0.02);
    expect(beforeShots).toBe(0);
    initialHealth = new Map(sim.aliveEnemies.map(a => [a.id, a.health]));
    qTime = sim.mission.elapsed; phase = 'after-Q';
    for (let i = 0; i < 25 / dt && !sim.mission.failed && !actualDamage; i++) {
      step({ ...emptyIntent, yaw: sim.player.yaw, crouch: true, cover: i === 0 });
      if (sim.ballistics.projectiles.some(p => p.owner === 'zheng')) ownProjectileSeen = true;
      if (sim.events.some(e => e.type === 'shot' && e.position && distance(e.position, actor(sim, 'zheng').position) < 0.1)) shotEvents++;
      actualDamage = sim.actors.some(a => a.role === 'enemy' && initialHealth.has(a.id) && a.health < initialHealth.get(a.id)!);
    }
    expect(actualDamage, 'unchanged existing Q requirement: an allied projectile damages a real enemy').toBe(true);
  } finally {
    const result = { kind: 'read-only-instrumented-public-intent-diagnostic', startedAt,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes,
      initialDigest, initialSeed,
      dt, command: '/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run --config artifacts/npc-pace/q-cover-diagnostic.config.ts',
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      inputMode: 'generated public Intent; no state injection; fire/update observers return unchanged results',
      qTime, simulatedSeconds: sim.mission.elapsed, postQSeconds: qTime === null ? null : sim.mission.elapsed - qTime,
      wallSeconds: (performance.now() - wallStart) / 1000, actualDamage, ownProjectileSeen, shotEvents,
      zhengDistance: distance(zhengStart, actor(sim, 'zheng').position), playerAmmoSpent: playerAmmo - sim.player.ammo,
      failed: sim.mission.failed, playerHealth: sim.player.health, damageEvents,
      initialEnemyHealth: Object.fromEntries(initialHealth), shots, snapshots,
      inputColumns: ['phase', 'yaw', 'forward', 'sprint', 'crouch', 'cover'], inputs,
      final: sim.snapshot(), limitations: ['No render/browser/manual play evidence', 'Projectile capsule distance is diagnostic geometry; actual impacts come from production Rapier'] };
    writeFileSync('artifacts/npc-pace/q-cover-diagnostic.json', JSON.stringify(result, null, 2));
    console.info('Q_DIAGNOSTIC', JSON.stringify({ actualDamage, ownProjectileSeen, shotEvents, simulatedSeconds: result.simulatedSeconds,
      postQSeconds: result.postQSeconds, wallSeconds: result.wallSeconds, damageEvents,
      shots: shots.map(s => ({ id: s.id, t: s.at, target: s.targetId, targetSpeed: norm(s.target.lastVelocity),
        lateralSpeed: s.lateralSpeed, flight: s.estimatedFlightSeconds, expectedLateralTravel: s.expectedLateralTravel,
        closest: s.closest && { age: s.closest.age, separation: s.closest.separation, height: s.closest.target.height, actualVelocity: s.closest.actualVelocity },
        impact: s.impact && { id: s.impact.id, age: s.impact.age } })) }));
    sim.dispose(); environment.dispose();
  }
});
