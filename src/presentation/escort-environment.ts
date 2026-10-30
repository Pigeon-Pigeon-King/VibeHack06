import { BoxGeometry, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { Vec3 } from '../contracts';
import { ESCORT as E } from '../content/escort-layout';
import type { SceneDynamics } from './chapter-environments';
import { addGround, PortKit, type Surface } from './port-kit';

function block(k: PortKit, id: string, at: Vec3, size: Vec3, surface: Surface = 'concrete'): void {
  k.box(surface, at, size); k.solid(id, at, size);
}
function screen(k: PortKit, id: string, a: Vec3, b: Vec3, height = 2.8, thickness = 0.45): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], yaw = -Math.atan2(dz, dx);
  const center: Vec3 = [(a[0] + b[0]) / 2, height / 2, (a[2] + b[2]) / 2];
  const size: Vec3 = [Math.hypot(dx, dz), height, thickness];
  k.box('pale', center, size, [0, yaw, 0]); k.solid(id, center, size, yaw);
  k.box('steel', [center[0], height + 0.05, center[2]], [size[0], 0.10, thickness + 0.05], [0, yaw, 0]);
}
function bridge(k: PortKit, i: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
  const x = (r.minX + r.maxX) / 2, z = (r.minZ + r.maxZ) / 2, w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  block(k, `escort-bridge-${i}-deck`, [x, -0.23, z], [w + 0.12, 0.46, d], 'steel');
  for (let bx = r.minX + 0.8; bx < r.maxX; bx += 2) k.box('pale', [bx, 0.008, z], [0.06, 0.016, d - 0.2], [0, 0, 0], false);
  for (const bz of [r.minZ, r.maxZ]) {
    block(k, `escort-bridge-${i}-rail-${bz}`, [x, 0.6, bz], [w, 1.2, 0.32], 'paint');
    k.box('amber', [x, 1.22, bz], [w, 0.08, 0.36]);
    for (let bx = r.minX; bx <= r.maxX; bx += 7) {
      k.box('steel', [bx, -2.4, bz], [0.3, 4.8, 0.3]);
      if (bx + 7 <= r.maxX) {
        k.beam('pale', [bx, -3.8, bz], [bx + 7, -0.4, bz], 0.22);
        k.beam('steel', [bx, -0.4, bz], [bx + 7, -3.8, bz], 0.16);
      }
    }
  }
}
function terrain(k: PortKit): void {
  const bounds = E.bounds;
  for (const [minX, maxX] of [[-132, 30], [-308, -174], [-430, -350]]) {
    addGround(k.root, { minX, maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
    k.solid(`escort-bank-${minX}`, [(minX + maxX) / 2, -0.2, -6], [maxX - minX, 0.4, 124]);
  }
  for (const z of [bounds.minZ, bounds.maxZ]) block(k, `escort-boundary-z-${z}`, [-200, 1.4, z], [460, 2.8, 0.8]);
  for (const x of [bounds.minX, bounds.maxX]) block(k, `escort-boundary-x-${x}`, [x, 1.4, -6], [0.8, 2.8, 124]);
  // The void is real: bank-edge barriers route the 2D navigation grid onto the physical spans.
  for (const x of [-132, -174]) for (const [a, b] of [[-68, -21], [-4, 5.5], [22.5, 56]]) {
    block(k, `escort-first-edge-${x}-${a}`, [x, 0.6, (a + b) / 2], [0.45, 1.2, b - a], 'paint');
  }
  for (const x of [-308, -350]) for (const [a, b] of [[-68, 22], [38, 56]]) {
    block(k, `escort-medical-edge-${x}-${a}`, [x, 0.6, (a + b) / 2], [0.45, 1.2, b - a], 'paint');
  }
  E.bridgeSpans.forEach((r, i) => bridge(k, i, r));
  for (const x of [-153, -329]) {
    k.box('ice', [x, -7, -6], [42, 1.4, 124]);
    for (let z = -62; z <= 52; z += 11) k.part('cone', 'ice', [x - 14 + (z % 3) * 3, -5.3, z], [10, 3.2, 12], [0, z * 0.03, 0], false);
    k.cylinder('amber', [x, -2.6, 42], 0.42, 45, [0, 0, Math.PI / 2]);
  }
  for (let x = -420; x < 24; x += 18) {
    const z = x < -300 ? 43 : 28;
    k.light(x, z, 7);
  }
  for (let i = 0; i < 18; i++) {
    const x = 45 - i * 30, h = 12 + i % 4 * 4, z = i % 2 ? -99 : 91;
    k.box('paint', [x, h / 2, z], [16 + i % 3 * 3, h, 20], [0, 0, 0], false);
    k.cylinder('pale', [x + 5, h + 3, z], 0.9, 6);
    k.part('cone', 'ice', [x, 5, z + (z < 0 ? -40 : 40)], [36, 34 + i % 3 * 8, 30], [0, i * 0.38, 0], false);
  }
}
function reception(k: PortKit) {
  const r = E.receptionRoom;
  block(k, 'escort-reception-east', [r.maxX, 2.5, 8], [0.5, 5, 24], 'paint');
  block(k, 'escort-reception-south', [3, 2.5, r.maxZ], [34, 5, 0.5], 'paint');
  for (const [a, b] of [[-14, -11], [-3, 20]]) block(k, `escort-reception-north-${a}`, [(a + b) / 2, 2.5, -4], [b - a, 5, 0.5], 'paint');
  block(k, 'escort-reception-north-lintel', [-7, 4.5, -4], [8, 1, 0.5], 'steel');
  k.label('货运坪 / 战斗通路', [-7, 4.46, -3.7], 6.5, 0.5);
  block(k, 'escort-reception-west', [-14, 2.5, 3], [0.5, 5, 14], 'pale');
  block(k, 'escort-reception-west-lintel', [-14, 4.5, 15], [0.5, 1, 10], 'steel');
  block(k, 'escort-reception-roof', [3, 5.1, 8], [35, 0.3, 25], 'pale');
  k.part('arch', 'pale', [3, 5.1, 8], [35, 6.2, 25]);
  k.terminal(E.reception); k.terminal(E.luoDesk);
  k.label('接收状态 / 升降机', [10.45, 2.15, 3.9], 3.7, 0.45);
  k.label('罗敬值班台', [4.45, 2.15, 4.9], 2.5, 0.4);
  // The independent monitor renderer owns the flat display surface; this factory only supplies its bezel and desk.
  block(k, 'escort-monitor-desk', [-7, 0.6, 2.1], [3.8, 1.2, 1.15], 'steel');
  for (const x of [-8.72, -5.28]) k.box('pale', [x, 2.05, 2.17], [0.18, 2.15, 0.18]);
  for (const y of [1.04, 3.06]) k.box('pale', [-7, y, 2.17], [3.6, 0.18, 0.18]);
  k.box('rubber', [-7, 2.05, 2.06], [3.22, 1.82, 0.12]);
  k.label('港务监控 / 远端画面', [-7, 3.48, 2.2], 4.5, 0.43);
  block(k, 'escort-reception-battery', [15, 1.2, -1.5], [3, 2.4, 2], 'steel');
  for (const z of [10, 15]) {
    block(k, `escort-reception-bench-${z}`, [17, 0.43, z], [1.3, 0.86, 3.5], 'pale');
    k.box('white', [17, 0.92, z], [0.55, 0.12, 0.8]);
  }
  const door = new PortKit(); door.root.name = 'escort-loading-door';
  door.box('paint', [-14, 1.8, 15], [0.35, 3.6, 10]);
  for (let z = 10.4; z < 20; z += 0.8) door.box('pale', [-14.22, 1.8, z], [0.08, 3.4, 0.06]);
  door.flush(); k.root.add(door.root);
  k.solid('escort-loading-door', [-14, 1.8, 15], [0.4, 3.6, 10], 0, 'escort-convoy-started');
  const lamp = new PointLight(0xffd9aa, 65, 23, 2); lamp.position.set(3, 4.4, 8); k.root.add(lamp);
  k.label('西货廊 / 护送出口', [-14.3, 4.48, 15], 8, 0.5, -Math.PI / 2);
  return door.root;
}
function shelterRoutes(k: PortKit): void {
  screen(k, 'escort-route-screen-east', [-12, 0, 6], [-231, 0, 6]);
  // An offset overlapping screen makes a protected pedestrian entrance to the change bay.
  // Leave a 14m opening in the main wall, with a 6m deep dogleg on its northern side.
  // The east screen stops at -231 and the west continuation begins at -245.
  screen(k, 'escort-route-screen-west', [-245, 0, 6], [-260, 0, 6]);
  screen(k, 'escort-bay-overlap', [-210, 0, 0], [-267, 0, 0]);
  screen(k, 'escort-route-screen-turn', [-260, 0, 6], [-280, 0, 22]);
  screen(k, 'escort-route-screen-medical', [-280, 0, 22], [-422, 0, 22]);
  for (let x = -22; x > -260; x -= 6) {
    k.box('white', [x, 0.018, 11.1], [3, 0.02, 0.07], [0, 0, 0], false);
    k.box('amber', [x, 0.018, 21], [3, 0.02, 0.07], [0, 0, 0], false);
  }
  for (let x = -282; x > -413; x -= 6) k.box('white', [x, 0.018, 34.8], [3, 0.02, 0.07], [0, 0, 0], false);
  for (const [x, z] of [[-110, 14], [-104, 14], [-238, 14], [-232, 14], [-238, 16.4], [-396, 30], [-390, 30]]) {
    for (const dz of [-0.75, 0.75]) k.box('amber', [x, 0.022, z + dz], [3.2, 0.018, 0.08], [0, 0, 0], false);
  }
  for (const x of [-110, -238]) {
    k.part('arch', 'pale', [x, 4.3, 16], [20, 3.4, 14]);
    k.solid(`escort-wait-canopy-${x}`, [x, 5.15, 16], [20, 1.7, 14]);
    for (const sx of [-9.5, 9.5]) block(k, `escort-wait-leg-${x}-${sx}`, [x + sx, 2.15, 22.4], [0.20, 4.3, 0.20], 'steel');
  }
  k.label('第一桥前等待区', [-110, 3.7, 21.5], 9.5, 0.6, Math.PI);
  k.label('换车湾 / 医疗支路', [-238, 4.3, 21.5], 10, 0.65, Math.PI);
}
function sidePlatform(k: PortKit): void {
  block(k, 'escort-upper-deck', [-153.8, 2.2, -13.5], [20.4, 0.4, 15], 'steel');
  for (const z of [-20.6, -6.4]) for (const x of [-162.5, -145]) block(k, `escort-platform-leg-${x}-${z}`, [x, 1, z], [0.22, 2, 0.22], 'steel');
  for (let i = 0; i < 16; i++) {
    const h = (i + 1) * 0.15, x = -134 - (i + 0.5) * 0.6;
    block(k, `escort-platform-up-${i}`, [x, h / 2, -13], [0.6, h, 4], 'pale');
    k.box('amber', [x + 0.25, h + 0.008, -13], [0.08, 0.015, 3.9], [0, 0, 0], false);
  }
  for (let i = 0; i < 15; i++) {
    const h = (15 - i) * 0.15, x = -164 - (i + 0.5) * 0.6;
    block(k, `escort-platform-down-${i}`, [x, h / 2, -13], [0.6, h, 4], 'pale');
  }
  for (const z of [-21, -6]) {
    block(k, `escort-upper-curb-${z}`, [-153.8, 2.58, z], [20.4, 0.36, 0.16], 'paint');
    k.box('pale', [-153.8, 3.45, z], [20.4, 0.07, 0.07]);
  }
  for (const x of [-164, -143.6]) for (const [a, b] of [[-21, -15.2], [-10.8, -6]]) block(k, `escort-upper-end-${x}-${a}`, [x, 2.58, (a + b) / 2], [0.16, 0.36, b - a], 'paint');
  for (const z of [-15.15, -10.85]) {
    k.beam('pale', [-134, 1.05, z], [-143.6, 3.45, z], 0.075);
    k.beam('pale', [-164, 3.45, z], [-173.6, 1.05, z], 0.075);
  }
  k.located([0, 2.4, 0], 0, () => { k.cover(-151.3, -15, 5); k.cover(-156, -6.8, 3, Math.PI / 2); });
  k.label('桥侧检修台', [-143.3, 3.6, -13], 8, 0.6, Math.PI / 2);
  k.label('西货廊一号桥', [-128, 4.2, 14], 9, 0.7, Math.PI / 2);
}
function industrialFields(k: PortKit): void {
  // Distinct groups frame 30–50m engagements; none occupies an actor's authored station.
  k.workshop(-63, -61, 12, 10); k.workshop(-95, -60, 17, 10);
  k.container(-36, -15, Math.PI / 2); k.container(-75, -15, Math.PI / 2, 'pale');
  k.tractor(-65, -45, 0.6); k.tank(-18, -42, 3.3, 9);
  k.cover(E.cargo[0], E.cargo[2] - 2.5, 7);
  k.cover(E.bridgeHead[0], E.bridgeHead[2] - 2.5, 7);
  k.cover(-91, -6, 5, Math.PI / 2);
  k.workshop(-207, -58, 16, 12); k.tank(-198, -27, 3, 8);
  k.container(-215, -12, Math.PI / 2); k.container(-227, -44, Math.PI / 2, 'pale');
  k.workshop(-265, -60, 18, 10); k.tank(-300, -49, 4, 10);
  k.cover(E.medicalHead[0], E.medicalHead[2] - 2.5, 7);
  k.cover(E.flankPost[0], E.flankPost[2] - 2.5, 7);
  k.cover(-269, -7, 4, Math.PI / 2);
  for (const [x, z] of [[-56, -36], [-108, -28], [-191, -17], [-248, -29], [-287, -18]]) k.cover(x, z, 4.5);
  for (const x of [-61, -227]) {
    block(k, `escort-crane-base-${x}`, [x, 0.6, 38], [5, 1.2, 5], 'steel');
    block(k, `escort-crane-mast-${x}`, [x, 8, 38], [1.6, 14.8, 1.6], 'paint');
    k.beam('pale', [x, 15.3, 38], [x - 24, 13, 15], 0.8);
    k.beam('steel', [x, 10.8, 38], [x - 18, 13.6, 21], 0.36);
    k.cylinder('rubber', [x - 24, 8.8, 15], 0.055, 8.3);
    k.box('amber', [x - 24, 4.5, 15], [0.8, 0.35, 0.8]);
  }
  for (const [i, p] of E.ammo.entries()) {
    block(k, `escort-ammo-${i}`, [p[0] + 1.3, 0.5, p[2]], [1.3, 1, 0.8], 'steel');
    k.box('amber', [p[0] + 1.3, 1.04, p[2]], [1.25, 0.08, 0.75]);
    k.label('补给', [p[0] + 1.3, 1.65, p[2] + 0.43], 1.4, 0.35);
  }
}
function medicalStation(k: PortKit) {
  k.part('arch', 'pale', [-398, 4.6, 36], [44, 7, 30]);
  k.solid('escort-station-roof', [-398, 6.4, 36], [44, 3.6, 30]);
  block(k, 'escort-station-west-wall', [-420, 2.3, 36], [0.5, 4.6, 30], 'paint');
  for (const x of [-418, -378]) for (const z of [23.5, 49]) block(k, `escort-station-leg-${x}-${z}`, [x, 2.3, z], [0.24, 4.6, 0.24], 'steel');
  k.label('旧检修站 / 医疗接收', [-377.8, 4.3, 35], 18, 0.85, Math.PI / 2);
  k.label('第二医疗桥', [-305, 3.5, 30], 8.5, 0.65, Math.PI / 2);
  k.terminal(E.manifest);
  for (const z of [30, 37, 44]) {
    block(k, `escort-station-store-${z}`, [-416, 1.25, z], [3, 2.5, 3.2], 'steel');
    k.box('white', [-414.45, 1.4, z], [0.08, 0.35, 1.8]);
    k.box('white', [-414.44, 1.4, z], [0.08, 1.6, 0.35]);
  }
  for (const x of [-407, -386]) block(k, `escort-station-bench-${x}`, [x, 0.43, 41.5], [5, 0.86, 0.9], 'pale');
  k.label('接防队 / 北闸后线', [-366, 3.2, 48], 9, 0.6, Math.PI);
  block(k, 'escort-change-tray', [-241.1, 0.5, 20.6], [2.2, 1, 1.1], 'pale');
  const pillow = new PortKit(); pillow.root.name = 'escort-patient-pillow';
  pillow.box('white', [-241.1, 1.14, 20.6], [0.65, 0.22, 0.42], [0, 0.14, 0]);
  pillow.box('amber', [-240.5, 1.045, 20.6], [0.15, 0.025, 0.20]); pillow.flush(); k.root.add(pillow.root);
  const lamp = new PointLight(0xffd9aa, 55, 24, 2); lamp.position.set(-398, 4.2, 35); k.root.add(lamp);
  return pillow.root;
}

/** Three contiguous convoy legs cross two physical gullies; all vehicle and patient motion belongs to Simulation. */
export function buildEscort(k: PortKit): SceneDynamics {
  k.root.name = 'S08-west-cargo-escort-placeholder'; terrain(k);
  const door = reception(k); shelterRoutes(k); sidePlatform(k); industrialFields(k); const pillow = medicalStation(k);
  const makeLamp = (name: string, at: Vec3) => {
    const mat = new MeshStandardMaterial({ color: 0x6d8584, emissive: 0x6d8584, emissiveIntensity: 0.25, roughness: 0.45 });
    const mesh = new Mesh(new BoxGeometry(0.20, 0.16, 0.10), mat); mesh.name = name; mesh.position.set(...at); k.root.add(mesh); return mat;
  };
  const wheel = makeLamp('escort-wheel-warning', [-241.1, 1.5, 20.6]);
  const manifest = makeLamp('escort-manifest-ready', [-399.55, 1.8, 38.7]);
  return {
    bounds: E.bounds, update() {},
    setFacts(facts) {
      door.position.z = facts.includes('escort-convoy-started') ? -11 : 0;
      pillow.visible = !facts.includes('escort-pillow-card-preserved');
      const jammed = facts.includes('escort-wheel-jammed') && !facts.includes('escort-patient-transferred');
      wheel.color.setHex(jammed ? 0xffb970 : 0x6d8584); wheel.emissive.copy(wheel.color); wheel.emissiveIntensity = jammed ? 1.5 : 0.25;
      const arrived = facts.includes('escort-manifest-checked');
      manifest.color.setHex(arrived ? 0xb9dec9 : 0x6d8584); manifest.emissive.copy(manifest.color); manifest.emissiveIntensity = arrived ? 1.3 : 0.25;
    },
  };
}
