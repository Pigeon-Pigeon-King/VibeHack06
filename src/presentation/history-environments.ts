import { Group, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { HISTORY as H } from '../content/history-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type SceneBounds, type Surface } from './port-kit';
import { openingView } from './OpeningView';
import { OPENING_TIMELINE } from '../content/opening-timeline';

function block(kit: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete', openFact?: string): void {
  kit.box(surface, at, size);
  kit.solid(id, at, size, 0, openFact);
}

function floor(kit: PortKit, id: string, bounds: SceneBounds, height: number): void {
  const group = new Group(); group.name = id; group.position.y = height;
  addGround(group, bounds); kit.root.add(group);
  kit.solid(id, [(bounds.minX + bounds.maxX) / 2, height - 0.2, (bounds.minZ + bounds.maxZ) / 2],
    [bounds.maxX - bounds.minX, 0.4, bounds.maxZ - bounds.minZ]);
}

function light(kit: PortKit, at: Vec3, color: number, intensity: number, range: number): PointLight {
  const lamp = new PointLight(color, intensity, range, 2); lamp.position.set(...at); kit.root.add(lamp); return lamp;
}

function bench(kit: PortKit, x: number, z: number, length = 6): void {
  kit.box('pale', [x, 0.48, z], [length, 0.12, 0.65]);
  kit.box('paint', [x, 0.83, z - 0.29], [length, 0.56, 0.10]);
  for (const dx of [-length * 0.37, length * 0.37]) {
    kit.box('steel', [x + dx, 0.22, z], [0.12, 0.44, 0.57]);
    kit.box('steel', [x + dx, 0.055, z], [0.55, 0.11, 0.73]);
  }
  kit.solid(`history-bench-${x}-${z}`, [x, 0.55, z], [length, 1.10, 0.73]);
}

function rifleModel(root: Group, name: string, at: Vec3): Group {
  const model = new PortKit(); model.root.name = name;
  model.box('steel', [0, 0.09, 0], [0.48, 0.15, 0.15]);
  model.box('pale', [-0.36, 0.09, 0], [0.26, 0.11, 0.14]);
  model.cylinder('rubber', [0.39, 0.09, 0], 0.035, 0.42, [0, 0, Math.PI / 2]);
  model.box('rubber', [-0.03, 0.07, 0.16], [0.12, 0.12, 0.21], [0, -0.18, 0]);
  model.box('amber', [0.03, 0.17, 0], [0.09, 0.03, 0.10]);
  model.flush(); model.root.position.set(...at); root.add(model.root); return model.root;
}

/** Both historical viewpoints use identical architecture and landmark coordinates. No people are made here. */
export function buildHistoryHall(kit: PortKit): SceneDynamics {
  kit.root.name = 'S01-S02-historical-shelter-placeholder';
  // The western region is a genuinely lower floor. A single world-sized floor at y0 would seal the stairs.
  floor(kit, 'history-main-floor', { minX: -22, maxX: 34, minZ: -28, maxZ: 26 }, 0);
  floor(kit, 'history-lower-floor', { minX: -48, maxX: -22, minZ: -28, maxZ: 26 }, -2.4);
  block(kit, 'history-west-boundary', [-48, 1.0, -1], [0.5, 6.8, 54]);
  block(kit, 'history-east-boundary', [34, 3.9, -1], [0.5, 7.8, 54]);
  for (const z of [-28, 26]) block(kit, `history-boundary-${z}`, [-7, 2.7, z], [82, 10.2, 0.5]);
  block(kit, 'history-west-foundation', [-22, -1.2, -1], [0.7, 2.4, 54]);
  // Hall shell: an east public entrance and north vestibule face the same connected defensive area.
  for (const [a, b] of [[-28, 4], [8, 26]]) block(kit, `history-west-wall-${a}`, [-22, 3.9, (a + b) / 2], [0.7, 7.8, b - a], 'paint');
  block(kit, 'history-west-door-header', [-22, 5.7, 6], [0.8, 4.2, 4.2], 'pale');
  for (const [a, b] of [[-22, -8], [4, 22]]) block(kit, `history-east-wall-${a}`, [30, 3.9, (a + b) / 2], [0.7, 7.8, b - a], 'paint');
  block(kit, 'history-east-lintel', [30, 6.2, -2], [0.8, 3.2, 12.5], 'pale');
  for (const [a, b] of [[-22, 12], [24, 30]]) block(kit, `history-north-wall-${a}`, [(a + b) / 2, 3.9, -22], [b - a, 7.8, 0.6], 'paint');
  block(kit, 'history-north-lintel', [18, 6.2, -22], [12.5, 3.2, 0.8], 'pale');
  block(kit, 'history-south-wall', [4, 3.9, 22], [52, 7.8, 0.6], 'paint');
  kit.solid('history-roof', [4, 7.95, 0], [52.7, 0.3, 44.7]);
  const roofPanels: Group[] = [];
  for (const x of [-15.5, -2.5, 10.5, 23.5]) for (const z of [-14.7, 0, 14.7]) {
    const section = new PortKit(); section.root.name = `history-roof-section-${roofPanels.length}`;
    section.box('pale', [0, 0, 0], [13.2, 0.3, 14.9]);
    section.box('steel', [0, -0.21, 0], [12.8, 0.16, 0.18]); section.flush();
    section.root.position.set(x, 7.95, z); kit.root.add(section.root); roofPanels.push(section.root);
  }
  // Interior walls and trims remain readable under ordinary emergency work lighting.
  for (const x of [-21.6, 29.6]) kit.box('pale', [x, 1.2, -11], [0.06, 0.22, 20]);
  for (const x of [-15, -2, 14]) {
    kit.cylinder('steel', [x, 6.8, 0], 0.32, 43, [Math.PI / 2, 0, 0]);
    for (const z of [-16, -4, 8, 19]) kit.box('pale', [x, 6.6, z], [0.86, 0.10, 0.11]);
  }
  for (const [x, z] of [[-8, 1], [-9, -14], [13, -12], [13, 12], [-8, 19]]) {
    kit.cylinder('pale', [x, 3.9, z], 0.65, 7.8);
    kit.cylinder('steel', [x, 0.30, z], 0.76, 0.6);
    kit.solid(`history-column-${x}-${z}`, [x, 3.9, z], [1.52, 7.8, 1.52]);
  }
  for (const z of [-15, -2, 11, 19]) {
    kit.box('signal', [3, 7.55, z], [14, 0.10, 0.24], [0, 0, 0], false);
    kit.box('steel', [3, 7.7, z], [24, 0.18, 0.22]);
  }
  light(kit, [-10, 5.5, 10], 0xffdfb5, 80, 25);
  const combatLight = light(kit, [14, 5.8, -7], 0xd7e4e3, 100, 32);
  light(kit, [-6, 5.5, -12], 0xd7e4e3, 65, 25);

  bench(kit, -10, 11.4);
  bench(kit, -2, 18.4);
  bench(kit, 8, 17.5);
  bench(kit, 20, 17.5, 5);
  bench(kit, 22, 7.5, 4);
  const lunch = new PortKit(); lunch.root.name = 'history-lunchbox-on-bench';
  lunch.box('pale', [-10, 0.61, 11.50], [0.32, 0.13, 0.23]);
  lunch.box('white', [-10, 0.684, 11.50], [0.28, 0.025, 0.19]);
  lunch.box('steel', [-10.34, 0.558, 11.51], [0.29, 0.027, 0.22], [0, 0.15, 0]);
  lunch.box('amber', [-9.55, 0.56, 11.52], [0.06, 0.04, 0.045]);
  lunch.box('paint', [-9.2, 0.55, 11.48], [0.13, 0.025, 0.09], [0, -0.3, 0]);
  lunch.box('rubber', [-8.8, 0.56, 11.47], [0.19, 0.04, 0.07]);
  lunch.flush(); kit.root.add(lunch.root);
  // Packed belongings stay beside the seating, leaving the westbound aisle open.
  for (const [x, z] of [[-5.5, 12.6], [6.5, 19.5], [17.0, 18.5], [24, 11]]) {
    block(kit, `history-belongings-${x}`, [x, 0.30, z], [0.85, 0.60, 0.7], 'rubber');
    kit.box('amber', [x, 0.62, z], [0.55, 0.08, 0.1]);
  }
  const mattress = new PortKit(); mattress.root.name = 'history-mattress-in-aisle';
  mattress.box('white', [-19.2, 0.12, 9.6], [2.2, 0.24, 0.95], [0, 0.18, 0]);
  mattress.box('paint', [-19.2, 0.25, 9.6], [1.5, 0.04, 0.90], [0, 0.18, 0]);
  mattress.flush(); kit.root.add(mattress.root);
  kit.solid('history-mattress-low', [-19.2, 0.12, 9.6], [2.2, 0.24, 0.95], 0.18, 'history-gate-open');
  // A framed luggage recess has a conservative solid envelope in either state.
  for (const z of [10.0, 12.0]) kit.box('steel', [-21.35, 1.4, z], [1.0, 2.8, 0.10]);
  kit.box('steel', [-21.35, 2.75, 11], [1.0, 0.10, 2.1]);
  kit.box('steel', [-21.75, 1.4, 11], [0.12, 2.8, 2]);
  kit.solid('history-luggage-recess', [-21.35, 1.4, 11], [1.0, 2.8, 2.1]);
  const upright = new PortKit(); upright.root.name = 'history-mattress-moved'; upright.root.visible = false;
  upright.box('white', [-20.98, 1.3, 11], [0.18, 2.6, 1.7]);
  upright.box('paint', [-20.88, 1.4, 11], [0.025, 1.8, 1.6]); upright.flush(); kit.root.add(upright.root);

  // Frozen public feed; the hall has screens rather than exterior windows.
  kit.box('steel', [4, 3.55, 21.62], [10.6, 3.5, 0.16]);
  kit.box('glass', [4, 3.55, 21.51], [10.1, 3.0, 0.06]);
  kit.box('pale', [4.4, 2.85, 21.45], [4.8, 0.25, 0.04]);
  kit.box('pale', [5.2, 3.16, 21.45], [2.4, 0.40, 0.04]);
  kit.box('steel', [-0.2, 3.55, 21.44], [0.13, 2.2, 0.04]);
  kit.box('amber', [0.65, 4.25, 21.43], [2.1, 0.12, 0.04], [0, 0, 0.22]);
  for (const x of [3.4, 4.1, 4.8, 5.5, 6.2]) kit.box('signal', [x, 3.38, 21.42], [0.18, 0.06, 0.03], [0, 0, 0], false);
  kit.label('港区公共画面  04:12', [4, 4.65, 21.38], 8.8, 0.44, Math.PI);
  kit.label('公共等候厅', [-2, 5.5, 21.48], 9, 0.85, Math.PI);
  kit.label('正门', [29.58, 5.0, -2], 4, 0.7, -Math.PI / 2);
  kit.label('检修出口  ←', [-21.56, 3.97, 6], 4.1, 0.55, Math.PI / 2);

  // A toppled transport cabinet and the west column provide connected, physically different positions.
  block(kit, 'history-toppled-cabinet', [6, 0.58, -3], [1.55, 1.16, 5.2], 'steel');
  for (const z of [-5.4, -3, -0.6]) kit.box('pale', [6, 1.20, z], [1.65, 0.10, 0.09]);
  kit.box('paint', [5.15, 0.10, -4.8], [1.4, 0.12, 2.0], [0, -0.18, 0]);
  kit.solid('history-fallen-cabinet-door', [5.15, 0.10, -4.8], [1.4, 0.20, 2.0], -0.18);
  block(kit, 'history-fire-cabinet', [27.8, 1.15, 9.8], [1.8, 2.3, 0.7], 'pale');
  kit.box('amber', [27.8, 1.5, 10.17], [0.65, 0.18, 0.04]);

  // West landing and sixteen 0.15m descents. Lowest traversable floor is -2.4m.
  block(kit, 'history-west-landing', [-23.5, -1.2, 6], [3, 2.4, 6], 'concrete');
  for (const z of [3, 9]) block(kit, `history-lower-wall-${z}`, [-35, 0.8, z], [26, 6.4, 0.40], 'paint');
  block(kit, 'history-lower-roof', [-35, 4.15, 6], [26, 0.3, 6.4], 'pale');
  for (let i = 0; i < 15; i++) {
    const top = -(i + 1) * 0.15, height = top + 2.4, x = -25 - (i + 0.5) * 0.5;
    block(kit, `history-stair-${i}`, [x, -2.4 + height / 2, 6], [0.5, height, 6], 'concrete');
    kit.box('amber', [x - 0.20, top + 0.008, 6], [0.07, 0.016, 5.6], [0, 0, 0], false);
  }
  for (const z of [3.3, 8.7]) kit.beam('pale', [-24.6, 1.0, z], [-33.2, -1.4, z], 0.075);
  for (const x of [-26, -30, -34, -38, -42, -46]) {
    kit.box('signal', [x, 1.2, 3.25], [0.8, 0.15, 0.08], [0, 0, 0], false);
    kit.box('signal', [x, -1.9, 8.75], [0.55, 0.12, 0.08], [0, 0, 0], false);
  }
  light(kit, [-29, 2.5, 6], 0xffd8a6, 35, 13);
  light(kit, [-40, 1.2, 6], 0xffd8a6, 30, 13);
  kit.box('steel', [-21.5, 1.2, 3], [0.18, 0.9, 0.65]);
  kit.box('signal', [-21.39, 1.42, 3], [0.025, 0.17, 0.38], [0, 0, 0], false);
  kit.cylinder('amber', [-21.35, 0.99, 3], 0.09, 0.06, [0, 0, Math.PI / 2]);
  const gate = new PortKit(); gate.root.name = 'history-maintenance-door'; gate.root.userData.openFact = 'history-gate-open';
  gate.box('steel', [H.gateX, 1.8, 6], [0.28, 3.6, 3.8]);
  for (const z of [4.2, 6, 7.8]) gate.box('pale', [H.gateX + 0.17, 1.8, z], [0.06, 3.55, 0.06]);
  gate.box('amber', [H.gateX + 0.18, 1.5, 6], [0.035, 0.16, 3.4], [0, 0, 0], false);
  gate.flush(); kit.root.add(gate.root);
  kit.solid('history-maintenance-door', [H.gateX, 1.8, 6], [0.35, 3.6, 4], 0, 'history-gate-open');
  const partition = new PortKit(); partition.root.name = 'history-lower-partition';
  partition.box('steel', [H.partitionX, 0.75, 6], [0.26, 6.3, 5.8]);
  for (let y = -2.2; y < 3.8; y += 0.45) partition.box('pale', [H.partitionX + 0.16, y, 6], [0.06, 0.045, 5.7]);
  partition.flush(); partition.root.position.y = 6.8; kit.root.add(partition.root);
  // This shutter and collapse are staged visuals; the scripts have already ended free traversal.
  const rubble = new PortKit(); rubble.root.name = 'history-collapse-debris'; rubble.root.visible = false;
  // Pin the legs below the low eye line; keep nearby civilians visible above the debris.
  rubble.beam('steel', [-13, 0.26, 4.95], [-7.0, 0.44, 5.35], 0.32);
  rubble.beam('pale', [-11.5, 0.20, 5.1], [-8.9, 0.72, 6.15], 0.22);
  for (let i = 0; i < 13; i++) {
    const x = -12.8 + i % 5 * 0.9, z = 3.1 + Math.floor(i / 5) * 1.0;
    rubble.box(i % 2 ? 'concrete' : 'pale', [x, 0.10 + i % 3 * 0.06, z], [0.55 + i % 3 * 0.16, 0.15, 0.6], [0.10, i * 0.6, 0.14]);
  }
  rubble.flush(); kit.root.add(rubble.root);
  const rafter = new PortKit(); rafter.root.name = 'history-intact-rafter';
  rafter.box('steel', [-8, 7.3, 4.8], [15, 0.32, 0.32]); rafter.flush(); kit.root.add(rafter.root);
  const sourceRifle = rifleModel(kit.root, 'history-source-rifle', H.rifle); sourceRifle.visible = false;
  const droppedRifle = rifleModel(kit.root, 'history-fallen-rifle', [-12.4, 0.015, 9.8]); droppedRifle.visible = false;
  const commanderRifle = rifleModel(kit.root, 'history-commander-rifle', [H.zhaoCaptured[0] + 0.8, 0.015, H.zhaoCaptured[2] + 0.7]);
  commanderRifle.visible = false;
  const spilled = new PortKit(); spilled.root.name = 'history-spilled-lunch'; spilled.root.visible = false;
  spilled.box('pale', [-29.2, -1.28, 6.4], [0.32, 0.12, 0.23], [0.08, 0.4, 0.4]);
  spilled.box('steel', [-29.6, -1.48, 6.3], [0.29, 0.025, 0.21], [0, -0.6, 0]);
  for (let i = 0; i < 19; i++) {
    const x = -29.05 - i % 5 * 0.12, stairY = -0.15 * (Math.floor((-25 - x) / 0.5) + 1);
    spilled.box('white', [x, stairY + 0.018, 6.1 + (i * 7 % 11) * 0.055], [0.025, 0.018, 0.015]);
  }
  spilled.flush(); kit.root.add(spilled.root);
  let currentFacts: readonly string[] = [];
  const moveCollapse = (fall: number, collapsed: boolean, time = Infinity) => {
    rubble.root.visible = collapsed; rubble.root.position.y = collapsed ? 4.5 * (1 - fall) ** 2 : 0;
    rafter.root.visible = !collapsed || fall < 1;
    rafter.root.position.y = -6.4 * fall; rafter.root.rotation.z = 0.08 * fall;
    roofPanels.forEach((panel, i) => {
      const u = !collapsed || i % 3 === 0 ? 0 : Math.max(0, Math.min(1, (time - OPENING_TIMELINE.mainhall.collapse - i * 0.07) / 1.5));
      const progress = u * u * (3 - 2 * u);
      panel.position.y = 7.95 - 3.5 * progress;
      panel.rotation.set((i % 2 ? 0.20 : -0.20) * progress, 0, (i % 2 ? -0.14 : 0.14) * progress);
    });
  };

  return {
    bounds: H.bounds,
    update(_time, frame) {
      if (!frame) return;
      const view = openingView(frame, currentFacts);
      const legacy = !currentFacts.includes('history-timeline-v2');
      moveCollapse(view.fall, view.collapsed, legacy ? Infinity : view.time);
      combatLight.intensity = (view.collapsed ? 40 : 100) + view.blast * 75;
    },
    setFacts(facts) {
      currentFacts = facts;
      const opened = facts.includes('history-gate-open'), collapsed = facts.includes('history-collapse');
      gate.root.position.z = opened ? 4.2 : 0;
      gate.root.userData.opened = opened;
      mattress.root.visible = !opened; upright.root.visible = opened;
      lunch.root.visible = !opened && !facts.includes('lunch-packed');
      sourceRifle.visible = opened && facts.includes('history-defender-0-down') && !facts.includes('father-rifle-collected');
      droppedRifle.visible = facts.includes('father-died');
      moveCollapse(collapsed ? 1 : 0, collapsed);
      commanderRifle.visible = collapsed;
      combatLight.intensity = collapsed ? 40 : 100;
      const sealed = facts.includes('history-partition-closed');
      partition.root.position.y = sealed ? 0 : 6.8;
      partition.root.userData.closed = sealed;
      spilled.root.visible = sealed;
    },
  };
}
