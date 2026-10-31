import { describe, expect, it } from 'vitest';
import type { CharacterModel } from '../src/contracts';
import type { CombatState } from '../src/actors/CombatTactics';
import { TacticalPoseController, characterCombatPose } from '../src/presentation/TacticalAnimations';
import type { TacticalClipName } from '../src/assets/tactical-catalog';

type Pose = Parameters<CharacterModel['setPose']>[0];
const base: Pose = { walk: 0, aiming: false, down: false, armed: true, animationTime: 0 };
const duration = (name: TacticalClipName) => name.includes('fire') ? 0.32 : name.includes('peek') ? 1.4
  : name === 'crouch_down' || name === 'stand_up' ? 0.8 : name === 'cover_enter' || name === 'cover_exit' ? 0.9 : 2;
const cover = (phase: NonNullable<Pose['combat']>['phase'], side: 'left' | 'right' = 'left', moving = false): Pose['combat'] =>
  ({ phase, side, moving, coverKey: 'solid:crate:0,0,0' });
function fixture() {
  const controller = new TacticalPoseController();
  return { controller, sample(time: number, extra: Partial<Pose> = {}, moving = false, eligible = true) {
    return controller.select({ ...base, ...extra, animationTime: time }, eligible, moving, moving ? 0.5 : 0, duration);
  } };
}

describe('real tactical state and event selection', () => {
  it('crouches on approach, enters only on slot arrival, observes both sides, aims without firing and exits once', () => {
    const f = fixture();
    expect(f.sample(0)?.name).toBe('ready_idle');
    expect(f.sample(1, { crouched: true, combat: cover('seek', 'left', true) }, true)?.name).toBe('crouch_down');
    expect(f.sample(1.9, { crouched: true, combat: cover('seek', 'left', true) }, true)?.name).toBe('crouch_walk');
    expect(f.sample(2, { crouched: true, combat: cover('hide') })?.name).toBe('cover_enter');
    expect(f.sample(3, { crouched: true, combat: cover('hide') })?.name).toBe('cover_idle');
    const peek = f.sample(3.1, { combat: cover('peek', 'left', true) }, true)!;
    expect(peek.name).toBe('cover_peek_left'); expect(peek.loop).toBe(false);
    expect(f.sample(3.7, { combat: cover('peek'), aiming: true })?.name).toBe('cover_aim_left');
    expect(f.sample(4, { combat: cover('peek'), aiming: true })?.name).toBe('cover_aim_left');
    const shot = f.sample(4.1, { combat: cover('peek'), aiming: true, lastShotAt: 4.1 })!;
    expect(shot.name).toBe('cover_fire_left'); expect(shot.time).toBeCloseTo(0.055); expect(shot.loop).toBe(false);
    expect(f.sample(4.1, { combat: cover('peek'), aiming: true, lastShotAt: 4.1 })).toEqual(shot); // pause
    expect(f.sample(4.5, { combat: cover('peek'), aiming: true, lastShotAt: 4.1 })?.name).toBe('cover_aim_left');
    expect(f.sample(4.6, { combat: cover('recover'), crouched: true })?.name).toBe('cover_idle');
    expect(f.sample(5, { combat: cover('peek', 'right', true) }, true)?.name).toBe('cover_peek_right');
    expect(f.sample(5.5, { combat: cover('peek', 'right'), aiming: true })?.name).toBe('cover_aim_right');
    expect(f.sample(5.6, { combat: cover('peek', 'right'), aiming: true, lastShotAt: 5.6 })?.name).toBe('cover_fire_right');
    expect(f.sample(6, { combat: { phase: 'return', moving: true, side: 'right' } }, true)?.name).toBe('cover_exit');
    expect(f.sample(7, { combat: { phase: 'return', moving: true, side: 'right' } }, true)).toBeUndefined(); // canonical walk
  });

  it('stands when an approach is abandoned, respects priority, and reconstructs restored states without replaying transitions', () => {
    const f = fixture(); f.sample(0);
    expect(f.sample(1, { crouched: true, combat: cover('seek') })?.name).toBe('crouch_down');
    expect(f.sample(1.9, { crouched: true })?.name).toBe('crouch_idle');
    expect(f.sample(2, { crouched: false })?.name).toBe('stand_up');
    expect(f.sample(2.9)?.name).toBe('ready_idle');
    f.sample(3, { combat: cover('peek'), aiming: true, lastShotAt: 3 });
    expect(f.sample(3.1, { down: true, combat: cover('peek'), lastShotAt: 3 }, false, false)).toBeUndefined();
    expect(f.sample(10, { combat: cover('hide'), crouched: true })?.name).toBe('cover_idle');
    expect(f.sample(2, { combat: cover('peek'), aiming: true })?.name).toBe('cover_aim_left'); // time rewind, no invented fire
    expect(f.sample(2.1, { combat: cover('peek'), aiming: true, lastShotAt: 3 })?.name).toBe('cover_aim_left'); // future event ignored
  });

  it('derives left/right from the actual hide/peek displacement and target bearing', () => {
    const state = { phase: 'peek', moving: false, cover: { solid: 'crate', hide: [0, 0, 0], peek: [1, 0, 0] }, lastSeen: [0, 1.5, 12] } as CombatState;
    expect(characterCombatPose(state)?.side).toBe('left');
    state.cover!.peek = [-1, 0, 0]; expect(characterCombatPose(state)?.side).toBe('right');
    state.lastSeen = [12, 1.5, 0]; state.cover!.peek = [0, 0, -1]; expect(characterCombatPose(state)?.side).toBe('left');
    state.cover = null; expect(characterCombatPose(state)?.coverKey).toBeUndefined(); expect(characterCombatPose()).toBeUndefined();
  });
});
