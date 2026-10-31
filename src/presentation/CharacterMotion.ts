/** Supplemental poses on the existing rig; these are not supplier animation clips. */
export type ProceduralGait = 'run' | 'crouch';
export interface GaitFoot { forward: number; lift: number; swing: number; planted: boolean }
export interface CharacterGait {
  cycle: number; strideMeters: number; bodyLift: number;
  left: GaitFoot; right: GaitFoot;
}
const fract = (value: number) => ((value % 1) + 1) % 1;

/**
 * Distance is authoritative game travel in metres. In the stance part of a
 * cycle, foot.forward decreases by exactly the travelled distance; no separate
 * wall clock or root movement competes with physics. Each body plan keeps its
 * own height, leg lengths and foot anchors.
 */
export function sampleCharacterGait(distanceMeters: number, heightMeters: number, gait: ProceduralGait,
  legLengthMeters = heightMeters * 0.46): CharacterGait {
  const running = gait === 'run', strideMeters = legLengthMeters * (running ? 3.1 : 1.15);
  const cycle = fract((Number.isFinite(distanceMeters) ? distanceMeters : 0) / strideMeters);
  const stance = running ? 0.28 : 0.64, travel = strideMeters * stance;
  const foot = (phase: number): GaitFoot => {
    const planted = phase <= stance, swing = planted ? 0 : (phase - stance) / (1 - stance);
    const eased = swing * swing * (3 - 2 * swing);
    return {
      forward: planted ? travel * 0.5 - strideMeters * phase : travel * (eased - 0.5),
      lift: Math.sin(swing * Math.PI) ** 2 * heightMeters * (running ? 0.14 : 0.035),
      swing: -Math.cos(phase * Math.PI * 2), planted,
    };
  };
  return { cycle, strideMeters, left: foot(cycle), right: foot(fract(cycle + 0.5)),
    bodyLift: heightMeters * (running ? 0.018 : 0.004) * (1 + Math.cos((cycle - 0.46) * Math.PI * 4)) / 2 };
}
