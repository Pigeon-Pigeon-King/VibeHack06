import { describe, expect, it } from 'vitest';
import { hitConfirmation, HIT_CONFIRMATION_COLOR, KILL_CONFIRMATION_COLOR } from '../src/ui/HitConfirmation';

describe('combat hit confirmation', () => {
  it('shows an ordinary hit as a white X at the supplied fade strength', () => {
    expect(hitConfirmation(0.65, 0, true)).toEqual({ opacity: 0.65, color: HIT_CONFIRMATION_COLOR });
  });

  it('shows a kill as a red X even without a separate hit flash', () => {
    expect(hitConfirmation(0, 0.8, true)).toEqual({ opacity: 0.8, color: KILL_CONFIRMATION_COLOR });
  });

  it('gives red priority when a hit and a kill overlap without weakening the feedback', () => {
    expect(hitConfirmation(1, 0.25, true)).toEqual({ opacity: 1, color: KILL_CONFIRMATION_COLOR });
    expect(hitConfirmation(0.25, 1, true)).toEqual({ opacity: 1, color: KILL_CONFIRMATION_COLOR });
  });

  it('hides the marker when no confirmation event is active', () => {
    expect(hitConfirmation(0, 0, true)).toEqual({ opacity: 0, color: HIT_CONFIRMATION_COLOR });
  });

  it('hides during pause, menus and results even while simulation flash values remain active', () => {
    expect(hitConfirmation(1, 1, false)).toEqual({ opacity: 0, color: HIT_CONFIRMATION_COLOR });
  });

  it.each([NaN, Infinity, -Infinity, -0.5])('ignores invalid or negative hit strength %s', value => {
    expect(hitConfirmation(value, 0, true)).toEqual({ opacity: 0, color: HIT_CONFIRMATION_COLOR });
    expect(hitConfirmation(value, 0.4, true)).toEqual({ opacity: 0.4, color: KILL_CONFIRMATION_COLOR });
  });

  it.each([NaN, Infinity, -Infinity, -0.5])('does not let invalid kill strength %s turn an ordinary hit red', value => {
    expect(hitConfirmation(0.4, value, true)).toEqual({ opacity: 0.4, color: HIT_CONFIRMATION_COLOR });
  });

  it('caps oversized event values at an opaque marker', () => {
    expect(hitConfirmation(4, 0, true)).toEqual({ opacity: 1, color: HIT_CONFIRMATION_COLOR });
    expect(hitConfirmation(0, 4, true)).toEqual({ opacity: 1, color: KILL_CONFIRMATION_COLOR });
  });

  it('does not retain a previous kill color after its event has expired', () => {
    hitConfirmation(1, 1, true);
    expect(hitConfirmation(0.5, 0, true)).toEqual({ opacity: 0.5, color: HIT_CONFIRMATION_COLOR });
    expect(hitConfirmation(0, 0, true).opacity).toBe(0);
  });
});
