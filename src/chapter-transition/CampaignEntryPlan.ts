import type { ChapterProgress } from '../content/chapter-flow';
import { CAMPAIGN_OPENING } from './catalog';
import type { CampaignOpening } from './types';

export type CampaignEntryIntent =
  | 'new-game'
  | 'restart-campaign'
  | 'continue'
  | 'retry-checkpoint'
  | 'restart-stage'
  | 'validation';

export interface CampaignEntryPlan {
  /** Same field name as CampaignTransitionPlan for the shared transition host. */
  readonly bridge: CampaignOpening;
  readonly chapter: ChapterProgress;
  readonly scenario: 'childhood';
  readonly facts: readonly string[];
}

/** Plans a fresh campaign only; reads no checkpoint and commits no progress. */
export function planCampaignEntry(intent: CampaignEntryIntent): CampaignEntryPlan | undefined {
  if (intent !== 'new-game' && intent !== 'restart-campaign') return;
  return {
    bridge: CAMPAIGN_OPENING,
    chapter: { chapter: 'campaign', stage: 'S01', elapsedBefore: 0 },
    scenario: 'childhood',
    facts: [],
  };
}
