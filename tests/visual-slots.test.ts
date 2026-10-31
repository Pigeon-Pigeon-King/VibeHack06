import { describe, expect, it } from 'vitest';
import { Box3, InstancedMesh } from 'three';
import { PortKit } from '../src/presentation/port-kit';
import { disposeModelTree } from '../src/presentation/model-tools';

describe('replaceable industrial visuals', () => {
  it('keeps collider IDs, serials and located transforms when a prop gains its own visual root', () => {
    const plain = new PortKit(), slotted = new PortKit();
    for (const [kit, separate] of [[plain, false], [slotted, true]] as const) {
      kit.cover(2, 4);
      kit.located([13, 0, -9], 0.6, () => {
        if (separate) kit.visualSlot('tank', child => child.tank(3, 5, 2, 7));
        else kit.tank(3, 5, 2, 7);
      });
      kit.container(-10, 12);
      kit.flush();
    }
    try {
      expect(slotted.solids).toEqual(plain.solids);
      expect(new Box3().setFromObject(slotted.root)).toEqual(new Box3().setFromObject(plain.root));
      const slot = slotted.root.getObjectByName('generated-fallback:tank')!;
      const before = structuredClone(slotted.solids);
      slot.visible = false;
      expect(slotted.solids).toEqual(before);
      expect(slotted.root.children.some(child => child instanceof InstancedMesh && child.visible)).toBe(true);
    } finally { disposeModelTree(plain.root); disposeModelTree(slotted.root); }
  });

  it('shares static GPU resources without merging the replaceable instance batches', () => {
    const kit = new PortKit();
    kit.box('steel', [0, 1, 0], [1, 1, 1]);
    const slot = kit.visualSlot('console', child => child.box('steel', [5, 1, 0], [2, 1, 1]));
    kit.flush();
    try {
      const parentMesh = kit.root.children.find(child => child instanceof InstancedMesh) as InstancedMesh;
      const slotMesh = slot.children.find(child => child instanceof InstancedMesh) as InstancedMesh;
      expect(slotMesh).not.toBe(parentMesh);
      expect(slotMesh.geometry).toBe(parentMesh.geometry);
      expect(slotMesh.material).toBe(parentMesh.material);
      expect(() => kit.visualSlot('console', () => {})).toThrow('Duplicate visual slot');
    } finally { disposeModelTree(kit.root); }
  });
});
