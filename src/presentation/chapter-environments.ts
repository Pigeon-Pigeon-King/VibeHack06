import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { SceneFrame, Vec3 } from '../contracts';
import { NIGHT, WORKERS } from '../content/chapter-layout';
import { characterMaterial, VertexParts } from './model-tools';
import { addGround, PortKit, type SceneBounds, type Surface } from './port-kit';

export interface SceneDynamics {
  bounds: SceneBounds;
  update(time: number, frame?: SceneFrame): void;
  setFacts(facts: readonly string[]): void;
  /** Release leased/shared resources before the environment's generic tree cleanup. */
  dispose?(): void;
}

function wall(kit: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete'): void {
  kit.box(surface, at, size);
  kit.solid(id, at, size);
}

function chapterGround(kit: PortKit, bounds: SceneBounds): void {
  addGround(kit.root, bounds);
  const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
  kit.solid('ground', [x, -0.2, z], [width, 0.4, depth]);
  for (const bx of [bounds.minX, bounds.maxX]) wall(kit, `boundary-x-${bx}`, [bx, 1.4, z], [0.8, 2.8, depth]);
  for (const bz of [bounds.minZ, bounds.maxZ]) wall(kit, `boundary-z-${bz}`, [x, 1.4, bz], [width, 2.8, 0.8]);
}

function room(kit: PortKit, id: string, minX: number, maxX: number, minZ: number, maxZ: number, doorZ: number, openingSide: 'left' | 'right'): void {
  const width = maxX - minX, depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  const innerX = openingSide === 'left' ? minX : maxX;
  const outerX = openingSide === 'left' ? maxX : minX;
  wall(kit, `${id}-back`, [outerX, 2.4, centerZ], [0.35, 4.8, depth], 'paint');
  for (const z of [minZ, maxZ]) wall(kit, `${id}-end-${z}`, [centerX, 2.4, z], [width, 4.8, 0.35], 'pale');
  const gap = 3.2;
  for (const [from, to] of [[minZ, doorZ - gap], [doorZ + gap, maxZ]]) {
    if (to > from) wall(kit, `${id}-corridor-${from}`, [innerX, 2.4, (from + to) / 2], [0.35, 4.8, to - from], 'paint');
  }
  wall(kit, `${id}-lintel`, [innerX, 4.1, doorZ], [0.55, 1.4, gap * 2], 'pale');
  wall(kit, `${id}-roof`, [centerX, 4.95, centerZ], [width + 0.5, 0.30, depth + 0.5], 'pale');
  kit.box('signal', [centerX, 4.60, centerZ], [Math.min(width - 2, 8), 0.08, 0.22], [0, 0, 0], false);
  kit.box('amber', [innerX, 0.02, doorZ], [0.35, 0.02, 5.8], [0, 0, 0], false);
}

function light(kit: PortKit, at: Vec3, color: number, intensity: number, range: number): void {
  const lamp = new PointLight(color, intensity, range, 2);
  lamp.position.set(...at); kit.root.add(lamp);
}

function crate(root: Group, at: Vec3, name: string): Group {
  const group = new Group(); group.name = name; group.position.set(...at);
  const material = characterMaterial();
  new VertexParts()
    .box([0.88, 0.55, 0.64], [0, 0.275, 0], 0x8c968b)
    .box([0.94, 0.065, 0.70], [0, 0.56, 0], 0x485b61)
    .box([0.065, 0.60, 0.73], [-0.28, 0.30, 0], 0xd9d6bb)
    .box([0.065, 0.60, 0.73], [0.28, 0.30, 0], 0xd9d6bb)
    .box([0.32, 0.18, 0.012], [0, 0.32, 0.328], 0x253c49)
    .box([0.15, 0.045, 0.02], [0, 0.32, 0.34], 0xd9d6bb)
    .mesh(group, material, name);
  group.userData.assetStatus = 'placeholder'; root.add(group); return group;
}

