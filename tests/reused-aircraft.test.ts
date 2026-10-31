import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BufferGeometry, Group, Material, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createReusedAircraft, type ReusedAircraft } from '../src/presentation/reused-aircraft';

const owned: ReusedAircraft[] = [];
function aircraft(): ReusedAircraft { const value = createReusedAircraft(); owned.push(value); return value; }
function meshes(root: Group): Mesh<BufferGeometry, MeshStandardMaterial>[] {
  const result: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  root.traverse(object => { if (object instanceof Mesh) result.push(object); });
  return result;
}
function mesh(root: Group, name: string): Mesh<BufferGeometry, MeshStandardMaterial> {
  return root.getObjectByName(`${name}-geometry`) as Mesh<BufferGeometry, MeshStandardMaterial>;
}
function vertex(root: Group, name: string): Vector3 {
  const object = mesh(root, name);
  return new Vector3().fromBufferAttribute(object.geometry.getAttribute('position'), 0).applyMatrix4(object.matrixWorld);
}
function visibleBounds(root: Group): Box3 {
  const result = new Box3(); root.updateMatrixWorld(true);
  root.traverseVisible(object => { if (object instanceof Mesh) result.union(new Box3().setFromObject(object, true)); });
  return result;
}
afterEach(() => { for (const value of owned.splice(0)) value.dispose(); vi.restoreAllMocks(); });

