import { describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Texture, Vector3 } from 'three';
import { ArchitectureTransactions, type ArchitectureAsset, type ArchitecturePlacement, type ModelLease } from '../src/presentation/ArchitectureTransactions';

const basis = { quaternion: [0, 0, 0, 1] as const, description: '+Y up, width X', evidence: 'Known test-source geometry' };
const definition = (id = 'panel'): ArchitectureAsset => ({ id, sourceId: id, semantic: 'wall-panel', basis, materialContract: 'same-node-material-slots', fit: 'bounded-stretch', maxAspectDistortion: 1.35 });
const placement = (id = 'one', assetId = 'panel', extra: Partial<ArchitecturePlacement> = {}): ArchitecturePlacement => ({ id, assetId, semantic: 'wall-panel', position: [0, 0, 0], size: [1, 1, 1], anchor: 'bottom-center', yaw: 0, ...extra });
function source() {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial({ roughness: 0.73, metalness: 0.61, map: new Texture() });
  material.name = 'paint'; const mesh: Mesh = new Mesh(geometry, material); mesh.name = 'Panel'; root.add(mesh);
  const dispose = vi.fn(() => { expect(root.parent).toBeNull(); });
  return { root, geometry, material, mesh, lease: { root, dispose } as ModelLease };
}
function world() { const root = new Group(), old = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); old.name = 'old-wall'; root.add(old); return { root, old }; }
function draws(root: Group) { const result: InstancedMesh[] = []; root.traverse(o => { if (o instanceof InstancedMesh && o.userData.generatedArchitecture) result.push(o); }); return result; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('generated architecture geometry and transforms', () => {
  it('bakes source root/nested transforms, merges bolts by material, preserves UV/PBR, and follows a dynamic parent', async () => {
    const s = source(), extra = new Mesh(s.geometry, s.material); extra.name = 'Bolt'; extra.position.set(2, 1, -1); extra.scale.setScalar(0.25);
    const nested = new Group(); nested.rotation.y = 0.35; nested.position.set(0.3, 0.2, -0.1); nested.add(s.mesh, extra); s.root.add(nested);
    s.root.position.set(3, 2, -1); s.root.rotation.z = 0.2;
    const originalPositions = Array.from(s.geometry.attributes.position.array), originalUV = Array.from(s.geometry.attributes.uv.array);
    const raw: Vector3[] = [], rawUV: number[] = []; s.root.updateMatrixWorld(true);
    s.root.traverseVisible(o => { if (o instanceof Mesh) for (let n = 0; n < o.geometry.index!.count; n++) {
      const i = o.geometry.index!.getX(n); raw.push(new Vector3().fromBufferAttribute(o.geometry.attributes.position, i).applyMatrix4(o.matrixWorld));
      rawUV.push(o.geometry.attributes.uv.getX(i), o.geometry.attributes.uv.getY(i));
    } });
    const q = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0)); raw.forEach(p => p.applyQuaternion(q));
    const box = new Box3().setFromPoints(raw), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
    const { root, old } = world(), movingParent = new Group(); root.add(movingParent); movingParent.position.set(5, 0, 3);
    const a = new ArchitectureTransactions(root, { assets: [{ ...definition(), basis: { ...basis, quaternion: q.toArray() as [number, number, number, number] } }], acquire: async () => s.lease });
    const p = placement('module', 'panel', { position: [1, 2, 3], size: size.toArray() as [number, number, number], anchor: 'center', parent: movingParent });
    expect((await a.replaceMesh('wall', old, [p]).ready).state).toBe('ready');
    const [draw] = draws(root); expect(draws(root)).toHaveLength(1); expect(draw.material).toBe(s.material); expect(draw.geometry).not.toBe(s.geometry);
    expect(Array.from(draw.geometry.attributes.uv.array)).toEqual(rawUV);
    expect(Array.from(s.geometry.attributes.position.array)).toEqual(originalPositions); expect(Array.from(s.geometry.attributes.uv.array)).toEqual(originalUV);
    const matrix = new Matrix4(); draw.getMatrixAt(0, matrix);
    const actual = Array.from({ length: draw.geometry.attributes.position.count }, (_, i) => new Vector3().fromBufferAttribute(draw.geometry.attributes.position, i).applyMatrix4(matrix));
    const expected = raw.map(p => p.clone().sub(center).add(new Vector3(1, 2, 3)));
    expect(actual).toHaveLength(expected.length); actual.forEach((point, i) => expect(point.distanceTo(expected[i])).toBeLessThan(1e-5));
    movingParent.position.set(-5, 4, 9); movingParent.rotation.y = 0.6; root.updateMatrixWorld(true);
    expect(draw.parent!.parent).toBe(movingParent);
    expect(draw.getWorldPosition(new Vector3()).distanceTo(movingParent.getWorldPosition(new Vector3()))).toBeLessThan(1e-7);
    expect(a.coverage().sources[0].sourceMeshes).toBe(2); a.dispose(); expect(s.lease.dispose).toHaveBeenCalledTimes(1);
  });
  it('preserves material-array groups as separate batches without mutating leased geometry or materials', async () => {
    const s = source(), other = new MeshStandardMaterial(); other.name = 'trim';
    const before = s.geometry.clone(); s.mesh.material = [s.material, other];
    for (const [i, group] of s.geometry.groups.entries()) group.materialIndex = i % 2;
    const { root, old } = world(), a = new ArchitectureTransactions(root, { assets: [definition()], acquire: async () => s.lease });
    expect((await a.replaceMesh('wall', old, [placement(), placement('two', 'panel', { position: [4, 0, 0] })]).ready).state).toBe('ready');
    expect(draws(root)).toHaveLength(2); expect(new Set(draws(root).map(d => d.material))).toEqual(new Set([s.material, other]));
    expect(draws(root).reduce((sum, draw) => sum + draw.geometry.attributes.position.count, 0)).toBe(s.geometry.index!.count);
    expect(Array.from(s.geometry.attributes.position.array)).toEqual(Array.from(before.attributes.position.array));
    const materialDispose = vi.spyOn(s.material, 'dispose'), geometryDispose = vi.spyOn(s.geometry, 'dispose');
    a.dispose(); expect(materialDispose).not.toHaveBeenCalled(); expect(geometryDispose).not.toHaveBeenCalled(); before.dispose();
  });
  it('keeps generated LODs at all distances and reuses only LOD0 material/texture', async () => {
    const high = source(), low = source(), { root, old } = world();
    low.geometry.scale(0.7, 0.8, 0.9); low.geometry.translate(0.06, 0.04, 0.02);
    const lowMaterialDispose = vi.spyOn(low.material, 'dispose');
    const a = new ArchitectureTransactions(root, { assets: [{ ...definition(), lods: [{ sourceId: 'low', distance: 10 }] }], acquire: async id => id === 'panel' ? high.lease : low.lease });
    expect((await a.replaceMesh('wall', old, [placement()]).ready).state).toBe('ready');
    const [near, far] = draws(root); expect(near.material).toBe(high.material); expect(far.material).toBe(high.material); expect(far.material).not.toBe(low.material);
    a.update([0, 0, 0]); expect(near.count).toBe(1); expect(far.count).toBe(0);
    const highMatrix = new Matrix4(); near.getMatrixAt(0, highMatrix);
    a.update([1000, 0, 0]); expect(near.count).toBe(0); expect(far.count).toBe(1); expect(old.visible).toBe(false);
    const lowMatrix = new Matrix4(); far.getMatrixAt(0, lowMatrix); expect(lowMatrix.equals(highMatrix)).toBe(true);
    a.update([0, 0, 0]); expect(old.visible).toBe(false); a.dispose(); expect(lowMaterialDispose).not.toHaveBeenCalled();
  });
});

