import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Simulation, emptyIntent, distance } from 'candidate-src/mission/Simulation.ts';
import { buildEnvironment } from 'candidate-src/presentation/environment.ts';
import { initializePhysics, FIXED_DT } from 'candidate-src/runtime/Physics.ts';
import { SaveStore, SAVE_KEY_PREFIX } from 'candidate-src/persistence/SaveStore.ts';
import { nextStage, carryFacts } from 'candidate-src/content/chapter-flow.ts';
import { FRONTGATE as G } from 'candidate-src/content/frontgate-layout.ts';
import { FLANK as F } from 'candidate-src/content/flank-layout.ts';
import { ESCORT as E } from 'candidate-src/content/escort-layout.ts';

beforeAll(initializePhysics);
const output = process.env.QA_EVIDENCE_DIR;
const details = [];
class Memory {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
function fixture(label, scenario) {
  const memory = new Memory();
  memory.setItem(`${SAVE_KEY_PREFIX}${scenario}`, readFileSync(resolve(output, 'fixtures', `${label}.json`), 'utf8'));
  const loaded = new SaveStore(memory).load(scenario);
  expect(loaded.warning).toBeUndefined();
  expect(loaded.save?.snapshot.mission.scenario).toBe(scenario);
  return loaded.save.snapshot;
}
function step(s, input = {}) { s.step({ ...emptyIntent, yaw: s.player.yaw, pitch: s.player.pitch, ...input }); }
function wait(s, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_DT) && !s.mission.complete && !s.mission.failed; i++) step(s, input);
}
function walk(s, target, { tolerance = 0.35, seconds = 45, sprint = true, skip = false, direct = false } = {}) {
  let path = [], frames = 0;
  for (; frames < seconds / FIXED_DT && distance(s.player.position, target) > tolerance && !s.mission.failed; frames++) {
    if (!direct && !path.length) path = s.navigation.path(s.player.position, target);
    while (path.length && distance(s.player.position, path[0]) < 0.25) path.shift();
    const point = direct ? target : path[0] ?? target;
    const yaw = Math.atan2(-(point[0] - s.player.position[0]), -(point[2] - s.player.position[2]));
    step(s, { yaw, forward: 1, sprint, skip });
  }
  return { frames, reached: distance(s.player.position, target) <= tolerance, distance: distance(s.player.position, target) };
}
function resetRoundtrip(s, snapshot, stage) {
  const memory = new Memory(), store = new SaveStore(memory);
  const context = stage ? { chapter: 'campaign', stage, elapsedBefore: 100 } : undefined;
  const slot = stage ? 'campaign' : s.scenario;
  expect(store.save(slot, snapshot, context)).toEqual({ ok: true });
  const loaded = new SaveStore(memory).load(slot);
  expect(loaded.warning).toBeUndefined();
  const replacement = new Simulation(s.scenario, s.solids, loaded.save.snapshot);
  expect(replacement.snapshot()).toEqual(snapshot);
  expect(replacement.ballistics.projectiles).toHaveLength(0);
  return replacement;
}
function boundary(scenario, configure) {
  const env = buildEnvironment(scenario), original = new Simulation(scenario, env.solids);
  const snapshot = original.snapshot(); original.dispose();
  Object.assign(snapshot.mission, { elapsed: 200, phaseTime: 2, nextSpawn: 10000 });
  for (const actor of snapshot.actors) {
    actor.goals = []; actor.path = [];
    if (actor.role === 'enemy') { actor.down = true; actor.health = 0; }
  }
  configure(snapshot);
  return { env, s: new Simulation(scenario, env.solids, snapshot) };
}

