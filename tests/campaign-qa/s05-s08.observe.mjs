// Read-only observation around the unmodified candidate. No mission, actor,
// input, return value, dt, navigation or projectile is changed by this observer.
import { afterAll, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Simulation } from 'candidate-src/mission/Simulation.ts';
import { SaveStore, SAVE_KEY_PREFIX } from 'candidate-src/persistence/SaveStore.ts';

const output = process.env.QA_EVIDENCE_DIR;
const captureNatural = ['baseline', 'remaining-natural'].includes(process.env.QA_CASE_MODE);
const driverNames = { frontgate: 'run', transfer: 'playTransfer', flank: 'playFlank', escort: 'playEscort' };
const originalStep = Simulation.prototype.step;
const records = [], observed = new WeakMap();
const began = performance.now();
class Memory {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
}
function state(s) {
  return { phase: s.mission.phase, control: s.mission.control, elapsed: s.mission.elapsed,
    phaseTime: s.mission.phaseTime, position: [...s.player.position], health: s.player.health,
    facts: [...s.mission.facts], complete: s.mission.complete, failed: s.mission.failed,
    spawned: s.mission.spawned, kills: s.kills, playerHits: s.hits };
}
function saveFixture(s, label, record) {
  if (!captureNatural) return;
  const memory = new Memory(), store = new SaveStore(memory);
  const result = store.save(s.scenario, s.snapshot());
  if (!result.ok) throw new Error(`Observed authentic fixture failed validation: ${result.error}`);
  const raw = memory.getItem(`${SAVE_KEY_PREFIX}${s.scenario}`);
  const directory = resolve(output, 'fixtures');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${label}.json`), raw + '\n');
  writeFileSync(resolve(directory, `${label}.source.json`), JSON.stringify({
    kind: 'locked-candidate-public-intent-replay-checkpoint', sourceTest: record.testPath,
    sourceDriver: `tests/${s.scenario}-paths.test.ts::${driverNames[s.scenario]} (locked original; natural once)`,
    sourceCase: record.testName, recordId: record.id, fixture: `${label}.json`,
    scenario: s.scenario, phase: s.mission.phase, elapsed: s.mission.elapsed,
    stagedSkipInputs: record.inputs.stagedSkip, initial: record.initial,
    sha256: createHash('sha256').update(raw + '\n').digest('hex'),
    note: 'Local diagnostic entry only; restoring this is not a complete campaign or browser playthrough.',
  }, null, 2) + '\n');
}
Simulation.prototype.step = function (intent, dt) {
  let record = observed.get(this);
  if (!record) {
    record = { id: `${this.scenario}-${records.length + 1}`, scenario: this.scenario,
      testName: expect.getState().currentTestName, testPath: expect.getState().testPath,
      initial: state(this), inputs: { steps: 0, fire: 0, interact: 0, skip: 0, stagedSkip: 0 },
      transitions: [], allyImpacts: [], allyDamage: 0, startedWallMs: performance.now() };
    records.push(record); observed.set(this, record);
    const update = this.ballistics.update.bind(this.ballistics);
    this.ballistics.update = delta => {
      const impacts = update(delta);
      for (const impact of impacts) {
        const owner = this.actors.find(actor => actor.id === impact.projectile.owner);
        const target = this.actors.find(actor => actor.id === impact.hit.id);
        if (owner?.role === 'ally' && target?.role === 'enemy' && !target.down) {
          record.allyImpacts.push({ elapsed: this.mission.elapsed, owner: owner.id, target: target.id,
            damage: impact.projectile.damage, beforeHealth: target.health, afterHealth: null,
            flightSeconds: impact.projectile.age, phase: this.mission.phase,
            playerFireInput: record.currentFireInput });
        }
      }
      return impacts;
    };
  }
  const phase = this.mission.phase, control = this.mission.control;
  record.currentFireInput = !!intent.fire;
  record.inputs.steps++;
  for (const key of ['fire', 'interact', 'skip']) if (intent[key]) record.inputs[key]++;
  if (intent.skip && control === 'staged') record.inputs.stagedSkip++;
  const beforeHits = record.allyImpacts.length;
  const result = originalStep.call(this, intent, dt);
  for (const hit of record.allyImpacts.slice(beforeHits)) {
    hit.afterHealth = this.actors.find(actor => actor.id === hit.target)?.health;
    record.allyDamage += Math.min(hit.damage, Math.max(0, hit.beforeHealth - hit.afterHealth));
  }
  if (phase !== this.mission.phase) {
    record.transitions.push({ from: phase, to: this.mission.phase, elapsed: this.mission.elapsed,
      inputs: { ...intent }, state: state(this) });
    const naturalStart = record.initial.phase === 0 && record.initial.elapsed === 0 && !record.inputs.stagedSkip;
    if (naturalStart && ((this.scenario === 'escort' && [5, 11].includes(this.mission.phase))
      || (this.scenario === 'frontgate' && this.mission.phase === 1)
      || (this.scenario === 'flank' && this.mission.phase === 1))) {
      saveFixture(this, `${this.scenario}-phase-${this.mission.phase}-natural`, record);
    }
  }
  record.final = state(this);
  record.wallSeconds = (performance.now() - record.startedWallMs) / 1000;
  record.simulatedSeconds = record.inputs.steps * (dt ?? 1 / 60);
  if (this.mission.complete && captureNatural
    && record.initial.phase === 0 && record.initial.elapsed === 0) {
    saveFixture(this, `${this.scenario}-terminal-${record.inputs.stagedSkip ? 'skipped' : 'natural'}`, record);
  }
  return result;
};

afterAll(() => {
  Simulation.prototype.step = originalStep;
  mkdirSync(output, { recursive: true });
  const path = expect.getState().testPath ?? records[0]?.testPath ?? 'unknown';
  writeFileSync(resolve(output, `${process.env.QA_CASE_MODE}-observations-${basename(path).replace(/\.[^.]+$/, '')}.json`), JSON.stringify({
    schemaVersion: 1, candidate: process.env.QA_CANDIDATE_ROOT, mode: process.env.QA_CASE_MODE,
    wallSeconds: (performance.now() - began) / 1000,
    simulatedSeconds: records.reduce((sum, record) => sum + (record.simulatedSeconds ?? 0), 0),
    browser: 'NOT_RUN', humanPlaythrough: 'NOT_RUN', records,
  }, null, 2) + '\n');
});
