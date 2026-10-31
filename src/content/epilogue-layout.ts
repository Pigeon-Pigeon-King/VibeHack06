import type { Vec3 } from '../contracts';
import { MEDICAL } from './medical-layout';

/** S12 uses a real safe shore corridor, retaining the western station and eastern C03 geography. */
export const EPILOGUE = {
  bounds: { minX: -430, maxX: 30, minZ: -10, maxZ: 100 },
  spawn: [...MEDICAL.exit] as Vec3,
  report: [-397, 0, 83] as Vec3,
  needs: [-390, 0, 83] as Vec3,
  shoreVia: [[-370, 0, 84], [-300, 0, 82], [-210, 0, 72], [-120, 0, 57], [-40, 0, 35], [-4, 0, 12]] as Vec3[],
  reception: [-4, 0, 8] as Vec3,
  terminal: [1, 0, 8] as Vec3,
  door: [-4, 0, 1] as Vec3,
  holdDoor: [-6, 0, 2] as Vec3,
  workersSpawns: [[0, 0, 15], [3, 0, 17], [5, 0, 20]] as Vec3[],
  workersGoals: [[-4, 0, -5], [-6, 0, -5], [-2, 0, -5]] as Vec3[],
  luo: [2, 0, 8] as Vec3,
  zheng: [-394, 0, 82] as Vec3,
  exit: [-4, 0, -5] as Vec3,
};
