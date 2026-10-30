import type { Vec3 } from '../contracts';

/** Authored interaction and route anchors; coordinates are shared with geometry. */
export const NIGHT = {
  bounds: { minX: -32, maxX: 32, minZ: -62, maxZ: 44 },
  spawn: [0, 0, 38] as Vec3,
  fan: [-12, 0, 30] as Vec3,
  fanReset: [-9, 0, 28] as Vec3,
  supplies: [12, 0, 18] as Vec3,
  delivery: [12, 0, -4] as Vec3,
  map: [-12, 0, -24] as Vec3,
  weapons: [-10, 0, -32] as Vec3,
  exit: [0, 0, -55] as Vec3,
  xu: [14, 0, -6] as Vec3,
  meng: [-9, 0, -24] as Vec3,
  zhou: [-14, 0, -27] as Vec3,
};

export const WORKERS = {
  bounds: { minX: -54, maxX: 54, minZ: -136, maxZ: 48 },
  spawn: [0, 0, 42] as Vec3,
  observation: [0, 0, 29] as Vec3,
  convoy: [22, 0, 17] as Vec3,
  checkpoint: [0, 0, 3] as Vec3,
  lower: [-18, 0, -28] as Vec3,
  stairStart: [-18, 0, -34] as Vec3,
  stairTop: [-18, 3, -46] as Vec3,
  overlook: [-18, 3, -54] as Vec3,
  descent: [-18, 0, -70] as Vec3,
  yardGate: [0, 0, -76] as Vec3,
  release: [-15, 0, -86] as Vec3,
  safe: [22, 0, -112] as Vec3,
  post: [24, 0, -112] as Vec3,
  exit: [40, 0, -116] as Vec3,
  zheng: [5, 0, 37] as Vec3,
  meng: [34, 0, -116] as Vec3,
  workers: Array.from({ length: 9 }, (_, i) => [-22 + i % 3 * 3, 0, -93 - Math.floor(i / 3) * 3] as Vec3),
  checkpointEnemies: [[-7, 0, 8], [7, 0, 8], [-9, 0, -5], [8, 0, -7]] as Vec3[],
  maintenanceEnemies: [[-24, 0, -24], [-11, 0, -30], [-22, 3, -49], [-11, 3, -57]] as Vec3[],
  yardEnemies: [[-8, 0, -90], [9, 0, -95], [6, 0, -104], [27, 0, -100]] as Vec3[],
  counterattack: [[36, 0, -127], [42, 0, -121]] as Vec3[],
};
