import type { Vec3 } from '../contracts';

/** S01/S02 share this hall. North is -Z, east +X; evacuation goes west and down. */
export const HISTORY = {
  bounds: { minX: -48, maxX: 34, minZ: -28, maxZ: 26 },
  hall: { minX: -22, maxX: 30, minZ: -22, maxZ: 22 },
  childSpawn: [-10, 0, 14] as Vec3,
  youngSpawn: [-19, 0, 4] as Vec3,
  lunch: [-10, 0, 12.4] as Vec3,
  fatherStart: [-7.7, 0, 13.8] as Vec3,
  mattress: [-17.5, 0, 8] as Vec3,
  // Outside/inside refer to the west maintenance door, not the hostile public entrance.
  gateOutside: [-19, 0, 6] as Vec3,
  gateInside: [-24, 0, 6] as Vec3,
  gatePanel: [-20, 0, 3] as Vec3,
  gateX: -22,
  rifle: [-16, 0, 8] as Vec3,
  fatherFall: [-13, 0, 10.1] as Vec3,
  womanStart: [-24, 0, 6] as Vec3,
  womanEnd: [-40, -2.4, 6] as Vec3,
  childSafe: [-43, -2.4, 6] as Vec3,
  daughterStart: [-24, 0, 8] as Vec3,
  stairsStart: [-25, 0, 6] as Vec3,
  stairsEnd: [-33, -2.4, 6] as Vec3,
  partitionX: -36,
  defenseA: [-1, 0, -4] as Vec3,
  defenseB: [-11, 0, 4] as Vec3,
  rubblePlayer: [-10, 0, 4] as Vec3,
  zhaoStart: [13, 0, -3] as Vec3,
  zhaoCaptured: [4, 0, 4] as Vec3,
  shaoStart: [18, 0, -2] as Vec3,
  // Only these six people are the playable protection objective. Father and the late crowd are separate actors.
  civilians: [[-9, 0, 7], [-5, 0, 8], [-14, 0, 15], [-6, 0, 17], [1, 0, 12], [3, 0, 17]] as Vec3[],
  civilianVia: [[-19, 0, 6], [-24, 0, 6], [-33, -2.4, 6], [-40, -2.4, 6]] as Vec3[],
  crowd: [[4, 0, 11], [8, 0, 13], [11, 0, 8], [15, 0, 10], [19, 0, 13]] as Vec3[],
  enemyEntries: [[32, 0, -6], [32, 0, 1], [16, 0, -26], [22, 0, -26]] as Vec3[],
  enemyPosts: [[21, 0, -5], [19, 0, 3], [12, 0, -16], [7, 0, -13], [12, 0, -7], [15, 0, 8]] as Vec3[],
};
