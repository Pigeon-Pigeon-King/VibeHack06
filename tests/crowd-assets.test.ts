import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { CrowdView } from '../src/presentation/CrowdView';
import { ImportedCharacter } from '../src/presentation/ImportedCharacter';

const baseURL = 'https://example.invalid/game/index.html';
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()));
const pose = { walk: 0, aiming: false, down: false, armed: false };

// Actual GLB geometry, skin and animation; Node substitutes only image decoding.
async function template(source: ModelSource): Promise<ModelTemplate> {
  const raw = readFileSync(new URL(`../public/models/${source.url.split('/models/')[1]}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function own<T extends { dispose(): void }>(value: T): T { cleanup.push(() => value.dispose()); return value; }
const skin = (person: ImportedCharacter) => person.root.getObjectByProperty('isSkinnedMesh', true) as SkinnedMesh;
const headHeight = (person: ImportedCharacter) => {
  person.root.updateWorldMatrix(true, true);
  return person.root.getObjectByName('Head')!.getWorldPosition(new Vector3()).y;
};

describe('opening crowd production characters', () => {
  it('loads all 44 residents with shared real geometry and independent skeletons', async () => {
    const loader = vi.fn(template), library = own(new ModelLibrary(loader));
    const crowd = own(new CrowdView(64, { library, baseURL })), scene = new Group();
    const people = Array.from({ length: 44 }, (_, i) => {
      const person = crowd.create({ id: `evac-crowd-${i}`, name: '撤离居民', role: 'civilian' }) as ImportedCharacter;
      scene.add(person.root); person.root.position.set(i * 0.7, 0, i % 5); return person;
    });
    await Promise.all(people.map(person => person.ready));
    expect(loader).toHaveBeenCalledTimes(2); // One body template and one walk template.
    expect(crowd.root.userData.population).toEqual({ total: 44, ready: 44 });
    expect(crowd.root.userData.assetStatus).toBe('ready');
    const first = skin(people[0]);
    expect(first.geometry.index!.count).toBeGreaterThan(3000);
    for (const person of people) {
      expect(person.root.userData.assetStatus).toBe('ready');
      expect(skin(person).geometry).toBe(first.geometry);
      expect(skin(person).material).toBe(first.material);
      person.setPose({ ...pose, walk: 1.5 });
    }
    expect(new Set(people.map(person => skin(person).skeleton)).size).toBe(44);
    if (process.env.CROWD_ASSET_METRICS === '1') {
      const milliseconds: number[] = [];
      for (let frame = 0; frame < 90; frame++) {
        const start = performance.now();
        people.forEach((person, i) => person.setPose({ ...pose, walk: (frame / 60 + i / 44) * 6 }));
        const elapsed = performance.now() - start;
        if (frame >= 30) milliseconds.push(elapsed);
      }
      milliseconds.sort((a, b) => a - b);
      console.info('crowd-asset-metrics', JSON.stringify({ people: people.length,
        visibleBodyDraws: people.length, bodyTriangles: first.geometry.index!.count / 3 * people.length,
        skeletonBones: first.skeleton.bones.length * people.length,
        poseOnlyCpuMs: { median: milliseconds[30], p95: milliseconds[57] },
        boundary: 'Node CPU pose sampling only; no WebGL, textures, shadow passes or frame-rate claim' }));
    }
    const otherHead = headHeight(people[1]);
    people[0].setPose({ ...pose, down: true, fallProgress: 0 }); const standing = headHeight(people[0]);
    people[0].setPose({ ...pose, down: true, fallProgress: 0.5 }); const middle = headHeight(people[0]);
    people[0].setPose({ ...pose, down: true, fallProgress: 1 }); const fallen = headHeight(people[0]);
    expect(standing).toBeGreaterThan(middle); expect(middle).toBeGreaterThan(fallen);
    expect(headHeight(people[1])).toBeCloseTo(otherHead, 8);
    const disposed = vi.fn(); first.geometry.addEventListener('dispose', disposed);
    people[0].dispose(); expect(disposed).not.toHaveBeenCalled();
    people[1].setPose({ ...pose, walk: 2.5 }); expect(Number.isFinite(headHeight(people[1]))).toBe(true);
    crowd.clear(); expect(scene.children).toHaveLength(0); expect(disposed).toHaveBeenCalledOnce();
  });

  it('cancels a loading population without late attachment or status callbacks', async () => {
    const releases: Array<() => void> = [];
    const library = own(new ModelLibrary(async source => {
      await new Promise<void>(resolve => releases.push(resolve)); return template(source);
    }));
    const crowd = own(new CrowdView(64, { library, baseURL })), status = vi.fn();
    const old = crowd.create({ id: 'late-civilian-1', name: '撤离居民', role: 'civilian' }, status) as ImportedCharacter;
    crowd.clear(); const callsAfterClear = status.mock.calls.length;
    releases.forEach(release => release()); await old.ready;
    expect(status).toHaveBeenCalledTimes(callsAfterClear);
    expect(old.root.children).toHaveLength(0);
    expect(crowd.root.userData.assetStatus).toBe('empty');
    expect(crowd.root.userData.population).toEqual({ total: 0, ready: 0 });
  });
});
