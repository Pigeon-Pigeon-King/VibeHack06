import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/player/Input';
import { TouchInputState, type TouchAction } from '../src/player/TouchInputState';

const heldActions: TouchAction[] = ['fire', 'ads', 'sprint', 'crouch'];
const edgeActions: TouchAction[] = ['jump', 'reload', 'interact', 'cover', 'skip'];
const neutral = {
  forward: 0, right: 0, fire: false, ads: false, sprint: false, crouch: false,
  jump: false, reload: false, interact: false, cover: false, skip: false,
};

describe('touch action state', () => {
  it.each(heldActions)('keeps %s held across simulation steps and stops on release', action => {
    const touch = new TouchInputState();
    touch.setAction(action, true);
    expect(touch.read()[action]).toBe(true);
    expect(touch.read()[action]).toBe(true);
    expect(touch.isActionDown(action)).toBe(true);
    touch.setAction(action, false);
    expect(touch.read()[action]).toBe(false);
    expect(touch.isActionDown(action)).toBe(false);
  });

  it.each(edgeActions)('retains a quick %s tap until one fixed step consumes it', action => {
    const touch = new TouchInputState();
    touch.setAction(action, true);
    touch.setAction(action, false);
    expect(touch.isActionDown(action)).toBe(false);
    expect(touch.read()[action]).toBe(true);
    expect(touch.read()[action]).toBe(false);
    touch.setAction(action, true);
    expect(touch.read()[action]).toBe(true);
    touch.setAction(action, true);
    expect(touch.read()[action]).toBe(false);
    expect(touch.isActionDown(action)).toBe(true);
  });

  it('combines movement, shooting, aiming and simultaneous one-shot actions', () => {
    const touch = new TouchInputState();
    touch.setMove(0.3, -0.4);
    for (const action of ['fire', 'ads', ...edgeActions] as TouchAction[]) touch.setAction(action, true);
    expect(touch.read()).toEqual({
      forward: 0.3, right: -0.4, fire: true, ads: true, sprint: false, crouch: false,
      jump: true, reload: true, interact: true, cover: true, skip: true,
    });
    expect(touch.read()).toEqual({ ...neutral, forward: 0.3, right: -0.4, fire: true, ads: true });
  });

  it('keeps touch sprint mutually exclusive with aiming or crouching', () => {
    const touch = new TouchInputState();
    touch.setAction('sprint', true);
    touch.setAction('ads', true);
    expect(touch.isActionDown('sprint')).toBe(false);
    expect(touch.isActionDown('ads')).toBe(true);
    touch.setAction('crouch', true);
    expect(touch.read()).toMatchObject({ ads: true, crouch: true, sprint: false });
    touch.setAction('sprint', true);
    expect(touch.read()).toMatchObject({ ads: false, crouch: false, sprint: true });
    touch.setAction('crouch', true);
    expect(touch.read()).toMatchObject({ ads: false, crouch: true, sprint: false });
    touch.setAction('sprint', false);
    expect(touch.isActionDown('crouch')).toBe(true);
  });

  it('preserves analog magnitude and bounds or discards invalid axes', () => {
    const touch = new TouchInputState();
    touch.setMove(0.15, -0.2);
    expect(touch.read()).toMatchObject({ forward: 0.15, right: -0.2 });
    touch.setMove(30, -3);
    expect(touch.read()).toMatchObject({ forward: 1, right: -1 });
    touch.setMove(NaN, Infinity);
    expect(touch.read()).toEqual(neutral);
    touch.setMove(-Infinity, 0.5);
    expect(touch.read()).toMatchObject({ forward: 0, right: 0.5 });
  });

  it('clears movement, held actions and unconsumed taps together', () => {
    const touch = new TouchInputState();
    touch.setMove(1, 1);
    touch.setAction('fire', true);
    touch.setAction('jump', true);
    touch.setAction('jump', false);
    touch.clear();
    expect(touch.read()).toEqual(neutral);
    for (const action of [...heldActions, ...edgeActions]) expect(touch.isActionDown(action)).toBe(false);
  });
});

