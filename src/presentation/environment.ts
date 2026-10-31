import {
  DataTexture, DirectionalLight, Group, HemisphereLight, MathUtils, Mesh, MeshBasicMaterial,
  PointLight, RGBAFormat, SphereGeometry, SRGBColorSpace,
} from 'three';
import type { EnvironmentModel, ScenarioId } from '../contracts';
import { LAYOUT } from '../content/layout';
import { disposeModelTree } from './model-tools';
import { addGround, PortKit } from './port-kit';
import { buildNightShift, buildWorkersSector, type SceneDynamics } from './chapter-environments';
import { buildHistoryHall } from './history-environments';
import { buildFrontGate } from './frontgate-environment';
import { buildTransfer } from './transfer-environment';
import { buildFlank } from './flank-environment';
import { buildEscort } from './escort-environment';
import { buildRelief } from './relief-environment';
import { buildRescue } from './rescue-environment';
import { buildMedical } from './medical-environment';
import { buildEpilogue } from './epilogue-environment';


function addJupiter(root: Group): Group {
  const sky = new Group(); sky.name = 'world-oriented-sky'; root.add(sky);
  const width = 256; const height = 128; const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = y / height;
    const wave = Math.sin(t * 85 + Math.sin(x * 0.051) * 0.8) * 0.5 + Math.sin(t * 41) * 0.35;
    const storm = Math.exp(-(((x / width - 0.66) / 0.06) ** 2 + ((t - 0.61) / 0.035) ** 2));
    const light = 0.62 + Math.sin(x / width * Math.PI) * 0.38;
    const i = (y * width + x) * 4;
    data[i] = (208 + wave * 25 + storm * 18) * light;
    data[i + 1] = (189 + wave * 22 - storm * 37) * light;
    data[i + 2] = (157 + wave * 20 - storm * 38) * light;
    data[i + 3] = 255;
  }
  const texture = new DataTexture(data, width, height, RGBAFormat); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
  const distance = 420;
  const radius = Math.tan(MathUtils.degToRad(7.7 / 2)) * distance;
  const planet = new Mesh(new SphereGeometry(radius, 40, 24), new MeshBasicMaterial({ map: texture, fog: false, depthWrite: false }));
  const azimuth = MathUtils.degToRad(93); const elevation = MathUtils.degToRad(16);
  planet.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, -Math.cos(azimuth) * Math.cos(elevation) * distance);
  planet.rotation.set(0.05, -0.7, 0.08); planet.renderOrder = -10; planet.name = 'jupiter';
  sky.add(planet);
  return sky;
}

function siteBase(kit: PortKit): void {
  addGround(kit.root);
  kit.solid('ground', [0, -0.2, -4], [60, 0.4, 76]);
  for (const x of [-30, 30]) {
    kit.box('concrete', [x, 1.4, -4], [0.8, 2.8, 76]);
    kit.solid(`boundary-x-${x}`, [x, 1.4, -4], [0.8, 2.8, 76]);
    for (let z = -40; z < 34; z += 6) kit.box('steel', [x, 3.1, z], [0.14, 1.6, 0.14]);
    kit.box('steel', [x, 3.8, -4], [0.08, 0.06, 76]);
  }
  for (const z of [-42, 34]) {
    kit.box('concrete', [0, 1.4, z], [60, 2.8, 0.8]);
    kit.solid(`boundary-z-${z}`, [0, 1.4, z], [60, 2.8, 0.8]);
  }
  // Lane paint is shallow, non-colliding, and does not occupy the authored movement corridors.
  for (let z = -37; z < 30; z += 4.5) {
    kit.box('white', [-10.2, 0.014, z], [0.10, 0.02, 2.1], [0, 0, 0], false);
    kit.box('amber', [10.8, 0.015, z], [0.12, 0.02, 2.6], [0, 0, 0], false);
  }
  for (let z = 11; z < 29; z += 4.5) {
    kit.box('white', [-12.35, 0.018, z], [0.07, 0.018, 0.9], [0, -0.60, 0], false);
    kit.box('white', [-11.65, 0.018, z], [0.07, 0.018, 0.9], [0, 0.60, 0], false);
  }
  for (const x of [-25, 25]) for (const z of [-28, -2, 24]) kit.light(x, z);
  // Distant industrial masses and ice ridges establish scale without gameplay collision.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (44 + (i % 4) * 13); const z = -72 + i * 10;
    const height = 10 + (i * 7 % 17);
    kit.box('steel', [x, height / 2, z], [12 + i % 3 * 3, height, 18], [0, 0, 0], false);
    kit.box('pale', [x, height + 0.5, z], [13 + i % 3 * 3, 1, 19], [0, 0, 0], false);
    kit.cylinder('pale', [x + 5, height + 5, z + 4], 1.0, 10);
  }
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18;
    kit.part('cone', 'ice', [Math.sin(a) * 150, -2 + (i % 4) * 2, Math.cos(a) * 150 - 20], [25 + i % 3 * 12, 22 + i % 5 * 10, 26 + i % 4 * 7], [0, i * 0.73, 0], false);
  }
}

