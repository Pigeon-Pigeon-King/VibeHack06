import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Group, Mesh, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_ASSETS } from '../src/assets/character-catalog';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelLease, ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { ImportedCharacter } from '../src/presentation/ImportedCharacter';
import { CharacterMotionTracker } from '../src/presentation/CharacterMotionTracker';

type Pose = Parameters<ImportedCharacter['setPose']>[0];
const baseURL = 'https://example.invalid/game/index.html';
const idle: Pose = { walk: 0, aiming: false, down: false, armed: false, moveSpeed: 0, animationTime: 0.25 };
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });

/** Real GLB skeleton, skin and clip data; only browser image decoding is substituted. */
async function template(source: ModelSource): Promise<ModelTemplate> {
  const path = source.url.split('/models/')[1];
  if (!path) throw new Error(`Unexpected model source: ${source.id}`);
  const raw = readFileSync(new URL(`../public/models/${path}`, import.meta.url)), loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function create(loader = template, id = 'CH-LU') {
  const library = new ModelLibrary(loader); cleanup.push(() => library.dispose());
  const asset = CHARACTER_ASSETS.find(item => item.id === id)!;
  const actor = new ImportedCharacter(library, { id, name: asset.label, role: id === 'CH-LU-CHILD' ? 'child' : 'ally' }, baseURL);
  cleanup.push(() => actor.dispose()); return { actor, library };
}
function skeleton(root: Group): number[] {
  root.updateWorldMatrix(true, true); const result: number[] = [];
  root.traverse(node => { if (node instanceof Bone) result.push(...node.matrixWorld.elements); });
  expect(result.length).toBeGreaterThan(0); expect(result.every(Number.isFinite)).toBe(true); return result;
}
function visibleSkin(root: Group): SkinnedMesh[] {
  const result: SkinnedMesh[] = []; root.traverseVisible(node => { if (node instanceof SkinnedMesh) result.push(node); }); return result;
}
const tactical = (source: ModelSource) => source.url.includes('/tactical-r1/');

describe('tactical character state without a renderer clock', () => {
  it('retains the same measured motion and skin pose across repeated simulation frames', async () => {
    const { actor } = create(); await actor.ready;
    expect(actor.root.userData.assetStatus).toBe('ready');
    const tracker = new CharacterMotionTracker(); tracker.speed('runner', [0, 0, 0], 10);
    const moveSpeed = tracker.speed('runner', [0.0666666667, 0, 0], 10 + 1 / 60);
    const pose: Pose = { ...idle, walk: 2.3, moveSpeed, armed: true, animationTime: 10 + 1 / 60 };
    actor.setPose(pose); const before = skeleton(actor.root);
    expect(actor.root.userData.motion.clip).toBe('run'); expect(actor.root.userData.tacticalStatus).toContain('shared-clip');
    for (let repeat = 0; repeat < 5; repeat++) {
      expect(tracker.speed('runner', [0.0666666667, 0, 0], 10 + 1 / 60)).toBe(moveSpeed);
      actor.setPose(pose); expect(skeleton(actor.root)).toEqual(before);
    }
    // Moving clips follow travelled distance, even when simulation time changes.
    actor.setPose({ ...pose, animationTime: 1000 }); expect(skeleton(actor.root)).toEqual(before);
    actor.setPose(idle); const stationary = skeleton(actor.root); expect(actor.root.userData.motion.clip).toBe('idle');
    actor.setPose({ ...idle, animationTime: 1.4 }); skeleton(actor.root);
    actor.setPose(idle); expect(skeleton(actor.root)).toEqual(stationary);
    for (const animationTime of [undefined, Number.NaN]) {
      actor.setPose({ ...pose, animationTime }); expect(actor.root.userData.motion.clip).toBeUndefined(); skeleton(actor.root);
    }
    actor.setPose(pose); expect(skeleton(actor.root)).toEqual(before);
    expect(actor.root.position.toArray()).toEqual([0, 0, 0]);
  });

  it('keeps the loaded skin, walk and crouch fallback if the optional tactical package fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = vi.fn(async (source: ModelSource) => {
      if (tactical(source)) throw new Error('controlled optional tactical failure');
      return template(source);
    });
    const { actor } = create(loader); await actor.ready;
    expect(loader.mock.calls.filter(([source]) => tactical(source))).toHaveLength(1);
    expect(actor.root.userData.assetStatus).toBe('ready'); expect(visibleSkin(actor.root).length).toBeGreaterThan(0);
    expect(actor.root.userData.tacticalStatus).toContain('optional-load-failed');
    actor.setPose(idle); const standing = skeleton(actor.root);
    actor.setPose({ ...idle, walk: 1.4, moveSpeed: 1.2 }); expect(skeleton(actor.root)).not.toEqual(standing);
    actor.setPose({ ...idle, crouched: true }); const crouched = skeleton(actor.root); expect(crouched).not.toEqual(standing);
    for (let repeat = 0; repeat < 4; repeat++) { actor.setPose({ ...idle, crouched: true }); expect(skeleton(actor.root)).toEqual(crouched); }
    expect(loader.mock.calls.filter(([source]) => tactical(source))).toHaveLength(1);
  });

  it('restores the same child walk after posture changes without moving its simulation-owned root', async () => {
    const { actor } = create(template, 'CH-LU-CHILD'); await actor.ready;
    actor.root.position.set(3, 1, -4); actor.root.rotation.y = -0.45;
    const reference: Pose = { ...idle, walk: 1.7, moveSpeed: 1.2 };
    actor.setPose(reference); const before = skeleton(actor.root);
    for (const change of [{ crouched: true }, { down: true }, { kneeling: true, care: true }, { carrying: true }]) {
      actor.setPose({ ...idle, ...change }); skeleton(actor.root);
      actor.setPose(reference); expect(skeleton(actor.root)).toEqual(before);
      expect(actor.root.userData.motion.clip).toBeUndefined(); expect(actor.root.userData.tacticalStatus).toContain('fallback');
      expect(actor.root.position.toArray()).toEqual([3, 1, -4]); expect(actor.root.rotation.y).toBe(-0.45);
      expect(visibleSkin(actor.root).length).toBeGreaterThan(0);
    }
  });

  it('releases a late tactical lease once after character disposal without reattaching it', async () => {
    let deliver!: (value: ModelTemplate) => void, pendingSource!: ModelSource;
    const { actor, library } = create(source => {
      if (!tactical(source)) return template(source);
      pendingSource = source; return new Promise<ModelTemplate>(resolve => { deliver = resolve; });
    });
    const original = library.acquire.bind(library); let lease: ModelLease | undefined;
    vi.spyOn(library, 'acquire').mockImplementation(async (source, options) => {
      // Deliberately emulate a transport whose decoded result wins an abort race.
      const acquired = await original(source, tactical(source) ? { ...options, signal: undefined } : options);
      if (tactical(source)) { lease = acquired; vi.spyOn(acquired, 'dispose'); }
      return acquired;
    });
    await vi.waitFor(() => expect(deliver).toBeTypeOf('function'), { timeout: 4000, interval: 10 });
    actor.dispose(); actor.dispose();
    deliver(await template(pendingSource)); await actor.ready;
    await vi.waitFor(() => expect(lease).toBeDefined(), { timeout: 4000, interval: 10 });
    expect(lease!.root.parent).toBeNull(); expect(lease!.dispose).toHaveBeenCalledTimes(1);
    expect(actor.root.children).toHaveLength(0); actor.setPose({ ...idle, crouched: true }); expect(actor.root.children).toHaveLength(0);
  });

  it('keeps one world AK and its original muzzle aligned after crouch, aim and fall poses', async () => {
    const { actor } = create(); await actor.ready;
    const attachment = actor.worldWeapon!; expect(await attachment.ready).toBe('ready');
    const muzzle = attachment.muzzle, socket = actor.root.getObjectByName('carbine-placeholder')!;
    const actualMuzzle = socket.getObjectByName('MuzzleDeviceTip')!;
    actor.root.position.set(12, 0, -8); actor.root.rotation.y = 0.73;
    for (const pose of [{ crouched: true, aiming: true }, { crouched: true, walk: 1.4, moveSpeed: 0.9 }, { aiming: true }, { down: true }]) {
      actor.setPose({ ...idle, armed: true, ...pose }); actor.root.updateMatrixWorld(true);
      expect(actor.root.userData.motion.clip).toBe(pose.down ? undefined : pose.crouched ? pose.moveSpeed ? 'crouch_walk' : 'crouch_idle' : 'ready_idle');
      expect(attachment.muzzle).toBe(muzzle);
      expect(muzzle.getWorldPosition(new Vector3()).distanceTo(actualMuzzle.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
      expect(socket.scale.toArray()).toEqual([0.68, 0.68, 0.68]);
      expect(actor.root.position.toArray()).toEqual([12, 0, -8]);
      let mounts = 0; actor.root.traverse(node => { if (node.name === 'world-ak47-mount') mounts++; }); expect(mounts).toBe(1);
      const body = socket.getObjectByName('receiver-stock-barrel') as Mesh; expect(body.visible).toBe(false);
    }
  });
});
