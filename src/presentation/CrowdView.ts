import { Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import type { CharacterModel } from '../contracts';
import { createCharacter } from './characters';

const hidden = new Matrix4().makeScale(0, 0, 0);

/** Shares the existing civilian body parts. Population increases instances, not draw calls. */
export class CrowdView {
  readonly root = new Group();
  private readonly prototype = createCharacter('civilian');
  private readonly parts: Mesh[] = [];
  private readonly batches: InstancedMesh[] = [];
  private nextSlot = 0;
  private epoch = 0;
  private disposed = false;

  constructor(private readonly capacity = 64) {
    this.root.name = 'instanced-opening-crowd';
    this.root.userData.assetStatus = 'placeholder';
    this.prototype.root.traverse(object => { if (object instanceof Mesh) this.parts.push(object); });
    for (const part of this.parts) {
      const batch = new InstancedMesh(part.geometry, part.material, capacity);
      batch.name = `crowd-${part.name}`; batch.count = 0;
      batch.instanceMatrix.setUsage(DynamicDrawUsage);
      batch.castShadow = part.castShadow; batch.receiveShadow = part.receiveShadow;
      // Instance positions change with the saved story; avoid stale per-mesh bounds.
      batch.frustumCulled = false;
      this.batches.push(batch); this.root.add(batch);
    }
  }

  create(): CharacterModel {
    if (this.disposed || this.nextSlot >= this.capacity) throw new Error('CrowdView capacity exceeded or disposed');
    const slot = this.nextSlot++, epoch = this.epoch, root = new Group();
    root.name = `crowd-person-${slot}`; root.userData.assetStatus = 'placeholder';
    const tint = new Color([0xffffff, 0xe3eaf3, 0xf0e2ce, 0xe4dded][slot % 4]);
    for (const batch of this.batches) {
      batch.count = this.nextSlot; batch.setMatrixAt(slot, hidden); batch.setColorAt(slot, tint);
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    }
    let released = false;
    return {
      root,
      setPose: pose => {
        if (released || epoch !== this.epoch || this.disposed) return;
        this.prototype.root.position.copy(root.position); this.prototype.root.quaternion.copy(root.quaternion);
        this.prototype.root.scale.copy(root.scale); this.prototype.setPose(pose);
        if (pose.down && pose.fallProgress !== undefined) {
          const f = Math.max(0, Math.min(1, pose.fallProgress)), eased = f * f * (3 - 2 * f);
          const body = this.prototype.root.getObjectByName('pose-root')!;
          body.position.y = 0.24 * eased; body.rotation.x = Math.PI / 2 * eased;
        }
        this.prototype.root.updateMatrixWorld(true);
        this.batches.forEach((batch, i) => {
          batch.setMatrixAt(slot, root.visible ? this.parts[i].matrixWorld : hidden);
          batch.instanceMatrix.needsUpdate = true;
        });
      },
      dispose: () => {
        if (released) return;
        released = true;
        if (epoch !== this.epoch || this.disposed) return;
        for (const batch of this.batches) { batch.setMatrixAt(slot, hidden); batch.instanceMatrix.needsUpdate = true; }
      },
    };
  }

  clear(): void {
    this.epoch++; this.nextSlot = 0;
    this.batches.forEach(batch => { batch.count = 0; });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    this.batches.forEach(batch => batch.dispose());
    this.prototype.dispose(); this.root.clear();
  }
}