function fan(kit: PortKit): { rotor: Group; obstruction: Group; lamp: MeshStandardMaterial } {
  const at: Vec3 = [NIGHT.fan[0], 1.75, NIGHT.fan[2] - 2.7];
  wall(kit, 'night-fan-housing', at, [4.0, 3.5, 2.4], 'steel');
  kit.box('pale', [at[0], 3.6, at[2]], [4.2, 0.15, 2.6]);
  kit.cylinder('rubber', [at[0], at[1], at[2] + 1.24], 1.38, 0.10, [Math.PI / 2, 0, 0]);
  const rotor = new Group(); rotor.name = 'night-fan-rotor'; rotor.position.set(at[0], at[1], at[2] + 1.32);
  const pieces = new VertexParts().cylinder(0.25, 0.22, [0, 0, 0], 0xc5c9b7, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    pieces.box([0.30, 0.90, 0.07], [-Math.sin(angle) * 0.68, Math.cos(angle) * 0.68, 0], 0x789196, [0, 0, angle + 0.15]);
  }
  pieces.mesh(rotor, characterMaterial(), 'fan-blades'); kit.root.add(rotor);
  const obstruction = new Group(); obstruction.name = 'night-fan-obstruction';
  obstruction.position.set(at[0], at[1] - 0.4, at[2] + 1.48);
  new VertexParts()
    .box([1.15, 0.38, 0.14], [0, 0, 0], 0xb19b6c, [0, 0, 0.42])
    .box([0.35, 0.65, 0.10], [-0.23, 0.18, 0.08], 0x596c71, [0, 0, -0.3])
    .mesh(obstruction, characterMaterial(), 'wedged-filter-debris');
  kit.root.add(obstruction);
  const lamp = new MeshStandardMaterial({ color: 0xe3ab56, emissive: 0xe3ab56, emissiveIntensity: 1.2, roughness: 0.35 });
  const signal = new Mesh(new CylinderGeometry(0.11, 0.11, 0.05, 12), lamp);
  signal.name = 'night-fan-status'; signal.rotation.x = Math.PI / 2;
  signal.position.set(at[0] + 1.6, 2.8, at[2] + 1.23); kit.root.add(signal);
  kit.terminal(NIGHT.fanReset);
  return { rotor, obstruction, lamp };
}

