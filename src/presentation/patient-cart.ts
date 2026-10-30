import { Group } from 'three';
import type { CharacterModel } from '../contracts';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';

/** Replaceable transfer proxy: one occupied bed and its attached orderly. */
export function createPatientCart(): CharacterModel {
  const root = new Group(); root.name = 'patient-cart-placeholder';
  root.userData.assetStatus = 'placeholder'; root.userData.forward = '+Z';
  const material = characterMaterial();
  new VertexParts()
    .box([0.82, 0.12, 2.18], [0, 0.64, 0], 0x74898c)
    .box([0.74, 0.10, 2.02], [0, 0.75, 0], 0xd7d9cd)
    .box([0.58, 0.23, 1.30], [0, 0.91, -0.15], 0x87a3a3)
    .box([0.30, 0.30, 0.30], [0, 0.96, 0.76], 0xc49977)
    .box([0.48, 0.10, 0.38], [0, 0.83, 0.79], 0xe3e1cf)
    .box([0.05, 0.29, 1.60], [-0.41, 0.90, 0], 0x788f96)
    .box([0.05, 0.29, 1.60], [0.41, 0.90, 0], 0x788f96)
    .box([0.78, 0.05, 0.05], [0, 1.03, -1.13], 0x788f96)
    .mesh(root, material, 'occupied-bed');
  const wheels: Group[] = [];
  for (const x of [-0.34, 0.34]) for (const z of [-0.80, 0.80]) {
    new VertexParts().box([0.045, 0.42, 0.045], [x, 0.40, z], 0x788f96).mesh(root, material, 'leg');
    const pivot = new Group(); pivot.position.set(x, 0.15, z); root.add(pivot);
    new VertexParts().cylinder(0.15, 0.10, [0, 0, 0], 0x28373d, [0, 0, Math.PI / 2])
      .box([0.11, 0.035, 0.23], [0, 0, 0], 0x788f96).mesh(pivot, material, 'wheel');
    wheels.push(pivot);
  }
  // The orderly belongs to this contact rig, not an independently drifting NPC.
  const orderly = new Group(); orderly.position.z = -1.45; root.add(orderly);
  new VertexParts().box([0.42, 0.59, 0.28], [0, 1.10, 0], 0xc3c9c2)
    .box([0.30, 0.30, 0.30], [0, 1.60, 0], 0xc49977)
    .box([0.32, 0.09, 0.32], [0, 1.75, 0], 0xe3e1cf)
    .box([0.14, 0.16, 0.36], [-0.28, 1.10, 0.16], 0xc3c9c2)
    .box([0.14, 0.16, 0.36], [0.28, 1.10, 0.16], 0xc3c9c2)
    .box([0.12, 0.13, 0.12], [-0.28, 1.05, 0.32], 0xc49977)
    .box([0.12, 0.13, 0.12], [0.28, 1.05, 0.32], 0xc49977)
    .mesh(orderly, material, 'orderly-upper-body');
  const legs: Group[] = [];
  for (const x of [-0.12, 0.12]) {
    const leg = new Group(); leg.position.set(x, 0.80, 0); orderly.add(leg);
    new VertexParts().box([0.16, 0.67, 0.18], [0, -0.34, 0], 0x36454c)
      .box([0.18, 0.12, 0.28], [0, -0.73, 0.04], 0x25333a).mesh(leg, material, 'orderly-leg');
    legs.push(leg);
  }
  let disposed = false;
  return { root, setPose({ walk }) {
    wheels.forEach(w => w.rotation.x = walk / 0.6);
    legs.forEach((leg, i) => leg.rotation.x = Math.sin(walk) * 0.3 * (i ? -1 : 1));
  }, dispose() { if (!disposed) { disposed = true; disposeModelTree(root); } } };
}
