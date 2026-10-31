import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/player/Input';
import { TouchControls } from '../src/ui/TouchControls';
import { TransitionInputGuard } from '../src/chapter-transition/TransitionInputGuard';

// A deliberately small DOM adapter: native EventTarget/AbortSignal run the real
// TouchControls listeners. It parses the component's own markup, models bubbling,
// capture ownership and focus, but provides NO browser layout or CSS validation.
class TestStyle {
  private values = new Map<string, string>();
  left = ''; top = '';
  setProperty(name: string, value: string): void { this.values.set(name, value); }
  getPropertyValue(name: string): string { return this.values.get(name) ?? ''; }
  removeProperty(name: string): void { this.values.delete(name); }
}

class TestTarget extends EventTarget {
  private readonly captures = new EventTarget();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    if (typeof options === 'boolean' ? options : options?.capture) this.captures.addEventListener(type, callback, options);
    else super.addEventListener(type, callback, options);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    if (typeof options === 'boolean' ? options : options?.capture) this.captures.removeEventListener(type, callback, options);
    else super.removeEventListener(type, callback, options);
  }
  capture(event: Event): void { this.captures.dispatchEvent(event); }
}

class TestElement extends TestTarget {
  readonly children: TestElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new TestStyle();
  private attrs = new Map<string, string>();
  private ownText = '';
  private pointerCaptures = new Set<number>();
  parentElement: TestElement | null = null;
  hidden = false; inert = false; tabIndex = 0;
  bounds = { x: 0, y: 0, width: 100, height: 52 };
  constructor(readonly ownerDocument: TestDocument, readonly tagName = 'DIV') { super(); }
  get className(): string { return this.attrs.get('class') ?? ''; }
  set className(value: string) { this.attrs.set('class', value); }
  readonly classList = {
    contains: (token: string): boolean => this.className.split(/\s+/).includes(token),
    toggle: (token: string, force?: boolean): boolean => {
      const tokens = new Set(this.className.split(/\s+/).filter(Boolean));
      const added = force ?? !tokens.has(token);
      if (added) tokens.add(token); else tokens.delete(token);
      this.className = [...tokens].join(' '); return added;
    },
    remove: (...tokens: string[]): void => { for (const token of tokens) this.classList.toggle(token, false); },
  };
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  get textContent(): string { return this.ownText + this.children.map(node => node.textContent).join(''); }
  set textContent(value: string) { this.children.splice(0); this.ownText = value; }
  set innerHTML(value: string) {
    this.children.splice(0); this.ownText = '';
    const stack: TestElement[] = [this];
    for (const token of value.matchAll(/<([^>]+)>|([^<]+)/g)) {
      if (token[2]) { stack.at(-1)!.ownText += token[2]; continue; }
      const tag = token[1];
      if (tag.startsWith('/')) { stack.pop(); continue; }
      const name = tag.match(/^([\w-]+)/)?.[1];
      if (!name) continue;
      const node = this.ownerDocument.createElement(name);
      for (const attr of tag.slice(name.length).matchAll(/([^\s=/]+)(?:="([^"]*)")?/g)) node.setAttribute(attr[1], attr[2] ?? '');
      stack.at(-1)!.append(node);
      if (!tag.endsWith('/') && !['input', 'br', 'img', 'hr'].includes(name)) stack.push(node);
    }
  }
  append(...nodes: TestElement[]): void {
    for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); }
  }
  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1); this.parentElement = null;
  }
  matches(selector: string): boolean {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
    if (/^[a-z]+$/.test(selector)) return this.tagName === selector.toUpperCase();
    throw new Error(`Unsupported test selector: ${selector}`);
  }
  closest(selector: string): TestElement | null {
    for (let node: TestElement | null = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  contains(node: TestElement): boolean {
    for (let current: TestElement | null = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  querySelectorAll(selector: string): TestElement[] {
    const selectors = selector.split(',').map(part => part.trim()), result: TestElement[] = [];
    for (const child of this.children) {
      if (selectors.some(part => child.matches(part))) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector: string): TestElement | null { return this.querySelectorAll(selector)[0] ?? null; }
  get clientWidth(): number { return this.bounds.width; }
  get clientHeight(): number { return this.bounds.height; }
  getBoundingClientRect() { const r = this.bounds; return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }; }
  getClientRects() {
    for (let node: TestElement | null = this; node; node = node.parentElement) if (node.hidden) return [];
    return [this.getBoundingClientRect()];
  }
  setPointerCapture(id: number): void { this.pointerCaptures.add(id); }
  hasPointerCapture(id: number): boolean { return this.pointerCaptures.has(id); }
  releasePointerCapture(id: number): void {
    if (this.pointerCaptures.delete(id)) emit(this, 'lostpointercapture', { pointerId: id });
  }
  focus(): void { this.ownerDocument.activeElement = this; }
  requestPointerLock(): void { /* Touch tests never require mouse lock. */ }
}

class TestDocument extends TestTarget {
  hidden = false;
  activeElement: TestElement | null = null;
  pointerLockElement: TestElement | null = null;
  createElement(tagName: string): TestElement { return new TestElement(this, tagName.toUpperCase()); }
  exitPointerLock(): void { this.pointerLockElement = null; }
}
class TestResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

// Use each leaf as event.target while walking its ancestor path. This catches
// missing root/window handlers instead of directly calling private methods.
function emit(target: EventTarget, type: string, values: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), values);
  Object.defineProperty(event, 'target', { value: target });
  let stopped = false;
  const stop = event.stopPropagation.bind(event);
  const stopImmediate = event.stopImmediatePropagation.bind(event);
  event.stopPropagation = () => { stopped = true; stop(); };
  event.stopImmediatePropagation = () => { stopped = true; stopImmediate(); };
  const path: EventTarget[] = [target];
  if (target instanceof TestElement) {
    for (let parent = target.parentElement; parent; parent = parent.parentElement) path.push(parent);
    path.push(target.ownerDocument, window);
  } else if (target === document) {
    path.push(window);
  }
  for (const node of [...path].reverse()) { if (node instanceof TestTarget) node.capture(event); if (stopped) return event; }
  for (const node of path) { node.dispatchEvent(event); if (stopped) break; }
  return event;
}

type State = Parameters<TouchControls['render']>[0];
const fixtures: Array<{ controls: TouchControls; input: Input }> = [];
function fixture({ width = 844, height = 390, enabled = true, mode = 'playing' as State['mode'], priorInert = false } = {}) {
  const doc = new TestDocument();
  const viewport = new TestTarget();
  const win = Object.assign(new TestTarget(), { visualViewport: viewport, matchMedia: () => ({ matches: false }) });
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  vi.stubGlobal('Element', TestElement); vi.stubGlobal('HTMLElement', TestElement);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const app = doc.createElement('main'); app.setAttribute('id', 'app'); app.bounds = { x: 0, y: 0, width, height };
  const container = doc.createElement('div'), gameInterface = doc.createElement('div'), canvas = doc.createElement('canvas');
  gameInterface.className = 'game-interface'; gameInterface.inert = priorInert;
  const resume = doc.createElement('button'); resume.setAttribute('data-action', 'resume');
  gameInterface.append(resume); container.append(gameInterface); app.append(canvas, container);
  const pause = vi.fn(() => { input.enabled = false; input.clear(); });
  const input = new Input(canvas as unknown as HTMLCanvasElement, pause, vi.fn());
  input.setTouchEnabled(enabled); input.enabled = mode === 'playing';
  const move = vi.fn((forward: number, right: number) => input.setTouchMove(forward, right));
  const look = vi.fn((yaw: number, pitch: number) => input.addTouchLook(yaw, pitch));
  const controls = new TouchControls(container as unknown as HTMLElement, {
    move, look, pause,
    action: (action, down) => input.setTouchAction(action, down),
    active: action => input.isTouchActionDown(action),
  });
  fixtures.push({ controls, input });
  let state: State = { enabled, mode, control: 'combat', interaction: '交互', coverAvailable: true, skipAvailable: false, epoch: 1 };
  const render = (change: Partial<State> = {}) => { state = { ...state, ...change }; controls.render(state); };
  const node = (selector: string): TestElement => { const found = app.querySelector(selector); if (!found) throw Error(`Missing ${selector}`); return found; };
  const control = (name: string) => node(`[data-touch-control="${name}"]`);
  control('move').bounds = { x: 40, y: 130, width: 310, height: 236 };
  const pointer = (name: string, id: number, x: number, y: number, type = 'pointerdown') =>
    emit(control(name), type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y });
  const drag = (id: number, x: number, y: number) => emit(win, 'pointermove', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
  const end = (id: number, type = 'pointerup') => emit(win, type, { pointerId: id, pointerType: 'touch' });
  const resize = (w: number, h: number, type = 'resize', target: EventTarget = win) => {
    app.bounds.width = w; app.bounds.height = h; emit(target, type);
  };
  const flushLayout = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(0); } };
  render();
  return { controls, input, doc, win, viewport, app, container, gameInterface, resume, move, look, pause, render, node, control, pointer, drag, end, resize, frames, flushLayout };
}

