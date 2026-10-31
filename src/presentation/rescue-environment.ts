import type { Vec3 } from '../contracts';
import { RESCUE as R } from '../content/rescue-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';

function block(k: PortKit, id: string, p: Vec3, size: Vec3, surface: Surface = 'concrete') {
  k.box(surface, p, size); k.solid(id, p, size);
}
function road(k: PortKit, a: Vec3, b: Vec3) {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const center: Vec3 = [(a[0] + b[0]) / 2, 0.012, (a[2] + b[2]) / 2];
  k.box('rubber', center, [16, 0.018, length + 1], [0, yaw, 0], false);
  for (let t = 4; t < length; t += 8) {
    const p: Vec3 = [a[0] + dx * t / length, 0.029, a[2] + dz * t / length];
    k.box('amber', p, [0.13, 0.018, 3.3], [0, yaw, 0], false);
  }
  for (const side of [-1, 1]) {
    const x = center[0] + Math.cos(yaw) * side * 7.7, z = center[2] - Math.sin(yaw) * side * 7.7;
    k.box('white', [x, 0.029, z], [0.13, 0.018, length], [0, yaw, 0], false);
  }
}

/** Equipment crossroads, a specific hard-cover rescue pocket, and a continuous western vehicle lane. */
export function buildRescue(k: PortKit): SceneDynamics {
  k.root.name = 'S10-rescue-equipment-crossroads-placeholder';
  addGround(k.root, R.bounds);
  // Local slabs keep large-coordinate swept box queries well conditioned.
  for (let x = R.bounds.minX; x < R.bounds.maxX; x += 40) for (let z = R.bounds.minZ; z < R.bounds.maxZ; z += 40) {
    const w = Math.min(40, R.bounds.maxX - x), d = Math.min(40, R.bounds.maxZ - z);
    k.solid(`rescue-ground-${x}-${z}`, [x + w / 2, -0.2, z + d / 2], [w + 0.04, 0.4, d + 0.04]);
  }
  for (const x of [-430, 70]) block(k, `rescue-boundary-x-${x}`, [x, 1.5, 170], [0.6, 3, 260]);
  for (const z of [40, 300]) block(k, `rescue-boundary-z-${z}`, [-180, 1.5, z], [500, 3, 0.6]);
  // The first battle is around the equipment yard rather than in the transport lane.
  k.workshop(-34, 185, 22, 20);
  k.workshop(11, 266, 36, 24);
  k.tank(-51, 202, 5.5, 12); k.tank(-65, 202, 4.2, 9);
  k.container(-31, 208, Math.PI / 2, 'pale');
  k.container(16, 231, 0);
  k.container(39, 252, Math.PI / 2);
  // Waist-high choices leave visible targets above cover and a clear main route.
  k.cover(-4, 190, 5); k.cover(6, 205, 5);
  k.cover(-19, 230, 4, Math.PI / 2); k.cover(-6, 243, 5);
  k.cover(27, 216, 5, Math.PI / 2);
  k.box('steel', [15, 2.7, 181], [0.2, 5.4, 0.2]);
  k.box('steel', [35, 2.7, 181], [0.2, 5.4, 0.2]);
  // The machine blocks the NE lane to the patient, while the southern edge is
  // still exposed. The subsequent six-metre step crosses that visible edge.
  block(k, 'rescue-hard-cover', [-48, 2.1, 224.3], [4.2, 4.2, 1.4], 'steel');
  k.box('pale', [-48, 4.25, 224.3], [4.4, 0.16, 1.6]);
  for (const x of [-49.4, -48, -46.6]) k.box('amber', [x, 1.4, 225.02], [0.25, 1.6, 0.04]);
  // Realistic-height NE equipment identifies the source direction without a
  // new hidden enemy behind the player or a wall intersecting the story shot.
  block(k, 'rescue-inland-service-platform', [47, 1.0, 163], [12, 2, 10], 'pale');
  k.box('steel', [47, 2.15, 163], [12.5, 0.3, 10.4]);
  for (const x of [42, 52]) k.box('steel', [x, 3.7, 178], [0.2, 3.4, 0.2]);
  for (const [i, p] of R.ammo.entries()) {
    block(k, `rescue-ammo-${i}`, [p[0] - 1.6, 0.48, p[2]], [1.4, 0.96, 0.8], 'steel');
    k.box('amber', [p[0] - 1.6, 1.0, p[2]], [1.4, 0.08, 0.8]);
  }
  const route = [R.pickup, ...R.transportVia];
  route.slice(1).forEach((b, i) => road(k, route[i], b));
  road(k, R.carryEnd, R.pickup);
  // Bulk storage flanks, rather than blocks, the authored vehicle turns.
  for (const [x, z] of [[-112, 272], [-180, 238], [-246, 188], [-295, 170], [-365, 125]]) {
    k.workshop(x, z, 26, 18); k.light(x - 15, z - 10, 8);
  }
  for (const [x, z] of [[-145, 209], [-225, 146], [-306, 101]]) {
    k.tank(x, z, 6, 14); k.tank(x - 16, z, 4.5, 10);
  }
  k.part('arch', 'pale', [-78, 4.6, 247], [22, 5.8, 19]);
  k.solid('rescue-pickup-roof', [-78, 6.0, 247], [22, 2.8, 19]);
  for (const [x, z] of [[-88, 239], [-88, 255], [-68, 255]]) block(k, `rescue-pickup-leg-${x}-${z}`, [x, 2.3, z], [0.25, 4.6, 0.25], 'steel');
  k.workshop(-413, 55, 16, 22);
  for (const x of [-410, -390]) k.light(x, 66, 6);
  for (const [x, z] of [[-18, 177], [58, 228], [-64, 256]]) k.light(x, z, 8);
  return { bounds: R.bounds, update() {}, setFacts() {} };
}