function northGate(kit: PortKit): void {
  // West evacuation lane x=-12 remains open from worker area to the south safe zone.
  kit.workshop(-23, 5, 10, 17);
  kit.container(-21, -13, 0, 'pale');
  kit.container(21, -23, Math.PI / 2);
  kit.container(19, 19, 0, 'pale');
  kit.tank(23, -4, 2.4, 7);
  kit.tractor(19, 7, -0.15);
  for (const x of [-16, 16]) {
    kit.box('steel', [x, 3.1, -18], [0.55, 6.2, 0.75]);
    kit.box('concrete', [x, 0.4, -18], [1.2, 0.8, 1.4]);
    kit.solid(`gate-pillar-${x}`, [x, 3.1, -18], [0.8, 6.2, 1]);
    kit.beam('pale', [x, 5.4, -18], [x + (x < 0 ? 4 : -4), 6.6, -18], 0.20);
  }
  kit.box('paint', [0, 6.15, -18], [33, 1.25, 1.2]);
  kit.box('signal', [0, 5.45, -17.35], [15, 0.08, 0.10], [0, 0, 0], false);
  kit.solid('gate-header', [0, 6.15, -18], [33, 1.25, 1.2]);
  kit.label('北闸 04  /  NORTH GATE', [0, 6.2, -17.38], 13, 1.0);
  // Flush weighing deck: workers can cross it with no artificial step or nav blocker.
  kit.box('rubber', [0.5, 0.014, -5], [19, 0.022, 8.6], [0, 0, 0], false);
  for (let x = -8; x <= 9; x += 1.1) kit.box('pale', [x, 0.031, -5], [0.06, 0.018, 8.4], [0, 0, 0], false);
  kit.box('amber', [0.5, 0.037, -0.75], [19, 0.018, 0.10], [0, 0, 0], false);
  kit.cover(-5.8, 8, 4.4);
  kit.cover(6.0, 10, 4.3);
  kit.cover(-5, -16, 3.2);
  kit.cover(7, -18, 3.2);
  kit.cover(17.5, -9, 3, Math.PI / 2);
  kit.terminal(LAYOUT.northgate.terminal);
  kit.label('称重控制', [1.45, 2.15, 4.42], 0.95, 0.24);
  kit.label('人员后路  ↓', [-12, 3.2, 30.2], 5.8, 1.0);
  kit.box('pale', [-12, 3.2, 30], [6.2, 1.1, 0.28]);
  kit.label('南侧撤离', [0, 3.5, 32.7], 5, 0.8);
  // Pipes and elbows break the orthogonal silhouette without crossing the walking lane.
  kit.cylinder('amber', [-27.5, 3.0, 4], 0.19, 22, [Math.PI / 2, 0, 0]);
  kit.cylinder('pale', [-27.5, 1.3, -7.9], 0.19, 2.6);
  kit.part('elbow', 'amber', [-27.5, 2.1, -7], [1, 1, 1], [0, Math.PI / 2, 0]);
  for (let z = -6; z <= 14; z += 5) kit.box('steel', [-27.6, 2.7, z], [0.6, 0.20, 0.12]);
}

