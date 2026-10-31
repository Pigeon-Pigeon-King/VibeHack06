import type { Vec3 } from '../contracts';

/** S09 is the rear yard south of the established north-gate/inner-gate landmarks, not the S05 front. */
export const RELIEF = {
  bounds: { minX: -70, maxX: 70, minZ: 48, maxZ: 190 },
  northGateLandmark: [-8, 0, 46.8] as Vec3,
  spawn: [-8, 0, 96] as Vec3,
  post: [-8, 0, 78] as Vec3,
  entryHold: [18, 0, 74] as Vec3,
  techSpawns: [[-34, 0, 71], [-39, 0, 75], [-34, 0, 80]] as Vec3[],
  techVia: [[-42, 0, 90], [-42, 0, 116], [-31, 0, 132]] as Vec3[],
  techSafe: [-26, 0, 132] as Vec3,
  technicianStops: [[-27.2, 0, 131.7], [-25.9, 0, 133.2], [-24.3, 0, 131.4]] as Vec3[],
  meng: [-57, 0, 133] as Vec3,
  recruits: [[-60, 0, 139], [-55, 0, 142]] as Vec3[],
  arrivalVia: [[-48, 0, 128], [-42, 0, 110], [-42, 0, 96], [-26, 0, 96], [-26, 0, 84]] as Vec3[],
  reliefPosts: [[-8, 0, 78], [9, 0, 80], [-22, 0, 86]] as Vec3[],
  crossings: [[22, 0, 104], [-22, 0, 128]] as Vec3[],
  crossingVia: [[[-8, 0, 100], [22, 0, 104]], [[22, 0, 124], [-22, 0, 128]]] as Vec3[][],
  rest: [-8, 0, 160] as Vec3,
  zheng: [-5, 0, 162] as Vec3,
  zhengCare: [-8, 0, 159.2] as Vec3,
  seatYaw: 0,
  water: [-5.6, 0, 160] as Vec3,
  radio: [-11, 0, 160] as Vec3,
  restRoom: { minX: -29, maxX: 19, minZ: 146, maxZ: 176 },
  exit: [-8, 0, 182] as Vec3,
  enemyEntries: [
    [[46, 0, 52], [52, 0, 68], [-10, 0, 50]],
    [[60, 0, 92], [44, 0, 52], [-18, 0, 51]],
  ] as Vec3[][],
  enemyPosts: [
    [[22, 0, 56], [40, 0, 73], [4, 0, 58], [-22, 0, 60]],
    [[26, 0, 92], [14, 0, 62], [-19, 0, 66]],
  ] as Vec3[][],
  ammo: [[-14, 0, 91], [27, 0, 110], [-22, 0, 135]] as Vec3[],
};
