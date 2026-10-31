import type { ControlMode, ScenarioId } from '../contracts';

export type AudioGroup = 'sfx' | 'voice' | 'music' | 'ambience';
export interface AudioAsset {
  id: string;
  /** Build-base-relative, local runtime asset. */
  url: string;
  kind: 'sfx' | 'voice' | 'music';
  duration: number;
  bytes: number;
  sha256: string;
  gain: number;
}
export interface DialogueAsset {
  assetId: string;
  scenario: ScenarioId;
  speaker: string;
  text: string;
  duration: number;
  speakerId?: string;
  aliases?: readonly string[];
  optional?: boolean;
  sourceStatus?: string;
}
export interface DialoguePresentation { text: string; speaker: string; time: number; until: number }
export interface MissionAudioState {
  scenario: ScenarioId;
  phase: number;
  control: ControlMode;
  facts: readonly string[];
  elapsed: number;
}
export interface DialogueCue {
  epoch: number;
  revision: number | string;
  scenario: ScenarioId;
  speaker: string;
  text: string;
  elapsed: number;
  expiresAt: number;
}
export interface AudioStatus {
  unlocked: boolean;
  disposed: boolean;
  contextState: string;
  activeSources: number;
  cachedBuffers: number;
  cachedBytes: number;
  pendingLoads: number;
  concurrentLoads: number;
  music?: string;
  voice?: string;
  queuedDialogue: number;
  /** Bounded readable failures; audio failure never blocks the simulation. */
  errors: readonly string[];
}