export function buildNightShift(kit: PortKit): SceneDynamics {
  chapterGround(kit, NIGHT.bounds);
  kit.root.name = 'S03-nightshift-placeholder';
  room(kit, 'B01-repair', -26, -4, 20, 40, 30, 'right');
  room(kit, 'B02-stores', 4, 26, 10, 28, 18, 'left');
  room(kit, 'B02-nursing', 4, 26, -12, 8, -4, 'left');
  room(kit, 'B03-samples', -26, -4, -38, -16, -24, 'right');
  // Main spine is a working corridor; side rooms carry distinct activities and scales.
  for (let z = -54; z <= 38; z += 10) {
    kit.box('steel', [0, 5.1, z], [8.2, 0.20, 0.20]);
    kit.box('signal', [0, 5.0, z], [2.4, 0.08, 0.18], [0, 0, 0], false);
    kit.box('amber', [-2.9, 0.015, z], [0.08, 0.02, 5.2], [0, 0, 0], false);
  }
  kit.cylinder('amber', [-3.45, 3.9, -7], 0.16, 96, [Math.PI / 2, 0, 0]);
  kit.cylinder('pale', [3.45, 4.2, -7], 0.12, 96, [Math.PI / 2, 0, 0]);
  const blower = fan(kit);
  kit.tank(-22, 29, 1.35, 3.3);
  kit.box('pale', [-19, 0.95, 35], [5.6, 0.16, 1.3]);
  kit.solid('night-toolbench', [-19, 0.55, 35], [5.6, 1.1, 1.3]);
  for (const x of [-21.4, -16.6]) kit.box('steel', [x, 0.45, 35], [0.18, 0.9, 1.1]);
  for (let i = 0; i < 5; i++) kit.box(i % 2 ? 'steel' : 'amber', [-20.5 + i * 0.65, 1.07, 35], [0.42, 0.08, 0.15], [0, i * 0.2, 0]);
  kit.sign('维修廊', [-3.70, 4.15, 30], 4.4, 0.65, Math.PI / 2);

  // Supply rack stands behind the interaction point; the authored source crate is reversible by facts.
  const rack: Vec3 = [NIGHT.supplies[0], 1.5, NIGHT.supplies[2] - 1.7];
  for (const x of [rack[0] - 2.4, rack[0] + 2.4]) kit.box('steel', [x, 1.5, rack[2]], [0.12, 3, 1.0]);
  for (const y of [0.4, 1.3, 2.2]) kit.box('pale', [rack[0], y, rack[2]], [5, 0.10, 1.1]);
  kit.solid('night-supply-rack', rack, [5, 3, 1.1]);
  const supply = crate(kit.root, [12, 1.35, 16.3], 'night-supplies-source');
  for (const x of [19, 22]) {
    kit.box('white', [x, 0.65, 13.8], [2.1, 1.3, 2.2]);
    kit.box('paint', [x, 1.34, 13.8], [2.15, 0.10, 2.25]);
    kit.solid(`night-stores-${x}`, [x, 0.7, 13.8], [2.15, 1.4, 2.25]);
  }
  kit.sign('物资室', [3.70, 4.15, 18], 4.5, 0.65, -Math.PI / 2);
  light(kit, [12, 3.8, 20], 0xffd4a1, 35, 13);

  kit.box('pale', [11.3, 0.84, -6.1], [3.0, 0.16, 1.4]);
  kit.solid('night-delivery-table', [11.3, 0.47, -6.1], [3.0, 0.94, 1.4]);
  for (const x of [10.0, 12.6]) kit.box('steel', [x, 0.42, -6.1], [0.14, 0.84, 1.25]);
  const delivered = crate(kit.root, [12, 0.93, -6.1], 'night-supplies-delivered'); delivered.visible = false;
  for (const z of [-1, 4]) {
    wall(kit, `night-care-cabinet-${z}`, [23.5, 1.15, z], [3.1, 2.3, 2.5], 'pale');
    kit.box('white', [23.5, 1.6, z + 1.27], [1.4, 0.18, 0.035], [0, 0, 0], false);
  }
  // Empty transfer bed; people remain owned by the simulation.
  kit.box('white', [19.5, 0.80, -7.7], [1.25, 0.16, 2.2]);
  kit.box('paint', [19.5, 0.91, -7.7], [1.1, 0.12, 2]);
  kit.solid('night-transfer-bed', [19.5, 0.5, -7.7], [1.4, 1.0, 2.3]);
  kit.sign('护理室', [3.70, 4.15, -4], 4.5, 0.65, -Math.PI / 2);
  light(kit, [13, 3.8, -3], 0xffd9ae, 45, 15);

  // Port map faces east so it does not hide either Meng or Zhou at the shared meeting anchors.
  wall(kit, 'night-port-map', [-14.5, 1.8, -23.8], [0.18, 2.8, 5.4], 'steel');
  kit.sign('北闸 →', [-14.39, 2.05, -23.8], 4.8, 0.9, Math.PI / 2);
  for (let i = 0; i < 5; i++) kit.box(i % 2 ? 'amber' : 'white', [-14.38, 1.14, -25.6 + i * 0.9], [0.025, 0.22, 0.38], [0, 0, 0], false);
  kit.box('pale', [-21.5, 1.0, -25], [5.3, 0.18, 2]);
  kit.solid('night-sample-bench', [-21.5, 0.55, -25], [5.3, 1.1, 2]);
  for (let i = 0; i < 4; i++) {
    kit.cylinder('ice', [-23.1 + i * 0.95, 1.30, -25], 0.16, 1.45, [Math.PI / 2, 0, 0]);
    for (const z of [-25.75, -24.25]) kit.cylinder('steel', [-23.1 + i * 0.95, 1.30, z], 0.18, 0.12, [Math.PI / 2, 0, 0]);
  }
  wall(kit, 'night-weapon-rack', [-10, 1.4, -34], [5.0, 2.8, 0.55], 'steel');
  for (let i = 0; i < 4; i++) {
    const x = -11.5 + i;
    kit.box('pale', [x, 1.45, -33.65], [0.16, 0.70, 0.18], [0, 0, -0.10]);
    kit.box('rubber', [x + 0.06, 0.98, -33.62], [0.24, 0.28, 0.19]);
    kit.cylinder('rubber', [x - 0.06, 2.02, -33.65], 0.035, 0.50);
    kit.box('amber', [x + 0.15, 1.32, -33.62], [0.17, 0.10, 0.08]);
  }
  kit.sign('样本室', [-3.70, 4.15, -24], 4.5, 0.65, Math.PI / 2);
  light(kit, [-12, 4.0, -25], 0xc8e1e6, 55, 16);
  for (const x of [-4.0, 4.0]) wall(kit, `night-departure-frame-${x}`, [x, 2.4, -55], [0.30, 4.8, 0.55], 'pale');
  kit.box('paint', [0, 4.6, -55], [8.5, 0.8, 0.60]);
  kit.sign('出口 ↑', [0, 4.56, -54.66], 7.0, 0.65);
  kit.box('white', [0, 0.02, NIGHT.exit[2]], [5.5, 0.02, 0.15], [0, 0, 0], false);
  let running = false;
  return {
    bounds: NIGHT.bounds,
    update(time) { blower.rotor.rotation.z = running ? time * 7.5 : 0; },
    setFacts(facts) {
      blower.obstruction.visible = !facts.includes('fan-cleared');
      running = facts.includes('fan-restarted');
      blower.rotor.userData.spinning = running;
      blower.lamp.color.setHex(running ? 0x89c9b1 : 0xe3ab56);
      blower.lamp.emissive.copy(blower.lamp.color);
      supply.visible = !facts.includes('supplies-collected');
      delivered.visible = facts.includes('supplies-delivered');
    },
  };
}