function prologueHall(kit: PortKit): void {
  for (const x of [-18, 18]) {
    kit.box('paint', [x, 3.1, -2], [0.55, 6.2, 42]);
    kit.solid(`hall-wall-${x}`, [x, 3.1, -2], [0.55, 6.2, 42]);
    for (let z = -20; z <= 16; z += 6) {
      kit.box('steel', [x * 0.98, 3.0, z], [0.28, 6.0, 0.28]);
      kit.box('signal', [x * 0.96, 3.8, z], [0.12, 0.12, 1.6], [0, 0, 0], false);
    }
  }
  kit.part('arch', 'pale', [0, 6.2, -2], [37, 7, 43]);
  kit.solid('hall-roof-envelope', [0, 8.0, -2], [37, 3.6, 43]);
  for (const z of [-18, -6, 6, 18]) {
    kit.part('arch', 'steel', [0, 6.16, z], [37.2, 7.2, 0.25]);
    kit.box('steel', [0, 6.3, z], [36, 0.15, 0.16]);
  }
  for (const x of [-7, -1]) {
    kit.box('steel', [x, 1.8, 10], [0.55, 3.6, 0.55]);
    kit.solid(`maintenance-door-${x}`, [x, 1.8, 10], [0.55, 3.6, 0.55]);
  }
  kit.box('pale', [-4, 3.65, 10], [6.5, 0.50, 0.6]);
  kit.solid('maintenance-door-header', [-4, 3.65, 10], [6.5, 0.50, 0.6]);
  kit.label('检修门  /  07', [-4, 3.68, 10.32], 4.8, 0.4);
  kit.box('amber', [-4, 0.03, 10], [5.8, 0.02, 0.4], [0, 0, 0], false);
  kit.container(13, -6, 0, 'pale');
  kit.cover(6, 3, 4.8);
  kit.cover(-13, -10, 4.8);
  kit.workshop(23.5, 13, 9, 11);
  kit.label('主厅  /  转运通道', [0, 5.3, -20], 10, 0.9);
  kit.label('避难集合点', [-8, 3.0, 26], 5, 0.8);
  kit.box('white', [-8, 0.02, 23], [5, 0.02, 0.1], [0, 0, 0], false);
  for (let i = 0; i < 7; i++) {
    kit.box('concrete', [22 + i % 3 * 1.6, 0.25, -22 + Math.floor(i / 3) * 2.2], [1.7, 0.5, 1.3], [0.12, i * 0.4, 0.15]);
  }
}

function handoverSite(kit: PortKit): void {
  kit.workshop(-23, 8, 10, 18);
  kit.container(-22, -15, 0, 'pale');
  kit.container(22, 5, 0, 'paint');
  kit.tractor(24, -22, 0.5);
  kit.tank(-23, -30, 2.6, 8);
  kit.cover(-5.4, -7, 4.5);
  kit.cover(6.0, -8, 3.6);
  kit.cover(10, -22, 3.2, Math.PI / 2);
  kit.cover(21, -17, 4.0);
  kit.terminal(LAYOUT.handover.terminal);
  kit.label('港区联络', [-12.5, 2.2, 15.4], 1.2, 0.28);
  kit.box('amber', [0, 0.02, 0], [3.0, 0.025, 0.12], [0, 0, 0], false);
  kit.box('amber', [-1.5, 0.02, 0.6], [0.12, 0.025, 1.3], [0, 0, 0], false);
  kit.box('amber', [1.5, 0.02, 0.6], [0.12, 0.025, 1.3], [0, 0, 0], false);
  kit.label('接防线', [0, 3.8, -2.2], 4.5, 0.75);
  for (const x of [-3.0, 3.0]) kit.box('steel', [x, 1.9, -2.4], [0.10, 3.8, 0.10]);
  // Medical shelter stays open on its north face; the safe/exit anchors lie inside it.
  for (const x of [9, 19]) {
    kit.box('white', [x, 1.8, 27], [0.18, 3.6, 10]);
    kit.solid(`medical-side-${x}`, [x, 1.8, 27], [0.18, 3.6, 10]);
  }
  kit.part('arch', 'white', [14, 3.6, 27], [10.4, 3, 10.5]);
  kit.solid('medical-roof-envelope', [14, 4.4, 27], [10.4, 1.6, 10.5]);
  for (const z of [22, 27, 32]) kit.part('arch', 'steel', [14, 3.60, z], [10.5, 3.1, 0.12]);
  kit.box('pale', [14, 1.8, 31.9], [10, 3.6, 0.20]);
  kit.solid('medical-back', [14, 1.8, 31.9], [10, 3.6, 0.2]);
  kit.label('医疗转运', [14, 3.2, 21.9], 5, 0.8, Math.PI);
  kit.label('医疗转运', [14, 3.2, 22.0], 5, 0.8);
  kit.box('signal', [14, 3.9, 24], [3.6, 0.08, 0.20], [0, 0, 0], false);
  kit.box('pale', [10.4, 0.65, 28.5], [2, 1.3, 1.7]);
  kit.solid('medical-cabinet', [10.4, 0.65, 28.5], [2, 1.3, 1.7]);
  kit.box('white', [10.4, 1.35, 28.5], [2.2, 0.1, 1.9]);
}