describe('atomic visual replacement and lifecycle', () => {
  it('waits for every source before hiding any target', async () => {
    const { root, old } = world(), second = old.clone(); root.add(second);
    const one = source(), two = source(); let resolve!: (lease: ModelLease) => void;
    const a = new ArchitectureTransactions(root, { assets: [definition(), definition('other')], acquire: async id => id === 'panel' ? one.lease : new Promise(done => { resolve = done; }) });
    const handle = a.replace({ id: 'whole-room', targets: [{ mesh: old }, { mesh: second }], placements: [placement(), placement('second', 'other')] });
    await tick(); expect(old.visible).toBe(true); expect(second.visible).toBe(true); expect(draws(root)).toHaveLength(0);
    resolve(two.lease); expect((await handle.ready).state).toBe('ready'); expect(old.visible).toBe(false); expect(second.visible).toBe(false);
    a.dispose(); expect(old.visible).toBe(true); expect(second.visible).toBe(true);
  });
  it('limits partial batch replacement to explicit indices and reports the uncovered instances', async () => {
    const { root, old } = world(); old.visible = false;
    const batch = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 3); batch.name = 'global-steel'; root.add(batch);
    for (let i = 0; i < 3; i++) batch.setMatrixAt(i, new Matrix4().makeTranslation(i * 3, 0, 0));
    const s = source(), a = new ArchitectureTransactions(root, { assets: [definition()], acquire: async () => s.lease });
    const handle = a.replaceBatch('selected-column', batch, [1], [placement('column', 'panel', { position: [3, 0, 0] })]);
    expect((await handle.ready).state).toBe('ready'); const matrix = new Matrix4();
    batch.getMatrixAt(0, matrix); expect(matrix.equals(new Matrix4())).toBe(true);
    batch.getMatrixAt(1, matrix); expect(matrix.determinant()).toBe(0);
    batch.getMatrixAt(2, matrix); expect(matrix.elements[12]).toBe(6); expect(batch.visible).toBe(true);
    expect(a.coverage().visible.find(v => v.name === 'global-steel')!.uncoveredInstances).toEqual([0, 2]);
    handle.dispose(); batch.getMatrixAt(1, matrix); expect(matrix.equals(new Matrix4().makeTranslation(3, 0, 0))).toBe(true); a.dispose();
  });
  it('rejects a failed source or bad aspect fit atomically and releases successful siblings', async () => {
    const { root, old } = world(), s = source();
    const a = new ArchitectureTransactions(root, { assets: [definition(), definition('bad')], acquire: async id => { if (id === 'bad') throw new Error('missing asset'); return s.lease; } });
    const handle = a.replaceMesh('room', old, [placement(), placement('bad', 'bad')]);
    expect((await handle.ready).state).toBe('error'); await tick(); expect(old.visible).toBe(true); expect(draws(root)).toHaveLength(0); expect(s.lease.dispose).toHaveBeenCalledTimes(1);
    const t = source(), b = new ArchitectureTransactions(root, { assets: [definition()], acquire: async () => t.lease });
    const fit = await b.replaceMesh('bad-fit', old, [placement('wall-not-cube', 'panel', { size: [1, 20, 1] })]).ready;
    expect(fit.state).toBe('error'); expect(fit.error).toContain('measured source'); expect(old.visible).toBe(true);
    expect(b.coverage().visible.some(item => item.name === 'old-wall' && item.status === 'uncovered')).toBe(true); a.dispose(); b.dispose();
  });
  it('detaches and releases a late lease after disposal without changing the fallback', async () => {
    const { root, old } = world(), s = source(), unrelatedParent = new Group(); unrelatedParent.add(s.root);
    let resolve!: (lease: ModelLease) => void;
    const a = new ArchitectureTransactions(root, { assets: [definition()], acquire: () => new Promise(done => { resolve = done; }) });
    const job = a.replaceMesh('wall', old, [placement()]); await tick(); a.dispose(); expect((await job.ready).state).toBe('disposed');
    resolve(s.lease); await tick(); expect(s.root.parent).toBeNull(); expect(s.lease.dispose).toHaveBeenCalledTimes(1); expect(old.visible).toBe(true); expect(draws(root)).toHaveLength(0);
  });
  it('shares one acquisition across jobs and detaches batches before the final lease is released', async () => {
    const { root, old } = world(), second = old.clone(); root.add(second); const s = source();
    const acquire = vi.fn(async () => s.lease); let beforeTreeDispose!: () => void;
    const a = new ArchitectureTransactions(root, { assets: [definition()], acquire, registerDisposer: (_root, callback) => { beforeTreeDispose = callback; return vi.fn(); } });
    const one = a.replaceMesh('one', old, [placement()]), two = a.replaceMesh('two', second, [placement('two')]); await Promise.all([one.ready, two.ready]);
    expect(acquire).toHaveBeenCalledTimes(1); const sharedGeometry = draws(root)[0].geometry, freeGeometry = vi.spyOn(sharedGeometry, 'dispose'), freeMaterial = vi.spyOn(s.material, 'dispose');
    expect(draws(root)[1].geometry).toBe(sharedGeometry);
    one.dispose(); expect(freeGeometry).not.toHaveBeenCalled(); expect(s.lease.dispose).not.toHaveBeenCalled();
    s.lease.dispose = vi.fn(() => { expect(draws(root)).toHaveLength(0); expect(s.root.parent).toBeNull(); });
    beforeTreeDispose(); expect(freeGeometry).toHaveBeenCalledTimes(1); expect(s.lease.dispose).toHaveBeenCalledTimes(1); expect(freeMaterial).not.toHaveBeenCalled();
    beforeTreeDispose(); expect(freeGeometry).toHaveBeenCalledTimes(1);
  });
  it('reports unmapped visuals and requires explicit exceptions for signs/lights or already generated models', () => {
    const { root, old } = world(), sign = old.clone(), existing = old.clone(); sign.name = 'sign'; existing.name = 'already-generated'; root.add(sign, existing);
    const a = new ArchitectureTransactions(root, { assets: [definition()], acquire: async () => source().lease });
    a.declareInformation(sign, 'GUI text overlay'); a.declareExistingGenerated(existing, 'PROP-TANK');
    expect(a.coverage().visible.map(item => item.status)).toEqual(['uncovered', 'information', 'existing-generated']);
    expect(() => a.replaceMesh('bad-semantics', old, [placement('wrong', 'panel', { semantic: 'cargo-container' })])).toThrow('semantic');
    expect(() => a.replace({ id: 'duplicate', targets: [{ mesh: old }, { mesh: old }], placements: [placement()] })).toThrow('Duplicate target'); a.dispose();
  });
});
