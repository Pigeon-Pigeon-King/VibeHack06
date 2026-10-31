import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Box3, Group, Raycaster, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { ImportedPatientCart, patientIdentity } from '../src/presentation/ImportedPatientCart';
import { characterAssetFor } from '../src/assets/character-catalog';
import { DepartureMonitor } from '../src/presentation/DepartureMonitor';

const baseURL = 'https://example.invalid/';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
const own = <T extends { dispose(): void }>(owner: T): T => { cleanup.push(() => owner.dispose()); return owner; };
async function template(source: ModelSource): Promise<ModelTemplate> {
  const bytes = readFileSync(new URL(`../public${new URL(source.url).pathname}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
const patientBounds = (root: Group): Box3 => {
  root.updateMatrixWorld(true); const result = new Box3(), v = new Vector3();
  root.traverseVisible(o => { if (o instanceof SkinnedMesh) for (let n = 0; n < o.geometry.attributes.position.count; n++) result.expandByPoint(o.getVertexPosition(n, v).applyMatrix4(o.matrixWorld)); });
  return result;
};

describe('production cart with independent production people', () => {
  it('loads the off-world monitor character, vehicle, independent doors and background from production sources', async () => {
    const library = own(new ModelLibrary(template)), view = own(new DepartureMonitor(library, baseURL));
    await view.ready;
    const coverage = view.screen.userData.assetCoverage;
    expect(coverage.character).toBe('ready');
    expect(coverage.props).toHaveLength(3);
    expect(coverage.props.every((p: { state: string }) => p.state === 'ready')).toBe(true);
    expect(coverage.architecture).toHaveLength(2);
    expect(coverage.architecture.every((p: { state: string }) => p.state === 'ready')).toBe(true);
    expect(view.assetErrors.size).toBe(0);
  });

  it('reports a failed monitor-only model instead of silently showing its old whitebox vehicle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = own(new ModelLibrary(async source => {
      if (source.id === 'PROP-VEH-TRANSPORT') throw new Error('monitor source unavailable');
      return template(source);
    }));
    const view = own(new DepartureMonitor(library, baseURL)); await view.ready;
    expect(view.assetErrors).toContain('prop:monitor-transport');
  });
  it.each(['meng', 'zhou'])('retains %s identity after the actor becomes a patient', async id => {
    const library = own(new ModelLibrary(template));
    const view = own(new ImportedPatientCart(library, { id, name: `${id === 'meng' ? '孟齐' : '周延'} · 救治中`, role: 'cart' }, baseURL, undefined, 'medical'));
    await view.ready;
    expect(view.root.userData.assetStatus).toBe('ready');
    expect(view.root.userData.assembly.patient).toBe(id === 'meng' ? 'CH-MENG' : 'CH-ZHOU');
    expect(view.root.getObjectByName('patient-cart-placeholder')!.visible).toBe(false);
    view.setPose({ walk: 0, aiming: false, down: false, occupied: true, orderly: false });
    const patient = view.root.getObjectByName('supine-patient') as Group;
    const before = patientBounds(patient), head = patient.getObjectByName('Head') as Bone;
    expect(before.getSize(new Vector3()).z).toBeGreaterThan(1.3);
    expect(before.getSize(new Vector3()).y).toBeLessThan(1);
    expect(head.getWorldPosition(new Vector3()).z).toBeGreaterThan(.2);
    view.setPose({ walk: 0, aiming: false, down: false, occupied: true, patientOffset: [1.7, .12, 0], orderly: false });
    const after = patientBounds(patient);
    expect(after.min.x - before.min.x).toBeCloseTo(1.7, 5);
    expect(after.min.y - before.min.y).toBeCloseTo(.12, 5);
    view.setPose({ walk: 0, aiming: false, down: false, occupied: false, damaged: true });
    expect(view.root.getObjectByName('patient-transfer-offset')!.visible).toBe(false);
    expect(view.root.getObjectByName('generated-cart-orderly')!.visible).toBe(false);
  });

  it('uses a produced stretcher for rescue and omits the duplicate first-person patient', async () => {
    const library = own(new ModelLibrary(template));
    const view = own(new ImportedPatientCart(library, { id: 'zhou-cart', name: '空担架', role: 'cart' }, baseURL, undefined, 'rescue'));
    await view.ready;
    expect(view.root.userData.assembly.vehicle).toBe('PROP-STRETCHER');
    expect(view.root.userData.assembly.patient).toBeUndefined();
    expect(view.root.getObjectByName('supine-patient')!.children).toHaveLength(0);
    view.setPose({ walk: 0, aiming: false, down: false, occupied: false, orderly: false });
    expect(view.root.getObjectByName('cart-part:PROP-STRETCHER')).toBeDefined();
  });

  it('does not draw a patient through the supply cargo, and only uses the existing roster', async () => {
    const library = own(new ModelLibrary(template));
    const view = own(new ImportedPatientCart(library, { id: 'supply-cart', name: '首批医疗物资', role: 'cart' }, baseURL, undefined, 'epilogue'));
    await view.ready;
    view.setPose({ walk: 2, aiming: false, down: false, occupied: false, cargo: true });
    expect(view.root.userData.assembly.cargo).toBe('PROP-CARGO');
    expect(view.root.userData.assembly.patient).toBeUndefined();
    expect(view.root.getObjectByName('generated-medical-supplies')!.children).toHaveLength(2);
    expect(view.root.getObjectByName('patient-transfer-offset')!.visible).toBe(false);
    view.root.updateMatrixWorld(true);
    const bed = view.root.getObjectByName('cart-part:PROP-TRANSFER')!, ray = new Raycaster();
    for (const box of view.root.getObjectByName('generated-medical-supplies')!.children) {
      const bounds = new Box3().setFromObject(box, true);
      expect(bounds.min.y).toBeCloseTo(.549, 5); expect(bounds.max.z).toBeCloseTo(-.1, 5);
      for (const dx of [.05, .5, .95]) for (const dz of [.05, .5, .95]) {
        const x = bounds.min.x + (bounds.max.x - bounds.min.x) * dx, z = bounds.min.z + (bounds.max.z - bounds.min.z) * dz;
        ray.set(new Vector3(x, 1.1, z), new Vector3(0, -1, 0));
        const contact = ray.intersectObject(bed, true)[0]; expect(contact).toBeDefined();
        expect(bounds.min.y - contact.point.y).toBeGreaterThanOrEqual(0);
        expect(bounds.min.y - contact.point.y).toBeLessThan(.012);
      }
    }
    expect(characterAssetFor(patientIdentity({ id: 'cart-0', name: '最后一批患者', role: 'cart' }))?.id).toBe('CH-SHEN');
  });

  it('keeps the old complete contact rig when a required production part fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const library = own(new ModelLibrary(async source => {
      if (source.id === 'PROP-TRANSFER') throw new Error('source unavailable');
      return template(source);
    }));
    const view = own(new ImportedPatientCart(library, { id: 'meng', name: '孟齐', role: 'cart' }, baseURL, undefined, 'medical'));
    await view.ready;
    expect(view.root.userData.assetStatus).toBe('error');
    expect(view.root.getObjectByName('patient-cart-placeholder')!.visible).toBe(true);
    expect(view.root.getObjectByName('generated-patient-cart')!.visible).toBe(false);
    expect(view.root.getObjectByName('supine-patient')!.children).toHaveLength(0);
  });

  it('disposal aborts pending work without attaching later production parts', async () => {
    const library = own(new ModelLibrary(async () => new Promise<ModelTemplate>(() => {})));
    const view = new ImportedPatientCart(library, { id: 'meng', name: '孟齐', role: 'cart' }, baseURL);
    view.dispose(); await view.ready;
    expect(view.root.children).toHaveLength(0);
  });
});
