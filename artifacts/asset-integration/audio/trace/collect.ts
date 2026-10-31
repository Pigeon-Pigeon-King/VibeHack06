import { afterAll, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Simulation } from '../../../../src/mission/Simulation';
import { dialogueCues } from '../../../../src/audio/dialogue-events';
const traces: any[] = [], bySim = new WeakMap<Simulation, any>();
const step = Simulation.prototype.step, dispose = Simulation.prototype.dispose;
const state = (s: Simulation) => ({ ...s.mission, facts: [...s.mission.facts] });
Simulation.prototype.step = function (intent) {
  let trace = bySim.get(this);
  if (!trace) {
    trace = { test: expect.getState().currentTestName, scenario: this.scenario, initial: state(this), steps: 0, skips: 0, records: [] };
    traces.push(trace); bySim.set(this, trace);
  }
  const before = state(this);
  step.call(this, intent); const skipped = intent.skip && before.control === 'staged' && (before.phase !== this.mission.phase || this.mission.complete);
  ++trace.steps; if (skipped) ++trace.skips;
  if (!before.complete && !before.failed) {
    const after = state(this), cues = dialogueCues(this.events, after, 1, skipped);
    if (cues.length || skipped || after.complete || after.failed || before.facts.join('|') !== after.facts.join('|')) trace.records.push({ mission: after, skipped, cues });
  }
  trace.end = state(this);
};
Simulation.prototype.dispose = function () { const trace = bySim.get(this); if (trace) trace.end = state(this); dispose.call(this); };
afterAll(() => {
  const name = basename(expect.getState().testPath ?? 'unknown');
  writeFileSync(`artifacts/asset-integration/audio/trace/${name}.json`, JSON.stringify(traces));
  Simulation.prototype.step = step; Simulation.prototype.dispose = dispose;
});
