import { describe, expect, it } from 'vitest';
import { CHAPTER_STAGES } from '../../src/content/chapter-flow';
import bridges from '../../src/chapter-transition/bridges.json';

const textOf = (from: string) => bridges.find(bridge => bridge.from === from)!.cues.map(cue => cue.text).join('');
const readableCharacters = (text: string) => [...text].filter(character => /[\p{L}\p{N}]/u.test(character)).length;

// These are content-contract and regression guards, not proof of literary quality
// or of the player's understanding. The sources and human review remain in NARRATION.md.
describe('chapter transition narration contract', () => {
  it('covers each adjacent campaign pair once and preserves the next chapter title', () => {
    expect(bridges.map(({ from, to, heading }) => ({ from, to, heading }))).toEqual(
      CHAPTER_STAGES.slice(0, -1).map((stage, index) => ({
        from: stage.id, to: CHAPTER_STAGES[index + 1].id, heading: CHAPTER_STAGES[index + 1].title,
      })),
    );
  });

  it('provides globally unique production IDs and only the agreed text manifest fields', () => {
    const ids: string[] = [];
    for (const bridge of bridges) {
      expect(bridge.id).toBe(`bridge-${bridge.from.toLowerCase()}-${bridge.to.toLowerCase()}`);
      expect(Object.keys(bridge).sort()).toEqual(['cues', 'from', 'heading', 'id', 'kicker', 'to']);
      expect(bridge.kicker.trim()).not.toBe('');
      expect(bridge.cues.length).toBeGreaterThanOrEqual(2);
      expect(bridge.cues.length).toBeLessThanOrEqual(3);
      ids.push(bridge.id);
      for (const cue of bridge.cues) {
        expect(cue.id).toMatch(new RegExp(`^${bridge.id}-[0-9]{2}$`));
        expect(Object.keys(cue).sort()).toEqual(['id', 'readingSeconds', 'text']);
        ids.push(cue.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps each subtitle readable and derives fallback timing from its text', () => {
    for (const bridge of bridges) {
      for (const cue of bridge.cues) {
        expect(cue.text).toBe(cue.text.trim());
        expect(cue.text).not.toMatch(/[\r\n]|https?:\/\//);
        const length = readableCharacters(cue.text);
        expect(length).toBeGreaterThan(0);
        expect(length).toBeLessThanOrEqual(45);
        expect(cue.readingSeconds).toBe(Math.max(3, Math.ceil(length / 3.5 * 2) / 2));
      }
    }
  });

  it('rewinds the same loss of the shelter without revealing the hall beyond the child viewpoint', () => {
    const text = textOf('S01');
    expect(text).toMatch(/同一次失守/);
    expect(text).toMatch(/稍早/);
    expect(text).toMatch(/周延/);
    expect(text).not.toMatch(/轰炸|坍塌|屠杀|扫射|被控制|处决|死亡|死去|击杀|失去意识/);
    expect(textOf('S02')).toMatch(/十年后/);
  });

  it('keeps the three stages of information sharing in their own chapters', () => {
    // The S05 private notice, the S06 discovery and the S07 full report are separate events.
    expect(textOf('S04')).not.toMatch(/邵原|扣下|扣住|隐瞒|转移预告/);
    expect(textOf('S05')).not.toMatch(/闻川.{0,10}(得知|知道|发现).{0,12}(预告|隐瞒|扣下|转移)/);
    expect(textOf('S06')).not.toMatch(/完整报告|已经和解|关系修复|已经原谅/);
    expect(textOf('S07')).toMatch(/完整报告/);
    for (const from of ['S03', 'S04', 'S05', 'S06', 'S07']) {
      expect(textOf(from)).not.toMatch(/邵原.{0,12}(已动身|已经动身|已经上车|已离开|已逃|逃入|逃脱)/);
    }
  });

  it('preserves real handover work after the escort and growth before the injuries', () => {
    expect(textOf('S08')).not.toMatch(/已完成接防|接防已经完成|已交出阵位|已接过阵位|接防组已到岗/);
    const withdrawal = textOf('S09');
    expect(withdrawal).toMatch(/护具/);
    expect(withdrawal).toMatch(/回复/);
    expect(withdrawal).not.toMatch(/受伤|负伤|中弹|临终|死亡|最后一次|最后的回复/);
  });

  it('waits for the medical scene to reveal its result and the epilogue to confirm later news', () => {
    expect(textOf('S10')).not.toMatch(/死亡|死去|致命|抢救失败|没能救|遗言|告别|牺牲/);
    expect(textOf('S11')).not.toMatch(/邵原|内陆|舰队|进场|第一梯队|光复|胜利|孟齐.{0,8}(康复|归队|参战)/);
  });

  it('does not import an invented clock or editorial boundary explanations into player text', () => {
    const text = bridges.map(bridge => `${bridge.kicker}${bridge.cues.map(cue => cue.text).join('')}`).join('');
    expect(text).not.toMatch(/[0-9]{1,2}:[0-9]{2}|[一二三四五六七八九十零两]+点(?:前后|钟|整)|[0-9]{4}年/);
    expect(text).not.toMatch(/并不意味着|不意味着|不是.{0,12}而是|尚未|还不知道|不能认为|这意味着|命运从此|这就是成长/);
  });
});
