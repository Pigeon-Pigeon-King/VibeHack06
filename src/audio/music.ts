import type { MissionAudioState } from './contracts';

/** Authored mission facts, not elapsed wall time or the number of live enemies. */
export function musicForMission(state: MissionAudioState): string | undefined {
  const has = (fact: string) => state.facts.includes(fact);
  switch (state.scenario) {
    case 'childhood': return state.phase < 3 && !has('father-charged-defense') ? 'memory-fragments' : undefined;
    case 'mainhall': return state.phase >= 1 && state.phase <= 3 && !has('history-bombardment') ? 'combat-northgate-hold-v2' : undefined;
    case 'nightshift':
      if (has('sharing-promised')) return 'wenchuan-theme-01';
      return has('fan-restarted') ? 'port-night-shift' : undefined;
    case 'workers': return state.phase >= 7 ? 'after-combat-breath' : 'combat-advance-v2';
    case 'frontgate':
      if (has('front-workers-safe')) return 'after-combat-breath';
      return has('east-road-warned') ? 'combat-reinforcement-v2' : 'combat-northgate-hold-v2';
    case 'transfer': return undefined;
    case 'flank': return has('full-report-shared') || has('zhou-asks-relief') ? 'shared-trust-s09' : 'combat-advance-v2';
    case 'escort':
      if (has('escort-convoy-arrived')) return 'after-combat-breath';
      if (has('escort-convoy-started')) return state.phase === 11 ? undefined : 'combat-escort-withdrawal-v2';
      return has('lu-keeps-escort-promise') ? 'wenchuan-theme-01' : undefined;
    case 'relief':
      if (has('zhou-family-reply-queued')) return 'zhouyan-theme-01';
      if (has('relief-handover-complete')) return state.phase >= 7 ? undefined : 'shared-trust-s09';
      return state.control === 'combat' ? 'combat-northgate-hold-v2' : undefined;
    case 'rescue': return has('zhou-requested-rescue') || has('rescue-meng-wounded') ? undefined : 'combat-escort-withdrawal-v2';
    case 'medical': return undefined;
    case 'epilogue': return has('first-wave-approaching') ? 'receive-s12' : undefined;
    // Legacy whiteboxes have no approved campaign music event mapping.
    default: return undefined;
  }
}
