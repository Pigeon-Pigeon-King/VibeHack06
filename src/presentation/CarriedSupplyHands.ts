import { Group, Vector3 } from 'three';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CharacterIdentity } from '../assets/character-catalog';
import { FirstPersonArms, type FirstPersonArmsStatus } from './FirstPersonArms';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';

/** Add this stable root to the existing carried box; the box/controller still owns motion and visibility. */
export class CarriedSupplyHands {
  readonly root = new Group();
  private readonly fallback = new Group();
  private readonly arms: FirstPersonArms;
  private disposed = false;

  constructor(library: ModelLibrary, onStatus: (status: FirstPersonArmsStatus) => void = () => {}) {
    this.root.name = 'carried-supply-hands'; this.fallback.name = 'carried-supply-hands-placeholder';
    const material = characterMaterial();
    for (const side of [-1, 1]) {
      new VertexParts().box([.13, .12, .20], [side * .34, -.02, .035], 0xc49977)
        .box([.15, .15, .35], [side * .40, -.08, .24], 0x56696c).mesh(this.fallback, material, `supply-hand-placeholder:${side}`);
    }
    this.arms = new FirstPersonArms(library, status => {
      this.fallback.visible = status.state !== 'ready';
      this.root.userData.assetStatus = status.state; this.root.userData.assetId = status.assetId;
      onStatus(status);
    });
    this.root.add(this.fallback, this.arms.root);
    this.arms.setPose({ leftSupport: new Vector3(-.34, -.02, .035), rightGrip: new Vector3(.34, -.02, .035),
      reloadFraction: 0, layout: 'carry', leftHandDirection: new Vector3(0, -1, -.3), rightHandDirection: new Vector3(0, -1, -.3) });
  }

  get ready(): Promise<void> { return this.arms.ready; }
  get status(): FirstPersonArmsStatus { return this.arms.status; }
  setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void> { return this.arms.setCharacter(identity, baseURL); }
  retry(): Promise<void> { return this.arms.retry(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.arms.dispose(); disposeModelTree(this.fallback); this.root.removeFromParent(); this.root.clear();
  }
}
