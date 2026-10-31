import type { Vec3 } from '../contracts';

export const CROWD_STAGING_FACT = 'crowd-staging-v1';
// An in-flight old save keeps its authored destinations; do not teleport or strand it.
export const LEGACY_CROWD_STOPS = {
  flankWalkers: [[-35, 0, 40], [-35, 0, 42]] as Vec3[],
  escortWalkers: [[[-110, 0, 18], [-104, 0, 18]], [[-238, 0, 20], [-232, 0, 20]], [[-396, 0, 34], [-390, 0, 34]]] as Vec3[][],
  epilogueWorkers: [[-4, 0, -5], [-6, 0, -5], [-2, 0, -5]] as Vec3[],
};

/** Stable individual poses; never consume the simulation's combat random stream. */
export function crowdPose(scenario: string, id: string): { yaw: number; walk: number } {
  let hash = 2166136261;
  for (const char of `${scenario}/${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  const yaw = ((hash >>> 0) / 0x100000000 - 0.5) * Math.PI * 2;
  const walk = ((Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0) / 0x100000000) * Math.PI * 2;
  return { yaw, walk };
}
