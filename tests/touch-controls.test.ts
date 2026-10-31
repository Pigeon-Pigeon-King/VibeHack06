import { describe, expect, it } from 'vitest';
import type { TouchAction } from '../src/player/TouchInputState';
import { TouchGestures } from '../src/ui/touch-gestures';

function controls() {
  const held = new Set<TouchAction>();
  const movement: number[][] = [], look: number[][] = [], actions: Array<[TouchAction, boolean]> = [];
  const gestures = new TouchGestures({
    move: (forward, right) => movement.push([forward, right]),
    look: (yaw, pitch) => look.push([yaw, pitch]),
    action: (action, down) => { actions.push([action, down]); if (down) held.add(action); else held.delete(action); },
    active: action => held.has(action),
  });
  return { gestures, held, movement, look, actions };
}

describe('touch gesture ownership and cancellation', () => {
  it('keeps two-thumb movement while a firing pointer aims and is cancelled', () => {
    const c = controls();
    c.gestures.begin('move', 1, 50, 0, { x: 50, y: 50, radius: 50 });
    c.gestures.begin('fire', 2, 700, 230);
    c.gestures.move(2, 760, 200, 390);
    expect(c.look[0][0]).toBeLessThan(0);
    expect(c.look[0][1]).toBeGreaterThan(0);
    expect(c.held.has('fire')).toBe(true);
    c.gestures.release(2);
    expect(c.held.has('fire')).toBe(false);
    expect(c.gestures.owner('move')).toBe(1);
    expect(c.movement.at(-1)).toEqual([1, 0]);
    c.gestures.release(1);
    expect(c.movement.at(-1)).toEqual([0, 0]);
  });

  it('ignores a second finger on the same button without ending the first hold', () => {
    const c = controls();
    expect(c.gestures.begin('fire', 1, 10, 10)).toBe(true);
    expect(c.gestures.begin('fire', 2, 10, 10)).toBe(false);
    expect(c.gestures.release(2)).toBe(false);
    expect(c.held.has('fire')).toBe(true);
    expect(c.actions).toEqual([['fire', true]]);
    c.gestures.release(1);
    expect(c.actions).toEqual([['fire', true], ['fire', false]]);
  });

  it('cannot reuse a still-held pointer for another control', () => {
    const c = controls();
    c.gestures.begin('look', 1, 50, 50);
    expect(c.gestures.begin('jump', 1, 50, 50)).toBe(false);
    expect(c.held.has('jump')).toBe(false);
    c.gestures.release(1);
    expect(c.gestures.begin('jump', 1, 50, 50)).toBe(true);
  });

  it('resets every held action, toggle and stick after blur, resize, mode or epoch changes', () => {
    const c = controls();
    c.gestures.begin('move', 1, 25, -50, { x: 0, y: 0, radius: 50 });
    c.gestures.begin('fire', 2, 100, 20);
    c.gestures.begin('ads', 3, 100, 20);
    c.gestures.release(3);
    c.gestures.begin('interact', 4, 100, 20);
    expect(c.held.has('ads')).toBe(true);
    c.gestures.reset();
    expect([...c.held]).toEqual([]);
    expect(c.movement.at(-1)).toEqual([0, 0]);
    expect(c.gestures.joystick()).toEqual({ x: 0, y: 0 });
    expect(c.gestures.release(1)).toBe(false);
    expect(c.gestures.release(2)).toBe(false);
    expect(c.gestures.release(4)).toBe(false);
    const priorLook = c.look.length;
    c.gestures.move(2, 200, 100, 390);
    expect(c.look).toHaveLength(priorLook);
  });

  it('cancels a newly hidden context control without releasing another live finger', () => {
    const c = controls();
    c.gestures.begin('move', 1, 0, -50, { x: 0, y: 0, radius: 50 });
    c.gestures.begin('cover', 2, 0, 0);
    c.gestures.cancel('cover');
    expect(c.held.has('cover')).toBe(false);
    expect(c.gestures.owner('move')).toBe(1);
    expect(c.movement.at(-1)).toEqual([1, 0]);
  });

  it('releases an interrupted toggle contact while preserving another pointer', () => {
    const c = controls();
    c.gestures.begin('look', 1, 0, 0);
    c.gestures.begin('ads', 2, 0, 0);
    c.gestures.cancel('ads');
    expect(c.held.has('ads')).toBe(false);
    expect(c.gestures.owner('look')).toBe(1);
    c.gestures.move(1, 39, 0, 390);
    expect(c.look[0][0]).toBeCloseTo(-0.26);
  });

  it('reads toggle state from Input after another action changed it', () => {
    const c = controls();
    c.gestures.begin('sprint', 1, 0, 0); c.gestures.release(1);
    expect(c.held.has('sprint')).toBe(true);
    c.held.delete('sprint'); // Input cancels sprint when ADS or crouch takes over.
    c.gestures.begin('sprint', 2, 0, 0); c.gestures.release(2);
    expect(c.held.has('sprint')).toBe(true);
    c.gestures.begin('sprint', 3, 0, 0); c.gestures.release(3);
    expect(c.held.has('sprint')).toBe(false);
  });
});

describe('analog movement and viewport-scaled look', () => {
  it('has a quiet center, gradual movement and bounded diagonal speed', () => {
    const c = controls();
    c.gestures.begin('move', 1, 0, 0, { x: 0, y: 0, radius: 50 });
    c.gestures.move(1, 5, 0, 390);
    expect(c.movement.at(-1)).toEqual([0, 0]);
    c.gestures.move(1, 25, 0, 390);
    expect(c.movement.at(-1)![1]).toBeGreaterThan(0);
    expect(c.movement.at(-1)![1]).toBeLessThan(0.5);
    c.gestures.move(1, 100, -100, 390);
    expect(Math.hypot(...c.movement.at(-1)!)).toBeCloseTo(1);
    expect(Math.hypot(c.gestures.joystick().x, c.gestures.joystick().y)).toBeCloseTo(50);
  });

  it('uses equivalent angles for the same proportional drag on different viewports', () => {
    const phone = controls(), tablet = controls();
    phone.gestures.begin('look', 1, 0, 0); tablet.gestures.begin('look', 1, 0, 0);
    phone.gestures.move(1, 39, 39, 390); tablet.gestures.move(1, 78, 78, 780);
    expect(phone.look[0][0]).toBeCloseTo(tablet.look[0][0]);
    expect(phone.look[0][1]).toBeCloseTo(tablet.look[0][1]);
    expect(phone.look[0][0]).toBeCloseTo(-0.26);
    expect(phone.look[0][1]).toBeCloseTo(-0.26);
  });

  it('rejects invalid contacts and ignores invalid move samples', () => {
    const c = controls();
    expect(c.gestures.begin('move', 1, NaN, 0)).toBe(false);
    c.gestures.begin('look', 1, 0, 0);
    c.gestures.move(1, Infinity, 0, 390);
    expect(c.look).toEqual([]);
    c.gestures.move(1, 39, 0, 390);
    expect(c.look[0][0]).toBeCloseTo(-0.26);
  });
});
