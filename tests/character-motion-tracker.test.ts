import { describe, expect, it } from 'vitest';
import { CHARACTER_FALL_SECONDS, CharacterMotionTracker } from '../src/presentation/CharacterMotionTracker';

describe('simulation-timed presentation motion', () => {
  it('retains run speed on repeated renders and stops when simulation actually stops', () => {
    const tracker = new CharacterMotionTracker();
    tracker.speed('runner', [0, 0, 0], 10);
    for (let tick = 1; tick <= 10; tick++) {
      // Four presentation frames per physics step, as on a 240Hz screen.
      for (let frame = 0; frame < 4; frame++) {
        expect(tracker.speed('runner', [tick / 15, 0, 0], 10 + tick / 60)).toBeCloseTo(4, 7);
      }
    }
    expect(tracker.speed('runner', [10 / 15, 0, 0], 10 + 11 / 60)).toBe(0);
  });

  it('does not turn teleports, checkpoint rewinds or replaced actors into a running pose', () => {
    const tracker = new CharacterMotionTracker();
    tracker.speed('resident', [0, 0, 0], 5);
    expect(tracker.speed('resident', [30, 0, 10], 5 + 1 / 60)).toBe(0);
    expect(tracker.speed('resident', [0, 0, 0], 1)).toBe(0);
    expect(tracker.speed('resident', [0.05, 0, 0], 1 + 1 / 60)).toBeCloseTo(3);
    tracker.remove('resident'); expect(tracker.speed('resident', [3, 0, 0], 2)).toBe(0);
    tracker.clear(); expect(tracker.speed('resident', [-10, 0, 0], 3)).toBe(0);
  });

  it('keeps a new death continuous across repeated render frames and pauses', () => {
    const tracker = new CharacterMotionTracker();
    expect(tracker.fallProgress('enemy', false, 1)).toBe(0);
    expect(tracker.fallProgress('enemy', true, 2)).toBe(0);
    for (let frame = 0; frame < 240; frame++) expect(tracker.fallProgress('enemy', true, 2)).toBe(0);
    expect(tracker.fallProgress('enemy', true, 2 + CHARACTER_FALL_SECONDS / 2)).toBeCloseTo(0.5);
    expect(tracker.fallProgress('enemy', true, 2 + CHARACTER_FALL_SECONDS)).toBeCloseTo(1);
    expect(tracker.fallProgress('enemy', true, 20)).toBe(1);
  });

  it('keeps loaded cadavers settled and resets death sampling with actor lifetime', () => {
    const tracker = new CharacterMotionTracker();
    expect(tracker.fallProgress('old-body', true, 10)).toBe(1);
    expect(tracker.fallProgress('old-body', true, 10.1)).toBe(1);
    expect(tracker.fallProgress('old-body', true, 2)).toBe(1);
    tracker.remove('old-body');
    expect(tracker.fallProgress('old-body', false, 3)).toBe(0);
    expect(tracker.fallProgress('old-body', true, 3.1)).toBe(0);
    tracker.clear(); expect(tracker.fallProgress('old-body', true, 3.2)).toBe(1);
  });
});
