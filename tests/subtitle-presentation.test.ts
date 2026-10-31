import { describe, expect, it } from 'vitest';
import { SubtitlePresentation } from '../src/ui/SubtitlePresentation';

type Input = Parameters<SubtitlePresentation['update']>[0];
const input = (change: Partial<Input> = {}): Input => ({
  mode: 'playing', epoch: 1, time: 0, revision: 7,
  text: '沿西侧通道走，我守住后路。', speaker: '郑铎', reducedMotion: false, ...change,
});
const show = (view: SubtitlePresentation, time: number, change: Partial<Input> = {}) => view.update(input({ time, ...change }));

describe('subtitle presentation on the simulation clock', () => {
  it('enters smoothly and finishes its exit by the authored deadline', () => {
    const view = new SubtitlePresentation();
    const first = show(view, 0);
    expect(first.visible).toBe(true);
    expect(first.current.opacity).toBe(0);
    const entering = show(view, 0.08);
    expect(entering.current.opacity).toBeGreaterThan(0);
    expect(entering.current.opacity).toBeLessThan(1);
    expect(show(view, 0.2).current.opacity).toBe(1);
    const leaving = show(view, 6.91);
    expect(leaving.current.opacity).toBeCloseTo(0.5, 5);
    expect(leaving.current.text).toBe(input().text);
    const expired = show(view, 7, { text: '' });
    expect(expired.visible).toBe(false);
    expect(expired.current.text).toBe('');
    expect(expired.outgoing.text).toBe('');
  });

  it('replaces the speaker and line together and never queues a superseded line', () => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 0.2);
    const b = show(view, 1, { speaker: '孟齐', text: '阵位接住了。', revision: 8 });
    expect([b.current.speaker, b.current.text]).toEqual(['孟齐', '阵位接住了。']);
    expect([b.outgoing.speaker, b.outgoing.text]).toEqual(['郑铎', input().text]);
    const c = show(view, 1.03, { speaker: '周延', text: '我先撤，你跟上。', revision: 9 });
    expect([c.current.speaker, c.current.text]).toEqual(['周延', '我先撤，你跟上。']);
    expect(c.outgoing.speaker).toBe('郑铎');
    const settled = show(view, 1.25, { speaker: '周延', text: '我先撤，你跟上。', revision: 9 });
    expect(settled.current.opacity).toBe(1);
    expect(settled.outgoing.text).toBe('');
    expect(JSON.stringify(settled)).not.toContain('阵位接住了');
  });

  it('refreshes the deadline of identical warning text without flashing its entrance again', () => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 0.3);
    const repeated = show(view, 1, { revision: 11 });
    expect(repeated.current.opacity).toBe(1);
    expect(repeated.outgoing.text).toBe('');
    expect(show(view, 7.1, { revision: 11 }).current.opacity).toBe(1);
    expect(show(view, 11, { revision: 11, text: '' }).visible).toBe(false);
    const saidAgain = show(view, 12, { revision: 19 });
    expect(saidAgain.current.text).toBe(input().text);
    expect(saidAgain.current.opacity).toBe(0);
  });

  it('hides and freezes a partial entrance during pause, then resumes without restarting', () => {
    const view = new SubtitlePresentation();
    show(view, 0);
    const beforePause = show(view, 0.08);
    for (let i = 0; i < 120; i++) {
      const paused = show(view, 0.08, { mode: 'paused' });
      expect(paused.visible).toBe(false);
      expect(paused.current).toEqual(beforePause.current);
    }
    const resumed = show(view, 0.08);
    expect(resumed.visible).toBe(true);
    expect(resumed.current).toEqual(beforePause.current);
    expect(show(view, 0.12).current.opacity).toBeGreaterThan(resumed.current.opacity);
  });

  it('discards both old layers when retry or import changes the presentation epoch', () => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 0.3);
    show(view, 1, { text: '继续撤回。', revision: 9 });
    const loaded = show(view, 40, { epoch: 2, text: '把接收单交给我。', speaker: '护理员', revision: 47 });
    expect(loaded.current.text).toBe('把接收单交给我。');
    expect(loaded.current.speaker).toBe('护理员');
    expect(loaded.current.opacity).toBe(0);
    expect(loaded.outgoing.text).toBe('');
  });

  it('clears obsolete captions when simulation time rolls back, including while paused', () => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 3);
    const rollback = show(view, 1, { text: '门已经开了。', revision: 8 });
    expect(rollback.outgoing.text).toBe('');
    expect(rollback.current.text).toBe('门已经开了。');
    const pausedLoad = show(view, 0.5, { epoch: 2, mode: 'paused', text: '新的检查点。', revision: 5 });
    expect(pausedLoad.current.text).toBe('');
    expect(pausedLoad.outgoing.text).toBe('');
    const resumed = show(view, 0.5, { epoch: 2, text: '新的检查点。', revision: 5 });
    expect(resumed.current.text).toBe('新的检查点。');
  });

  it.each(['menu', 'failed', 'complete'] as const)('clears captions in %s rather than leaking them into the next run', mode => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 1);
    const closed = show(view, 2, { mode });
    expect(closed.visible).toBe(false);
    expect(closed.current.text).toBe('');
    expect(closed.outgoing.text).toBe('');
    const returned = show(view, 2, { text: '另一段当前台词。', revision: 8 });
    expect(returned.current.text).toBe('另一段当前台词。');
    expect(returned.outgoing.text).toBe('');
  });

  it('briefly fades a cancelled line but does not extend its old authored deadline', () => {
    const view = new SubtitlePresentation();
    show(view, 0); show(view, 1);
    const cancelled = show(view, 6.94, { text: '' });
    expect(cancelled.current.text).toBe('');
    expect(cancelled.outgoing.opacity).toBeGreaterThan(0);
    expect(show(view, 7, { text: '' }).visible).toBe(false);
    expect(show(view, 7.01, { text: '' }).outgoing.text).toBe('');
  });

  it('removes displacement and substantially shortens the fade for reduced motion', () => {
    const normal = new SubtitlePresentation(), reduced = new SubtitlePresentation();
    show(normal, 0); show(reduced, 0, { reducedMotion: true });
    const quiet = show(reduced, 0.04, { reducedMotion: true });
    expect(quiet.current.opacity).toBe(1);
    expect(quiet.current.offsetY).toBe(0);
    expect(show(normal, 0.04).current.opacity).toBeLessThan(0.3);
    const change = show(reduced, 1, { reducedMotion: true, text: '下一句。', revision: 8 });
    expect(change.current.offsetY).toBe(0);
    expect(change.outgoing.offsetY).toBe(0);
    const settled = show(reduced, 1.04, { reducedMotion: true, text: '下一句。', revision: 8 });
    expect(settled.current.opacity).toBe(1);
    expect(settled.outgoing.text).toBe('');
  });

  it('produces the same fade after a slow render frame as after several fast frames', () => {
    const slow = new SubtitlePresentation(), fast = new SubtitlePresentation();
    show(slow, 0); show(fast, 0);
    for (const time of [0.02, 0.04, 0.06, 0.08]) show(fast, time);
    expect(show(fast, 0.1)).toEqual(show(slow, 0.1));
  });
});