class TestDocument extends EventTarget {
  pointerLockElement: HTMLCanvasElement | null = null;
  hidden = false;
  exitPointerLock = vi.fn(() => {
    this.pointerLockElement = null;
    this.dispatchEvent(new Event('pointerlockchange'));
  });
}
class TestCanvas extends EventTarget {
  requestPointerLock = vi.fn<() => Promise<void> | void>(() => undefined);
}
const inputs: Input[] = [];
function setup(coarse = false) {
  const doc = new TestDocument(), canvas = new TestCanvas();
  const win = Object.assign(new EventTarget(), { matchMedia: vi.fn(() => ({ matches: coarse })) });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  const pause = vi.fn(), error = vi.fn();
  const input = new Input(canvas as unknown as HTMLCanvasElement, pause, error);
  inputs.push(input);
  return { input, doc, canvas, win, pause, error };
}
function event(target: EventTarget, type: string, values: Record<string, unknown> = {}): Event {
  const value = Object.assign(new Event(type, { cancelable: true }), values);
  target.dispatchEvent(value);
  return value;
}
function armTouch(input: Input): void {
  input.setTouchMove(0.5, -0.25);
  input.setTouchAction('fire', true);
  input.setTouchAction('reload', true);
  input.setTouchAction('reload', false);
}
afterEach(() => {
  for (const input of inputs.splice(0)) input.dispose();
  vi.unstubAllGlobals();
});

