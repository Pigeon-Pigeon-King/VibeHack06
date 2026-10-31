import { describe, expect, it } from 'vitest';
import type { Simulation } from '../src/mission/Simulation';
import { rescueObjective } from '../src/mission/Rescue';
import { epilogueObjective } from '../src/mission/Epilogue';

// Pure HUD boundary checks; these constructed contexts are not campaign replays.
describe('story HUD only describes events already established', () => {
  it('does not announce the junction injury before the injury fact', () => {
    const facts = new Set<string>();
    const sim = { mission: { phase: 1 }, has: (fact: string) => facts.has(fact) } as Simulation;
    expect(rescueObjective(sim).text).not.toMatch(/负伤|伤员/);
    facts.add('rescue-meng-wounded'); expect(rescueObjective(sim).text).toMatch(/负伤/);
  });
  it('waits for the fleet reply instead of prematurely announcing arrival', () => {
    const sim = { mission: { phase: 5 } } as Simulation;
    const objective = epilogueObjective(sim);
    expect(objective.text).toMatch(/等待/);
    expect(objective.detail).not.toMatch(/开始进场/);
  });
});
