import type { ScenarioId } from '../contracts';
import { carryFacts, nextStage, type ChapterProgress } from '../content/chapter-flow';
import { bridgeAfter } from './catalog';
import type { ChapterBridge } from './types';

export interface CompletedMission {
  readonly scenario: ScenarioId;
  readonly complete: boolean;
  readonly failed: boolean;
  readonly elapsed: number;
  readonly facts: readonly string[];
}

export interface CampaignTransitionPlan {
  readonly bridge: ChapterBridge;
  readonly chapter: ChapterProgress;
  readonly scenario: ScenarioId;
  readonly facts: readonly string[];
}

/** Pure preparation: no checkpoint writes or mutation of the current campaign. */
export function planCampaignTransition(chapter: ChapterProgress | undefined, mission: CompletedMission): CampaignTransitionPlan | undefined {
  if (!chapter || !mission.complete || mission.failed) return;
  const next = nextStage(mission.scenario);
  const bridge = bridgeAfter(chapter.stage);
  if (!next || !bridge || next.id !== bridge.to) return;
  if (!Number.isFinite(chapter.elapsedBefore) || chapter.elapsedBefore < 0 || !Number.isFinite(mission.elapsed) || mission.elapsed < 0) return;
  const elapsedBefore = chapter.elapsedBefore + mission.elapsed;
  if (!Number.isFinite(elapsedBefore)) return;
  return {
    bridge,
    chapter: { chapter: 'campaign', stage: next.id, elapsedBefore },
    scenario: next.scenario,
    facts: carryFacts(next.id, mission.facts),
  };
}