describe('retained VTOL aircraft source and geometry', () => {
  it('keeps the selected numeric source, code palette and corresponding-source archive unchanged', () => {
    const hashes = [
      ['../src/presentation/reused-aircraft/f35b-source.js', 'ec554326e57f5ef3f36748af7030b2d7503da828dddf6a10ad7da5415e3de8f2'],
      ['../src/presentation/reused-aircraft/f35b-palette.js', 'ef795d52e8dc70e47b84224557384eb30cbbaeb079d2b023808bfc199d8035ae'],
      ['../assets/source/reused-aircraft/vtol-f35b/f35b-source.zip', 'd2f47f7ebf313b8337f655580d4076258878405a757c49e9e28efab046c6c12b'],
      ['../assets/source/reused-aircraft/vtol-f35b/F35B-GPL-3.0.txt', '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'],
    ];
    for (const [path, expected] of hashes) {
      expect(createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex')).toBe(expected);
    }
  });

  it('retains all 80 mesh parts and verifies every GPU vertex against its retained source coordinate', () => {
    const value = aircraft(), parts = meshes(value.root);
    let corners = 0, maximumError = 0;
    expect(parts).toHaveLength(80);
    expect(new Set(parts.map(part => part.geometry)).size).toBe(80);
    for (const part of parts) {
      const parent = part.parent!;
      const source = parent.userData.sourceNode as { vertices: number[][]; surfaces: { refs: number[][] }[] };
      const matrix = parent.userData.bindSourceMatrix as Matrix4;
      const indices = part.geometry.userData.sourceVertexIndices as number[];
      const positions = part.geometry.getAttribute('position');
      expect(indices).toHaveLength(positions.count);
      expect(part.geometry.getAttribute('normal').count).toBe(positions.count);
      expect(part.geometry.getAttribute('uv').count).toBe(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const original = new Vector3().fromArray(source.vertices[indices[i]]).applyMatrix4(matrix);
        const expected = new Vector3(-original.z, original.y, original.x);
        maximumError = Math.max(maximumError, expected.distanceTo(new Vector3().fromBufferAttribute(positions, i)));
      }
      corners += positions.count;
    }
    expect(corners / 3).toBe(36_613);
    expect(maximumError).toBeLessThan(0.000001);
    expect(value.root.userData.sourceRevision).toBe('2726b3bdf3c7c54ea09a5d4a248e86a739604ca7');
    expect(value.root.userData.sourceLicense).toBe('GPL-3.0');
  });

  it('reports the real aircraft scale and retains distinct material roles without texture dependencies', () => {
    const value = aircraft(); value.setFlightState({ thrust: 0.7, gear: 0, tilt: 0 });
    const visible: Mesh[] = [];
    value.root.traverseVisible(object => { if (object instanceof Mesh) visible.push(object); });
    expect(visible).toHaveLength(79);
    expect(visible.reduce((sum, object) => sum + object.geometry.getAttribute('position').count / 3, 0)).toBe(35_753);
    const size = visibleBounds(value.root).getSize(new Vector3());
    expect(size.x).toBeCloseTo(11.05188, 4); expect(size.y).toBeCloseTo(3.75336, 4); expect(size.z).toBeCloseTo(17.15326, 4);
    const materials = new Set(meshes(value.root).map(object => object.material));
    expect(materials.size).toBe(11);
    for (const material of materials) expect(Object.values(material).filter(item => item?.isTexture)).toHaveLength(0);
    expect(mesh(value.root, 'canopy').material).toMatchObject({ roughness: 0.16, metalness: 0.6, transparent: true, opacity: 0.4 });
    expect(mesh(value.root, 'fuselage').material).toMatchObject({ roughness: 0.62, metalness: 0.22 });
    expect(mesh(value.root, 'wheel.F').material).not.toBe(mesh(value.root, 'canopy').material);
    expect(meshes(value.root).every(object => !object.castShadow)).toBe(true);
  });
});

describe('retained VTOL mechanisms', () => {
  it('moves actual nozzle, lift-door and wheel vertices continuously through the original conversion sequence', () => {
    const value = aircraft(), names = ['NozzlePetal.014', 'door fan', 'wheel.F'];
    const start = names.map(name => vertex(value.root, name));
    value.setFlightState({ thrust: 1, gear: 1, tilt: 0.5 });
    expect(value.root.userData.mechanical.nozzleAngle).toBe(0);
    expect(value.root.userData.mechanical.liftDoor).toBeCloseTo(80 * Math.PI / 180);
    value.setFlightState({ thrust: 1, gear: 1, tilt: 1 });
    expect(value.root.userData.mechanical.nozzleAngle).toBeCloseTo(95 * Math.PI / 180);
    names.forEach((name, index) => expect(vertex(value.root, name).distanceTo(start[index])).toBeGreaterThan(0.5));
    expect(visibleBounds(value.root).getSize(new Vector3()).y).toBeCloseTo(5.15442, 4);

    let previous: Vector3[] | undefined;
    for (let i = 0; i <= 400; i++) {
      const progress = i <= 200 ? i / 200 : (400 - i) / 200;
      value.setFlightState({ thrust: 0.7, gear: progress, tilt: progress });
      const current = names.map(name => vertex(value.root, name));
      if (previous) current.forEach((point, index) => expect(point.distanceTo(previous![index])).toBeLessThan(0.08));
      previous = current;
    }
    names.forEach((name, index) => expect(vertex(value.root, name).distanceTo(start[index])).toBeLessThan(1e-10));
  });

  it('uses the host clock for the original lift fan and has deterministic paused states', () => {
    const value = aircraft();
    value.setFlightState({ thrust: 0.8, gear: 1, tilt: 1, timeSeconds: 0.1 });
    const first = vertex(value.root, 'fan');
    for (let i = 0; i < 10; i++) value.setFlightState({ thrust: 0.8, gear: 1, tilt: 1, timeSeconds: 0.1 });
    expect(vertex(value.root, 'fan').distanceTo(first)).toBe(0);
    value.setFlightState({ thrust: 0.8, gear: 1, tilt: 1, timeSeconds: 0.11 });
    expect(vertex(value.root, 'fan').distanceTo(first)).toBeGreaterThan(0.001);
    value.setFlightState({ thrust: 0, gear: 1, tilt: 1, timeSeconds: 0.11 });
    const stopped = vertex(value.root, 'fan');
    value.setFlightState({ thrust: 0, gear: 1, tilt: 1, timeSeconds: 99 });
    expect(vertex(value.root, 'fan').distanceTo(stopped)).toBe(0);
    expect(value.root.getObjectByName('ReheatL')!.visible).toBe(false);
    const throttleOff = vertex(value.root, 'throttle');
    value.setFlightState({ thrust: 1, gear: 1, tilt: 1 });
    expect(vertex(value.root, 'throttle').distanceTo(throttleOff)).toBeGreaterThan(0.1);
    expect(mesh(value.root, 'ReheatL').material.emissiveIntensity).toBe(1.5);
  });

  it('clamps values, rejects non-finite inputs and does not move the aircraft root', () => {
    const value = aircraft(); value.root.position.set(4, 20, -15); value.root.rotation.y = 0.3;
    value.setFlightState({ thrust: 2, gear: -1, tilt: 5, timeSeconds: -10 });
    expect(value.root.userData.flightState).toEqual({ thrust: 1, gear: 0, tilt: 1, timeSeconds: 0 });
    value.setFlightState({ thrust: NaN, gear: Infinity, tilt: -Infinity, timeSeconds: NaN });
    expect(value.root.userData.flightState).toEqual({ thrust: 0, gear: 0, tilt: 0, timeSeconds: 0 });
    value.root.traverse(object => expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    expect(value.root.position.toArray()).toEqual([4, 20, -15]); expect(value.root.rotation.y).toBe(0.3);
  });
});

describe('reused aircraft instance ownership', () => {
  it('shares retained geometry, isolates mechanisms and per-aircraft thrust, and frees only the last owner', () => {
    const one = aircraft(), two = aircraft(), parent = new Group(); parent.add(one.root, two.root);
    const firstMeshes = meshes(one.root), secondMeshes = meshes(two.root);
    const sharedGeometry = new Set(firstMeshes.map(object => object.geometry));
    const sharedMaterial = new Set<Material>();
    for (let i = 0; i < firstMeshes.length; i++) {
      expect(firstMeshes[i].geometry).toBe(secondMeshes[i].geometry);
      if (firstMeshes[i].name !== 'ReheatL-geometry') {
        expect(firstMeshes[i].material).toBe(secondMeshes[i].material); sharedMaterial.add(firstMeshes[i].material);
      }
    }
    const releaseGeometry = [...sharedGeometry].map(geometry => vi.spyOn(geometry, 'dispose'));
    const releaseMaterial = [...sharedMaterial].map(material => vi.spyOn(material, 'dispose'));
    const exhaustOne = vi.spyOn(mesh(one.root, 'ReheatL').material, 'dispose');
    const exhaustTwo = vi.spyOn(mesh(two.root, 'ReheatL').material, 'dispose');
    const unchanged = vertex(two.root, 'wheel.F');
    one.setFlightState({ thrust: 1, gear: 1, tilt: 1, timeSeconds: 0.2 });
    expect(vertex(two.root, 'wheel.F').distanceTo(unchanged)).toBe(0);
    expect(mesh(two.root, 'ReheatL').material.emissiveIntensity).toBe(0);
    const stoppedState = one.root.userData.flightState;
    one.dispose(); one.dispose(); one.root.userData.dispose();
    one.setFlightState({ thrust: 0.1, gear: 0.1, tilt: 0.1 });
    expect(one.root.userData.flightState).toBe(stoppedState);
    expect(one.root.parent).toBeNull(); expect(one.root.children).toHaveLength(0);
    expect(two.root.parent).toBe(parent); expect(exhaustOne).toHaveBeenCalledTimes(1); expect(exhaustTwo).not.toHaveBeenCalled();
    for (const spy of [...releaseGeometry, ...releaseMaterial]) expect(spy).not.toHaveBeenCalled();
    two.setFlightState({ thrust: 0.4, gear: 1, tilt: 1 });
    expect(vertex(two.root, 'wheel.F').distanceTo(unchanged)).toBeGreaterThan(0.5);
    two.dispose(); two.dispose();
    expect(exhaustTwo).toHaveBeenCalledTimes(1);
    for (const spy of [...releaseGeometry, ...releaseMaterial]) expect(spy).toHaveBeenCalledTimes(1);
    const next = aircraft(); expect(mesh(next.root, 'fuselage').geometry).not.toBe(firstMeshes.find(object => object.name === 'fuselage-geometry')!.geometry);
    // This deliberately rebuilds the complete retained model after final release.
    // It is a resource ownership check, not a wall-clock rendering benchmark.
  }, 60_000);
});
