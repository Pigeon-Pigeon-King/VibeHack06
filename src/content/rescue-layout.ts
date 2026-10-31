import type { Vec3 } from '../contracts';

/** S10 continues south from S09, then follows the established western medical route. */
export const RESCUE = {
  bounds: { minX: -430, maxX: 70, minZ: 40, maxZ: 300 },
  spawn: [-8, 0, 182] as Vec3,
  entry: [-8, 0, 202] as Vec3,
  junction: [-28, 0, 226] as Vec3,
  mengStart: [-10, 0, 186] as Vec3,
  zhengStart: [-13, 0, 188] as Vec3,
  playerAssist: [-30, 0, 226] as Vec3,
  zhengAssist: [-26, 0, 226] as Vec3,
  cover: [-52, 0, 226] as Vec3,
  carryEnd: [-54, 0, 226] as Vec3,
  injury: [-54, 0, 232] as Vec3,
  establishedFire: [40, 5, 190] as Vec3,
  pickup: [-78, 0, 244] as Vec3,
  medicSpawns: [[-76, 0, 242], [-80, 0, 242]] as Vec3[],
  medicalArrival: [-400, 0, 64] as Vec3,
  transportVia: [[-120, 0, 244], [-210, 0, 190], [-330, 0, 110], [-400, 0, 64]] as Vec3[],
  enemyEntries: [
    [[33, 0, 174], [48, 0, 191], [33, 0, 213]],
    [[22, 0, 206], [36, 0, 225], [13, 0, 243]],
    [[51, 0, 181], [57, 0, 205], [43, 0, 239]],
  ] as Vec3[][],
  enemyPosts: [
    [[16, 0, 192], [25, 0, 207], [10, 0, 219]],
    [[-9, 0, 212], [-3, 0, 235], [-17, 0, 245]],
    [[17, 0, 199], [22, 0, 221], [-1, 0, 246]],
  ] as Vec3[][],
  ammo: [[-16, 0, 197], [-37, 0, 233]] as Vec3[],
};
