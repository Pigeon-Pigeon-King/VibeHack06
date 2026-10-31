import { describe, expect, it } from 'vitest';
import { CAMPAIGN_OPENING, CHAPTER_BRIDGES, CHAPTER_TRANSITION_SCRIPTS } from '../../src/chapter-transition/catalog';
import production from '../../docs/chapter-transition/narration-production.json';

describe('opening narration production contract', () => {
  it('introduces the campaign without inserting a fake chapter into the sequence', () => {
    expect(CAMPAIGN_OPENING.from).toBeNull(); expect(CAMPAIGN_OPENING.to).toBe('S01');
    expect(CHAPTER_TRANSITION_SCRIPTS).toEqual([CAMPAIGN_OPENING, ...CHAPTER_BRIDGES]);
    expect(CHAPTER_BRIDGES).toHaveLength(11); expect(CHAPTER_TRANSITION_SCRIPTS).toHaveLength(12);
  });
  it('uses distinct cue IDs and readable text timing across opening and chapter bridges', () => {
    const cues = CHAPTER_TRANSITION_SCRIPTS.flatMap(script => script.cues);
    expect(new Set(cues.map(cue => cue.id)).size).toBe(cues.length);
    expect(CAMPAIGN_OPENING.cues).toHaveLength(4);
    for (const cue of CAMPAIGN_OPENING.cues) {
      expect(cue.id).toMatch(/^opening-campaign-\d{2}$/);
      expect(cue.text).toBe(cue.text.trim());
      const length = [...cue.text].filter(character => /[\p{L}\p{N}]/u.test(character)).length;
      expect(length).toBeLessThanOrEqual(45);
      expect(cue.readingSeconds).toBe(Math.max(3, Math.ceil(length / 3.5 * 2) / 2));
    }
  });
  it('keeps the opening before the unseen outcomes of the shelter battle', () => {
    // Specific continuity guard; literary quality is reviewed in OPENING.md.
    const text = CAMPAIGN_OPENING.cues.map(cue => cue.text).join('');
    expect(text).toMatch(/木卫三/); expect(text).toMatch(/冰脊港/); expect(text).toMatch(/闻川/);
    expect(text).not.toMatch(/轰炸|坍塌|屠杀|邵原|抢救失败|被击杀|父亲.{0,6}(死|牺牲)|舰队进场/);
    expect(text).not.toMatch(/十年.{0,4}占领|尚未|不是.{0,12}而是|命运从此/);
  });
  it('exports every frozen text exactly once for voice production, in play order', () => {
    expect(production.sequences.map(sequence => sequence.id)).toEqual(CHAPTER_TRANSITION_SCRIPTS.map(script => script.id));
    expect(production.cues).toEqual(CHAPTER_TRANSITION_SCRIPTS.flatMap(script => script.cues.map(cue => ({
      cueId: cue.id, sequenceId: script.id, text: cue.text, readingSeconds: cue.readingSeconds,
    }))));
  });
});
