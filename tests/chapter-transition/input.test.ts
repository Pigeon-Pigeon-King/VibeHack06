import { describe, expect, it, vi } from 'vitest';
import { TransitionInputGuard } from '../../src/chapter-transition/TransitionInputGuard';

function event(type: string, properties: Record<string, unknown> = {}): Event {
  const e = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(properties)) Object.defineProperty(e, key, { value }); return e;
}
describe('transition input capture', () => {
  it('waits for a released left click before requesting skip and consumes it', () => {
    const target = new EventTarget(); const click = vi.fn(); const guard = new TransitionInputGuard(target, { click, togglePause: vi.fn() }); const gameplay = vi.fn();
    for (const type of ['mousedown', 'mouseup', 'click']) target.addEventListener(type, gameplay);
    guard.setActive(true); target.dispatchEvent(event('mousedown', { button: 0 })); expect(click).not.toHaveBeenCalled();
    target.dispatchEvent(event('mouseup', { button: 0 })); target.dispatchEvent(event('click', { button: 0 })); expect(click).toHaveBeenCalledOnce(); expect(gameplay).not.toHaveBeenCalled(); guard.dispose();
  });
  it('drains a click started before automatic entry and allows the next fresh click', () => {
    const target = new EventTarget(); const click = vi.fn(); const guard = new TransitionInputGuard(target, { click, togglePause: vi.fn() }); const gameplay = vi.fn(); target.addEventListener('click', gameplay);
    guard.setActive(true); target.dispatchEvent(event('mousedown', { button: 0 })); guard.setActive(false);
    target.dispatchEvent(event('mouseup', { button: 0 })); target.dispatchEvent(event('click', { button: 0 })); expect(gameplay).not.toHaveBeenCalled();
    target.dispatchEvent(event('click', { button: 0 })); expect(gameplay).toHaveBeenCalledOnce(); expect(click).not.toHaveBeenCalled(); guard.dispose();
  });
  it('blocks gameplay keys, retains native button activation and pauses once per Escape', () => {
    const target = new EventTarget(); const pause = vi.fn(); const guard = new TransitionInputGuard(target, { click: vi.fn(), togglePause: pause }); guard.setActive(true);
    for (const code of ['KeyF', 'KeyE', 'KeyW']) expect(target.dispatchEvent(event('keydown', { code }))).toBe(false);
    expect(target.dispatchEvent(event('keydown', { code: 'Tab' }))).toBe(true);
    target.dispatchEvent(event('keydown', { code: 'Escape', repeat: false })); target.dispatchEvent(event('keydown', { code: 'Escape', repeat: true })); expect(pause).toHaveBeenCalledOnce();
    guard.dispose(); expect(target.dispatchEvent(event('keydown', { code: 'KeyW' }))).toBe(true);
  });
  it('never skips on right click', () => {
    const target = new EventTarget(); const click = vi.fn(); const guard = new TransitionInputGuard(target, { click, togglePause: vi.fn() }); guard.setActive(true); target.dispatchEvent(event('click', { button: 2 })); expect(click).not.toHaveBeenCalled(); guard.dispose();
  });
  it('blocks held fire repeats across entry until a fresh press, including keys held before start', () => {
    const target = new EventTarget(); const guard = new TransitionInputGuard(target, { click: vi.fn(), togglePause: vi.fn() }); const gameplay = vi.fn(); target.addEventListener('keydown', gameplay);
    guard.setActive(true); target.dispatchEvent(event('keydown', { code: 'KeyF', repeat: false })); guard.setActive(false);
    target.dispatchEvent(event('keydown', { code: 'KeyF', repeat: true })); target.dispatchEvent(event('keydown', { code: 'KeyW', repeat: true })); expect(gameplay).not.toHaveBeenCalled();
    target.dispatchEvent(event('keyup', { code: 'KeyF' })); target.dispatchEvent(event('keydown', { code: 'KeyF', repeat: false })); target.dispatchEvent(event('keydown', { code: 'KeyF', repeat: true })); expect(gameplay).toHaveBeenCalledTimes(2); guard.dispose();
  });
  it('keeps native control activation without propagating Space or Enter to gameplay', () => {
    const target = new EventTarget(); const guard = new TransitionInputGuard(target, { click: vi.fn(), togglePause: vi.fn(), isControlTarget: () => true }); const gameplay = vi.fn(); target.addEventListener('keydown', gameplay); guard.setActive(true);
    expect(target.dispatchEvent(event('keydown', { code: 'Space' }))).toBe(true); expect(target.dispatchEvent(event('keydown', { code: 'Enter' }))).toBe(true); expect(gameplay).not.toHaveBeenCalled(); guard.dispose();
  });
  it('does not turn the last shot from the previous chapter into a skip', () => {
    const target = new EventTarget(); const click = vi.fn(); const guard = new TransitionInputGuard(target, { click, togglePause: vi.fn() });
    target.dispatchEvent(event('mousedown', { button: 0 })); guard.setActive(true);
    target.dispatchEvent(event('mouseup', { button: 0 })); target.dispatchEvent(event('click', { button: 0, detail: 1 })); expect(click).not.toHaveBeenCalled();
    target.dispatchEvent(event('mousedown', { button: 0 })); target.dispatchEvent(event('click', { button: 0, detail: 1 })); expect(click).toHaveBeenCalledOnce(); guard.dispose();
  });
  it('accepts keyboard activation only on overlay controls', () => {
    const target = new EventTarget(); const click = vi.fn(); const guard = new TransitionInputGuard(target, { click, togglePause: vi.fn(), isControlTarget: () => true }); guard.setActive(true);
    target.dispatchEvent(event('click', { button: 0, detail: 0 })); expect(click).toHaveBeenCalledOnce(); guard.dispose();
  });
});
