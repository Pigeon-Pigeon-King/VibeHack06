import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/chapter-transition/TransitionOverlay', () => ({ TransitionOverlay: class { render() {} dispose() {} } }));
import { ChapterTransition } from '../../src/chapter-transition/ChapterTransition';
import type { ChapterBridge } from '../../src/chapter-transition/types';

const bridge: ChapterBridge = { id: 'test', from: 'S01', to: 'S02', heading: '主厅', kicker: '同一场战斗', cues: [{ id: 'one', text: '防守仍在继续。', readingSeconds: 3 }] };
function setup() {
  let now = 0, id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const documentTarget = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true }); const windowTarget = new EventTarget();
  vi.stubGlobal('document', documentTarget); vi.stubGlobal('window', windowTarget); vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (value: number) => frames.delete(value));
  const enter = vi.fn(); const transition = new ChapterTransition({} as HTMLElement, { preload: async () => 'prepared', enter, release: vi.fn() }, vi.fn());
  const frame = (milliseconds: number) => { now += milliseconds; const current = [...frames.values()]; frames.clear(); for (const callback of current) callback(now); };
  return { transition, enter, frame, documentTarget, windowTarget, frames };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('browser shell event wiring (DOM overlay mocked)', () => {
  it('pauses a visible but unfocused window and only resumes active elapsed time', async () => {
    const h = setup(); h.transition.start(bridge); await Promise.resolve(); h.frame(1000); h.windowTarget.dispatchEvent(new Event('blur')); h.frame(20_000);
    expect(h.transition.snapshot.paused).toBe(true); expect(h.enter).not.toHaveBeenCalled();
    h.windowTarget.dispatchEvent(new Event('focus')); h.frame(1999); expect(h.enter).not.toHaveBeenCalled(); h.frame(1); expect(h.enter).toHaveBeenCalledOnce(); h.transition.dispose();
  });
  it('keeps manual pause after returning to the tab and stops RAF on disposal', async () => {
    const h = setup(); h.transition.start(bridge); await Promise.resolve(); h.transition.setPaused(true); h.documentTarget.hidden = true; h.documentTarget.dispatchEvent(new Event('visibilitychange')); h.frame(10_000);
    h.documentTarget.hidden = false; h.documentTarget.dispatchEvent(new Event('visibilitychange')); h.frame(10_000); expect(h.transition.snapshot.paused).toBe(true); expect(h.enter).not.toHaveBeenCalled();
    h.transition.setPaused(false); h.frame(3000); expect(h.enter).toHaveBeenCalledOnce(); h.transition.dispose(); expect(h.frames.size).toBe(0);
  });
});
