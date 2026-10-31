import { CylinderGeometry, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { FRONTGATE as F } from '../content/frontgate-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';

function block(kit: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete'): void {
  kit.box(surface, at, size); kit.solid(id, at, size);
}

function gantry(kit: PortKit, x: number, z: number, width: number, text: string): void {
  for (const dx of [-width / 2, width / 2]) {
    block(kit, `gantry-${x}-${z}-${dx}`, [x + dx, 3.3, z], [0.45, 6.6, 0.70], 'pale');
    kit.box('steel', [x + dx, 0.20, z], [1.10, 0.4, 1.3]);
  }
  block(kit, `gantry-header-${x}-${z}`, [x, 6.65, z], [width + 1, 0.6, 1.0], 'steel');
  kit.beam('pale', [x - width / 2, 4.7, z], [x - width / 2 + 2.4, 6.5, z], 0.16);
  kit.beam('pale', [x + width / 2, 4.7, z], [x + width / 2 - 2.4, 6.5, z], 0.16);
  kit.box('amber', [x, 6.20, z + 0.35], [2.5, 0.55, 0.65]);
  kit.cylinder('rubber', [x, 5.15, z], 0.045, 1.5);
  kit.box('steel', [x, 4.40, z], [0.42, 0.20, 0.35]);
  kit.sign(text, [x, 6.65, z + 0.52], width - 1.8, 0.45);
}

function filterBank(kit: PortKit): void {
  block(kit, 'front-filter-base', [24, 0.20, 5], [4.8, 0.40, 6.2]);
  kit.visualSlot('front-filter-machinery', slot => {
    for (const x of [22.9, 25.1]) {
      slot.cylinder('pale', [x, 1.30, 5], 0.90, 5.5, [Math.PI / 2, 0, 0]);
      for (const z of [2.45, 3.8, 6.2, 7.55]) slot.cylinder('steel', [x, 1.30, z], 0.95, 0.12, [Math.PI / 2, 0, 0]);
      slot.cylinder('amber', [x, 1.30, 7.9], 0.22, 0.55, [Math.PI / 2, 0, 0]);
      for (const z of [3.2, 6.8]) slot.box('steel', [x, 0.6, z], [1.5, 0.65, 0.5]);
    }
  });
  kit.solid('front-filter-bank', [24, 1.2, 5], [4.2, 2.4, 6.4]);
}

function workerBackRoute(kit: PortKit): void {
  // A north cap and longitudinal wall form a real protected L-shaped service court.
  block(kit, 'worker-screen-north', [-42, 1.7, -38], [24, 3.4, 0.7], 'pale');
  block(kit, 'worker-screen-east', [-30, 1.7, -0.5], [0.7, 3.4, 75], 'pale');
  kit.box('steel', [-30, 3.47, -0.5], [0.8, 0.14, 75]);
  kit.box('steel', [-42, 3.47, -38], [24, 0.14, 0.8]);
  for (let z = -33; z <= 34; z += 7) {
    kit.box('paint', [-29.60, 1.65, z], [0.10, 3.3, 0.16]);
    kit.box('signal', [-30.42, 2.5, z], [0.08, 0.15, 0.48], [0, 0, 0], false);
  }
  // Workshop props occupy the sides of the route; no character geometry is embedded in the shelter.
  kit.part('arch', 'pale', [-41, 4.1, -23], [18, 3.2, 14]);
  kit.solid('workers-repair-shelter-roof', [-41, 4.95, -23], [18, 1.7, 14]);
  for (const x of [-49, -33]) for (const z of [-30, -16]) block(kit, `workers-shelter-${x}-${z}`, [x, 2.05, z], [0.22, 4.1, 0.22], 'steel');
  kit.tank(-48, -32, 1.7, 4.2);
  block(kit, 'workers-parts-rack', [-33.8, 1.25, -31], [3.4, 2.5, 1.1], 'steel');
  for (const y of [0.45, 1.3, 2.15]) kit.box('pale', [-33.8, y, -30.38], [3.3, 0.10, 0.18]);
  kit.workshop(-49, 20, 8, 18);
  for (let z = -32; z <= 34; z += 4) {
    kit.box('amber', [-44.5, 0.016, z], [0.10, 0.025, 2.3], [0, 0, 0], false);
    kit.box('white', [-39.2, 0.016, z], [0.10, 0.025, 2.3], [0, 0, 0], false);
  }
  for (const z of [-10, 10, 30]) {
    kit.box('white', [-42.35, 0.02, z], [0.09, 0.018, 0.95], [0, 0.55, 0], false);
    kit.box('white', [-41.65, 0.02, z], [0.09, 0.018, 0.95], [0, -0.55, 0], false);
  }
  kit.sign('人员通道 ↓', [-30.42, 2.6, -19], 6.5, 0.55, -Math.PI / 2);
  for (const x of [-46, -34]) block(kit, `workers-safe-frame-${x}`, [x, 2.3, 42], [0.25, 4.6, 0.3], 'pale');
  kit.box('steel', [-40, 4.6, 42], [12.6, 0.35, 0.5]);
  kit.box('amber', [-40, 0.02, 40], [9.5, 0.02, 0.12], [0, 0, 0], false);
  const lamp = new PointLight(0xffd4a3, 50, 20, 2); lamp.position.set(-40, 4.0, 40); kit.root.add(lamp);
}

function distantPort(kit: PortKit): void {
  for (let i = 0; i < 11; i++) {
    const x = -101 - i % 3 * 18, z = 42 - i * 16;
    kit.part('cone', 'ice', [x, 5, z], [27 + i % 3 * 6, 34 + i % 4 * 7, 26], [0, i * 0.45, 0], false);
  }
  for (let i = 0; i < 8; i++) {
    const x = 77 + i % 3 * 17, z = 30 - i * 19, height = 12 + i % 4 * 4;
    kit.box('paint', [x, height / 2, z], [14, height, 16], [0, 0, 0], false);
    kit.box('pale', [x, height + 0.3, z], [15, 0.6, 17], [0, 0, 0], false);
    kit.cylinder('steel', [x + 3, height + 3, z], 0.75, 6);
  }
  kit.box('steel', [79, 14, 6], [3.4, 28, 3.4], [0, 0, 0], false);
  kit.beam('pale', [79, 28, 6], [58, 22, 19], 1.1);
  kit.beam('amber', [79, 28, 6], [103, 22, -7], 1.1);
  kit.beam('steel', [79, 20, 6], [62, 23, 16], 0.6);
  kit.cylinder('rubber', [59, 15, 18], 0.055, 14);
}

/** Formal E04 front line, separate from the compact northgate validation arena. */
export function buildFrontGate(kit: PortKit): SceneDynamics {
  kit.root.name = 'S05-north-frontline-placeholder';
  addGround(kit.root, F.bounds);
  kit.solid('front-ground', [0, -0.2, -22], [108, 0.4, 148]);
  for (const x of [-54, 54]) block(kit, `front-boundary-x-${x}`, [x, 1.4, -22], [0.8, 2.8, 148]);
  for (const z of [-96, 52]) block(kit, `front-boundary-z-${z}`, [0, 1.4, z], [108, 2.8, 0.8]);
  distantPort(kit);
  workerBackRoute(kit);
  for (const x of [-27, 33]) for (const z of [-66, -28, 18, 43]) kit.light(x, z, 7);
  for (let z = -91; z <= 38; z += 7) {
    kit.box('white', [0, 0.014, z], [0.12, 0.02, 3.2], [0, 0, 0], false);
    kit.box('amber', [-15.5, 0.014, z], [0.08, 0.02, 3.5], [0, 0, 0], false);
    kit.box('amber', [15.5, 0.014, z], [0.08, 0.02, 3.5], [0, 0, 0], false);
  }
  for (let x = 22; x <= 50; x += 5) kit.box('white', [x, 0.015, -33], [2.6, 0.02, 0.12], [0, 0, 0], false);

  // North staging is behind real cargo bodies; troops emerge around two ends into a broad approach.
  for (const x of [-11, -4, 3]) kit.container(x, -79, Math.PI / 2, x === -4 ? 'pale' : 'paint');
  kit.workshop(-22, -64, 10, 12);
  kit.workshop(28, -61, 12, 18);
  kit.workshop(42, -64, 18, 30);
  kit.cover(-17, -49.7, 4.5);
  kit.cover(-5, -45.7, 4.6);
  kit.cover(10, -51.7, 4.2);
  kit.cover(15, -36.7, 4.4);
  kit.cover(-8, -31.7, 4.2);
  kit.cover(7, -26.6, 3.8);
  for (const x of [-4, 6]) kit.box('steel', [x, 4.1, -75.1], [0.12, 2.6, 0.12]);

  // Load scale with two flanking firing positions; anchors remain at ground level alongside the low deck.
  block(kit, 'front-weigh-deck', [1, 0.06, -15], [8, 0.12, 22], 'steel');
  for (let z = -25; z < -4; z += 1.3) kit.box('pale', [1, 0.125, z], [7.8, 0.025, 0.035], [0, 0, 0], false);
  for (const x of [-2.8, 4.8]) kit.box('amber', [x, 0.13, -15], [0.10, 0.02, 21], [0, 0, 0], false);
  gantry(kit, 0, -24, 28, '查验口');
  kit.workshop(-21, -13, 10, 12);
  kit.box('glass', [-15.92, 2.4, -13], [0.08, 1.3, 3.4]);
  kit.box('signal', [-15.85, 2.8, -13], [0.035, 0.14, 2.5], [0, 0, 0], false);
  kit.cover(F.weighA[0], F.weighA[2] - 2.3, 6.2);
  kit.cover(F.weighB[0], F.weighB[2] - 2.3, 5.5);
  kit.cover(F.observe[0], F.observe[2] - 2.5, 6.0);
  kit.cover(F.rearPost[0], F.rearPost[2] - 2.7, 6.2);
  kit.box('steel', [13.5, 1.9, -13.7], [0.10, 3.8, 0.10]);
  kit.visualSlot('front-tug', slot => slot.tractor(21, 20, -0.15));
  kit.container(29, 26, Math.PI / 2, 'pale');

  // East entry has its own staging bend, gateway, visible road and east-facing hard cover.
  block(kit, 'front-east-staging-block', [48, 1.7, -32], [4, 3.4, 10], 'steel');
  for (const z of [-42, -22]) block(kit, `east-entry-post-${z}`, [40, 3.6, z], [0.65, 7.2, 0.65], 'pale');
  block(kit, 'east-entry-header', [40, 7.15, -32], [0.8, 0.6, 20.6], 'steel');
  kit.sign('东货道', [39.53, 7.15, -32], 13.5, 0.48, -Math.PI / 2);
  kit.cover(26, -35, 4.2, Math.PI / 2);
  kit.cover(26.7, -22, 4.0, Math.PI / 2);
  kit.cover(21.7, -14, 4.0, Math.PI / 2);
  kit.cover(30.7, -5, 4.2, Math.PI / 2);
  kit.cover(F.eastPost[0] + 2.3, F.eastPost[2], 7.0, Math.PI / 2);
  filterBank(kit);
  kit.visualSlot('front-east-tank', slot => slot.tank(43, 10, 3.1, 8.8));
  kit.tank(44, 27, 2.2, 7);
  kit.cylinder('amber', [37, 2.5, 19], 0.18, 21, [Math.PI / 2, 0, 0]);
  kit.cylinder('pale', [38.1, 2.9, 19], 0.14, 21, [Math.PI / 2, 0, 0]);
  const eastLight = new PointLight(0xffcc8d, 25, 16, 2); eastLight.position.set(37, 5.5, -32); kit.root.add(eastLight);
  const scaleLight = new PointLight(0xffd3a2, 22, 14, 2); scaleLight.position.set(-17, 4.0, -12); kit.root.add(scaleLight);

  // Inner gate frames the end of the player's withdrawal, beyond the last north-facing cover.
  gantry(kit, -8, 46.8, 18, '内门');
  kit.box('amber', [-8, 0.02, 45], [11, 0.02, 0.15], [0, 0, 0], false);
  kit.workshop(16, 43, 16, 12);
  kit.box('steel', [-7.7, 1.6, 28], [0.10, 3.2, 0.10]);
  kit.box('steel', [39.9, 5.7, -32], [0.4, 0.6, 0.5]);
  kit.box('steel', [40, 6.45, -32], [0.12, 1.5, 0.12]);
  kit.box('steel', [-8, 6.18, 46.36], [0.4, 0.4, 0.2]);
  const signalShape = new CylinderGeometry(0.15, 0.15, 0.09, 12);
  const indicator = (name: string, at: Vec3, side: boolean): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({ color: 0x617b81, emissive: 0x617b81, emissiveIntensity: 0.3, roughness: 0.35 });
    const mesh = new Mesh(signalShape, material); mesh.name = name; mesh.position.set(...at);
    if (side) mesh.rotation.z = Math.PI / 2; else mesh.rotation.x = Math.PI / 2;
    kit.root.add(mesh); return material;
  };
  const eastSignal = indicator('front-east-warning', [39.63, 5.7, -32], true);
  const routeSignal = indicator('front-workers-route-signal', [-30.42, 2.1, -19], true);
  const innerSignal = indicator('front-inner-ready', [-8, 6.18, 46.22], false);
  const setSignal = (material: MeshStandardMaterial, color: number, active: boolean): void => {
    material.color.setHex(color); material.emissive.copy(material.color); material.emissiveIntensity = active ? 1.4 : 0.3;
  };
  return {
    bounds: F.bounds,
    update() {},
    setFacts(facts) {
      const east = facts.includes('east-road-warned') && !facts.includes('front-team-returned');
      const released = facts.includes('front-first-released');
      const returned = facts.includes('front-team-returned');
      setSignal(eastSignal, east ? 0xffbc69 : 0x617b81, east);
      setSignal(routeSignal, released ? 0xb6ddcb : 0x617b81, released);
      setSignal(innerSignal, returned ? 0xffdfaa : 0x617b81, returned);
      eastLight.intensity = east ? 45 : 12;
    },
  };
}
