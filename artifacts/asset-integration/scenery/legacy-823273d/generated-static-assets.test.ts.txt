import { describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Texture, Vector3 } from 'three';
import { GeneratedAssetSlot, generatedAssetUrl, type StaticAssetLoader } from '../src/presentation/generated-static-assets';
import { PortKit } from '../src/presentation/port-kit';
import { disposeModelTree } from '../src/presentation/model-tools';
import { buildFrontGate } from '../src/presentation/frontgate-environment';
import { buildMedical } from '../src/presentation/medical-environment';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function template(size: [number, number, number] = [1, 1, 1]) {
  const root = new Group(), geometry = new BoxGeometry(...size), map = new Texture();
  const close = vi.fn(); map.image = { width: 1, height: 1, close };
  const material = new MeshStandardMaterial({ map }); root.add(new Mesh(geometry, material));
  return { root, geometry, material, map, close,
    freeGeometry: vi.spyOn(geometry, 'dispose'), freeMaterial: vi.spyOn(material, 'dispose'), freeMap: vi.spyOn(map, 'dispose') };
}
function renderDistance(root: Group, at: [number, number, number]) {
  const camera = new PerspectiveCamera(); camera.position.set(...at); camera.updateMatrixWorld(true); root.updateMatrixWorld(true);
  root.traverse(node => { if (node instanceof GeneratedAssetSlot) node.update(camera); });
}
function simple(kit: PortKit, x = 0) {
  return kit.asset('PROP-TANK', { position: [x, 0, 0], size: [2, 2, 2] }, () => kit.box('steel', [x, 1, 0], [2, 2, 2]))!;
}

