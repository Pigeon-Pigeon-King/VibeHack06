import type { Group, Vector3 } from 'three';

export const SCENARIO_IDS = ['northgate', 'prologue', 'handover', 'nightshift', 'workers', 'childhood', 'mainhall', 'frontgate', 'transfer', 'flank', 'escort', 'relief', 'rescue', 'medical', 'epilogue'] as const;
export type ScenarioId = typeof SCENARIO_IDS[number];
export type Vec3 = [number, number, number];
export type ControlMode = 'combat' | 'work' | 'cooperative' | 'staged';
export type RunMode = 'menu' | 'playing' | 'paused' | 'failed' | 'complete';
export interface SolidSpec {
  id: string;
  position: Vec3;
  size: Vec3;
  rotationY?: number;
  openFact?: string;
}
export interface EnvironmentModel {
  root: Group;
  solids: SolidSpec[];
  update(time: number, cameraPosition: Vector3): void;
  setFacts?(facts: readonly string[]): void;
  dispose(): void;
}
export interface CharacterModel {
  root: Group;
  setPose(pose: { walk: number; aiming: boolean; down: boolean; carrying?: boolean; armed?: boolean; kneeling?: boolean; gesture?: number; lookAway?: number;
    occupied?: boolean; damaged?: boolean; patientOffset?: Vec3; care?: boolean; cargo?: boolean; orderly?: boolean }): void;
  dispose(): void;
}
export type CharacterRole = 'enemy' | 'ally' | 'worker' | 'father' | 'child' | 'medic' | 'civilian' | 'opponent' | 'cart';
export interface WeaponModel {
  root: Group;
  muzzle: Group;
  setPose(recoil: number, reloadFraction: number, ads: number, walk: number): void;
  dispose(): void;
}
export interface UiState {
  mode: RunMode;
  control: ControlMode;
  scenario: ScenarioId;
  scenarioName: string;
  availableScenarios: ScenarioId[];
  phaseName: string;
  objective: string;
  detail: string;
  health: number;
  storyInjury?: boolean;
  ammo: number;
  reserve: number;
  reload: number;
  workersSafe: number;
  workerTotal: number;
  elapsed: number;
  interaction: string;
  subtitle: string;
  speaker: string;
  checkpoint: string;
  hits: number;
  kills: number;
  ads: boolean;
  hitFlash: number;
  hurtFlash: number;
  lowMotion: boolean;
  muted: boolean;
  sensitivity: number;
  volume: number;
  chapter: boolean;
  continueLabel?: string;
  nextLabel?: string;
  error?: string;
  diagnostics?: string;
}
export interface UiActions {
  start(scenario: ScenarioId): void;
  startChapter(): void;
  continueChapter(): void;
  nextStage(): void;
  resume(): void;
  retry(): void;
  restart(): void;
  menu(): void;
  importCheckpoint?(file: File): void;
  setSensitivity(value: number): void;
  setVolume(value: number): void;
  setLowMotion(value: boolean): void;
}