export function buildEnvironment(scenario: ScenarioId): EnvironmentModel {
  const kit = new PortKit();
  let dynamics: SceneDynamics | undefined;
  if (scenario === 'childhood' || scenario === 'mainhall') dynamics = buildHistoryHall(kit);
  else if (scenario === 'frontgate') dynamics = buildFrontGate(kit);
  else if (scenario === 'transfer') dynamics = buildTransfer(kit);
  else if (scenario === 'flank') dynamics = buildFlank(kit);
  else if (scenario === 'escort') dynamics = buildEscort(kit);
  else if (scenario === 'relief') dynamics = buildRelief(kit);
  else if (scenario === 'rescue') dynamics = buildRescue(kit);
  else if (scenario === 'medical') dynamics = buildMedical(kit);
  else if (scenario === 'epilogue') dynamics = buildEpilogue(kit);
  else if (scenario === 'nightshift') dynamics = buildNightShift(kit);
  else if (scenario === 'workers') dynamics = buildWorkersSector(kit);
  else {
    siteBase(kit);
    if (scenario === 'northgate') northGate(kit);
    else if (scenario === 'prologue') prologueHall(kit);
    else handoverSite(kit);
  }
  kit.flush();
  const sky = addJupiter(kit.root);
  const hemisphere = new HemisphereLight(0xc5dbe5, 0x45515d, 1.75);
  const key = new DirectionalLight(0xe5edf0, 2.45);
  const centerZ = dynamics ? (dynamics.bounds.minZ + dynamics.bounds.maxZ) / 2 : -3;
  key.position.set(-36, 64, centerZ - 19); key.target.position.set(0, 0, centerZ);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const shadowExtent = dynamics ? Math.max(dynamics.bounds.maxX - dynamics.bounds.minX, dynamics.bounds.maxZ - dynamics.bounds.minZ) * 0.57 : 42;
  key.shadow.camera.left = -shadowExtent; key.shadow.camera.right = shadowExtent;
  key.shadow.camera.top = shadowExtent; key.shadow.camera.bottom = -shadowExtent;
  key.shadow.camera.near = 1; key.shadow.camera.far = dynamics ? 240 : 155;
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.035;
  const workLight = new PointLight(0xffca83, 22, 12, 2);
  const anchor = LAYOUT[scenario].terminal;
  workLight.position.set(anchor[0] + 1.45, 3.1, anchor[2]);
  kit.root.add(hemisphere, key, key.target, workLight);
  let disposed = false;
  return {
    root: kit.root,
    solids: kit.solids,
    setFacts(facts) { dynamics?.setFacts(facts); },
    update(time, cameraPosition, frame) {
      // Translation only. Turning the camera never turns the celestial direction.
      sky.position.copy(cameraPosition);
      dynamics?.update(time, frame);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      key.shadow.dispose();
      dynamics?.dispose?.();
      disposeModelTree(kit.root);
    },
  };
}
