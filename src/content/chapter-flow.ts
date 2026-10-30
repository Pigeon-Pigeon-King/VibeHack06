import type { ScenarioId } from '../contracts';

export const CHAPTER_STAGES = [
  { id: 'S03', scenario: 'nightshift', title: '夜班与出发' },
  { id: 'S04', scenario: 'workers', title: '带回港务人员' },
] as const;
export type ChapterStageId = typeof CHAPTER_STAGES[number]['id'];
export const NIGHT_CARRY_FACTS = ['fleet-approaching', 'sharing-promised', 'handoff-planned', 'weapon-collected', 'departed-for-port'] as const;
export interface ChapterProgress {
  chapter: 'L1'; stage: ChapterStageId; elapsedBefore: number;
}
export function stageFor(scenario: ScenarioId) {
  return CHAPTER_STAGES.find(stage => stage.scenario === scenario);
}
export function nextStage(scenario: ScenarioId) {
  const index = CHAPTER_STAGES.findIndex(stage => stage.scenario === scenario);
  return index < 0 ? undefined : CHAPTER_STAGES[index + 1];
}

/** S05 and the remaining campaign are deliberately not substituted with test arenas. */
export const SCENARIO_PHASE_LIMITS: Record<ScenarioId, number> = {
  northgate: 3, prologue: 3, handover: 5, nightshift: 8, workers: 7,
};
