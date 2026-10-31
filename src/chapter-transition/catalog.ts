import rawBridges from './bridges.json';
import rawOpening from './opening.json';
import { CHAPTER_STAGES, type ChapterStageId } from '../content/chapter-flow';
import type { CampaignOpening, ChapterBridge, TransitionScript } from './types';

export const CHAPTER_BRIDGES = rawBridges as readonly ChapterBridge[];
export const CAMPAIGN_OPENING = rawOpening as CampaignOpening;
export const CHAPTER_TRANSITION_SCRIPTS: readonly TransitionScript[] = [CAMPAIGN_OPENING, ...CHAPTER_BRIDGES];

/** Only consecutive campaign stages have a bridge. Validation scenes and S12 do not. */
export function bridgeAfter(stage: ChapterStageId): ChapterBridge | undefined {
  const index = CHAPTER_STAGES.findIndex(value => value.id === stage);
  const next = CHAPTER_STAGES[index + 1];
  return next && CHAPTER_BRIDGES.find(bridge => bridge.from === stage && bridge.to === next.id);
}
