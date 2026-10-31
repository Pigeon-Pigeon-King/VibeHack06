/** Seconds within the existing staged phase: S01 phase 3, S02 phase 4. */
export const OPENING_TIMELINE = {
  childhood: {
    defense: 0, evacuation: 2, firstCasualty: 4, heavyLosses: 6,
    rifle: 7, departure: 8, charge: 9, sightLost: 18, finish: 20,
  },
  mainhall: {
    // Authored against the approved full recordings: opening 6.40 s, warning
    // 2.96 s, pinned 2.56 s, final shout 3.52 s. Facts never wait on audio I/O.
    bombardment: 7, collapse: 10.4, breach: 13.2, weaponReach: 13.7,
    crowdAttack: 13.9, capture: 14.3, recognition: 16, massacreEnd: 19.1,
    roar: 20.7, execution: 24.6, unconscious: 28.6, finish: 31.6,
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
