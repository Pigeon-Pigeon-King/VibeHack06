import { beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '../src/runtime/Physics';
import { Simulation } from '../src/mission/Simulation';
import { playDialogue } from '../src/mission/Dialogue';
import { dialogueCues, dialogueSkipAvailable } from '../src/audio/dialogue-events';

beforeAll(() => initializePhysics());
describe('simulation-owned dialogue emissions', () => {
  it.each([
    { scenario: 'rescue' as const, phase: 1, actor: '', fact: 'rescue-meng-wounded' },
    { scenario: 'medical' as const, phase: 8, actor: 'xu', fact: '' },
    { scenario: 'relief' as const, phase: 7, actor: 'zheng', fact: '' },
  ])('preserves dialogue during the $scenario skip prerequisite, then enables skipping', ({ scenario, phase, actor, fact }) => {
    const sim = new Simulation(scenario, []);
    try {
      sim.mission.phase = phase; sim.mission.control = 'staged';
      if (actor) sim.actors.find(a => a.id === actor)!.goals = [[10, 0, 10]];
      expect(dialogueSkipAvailable(sim)).toBe(false);
      if (fact) sim.fact(fact); else sim.actors.find(a => a.id === actor)!.goals = [];
      expect(dialogueSkipAvailable(sim)).toBe(true);
      sim.mission.control = 'work'; expect(dialogueSkipAvailable(sim)).toBe(false);
    } finally { sim.dispose(); }
  });
  it('does not restart a phase opening line when its at-zero dialogue marker is reached', () => {
    const sim = new Simulation('nightshift', []);
    try {
      sim.events = [];
      sim.phase(1, '请跟上。', 'staged', '郑铎');
      expect(sim.events.filter(event => event.type === 'dialogue')).toHaveLength(1);
      sim.events = [];
      playDialogue(sim, 'audio-test', [[0, '郑铎', '请跟上。'], [9, '陆闻川', '好。']]);
      expect(sim.events.filter(event => event.type === 'dialogue')).toHaveLength(0);
      expect(sim.mission.subtitleUntil).toBe(9);
      expect(sim.has('audio-test-0')).toBe(true);
    } finally { sim.dispose(); }
  });
  it('emits changed speakers/text and renewed expired lines with their valid simulation deadline', () => {
    const sim = new Simulation('nightshift', []);
    try {
      sim.events = []; sim.say('郑铎', '收到。', 3);
      expect(sim.events.at(-1)?.dialogue).toEqual({ speaker: '郑铎', text: '收到。', expiresAt: 3 });
      sim.say('陆闻川', '收到。', 4);
      expect(sim.events.at(-1)?.dialogue?.speaker).toBe('陆闻川');
      sim.mission.elapsed = 5; sim.events = []; sim.say('陆闻川', '收到。', 2);
      expect(sim.events).toEqual([{ type: 'dialogue', dialogue: { speaker: '陆闻川', text: '收到。', expiresAt: 7 } }]);
      const restored = new Simulation('nightshift', [], sim.snapshot());
      try { expect(restored.events).toEqual([]); expect(restored.mission.subtitle).toBe('收到。'); }
      finally { restored.dispose(); }
    } finally { sim.dispose(); }
  });
  it('forwards every real same-step story line, but only the destination line after a legal skip', () => {
    const sim = new Simulation('medical', []);
    try {
      sim.events = []; sim.say('周延', '……听见了。', 3); sim.say('接诊医师', '先别说话。', 4);
      const natural = dialogueCues(sim.events, sim.mission, 4);
      expect(natural.map(cue => cue.text)).toEqual(['……听见了。', '先别说话。']);
      expect(new Set(natural.map(cue => cue.revision)).size).toBe(2);
      expect(dialogueCues(sim.events, sim.mission, 4, true).map(cue => cue.text)).toEqual(['先别说话。']);
      sim.finish('工作结束。');
      expect(dialogueCues(sim.events, sim.mission, 4, true)).toEqual([]);
      expect(dialogueCues(sim.events, sim.mission, 4).map(cue => cue.text)).toContain('……听见了。');
      sim.mission.failed = true; expect(dialogueCues(sim.events, sim.mission, 4)).toEqual([]);
    } finally { sim.dispose(); }
  });
});
