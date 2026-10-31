import {
  BoxGeometry, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DataTexture,
  Euler, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Quaternion, RepeatWrapping, RGBAFormat,
  Shape, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import type { SolidSpec, Vec3 } from '../contracts';
import { GeneratedStaticAssets, type GeneratedAssetSlot, type GeneratedStaticAssetId, type GeneratedStaticOptions, type StaticAssetPlacement } from './generated-static-assets';

export type Surface = 'steel' | 'paint' | 'pale' | 'concrete' | 'rubber' | 'amber' | 'white' | 'glass' | 'signal' | 'ice';
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
export class PortKit {
  readonly root = new Group();
  readonly solids: SolidSpec[] = [];
  private materials = new Map<Surface, MeshStandardMaterial>();
  private geometries = new Map<Primitive, BufferGeometry>();
  private batches = new Map<string, { name: string; parent: Group; geometry: BufferGeometry; material: MeshStandardMaterial; matrices: Matrix4[]; shadows: boolean }>();
  private serial = 0;
  private origin = new Matrix4();
  private visualTarget = this.root;
  private visualScope = 0;
  private visualSerial = 0;
  private readonly generated?: GeneratedStaticAssets;

  constructor(options: { generatedAssets?: false | GeneratedStaticOptions } = {}) {
    this.root.name = 'industrial-port-placeholder';
    this.root.userData.assetStatus = 'placeholder';
    if (options.generatedAssets !== false) this.generated = new GeneratedStaticAssets(this.root, options.generatedAssets);
  }
  /** Capture only this slot's visual primitives. solid()/serial/located remain unchanged. */
  asset(id: GeneratedStaticAssetId, placement: StaticAssetPlacement, buildFallback: () => void): GeneratedAssetSlot | undefined {
    if (!this.generated) { buildFallback(); return undefined; }
    const matrix = this.origin.clone().multiply(new Matrix4().makeRotationY(placement.yaw ?? 0).setPosition(...placement.position));
    const slot = this.generated.add(id, placement, matrix);
    // Existing builders emit origin-transformed matrices. Cancel the slot transform for their fallback.
    slot.fallback.matrixAutoUpdate = false; slot.fallback.matrix.copy(matrix).invert();
    const previousTarget = this.visualTarget, previousScope = this.visualScope;
    this.visualTarget = slot.fallback; this.visualScope = ++this.visualSerial;
    try { buildFallback(); } finally { this.visualTarget = previousTarget; this.visualScope = previousScope; }
    return slot;
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
    const name = `${kind}-${surface}-${shadows}`, key = `${this.visualScope}:${name}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { name, parent: this.visualTarget, geometry: this.shape(kind), material: this.material(surface), matrices: [], shadows };
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
  solid(id: string, at: Vec3, size: Vec3, yaw = 0, openFact?: string): void {
    const position = new Vector3(...at).applyMatrix4(this.origin);
    const originYaw = new Euler().setFromRotationMatrix(this.origin, 'YXZ').y;
    this.solids.push({ id, position: position.toArray() as Vec3, size, rotationY: yaw + originYaw, ...(openFact ? { openFact } : {}) });
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
    this.visualTarget.add(mesh);
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
    this.asset('PROP-TANK', { instanceId: id, position: [x, 0, z], size: [radius * 2.15, height + 0.4, radius * 2.15] }, () => {
    this.located([x, 0, z], 0, () => {
      this.cylinder('pale', [0, height / 2 + 0.4, 0], radius, height);
      for (const y of [0.48, height * 0.5 + 0.4, height + 0.35]) this.cylinder('steel', [0, y, 0], radius + 0.09, 0.12);
      this.cylinder('steel', [0, height + 0.75, 0], 0.30, 0.70);
      this.box('concrete', [0, 0.2, 0], [radius * 2.5, 0.40, radius * 2.5]);
      this.cylinder('amber', [radius + 0.35, 2.6, 0], 0.13, 4.5);
      for (let y = 0.6; y < height; y += 0.42) this.box('steel', [-0.65, y, radius + 0.09], [0.60, 0.05, 0.13]);
      this.solid(id, [0, height / 2 + 0.2, 0], [radius * 2.15, height + 0.4, radius * 2.15]);
    });
    });
  }
  tractor(x: number, z: number, yaw = 0): void {
    const id = `tractor-${this.serial++}`;
    this.asset('PROP-VEH-TUG', { instanceId: id, position: [x, 0, z], size: [2.65, 2.70, 4.35], yaw }, () => {
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
    this.asset('ENV-LIGHTKIT-POLE', { position: [x, 0, z], size: [height * 0.458, height, height * 0.188] }, () => {
    this.cylinder('steel', [x, height / 2, z], 0.075, height);
    this.box('steel', [x + 0.50, height, z], [1.1, 0.08, 0.09]);
    this.box('signal', [x + 0.85, height - 0.09, z], [0.60, 0.07, 0.28], [0, 0, 0], false);
    });
  }
  flush(): void {
    for (const batch of this.batches.values()) {
      const mesh = new InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      mesh.name = `static-${batch.name}`;
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = batch.shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      batch.parent.add(mesh);
    }
    this.batches.clear();
  }
}

export interface SceneBounds { minX: number; maxX: number; minZ: number; maxZ: number }

export function addGround(root: Group, bounds: SceneBounds = { minX: -30, maxX: 30, minZ: -42, maxZ: 34 }): void {
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
  texture.repeat.set((bounds.maxX - bounds.minX) / 4, (bounds.maxZ - bounds.minZ) / 4); texture.needsUpdate = true;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.98, metalness: 0.03 });
  const mesh = new Mesh(new BoxGeometry(bounds.maxX - bounds.minX, 0.4, bounds.maxZ - bounds.minZ), material);
  mesh.position.set((bounds.minX + bounds.maxX) / 2, -0.2, (bounds.minZ + bounds.maxZ) / 2); mesh.receiveShadow = true; mesh.name = 'port-ground'; root.add(mesh);
}

