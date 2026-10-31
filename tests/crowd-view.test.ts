import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { CrowdView } from '../src/presentation/CrowdView';

const pose = { walk: 0, aiming: false, down: false };
const position = (mesh: InstancedMesh, slot: number) => {
  const matrix = new Matrix4(); mesh.getMatrixAt(slot, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
};

describe('opening crowd render batches', () => {
  it('renders 44 independently posed people with shared body-part batches', () => {
    const crowd = new CrowdView();
    try {
      const people = Array.from({ length: 44 }, (_, i) => {
        const person = crowd.create(); person.root.position.set(i * 0.8, 0, i % 6); person.setPose(pose); return person;
      });
      const batches = crowd.root.children as InstancedMesh[];
      expect(batches.length).toBeLessThanOrEqual(10);
      expect(batches.every(batch => batch.isInstancedMesh && batch.count === 44)).toBe(true);
      const head = batches.find(batch => batch.name === 'crowd-head-face-and-headwear')!;
      expect(position(head, 0).x).toBeCloseTo(0);
      expect(position(head, 43).x).toBeCloseTo(34.4);
      people[0].root.position.x = -8; people[0].setPose({ ...pose, walk: 1 });
      expect(position(head, 0).x).toBeCloseTo(-8);
      expect(position(head, 43).x).toBeCloseTo(34.4);
    } finally { crowd.dispose(); }
  });

  it('keeps falls continuous and reconstructs the same saved intermediate pose', () => {
    const crowd = new CrowdView();
    try {
      const person = crowd.create();
      const head = crowd.root.getObjectByName('crowd-head-face-and-headwear') as InstancedMesh;
      person.setPose({ ...pose, down: true, fallProgress: 0 }); const standing = position(head, 0).y;
      person.setPose({ ...pose, down: true, fallProgress: 0.5 }); const middle = position(head, 0).y;
      person.setPose({ ...pose, down: true, fallProgress: 1 }); const fallen = position(head, 0).y;
      expect(standing).toBeGreaterThan(middle); expect(middle).toBeGreaterThan(fallen);
      expect(fallen).toBeCloseTo(0.24);
      const restored = crowd.create(); restored.setPose({ ...pose, down: true, fallProgress: 0.5 });
      expect(position(head, 1).y).toBeCloseTo(middle);
    } finally { crowd.dispose(); }
  });

  it('removes hidden or disposed slots and invalidates old handles on reload', () => {
    const crowd = new CrowdView();
    try {
      const old = crowd.create(); old.root.visible = false; old.setPose(pose);
      const batch = crowd.root.children[0] as InstancedMesh, matrix = new Matrix4();
      batch.getMatrixAt(0, matrix); expect(matrix.determinant()).toBe(0);
      crowd.clear(); const current = crowd.create(); current.root.position.x = 9; current.setPose(pose);
      old.dispose(); old.setPose(pose);
      expect(position(batch, 0).x).toBeCloseTo(9);
      current.dispose(); batch.getMatrixAt(0, matrix); expect(matrix.determinant()).toBe(0);
    } finally { crowd.dispose(); crowd.dispose(); }
  });
});
