import type { Vec3 } from '../contracts';
import { FRONTGATE } from './frontgate-layout';
import { TRANSFER } from './transfer-layout';

/** S07 reuses the established port. Carts stay at y0; only ambulatory people use the short bypass. */
export const FLANK = {
  bounds: { ...FRONTGATE.bounds },
  spawn: [...FRONTGATE.exit] as Vec3,
  platform: [3, 2.4, 8] as Vec3,
  platformStairStart: [3, 0, 24] as Vec3,
  platformStairTop: [3, 2.4, 14.4] as Vec3,
  platformDescentTop: [8, 2.4, 0] as Vec3,
  platformDescentEnd: [8, 0, -9.6] as Vec3,
  pump: [18, 0, -27] as Vec3,
  eastPost: [32, 0, 8] as Vec3,
  northPost: [36, 0, 26] as Vec3,
  innerGate: [...FRONTGATE.exit] as Vec3,
  rearPost: [...FRONTGATE.rearPost] as Vec3,
  report: [-19, 0, 34] as Vec3,
  routeWatch: [-44, 0, 20] as Vec3,
  water: [-21, 0, 33] as Vec3,
  exit: [...FRONTGATE.exit] as Vec3,
  zheng: [-7, 0, 35] as Vec3,
  meng: [-34, 0, 38] as Vec3,
  technicians: [[-13, 0, -17], [-11, 0, -14], [-13, 0, -9]] as Vec3[],
  technicianVia: [[-13, 0, 0], [-13, 0, 22], [-27, 0, 26], [-27, 0, 42]] as Vec3[],
  techSafe: [-20, 0, 43] as Vec3,
  cartSpawns: [[-42, 0, -24], [-42, 0, -29]] as Vec3[],
  cartVia: [[-42, 0, 4], [-42, 0, 28]] as Vec3[],
  cartSafe: [[-42, 0, 44], [-42, 0, 38]] as Vec3[],
  walkerSpawns: [[-35, 0, -24], [-35, 0, -28]] as Vec3[],
  walkerVia: [[-35, 0, -20], [-35, 1.2, -15.2], [-35, 1.2, -6.8], [-35, 0, -2], [-35, 0, 18], [-40, 0, 21], [-40, 0, 28]] as Vec3[],
  walkerSafe: [[-35, 0, 40], [-35, 0, 42]] as Vec3[],
  eastEntries: FRONTGATE.eastEntries.map(p => [...p] as Vec3),
  eastPosts: [[37, 0, -18], [34, 0, -9], [46, 0, -2], [28, 0, -35]] as Vec3[],
  northEntries: FRONTGATE.northEntries.map(p => [...p] as Vec3),
  northPosts: [[12, 0, -29], [18, 0, -37], [27, 0, -43], [31, 0, -13]] as Vec3[],
  equipmentRoom: { ...TRANSFER.equipmentRoom },
};
