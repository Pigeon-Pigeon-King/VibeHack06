import { Group, Vector3 } from 'three';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';
import type { Vec3 } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { CharacterIdentity } from '../assets/character-catalog';
import { FirstPersonArms, type FirstPersonArmsStatus } from './FirstPersonArms';
import { FirstPersonSeatedLegs } from './FirstPersonSeatedLegs';

/** World-anchored body contacts. The simulation still owns every care/transfer fact and transform. */
export class CareView {
  readonly root = new Group();
  private readonly legs = new Group();
  private readonly hands = new Group();
  private readonly fallbackLegs = new Group();
  private readonly fallbackHands = new Group();
  private readonly strap = new Group();
  private readonly arms: FirstPersonArms;
  private readonly seatedLegs: FirstPersonSeatedLegs;
  private disposed = false;
  constructor(library: ModelLibrary, onStatus: (part: 'arms' | 'legs', status: FirstPersonArmsStatus) => void = () => {}) {
    const material = characterMaterial(); this.root.name = 'first-person-care'; this.root.visible = false;
    this.legs.name = 'care-seated-legs'; this.hands.name = 'care-transfer-hands';
    this.fallbackLegs.name = 'care-seated-legs-placeholder'; this.fallbackHands.name = 'care-transfer-hands-placeholder';
    this.root.add(this.legs, this.hands); this.legs.add(this.fallbackLegs); this.hands.add(this.fallbackHands); this.fallbackLegs.add(this.strap);
    for (const x of [-0.18, 0.18]) {
      new VertexParts().box([0.22, 0.22, 0.58], [x, 0.52, -0.32], 0x36454c)
        .box([0.19, 0.45, 0.20], [x, 0.29, -0.61], 0x36454c)
        .box([0.22, 0.14, 0.37], [x, 0.10, -0.70], 0x26353b)
        .mesh(this.fallbackLegs, material, 'seated-leg');
      new VertexParts().box([0.15, 0.16, 0.55], [x * 1.4, 0.95, -0.42], 0x56696c)
        .box([0.14, 0.11, 0.16], [x * 1.4, 0.89, -0.72], 0xc49977)
        .mesh(this.fallbackHands, material, 'transfer-hand');
    }
    new VertexParts().box([0.26, 0.12, 0.28], [-0.18, 0.61, -0.55], 0x83949a)
      .box([0.28, 0.045, 0.31], [-0.18, 0.57, -0.55], 0x26353b)
      .mesh(this.fallbackLegs, material, 'knee-brace');
    this.strap.position.set(-0.18, 0.52, -0.55);
    new VertexParts().box([0.30, 0.055, 0.27], [0, 0, 0], 0xc6b077).mesh(this.strap, material, 'brace-lower-strap');
    this.arms = new FirstPersonArms(library, status => {
      this.fallbackHands.visible = status.state !== 'ready'; this.root.userData.armsStatus = status.state;
      onStatus('arms', status);
    });
    this.seatedLegs = new FirstPersonSeatedLegs(library, status => {
      this.fallbackLegs.visible = status.state !== 'ready'; this.root.userData.legsStatus = status.state;
      onStatus('legs', status);
    });
    this.hands.add(this.arms.root); this.legs.add(this.seatedLegs.root);
    this.arms.setPose({ leftSupport: new Vector3(-.252, .89, -.72), rightGrip: new Vector3(.252, .89, -.72),
      reloadFraction: 0, layout: 'carry', leftHandDirection: new Vector3(.25, -.8, -.5), rightHandDirection: new Vector3(-.25, -.8, -.5) });
  }

  get ready(): Promise<void> { return Promise.all([this.arms.ready, this.seatedLegs.ready]).then(() => {}); }
  get status(): { arms: FirstPersonArmsStatus; legs: FirstPersonArmsStatus } { return { arms: this.arms.status, legs: this.seatedLegs.status }; }
  setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void> {
    this.root.userData.identity = { ...identity };
    return Promise.all([this.arms.setCharacter(identity, baseURL), this.seatedLegs.setCharacter(identity, baseURL)]).then(() => {});
  }
  retry(): Promise<void> { return Promise.all([this.arms.retry(), this.seatedLegs.retry()]).then(() => {}); }
  update(position: Vec3, yaw: number, mode: 'seat' | 'transfer' | 'none', progress: number, adjusted: boolean): void {
    if (this.disposed) return;
    const at = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    this.root.visible = mode !== 'none'; this.root.position.set(...position); this.root.rotation.y = yaw;
    this.legs.visible = mode === 'seat'; this.hands.visible = mode === 'transfer';
    this.hands.position.y = mode === 'transfer' ? Math.sin(Math.PI * at) * 0.13 : 0;
    this.strap.position.z = -0.55 - (adjusted ? 0.09 : at * 0.09);
    this.strap.rotation.z = adjusted ? -0.12 : -0.12 * at;
    if (mode === 'seat') this.seatedLegs.setPose(at, adjusted);
    this.root.userData.contactState = { mode, progress: at, adjusted, visualAcceptance: 'NOT_REVIEWED' };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.arms.dispose(); this.seatedLegs.dispose();
    disposeModelTree(this.root);
  }
}
