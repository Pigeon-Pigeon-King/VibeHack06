import type { Vec3 } from '../contracts';
import { FRONTGATE } from './frontgate-layout';

/** S06 is the same north-gate west service corridor. North=-Z, east=+X, all cart routes are level. */
export const TRANSFER = {
  bounds: { ...FRONTGATE.bounds },
  spawn: [-34, 0, 10] as Vec3,
  panel: [-37, 0, 20.5] as Vec3,
  // Work point is on the approach side of the shutter; the actual plane is separately explicit.
  gate: [-40.5, 0, 21.6] as Vec3,
  gateCenter: [-42, 0, 24] as Vec3,
  gateWidth: 6,
  watch: [-36, 0, 28] as Vec3,
  equipment: [-18, 0, 34] as Vec3,
  equipmentRoom: { minX: -25, maxX: -9, minZ: 28, maxZ: 40 },
  zhou: [-14.5, 0, 32] as Vec3,
  courier: [-35, 0, 19] as Vec3,
  xu: [-40, 0, 6] as Vec3,
  xuSafe: [-39.5, 0, 44] as Vec3,
  cartSpawns: [[-42, 0, 18], [-42, 0, 13], [-42, 0, 8]] as Vec3[],
  // Shared waypoints are all beyond the waiting line. Matching slots preserve front-to-back order.
  cartVia: [[-42, 0, 27]] as Vec3[],
  cartSafe: [[-42, 0, 43], [-42, 0, 38], [-42, 0, 33]] as Vec3[],
  ambulatorySpawns: [[-34.5, 0, 12], [-34.5, 0, 15]] as Vec3[],
  ambulatorySafe: [-35, 0, 39] as Vec3,
  wash: [-22, 0, 31] as Vec3,
  returnConsole: [-17, 0, 43] as Vec3,
  exit: [...FRONTGATE.exit] as Vec3,
};
