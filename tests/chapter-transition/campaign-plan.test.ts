import { describe, expect, it } from 'vitest';
import { planCampaignTransition } from '../../src/chapter-transition/CampaignTransitionPlan';
import { CHAPTER_STAGES, carryFacts, type ChapterProgress } from '../../src/content/chapter-flow';

describe('campaign-only transition planning', () => {
  const chapter: ChapterProgress = { chapter: 'campaign', stage: 'S08', elapsedBefore: 420 };
  const mission = { scenario: 'escort' as const, complete: true, failed: false, elapsed: 65, facts: ['lu-keeps-escort-promise', 'escort-convoy-arrived', 'unrelated'] };
  it('carries established story facts and elapsed time without changing the source save', () => {
    const plan = planCampaignTransition(chapter, mission)!;
    expect(plan.chapter).toEqual({ chapter: 'campaign', stage: 'S09', elapsedBefore: 485 }); expect(plan.scenario).toBe('relief'); expect(plan.facts).toEqual(carryFacts('S09', mission.facts)); expect(chapter.stage).toBe('S08'); expect(mission.facts).toContain('unrelated');
  });
  it('has exactly one adjacent bridge for each nonfinal campaign completion', () => {
    for (const [index, stage] of CHAPTER_STAGES.entries()) {
      const plan = planCampaignTransition({ ...chapter, stage: stage.id }, { ...mission, scenario: stage.scenario });
      expect(plan?.bridge.to).toBe(CHAPTER_STAGES[index + 1]?.id);
    }
  });
  it('leaves isolated validations, failure, incomplete, mismatched and final stages alone', () => {
    expect(planCampaignTransition(undefined, mission)).toBeUndefined();
    expect(planCampaignTransition(chapter, { ...mission, failed: true })).toBeUndefined();
    expect(planCampaignTransition(chapter, { ...mission, complete: false })).toBeUndefined();
    expect(planCampaignTransition(chapter, { ...mission, scenario: 'northgate' })).toBeUndefined();
    expect(planCampaignTransition(chapter, { ...mission, scenario: 'rescue' })).toBeUndefined();
    expect(planCampaignTransition({ ...chapter, stage: 'S12' }, { ...mission, scenario: 'epilogue' })).toBeUndefined();
  });
  it('does not carry the child viewpoint facts into Zhou’s replay', () => {
    const plan = planCampaignTransition({ ...chapter, stage: 'S01' }, { ...mission, scenario: 'childhood', facts: ['child-evacuated', 'father-died'] })!; expect(plan.facts).toEqual([]);
  });
  it('supports old L1 campaign records and rejects invalid elapsed times', () => {
    expect(planCampaignTransition({ ...chapter, chapter: 'L1' }, mission)?.chapter.chapter).toBe('campaign');
    for (const elapsed of [-1, NaN, Infinity]) expect(planCampaignTransition(chapter, { ...mission, elapsed })).toBeUndefined();
  });
});
