import type { ScenarioId } from '../contracts';

export const CHAPTER_STAGES = [
  { id: 'S01', scenario: 'childhood', title: '检修门' },
  { id: 'S02', scenario: 'mainhall', title: '主厅' },
  { id: 'S03', scenario: 'nightshift', title: '夜班与出发' },
  { id: 'S04', scenario: 'workers', title: '带回港务人员' },
  { id: 'S05', scenario: 'frontgate', title: '北闸的预告' },
  { id: 'S06', scenario: 'transfer', title: '转接门与争执' },
  { id: 'S07', scenario: 'flank', title: '交给别人' },
  { id: 'S08', scenario: 'escort', title: '留下护送' },
  { id: 'S09', scenario: 'relief', title: '接受换班' },
  { id: 'S10', scenario: 'rescue', title: '共同撤回' },
  { id: 'S11', scenario: 'medical', title: '救护点' },
  { id: 'S12', scenario: 'epilogue', title: '进场之前' },
] as const;
export type ChapterStageId = typeof CHAPTER_STAGES[number]['id'];
export const NIGHT_CARRY_FACTS = ['fleet-approaching', 'sharing-promised', 'handoff-planned', 'zhou-postponed-family-reply', 'weapon-collected', 'departed-for-port'] as const;
export interface ChapterProgress {
  /** L1 is retained for existing 0.2 saves; new progress uses campaign. */
  chapter: 'campaign' | 'L1'; stage: ChapterStageId; elapsedBefore: number;
}
export function stageFor(scenario: ScenarioId) {
  return CHAPTER_STAGES.find(stage => stage.scenario === scenario);
}
export function nextStage(scenario: ScenarioId) {
  const index = CHAPTER_STAGES.findIndex(stage => stage.scenario === scenario);
  return index < 0 ? undefined : CHAPTER_STAGES[index + 1];
}

/** Stable phase meanings preserve existing chapter and isolated validation saves. */
export const SCENARIO_PHASE_LIMITS: Record<ScenarioId, number> = {
  northgate: 3, prologue: 3, handover: 5, nightshift: 8, workers: 7,
  childhood: 4, mainhall: 5, frontgate: 6, transfer: 7, flank: 8, escort: 15, relief: 10,
  rescue: 10, medical: 10, epilogue: 8,
};

