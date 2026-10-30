import {
  BoxGeometry, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DataTexture,
  DirectionalLight, Euler, ExtrudeGeometry, Group, HemisphereLight,
  InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, PointLight, Quaternion, RepeatWrapping, RGBAFormat, Shape,
  SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import type { EnvironmentModel, ScenarioId, SolidSpec, Vec3 } from '../contracts';
import { LAYOUT } from '../content/layout';
import { disposeModelTree } from './model-tools';

type Surface = 'steel' | 'paint' | 'pale' | 'concrete' | 'rubber' | 'amber' | 'white' | 'glass' | 'signal' | 'ice';
type Primitive = 'box' | 'cylinder' | 'cone' | 'elbow' | 'arch';
const PALETTE: Record<Surface, number> = {
  steel: 0x394a53, paint: 0x456a77, pale: 0x829692, concrete: 0x8b9796,
  rubber: 0x27343a, amber: 0xc5a165, white: 0xd6dbcf, glass: 0x25434e,
  signal: 0xffd394, ice: 0xb6c7c6,
};

function archGeometry(): ExtrudeGeometry {
  const shape = new Shape();
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI - i * Math.PI / 20;
    const x = Math.cos(a) * 0.5; const y = Math.sin(a) * 0.5;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = 0; i <= 20; i++) {
    const a = i * Math.PI / 20;
    shape.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

/** Static props share primitive geometry and instance batches, including repeated fine detail. */
class PortKit {
  readonly root = new Group();
  readonly solids: SolidSpec[] = [];
  private materials = new Map<Surface, MeshStandardMaterial>();
  private geometries = new Map<Primitive, BufferGeometry>();
  private batches = new Map<string, { geometry: BufferGeometry; material: MeshStandardMaterial; matrices: Matrix4[]; shadows: boolean }>();
  private serial = 0;
  private origin = new Matrix4();

  constructor() {
    this.root.name = 'industrial-port-placeholder';
    this.root.userData.assetStatus = 'placeholder';
  }
  material(surface: Surface): MeshStandardMaterial {
    let material = this.materials.get(surface);
    if (!material) {
      material = new MeshStandardMaterial({ color: PALETTE[surface], roughness: surface === 'glass' ? 0.3 : 0.8, metalness: ['steel', 'paint', 'pale'].includes(surface) ? 0.33 : 0.06 });
      if (surface === 'signal') { material.emissive.setHex(PALETTE.signal); material.emissiveIntensity = 1.1; }
      if (surface === 'glass') { material.emissive.setHex(0x31515d); material.emissiveIntensity = 0.25; }
      if (surface === 'ice') material.flatShading = true;
      this.materials.set(surface, material);
    }
    return material;
  }
  shape(kind: Primitive): BufferGeometry {
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      geometry = kind === 'cylinder' ? new CylinderGeometry(1, 1, 1, 12) : kind === 'cone' ? new ConeGeometry(1, 1, 5) : kind === 'elbow' ? new TorusGeometry(1, 0.13, 6, 14, Math.PI / 2) : kind === 'arch' ? archGeometry() : new BoxGeometry(1, 1, 1);
      this.geometries.set(kind, geometry);
    }
    return geometry;
  }
  part(kind: Primitive, surface: Surface, at: Vec3, size: Vec3, rotation: Vec3 = [0, 0, 0], shadows = true): void {
    const matrix = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...size));
    matrix.premultiply(this.origin);
    const key = `${kind}-${surface}-${shadows}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { geometry: this.shape(kind), material: this.material(surface), matrices: [], shadows };
      this.batches.set(key, batch);
    }
    batch.matrices.push(matrix);
  }
  box(surface: Surface, at: Vec3, size: Vec3, rotation: Vec3 = [0, 0, 0], shadows = true): void {
    this.part('box', surface, at, size, rotation, shadows);
  }
  cylinder(surface: Surface, at: Vec3, radius: number, height: number, rotation: Vec3 = [0, 0, 0]): void {
    this.part('cylinder', surface, at, [radius, height, radius], rotation);
  }
  beam(surface: Surface, from: Vec3, to: Vec3, width: number): void {
    const a = new Vector3(...from); const b = new Vector3(...to);
    const d = b.clone().sub(a);
    const rot = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
    this.box(surface, a.add(b).multiplyScalar(0.5).toArray() as Vec3, [width, d.length(), width], [rot.x, rot.y, rot.z]);
  }
  solid(id: string, at: Vec3, size: Vec3, yaw = 0): void {
    const position = new Vector3(...at).applyMatrix4(this.origin);
    const originYaw = new Euler().setFromRotationMatrix(this.origin, 'YXZ').y;
    this.solids.push({ id, position: position.toArray() as Vec3, size, rotationY: yaw + originYaw });
  }
  located(at: Vec3, yaw: number, build: () => void): void {
    const old = this.origin;
    this.origin = old.clone().multiply(new Matrix4().makeRotationY(yaw).setPosition(...at));
    build();
    this.origin = old;
  }
  label(text: string, at: Vec3, width: number, height: number, yaw = 0): void {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#253c49'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#d7dacc'; ctx.fillRect(24, 26, 9, 204);
    ctx.font = '600 96px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 520, 132, 920);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh.name = `sign-${text}`;
    mesh.position.set(...at); mesh.rotation.y = yaw;
    mesh.applyMatrix4(this.origin);
    this.root.add(mesh);
  }
  cover(x: number, z: number, length = 4, yaw = 0): void {
    const id = `cover-${this.serial++}`;
    this.located([x, 0, z], yaw, () => {
      this.box('concrete', [0, 0.55, 0], [length, 1.1, 0.82]);
      this.box('pale', [0, 1.09, 0], [length + 0.06, 0.10, 0.90]);
      this.box('rubber', [0, 0.15, 0], [length + 0.18, 0.30, 1.05]);
      for (let x = -length / 2 + 0.22; x < length / 2; x += 0.55) this.box('amber', [x, 0.82, 0.421], [0.20, 0.30, 0.012], [0, 0, -0.35], false);
      this.solid(id, [0, 0.60, 0], [length + 0.18, 1.20, 1.05]);
    });
  }
  container(x: number, z: number, yaw = 0, surface: Surface = 'paint'): void {
    const id = `container-${this.serial++}`;
    this.located([x, 0, z], yaw, () => {
      this.box(surface, [0, 1.32, 0], [2.8, 2.64, 6.5]);
      for (let z = -3.05; z <= 3.05; z += 0.34) {
        this.box('pale', [-1.42, 1.35, z], [0.06, 2.42, 0.065]);
        this.box('pale', [1.42, 1.35, z], [0.06, 2.42, 0.065]);
      }
      for (const x of [-1.31, 1.31]) {
        this.box('steel', [x, 1.32, 3.30], [0.10, 2.64, 0.08]);
        this.box('steel', [x, 1.32, -3.30], [0.10, 2.64, 0.08]);
      }
      this.box('steel', [0, 1.32, 3.30], [0.055, 2.62, 0.08]);
      for (const x of [-0.55, 0.55]) this.box('pale', [x, 1.27, 3.36], [0.045, 2.20, 0.06]);
      this.box('amber', [0, 2.38, 3.36], [1.60, 0.14, 0.02], [0, 0, 0], false);
      this.solid(id, [0, 1.34, 0], [2.90, 2.68, 6.70]);
    });
  }
  workshop(x: number, z: number, width = 10, depth = 10): void {
    const id = `workshop-${this.serial++}`;
    this.located([x, 0, z], 0, () => {
      this.box('paint', [0, 2.6, 0], [width, 5.2, depth]);
      this.box('steel', [0, 5.27, 0], [width + 0.5, 0.20, depth + 0.5]);
      this.box('pale', [0, 1.0, depth / 2 + 0.025], [width, 0.20, 0.05]);
      this.box('rubber', [0, 1.75, depth / 2 + 0.04], [width * 0.45, 3.50, 0.08]);
      for (let i = 0; i < 9; i++) this.box('pale', [0, 0.25 + i * 0.36, depth / 2 + 0.10], [width * 0.44, 0.045, 0.04]);
      for (const sx of [-0.36, 0.36]) {
        this.box('glass', [width * sx, 3.6, depth / 2 + 0.08], [width * 0.17, 0.95, 0.09]);
        this.box('steel', [width * sx, 3.6, depth / 2 + 0.14], [0.06, 1.0, 0.04]);
      }
      this.box('signal', [0, 4.18, depth / 2 + 0.32], [2.2, 0.08, 0.12], [0, 0, 0], false);
      this.box('pale', [width * 0.24, 5.8, -depth * 0.20], [2.3, 1.0, 2]);
      for (let x = -0.8; x <= 0.8; x += 0.30) this.box('steel', [width * 0.24 + x, 5.80, -depth * 0.20 + 1.02], [0.10, 0.70, 0.05]);
      this.solid(id, [0, 2.7, 0], [width, 5.4, depth]);
    });
  }
  tank(x: number, z: number, radius = 2.2, height = 6): void {
    const id = `tank-${this.serial++}`;
    this.located([x, 0, z], 0, () => {
      this.cylinder('pale', [0, height / 2 + 0.4, 0], radius, height);
      for (const y of [0.48, height * 0.5 + 0.4, height + 0.35]) this.cylinder('steel', [0, y, 0], radius + 0.09, 0.12);
      this.cylinder('steel', [0, height + 0.75, 0], 0.30, 0.70);
      this.box('concrete', [0, 0.2, 0], [radius * 2.5, 0.40, radius * 2.5]);
      this.cylinder('amber', [radius + 0.35, 2.6, 0], 0.13, 4.5);
      for (let y = 0.6; y < height; y += 0.42) this.box('steel', [-0.65, y, radius + 0.09], [0.60, 0.05, 0.13]);
      this.solid(id, [0, height / 2 + 0.2, 0], [radius * 2.15, height + 0.4, radius * 2.15]);
    });
  }
  tractor(x: number, z: number, yaw = 0): void {
    const id = `tractor-${this.serial++}`;
    this.located([x, 0, z], yaw, () => {
      this.box('steel', [0, 0.67, 0], [2.3, 0.55, 4.1]);
      this.box('amber', [0, 1.35, -1.0], [2.2, 0.85, 1.8]);
      this.box('pale', [0, 1.9, 0.5], [2.0, 1.7, 1.8]);
      this.box('glass', [0, 2.18, -0.42], [1.65, 0.76, 0.05], [-0.12, 0, 0]);
      this.box('steel', [0, 2.78, 0.5], [2.18, 0.15, 2.0]);
      this.box('glass', [-1.02, 2.1, 0.44], [0.05, 0.85, 1.40]);
      this.box('glass', [1.02, 2.1, 0.44], [0.05, 0.85, 1.40]);
      for (const sx of [-1.17, 1.17]) for (const sz of [-1.24, 1.25]) {
        this.cylinder('rubber', [sx, 0.58, sz], 0.58, 0.32, [0, 0, Math.PI / 2]);
        this.cylinder('pale', [sx * 1.08, 0.58, sz], 0.28, 0.045, [0, 0, Math.PI / 2]);
      }
      for (const x of [-0.75, 0.75]) this.box('signal', [x, 1.36, -1.93], [0.25, 0.18, 0.05]);
      this.box('rubber', [0, 0.67, -2.18], [2.3, 0.25, 0.20]);
      this.box('steel', [0.7, 3.05, 0.6], [0.08, 0.5, 0.08]);
      this.box('amber', [0.7, 3.32, 0.6], [0.20, 0.15, 0.20]);
      this.solid(id, [0, 1.35, 0], [2.65, 2.70, 4.35]);
    });
  }
  terminal(at: Vec3): void {
    const id = `terminal-${this.serial++}`;
    this.located([at[0] + 1.45, 0, at[2] - 0.30], 0, () => {
      this.box('steel', [0, 0.55, 0], [0.85, 1.1, 0.65]);
      this.box('pale', [0, 1.18, 0.03], [1.1, 0.30, 0.90], [-0.20, 0, 0]);
      this.box('glass', [0, 1.36, -0.16], [0.83, 0.55, 0.12], [-0.22, 0, 0]);
      this.box('signal', [0, 1.39, -0.079], [0.66, 0.10, 0.012], [-0.22, 0, 0], false);
      this.box('white', [-0.28, 1.30, 0.21], [0.18, 0.04, 0.24], [-0.20, 0, 0], false);
      this.cylinder('signal', [0.32, 1.29, 0.30], 0.055, 0.035);
      this.solid(id, [0, 0.77, 0], [1.1, 1.54, 0.90]);
    });
    this.box('amber', [at[0], 0.018, at[2] + 0.2], [1.25, 0.018, 0.08], [0, 0, 0], false);
  }
  light(x: number, z: number, height = 5.5): void {
    this.cylinder('steel', [x, height / 2, z], 0.075, height);
    this.box('steel', [x + 0.50, height, z], [1.1, 0.08, 0.09]);
    this.box('signal', [x + 0.85, height - 0.09, z], [0.60, 0.07, 0.28], [0, 0, 0], false);
  }
  flush(): void {
    for (const [name, batch] of this.batches) {
      const mesh = new InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      mesh.name = `static-${name}`;
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = batch.shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.batches.clear();
  }
}

function ground(root: Group): void {
  const edge = 128;
  const bytes = new Uint8Array(edge * edge * 4);
  let seed = 70841;
  for (let y = 0; y < edge; y++) for (let x = 0; x < edge; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const seam = x < 2 || y < 2;
    const variation = ((seed >>> 25) / 128 - 0.5) * 16 - (seam ? 11 : 0);
    const at = (y * edge + x) * 4;
    bytes[at] = 96 + variation; bytes[at + 1] = 106 + variation; bytes[at + 2] = 108 + variation; bytes[at + 3] = 255;
  }
  const texture = new DataTexture(bytes, edge, edge, RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(15, 19); texture.needsUpdate = true;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.98, metalness: 0.03 });
  const mesh = new Mesh(new BoxGeometry(60, 0.4, 76), material);
  mesh.position.set(0, -0.2, -4); mesh.receiveShadow = true; mesh.name = 'port-ground'; root.add(mesh);
}

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
  ground(kit.root);
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
  siteBase(kit);
  if (scenario === 'northgate') northGate(kit);
  else if (scenario === 'prologue') prologueHall(kit);
  else handoverSite(kit);
  kit.flush();
  const sky = addJupiter(kit.root);
  const hemisphere = new HemisphereLight(0xc5dbe5, 0x45515d, 1.75);
  const key = new DirectionalLight(0xe5edf0, 2.45);
  key.position.set(-36, 64, -22); key.target.position.set(0, 0, -3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -42; key.shadow.camera.right = 42;
  key.shadow.camera.top = 42; key.shadow.camera.bottom = -42;
  key.shadow.camera.near = 1; key.shadow.camera.far = 155;
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.035;
  const workLight = new PointLight(0xffca83, 22, 12, 2);
  const anchor = LAYOUT[scenario].terminal;
  workLight.position.set(anchor[0] + 1.45, 3.1, anchor[2]);
  kit.root.add(hemisphere, key, key.target, workLight);
  let disposed = false;
  return {
    root: kit.root,
    solids: kit.solids,
    update(_time, cameraPosition) {
      // Translation only. Turning the camera never turns the celestial direction.
      sky.position.copy(cameraPosition);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      key.shadow.dispose();
      disposeModelTree(kit.root);
    },
  };
}
