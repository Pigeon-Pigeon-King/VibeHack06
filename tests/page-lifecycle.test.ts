import { describe, expect, it, vi } from 'vitest';
import { bindPageLifecycle } from '../src/runtime/PageLifecycle';

class NavigationEvent extends Event {
  constructor(type: string, readonly persisted: boolean) { super(type); }
}
function page() {
  const target = new EventTarget(), controller = new AbortController();
  const actions = { suspend: vi.fn(), restore: vi.fn(), dispose: vi.fn() };
  bindPageLifecycle(target, actions, controller.signal);
  return { actions, controller, send: (type: string, persisted: boolean) => target.dispatchEvent(new NavigationEvent(type, persisted)) };
}

describe('page cache lifecycle', () => {
  it('keeps resources for cached returns and restores exactly once per visit', () => {
    const p = page();
    p.send('pageshow', false); expect(p.actions.restore).not.toHaveBeenCalled();
    p.send('pagehide', true); p.send('pagehide', true);
    expect(p.actions.suspend).toHaveBeenCalledTimes(1);
    expect(p.actions.dispose).not.toHaveBeenCalled();
    p.send('pageshow', true); p.send('pageshow', true);
    expect(p.actions.restore).toHaveBeenCalledTimes(1);
    p.send('pagehide', true); p.send('pageshow', true);
    expect(p.actions.suspend).toHaveBeenCalledTimes(2);
    expect(p.actions.restore).toHaveBeenCalledTimes(2);
    expect(p.actions.dispose).not.toHaveBeenCalled();
  });
  it('disposes an uncached navigation once and never resurrects its renderer', () => {
    const p = page();
    p.send('pagehide', false); p.send('pagehide', false); p.send('pageshow', true);
    expect(p.actions.dispose).toHaveBeenCalledTimes(1);
    expect(p.actions.restore).not.toHaveBeenCalled();
    expect(p.actions.suspend).not.toHaveBeenCalled();
  });
  it('can discard a previously cached page without resuming it', () => {
    const p = page();
    p.send('pagehide', true); p.send('pagehide', false); p.send('pageshow', true);
    expect(p.actions.dispose).toHaveBeenCalledTimes(1);
    expect(p.actions.restore).not.toHaveBeenCalled();
  });
  it('removes both listeners when the owner is disposed', () => {
    const p = page(); p.send('pagehide', true); p.controller.abort();
    p.send('pageshow', true); p.send('pagehide', false);
    expect(p.actions.restore).not.toHaveBeenCalled();
    expect(p.actions.dispose).not.toHaveBeenCalled();
  });
});
