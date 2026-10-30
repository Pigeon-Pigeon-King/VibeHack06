import { Group } from 'three';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';
import type { Vec3 } from '../contracts';

/** World-anchored first-person contact proxy, not a camera-facing HUD prop. */
export class CareView {
  readonly root = new Group();
  private readonly legs = new Group();
  private readonly hands = new Group();
  private readonly strap = new Group();
  constructor() {
    const material = characterMaterial(); this.root.name = 'first-person-care-placeholder';
    this.root.add(this.legs, this.hands); this.legs.add(this.strap);
    for (const x of [-0.18, 0.18]) {
      new VertexParts().box([0.22, 0.22, 0.58], [x, 0.52, -0.32], 0x36454c)
        .box([0.19, 0.45, 0.20], [x, 0.29, -0.61], 0x36454c)
        .box([0.22, 0.14, 0.37], [x, 0.10, -0.70], 0x26353b)
        .mesh(this.legs, material, 'seated-leg');
      new VertexParts().box([0.15, 0.16, 0.55], [x * 1.4, 0.95, -0.42], 0x56696c)
        .box([0.14, 0.11, 0.16], [x * 1.4, 0.89, -0.72], 0xc49977)
        .mesh(this.hands, material, 'transfer-hand');
    }
    new VertexParts().box([0.26, 0.12, 0.28], [-0.18, 0.61, -0.55], 0x83949a)
      .box([0.28, 0.045, 0.31], [-0.18, 0.57, -0.55], 0x26353b)
      .mesh(this.legs, material, 'knee-brace');
    this.strap.position.set(-0.18, 0.52, -0.55);
    new VertexParts().box([0.30, 0.055, 0.27], [0, 0, 0], 0xc6b077).mesh(this.strap, material, 'brace-lower-strap');
  }
  update(position: Vec3, yaw: number, mode: 'seat' | 'transfer' | 'none', progress: number, adjusted: boolean): void {
    this.root.visible = mode !== 'none'; this.root.position.set(...position); this.root.rotation.y = yaw;
    this.legs.visible = mode === 'seat'; this.hands.visible = mode === 'transfer';
    this.hands.position.y = mode === 'transfer' ? Math.sin(Math.PI * Math.min(1, progress)) * 0.13 : 0;
    this.strap.position.z = -0.55 - (adjusted ? 0.09 : Math.min(1, progress) * 0.09);
    this.strap.rotation.z = adjusted ? -0.12 : -0.12 * Math.min(1, progress);
  }
  dispose(): void { disposeModelTree(this.root); }
}