function slidingGate(kit: PortKit, id: string, z: number, width: number, fact: string): (opened: boolean) => void {
  const panels: Group[] = [];
  for (const side of [-1, 1]) {
    const panel = new PortKit();
    panel.root.name = `${id}-panel-${side}`; panel.root.userData.openFact = fact;
    panel.box('paint', [side * width / 4, 1.6, z], [width / 2, 3.2, 0.32]);
    panel.box('pale', [side * width / 4, 3.16, z + 0.19], [width / 2, 0.10, 0.08]);
    for (let i = 0; i < 5; i++) panel.box('steel', [side * width / 4, 0.35 + i * 0.54, z + 0.19], [width / 2 - 0.2, 0.055, 0.08]);
    panel.box('amber', [side * width / 4, 1.4, z + 0.23], [width / 2 - 0.2, 0.22, 0.035], [0, 0, 0], false);
    panel.flush(); kit.root.add(panel.root); panels.push(panel.root);
  }
  kit.solid(id, [0, 1.6, z], [width, 3.2, 0.40], 0, fact);
  for (const x of [-width / 2 - 0.3, width / 2 + 0.3]) wall(kit, `${id}-frame-${x}`, [x, 2.1, z], [0.55, 4.2, 0.75], 'pale');
  wall(kit, `${id}-header`, [0, 4.15, z], [width + 1.1, 0.60, 0.80], 'steel');
  return opened => {
    // Apply the same endpoint immediately as the collision fact; no temporary invisible obstacle.
    panels[0].position.x = opened ? -width / 2 - 0.35 : 0;
    panels[1].position.x = opened ? width / 2 + 0.35 : 0;
    for (const panel of panels) panel.userData.opened = opened;
  };
}

function crossWall(kit: PortKit, id: string, z: number, opening: number): void {
  const min = WORKERS.bounds.minX, max = 38;
  const leftEnd = -opening / 2 - 0.5, rightStart = opening / 2 + 0.5;
  wall(kit, `${id}-west`, [(min + leftEnd) / 2, 1.7, z], [leftEnd - min, 3.4, 0.55], 'concrete');
  wall(kit, `${id}-east`, [(rightStart + max) / 2, 1.7, z], [max - rightStart, 3.4, 0.55], 'concrete');
  kit.box('pale', [(min + leftEnd) / 2, 3.43, z], [leftEnd - min, 0.13, 0.70]);
  kit.box('pale', [(rightStart + max) / 2, 3.43, z], [max - rightStart, 0.13, 0.70]);
}

