import type { Group } from 'three';

/** The local copy retains the GPL-3.0 source mesh and mechanism adapter. */
export function createF35B(three: typeof import('three'), options?: {
  scale?: number;
  pylons?: boolean;
  engineOn?: boolean;
  gear?: number;
  palette?: Record<string, number>;
}): Group;

export const F35B_PALETTE: Record<string, number>;
