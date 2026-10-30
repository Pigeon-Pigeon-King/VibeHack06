import { CylinderGeometry, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { TRANSFER as T } from '../content/transfer-layout';
import type { SceneDynamics } from './chapter-environments';
import { buildFrontGate } from './frontgate-environment';
import { PortKit, type Surface } from './port-kit';

function block(kit: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete'): void {
  kit.box(surface, at, size); kit.solid(id, at, size);
}

/** Same gate and equipment room are reused in S07 after the repair is already complete. */
export function buildTransfer(kit: PortKit, completed = false): SceneDynamics {
  const previous = buildFrontGate(kit);
  kit.root.name = 'S06-transfer-gate-placeholder';
  // Cargo shutter: six clear metres between the old west workshop and the new east jamb.
  block(kit, 'transfer-east-bulkhead', [-34.5, 1.85, 24], [9, 3.7, 0.55], 'paint');
  for (const x of [-45.25, -38.75]) block(kit, `transfer-jamb-${x}`, [x, 2.1, 24], [0.4, 4.2, 0.75], 'pale');
  block(kit, 'transfer-gate-header', [-42, 4.05, 24], [7, 0.7, 0.9], 'steel');
  kit.label('西货廊转接门', [-42, 4.05, 23.52], 5.9, 0.48, Math.PI);
  // The gate slides into the solid east pocket, so open visuals and disabled collision agree immediately.
  const shutter = new PortKit(); shutter.root.name = 'transfer-shutter'; shutter.root.userData.openFact = 'transfer-gate-open';
  shutter.box('steel', [-42, 1.8, 24], [6, 3.6, 0.32]);
  for (let x = -44.8; x < -39; x += 0.6) shutter.box('pale', [x, 1.8, 23.79], [0.06, 3.4, 0.08]);
  shutter.box('amber', [-42, 1.30, 23.75], [5.7, 0.24, 0.035], [0, 0, 0], false);
  shutter.flush(); kit.root.add(shutter.root);
  if (!completed) kit.solid('transfer-shutter', [-42, 1.8, 24], [6, 3.6, 0.40], 0, 'transfer-gate-open');
  // Shelter uses the existing workshop wall as its western edge, never the cart lane as a prop shelf.
  kit.part('arch', 'pale', [-37.5, 4.3, 24], [15, 2.8, 12]);
  kit.solid('transfer-shelter-roof', [-37.5, 5.05, 24], [15, 1.5, 12]);
  for (const x of [-38.5, -30.7]) for (const z of [18, 30]) block(kit, `transfer-canopy-${x}-${z}`, [x, 2.15, z], [0.18, 4.3, 0.18], 'steel');
  for (const z of [18.2, 29.8]) kit.part('arch', 'steel', [-37.5, 4.3, z], [15.1, 2.9, 0.12]);
  kit.box('signal', [-36.5, 4.0, 23], [2.4, 0.08, 0.16], [0, 0, 0], false);
  for (const z of [8, 13, 18, 33, 38, 43]) {
    kit.box('amber', [-42, 0.017, z + 1.5], [2.4, 0.022, 0.08], [0, 0, 0], false);
    for (const x of [-43.25, -40.75]) kit.box('white', [x, 0.016, z], [0.06, 0.02, 2.6], [0, 0, 0], false);
  }

  // Openable control cover, readable lock rod and a working-side stand point north of the closed shutter.
  block(kit, 'transfer-control-cabinet', [-36.5, 1.15, 22.25], [1.1, 1.3, 0.32], 'steel');
  block(kit, 'transfer-control-pedestal', [-36.5, 0.25, 22.25], [0.30, 0.50, 0.30], 'steel');
  kit.box('rubber', [-36.5, 1.15, 22.06], [0.90, 1.10, 0.04]);
  kit.box('amber', [-36.82, 1.05, 22.02], [0.06, 0.75, 0.045]);
  kit.box('pale', [-36.30, 1.35, 22.02], [0.30, 0.12, 0.045]);
  const cover = new PortKit(); cover.root.name = 'transfer-control-cover'; cover.root.position.set(-37.05, 1.15, 21.99);
  cover.box('paint', [0.55, 0, 0], [1.1, 1.3, 0.07]);
  cover.box('pale', [0.91, 0, -0.05], [0.055, 0.25, 0.05]); cover.flush(); kit.root.add(cover.root);
  const rod = new PortKit(); rod.root.name = 'transfer-lock-rod';
  rod.cylinder('pale', [-36.5, 0.97, 21.97], 0.07, 0.66, [0, 0, Math.PI / 2]);
  rod.box('amber', [-36.19, 0.97, 21.97], [0.09, 0.20, 0.11]); rod.flush(); kit.root.add(rod.root);
  kit.label('门机 / 手动锁杆', [-36.5, 2.02, 21.93], 2.1, 0.35, Math.PI);
  const gateLampMaterial = new MeshStandardMaterial({ color: 0xd7a468, emissive: 0xd7a468, emissiveIntensity: 1, roughness: 0.4 });
  const gateLamp = new Mesh(new CylinderGeometry(0.11, 0.11, 0.05, 12), gateLampMaterial);
  gateLamp.name = 'transfer-gate-indicator'; gateLamp.rotation.x = Math.PI / 2; gateLamp.position.set(-36.5, 2.35, 21.95); kit.root.add(gateLamp);
  const gateLight = new PointLight(0xffd4a1, 30, 15, 2); gateLight.position.set(-36.5, 3.5, 22); kit.root.add(gateLight);

  // D02: a 16x12m enclosed work room. Both entrances are shielded from the northern firing ground.
  const r = T.equipmentRoom;
  block(kit, 'D02-north-wall', [-17, 2.3, r.minZ], [16, 4.6, 0.4], 'paint');
  block(kit, 'D02-east-wall', [r.maxX, 2.3, 34], [0.4, 4.6, 12], 'paint');
  for (const [a, b] of [[28, 32], [38, 40]]) block(kit, `D02-west-wall-${a}`, [r.minX, 2.3, (a + b) / 2], [0.4, 4.6, b - a], 'pale');
  block(kit, 'D02-west-lintel', [-25, 4.0, 35], [0.6, 1.2, 6], 'steel');
  for (const [a, b] of [[-25, -20], [-14, -9]]) block(kit, `D02-south-wall-${a}`, [(a + b) / 2, 2.3, 40], [b - a, 4.6, 0.4], 'pale');
  block(kit, 'D02-south-lintel', [-17, 4.0, 40], [6, 1.2, 0.6], 'steel');
  block(kit, 'D02-roof', [-17, 4.75, 34], [16.5, 0.3, 12.5], 'pale');
  kit.label('二号设备间', [-25.32, 4.0, 35], 5.5, 0.52, -Math.PI / 2);
  kit.label('D02 地方供热 / 门机', [-17, 4.0, 40.32], 5.3, 0.52);
  for (const x of [-22, -12]) {
    kit.cylinder('amber', [x, 4.0, 34], 0.13, 11, [Math.PI / 2, 0, 0]);
    kit.box('signal', [x, 4.52, 34], [3.5, 0.08, 0.20], [0, 0, 0], false);
  }
  block(kit, 'D02-heat-exchanger', [-12, 1.25, 29.8], [3, 2.5, 2.1], 'steel');
  for (let x = -13.2; x < -10.7; x += 0.35) kit.cylinder('pale', [x, 1.4, 30.93], 0.09, 1.7);
  kit.box('signal', [-11.4, 2.32, 30.9], [0.45, 0.12, 0.06], [0, 0, 0], false);
  block(kit, 'D02-battery-rack', [-11, 1.3, 37.8], [2, 2.6, 2.2], 'steel');
  for (const y of [0.65, 1.65]) for (const x of [-11.5, -10.5]) {
    kit.box('paint', [x, y, 38.95], [0.80, 0.70, 0.10]);
    kit.box('amber', [x, y + 0.26, 39.02], [0.35, 0.06, 0.035]);
  }
  // Sink, faucet and first-aid box are next to the actual hand-care interaction point.
  block(kit, 'D02-sink-base', [-22.7, 0.45, 29.6], [3, 0.9, 1], 'pale');
  kit.box('steel', [-22.7, 0.95, 29.6], [3.15, 0.10, 1.1]);
  kit.box('rubber', [-22.25, 1.015, 29.65], [1.25, 0.025, 0.66]);
  kit.box('white', [-22.25, 1.03, 29.65], [1.0, 0.025, 0.46]);
  kit.cylinder('pale', [-22.25, 1.22, 29.21], 0.035, 0.4);
  kit.cylinder('pale', [-22.25, 1.40, 29.35], 0.035, 0.3, [Math.PI / 2, 0, 0]);
  kit.box('white', [-22.7, 1.16, 29.62], [0.45, 0.31, 0.52]);
  kit.box('paint', [-22.70, 1.19, 29.89], [0.27, 0.07, 0.018]);
  kit.box('paint', [-22.70, 1.19, 29.90], [0.07, 0.22, 0.018]);
  const bandage = new PortKit(); bandage.root.name = 'transfer-clean-dressing';
  bandage.cylinder('white', [-23.05, 1.10, 29.6], 0.09, 0.15, [Math.PI / 2, 0, 0]); bandage.flush(); kit.root.add(bandage.root);
  kit.label('洗净 / 包扎', [-23.2, 1.85, 28.26], 2.7, 0.4);
  // Water and a spare radio remain available for the subsequent S07 rest and handover.
  block(kit, 'D02-water-table', [-22.6, 0.50, 33.5], [1.0, 1, 0.9], 'pale');
  kit.cylinder('white', [-22.65, 1.22, 33.5], 0.12, 0.42);
  kit.cylinder('steel', [-22.30, 1.09, 33.4], 0.065, 0.18);
  kit.box('rubber', [-22.55, 1.08, 33.75], [0.22, 0.16, 0.10]);
  kit.box('steel', [-22.55, 1.30, 33.75], [0.015, 0.30, 0.015]);
  // Outside work console and covered porch connect the room back to the inner-gate landmark.
  kit.terminal(T.returnConsole);
  block(kit, 'D02-tool-bench', [-18.5, 0.50, 41.5], [2, 1, 1], 'steel');
  kit.box('pale', [-18.5, 1.04, 41.5], [2.15, 0.08, 1.1]);
  kit.box('amber', [-18.5, 1.12, 41.5], [0.7, 0.08, 0.13], [0, 0.25, 0]);
  kit.box('pale', [-17, 3.65, 42.4], [10.5, 0.2, 4.8]);
  kit.solid('D02-porch-roof', [-17, 3.65, 42.4], [10.5, 0.2, 4.8]);
  for (const x of [-22, -12]) block(kit, `D02-porch-post-${x}`, [x, 1.8, 44.5], [0.17, 3.6, 0.17], 'steel');
  const roomLight = new PointLight(0xffdbb0, 55, 15, 2); roomLight.position.set(-18, 3.9, 34); kit.root.add(roomLight);
  const apply = (facts: readonly string[]): void => {
    previous.setFacts([...facts, 'front-first-released', 'front-team-returned']);
    const opened = completed || facts.includes('transfer-gate-open');
    const uncovered = completed || facts.includes('transfer-cover-open');
    shutter.root.position.x = opened ? 6.4 : 0; shutter.root.userData.opened = opened;
    cover.root.rotation.y = uncovered ? 1.35 : 0; cover.root.userData.opened = uncovered;
    rod.root.position.x = opened ? -0.28 : 0;
    gateLampMaterial.color.setHex(opened ? 0xb8d9c8 : 0xd7a468); gateLampMaterial.emissive.copy(gateLampMaterial.color);
    bandage.root.visible = !(completed || facts.includes('transfer-hand-treated'));
    roomLight.intensity = completed || facts.includes('argument-finished') ? 62 : 55;
  };
  apply([]);
  return { bounds: T.bounds, update(time) { previous.update(time); }, setFacts: apply };
}