function militaryTruck(kit: PortKit, x: number, z: number): void {
  kit.located([x, 0, z], 0, () => {
    kit.box('steel', [0, 0.74, 0], [3.1, 0.6, 7.6]);
    kit.box('rubber', [0, 1.6, -2.3], [2.8, 2.0, 2.4]);
    kit.box('glass', [0, 2.05, -3.55], [2.3, 0.72, 0.08], [-0.18, 0, 0]);
    kit.box('pale', [0, 2.69, -2.3], [3.0, 0.18, 2.5]);
    kit.box('steel', [0, 1.65, 1.5], [2.9, 1.3, 3.8]);
    kit.part('arch', 'paint', [0, 2.25, 1.45], [3.0, 1.5, 4.0]);
    for (const x of [-1.62, 1.62]) for (const z of [-2.9, 1.0, 2.7]) {
      kit.cylinder('rubber', [x, 0.65, z], 0.65, 0.38, [0, 0, Math.PI / 2]);
      kit.cylinder('steel', [x * 1.07, 0.65, z], 0.30, 0.05, [0, 0, Math.PI / 2]);
    }
    for (const x of [-1.05, 1.05]) kit.box('white', [x, 1.38, -3.6], [0.28, 0.20, 0.06], [0, 0, 0], false);
    kit.box('pale', [0, 0.72, -3.95], [3.2, 0.25, 0.22]);
    kit.solid(`military-truck-${x}-${z}`, [0, 1.65, 0], [3.55, 3.3, 8.1]);
  });
}

function transferBus(kit: PortKit): void {
  kit.located([31.3, 0, -118], 0, () => {
    kit.box('pale', [0, 1.50, 0], [3.15, 2.2, 6.8]);
    kit.box('paint', [0, 0.81, 0], [3.22, 0.28, 6.9]);
    kit.box('glass', [0, 2.10, 3.43], [2.6, 0.85, 0.06]);
    kit.box('white', [0, 2.70, 0], [3.3, 0.18, 7.0]);
    for (const x of [-1.60, 1.60]) {
      for (const z of [-2.1, 2.1]) kit.cylinder('rubber', [x, 0.57, z], 0.55, 0.30, [0, 0, Math.PI / 2]);
      for (const z of [-2.25, -0.75, 0.75, 2.25]) kit.box('glass', [x, 2.05, z], [0.06, 0.70, 1.1]);
    }
    kit.solid('workers-transfer-bus', [0, 1.5, 0], [3.3, 3.0, 7.0]);
  });
}

function stairAndGallery(kit: PortKit): void {
  const centerX = WORKERS.stairStart[0], tread = 0.60, rise = 0.15, width = 5;
  for (let i = 0; i < 20; i++) {
    const height = rise * (i + 1), z = WORKERS.stairStart[2] - tread * (i + 0.5);
    wall(kit, `upper-stair-${i}`, [centerX, height / 2, z], [width, height, tread], 'steel');
    kit.box('pale', [centerX, height + 0.007, z + tread / 2 - 0.035], [width, 0.014, 0.065], [0, 0, 0], false);
    for (const x of [centerX - 2.65, centerX + 2.65]) wall(kit, `stair-edge-${i}-${x}`, [x, height + 0.17, z], [0.16, 0.34, tread], 'pale');
  }
  for (const x of [centerX - 2.65, centerX + 2.65]) kit.beam('steel', [x, 1.15, -34], [x, 4.15, -46], 0.07);
  wall(kit, 'upper-gallery', [-16.5, 2.80, -52], [17, 0.40, 12], 'steel');
  for (const x of [-25.0, -8.0]) {
    wall(kit, `upper-gallery-edge-${x}`, [x, 3.18, -52], [0.16, 0.36, 12], 'pale');
    kit.box('steel', [x, 4.05, -52], [0.07, 0.07, 12]);
    for (const z of [-46, -50, -54, -58]) kit.box('steel', [x, 3.63, z], [0.07, 1.1, 0.07]);
  }
  // Guard the platform's open south/north edges, leaving the actual staircase width clear.
  for (const z of [-46, -58]) {
    for (const [from, to] of [[-25, -20.5], [-15.5, -8]]) {
      wall(kit, `upper-gallery-end-${z}-${from}`, [(from + to) / 2, 3.18, z], [to - from, 0.36, 0.16], 'pale');
      kit.box('steel', [(from + to) / 2, 4.05, z], [to - from, 0.07, 0.07]);
    }
  }
  for (const x of [-24, -9]) for (const z of [-48, -56]) {
    wall(kit, `gallery-support-${x}-${z}`, [x, 1.3, z], [0.22, 2.6, 0.22], 'pale');
    kit.beam('steel', [x, 0.3, z], [x, 2.6, z + 2.5], 0.12);
  }
  for (let i = 0; i < 19; i++) {
    const height = 3 - rise * (i + 1), z = -58 - tread * (i + 0.5);
    wall(kit, `lower-stair-${i}`, [centerX, height / 2, z], [width, height, tread], 'steel');
    kit.box('pale', [centerX, height + 0.007, z - tread / 2 + 0.035], [width, 0.014, 0.065], [0, 0, 0], false);
    for (const x of [centerX - 2.65, centerX + 2.65]) wall(kit, `descent-edge-${i}-${x}`, [x, height + 0.17, z], [0.16, 0.34, tread], 'pale');
  }
  for (const x of [centerX - 2.65, centerX + 2.65]) kit.beam('steel', [x, 4.0, -58], [x, 1.0, -70], 0.07);
  kit.located([0, 3, 0], 0, () => {
    kit.cover(-22, -47.5, 2.8);
    kit.cover(-11, -55.2, 3.0);
  });
  kit.box('steel', [-24.8, 4.0, -47.2], [0.12, 2.0, 0.12]);
  kit.box('steel', [-8.2, 4.0, -47.2], [0.12, 2.0, 0.12]);
}