describe('generated static visuals stay separate from the authored world', () => {
  it('loads only near the camera, switches only after success, and keeps unrelated primitive batches visible', async () => {
    const source = template(), loader = vi.fn<StaticAssetLoader>().mockResolvedValue(source.root);
    const kit = new PortKit({ generatedAssets: { loader } });
    kit.box('steel', [20, 1, 0], [2, 2, 2]); const slot = simple(kit); kit.flush();
    const unrelated = kit.root.children.find(node => node instanceof InstancedMesh)!;
    renderDistance(kit.root, [500, 0, 0]); await settle(); expect(loader).not.toHaveBeenCalled();
    renderDistance(kit.root, [0, 2, 0]); expect(slot.fallback.visible).toBe(true); expect(slot.detail.visible).toBe(false);
    await settle(); renderDistance(kit.root, [0, 2, 0]);
    expect(loader).toHaveBeenCalledTimes(1); expect(slot.detail.visible).toBe(true); expect(slot.fallback.visible).toBe(false);
    expect(unrelated.visible).toBe(true); expect(slot.fallback.children[0]).not.toBe(unrelated);
    const bounds = new Box3().setFromObject(slot.detail);
    expect(bounds.getSize(new Vector3()).toArray()).toEqual([2, 2, 2]); expect(bounds.min.y).toBeCloseTo(0);
    renderDistance(kit.root, [100, 0, 0]); expect(slot.detail.visible).toBe(false); expect(slot.fallback.visible).toBe(true);
    disposeModelTree(kit.root);
  });
  it('shares one source within a tree, but never across two scene trees; resources release once', async () => {
    const source = template(), secondSource = template();
    const loader = vi.fn<StaticAssetLoader>().mockResolvedValueOnce(source.root).mockResolvedValueOnce(secondSource.root);
    const a = new PortKit({ generatedAssets: { loader } }), b = new PortKit({ generatedAssets: { loader } });
    const first = simple(a), second = simple(a, 4); simple(b); a.flush(); b.flush();
    renderDistance(a.root, [0, 2, 0]); await settle(); renderDistance(a.root, [0, 2, 0]);
    expect(loader).toHaveBeenCalledTimes(1);
    const firstMesh = first.detail.getObjectByProperty('isMesh', true) as Mesh;
    const secondMesh = second.detail.getObjectByProperty('isMesh', true) as Mesh;
    expect(firstMesh).not.toBe(secondMesh); expect(firstMesh.geometry).toBe(secondMesh.geometry); expect(firstMesh.material).toBe(secondMesh.material);
    renderDistance(b.root, [0, 2, 0]); await settle(); expect(loader).toHaveBeenCalledTimes(2);
    disposeModelTree(a.root); disposeModelTree(a.root);
    expect(source.freeGeometry).toHaveBeenCalledTimes(1); expect(source.freeMaterial).toHaveBeenCalledTimes(1);
    expect(source.freeMap).toHaveBeenCalledTimes(1); expect(source.close).toHaveBeenCalledTimes(1);
    expect(secondSource.freeGeometry).not.toHaveBeenCalled(); disposeModelTree(b.root);
  });
  it('keeps the fallback after a failed download and does not retry every frame', async () => {
    const loader = vi.fn<StaticAssetLoader>().mockRejectedValue(new Error('unavailable'));
    const kit = new PortKit({ generatedAssets: { loader } }), slot = simple(kit); kit.flush();
    renderDistance(kit.root, [0, 0, 0]); await settle();
    for (let n = 0; n < 5; n++) renderDistance(kit.root, [0, 0, 0]);
    expect(loader).toHaveBeenCalledTimes(1); expect(slot.userData.loadState).toBe('error');
    expect(slot.fallback.visible).toBe(true); expect(slot.detail.visible).toBe(false); disposeModelTree(kit.root);
  });
  it('aborts scene requests and disposes a late successful parse without attaching it', async () => {
    let resolve!: (root: Group) => void; let signal!: AbortSignal;
    const source = template();
    const loader: StaticAssetLoader = (_url, current) => { signal = current; return new Promise(done => { resolve = done; }); };
    const kit = new PortKit({ generatedAssets: { loader } }); simple(kit); kit.flush();
    renderDistance(kit.root, [0, 0, 0]); await settle(); disposeModelTree(kit.root);
    expect(signal.aborted).toBe(true); resolve(source.root); await settle();
    expect(kit.root.children).toHaveLength(0); expect(source.root.parent).toBeNull();
    expect(source.freeGeometry).toHaveBeenCalledTimes(1); expect(source.freeMap).toHaveBeenCalledTimes(1);
  });
  it('preserves located transforms for fallback, model placement and collision separately', async () => {
    const source = template(), loader = vi.fn<StaticAssetLoader>().mockResolvedValue(source.root);
    const kit = new PortKit({ generatedAssets: { loader } }); let slot!: GeneratedAssetSlot;
    kit.located([10, 0, 20], Math.PI / 2, () => {
      slot = kit.asset('PROP-TANK', { position: [2, 0, 3], size: [2, 2, 2], yaw: 0.25 }, () => {
        kit.box('steel', [2, 1, 3], [2, 2, 2]); kit.solid('fixed-contact', [2, 1, 3], [2, 2, 2]);
      })!;
    });
    kit.flush(); kit.root.updateMatrixWorld(true);
    expect(slot.getWorldPosition(new Vector3()).toArray()).toEqual([13, 0, 18]);
    const mesh = slot.fallback.children[0] as InstancedMesh, matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    const center = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
    expect(center.x).toBeCloseTo(13); expect(center.y).toBeCloseTo(1); expect(center.z).toBeCloseTo(18);
    expect(kit.solids[0].position).toEqual([13, 1, 18]); expect(kit.solids[0].rotationY).toBeCloseTo(Math.PI / 2);
    renderDistance(kit.root, [13, 2, 18]); await settle(); renderDistance(kit.root, [13, 2, 18]);
    expect(slot.loaded).toBe(true);
    const expected = new Matrix4().makeRotationY(Math.PI / 2 + 0.25).setPosition(13, 0, 18);
    slot.matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]));
    disposeModelTree(kit.root);
  });
  it('preserves solid IDs, order, sizes and routes with visual slots enabled', () => {
    const enabled = new PortKit(), plain = new PortKit({ generatedAssets: false });
    for (const kit of [enabled, plain]) {
      kit.tank(1, 2); kit.tractor(4, 5, 0.3); kit.light(6, 7); kit.cover(0, 0); kit.container(8, 9); kit.terminal([10, 0, 11]); kit.flush();
    }
    expect(enabled.solids).toEqual(plain.solids);
    expect(enabled.solids.map(s => s.id)).toEqual(['tank-0', 'tractor-1', 'cover-2', 'container-3', 'terminal-4']);
    expect(enabled.solids[1]).toEqual({ id: 'tractor-1', position: [4, 1.35, 5], size: [2.65, 2.7, 4.35], rotationY: 0.3 });
    disposeModelTree(enabled.root); disposeModelTree(plain.root);
    for (const build of [buildFrontGate, buildMedical]) {
      const a = new PortKit(), b = new PortKit({ generatedAssets: false }); build(a); build(b); a.flush(); b.flush();
      expect(a.solids).toEqual(b.solids);
      if (build === buildFrontGate) expect(a.root.getObjectByName('front-east-warning')).toBeDefined();
      else expect(a.root.getObjectByName('medical-treatment-curtain')).toBeDefined();
      disposeModelTree(a.root); disposeModelTree(b.root);
    }
  });
  it('limits nearby detailed lamps and reuses the source as the camera moves', async () => {
    const source = template([0.458, 1, 0.188]), loader = vi.fn<StaticAssetLoader>().mockResolvedValue(source.root);
    const kit = new PortKit({ generatedAssets: { loader } }); for (const x of [0, 2, 4, 6]) kit.light(x, 0, 5);
    kit.flush(); renderDistance(kit.root, [0, 2, 0]); await settle(); renderDistance(kit.root, [0, 2, 0]);
    const slots = kit.root.children.filter(node => node instanceof GeneratedAssetSlot) as GeneratedAssetSlot[];
    expect(slots.filter(slot => slot.detail.visible)).toHaveLength(3); expect(slots[3].detail.visible).toBe(false);
    renderDistance(kit.root, [6, 2, 0]); expect(slots[0].fallback.visible).toBe(true); expect(slots[3].detail.visible).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1); disposeModelTree(kit.root);
  });
  it('rejects excessive aspect distortion and leaves the authored fallback visible', async () => {
    const source = template([1, 10, 1]), loader = vi.fn<StaticAssetLoader>().mockResolvedValue(source.root);
    const kit = new PortKit({ generatedAssets: { loader } }), slot = simple(kit); kit.flush();
    renderDistance(kit.root, [0, 0, 0]); await settle(); renderDistance(kit.root, [0, 0, 0]);
    expect(slot.userData.loadState).toBe('fit-rejected'); expect(slot.fallback.visible).toBe(true); expect(slot.loaded).toBe(false);
    disposeModelTree(kit.root); expect(source.freeGeometry).toHaveBeenCalledTimes(1);
  });
  it('resolves Vite subpaths and packaged URLs without requiring a DOM', () => {
    expect(generatedAssetUrl('PROP-TANK', '/demo/', 'https://example.test/demo/index.html')).toBe('https://example.test/demo/assets/generated/production-20261031/PROP-TANK.glb');
    expect(generatedAssetUrl('PROP-TANK', './', 'game://local/index.html')).toBe('game://local/assets/generated/production-20261031/PROP-TANK.glb');
    expect(generatedAssetUrl('PROP-TANK', '/')).toBe('/assets/generated/production-20261031/PROP-TANK.glb');
  });
});
