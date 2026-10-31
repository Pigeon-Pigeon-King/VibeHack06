/** Seconds within the existing staged phase: S01 phase 3, S02 phase 4. */
export const OPENING_TIMELINE = {
  childhood: {
    defense: 0, evacuation: 2, firstCasualty: 4, heavyLosses: 6,
    rifle: 7, departure: 8, charge: 9, sightLost: 18, finish: 20,
  },
  mainhall: {
    bombardment: 1.5, collapse: 4, breach: 6.5, weaponReach: 7,
    crowdAttack: 7.2, capture: 7.6, recognition: 9, massacreEnd: 12.4,
    roar: 14, execution: 17, unconscious: 21, finish: 24,
  },
} as const;

const H = OPENING_TIMELINE.mainhall;

/** Shared fall/shot cues: the full crowd is struck during one continuous burst. */
export function openingCrowdHitTime(index: number, count = 32): number {
  const size = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 32;
  const i = Number.isFinite(index) ? Math.max(0, Math.min(size - 1, Math.floor(index))) : 0;
  return H.crowdAttack + (H.massacreEnd - H.crowdAttack) * (i / Math.max(1, size - 1));
}

const HALL_MILESTONES: ReadonlyArray<readonly [string, number]> = [
  ['history-bombardment', H.bombardment], ['history-collapse', H.collapse], ['zhou-pinned', H.collapse],
  ['history-enemy-breach', H.breach], ['zhao-reaches-rifle', H.weaponReach],
  ['history-crowd-attacked', H.crowdAttack], ['zhao-captured', H.capture],
  ['shao-identified-by-zhou', H.recognition], ['history-crowd-massacred', H.massacreEnd],
  ['zhao-defiant-shout', H.roar], ['zhao-executed', H.execution], ['zhou-unconscious', H.unconscious],
];

/** Existing collapse/capture/execution saves resume after their recorded facts, never before them. */
export function openingHallTime(phaseTime: number, facts: readonly string[]): number {
  let time = Number.isFinite(phaseTime) ? Math.max(0, phaseTime) : 0;
  for (const [fact, at] of HALL_MILESTONES) if (facts.includes(fact)) time = Math.max(time, at);
  for (const fact of facts) {
    const victim = /^history-crowd-victim-(\d+)$/.exec(fact);
    if (victim && Number(victim[1]) < 32) time = Math.max(time, openingCrowdHitTime(Number(victim[1])));
  }
  return time;
}
