import { CylinderGeometry, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { FLANK as F } from '../content/flank-layout';
import type { SceneDynamics } from './chapter-environments';
import { PortKit, type Surface } from './port-kit';
import { buildTransfer } from './transfer-environment';

function block(kit: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'steel'): void {
  kit.box(surface, at, size); kit.solid(id, at, size);
}

/** Horizontal treads are actual solid steps; no invisible incline or position correction. */
function stairs(kit: PortKit, id: string, x: number, firstZ: number, width: number, count: number, rise: number, run: number, direction: 1 | -1, ascending: boolean): void {
  for (let i = 0; i < count; i++) {
    const h = (ascending ? i + 1 : count - i) * rise;
    const z = firstZ + direction * (i + 0.5) * run;
    block(kit, `${id}-${i}`, [x, h / 2, z], [width, h, run], 'pale');
    kit.box('amber', [x, h + 0.008, z - direction * (run / 2 - 0.04)], [width - 0.08, 0.012, 0.08], [0, 0, 0], false);
  }
}

function sideRail(kit: PortKit, id: string, x: number, y: number, startZ: number, endZ: number): void {
  const z = (startZ + endZ) / 2, length = Math.abs(endZ - startZ);
  block(kit, `${id}-curb`, [x, y + 0.18, z], [0.16, 0.36, length], 'paint');
  kit.box('pale', [x, y + 1.05, z], [0.075, 0.075, length]);
  for (let p = Math.min(startZ, endZ); p <= Math.max(startZ, endZ) + 0.01; p += 2.4) {
    kit.box('steel', [x, y + 0.67, p], [0.07, 0.75, 0.07]);
  }
}

function maintenancePlatform(kit: PortKit): void {
  // Low enough to read as maintenance access, high enough to reveal the east road over the filter bank.
  block(kit, 'flank-platform-deck', [3, 2.2, 7.2], [14, 0.4, 14.4]);
  for (const x of [-3.5, 9.5]) for (const z of [2, 12]) {
    block(kit, `flank-platform-leg-${x}-${z}`, [x, 1, z], [0.22, 2, 0.22]);
    kit.beam('pale', [x, 0.3, z], [x + (x < 0 ? 1.4 : -1.4), 1.95, z], 0.10);
  }
  for (let z = 0.3; z < 14.4; z += 0.45) kit.box('pale', [3, 2.407, z], [13.6, 0.014, 0.035], [0, 0, 0], false);
  stairs(kit, 'flank-platform-up', 3, 24, 4, 16, 0.15, 0.6, -1, true);
  // The first descending tread is 0.15m below the deck; the last tread ends at z=-9.
  stairs(kit, 'flank-platform-down', 8, 0, 4, 15, 0.15, 0.6, -1, false);
  sideRail(kit, 'flank-platform-west', -4, 2.4, 0, 14.4);
  sideRail(kit, 'flank-platform-east', 10, 2.4, 0, 14.4);
  for (const [x, width, z] of [[-1.5, 5, 14.4], [7.5, 5, 14.4], [1, 10, 0]]) {
    block(kit, `flank-platform-end-${x}-${z}`, [x, 2.58, z], [width, 0.36, 0.16], 'paint');
    kit.box('pale', [x, 3.45, z], [width, 0.075, 0.075]);
  }
  for (const x of [0.85, 5.15]) {
    kit.beam('pale', [x, 1.05, 24], [x, 3.45, 14.4], 0.075);
    for (const z of [23.4, 21, 18.6, 16.2, 14.4]) {
      const y = Math.min(2.4, (24 - z) / 9.6 * 2.4);
      kit.box('steel', [x, y + 0.52, z], [0.07, 1.05, 0.07]);
    }
  }
  for (const x of [5.85, 10.15]) kit.beam('pale', [x, 3.45, 0], [x, 1.05, -9.6], 0.075);
  kit.located([0, 2.4, 0], 0, () => {
    kit.cover(8, 8, 4, Math.PI / 2);
    kit.cover(0, 2, 4.8);
  });
  kit.label('检修台 / 东侧观察', [3, 3.7, 14.65], 6.4, 0.5);
  kit.box('steel', [-0.6, 2.1, 15], [0.09, 3.8, 0.09]);
  kit.box('steel', [6.6, 2.1, 15], [0.09, 3.8, 0.09]);
  kit.box('signal', [3, 2.20, 14.62], [3.2, 0.07, 0.08], [0, 0, 0], false);
  kit.label('泵房外侧  ↑', [8, 3.2, -0.2], 3.4, 0.4, Math.PI);
  const lamp = new PointLight(0xffd6a3, 23, 12, 2); lamp.position.set(3, 4.2, 11); kit.root.add(lamp);
}

function pumpAndTanks(kit: PortKit): void {
  // The west working face is at x=20; the standing/interaction point at x=18 is clear.
  kit.workshop(24, -29, 8, 5);
  kit.label('D01 供热泵房', [19.95, 3.8, -29], 4.3, 0.55, -Math.PI / 2);
  kit.box('glass', [19.94, 2.6, -29], [0.08, 1, 2.4]);
  for (const z of [-30.5, -27.5]) {
    kit.cylinder('amber', [27, 6.3, z], 0.22, 4.6, [0, 0, Math.PI / 2]);
    kit.cylinder('steel', [29.25, 3.4, z], 0.22, 5.8);
    kit.box('concrete', [29.25, 0.2, z], [0.9, 0.4, 0.9]);
    kit.solid(`flank-pump-downpipe-${z}`, [29.25, 2.8, z], [0.48, 5.6, 0.48]);
  }
  kit.cover(F.eastPost[0] + 2.3, F.eastPost[2], 6, Math.PI / 2);
  kit.cover(F.northPost[0], F.northPost[2] - 2.3, 5.2);
  kit.label('储罐基座 / 内门方向', [36, 3.1, 29.1], 5.4, 0.5);
  kit.box('steel', [33.1, 1.7, 29], [0.09, 3.4, 0.09]);
  kit.box('steel', [38.9, 1.7, 29], [0.09, 3.4, 0.09]);
  for (let z = -26; z < 24; z += 6) kit.box('white', [33, 0.019, z], [0.08, 0.02, 2.4], [0, 0, 0], false);
}

function separatedTransport(kit: PortKit): void {
  // Obsolete heat-exchange skids occupy the passing bay, leaving a level 2.98m cart throat.
  // None of these objects represents a patient cart; all actual patients are Simulation actors.
  for (const z of [-11, -5, 1]) {
    block(kit, `flank-obsolete-unit-${z}`, [-38.5, 1.05, z], [4, 2.1, 3.8], 'paint');
    kit.box('steel', [-38.5, 0.16, z], [4.1, 0.32, 4]);
    for (const x of [-39.65, -37.35]) {
      kit.cylinder('pale', [x, 1.43, z], 0.53, 3.5, [Math.PI / 2, 0, 0]);
      kit.cylinder('steel', [x, 1.43, z + 1.8], 0.56, 0.12, [Math.PI / 2, 0, 0]);
    }
    kit.box('amber', [-40.52, 0.9, z], [0.035, 0.22, 3.6]);
  }
  kit.cover(-44, -5, 17, Math.PI / 2);
  // Temporary 1.6m planked bypass over low pipework: 0.15m steps, never a cart route.
  stairs(kit, 'flank-walker-up', -35, -20, 1.6, 8, 0.15, 0.6, 1, true);
  block(kit, 'flank-walker-deck', [-35, 1.09, -11], [1.6, 0.22, 8.4], 'pale');
  stairs(kit, 'flank-walker-down', -35, -6.8, 1.6, 7, 0.15, 0.6, 1, false);
  for (let z = -15; z < -6.8; z += 0.3) kit.box('steel', [-35, 1.207, z], [1.58, 0.014, 0.025], [0, 0, 0], false);
  for (const x of [-35.88, -34.12]) {
    sideRail(kit, `flank-walker-rail-${x}`, x, 1.2, -15.2, -6.8);
    kit.beam('pale', [x, 1.05, -20], [x, 2.25, -15.2], 0.065);
    kit.beam('pale', [x, 2.25, -6.8], [x, 1.05, -2], 0.065);
  }
  for (const z of [-14, -11, -8]) {
    for (const x of [-35.65, -34.35]) block(kit, `flank-walker-leg-${x}-${z}`, [x, 0.5, z], [0.10, 1, 0.10]);
    kit.beam('pale', [-35.65, 0.2, z], [-34.35, 1.0, z], 0.08);
  }
  kit.box('steel', [-35, 0.3, -11], [1.3, 0.6, 6.6]);
  kit.solid('flank-walker-under-trough', [-35, 0.3, -11], [1.3, 0.6, 6.6]);
  for (const x of [-35.35, -34.65]) kit.cylinder('amber', [x, 0.72, -11], 0.13, 6.4, [Math.PI / 2, 0, 0]);
  kit.label('仅限步行 / 临时铺板梯', [-35, 2.75, -20.1], 4.1, 0.45, Math.PI);
  kit.box('steel', [-33.2, 1.45, -20.1], [0.08, 2.9, 0.08]);
  kit.label('患者车 / 保持主廊', [-42, 3.35, -14], 4.4, 0.5, Math.PI);
  for (const z of [-23, -18, -13, -8, -3, 2]) {
    kit.box('white', [-42, 0.021, z], [0.1, 0.02, 1.4], [0, 0, 0], false);
  }
  for (const z of [-23, -1, 2, 6, 10, 14]) kit.box('amber', [-35, 0.02, z], [0.85, 0.02, 0.06], [0, 0, 0], false);
  kit.label('通道观察位', [-44.83, 2.45, 20], 3.2, 0.45, Math.PI / 2);
  kit.box('amber', [F.routeWatch[0], 0.02, F.routeWatch[2]], [0.9, 0.02, 0.9], [0, 0, 0], false);
  kit.label('两路到站核对', [-36.1, 3.5, 38], 4.8, 0.5, Math.PI);
  const lamp = new PointLight(0xffd3a3, 28, 16, 2); lamp.position.set(-35, 3.6, -10); kit.root.add(lamp);
}

/** S07 retains the settled S05/S06 port while adding a real upper fighting deck and two transport routes. */
export function buildFlank(kit: PortKit): SceneDynamics {
  const previous = buildTransfer(kit, true);
  kit.root.name = 'S07-flank-and-handover-placeholder';
  maintenancePlatform(kit);
  pumpAndTanks(kit);
  separatedTransport(kit);
  const shape = new CylinderGeometry(0.12, 0.12, 0.07, 12);
  const indicator = (name: string, at: Vec3): MeshStandardMaterial => {
    const material = new MeshStandardMaterial({ color: 0x647f84, emissive: 0x647f84, emissiveIntensity: 0.25, roughness: 0.4 });
    const mesh = new Mesh(shape, material); mesh.name = name; mesh.position.set(...at); mesh.rotation.x = Math.PI / 2; kit.root.add(mesh);
    return material;
  };
  const east = indicator('flank-east-pressure', [6.6, 3.7, 15.06]);
  const north = indicator('flank-north-pressure', [33.1, 3.2, 29.06]);
  const route = indicator('flank-split-route-ready', [-36.5, 3.0, 21.95]);
  const report = indicator('flank-report-shared', [-22.55, 1.28, 33.82]);
  const paint = (material: MeshStandardMaterial, active: boolean, color: number): void => {
    material.color.setHex(active ? color : 0x647f84); material.emissive.copy(material.color); material.emissiveIntensity = active ? 1.3 : 0.25;
  };
  const setFacts = (facts: readonly string[]): void => {
    previous.setFacts(facts);
    const teamBack = facts.includes('flank-team-back');
    paint(east, facts.includes('flank-east-warned') && !teamBack, 0xffbb74);
    paint(north, facts.includes('flank-north-warned') && !teamBack, 0xffbb74);
    paint(route, facts.includes('meng-route-adopted'), 0xb6ddcb);
    paint(report, facts.includes('full-report-shared') || facts.includes('flank-report-shared'), 0xb6ddcb);
  };
  setFacts([]);
  return { bounds: F.bounds, update(time) { previous.update(time); }, setFacts };
}
