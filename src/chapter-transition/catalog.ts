import rawBridges from './bridges.json';
import { CHAPTER_STAGES, type ChapterStageId } from '../content/chapter-flow';
import type { ChapterBridge } from './types';

export const CHAPTER_BRIDGES = rawBridges as readonly ChapterBridge[];

/** Only consecutive campaign stages have a bridge. Validation scenes and S12 do not. */
export function bridgeAfter(stage: ChapterStageId): ChapterBridge | undefined {
  const index = CHAPTER_STAGES.findIndex(value => value.id === stage);
  const next = CHAPTER_STAGES[index + 1];
  return next && CHAPTER_BRIDGES.find(bridge => bridge.from === stage && bridge.to === next.id);
}
