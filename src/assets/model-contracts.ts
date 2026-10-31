import type { AnimationClip, AnimationMixer, Group } from 'three';

/** Runtime URLs point to files copied into this project's build, never provider download links. */
export interface ModelSource {
  readonly id: string;
  readonly revision: string;
  readonly url: string;
}
export interface ModelLoadProgress {
  phase: 'download' | 'decode';
  received: number;
  total?: number;
}
export interface ModelTemplate {
  scene: Group;
  animations: AnimationClip[];
  /** All scenes share this template's resource ownership, including inactive scenes. */
  scenes?: Group[];
}
export type ModelLoader = (source: ModelSource, signal: AbortSignal, progress: (value: ModelLoadProgress) => void) => Promise<ModelTemplate>;
export interface ModelLease {
  root: Group;
  animations: readonly AnimationClip[];
  mixer: AnimationMixer;
  /** Detach and release this instance. Geometry/material/texture lifetime belongs to the library. */
  dispose(): void;
}
export interface ModelAcquireOptions {
  signal?: AbortSignal;
  onProgress?(value: ModelLoadProgress): void;
}