function streetLandmarks(kit: PortKit): void {
  for (const x of [-50, 34]) for (let z = -120; z <= 36; z += 24) kit.light(x, z, 6.0);
  for (let i = 0; i < 12; i++) {
    kit.part('cone', 'ice', [-94 - i % 3 * 15, 6, 30 - i * 15], [22 + i % 2 * 15, 30 + i % 4 * 8, 22], [0, i * 0.37, 0], false);
  }
  for (let i = 0; i < 7; i++) {
    const x = 72 + (i % 3) * 17, z = 22 - i * 24;
    kit.box('paint', [x, 7 + i % 3 * 2, z], [14, 14 + i % 3 * 4, 21], [0, 0, 0], false);
    kit.box('pale', [x, 14.2 + i % 3 * 4, z], [15, 0.4, 22], [0, 0, 0], false);
  }
  // The repaired twin-arm dock crane remains east of the playable road and below the planet.
  kit.box('steel', [72, 13, -85], [3, 26, 3], [0, 0, 0], false);
  kit.beam('amber', [72, 26, -85], [48, 20, -102], 1.2);
  kit.beam('pale', [72, 26, -85], [92, 19, -68], 1.2);
  kit.beam('steel', [72, 19, -85], [54, 21.5, -98], 0.55);
  kit.cylinder('rubber', [49, 12, -101], 0.06, 16);
  for (let z = -123; z < 37; z += 7) {
    kit.box('white', [0, 0.015, z], [0.12, 0.02, 3.2], [0, 0, 0], false);
    kit.box('amber', [44, 0.015, z], [0.16, 0.02, 3.0], [0, 0, 0], false);
  }
}