afterEach(() => {
  for (const item of fixtures.splice(0)) { item.controls.dispose(); item.input.dispose(); }
  vi.unstubAllGlobals();
});

describe('TouchControls mobile event wiring (DOM substitute, not device evidence)', () => {
  it('starts neutral at the first contact, keeps its centre against a second finger, and relocates on the next contact', () => {
    const c = fixture();
    const stick = c.node('.touch-joystick');
    expect(stick.hidden).toBe(true);
    expect(c.pointer('move', 11, 120, 260).defaultPrevented).toBe(true);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 0, right: 0 });
    expect(stick.style.left).toBe('80px'); expect(stick.style.top).toBe('130px');
    expect(stick.hidden).toBe(false); expect(c.control('move').hasPointerCapture(11)).toBe(true);
    c.drag(11, 120, 221.6);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 1, right: 0 });
    c.pointer('move', 22, 260, 310); c.drag(22, 300, 350); c.end(22);
    expect(stick.style.left).toBe('80px'); expect(stick.style.top).toBe('130px');
    expect(c.control('move').hasPointerCapture(22)).toBe(false);
    expect(c.input.read(1 / 60).forward).toBe(1);
    c.end(11);
    expect(stick.hidden).toBe(true); expect(c.control('move').hasPointerCapture(11)).toBe(false);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 0, right: 0 });
    c.pointer('move', 33, 280, 290);
    expect(stick.style.left).toBe('240px'); expect(stick.style.top).toBe('160px');
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 0, right: 0 });
    c.drag(33, 260.8, 290);
    expect(c.input.read(1 / 60).right).toBeCloseTo(-(0.5 - 0.15) / 0.85);
  });

  it('keeps moving while a different firing finger looks, and cancelling fire does not release movement', () => {
    const c = fixture();
    c.pointer('move', 11, 110, 250); c.drag(11, 110, 211.6);
    c.pointer('fire', 12, 710, 250); c.drag(12, 749, 230.5);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 1, fire: true });
    expect(c.input.yaw).toBeCloseTo(-0.26); expect(c.input.pitch).toBeCloseTo(0.13);
    c.end(12, 'pointercancel');
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 1, fire: false });
    expect(c.control('move').hasPointerCapture(11)).toBe(true);
    expect(c.control('fire').hasPointerCapture(12)).toBe(false);
    c.end(11);
    expect(c.input.read(1 / 60).forward).toBe(0);
  });

  it('releases capture and active toggle on lostpointercapture through the root listener', () => {
    const c = fixture(); c.pointer('ads', 15, 650, 240);
    expect(c.input.isTouchActionDown('ads')).toBe(true);
    c.control('ads').releasePointerCapture(15);
    expect(c.input.isTouchActionDown('ads')).toBe(false);
    expect(c.control('ads').classList.contains('is-held')).toBe(false);
  });

  it.each(['resize', 'orientationchange', 'visualViewport'])('clears held controls and pauses once when portrait arrives through %s', trigger => {
    const c = fixture();
    c.pointer('move', 11, 120, 260); c.drag(11, 120, 221.6);
    c.pointer('ads', 12, 650, 240); c.end(12);
    c.pointer('fire', 13, 710, 250);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 1, ads: true, fire: true });
    c.resize(390, 844, trigger === 'visualViewport' ? 'resize' : trigger, trigger === 'visualViewport' ? c.viewport : c.win);
    expect(c.pause).toHaveBeenCalledTimes(1);
    expect(c.input.read(1 / 60)).toMatchObject({ forward: 0, right: 0, fire: false, ads: false });
    expect(c.node('.touch-joystick').hidden).toBe(true);
    expect(c.control('move').hasPointerCapture(11)).toBe(false); expect(c.control('fire').hasPointerCapture(13)).toBe(false);
    expect(c.node('.touch-controls').hidden).toBe(true); expect(c.node('.touch-rotation-notice').hidden).toBe(false);
    expect(c.gameInterface.inert).toBe(true); expect(c.doc.activeElement).toBe(c.node('.touch-rotation-notice'));
    emit(c.win, 'resize'); emit(c.win, 'orientationchange'); emit(c.viewport, 'resize'); c.render();
    expect(c.pause).toHaveBeenCalledTimes(1);
    c.pointer('move', 21, 120, 260); c.drag(11, 100, 180); c.drag(21, 100, 180);
    expect(c.node('.touch-joystick').hidden).toBe(true);
    c.render({ mode: 'paused' }); c.resize(844, 390);
    expect(c.pause).toHaveBeenCalledTimes(1); expect(c.input.enabled).toBe(false);
    expect(c.node('.touch-rotation-notice').hidden).toBe(true); expect(c.node('.touch-controls').hidden).toBe(true);
    expect(c.gameInterface.inert).toBe(false); expect(c.doc.activeElement).toBe(c.resume);
    c.pointer('fire', 31, 710, 250);
    expect(c.input.read(1 / 60).fire).toBe(false);
  });

  it('shows a portrait guard in the menu without pausing and keeps it through a zero-size intermediate viewport', () => {
    const c = fixture({ width: 390, height: 844, mode: 'menu' });
    expect(c.node('.touch-rotation-notice').hidden).toBe(false); expect(c.gameInterface.inert).toBe(true);
    expect(c.pause).not.toHaveBeenCalled();
    c.resize(0, 0);
    expect(c.node('.touch-rotation-notice').hidden).toBe(false); expect(c.gameInterface.inert).toBe(true);
    c.resize(844, 390);
    expect(c.node('.touch-rotation-notice').hidden).toBe(true); expect(c.gameInterface.inert).toBe(false);
    expect(c.pause).not.toHaveBeenCalled();
  });

  it('does not guard desktop portrait when touch controls are disabled, and disabling touch removes an existing guard', () => {
    const c = fixture({ width: 390, height: 844, enabled: false });
    expect(c.node('.touch-rotation-notice').hidden).toBe(true); expect(c.gameInterface.inert).toBe(false);
    c.resize(390, 844); expect(c.pause).not.toHaveBeenCalled();
    c.input.setTouchEnabled(true); c.render({ enabled: true });
    expect(c.pause).toHaveBeenCalledTimes(1); expect(c.gameInterface.inert).toBe(true);
    c.input.setTouchEnabled(false); c.render({ enabled: false, mode: 'paused' });
    expect(c.node('.touch-rotation-notice').hidden).toBe(true); expect(c.gameInterface.inert).toBe(false);
    expect(c.app.classList.contains('touch-portrait')).toBe(false);
    c.resize(390, 844); expect(c.pause).toHaveBeenCalledTimes(1);
  });

  it('clears a held landscape contact on resize without pausing and requires a fresh contact', () => {
    const c = fixture(); c.pointer('move', 11, 120, 260); c.drag(11, 120, 221.6);
    c.resize(667, 375);
    expect(c.pause).not.toHaveBeenCalled(); expect(c.input.enabled).toBe(true);
    expect(c.input.read(1 / 60).forward).toBe(0); expect(c.node('.touch-joystick').hidden).toBe(true);
    c.drag(11, 110, 180); expect(c.input.read(1 / 60).forward).toBe(0);
    c.pointer('move', 12, 100, 240); c.drag(12, 100, 201.6);
    expect(c.input.read(1 / 60).forward).toBe(1);
  });

  it('keeps the rotation notice outside hidden game UI and defers transition pause until synchronous start completes', async () => {
    const c = fixture({ width: 390, height: 844, mode: 'transition' });
    c.container.hidden = true; c.container.inert = true;
    const notice = c.node('.touch-rotation-notice');
    expect(notice.parentElement).toBe(c.app); expect(notice.getClientRects()).toHaveLength(1);
    expect(c.node('.touch-controls').getClientRects()).toHaveLength(0);
    let transitionStarted = false;
    c.pause.mockImplementation(() => { expect(transitionStarted).toBe(true); c.input.clear(); });
    expect(c.pause).not.toHaveBeenCalled();
    transitionStarted = true;
    await Promise.resolve();
    expect(c.pause).toHaveBeenCalledTimes(1);
    c.render(); emit(c.viewport, 'resize'); await Promise.resolve();
    expect(c.pause).toHaveBeenCalledTimes(1);
    c.resize(844, 390); await Promise.resolve();
    expect(notice.hidden).toBe(true); expect(c.pause).toHaveBeenCalledTimes(1);
    expect(c.input.enabled).toBe(false);
  });

  it('abandons pending transition pause after disposal, leaving portrait, disabling touch or leaving transition', async () => {
    for (const change of ['dispose', 'landscape', 'disable', 'menu'] as const) {
      const c = fixture({ width: 390, height: 844, mode: 'transition' });
      if (change === 'dispose') c.controls.dispose();
      else if (change === 'landscape') c.resize(844, 390);
      else if (change === 'disable') c.render({ enabled: false });
      else c.render({ mode: 'menu' });
      await Promise.resolve();
      expect(c.pause, change).not.toHaveBeenCalled();
      c.controls.dispose(); c.input.dispose();
    }
  });

  it('captures portrait taps and game keys before the chapter guard, including modified pointer events, but allows browser key combinations', async () => {
    const c = fixture({ width: 390, height: 844, mode: 'transition' });
    const skip = vi.fn(), togglePause = vi.fn();
    const transition = new TransitionInputGuard(c.doc, { click: skip, togglePause });
    transition.setActive(true);
    const notice = c.node('.touch-rotation-notice');
    try {
      for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }]) {
        for (const type of ['pointerdown', 'pointerup', 'click']) {
          expect(emit(notice, type, { pointerId: 71, pointerType: 'touch', button: 0, detail: 1, ...modifiers }).defaultPrevented).toBe(true);
        }
        expect(skip).not.toHaveBeenCalled();
      }
      for (const code of ['Escape', 'Enter', 'Space', 'KeyW']) {
        expect(emit(notice, 'keydown', { code, repeat: false }).defaultPrevented).toBe(true);
        expect(emit(notice, 'keyup', { code }).defaultPrevented).toBe(true);
      }
      expect(togglePause).not.toHaveBeenCalled();
      transition.setActive(false);
      const browserKey = vi.fn(); c.doc.addEventListener('keydown', browserKey, { capture: true });
      expect(emit(notice, 'keydown', { code: 'KeyL', metaKey: true, repeat: false }).defaultPrevented).toBe(false);
      expect(emit(notice, 'keydown', { code: 'KeyR', ctrlKey: true, repeat: false }).defaultPrevented).toBe(false);
      expect(browserKey).toHaveBeenCalledTimes(2);
      await Promise.resolve();
      expect(c.pause).toHaveBeenCalledTimes(1);
    } finally { transition.dispose(); }
  });

  it.each([false, true])('dispose restores the prior inert value %s, removes overlays and disconnects all input', priorInert => {
    const c = fixture({ priorInert });
    c.pointer('move', 11, 120, 260); c.drag(11, 120, 221.6);
    c.resize(390, 844); const root = c.node('.touch-controls'), zone = c.control('move');
    const notice = c.node('.touch-rotation-notice'); const moveCalls = c.move.mock.calls.length;
    c.controls.dispose(); const afterDisposeMoves = c.move.mock.calls.length;
    expect(afterDisposeMoves).toBeGreaterThanOrEqual(moveCalls);
    expect(c.gameInterface.inert).toBe(priorInert);
    expect(root.parentElement).toBe(null); expect(notice.parentElement).toBe(null); expect(c.frames.size).toBe(0);
    expect(c.app.classList.contains('touch-input')).toBe(false); expect(c.app.classList.contains('touch-portrait')).toBe(false);
    emit(zone, 'pointerdown', { pointerId: 21, pointerType: 'touch', clientX: 100, clientY: 230 });
    c.resize(844, 390); c.resize(390, 844); emit(c.viewport, 'resize');
    c.controls.render({ enabled: true, mode: 'playing', control: 'combat', interaction: '', coverAvailable: false, skipAvailable: false, epoch: 2 });
    expect(c.pause).toHaveBeenCalledTimes(1); expect(c.move).toHaveBeenCalledTimes(afterDisposeMoves);
    expect(zone.hasPointerCapture(21)).toBe(false); expect(c.gameInterface.inert).toBe(priorInert);
    c.controls.dispose(); expect(c.move).toHaveBeenCalledTimes(afterDisposeMoves);
  });
});
