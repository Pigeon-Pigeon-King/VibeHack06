import { beforeAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyIntent, distance, Simulation } from '@candidate/mission/Simulation';
import { carryFacts, nextStage, stageFor } from '@candidate/content/chapter-flow';
import { RELIEF } from '@candidate/content/relief-layout';
import { RESCUE } from '@candidate/content/rescue-layout';
import { EPILOGUE } from '@candidate/content/epilogue-layout';
import { SaveStore, SAVE_KEY_PREFIX } from '@candidate/persistence/SaveStore';
import { buildEnvironment } from '@candidate/presentation/environment';
import { initializePhysics, FIXED_DT as dt } from '@candidate/runtime/Physics';

// Independent acceptance driver. No mission, actor, health, position or damage
// mutation is used. Reconstructed snapshots are explicitly local recovery tests.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(process.env.QA_EVIDENCE_DIR ?? resolve(workspace, `artifacts/campaign-qa/replays/s09-s12-${Date.now()}`));
const candidate = process.env.CAMPAIGN_QA_CANDIDATE;
const lock = JSON.parse(readFileSync(resolve(workspace, 'artifacts/campaign-qa/candidate-lock.json'), 'utf8'));
const ids = ['relief', 'rescue', 'medical', 'epilogue'];
const manual = { relief: [6, 8], rescue: [2], medical: [0, 1, 2, 7], epilogue: [0, 2, 4, 6] };
const predecessorPath = process.env.CAMPAIGN_QA_S08_SAVE ?? resolve(workspace, 'artifacts/campaign-qa/s05-s08/fixtures/escort-terminal-natural.json');
const predecessorRaw = readFileSync(predecessorPath, 'utf8');
const predecessorSource = JSON.parse(readFileSync(predecessorPath.replace(/\.json$/, '.source.json'), 'utf8'));
if (createHash('sha256').update(predecessorRaw).digest('hex') !== predecessorSource.sha256) throw new Error('S08 predecessor hash mismatch');
const predecessor = JSON.parse(predecessorRaw).snapshot;
if (predecessor.mission.scenario !== 'escort' || !predecessor.mission.complete || predecessor.mission.failed) throw new Error('S08 predecessor is not a completed natural route');
const inheritedS09 = carryFacts('S09', predecessor.mission.facts);
const report = {
  schemaVersion: 1, runId: `s09-s12-${Date.now()}`, status: 'NOT_RUN',
  candidate: { root: candidate, sourceCommit: lock.sourceCommit, aggregateSha256: lock.aggregateSha256 },
  environment: { node: process.version, platform: process.platform, architecture: process.arch, runtime: 'headless Rapier + Simulation, public Intent at fixed 60 Hz' },
  predecessor: { path: predecessorPath, sha256: predecessorSource.sha256, scenario: predecessor.mission.scenario, phase: predecessor.mission.phase, simulationSeconds: predecessor.mission.elapsed, entry: 'B-group S08 standalone fresh public-Intent run with explicit prior story context; not S01-S08 first play' },
  limitations: ['No browser rendering or native keyboard evidence in this suite.', 'S09 carries B-group actually earned S08 facts; S08 started as a standalone chapter, not S01-S12 first play.', 'Headless wall time and simulation time are not human completion time.', 'Snapshot restoration is isolated recovery evidence, never first play.', 'A passive Ballistics.update wrapper records original impact returns unchanged; it does not change projectiles, health or inputs.'],
  cases: [], segmentRuns: [], terminalComparisons: [],
};
const normal = new Map();
mkdirSync(out, { recursive: true });
function json(name, value) {
  const path = resolve(out, name); mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`); renameSync(`${path}.tmp`, path);
}
function flush() { json('observations.json', report); }
flush();
class Memory {
  data = new Map();
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, v); }
  removeItem(k) { this.data.delete(k); }
}
function persisted(snapshot, elapsedBefore = 0) {
  const memory = new Memory(), store = new SaveStore(memory, () => 1793421764270);
  const chapter = { chapter: 'campaign', stage: stageFor(snapshot.mission.scenario).id, elapsedBefore };
  expect(store.save('campaign', snapshot, chapter)).toEqual({ ok: true });
  const loaded = store.load('campaign'); expect(loaded.warning).toBeUndefined();
  expect(loaded.save.snapshot).toEqual(snapshot);
  return { snapshot: loaded.save.snapshot, envelope: JSON.parse(memory.getItem(`${SAVE_KEY_PREFIX}campaign`)) };
}
function scene(id, snapshot, facts = []) {
  const env = buildEnvironment(id), sim = new Simulation(id, env.solids, snapshot, facts);
  return { env, sim, close() { this.sim.dispose(); this.env.dispose(); } };
}
function state(s) {
  return { phase: s.mission.phase, control: s.mission.control, complete: s.mission.complete, failed: s.mission.failed,
    elapsed: s.mission.elapsed, health: s.player.health, position: [...s.player.position], facts: [...s.mission.facts] };
}
function check(condition, message, s) { if (!condition) throw new Error(`${message}: ${JSON.stringify(state(s))}`); }
const probes = new WeakMap();
function impactProbe(s) {
  if (probes.has(s)) return probes.get(s);
  const probe = { impacts: [] }, original = s.ballistics.update.bind(s.ballistics);
  s.ballistics.update = delta => {
    const impacts = original(delta);
    probe.impacts = impacts.map(({ projectile, hit }) => ({ owner: projectile.owner, target: hit.id, damage: projectile.damage, projectileId: projectile.id, flightSeconds: projectile.age }));
    return impacts;
  };
  probes.set(s, probe); return probe;
}
function tick(s, input = {}) { impactProbe(s).impacts = []; s.step({ ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...input }); }
function confirmedAllyDamage(s, beforeHealth) {
  const groups = new Map();
  for (const impact of impactProbe(s).impacts) {
    if (!groups.has(impact.target)) groups.set(impact.target, []); groups.get(impact.target).push(impact);
  }
  const confirmed = [];
  for (const [target, impacts] of groups) {
    const actor = s.actors.find(a => a.id === target), owners = [...new Set(impacts.map(i => i.owner))];
    if (actor?.role === 'enemy' && beforeHealth.has(target) && actor.health < beforeHealth.get(target)
      && owners.length === 1 && s.actors.some(a => a.id === owners[0] && a.role === 'ally')) {
      confirmed.push({ owner: owners[0], target, before: beforeHealth.get(target), after: actor.health,
        healthDecrease: beforeHealth.get(target) - actor.health, impacts, phase: s.mission.phase, elapsed: s.mission.elapsed });
    }
  }
  return confirmed;
}
function idle(s, seconds, input = {}) { for (let i = 0; i < seconds / dt && !s.mission.failed && !s.mission.complete; i++) tick(s, input); }
function move(s, goal, seconds, input = {}) {
  let path = [];
  for (let i = 0; i < seconds / dt && !s.mission.failed && !s.mission.complete && distance(s.player.position, goal) > 0.22; i++) {
    if (distance(s.player.position, goal) < 1.4) path = [[...goal]];
    else if (!path.length) path = s.navigation.path(s.player.position, goal);
    while (path.length && distance(s.player.position, path[0]) < 0.20) path.shift();
    const next = path[0] ?? goal, yaw = Math.atan2(-(next[0] - s.player.position[0]), -(next[2] - s.player.position[2]));
    tick(s, { yaw, forward: 1, sprint: true, ...input });
  }
}
beforeAll(async () => {
  for (const name of ['src/mission/Simulation.ts', 'src/mission/Relief.ts', 'src/mission/Rescue.ts', 'src/mission/Medical.ts', 'src/mission/Epilogue.ts', 'src/content/chapter-flow.ts', 'src/persistence/SaveStore.ts']) {
    expect(createHash('sha256').update(readFileSync(resolve(candidate, name))).digest('hex'), name).toBe(lock.files[name].sha256);
  }
  await initializePhysics();
});
function acceptance(name, fn) {
  it(name, () => {
    const started = performance.now(), entry = { name, status: 'NOT_RUN' }; report.cases.push(entry); flush();
    try { entry.observations = fn(); entry.status = 'PASS'; }
    catch (error) { entry.status = 'FAIL'; entry.error = String(error?.stack ?? error); throw error; }
    finally { entry.wallSeconds = (performance.now() - started) / 1000; report.status = report.cases.some(x => x.status === 'FAIL') ? 'FAIL' : 'PASS'; flush(); }
  });
}

function play(id, variant, priorFacts = [], saved) {
  const run = scene(id, saved, priorFacts), started = performance.now(); let s = run.sim;
  const startTime = s.mission.elapsed, phases = [s.mission.phase], snapshots = {}, gates = {}, firstFacts = {};
  const metrics = { playerShots: 0, interactInputs: {}, coverInputs: 0, allyProjectileOwners: [], alliedDamageFrames: 0, confirmedAlliedDamageByOwner: {}, confirmedAlliedHits: [], maxCarryStrain: 0, maxParticipantStepMetres: 0, minHealth: s.player.health, maxEnemies: 0 };
  const allyOwners = new Set(), restoredPhases = new Set();
  let steps = 0, path = [], key = '', via1 = 0, via2 = 0;
  snapshots[s.mission.phase] = s.snapshot();
  try {
    while (!s.mission.complete && !s.mission.failed && steps < 1100 / dt) {
      const phase = s.mission.phase, staged = s.mission.control === 'staged';
      let goal = s.objective.point, stop = id === 'relief' ? (phase === 6 ? 0.35 : phase === 9 ? 0.01 : 1.5)
        : id === 'rescue' && [2, 4].includes(phase) ? 0.12 : id === 'epilogue' && phase >= 6 ? 0.35 : 0.65;
      if (id === 'relief' && [4, 5].includes(phase)) {
        const index = phase === 4 ? via1 : via2, route = RELIEF.crossingVia[phase - 4];
        if (index < route.length - 1 && distance(s.player.position, route[index]) < 0.6) {
          if (phase === 4) via1++; else via2++; path = [];
        }
        const current = phase === 4 ? via1 : via2; goal = route[current]; stop = current === 0 ? 0.35 : 1.5;
      }
      const fighting = s.mission.control === 'combat' && (id !== 'relief' || phase < 3);
      const resupply = fighting && s.player.ammo + s.player.reserve < (id === 'relief' ? 25 : 22);
      const ammo = id === 'relief' ? RELIEF.ammo : RESCUE.ammo;
      if (resupply) { goal = [...ammo].sort((a, b) => distance(a, s.player.position) - distance(b, s.player.position))[0]; stop = 0.35; }
      const newKey = `${phase}:${goal.join(',')}`; if (key !== newKey) { key = newKey; path = []; }
      if (id !== 'relief' && distance(s.player.position, goal) < 1.4) path = [[...goal]];
      else if (!path.length && distance(s.player.position, goal) > stop) path = s.navigation.path(s.player.position, goal);
      while (path.length && distance(s.player.position, path[0]) < (id === 'relief' ? 0.3 : 0.25)) path.shift();
      const next = path[0] ?? goal; let mx = 0, mz = 0;
      if (!staged && distance(s.player.position, goal) > stop) {
        const dx = next[0] - s.player.position[0], dz = next[2] - s.player.position[2], length = Math.max(0.001, Math.hypot(dx, dz));
        mx = dx / length; mz = dz / length;
        if (id === 'relief' && phase === 9) { const factor = Math.min(1, length / (6.3 * dt)); mx *= factor; mz *= factor; }
      }
      const target = fighting ? s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position)).find(a => distance(a.position, s.player.position) < 52 && s.physics.trace(s.playerEye, [a.position[0], a.position[1] + 1.62, a.position[2]], 'player')?.id === a.id) : undefined;
      let yaw = mx || mz ? Math.atan2(-mx, -mz) : s.player.yaw, pitch = 0;
      if (target) { const dx = target.position[0] - s.player.position[0], dz = target.position[2] - s.player.position[2]; yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(target.position[1] + 1.62 - s.playerEye[1], Math.hypot(dx, dz)); }
      const fire = !!target && (id === 'relief' || s.mission.elapsed > 10 || s.player.health < 60);
      const interact = steps % 12 === 0 && (manual[id].includes(phase) || resupply && ammo.some(p => distance(p, s.player.position) < 1.5));
      if (manual[id].includes(phase) && s.objective.interaction && !gates[phase]) gates[phase] = s.snapshot();
      const healthBefore = new Map(s.actors.filter(a => a.role === 'enemy').map(a => [a.id, a.health]));
      const participantBefore = new Map(s.actors.filter(a => a.role !== 'enemy').map(a => [a.id, [...a.position]]));
      const noPlayerBullet = !s.ballistics.projectiles.some(p => p.owner === 'player'), ammoBefore = s.player.ammo;
      const input = { yaw, pitch, forward: -Math.sin(yaw) * mx - Math.cos(yaw) * mz, right: Math.cos(yaw) * mx - Math.sin(yaw) * mz,
        sprint: !target && s.mission.control !== 'cooperative', ads: !!target, fire, reload: fighting && !s.player.ammo && !s.player.reload,
        cover: id === 'rescue' && steps % 120 === 0, interact, skip: variant === 'skip' };
      tick(s, input); steps++; run.env.setFacts?.(s.mission.facts);
      if (interact) metrics.interactInputs[phase] = (metrics.interactInputs[phase] ?? 0) + 1;
      if (input.cover) metrics.coverInputs++;
      if (s.player.ammo < ammoBefore) metrics.playerShots += ammoBefore - s.player.ammo;
      for (const p of s.ballistics.projectiles) if (p.owner !== 'player' && s.actors.some(a => a.id === p.owner && a.role === 'ally')) allyOwners.add(p.owner);
      if (!fire && noPlayerBullet && s.actors.some(a => a.role === 'enemy' && a.health < (healthBefore.get(a.id) ?? a.health))) metrics.alliedDamageFrames++;
      for (const hit of confirmedAllyDamage(s, healthBefore)) {
        metrics.confirmedAlliedDamageByOwner[hit.owner] = (metrics.confirmedAlliedDamageByOwner[hit.owner] ?? 0) + hit.healthDecrease;
        metrics.confirmedAlliedHits.push({ ...hit, noPlayerFireOrBullet: !fire && noPlayerBullet, afterSnapshotRestore: restoredPhases.size > 0 });
      }
      for (const a of s.actors.filter(a => a.role !== 'enemy')) metrics.maxParticipantStepMetres = Math.max(metrics.maxParticipantStepMetres, distance(participantBefore.get(a.id), a.position));
      if (variant !== 'skip') check(metrics.maxParticipantStepMetres < 0.14, 'natural participant movement became discontinuous', s);
      metrics.minHealth = Math.min(metrics.minHealth, s.player.health); metrics.maxEnemies = Math.max(metrics.maxEnemies, s.aliveEnemies.length);
      for (const fact of s.mission.facts) if (!(fact in firstFacts)) firstFacts[fact] = s.mission.elapsed;
      if (id === 'rescue' && phase === 4) {
        const p = s.player.position;
        metrics.maxCarryStrain = Math.max(metrics.maxCarryStrain, distance(s.actors.find(a => a.id === 'meng').position, [p[0] + 2, p[1], p[2]]), distance(s.actors.find(a => a.id === 'zheng').position, [p[0] + 4, p[1], p[2]]));
      }
      if (phase !== s.mission.phase) {
        phases.push(s.mission.phase); snapshots[s.mission.phase] = persisted(s.snapshot()).snapshot; path = [];
        if (variant === 'restore' && !s.mission.complete && !restoredPhases.has(s.mission.phase)) {
          const snapshot = snapshots[s.mission.phase], replacement = new Simulation(id, run.env.solids, snapshot);
          expect(replacement.snapshot()).toEqual(snapshot); expect(replacement.ballistics.projectiles).toHaveLength(0);
          s.dispose(); s = replacement; run.sim = replacement; restoredPhases.add(s.mission.phase);
        }
      }
    }
    check(s.mission.complete && !s.mission.failed, 'public Intent route did not reach the authored outcome', s);
    const end = persisted(s.snapshot()).snapshot;
    metrics.allyProjectileOwners = [...allyOwners];
    const result = { id, variant, startPhase: saved?.mission.phase ?? 0, simulationSeconds: s.mission.elapsed - startTime, wallSeconds: (performance.now() - started) / 1000, phases, firstFacts, metrics, end, snapshots, gates, restoredPhases: [...restoredPhases] };
    report.segmentRuns.push({ ...result, snapshots: undefined, gates: undefined }); flush(); return result;
  } finally { run.close(); }
}
function endSemantics(snapshot) {
  return { phase: snapshot.mission.phase, control: snapshot.mission.control, complete: snapshot.mission.complete, failed: snapshot.mission.failed,
    facts: [...snapshot.mission.facts].sort(), health: snapshot.player.health, height: snapshot.player.height,
    actors: snapshot.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id, name: a.name, role: a.role, health: a.health, down: a.down, safe: a.safe })) };
}
function normalResult(id) {
  if (normal.has(id)) return normal.get(id);
  const data = JSON.parse(readFileSync(resolve(out, `natural/${id}.json`), 'utf8'));
  expect(data.aggregateSha256).toBe(lock.aggregateSha256); return data.result;
}
acceptance('normal S09 to S12 carries only actually earned facts and switches viewpoint after rescue', () => {
  let facts = inheritedS09, elapsedBefore = 0;
  const sequence = [];
  for (const id of ids) {
    const result = play(id, 'normal', facts); normal.set(id, result);
    json(`natural/${id}.json`, { aggregateSha256: lock.aggregateSha256, provenance: 'public-Intent chapter entry, no mutation', result });
    for (const [phase, snapshot] of Object.entries(result.snapshots)) json(`checkpoints/${id}-${phase}.json`, persisted(snapshot, elapsedBefore).envelope);
    sequence.push({ id, player: result.end.player.name, seconds: result.simulationSeconds, carriedIn: facts });
    if (id === 'relief') {
      expect(result.end.mission.facts).toContain('zhou-wants-to-live'); expect(result.end.mission.facts).not.toContain('rescue-zhou-wounded');
      expect(result.firstFacts['relief-posts-held']).toBeLessThan(result.firstFacts['zhou-gives-up-post']);
      expect(result.firstFacts['zhou-accepts-help']).toBeLessThan(result.firstFacts['zhou-wants-to-live']);
      expect(result.firstFacts['zhou-wants-to-live']).toBeLessThan(result.firstFacts['zhou-family-reply-queued']);
      expect(result.metrics.confirmedAlliedHits.some(hit => hit.noPlayerFireOrBullet && hit.phase >= 4)).toBe(true);
    }
    if (id === 'rescue') {
      expect(result.end.player.name).toContain('周延'); expect(result.end.mission.facts).toContain('zhou-wants-to-live'); expect(result.end.mission.facts).not.toContain('zhou-death-confirmed'); expect(result.metrics.alliedDamageFrames).toBeGreaterThan(0);
      expect(result.metrics.confirmedAlliedHits.some(hit => hit.owner === 'zheng' && hit.noPlayerFireOrBullet)).toBe(true);
      expect(result.firstFacts['rescue-meng-under-cover']).toBeLessThan(result.firstFacts['rescue-zhou-wounded']);
      expect(result.firstFacts['rescue-zhou-wounded']).toBeLessThan(result.firstFacts['zhou-requested-rescue']);
      expect(result.firstFacts['zhou-requested-rescue']).toBeLessThan(result.firstFacts['rescue-both-received']);
    }
    if (id === 'medical') {
      expect(result.end.player.name).toContain('陆闻川'); expect(result.end.mission.facts).toContain('zhou-death-confirmed'); expect(result.end.mission.facts).toContain('meng-treatment-continues');
      expect(result.firstFacts['medical-zhou-responsive']).toBeLessThan(result.firstFacts['medical-treatment-attempted']);
      expect(result.firstFacts['medical-treatment-attempted']).toBeLessThan(result.firstFacts['zhou-death-confirmed']);
    }
    const next = nextStage(id); elapsedBefore += result.end.mission.elapsed;
    if (next) { facts = carryFacts(next.id, result.end.mission.facts); expect(facts.every(f => result.end.mission.facts.includes(f))).toBe(true); }
  }
  expect(nextStage('epilogue')).toBeUndefined(); return { sequence, simulationSeconds: elapsedBefore, firstPlayScope: 'S09-S12 headless only; actually earned S08 predecessor facts supplied from B-group standalone natural run' };
});
acceptance('skip and every phase checkpoint restore converge on outcome, control, height and participant identity', () => {
  const comparisons = [];
  for (const variant of ['skip', 'restore']) {
    let facts = inheritedS09;
    for (const id of ids) {
      const result = play(id, variant, facts), reference = normalResult(id).end;
      expect(endSemantics(result.end)).toEqual(endSemantics(reference));
      const positionDeltas = result.end.actors.filter(a => a.role !== 'enemy').map(a => ({ id: a.id, metres: distance(a.position, reference.actors.find(b => b.id === a.id).position), remainingGoals: a.goals.length, referenceRemainingGoals: reference.actors.find(b => b.id === a.id).goals.length }));
      comparisons.push({ id, variant, positionDeltas, playerPositionDelta: distance(result.end.player.position, reference.player.position), crouched: [reference.player.crouched, result.end.player.crouched] });
      const next = nextStage(id); if (next) facts = carryFacts(next.id, result.end.mission.facts);
    }
  }
  report.terminalComparisons = comparisons; return comparisons;
});
acceptance('manual E gates reject idle and Enter; allowed E remains necessary', () => {
  const observations = [];
  for (const id of ids) for (const phase of manual[id]) {
    const natural = normalResult(id); let source = natural.gates[phase];
    let promptSource = 'normal route, before E input';
    if (!source) {
      // Movement and E can cross the interaction radius in one fixed tick,
      // leaving no pre-input prompt sample. Re-approach that real checkpoint
      // with movement only; this remains explicit local recovery evidence.
      const approach = scene(id, persisted(natural.snapshots[phase]).snapshot);
      try {
        move(approach.sim, approach.sim.objective.point, 15); idle(approach.sim, 0.25);
        expect(approach.sim.mission.phase).toBe(phase); expect(approach.sim.objective.interaction).not.toBe('');
        source = persisted(approach.sim.snapshot()).snapshot; promptSource = 'actual normal checkpoint restored, approached using public movement without E';
      } finally { approach.close(); }
    }
    expect(source, `${id}/${phase} has an actually reached prompt`).toBeDefined();
    const entry = scene(id, persisted(natural.snapshots[phase]).snapshot);
    let unavailableEChecked = false;
    try {
      if (!entry.sim.objective.interaction) {
        tick(entry.sim, { interact: true, skip: true });
        expect(entry.sim.mission.phase, `${id}/${phase} E cannot bypass absent readiness or distance`).toBe(phase);
        unavailableEChecked = true;
      }
    } finally { entry.close(); }
    const run = scene(id, persisted(source).snapshot);
    try {
      idle(run.sim, 2); expect(run.sim.mission.phase).toBe(phase);
      idle(run.sim, 2, { skip: true }); expect(run.sim.mission.phase).toBe(phase);
      // A combat wave may withdraw a prompt during the deliberate wait. Test
      // the positive E branch from the same actually reached source snapshot.
      const positive = scene(id, persisted(source).snapshot);
      try {
        tick(positive.sim, { interact: true });
        expect(positive.sim.mission.phase, `${id}/${phase} E must act at the prompt`).toBe(phase + 1);
        observations.push({ id, phase, promptSource, unavailableEChecked, idleAndEnterSeconds: 4, promptAfterDelay: !!run.sim.objective.interaction, enteredPhase: positive.sim.mission.phase });
      } finally { positive.close(); }
    } finally { run.close(); }
  }
  return observations;
});
acceptance('S09 restored covering fire and S10 Q before after restore cause owner attributed health loss without player shots', () => {
  const observations = [];
  const collect = (run, seconds, untilOwner) => {
    const hits = [], ammo = run.sim.player.ammo;
    for (let frame = 0; frame < seconds / dt && !run.sim.mission.failed; frame++) {
      const health = new Map(run.sim.actors.filter(a => a.role === 'enemy').map(a => [a.id, a.health]));
      tick(run.sim, { crouch: true }); hits.push(...confirmedAllyDamage(run.sim, health));
      if (hits.some(hit => !untilOwner || hit.owner === untilOwner)) break;
    }
    expect(run.sim.player.ammo).toBe(ammo); expect(run.sim.hits).toBe(0); expect(run.sim.kills).toBe(0);
    return hits;
  };
  const reliefSource = normalResult('relief').snapshots[4], relief = scene('relief', persisted(reliefSource).snapshot);
  try {
    const playerHits = relief.sim.hits, kills = relief.sim.kills;
    // The earlier chapter's real player hits remain in this checkpoint. Verify
    // their counters do not increase while restored allies provide the damage.
    const hits = [], ammo = relief.sim.player.ammo;
    for (let frame = 0; frame < 25 / dt && !relief.sim.mission.failed && !hits.length; frame++) {
      const health = new Map(relief.sim.actors.filter(a => a.role === 'enemy').map(a => [a.id, a.health]));
      tick(relief.sim, { crouch: true }); hits.push(...confirmedAllyDamage(relief.sim, health));
    }
    expect(hits.length).toBeGreaterThan(0); expect(relief.sim.player.ammo).toBe(ammo);
    expect(relief.sim.hits).toBe(playerHits); expect(relief.sim.kills).toBe(kills);
    observations.push({ branch: 'S09 actual phase4 checkpoint restore, player never fires', hits, end: state(relief.sim) });
  } finally { relief.close(); }
  const rescue = scene('rescue', undefined, carryFacts('S10', normalResult('relief').end.mission.facts));
  try {
    move(rescue.sim, [-6, 0, 189], 5); expect(distance(rescue.sim.player.position, [-6, 0, 189])).toBeLessThan(0.3);
    const zhengStart = [...rescue.sim.actors.find(a => a.id === 'zheng').position];
    const beforeQ = collect(rescue, 2, 'zheng'); expect(beforeQ).toEqual([]);
    expect(distance(zhengStart, rescue.sim.actors.find(a => a.id === 'zheng').position)).toBeLessThan(0.02);
    tick(rescue.sim, { cover: true, crouch: true }); const afterQ = persisted(rescue.sim.snapshot()).snapshot;
    expect(afterQ.mission.facts).toContain('rescue-cover-requested');
    const normalHits = collect(rescue, 25, 'zheng'); expect(normalHits.some(hit => hit.owner === 'zheng')).toBe(true);
    observations.push({ branch: 'S10 before Q then normal Q, player never fires', beforeQ, hits: normalHits, zhengMovedMetres: distance(zhengStart, rescue.sim.actors.find(a => a.id === 'zheng').position) });
    const restored = scene('rescue', afterQ);
    try {
      expect(restored.sim.snapshot()).toEqual(afterQ); expect(restored.sim.ballistics.projectiles).toHaveLength(0);
      const hits = collect(restored, 25, 'zheng'); expect(hits.some(hit => hit.owner === 'zheng')).toBe(true);
      observations.push({ branch: 'S10 actual post-Q snapshot restored, no repeated Q or player fire', hits, zhengMovedMetres: distance(zhengStart, restored.sim.actors.find(a => a.id === 'zheng').position) });
    } finally { restored.close(); }
  } finally { rescue.close(); }
  return observations;
});
acceptance('ordinary S09 and S10 combat defeat stays separate from fixed story injury and retry restores playable control', () => {
  const observations = [];
  for (const id of ['relief', 'rescue']) {
    const run = scene(id); let failed;
    try {
      move(run.sim, id === 'relief' ? RELIEF.entryHold : RESCUE.entry, 25, { skip: true, interact: true });
      idle(run.sim, 120, { skip: true, interact: true });
      expect(run.sim.mission.failed, `${id} exposed player should suffer real enemy fire`).toBe(true);
      expect(run.sim.player.health).toBe(0); expect(run.sim.mission.complete).toBe(false);
      expect(run.sim.mission.facts).not.toContain('zhou-death-confirmed'); expect(run.sim.mission.facts).not.toContain('rescue-zhou-wounded');
      failed = state(run.sim); const checkpoint = structuredClone(run.sim.checkpoint);
      expect(checkpoint.mission.failed).toBe(false); const retry = scene(id, checkpoint);
      try {
        expect(retry.sim.snapshot()).toEqual(checkpoint); expect(retry.sim.ballistics.projectiles).toHaveLength(0);
        const position = [...retry.sim.player.position], ammo = retry.sim.player.ammo;
        tick(retry.sim, { fire: true }); expect(retry.sim.player.ammo).toBe(ammo - 1);
        idle(retry.sim, 1, { forward: 1 });
        expect(distance(position, retry.sim.player.position)).toBeGreaterThan(0.5); expect(retry.sim.mission.failed).toBe(false);
        observations.push({ id, failed, checkpointPhase: checkpoint.mission.phase, retryControl: state(retry.sim), repeatedFullRoute: 'NOT_RUN; independent normal chain is recorded separately' });
      } finally { retry.close(); }
    } finally { run.close(); }
  }
  return observations;
});
acceptance('S10 carrying can reverse and resume while occupied hands reject firing and reload', () => {
  const source = normalResult('rescue').snapshots[4], run = scene('rescue', persisted(source).snapshot);
  try {
    const before = run.sim.snapshot();
    idle(run.sim, 2, { yaw: Math.PI / 2, forward: -1, fire: true, reload: true, skip: true });
    expect(run.sim.mission.phase).toBe(4); expect(run.sim.player.ammo).toBe(before.player.ammo); expect(run.sim.player.reserve).toBe(before.player.reserve);
    expect(run.sim.ballistics.fired).toBe(0); expect(run.sim.player.position[0] - before.player.position[0]).toBeGreaterThan(1.5);
    for (const id of ['meng', 'zheng']) expect(run.sim.actors.find(a => a.id === id).position[0] - before.actors.find(a => a.id === id).position[0]).toBeGreaterThan(1);
    const reversed = state(run.sim); move(run.sim, RESCUE.carryEnd, 40, { fire: true, reload: true });
    const playerArrived = { state: state(run.sim), participants: run.sim.actors.filter(a => ['meng', 'zheng'].includes(a.id)).map(a => ({ id: a.id, position: [...a.position] })) };
    // Reaching the player's handle is not sufficient: the partner and patient
    // must physically catch up before the cooperative phase may finish.
    idle(run.sim, 1, { fire: true, reload: true });
    json('carry-reverse-diagnostic.json', { reversed, playerArrived, afterWaiting: state(run.sim) });
    expect(run.sim.mission.phase).toBe(5); expect(run.sim.has('rescue-meng-under-cover')).toBe(true);
    expect(run.sim.has('rescue-zhou-wounded')).toBe(false);
    return { sourcePhase: 4, reversed, reachedCover: state(run.sim), participantPositions: run.sim.actors.filter(a => ['meng', 'zheng'].includes(a.id)).map(a => ({ id: a.id, position: a.position })) };
  } finally { run.close(); }
});
acceptance('S12 leaving the held door persists a stopped queue; return resumes four actual arrivals', () => {
  const source = normalResult('epilogue').snapshots[7], run = scene('epilogue', persisted(source).snapshot);
  const participants = ['worker-0', 'worker-1', 'worker-2', 'supply-cart'];
  const positions = s => participants.map(id => ({ id, position: [...s.actors.find(a => a.id === id).position] }));
  try {
    idle(run.sim, 3); move(run.sim, [-9, 0, 5], 5); tick(run.sim);
    expect(distance(run.sim.player.position, EPILOGUE.holdDoor)).toBeGreaterThan(1.3);
    const stopped = positions(run.sim); idle(run.sim, 20);
    stopped.forEach(a => expect(distance(a.position, run.sim.actors.find(b => b.id === a.id).position)).toBeLessThan(0.01));
    const snapshot = persisted(run.sim.snapshot()).snapshot, replacement = new Simulation('epilogue', run.env.solids, snapshot);
    expect(replacement.snapshot()).toEqual(snapshot); run.sim.dispose(); run.sim = replacement;
    idle(run.sim, 5); stopped.forEach(a => expect(distance(a.position, run.sim.actors.find(b => b.id === a.id).position)).toBeLessThan(0.01));
    expect(run.sim.mission.phase).toBe(7); expect(run.sim.mission.complete).toBe(false);
    move(run.sim, EPILOGUE.holdDoor, 5); idle(run.sim, 60);
    expect(run.sim.mission.complete).toBe(true);
    for (const id of participants) { const a = run.sim.actors.find(a => a.id === id); expect(a.safe).toBe(true); expect(a.goals).toEqual([]); expect(a.position[2]).toBeLessThan(-4.8); }
    return { leftForSeconds: 20, restoredLeftForSeconds: 5, stopped, finalPositions: positions(run.sim), end: state(run.sim) };
  } finally { run.close(); }
});
