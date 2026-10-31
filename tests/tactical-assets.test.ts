import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Bone, SkinnedMesh, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { CHARACTER_ASSETS, type CharacterAsset } from '../src/assets/character-catalog';
import { TACTICAL_ASSETS, TACTICAL_CLIP_NAMES, tacticalSource } from '../src/assets/tactical-catalog';
import { loadTacticalAnimations } from '../src/presentation/TacticalAnimations';

async function parse(path: string): Promise<ModelTemplate> {
  const raw = readFileSync(new URL(`../public/${path}`, import.meta.url)), loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-texture-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
const loader = (source: ModelSource) => parse(`models/${source.url.split('models/')[1]}`);

describe('frozen tactical runtime assets', () => {
  it('keeps explicit deployment subpaths and packaged origins for tactical fetches', () => {
    expect(tacticalSource('CH-LU', 'https://example.test/ganymede/index.html').url).toBe('https://example.test/ganymede/models/animations/tactical-r1/ch-lu.glb');
    expect(tacticalSource('CH-LU', 'game://local/index.html').url).toBe('game://local/models/animations/tactical-r1/ch-lu.glb');
    expect(tacticalSource('CH-LU', 'file:///package/dist/index.html').url).toBe('file:///package/dist/models/animations/tactical-r1/ch-lu.glb');
  });
  it('binds all 13 actual texture-optimized rigs with source contracts and bone-name tracks', async () => {
    const library = new ModelLibrary(loader);
    try {
      for (const asset of CHARACTER_ASSETS) {
        const entry = TACTICAL_ASSETS.find(item => item.id === asset.id)!;
        const bytes = readFileSync(new URL(`../public/${entry.runtimePath}`, import.meta.url));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        expect(json.meshes ?? []).toHaveLength(0); expect(json.skins[0].joints).toHaveLength(41);
        expect(json.images ?? []).toHaveLength(0);
        const model = await parse(asset.runtimePath), before = new Map<string, number[]>();
        model.scene.traverse(node => { if (node instanceof Bone) before.set(node.name, node.position.toArray()); });
        const result = await loadTacticalAnimations(library, asset, model.scene);
        expect([...result.clips.keys()].sort()).toEqual([...TACTICAL_CLIP_NAMES].sort());
        for (const clip of result.clips.values()) {
          expect(clip.tracks).toHaveLength(123);
          for (const track of clip.tracks) expect(before.has(track.name.split('.')[0])).toBe(true);
        }
        model.scene.traverse(node => { if (node instanceof Bone) expect(node.position.toArray()).toEqual(before.get(node.name)); });
        result.dispose(); result.dispose(); expect(result.clips.size).toBe(0);
      }
    } finally { library.dispose(); }
  }, 30000);

  it('rejects mismatched source, posed bones and modified inverse binds before acquisition', async () => {
    const call = vi.fn(loader), library = new ModelLibrary(call), asset = CHARACTER_ASSETS.find(a => a.id === 'CH-LU')!, model = await parse(asset.runtimePath);
    try {
      await expect(loadTacticalAnimations(library, { ...asset, sourceSha256: 'wrong' } as unknown as CharacterAsset, model.scene)).rejects.toThrow('SHA');
      const calf = model.scene.getObjectByName('L_Calf')!; calf.position.y += .01;
      await expect(loadTacticalAnimations(library, asset, model.scene)).rejects.toThrow('参考姿势'); calf.position.y -= .01;
      const mesh = model.scene.getObjectByProperty('isSkinnedMesh', true) as SkinnedMesh;
      mesh.skeleton.boneInverses[0].elements[12] += .01;
      await expect(loadTacticalAnimations(library, asset, model.scene)).rejects.toThrow('逆绑定');
      expect(call).not.toHaveBeenCalled();
    } finally { library.dispose(); }
  });

  it('releases rejected pack leases and propagates loading failures for caller fallback', async () => {
    const asset = CHARACTER_ASSETS.find(a => a.id === 'CH-LU')!, model = await parse(asset.runtimePath);
    const good = await parse(TACTICAL_ASSETS.find(a => a.id === asset.id)!.runtimePath);
    good.scene.userData.ganymedeAnimation.bakedTargetAsset = 'CH-WRONG';
    const load = vi.fn(async () => good), library = new ModelLibrary(load);
    await expect(loadTacticalAnimations(library, asset, model.scene)).rejects.toThrow('身份');
    await expect(loadTacticalAnimations(library, asset, model.scene)).rejects.toThrow('身份');
    expect(load).toHaveBeenCalledTimes(2); library.dispose();
    const failed = new ModelLibrary(async () => { throw new Error('offline'); });
    await expect(loadTacticalAnimations(failed, asset, model.scene)).rejects.toThrow('offline'); failed.dispose();
  });
});