const CARRY_FACTS_BY_STAGE: Record<ChapterStageId, readonly string[]> = {
  S01: [],
  // The next viewpoint does not inherit information this character cannot know.
  S02: [],
  // Ten years later these are settled world facts, not events the child witnessed in S01.
  S03: ['child-evacuated', 'father-died', 'civilians-evacuated', 'zhou-trusts-zhao', 'zhao-executed', 'zhou-survived-hall'],
  S04: NIGHT_CARRY_FACTS,
  S05: [...NIGHT_CARRY_FACTS, 'convoy-reported', 'zhou-adopts-lu-report', 'technicians-received', 'family-escort-promised', 'reception-damage-known'],
  // Character-prefixed facts record private knowledge; carrying one does not
  // grant it to the new viewpoint. Lu learns the timing from the courier in S06.
  S06: [...NIGHT_CARRY_FACTS, 'convoy-reported', 'zhou-adopts-lu-report', 'technicians-received', 'family-escort-promised', 'reception-damage-known',
    'front-workers-safe', 'front-team-returned', 'zhou-knows-shaoyuan-time', 'zhou-withheld-time', 'mobile-force-warning-shared'],
  S07: [...NIGHT_CARRY_FACTS, 'convoy-reported', 'zhou-adopts-lu-report', 'technicians-received', 'family-escort-promised', 'reception-damage-known',
    'front-workers-safe', 'front-team-returned', 'zhou-knows-shaoyuan-time', 'zhou-withheld-time', 'mobile-force-warning-shared',
    'lu-knows-shaoyuan-time', 'lu-knows-zhou-withheld', 'transfer-gate-open', 'transfer-patients-through', 'xu-passed-transfer',
    'argument-finished', 'lu-unfair-accusation', 'zhou-admits-withholding', 'reception-report-delivered', 'transfer-hand-treated', 'lu-continues-duty', 'source-timestamp-shared'],
  S08: [...NIGHT_CARRY_FACTS, 'family-escort-promised', 'technicians-received', 'front-workers-safe', 'front-team-returned',
    'lu-knows-shaoyuan-time', 'lu-knows-zhou-withheld', 'transfer-gate-open', 'transfer-patients-through', 'xu-passed-transfer',
    'argument-finished', 'lu-unfair-accusation', 'zhou-admits-withholding', 'transfer-hand-treated', 'lu-continues-duty',
    'meng-route-proven', 'patients-used-cargo-route', 'walkers-used-side-route', 'zhou-apology-without-excuse',
    'full-report-shared', 'lu-has-full-report', 'departure-unconfirmed-shared', 'mobile-force-role-shared',
    'escort-staffing-shared', 'uncertainty-explicit', 'source-timestamp-shared', 'zhou-asks-rest', 'zhou-asks-relief',
    'zhou-on-withdrawal-list', 'backup-radio-handed-to-zheng', 'family-medicine-reported'],
  S09: [...NIGHT_CARRY_FACTS, 'family-escort-promised', 'full-report-shared', 'lu-has-full-report',
    'zhou-asks-rest', 'zhou-asks-relief', 'zhou-on-withdrawal-list', 'backup-radio-handed-to-zheng',
    'escort-families-confirmed', 'luo-stays-voluntarily', 'lu-retracts-accusation', 'relationship-repaired',
    'shaoyuan-departure-confirmed', 'pursuit-was-viable', 'pursuit-staffing-cost-known', 'lu-keeps-escort-promise',
    'escort-patient-transferred', 'escort-pillow-card-preserved', 'escort-convoy-arrived', 'escort-manifest-checked',
    'shaoyuan-passed-dispatch', 'meng-returned-for-relief'],
  S10: ['full-report-shared', 'lu-has-full-report', 'lu-keeps-escort-promise', 'relationship-repaired',
    'escort-convoy-arrived', 'escort-manifest-checked', 'shaoyuan-departure-confirmed', 'shaoyuan-passed-dispatch',
    'relief-posts-held', 'relief-handover-complete', 'zhou-gives-up-post', 'zhou-accepts-help', 'zhou-brace-adjusted',
    'zhou-own-gear-on-list', 'zhou-heard-family', 'zhou-wants-to-live', 'zhou-family-reply-queued',
    'zhou-will-seek-treatment', 'zhou-leaves-under-protection', 'lu-checks-zhou-rest'],
  S11: ['full-report-shared', 'lu-has-full-report', 'lu-keeps-escort-promise', 'relationship-repaired',
    'escort-convoy-arrived', 'escort-manifest-checked', 'shaoyuan-departure-confirmed', 'shaoyuan-passed-dispatch',
    'relief-posts-held', 'relief-handover-complete', 'zhou-gives-up-post', 'zhou-accepts-help', 'zhou-wants-to-live',
    'zhou-family-reply-queued', 'zhou-will-seek-treatment', 'rescue-meng-wounded', 'rescue-meng-under-cover',
    'rescue-zhou-wounded', 'zhou-reported-injury', 'zhou-requested-rescue', 'rescue-both-received'],
  S12: ['full-report-shared', 'lu-keeps-escort-promise', 'relationship-repaired', 'escort-convoy-arrived',
    'escort-manifest-checked', 'shaoyuan-departure-confirmed', 'shaoyuan-passed-dispatch', 'relief-posts-held',
    'zhou-gives-up-post', 'zhou-accepts-help', 'zhou-wants-to-live', 'zhou-family-reply-queued',
    'rescue-meng-under-cover', 'zhou-reported-injury', 'zhou-requested-rescue', 'rescue-both-received',
    'medical-equipment-handed-over', 'medical-records-delivered', 'medical-zhou-responsive',
    'medical-treatment-attempted', 'zhou-death-confirmed', 'meng-treatment-continues',
    'xu-rest-accepted', 'lu-accepts-help', 'medical-needs-recorded', 'reception-contact-received'],
};
export function carryFacts(stage: ChapterStageId, facts: readonly string[]): string[] {
  return facts.filter(fact => CARRY_FACTS_BY_STAGE[stage].includes(fact));
}
