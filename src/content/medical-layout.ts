import type { Vec3 } from '../contracts';

/** The old maintenance station remains southwest of the port, beside the S08 reception. */
export const MEDICAL = {
  bounds: { minX: -424, maxX: -380, minZ: 32, maxZ: 84 },
  spawn: [-399, 0, 72] as Vec3,
  registration: [-404, 0, 68] as Vec3,
  equipment: [-405, 0, 58] as Vec3,
  recordDesk: [-397, 0, 55] as Vec3,
  zhouBed: [-405, 0, 44] as Vec3,
  zhouVisit: [-402, 0, 44] as Vec3,
  mengBed: [-392, 0, 44] as Vec3,
  mengVisit: [-395, 0, 44] as Vec3,
  doctor: [-399, 0, 46] as Vec3,
  doctorTalk: [-399, 0, 52] as Vec3,
  xu: [-411, 0, 59] as Vec3,
  rest: [-412, 0, 62] as Vec3,
  radio: [-400, 0, 70] as Vec3,
  exit: [-396, 0, 78] as Vec3,
  nurse: [-409, 0, 43] as Vec3,
  nurseRoute: [[-409, 0, 48], [-399, 0, 48], [-396, 0, 43]] as Vec3[],
  doctorRoute: [[-400, 0, 46], [-402, 0, 46], [-402, 0, 44]] as Vec3[],
};