describe('Input touch integration', () => {
  it.each([true, false])('uses the coarse pointer preference (%s) by default', coarse => {
    const { input, win } = setup(coarse);
    expect(input.touchEnabled).toBe(coarse);
    expect(win.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('accepts touch input only while both input and touch mode are enabled', () => {
    const { input } = setup(true);
    armTouch(input); input.addTouchLook(0.2, 0.1);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
    input.enabled = true; armTouch(input);
    expect(input.read(1 / 60)).toMatchObject({ forward: 0.5, right: -0.25, fire: true, reload: true });
    input.setTouchEnabled(false);
    armTouch(input); input.addTouchLook(0.2, 0.1);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
    expect(input.isTouchActionDown('fire')).toBe(false);
    input.setTouchEnabled(true);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
  });

  it('drops old held input and pending taps when gameplay is disabled', () => {
    const { input, doc } = setup(true);
    input.enabled = true; armTouch(input); event(doc, 'keydown', { code: 'KeyW' });
    input.enabled = false;
    input.enabled = true;
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
    expect(input.isTouchActionDown('fire')).toBe(false);
  });

  it('can clear only touch state while retaining keyboard input, then clear both', () => {
    const { input, doc } = setup(true);
    input.enabled = true; armTouch(input);
    event(doc, 'keydown', { code: 'KeyW' }); event(doc, 'keydown', { code: 'KeyF' });
    event(doc, 'keydown', { code: 'Space' });
    input.clearTouch();
    expect(input.read(1 / 60)).toEqual({ ...neutral, forward: 1, fire: true, jump: true, yaw: 0, pitch: 0 });
    expect(input.isTouchActionDown('fire')).toBe(false);
    armTouch(input); input.clear();
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
  });

  it('merges keyboard and analog touch axes without exceeding the axis range', () => {
    const { input, doc } = setup(true);
    input.enabled = true;
    event(doc, 'keydown', { code: 'KeyW' }); event(doc, 'keydown', { code: 'KeyD' });
    event(doc, 'keydown', { code: 'KeyF' }); event(doc, 'keydown', { code: 'KeyR' });
    input.setTouchMove(0.4, -0.25);
    input.setTouchAction('reload', true); input.setTouchAction('reload', false);
    expect(input.read(1 / 60)).toEqual({ ...neutral, forward: 1, right: 0.75, fire: true, reload: true, yaw: 0, pitch: 0 });
    expect(input.read(1 / 60).reload).toBe(false);
    expect(input.isTouchActionDown('fire')).toBe(false);
    input.setTouchMove(-1, -1);
    expect(input.read(1 / 60)).toMatchObject({ forward: 0, right: 0, fire: true });
  });

  it('applies the same touch look at 30, 60 and 120 reads per second', () => {
    const { input } = setup(true);
    input.enabled = true; input.sensitivity = 1.5;
    for (const frames of [30, 60, 120]) {
      input.yaw = 0; input.pitch = 0;
      for (let frame = 0; frame < frames; frame++) {
        input.addTouchLook(-0.6 / frames, 0.2 / frames);
        input.read(1 / frames);
      }
      expect(input.yaw).toBeCloseTo(-0.9, 12);
      expect(input.pitch).toBeCloseTo(0.3, 12);
      const final = input.read(1 / 60);
      expect(input.read(1 / 30)).toEqual(final);
    }
  });

  it('applies signed radians immediately, clamps pitch and rejects invalid look values', () => {
    const { input } = setup(true);
    input.enabled = true; input.sensitivity = 2;
    input.addTouchLook(0.3, 0.2);
    expect(input.yaw).toBe(0.6); expect(input.pitch).toBe(0.4);
    input.addTouchLook(NaN, Infinity);
    expect(input.yaw).toBe(0.6); expect(input.pitch).toBe(0.4);
    input.addTouchLook(-Infinity, -0.1);
    expect(input.yaw).toBe(0.6); expect(input.pitch).toBe(0.2);
    input.addTouchLook(Number.MAX_VALUE, Number.MAX_VALUE);
    expect(input.yaw).toBe(0.6); expect(input.pitch).toBe(0.2);
    input.addTouchLook(0, 10); expect(input.pitch).toBe(1.35);
    input.addTouchLook(0, -10); expect(input.pitch).toBe(-1.35);
    input.sensitivity = NaN; input.addTouchLook(0.1, 0.1);
    expect(input.yaw).toBeCloseTo(0.7); expect(input.pitch).toBeCloseTo(-1.25);
  });

  it.each(['blur', 'visibilitychange', 'Escape'])('clears touch and keyboard state on %s before pausing', reason => {
    const { input, doc, win, pause } = setup(true);
    input.enabled = true; armTouch(input); event(doc, 'keydown', { code: 'KeyW' });
    if (reason === 'blur') event(win, 'blur');
    else if (reason === 'visibilitychange') { doc.hidden = true; event(doc, 'visibilitychange'); }
    else event(doc, 'keydown', { code: 'Escape' });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
  });

  it('does not request pointer lock or show a mouse error in touch mode', () => {
    const { input, canvas, doc, error, pause } = setup(true);
    input.enabled = true;
    input.lock(); event(canvas, 'click'); event(doc, 'pointerlockerror'); event(doc, 'pointerlockchange');
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled();
  });

  it('releases desktop pointer lock without pausing when touch mode is enabled', () => {
    const { input, canvas, doc, pause } = setup();
    input.enabled = true;
    doc.pointerLockElement = canvas as unknown as HTMLCanvasElement;
    event(doc, 'mousedown', { button: 0 }); event(doc, 'keydown', { code: 'KeyW' });
    input.setTouchEnabled(true);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
  });

  it('ignores the delayed unlock event even after switching back to keyboard mode', () => {
    const { input, canvas, doc, pause } = setup();
    input.enabled = true;
    doc.pointerLockElement = canvas as unknown as HTMLCanvasElement;
    doc.exitPointerLock.mockImplementation(() => { doc.pointerLockElement = null; });
    input.setTouchEnabled(true); input.setTouchEnabled(false);
    event(doc, 'pointerlockchange');
    expect(pause).not.toHaveBeenCalled();
  });

  it('releases a late desktop lock grant after switching to touch mode', () => {
    const { input, canvas, doc, pause, error } = setup();
    input.enabled = true; input.lock(); input.setTouchEnabled(true);
    error.mockClear();
    doc.pointerLockElement = canvas as unknown as HTMLCanvasElement;
    event(doc, 'pointerlockchange');
    expect(doc.pointerLockElement).toBeNull();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it.each(['touch', 'disabled', 'dispose'])('ignores an old pointer-lock rejection after %s', async transition => {
    const { input, canvas, doc, error } = setup();
    let reject!: (reason?: unknown) => void;
    canvas.requestPointerLock.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
    input.enabled = true; input.lock();
    if (transition === 'touch') input.setTouchEnabled(true);
    else if (transition === 'disabled') input.enabled = false;
    else input.dispose();
    error.mockClear(); reject(new Error('stale request')); await Promise.resolve();
    event(doc, 'pointerlockerror');
    expect(error).not.toHaveBeenCalled();
  });

  it('still reports a current desktop pointer-lock failure once', async () => {
    const { input, canvas, doc, error } = setup();
    let reject!: (reason?: unknown) => void;
    canvas.requestPointerLock.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
    input.enabled = true; input.lock();
    event(doc, 'pointerlockerror'); reject(new Error('denied')); await Promise.resolve();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('锁定鼠标未获允许'));
  });

  it('retains the desktop synchronous error fallback', () => {
    const { input, canvas, error } = setup();
    canvas.requestPointerLock.mockImplementation(() => { throw new Error('unsupported'); });
    input.enabled = true; input.lock();
    expect(error).toHaveBeenCalledWith('鼠标锁定不可用；方向键可转向。');
  });

  it('keeps the existing keyboard, mouse and edge mappings across fixed steps', () => {
    const { input, canvas, doc } = setup();
    input.enabled = true; input.sensitivity = 1.25;
    doc.pointerLockElement = canvas as unknown as HTMLCanvasElement;
    const keys = ['KeyW', 'KeyD', 'ShiftLeft', 'KeyC', 'Space', 'KeyR', 'KeyE', 'KeyQ', 'Enter', 'KeyF', 'ArrowLeft', 'ArrowUp'];
    for (const code of keys) event(doc, 'keydown', { code });
    event(doc, 'mousedown', { button: 0 }); event(doc, 'mousedown', { button: 2 });
    event(doc, 'mousemove', { movementX: 25, movementY: -40 });
    const first = input.read(0.25);
    expect(first).toMatchObject({
      forward: 1, right: 1, sprint: true, crouch: true, jump: true, fire: true,
      ads: true, reload: true, interact: true, cover: true, skip: true,
    });
    expect(first.yaw).toBeCloseTo(-25 * 0.0018 * 1.25 + 0.25 * 1.4);
    expect(first.pitch).toBeCloseTo(40 * 0.0018 * 1.25 + 0.25);
    event(doc, 'keydown', { code: 'Space' });
    expect(input.read(0)).toMatchObject({
      forward: 1, right: 1, sprint: true, crouch: true, fire: true, ads: true,
      jump: false, reload: false, interact: false, cover: false, skip: false,
    });
    event(doc, 'keyup', { code: 'Space' }); event(doc, 'keydown', { code: 'Space' });
    expect(input.read(0).jump).toBe(true);
    for (const code of keys) event(doc, 'keyup', { code });
    event(doc, 'mouseup', { button: 0 }); event(doc, 'mouseup', { button: 2 });
    expect(input.read(0)).toEqual({ ...neutral, yaw: first.yaw, pitch: first.pitch });
  });

  it('clears held desktop input when pointer lock is lost', () => {
    const { input, canvas, doc, pause } = setup();
    input.enabled = true; doc.pointerLockElement = canvas as unknown as HTMLCanvasElement;
    event(doc, 'mousedown', { button: 0 }); event(doc, 'keydown', { code: 'KeyW' });
    doc.pointerLockElement = null; event(doc, 'pointerlockchange');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
  });

  it('removes DOM listeners and touch state when disposed', () => {
    const { input, canvas, doc, win, pause, error } = setup(true);
    input.enabled = true; armTouch(input); input.dispose();
    event(win, 'blur'); doc.hidden = true; event(doc, 'visibilitychange');
    event(doc, 'keydown', { code: 'Escape' }); event(doc, 'pointerlockerror'); event(canvas, 'click');
    input.enabled = true; armTouch(input);
    expect(input.enabled).toBe(false);
    expect(input.read(1 / 60)).toEqual({ ...neutral, yaw: 0, pitch: 0 });
    expect(pause).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });
});
