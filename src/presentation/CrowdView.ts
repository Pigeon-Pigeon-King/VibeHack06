import { Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import type { CharacterModel } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CharacterIdentity } from '../assets/character-catalog';
import { createCharacter } from './characters';
import { ImportedCharacter, type CharacterLoadStatus } from './ImportedCharacter';

const hidden = new Matrix4().makeScale(0, 0, 0);
export interface CrowdAssets { library: ModelLibrary; baseURL: string }

/** Production people share GLB resources; an unconfigured preview keeps the small instanced fallback. */
export class CrowdView {
  readonly root = new Group();
  private readonly prototype = createCharacter('civilian');
  private readonly parts: Mesh[] = [];
  private readonly batches: InstancedMesh[] = [];
  private nextSlot = 0;
  private epoch = 0;
  private disposed = false;
  private readonly imported = new Set<ImportedCharacter>();
  private readonly statuses = new Map<number, CharacterLoadStatus['state']>();

  constructor(private readonly capacity = 64, private readonly assets?: CrowdAssets) {
    this.root.name = assets ? 'imported-opening-crowd' : 'instanced-opening-crowd';
    this.root.userData.assetStatus = assets ? 'empty' : 'placeholder';
    if (assets) return;
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

  create(identity?: CharacterIdentity, onStatus: (status: CharacterLoadStatus) => void = () => {}): CharacterModel {
    if (this.disposed || this.nextSlot >= this.capacity) throw new Error('CrowdView capacity exceeded or disposed');
    const slot = this.nextSlot++, epoch = this.epoch;
    if (this.assets) {
      const person = new ImportedCharacter(this.assets.library, identity ?? { id: `civilian-${slot}`, name: '撤离居民', role: 'civilian' }, this.assets.baseURL, status => {
        if (this.disposed || epoch !== this.epoch) return;
        this.statuses.set(slot, status.state);
        const values = [...this.statuses.values()];
        this.root.userData.assetStatus = values.includes('error') ? 'error' : values.every(state => state === 'ready') ? 'ready' : 'loading';
        this.root.userData.population = { total: this.nextSlot, ready: values.filter(state => state === 'ready').length };
        onStatus(status);
      });
      this.imported.add(person);
      return person;
    }
    const root = new Group();
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
    for (const person of this.imported) person.dispose();
    this.imported.clear(); this.statuses.clear();
    this.root.userData.assetStatus = this.assets ? 'empty' : 'placeholder';
    this.root.userData.population = { total: 0, ready: 0 };
    this.batches.forEach(batch => { batch.count = 0; });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    this.batches.forEach(batch => batch.dispose());
    this.prototype.dispose(); this.root.clear();
  }
}