describe('S05–S08 independent campaign boundaries (explicit fixture origin)', () => {
  it('BOUNDARY SNAPSHOT: S05 waits for the last worker and Zheng before the rear radio', () => {
    const cases = [];
    for (const missing of ['worker-6', 'zheng', null]) {
      const { env, s } = boundary('frontgate', snapshot => {
        Object.assign(snapshot.mission, { phase: 3, control: 'combat', facts: ['front-relieved'] });
        snapshot.player.position = [...G.rearPost];
        for (const actor of snapshot.actors) {
          if (actor.role === 'worker') { actor.position = [...G.safe]; actor.safe = true; actor.released = true; }
          if (actor.id === 'zheng') actor.position = [...G.rearPost];
          if (actor.id === 'relief') actor.position = [...G.weighA];
          if (actor.id === missing) { actor.position = [...G.zheng]; actor.safe = false; }
        }
      });
      try {
        wait(s, 1, { interact: true, skip: true });
        expect(s.mission.phase).toBe(missing ? 3 : 5);
        expect(s.has('front-team-returned')).toBe(!missing);
        cases.push({ missing, phase: s.mission.phase, frontTeamReturned: s.has('front-team-returned') });
      } finally { s.dispose(); env.dispose(); }
    }
    details.push({ id: 'S05-last-person', kind: 'constructed-boundary-snapshot', cases });
  });

  it('BOUNDARY SNAPSHOT: S07 requires both transport routes and each actual participant before admission', () => {
    const cases = [];
    for (const missing of ['cart-1', 'walker-1', null]) {
      const { env, s } = boundary('flank', snapshot => {
        Object.assign(snapshot.mission, { phase: 4, control: 'work', facts: ['meng-route-adopted'] });
        snapshot.player.position = [...F.report];
        for (const [prefix, targets] of [['cart', F.cartSafe], ['walker', F.walkerSafe]]) {
          targets.forEach((target, index) => {
            const actor = snapshot.actors.find(a => a.id === `${prefix}-${index}`);
            actor.position = [...target]; actor.released = true; actor.safe = false;
            if (actor.id === missing) actor.position = [target[0], target[1], target[2] - 8];
          });
        }
      });
      try {
        wait(s, 1, { interact: true });
        expect(s.mission.phase).toBe(missing ? 4 : 5);
        expect(s.has('meng-route-proven')).toBe(!missing);
        cases.push({ missing, phase: s.mission.phase, routeProven: s.has('meng-route-proven') });
      } finally { s.dispose(); env.dispose(); }
    }
    details.push({ id: 'S07-last-person', kind: 'constructed-boundary-snapshot', cases });
  });

  it('AUTHENTIC CHECKPOINT: S08 leaving the bed resets cooperation; restore and return require eight continuous seconds', () => {
    const env = buildEnvironment('escort');
    let s = new Simulation('escort', env.solids, fixture('escort-phase-11-natural', 'escort'));
    const checkpoints = [];
    try {
      expect(walk(s, E.changeAssist).reached).toBe(true);
      wait(s, 3, { skip: true });
      expect(s.mission.phase).toBe(11);
      expect(s.mission.phaseTime).toBeGreaterThan(3);
      expect(s.mission.phaseTime).toBeLessThan(6);
      checkpoints.push({ action: 'three-seconds-at-bed', time: s.mission.phaseTime, position: [...s.player.position] });
      expect(walk(s, [E.changeAssist[0] - 4, 0, E.changeAssist[2]], { skip: true }).reached).toBe(true);
      wait(s, 10, { skip: true });
      expect(s.mission.phase).toBe(11); expect(s.mission.phaseTime).toBe(0);
      expect(s.has('escort-patient-transferred')).toBe(false);
      const snapshot = s.snapshot();
      checkpoints.push({ action: 'away-ten-seconds', time: s.mission.phaseTime, position: [...s.player.position] });
      const restored = resetRoundtrip(s, snapshot); s.dispose(); s = restored;
      expect(walk(s, E.changeAssist, { skip: true }).reached).toBe(true);
      while (s.mission.phase === 11 && s.mission.phaseTime < 7.9) step(s, { skip: true });
      expect(s.mission.phase).toBe(11); expect(s.has('escort-patient-transferred')).toBe(false);
      checkpoints.push({ action: 'returned-less-than-eight-seconds', time: s.mission.phaseTime, position: [...s.player.position] });
      for (let i = 0; i < 20 && s.mission.phase === 11; i++) step(s, { skip: true });
      expect(s.mission.phase).toBe(12); expect(s.has('escort-patient-transferred')).toBe(true);
      expect(s.actors.find(a => a.id === 'cart-0').name).toBe('故障空车');
      expect(s.mission.facts.filter(f => f === 'escort-patient-transferred')).toHaveLength(1);
      details.push({ id: 'S08-leave-restore-return', kind: 'authentic-checkpoint-plus-public-input',
        fixture: 'fixtures/escort-phase-11-natural.json', checkpoints,
        note: 'Diagnostic snapshot saved after departure; not the production automatic-checkpoint boundary.' });
    } finally { s.dispose(); env.dispose(); }
  });

  it('FAULT-INJECTED AUTHENTIC CHECKPOINT: S08 cannot transfer while its medic is absent', () => {
    const snapshot = fixture('escort-phase-11-natural', 'escort');
    const medic = snapshot.actors.find(a => a.id === 'medic');
    medic.position = [E.medic[0] + 12, 0, E.medic[2] + 8];
    medic.goals = []; medic.path = []; medic.released = false;
    const env = buildEnvironment('escort'), s = new Simulation('escort', env.solids, snapshot);
    try {
      expect(walk(s, E.changeAssist).reached).toBe(true);
      wait(s, 12, { skip: true, interact: true });
      expect(s.mission.phase).toBe(11); expect(s.mission.phaseTime).toBe(0);
      expect(s.has('escort-patient-transferred')).toBe(false);
      details.push({ id: 'S08-medic-missing', kind: 'authentic-fixture-with-explicit-actor-fault',
        phase: s.mission.phase, time: s.mission.phaseTime, medicDistance: distance(medic.position, E.medic), waitedSeconds: 12 });
    } finally { s.dispose(); env.dispose(); }
  });

  it.each([
    ['frontgate', 'S05', null],
    ['flank', 'S07', null],
    ['escort', 'S08', 'escort-phase-5-natural'],
  ])('PUBLIC INPUT FROM FRESH ENTRY OR AUTHENTIC CHECKPOINT: %s enemy damage causes failure and retry restores the latest checkpoint', (scenario, stage, label) => {
    const env = buildEnvironment(scenario);
    let s = new Simulation(scenario, env.solids, label ? fixture(label, scenario) : undefined);
    try {
      const began = s.mission.elapsed;
      for (let i = 0; i < 600 && !s.aliveEnemies.length && !s.mission.failed; i++) step(s);
      const enemies = s.aliveEnemies.slice().sort((a, b) => distance(a.position, s.player.position) - distance(b.position, s.player.position));
      expect(enemies.length).toBeGreaterThan(0);
      const target = enemies[0].position;
      walk(s, [target[0], target[1], target[2] + 4], { seconds: 60 });
      wait(s, 60);
      expect(s.mission.failed, JSON.stringify({ scenario, phase: s.mission.phase, health: s.player.health,
        player: s.player.position, enemies: s.aliveEnemies.map(a => ({ id: a.id, position: a.position })) })).toBe(true);
      expect(s.player.health).toBe(0);
      const retry = structuredClone(s.checkpoint);
      expect(retry.mission.failed).toBe(false);
      expect(retry.player.health).toBeGreaterThan(0);
      const failure = { elapsed: s.mission.elapsed, timeToFailure: s.mission.elapsed - began,
        phase: s.mission.phase, health: s.player.health, position: [...s.player.position] };
      expect(s.hits).toBe(0);
      const allyDamagedEnemies = s.actors.filter(a => a.role === 'enemy' && a.health < 68)
        .map(a => ({ id: a.id, health: a.health, down: a.down }));
      const replacement = resetRoundtrip(s, s.checkpoint, stage); s.dispose(); s = replacement;
      expect(s.mission.failed).toBe(false); expect(s.player.health).toBeGreaterThan(0);
      const previousTime = s.mission.elapsed; step(s);
      expect(s.mission.elapsed).toBeGreaterThan(previousTime);
      details.push({ id: `${stage}-failure-retry`, kind: 'authentic-checkpoint-plus-public-input',
        fixture: label ? `fixtures/${label}.json` : 'fresh-scenario-entry', failure, retryPhase: retry.mission.phase,
        retryHealth: retry.player.health, exactCheckpointRestored: true, projectilesCleared: true,
        playerFireInputs: 0, playerHits: 0, allyDamagedEnemies });
    } finally { s.dispose(); env.dispose(); }
  });

  it('MEASUREMENT: records actual allied damage and distinguishes zero observed hits from proof of cover', () => {
    const observations = readdirSync(output).filter(name => name.startsWith('baseline-observations-'))
      .flatMap(name => JSON.parse(readFileSync(resolve(output, name), 'utf8')).records);
    const measured = [];
    for (const scenario of ['escort']) {
      const complete = observations.filter(record => record.scenario === scenario && record.initial.phase === 0
        && record.initial.elapsed === 0 && record.final?.complete);
      expect(complete.length, `${scenario} complete public route not observed`).toBeGreaterThan(0);
      const impacts = complete.flatMap(record => record.allyImpacts).filter(hit => hit.afterHealth < hit.beforeHealth && hit.flightSeconds > 0);
      measured.push({ scenario, observedImpacts: impacts.length, provedInNaturalRoute: impacts.length > 0,
        nominalDamage: impacts.reduce((sum, hit) => sum + hit.damage, 0), examples: impacts.slice(0, 4) });
    }
    details.push({ id: 'allied-cover-damage', kind: 'read-only-ballistic-impact-observation', measured,
      noPlayerFireAttempts: details.filter(row => row.id.endsWith('failure-retry')).map(row => ({ id: row.id,
        playerFireInputs: row.playerFireInputs, playerHits: row.playerHits, allyDamagedEnemies: row.allyDamagedEnemies })),
      limitation: 'Actual hits establish combat effect; they do not establish tactical quality, subjective difficulty or a counterfactual survival advantage.' });
  });

  it('ACTUAL TERMINAL SNAPSHOT: S08 to S09 preserves knowledge, viewpoint and chapter metadata', () => {
    let elapsedBefore = 0;
    const sequence = [];
    for (const [scenario, expectedNext, mustHave, mustNotHave] of [
      ['escort', 'S09', ['lu-keeps-escort-promise', 'escort-convoy-arrived', 'meng-returned-for-relief'], ['zhou-death-confirmed']],
    ]) {
      const terminal = fixture(`${scenario}-terminal-natural`, scenario);
      expect(terminal.mission.complete).toBe(true);
      const next = nextStage(scenario); expect(next.id).toBe(expectedNext);
      const inherited = carryFacts(next.id, terminal.mission.facts);
      elapsedBefore += terminal.mission.elapsed;
      const env = buildEnvironment(next.scenario), s = new Simulation(next.scenario, env.solids, undefined, inherited);
      try {
        for (const fact of mustHave) expect(s.has(fact), `${expectedNext} missing ${fact}`).toBe(true);
        for (const fact of mustNotHave) expect(s.has(fact), `${expectedNext} revealed ${fact}`).toBe(false);
        const memory = new Memory(), store = new SaveStore(memory);
        expect(store.save('campaign', s.checkpoint, { chapter: 'campaign', stage: next.id, elapsedBefore })).toEqual({ ok: true });
        const loaded = store.load('campaign');
        expect(loaded.save.chapter).toEqual({ chapter: 'campaign', stage: next.id, elapsedBefore });
        expect(loaded.save.snapshot).toEqual(s.checkpoint);
        sequence.push({ from: scenario, to: next.id, viewpoint: s.player.name, elapsedBefore, mustHave, mustNotHave });
      } finally { s.dispose(); env.dispose(); }
    }
    details.push({ id: 'chapter-handoff', kind: 'actual-individual-terminal-plus-next-stage-construction', sequence,
      limitation: 'S08 has its own clean entry context. This is not a continuous S01–S12 run or the application menu transition.' });
  });
});

afterAll(() => writeFileSync(resolve(output, 'boundary-details.json'), JSON.stringify({ schemaVersion: 1,
  candidate: process.env.QA_CANDIDATE_ROOT, details, browser: 'NOT_RUN', humanPlaythrough: 'NOT_RUN',
}, null, 2) + '\n'));
