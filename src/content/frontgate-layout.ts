import type { Vec3 } from '../contracts';

/** S05 front line, 108 x 148 m. A solid west divider separates workers from north/east fire. */
export const FRONTGATE = {
  bounds: { minX: -54, maxX: 54, minZ: -96, maxZ: 52 },
  spawn: [-8, 0, 40] as Vec3,
  observe: [-8, 0, 12] as Vec3,
  weighA: [-8, 0, -18] as Vec3,
  weighB: [10, 0, -10] as Vec3,
  eastPost: [16, 0, -2] as Vec3,
  rearPost: [-5, 0, 25] as Vec3,
  exit: [-8, 0, 45] as Vec3,
  safe: [-40, 0, 40] as Vec3,
  workers: [[-43, 0, -26], [-39, 0, -25], [-35, 0, -25], [-44, 0, -22], [-40, 0, -21], [-36, 0, -21], [-42, 0, -18]] as Vec3[],
  workerVia: [[-42, 0, -10], [-42, 0, 10], [-42, 0, 30]] as Vec3[],
  northEntries: [[-14, 0, -91], [-10, 0, -90], [1, 0, -91], [5, 0, -90]] as Vec3[],
  northPosts: [[-17, 0, -52], [-5, 0, -48], [10, 0, -54], [15, 0, -39], [-8, 0, -34], [7, 0, -29]] as Vec3[],
  eastEntries: [[51, 0, -37], [51, 0, -32], [51, 0, -28]] as Vec3[],
  eastPosts: [[28, 0, -35], [29, 0, -22], [24, 0, -14], [33, 0, -5]] as Vec3[],
  zheng: [-10, 0, 33] as Vec3,
  reliefStart: [-18, 0, 46] as Vec3,
};
