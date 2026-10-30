import type { Group, Vector3 } from 'three';

export type ScenarioId = 'northgate' | 'prologue' | 'handover';
export type Vec3 = [number, number, number];
export type ControlMode = 'combat' | 'work' | 'cooperative' | 'staged';
export type RunMode = 'menu' | 'playing' | 'paused' | 'failed' | 'complete';
export interface SolidSpec {
  id: string;
  position: Vec3;
  size: Vec3;
  rotationY?: number;
}
export interface EnvironmentModel {
  root: Group;
  solids: SolidSpec[];
  update(time: number, cameraPosition: Vector3): void;
  dispose(): void;
}
export interface CharacterModel {
  root: Group;
  setPose(pose: { walk: number; aiming: boolean; down: boolean; carrying?: boolean }): void;
  dispose(): void;
}
export type CharacterRole = 'enemy' | 'ally' | 'worker' | 'father' | 'child' | 'medic';
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
  error?: string;
  diagnostics?: string;
}
export interface UiActions {
  start(scenario: ScenarioId): void;
  resume(): void;
  retry(): void;
  restart(): void;
  menu(): void;
  setSensitivity(value: number): void;
  setVolume(value: number): void;
  setLowMotion(value: boolean): void;
}