export function buildWorkersSector(kit: PortKit): SceneDynamics {
  chapterGround(kit, WORKERS.bounds);
  kit.root.name = 'S04-workers-street-placeholder';
  streetLandmarks(kit);
  kit.workshop(-22, 30, 24, 17);
  kit.workshop(42, 35, 18, 15);
  kit.cover(-5.3, 21, 4.0);
  kit.cover(8.0, 14, 4.0);
  kit.cover(-7.5, 12.5, 3.8);
  militaryTruck(kit, 26, 12);
  // Workers beside this military vehicle are persistent simulation actors, not decorative copies.
  kit.box('amber', [22, 0.02, 19.8], [7.4, 0.02, 0.12], [0, 0, 0], false);
  kit.sign('检查口', [0, 4.15, 0.46], 8.6, 0.48);
  crossWall(kit, 'checkpoint-line', 0, 10);
  const checkpointGate = slidingGate(kit, 'checkpoint-gate', 0, 10, 'checkpoint-open');
  kit.terminal(WORKERS.checkpoint);
  kit.workshop(-21, -8, 10, 11);
  kit.workshop(18, -8, 10, 11);

  // This long service building turns the advance west; east and under-gallery routes remain ground-level.
  kit.workshop(10, -32, 24, 26);
  kit.tank(-39, -34, 3.2, 9);
  kit.tank(-40, -53, 2.6, 7);
  kit.cover(-25.8, -20.8, 3.6);
  kit.cover(-10.3, -25.2, 3.8);
  kit.box('rubber', [-18, 0.017, -28], [8, 0.02, 7], [0, 0, 0], false);
  kit.cylinder('amber', [-31, 2.5, -42], 0.24, 28, [Math.PI / 2, 0, 0]);
  kit.cylinder('pale', [-29.8, 2.2, -42], 0.18, 28, [Math.PI / 2, 0, 0]);
  stairAndGallery(kit);
  kit.cover(-7.5, -67, 4.2);
  kit.workshop(15, -62, 21, 16);
  kit.sign('宿舍后门', [0, 4.15, -77.54], 8.6, 0.48);
  crossWall(kit, 'yard-line', -78, 10);
  const yardGate = slidingGate(kit, 'yard-gate', -78, 10, 'yard-open');
  kit.terminal(WORKERS.yardGate);

  // East transport lane is continuous at x42–46, entered at z17 and rejoining behind the yard at z-130.
  wall(kit, 'transport-separation', [38, 1.4, -58], [0.35, 2.8, 136], 'steel');
  for (let z = -122; z <= 8; z += 8) kit.box('pale', [37.8, 2.9, z], [0.20, 0.18, 1.1]);
  kit.sign('运输通道', [38.2, 2.1, 4], 4, 0.7, Math.PI / 2);

  // Three distinct building faces make a residential court instead of a cleared rectangular arena.
  kit.workshop(-43, -96, 16, 28);
  kit.workshop(-19, -120, 24, 10);
  kit.workshop(29.0, -88, 15, 14);
  for (const y of [1.8, 3.6]) for (const z of [-85, -89, -93, -97, -101, -105]) {
    kit.box('glass', [-34.94, y, z], [0.10, 1.0, 1.7]);
    kit.box('pale', [-34.86, y - 0.55, z], [0.20, 0.10, 2.0]);
  }
  kit.cover(-8, -88.0, 3.8);
  kit.cover(9, -92.2, 3.5);
  kit.cover(6, -100.3, 3.4);
  kit.cover(-19, -108, 4.0);
  kit.cover(-2, -113, 6.0);
  kit.cover(12, -107, 5.0);
  kit.cover(29, -116, 6.0, Math.PI / 2);
  kit.terminal(WORKERS.release);
  kit.box('rubber', [-21, 0.015, -96], [13, 0.02, 13], [0, 0, 0], false);
  kit.part('arch', 'pale', [-21, 3.5, -96], [13, 2.6, 13]);
  kit.solid('yard-local-canopy-roof', [-21, 4.2, -96], [13, 1.4, 13]);
  for (const x of [-27, -15]) for (const z of [-102, -90]) wall(kit, `yard-canopy-${x}-${z}`, [x, 1.75, z], [0.20, 3.5, 0.20], 'steel');
  // A small, intact greenhouse is a living-world landmark; it adds no new farming mechanic.
  wall(kit, 'yard-greenhouse', [-42, 1.6, -118], [12, 3.2, 8], 'glass');
  kit.part('arch', 'pale', [-42, 3.2, -118], [12.5, 3.4, 8.4]);
  kit.solid('yard-greenhouse-roof', [-42, 4.05, -118], [12.5, 1.7, 8.4]);
  for (let x = -46; x <= -38; x += 2) kit.box('signal', [x, 2.2, -113.9], [0.15, 0.08, 0.12], [0, 0, 0], false);
  transferBus(kit);
  kit.box('amber', [22, 0.02, -112], [7, 0.02, 0.12], [0, 0, 0], false);
  kit.box('white', [40, 0.02, -116], [0.18, 0.02, 6], [0, 0, 0], false);
  light(kit, [22, 5.5, -112], 0xffd6a3, 55, 18);
  return {
    bounds: WORKERS.bounds,
    update() {},
    setFacts(facts) {
      checkpointGate(facts.includes('checkpoint-open'));
      yardGate(facts.includes('yard-open'));
    },
  };
}
