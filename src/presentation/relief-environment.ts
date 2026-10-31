import { bindGeneratedProp, cabinetRow, propPlacement, propSlot } from './GeneratedPropBindings';
import { CylinderGeometry, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { RELIEF as R } from '../content/relief-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';

function block(k: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete'): void {
  k.box(surface, at, size); k.solid(id, at, size);
}
function yard(k: PortKit): void {
  addGround(k.root, R.bounds);
  k.solid('relief-ground', [0, -0.2, 119], [140, 0.4, 142]);
  for (const x of [-70, 70]) block(k, `relief-boundary-x-${x}`, [x, 1.4, 119], [0.8, 2.8, 142]);
  for (const z of [48, 190]) block(k, `relief-boundary-z-${z}`, [0, 1.4, z], [140, 2.8, 0.8]);
  // The old inner-gate silhouette is north of this new playable courtyard.
  for (const x of [-17, 1]) k.box('pale', [x, 3.3, R.northGateLandmark[2]], [0.45, 6.6, 0.7]);
  k.box('steel', [-8, 6.65, R.northGateLandmark[2]], [19, 0.6, 1]);
  k.sign('北闸内门', [-8, 6.65, 47.35], 15, 0.45);
  for (const x of [11, 27]) k.box('steel', [x, 2.8, 57], [0.12, 5.6, 0.12]);
  for (const x of [-62, 61]) for (const z of [64, 100, 140, 180]) k.light(x, z, 7);
  for (let z = 54; z < 186; z += 7) k.box('white', [34, 0.015, z], [0.12, 0.02, 3], [0, 0, 0], false);
  for (let i = 0; i < 8; i++) {
    const x = i % 2 ? -100 : 104, z = 39 + i * 22, h = 14 + i % 3 * 5;
    k.box('paint', [x, h / 2, z], [20, h, 21], [0, 0, 0], false);
    k.cylinder('pale', [x + 4, h + 4, z], 1.1, 8);
    k.part('cone', 'ice', [x * 1.5, 4, z], [36, 36 + i % 3 * 10, 40], [0, i * 0.4, 0], false);
  }
  k.workshop(49, 142, 24, 32);
  k.tank(57, 112, 4, 11); k.tank(57, 124, 3.1, 8);
  k.tractor(49, 87, -0.3);
  k.container(2, 109, Math.PI / 2, 'pale');
  k.container(-53, 61, Math.PI / 2);
  k.workshop(-59, 102, 13, 20);
  block(k, 'relief-crane-pedestal', [55, 0.6, 60], [4.6, 1.2, 4.6], 'steel');
  block(k, 'relief-crane-tower', [55, 7.7, 60], [1.4, 14.2, 1.4], 'paint');
  k.beam('pale', [55, 14.8, 60], [29, 12.2, 67], 0.8);
  k.beam('steel', [55, 10, 60], [33, 12.6, 66], 0.30);
  k.cylinder('rubber', [29, 8.3, 67], 0.05, 7.8);
}
function protectedArrival(k: PortKit): void {
  // Workers and incoming relief share the protected west passage. The staggered gate gives the relief a real approach.
  block(k, 'relief-west-screen-north', [-30, 1.7, 72.5], [0.5, 3.4, 35], 'pale');
  block(k, 'relief-west-screen-south', [-30, 1.7, 114], [0.5, 3.4, 28], 'pale');
  block(k, 'relief-west-screen-overlap', [-23, 1.7, 95], [0.5, 3.4, 18], 'paint');
  block(k, 'relief-workers-north-cap', [-50, 1.7, 55], [40, 3.4, 0.5], 'pale');
  k.part('arch', 'pale', [-51, 4.4, 137], [30, 5, 24]);
  k.solid('relief-arrival-roof', [-51, 5.7, 137], [30, 2.6, 24]);
  for (const x of [-65, -37]) for (const z of [125.5, 148.5]) block(k, `relief-arrival-leg-${x}-${z}`, [x, 2.2, z], [0.25, 4.4, 0.25], 'steel');
  for (let z = 65; z < 130; z += 6) k.box('amber', [-45, 0.018, z], [0.1, 0.02, 2.8], [0, 0, 0], false);
  k.box('amber', [-26, 0.02, 132], [8, 0.02, 0.12], [0, 0, 0], false);
}
function firingAndWithdrawal(k: PortKit): void {
  k.cover(R.post[0], R.post[2] - 2.5, 7);
  k.cover(R.entryHold[0], R.entryHold[2] - 2.5, 7);
  k.cover(R.reliefPosts[1][0], R.reliefPosts[1][2] - 2.5, 6);
  k.cover(R.reliefPosts[2][0], R.reliefPosts[2][2] - 2.5, 6);
  k.cover(31, 64, 5); k.cover(-12, 57, 5);
  // Alternate ends of the two screens create the requested lateral crossings, with cover at either destination.
  block(k, 'relief-crossing-one-screen', [-14.5, 1.2, 102], [41, 2.4, 0.65], 'pale');
  block(k, 'relief-crossing-two-screen', [17, 1.2, 122], [46, 2.4, 0.65], 'paint');
  k.cover(22, 101.5, 6);
  k.cover(-22, 125.5, 6);
  k.box('steel', [-11.5, 1.5, 80.2], [0.08, 3, 0.08]);
  for (let x = -8; x < 22; x += 5) k.box('white', [x, 0.018, 104], [2.3, 0.02, 0.10], [0, 0, 0], false);
  for (let x = -22; x < 22; x += 5) k.box('white', [x, 0.018, 128], [2.3, 0.02, 0.10], [0, 0, 0], false);
  for (const [i, p] of R.ammo.entries()) {
  propSlot(k, `relief-ammo-${i}`, [propPlacement(`relief-ammo-${i}`, 'PROP-CARGO', [p[0] + 1.4, 0, p[2]], 1.4, 'z', Math.PI / 2)], slot => {
    block(slot, `relief-ammo-${i}`, [p[0] + 1.4, 0.5, p[2]], [1.5, 1, 0.9], 'steel');
    slot.box('amber', [p[0] + 1.4, 1.05, p[2]], [1.4, 0.10, 0.85]);
  });
  }
}
function restShelter(k: PortKit) {
  const r = R.restRoom;
  block(k, 'relief-rest-north', [-5, 2.5, r.minZ], [48, 5, 0.5], 'paint');
  block(k, 'relief-rest-east', [r.maxX, 2.5, 161], [0.5, 5, 30], 'paint');
  for (const [a, b] of [[146, 156], [166, 176]]) block(k, `relief-rest-west-${a}`, [-29, 2.5, (a + b) / 2], [0.5, 5, b - a], 'pale');
  block(k, 'relief-rest-west-lintel', [-29, 4.3, 161], [0.65, 1.4, 10], 'steel');
  for (const [a, b] of [[-29, -12], [-4, 19]]) block(k, `relief-rest-back-${a}`, [(a + b) / 2, 2.5, 176], [b - a, 5, 0.5], 'pale');
  block(k, 'relief-rest-back-lintel', [-8, 4.3, 176], [8, 1.4, 0.6], 'steel');
  block(k, 'relief-rest-roof', [-5, 5.2, 161], [49, 0.4, 31], 'pale');
  k.part('arch', 'pale', [-5, 5.4, 161], [49, 6.2, 31]);
  k.sign('休息室', [-29.36, 4.25, 161], 9, 0.6, -Math.PI / 2);
  k.sign('出口', [-8, 4.2, 176.35], 7, 0.55);
  // The seat is behind the authored foot position; it does not embed a standing/restoring player capsule.
  propSlot(k, 'relief-rest-seat', [propPlacement('relief-rest-seat', 'PROP-BENCH', [-8, 0, 160.85], 3.2, 'z', Math.PI / 2)], slot => {
  block(slot, 'relief-rest-seat', [-8, 0.43, 160.85], [3.2, 0.86, 0.8], 'pale');
  block(slot, 'relief-rest-seat-back', [-8, 1.1, 161.25], [3.2, 0.8, 0.16], 'paint');
  });
  block(k, 'relief-water-table', [-4.2, 0.5, 160.3], [1.25, 1, 1], 'pale');
  k.cylinder('white', [-4.2, 1.23, 160.3], 0.14, 0.44);
  propSlot(k, 'relief-water-mug', [propPlacement('relief-water-mug', 'PROP-LIFE-MUG', [-4.6, 1.01, 160.2], 0.18, 'y')], slot => {
  slot.cylinder('steel', [-4.6, 1.10, 160.2], 0.07, 0.18);
  });
  block(k, 'relief-radio-table', [-12.5, 0.5, 160.3], [1.4, 1, 1], 'steel');
  propSlot(k, 'relief-table-radio', [propPlacement('relief-table-radio', 'PROP-RADIO-PACK', [-12.5, 1.002, 160.3], 0.48, 'y')], slot => {
  slot.box('rubber', [-12.5, 1.15, 160.3], [0.55, 0.3, 0.35]);
  slot.cylinder('steel', [-12.7, 1.6, 160.3], 0.018, 0.7);
  });
  for (const x of [-20, 9]) {
  propSlot(k, `relief-rest-locker-${x}`, cabinetRow(`relief-rest-locker-${x}`, [x, 0, 149], 3.5, 2.6), slot => {
    block(slot, `relief-rest-locker-${x}`, [x, 1.3, 149], [3.5, 2.6, 2], 'steel');
    slot.box('white', [x, 1.8, 150.05], [0.4, 0.55, 0.06]);
  });
    k.cylinder('amber', [x, 4.5, 161], 0.16, 26, [Math.PI / 2, 0, 0]);
  }
  const brace = new PortKit(); brace.root.name = 'relief-care-spare-strap';
  brace.box('amber', [-4.25, 1.045, 160.65], [0.12, 0.03, 0.42]); brace.flush();
  bindGeneratedProp(brace.root, 'relief-care-spare-brace', [propPlacement('relief-care-spare-brace', 'PROP-ARMOR-LEFT-BRACE', [-4.25, 1.002, 160.65], 0.42, 'y')]); k.root.add(brace.root);
  const light = new PointLight(0xffd9ac, 65, 25, 2); light.position.set(-8, 4.2, 159); k.root.add(light);
  return brace.root;
}

/** A separate rear courtyard keeps the old northern landmark while the player retreats south into protected rest. */
export function buildRelief(k: PortKit): SceneDynamics {
  k.root.name = 'S09-relief-rear-courtyard-placeholder';
  yard(k); protectedArrival(k); firingAndWithdrawal(k); const strap = restShelter(k);
  const shape = new CylinderGeometry(0.12, 0.12, 0.07, 12);
  const makeLamp = (name: string, at: Vec3) => {
    const mat = new MeshStandardMaterial({ color: 0x647b80, emissive: 0x647b80, emissiveIntensity: 0.25, roughness: 0.4 });
    const mesh = new Mesh(shape, mat); mesh.name = name; mesh.position.set(...at); mesh.rotation.x = Math.PI / 2; k.root.add(mesh); return mat;
  };
  const arrival = makeLamp('relief-arrival-ready', [-50, 4.0, 125]);
  const post = makeLamp('relief-post-radio', [-11.5, 2.7, 80.3]);
  const radio = makeLamp('relief-rest-radio', [-12.5, 1.2, 160.5]);
  const set = (mat: MeshStandardMaterial, active: boolean) => { mat.color.setHex(active ? 0xb7dac8 : 0x647b80); mat.emissive.copy(mat.color); mat.emissiveIntensity = active ? 1.3 : 0.25; };
  return { bounds: R.bounds, update() {}, setFacts(facts) {
    set(arrival, facts.includes('relief-arrived')); set(post, facts.includes('relief-posts-held'));
    set(radio, facts.includes('relief-handover-complete')); strap.visible = !facts.includes('zhou-brace-adjusted');
  } };
}
