import type { SceneFrame } from '../contracts';
import { OPENING_TIMELINE, openingHallTime } from '../content/opening-timeline';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Derived only from saved story time and facts, so pause/retry never start a second visual clock. */
export function openingView(frame: SceneFrame, facts: readonly string[]) {
  const active = frame.scenario === 'mainhall' && frame.phase >= 4;
  const t = active ? frame.phase >= 5 ? OPENING_TIMELINE.mainhall.finish : openingHallTime(frame.phaseTime, facts) : 0;
  const cue = OPENING_TIMELINE.mainhall;
  const collapsed = active && facts.includes('history-collapse');
  const fall = !collapsed ? 0 : !facts.includes('history-timeline-v2') ? 1 : ease((t - cue.collapse) / 1.35);
  const blastAge = t - cue.bombardment;
  const bombardment = active && facts.includes('history-timeline-v2') && facts.includes('history-bombardment') && blastAge >= 0 ? Math.max(0, 1 - blastAge / 4) : 0;
  return {
    time: t, collapsed, fall,
    blast: bombardment * bombardment,
    shake: frame.lowMotion ? 0 : bombardment * 0.025 * Math.sin(blastAge * 31),
    eyeLift: collapsed ? 1.15 * (1 - fall) : 0,
    blackout: !active ? 0 : frame.phase >= 5 ? 1 : facts.includes('zhou-unconscious') ? ease((t - cue.unconscious) / 2) : 0,
    reaching: active && facts.includes('zhao-reaches-rifle') && !facts.includes('zhao-captured') ? clamp((t - cue.weaponReach) / 0.35) : 0,
    restrained: active && facts.includes('zhao-captured') && !facts.includes('zhao-executed'),
    invaders: active && facts.includes('history-enemy-breach'),
  };
}
