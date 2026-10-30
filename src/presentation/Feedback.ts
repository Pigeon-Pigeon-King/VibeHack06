import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../contracts';
import type { Projectile } from '../combat/Ballistics';
import { Random } from '../runtime/random';

export class Feedback {
  readonly root = new Group();
  private geometry = new BufferGeometry();
  private positions = new Float32Array(256 * 6);
  private colors = new Float32Array(256 * 6);
  private line = new LineSegments(this.geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 }));
  private sparks = new InstancedMesh(new BoxGeometry(0.055, 0.055, 0.055), new MeshBasicMaterial(), 80);
  private particles: Array<{ position: Vector3; velocity: Vector3; life: number; color: Color }> = [];
  private random = new Random(42);
  private matrix = new Matrix4();
  private quaternion = new Quaternion();
  private scale = new Vector3();
  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    this.line.frustumCulled = false; this.sparks.frustumCulled = false; this.sparks.count = 0;
    this.root.add(this.line, this.sparks);
  }
  impact(point: Vec3, person = false): void {
    for (let i = 0; i < 3 && this.particles.length < 80; i++) this.particles.push({
      position: new Vector3(...point), velocity: new Vector3(this.random.between(-1.8, 1.8), this.random.between(0.6, 2), this.random.between(-1.8, 1.8)),
      life: 0.32, color: new Color(person ? 0xc1c7bb : 0xf3b568),
    });
  }
  update(dt: number, bullets: Projectile[]): void {
    let count = 0;
    for (const bullet of bullets) {
      if (!bullet.tracer || count >= 256) continue;
      const color = new Color(bullet.owner === 'player' ? 0xffe2ad : 0xf5ad76);
      this.positions.set(bullet.previous, count * 6); this.positions.set(bullet.position, count * 6 + 3);
      this.colors.set([color.r, color.g, color.b, color.r, color.g, color.b], count * 6); count++;
    }
    this.geometry.setDrawRange(0, count * 2);
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
    for (const p of this.particles) { p.life -= dt; p.velocity.y -= 1.428 * dt; p.position.addScaledVector(p.velocity, dt); }
    this.particles = this.particles.filter(p => p.life > 0);
    this.sparks.count = this.particles.length;
    this.particles.forEach((p, i) => { this.scale.setScalar(p.life / 0.32); this.matrix.compose(p.position, this.quaternion, this.scale); this.sparks.setMatrixAt(i, this.matrix); this.sparks.setColorAt(i, p.color); });
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }
  clear(): void { this.particles = []; this.sparks.count = 0; this.geometry.setDrawRange(0, 0); }
  dispose(): void { this.geometry.dispose(); this.line.material.dispose(); this.sparks.geometry.dispose(); (this.sparks.material as MeshBasicMaterial).dispose(); }
}
