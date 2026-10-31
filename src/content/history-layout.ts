import type { Vec3 } from '../contracts';

interface EvacuationResident {
  at: Vec3; safe: Vec3; facing: number; safeFacing: number;
  delay: number; arrivalLead: number; passage: [number, number, number];
}
// Small household-sized knots, with a few people hanging back. Passage values
// are doorway/stair/lower-corridor Z coordinates, not formation lanes.
const EVACUATION_RESIDENTS: EvacuationResident[] = [
  { at: [-19.6, 0, 4.75], safe: [-45.55, -2.4, 4.65], facing: -1.20, safeFacing: -0.55, delay: 0, arrivalLead: 1.50, passage: [4.65, 4.40, 4.80] },
  { at: [-20.72, 0, 5.20], safe: [-44.65, -2.4, 4.15], facing: 2.10, safeFacing: 0.40, delay: 0.63, arrivalLead: 1.10, passage: [5.35, 5.10, 4.25] },
  { at: [-18.85, 0, 7.36], safe: [-46.4, -2.4, 5.75], facing: -2.05, safeFacing: 1.45, delay: 1.42, arrivalLead: 1.75, passage: [7.15, 7.90, 8.05] },
  { at: [-20.20, 0, 7.66], safe: [-44.65, -2.4, 6.55], facing: -0.65, safeFacing: -1.90, delay: 2.05, arrivalLead: 1.28, passage: [7.30, 8.15, 7.70] },
  { at: [-23.45, 0, 4.30], safe: [-45.65, -2.4, 7.65], facing: -0.45, safeFacing: 2.20, delay: 4.28, arrivalLead: 0.80, passage: [4.50, 4.65, 4.20] },
  { at: [-24.35, 0, 4.95], safe: [-43.65, -2.4, 8.12], facing: 1.30, safeFacing: -2.65, delay: 5.02, arrivalLead: 0.32, passage: [5.10, 5.30, 5.65] },
  { at: [-22.86, 0, 8.10], safe: [-41.75, -2.4, 4.20], facing: -2.35, safeFacing: 0.75, delay: 5.61, arrivalLead: 0.38, passage: [7.25, 8.05, 8.15] },
  { at: [-24.48, 0, 7.04], safe: [-40.55, -2.4, 4.65], facing: 0.65, safeFacing: -0.85, delay: 5.19, arrivalLead: 0.68, passage: [7.20, 8.10, 7.95] },
  { at: [-24.85, 0, 8.22], safe: [-41.90, -2.4, 8.10], facing: 2.55, safeFacing: -2.25, delay: 6.03, arrivalLead: 0.08, passage: [7.30, 7.85, 8.00] },
  { at: [-17.55, 0, 4.42], safe: [-40.60, -2.4, 7.25], facing: -1.65, safeFacing: 2.65, delay: 2.77, arrivalLead: 1.92, passage: [4.80, 5.00, 4.60] },
  { at: [-17.92, 0, 6.80], safe: [-39.55, -2.4, 5.00], facing: -2.80, safeFacing: 0.15, delay: 3.31, arrivalLead: 1.03, passage: [6.65, 5.65, 5.15] },
  { at: [-21.25, 0, 4.09], safe: [-38.70, -2.4, 8.10], facing: -0.95, safeFacing: -2.85, delay: 0.25, arrivalLead: 1.55, passage: [4.55, 4.35, 4.15] },
];

const HALL_GROUPS: Array<{ center: [number, number]; people: Array<[number, number]> }> = [
  { center: [-4.1, 8.35], people: [[-5.35, 7.55], [-4.15, 8.05], [-4.65, 9.18], [-2.92, 7.42], [-3.16, 9.47]] },
  { center: [-3.7, -0.1], people: [[-4.85, 0.15], [-3.62, 0.92], [-3.93, -1.03], [-2.20, -0.28]] },
  { center: [2.9, 8.7], people: [[1.05, 8.14], [2.42, 7.38], [2.75, 9.29], [4.03, 8.48], [4.55, 10.13]] },
  { center: [10.2, 8.4], people: [[9.24, 7.17], [10.72, 7.82], [9.65, 9.06], [11.36, 9.43]] },
  { center: [18.1, 10.2], people: [[16.61, 9.45], [18.03, 8.88], [18.45, 10.57], [19.91, 10.02], [17.25, 11.62]] },
  { center: [3.2, 14.4], people: [[1.24, 13.35], [2.61, 14.04], [3.12, 15.42], [4.48, 13.83], [5.06, 15.26]] },
  { center: [20.7, 14.6], people: [[19.13, 13.8], [20.42, 14.61], [22.05, 13.95], [21.33, 15.82]] },
];
const HALL_RESIDENTS = HALL_GROUPS.flatMap((group, groupIndex) => group.people.map(([x, z], i) => {
  // Most look towards their own group; one watches an entrance or the escape route.
  const focus = i === group.people.length - 1 ? groupIndex % 2 ? [-22, 6] : [28, 0] : group.center;
  return { at: [x, 0, z] as Vec3,
    facing: Math.atan2(focus[0] - x, focus[1] - z) + [0.14, -0.11, 0.22, -0.08, 0.05][i],
    reactionDelay: [0.06, 0.19, 0.02, 0.25, 0.12][(groupIndex + i) % 5] };
}));

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
  // Only these six people are the playable protection objective. Both background crowds stay separate.
  civilians: [[-9, 0, 7], [-5, 0, 8], [-14, 0, 15], [-6, 0, 17], [1, 0, 12], [3, 0, 17]] as Vec3[],
  civilianVia: [[-19, 0, 6], [-24, 0, 6], [-33, -2.4, 6], [-40, -2.4, 6]] as Vec3[],
  civilianSafe: [[-43.65, -2.4, 4.90], [-42.55, -2.4, 3.90], [-43.30, -2.4, 7.35],
    [-42.05, -2.4, 6.45], [-45.00, -2.4, 5.50], [-41.15, -2.4, 5.75]] as Vec3[],
  civilianSafeFacing: [2.4, 0.9, -2.3, -0.8, 1.5, 0.2],
  evacCrowd: EVACUATION_RESIDENTS.map(person => person.at),
  evacCrowdSafe: EVACUATION_RESIDENTS.map(person => person.safe),
  evacCrowdFacing: EVACUATION_RESIDENTS.map(person => person.facing),
  evacCrowdSafeFacing: EVACUATION_RESIDENTS.map(person => person.safeFacing),
  evacCrowdDelay: EVACUATION_RESIDENTS.map(person => person.delay),
  evacCrowdArrivalLead: EVACUATION_RESIDENTS.map(person => person.arrivalLead),
  evacCrowdPassage: EVACUATION_RESIDENTS.map(person => person.passage),
  // Foreground groups begin 5–8m from Zhou. The z=4 sightline to Zhao stays clear;
  // the wider rows avoid benches, columns and the fallen cabinet.
  crowd: HALL_RESIDENTS.map(person => person.at),
  crowdFacing: HALL_RESIDENTS.map(person => person.facing),
  crowdReactionDelay: HALL_RESIDENTS.map(person => person.reactionDelay),
  enemyEntries: [[32, 0, -6], [32, 0, 1], [16, 0, -26], [22, 0, -26]] as Vec3[],
  enemyPosts: [[21, 0, -5], [19, 0, 3], [12, 0, -16], [7, 0, -13], [12, 0, -7], [15, 0, 8]] as Vec3[],
};
