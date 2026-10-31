import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Box3, Group, Mesh, PropertyBinding, Quaternion, SkinnedMesh, Texture, Vector3, type Interpolant, type KeyframeTrack } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_ASSETS } from '../src/assets/character-catalog';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelLease, ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { ImportedCharacter } from '../src/presentation/ImportedCharacter';
import { CharacterMotionTracker } from '../src/presentation/CharacterMotionTracker';
import { tacticalSource } from '../src/assets/tactical-catalog';

type Pose = Parameters<ImportedCharacter['setPose']>[0];
const baseURL = 'https://example.invalid/game/index.html';
const idle: Pose = { walk: 0, aiming: false, down: false, armed: false, moveSpeed: 0, animationTime: 0.25 };
const cleanup: Array<() => void> = [];
const shoulderMetrics: unknown[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
afterAll(() => { if (process.env.CHARACTER_SHOULDER_METRICS) writeFileSync('artifacts/asset-coverage-fix/character-visual/shoulder-metrics.json', JSON.stringify(shoulderMetrics, null, 2)); });

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
const armTrack = (name: string) => /^[LR]_(Clavicle|Upperarm|Forearm|Hand)/.test(name);
function weaponHeadClearance(root: Group): number {
  root.updateMatrixWorld(true);
  const head = root.getObjectByName('Head')!, inverse = head.matrixWorld.clone().invert(), envelope = new Box3(), point = new Vector3();
  for (const mesh of visibleSkin(root)) {
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < weights.count; i++) {
      let influence = 0;
      for (let j = 0; j < 4; j++) if (mesh.skeleton.bones[joints.getComponent(i, j)].name === 'Head') influence += weights.getComponent(i, j);
      if (influence >= .5) envelope.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
    }
  }
  expect(envelope.isEmpty()).toBe(false);
  let distance = Infinity;
  root.getObjectByName('world-ak47-mount')!.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    for (let i = 0; i < object.geometry.getAttribute('position').count; i++) {
      object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
      distance = Math.min(distance, envelope.distanceToPoint(point));
    }
  });
  return distance * head.getWorldScale(new Vector3()).x;
}

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

  it('keeps one world AK on the production right hand, with the same actual muzzle through posture changes', async () => {
    const { actor } = create(); await actor.ready;
    const attachment = actor.worldWeapon!; expect(await attachment.ready).toBe('ready');
    const muzzle = attachment.muzzle, socket = actor.root.getObjectByName('carbine-placeholder')!;
    const actualMuzzle = actor.root.getObjectByName('MuzzleDeviceTip')!;
    const mount = actor.root.getObjectByName('world-ak47-mount')!;
    expect(mount.parent?.name).toBe('R_Hand'); expect((mount.parent as Bone).isBone).toBe(true);
    actor.root.position.set(12, 0, -8); actor.root.rotation.y = 0.73;
    for (const pose of [{ crouched: true, aiming: true }, { crouched: true, walk: 1.4, moveSpeed: 0.9 }, { aiming: true }, { down: true }]) {
      actor.setPose({ ...idle, armed: true, ...pose }); actor.root.updateMatrixWorld(true);
      expect(actor.root.userData.motion.clip).toBe(pose.down ? undefined : pose.crouched ? pose.moveSpeed ? 'crouch_walk' : 'crouch_idle' : 'stand_up');
      expect(attachment.muzzle).toBe(muzzle);
      expect(muzzle.getWorldPosition(new Vector3()).distanceTo(actualMuzzle.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
      expect(socket.scale.toArray()).toEqual([0.68, 0.68, 0.68]);
      expect(socket.getObjectByName('world-ak47-mount')).toBeUndefined();
      expect(mount.visible).toBe(!pose.down);
      expect(actor.root.userData.weaponContact.rightGripError).toBeLessThan(1e-5);
      expect(actor.root.position.toArray()).toEqual([12, 0, -8]);
      let mounts = 0; actor.root.traverse(node => { if (node.name === 'world-ak47-mount') mounts++; }); expect(mounts).toBe(1);
      const body = socket.getObjectByName('receiver-stock-barrel') as Mesh; expect(body.visible).toBe(false);
    }
  });

  it.each(['left', 'right'] as const)('preserves authored %s fire lower-body tracks and real-shot timing while fitting the shoulder', async side => {
    const { actor } = create(); await actor.ready; await actor.worldWeapon!.ready;
    const pack = await template(tacticalSource('CH-LU', baseURL));
    const clip = pack.animations!.find(c => c.name === `cover_fire_${side}`)!;
    const pose: Pose = { ...idle, armed: true, aiming: true, animationTime: 8.07, lastShotAt: 8.02,
      combat: { phase: 'peek', moving: false, side, coverKey: 'crate:1' } };
    actor.root.position.set(4, 0, -3); actor.root.rotation.y = 0.64;
    actor.setPose(pose);
    expect(actor.root.userData.motion.clip).toBe(`cover_fire_${side}`); expect(actor.root.userData.motion.loop).toBe(false);
    const sampleAt = 0.105;
    for (const track of clip.tracks) {
      const parsed = PropertyBinding.parseTrackName(track.name), bone = actor.root.getObjectByName(parsed.nodeName) as Bone;
      const values = (track as KeyframeTrack & { createInterpolant(): Interpolant }).createInterpolant().evaluate(sampleAt);
      if (parsed.propertyName === 'quaternion') {
        if (!armTrack(parsed.nodeName)) expect(bone.quaternion.angleTo(new Quaternion().fromArray(values).normalize())).toBeLessThan(1e-6);
      }
      else expect((parsed.propertyName === 'position' ? bone.position : bone.scale).distanceTo(new Vector3().fromArray(values))).toBeLessThan(1e-6);
    }
    expect(actor.root.userData.weaponContact.rightGripError).toBeLessThan(1e-5);
    expect(actor.root.userData.weaponContact.leftGripError).toBeLessThan(0.02);
    expect(actor.root.userData.weaponContact.sightForwardDot).toBeGreaterThan(0.9);
    expect(actor.root.userData.shoulderContact.stockShoulderErrorMeters).toBeLessThan(.00001);
    expect(weaponHeadClearance(actor.root)).toBeGreaterThan(.015);
    const flash = actor.worldWeapon!.muzzle.getObjectByName('world-ak47-shot-flash')!;
    expect(flash.visible).toBe(true);
    const held = skeleton(actor.root);
    for (let i = 0; i < 5; i++) { actor.setPose(pose); expect(skeleton(actor.root)).toEqual(held); expect(flash.visible).toBe(true); }
    actor.setPose({ ...pose, animationTime: 8.5 });
    expect(actor.root.userData.motion.clip).toBe(`cover_aim_${side}`); expect(flash.visible).toBe(false);
    actor.setPose({ ...pose, animationTime: 8.51, down: true, lastShotAt: 8.51 });
    expect(actor.root.userData.motion.clip).toBeUndefined(); expect(flash.visible).toBe(false);
    actor.setPose({ ...pose, animationTime: 8.6, care: true, lastShotAt: 8.6 });
    expect(actor.root.userData.motion.clip).toBeUndefined(); expect(flash.visible).toBe(false);
    expect(actor.root.position.toArray()).toEqual([4, 0, -3]);
  });

  it.each(CHARACTER_ASSETS.filter(asset => asset.bodyPlan === 'adult' && !['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN'].includes(asset.id)))('$id keeps fixed arm lengths and stock/head clearance in both aim/fire directions', async asset => {
    const { actor } = create(template, asset.id); await actor.ready; await actor.worldWeapon!.ready;
    actor.root.position.set(4, .2, -3); actor.root.rotation.y = .64;
    const rest = new Map<string, { position: Vector3; scale: Vector3 }>();
    actor.root.traverse(object => { if (object instanceof Bone) rest.set(object.name, { position: object.position.clone(), scale: object.scale.clone() }); });
    const results = [];
    for (const side of ['left', 'right'] as const) for (const fire of [false, true]) {
      actor.setPose({ ...idle, animationTime: 0 });
      const pose: Pose = { ...idle, armed: true, aiming: true, animationTime: 8, ...(fire ? { lastShotAt: 8 } : {}),
        combat: { phase: 'peek', moving: false, side, coverKey: 'crate:actual-slot' } };
      actor.setPose(pose); actor.setPose({ ...pose, animationTime: fire ? 8.07 : 8.25 });
      const held = skeleton(actor.root), contact = actor.root.userData.shoulderContact;
      expect(contact.stockShoulderErrorMeters).toBeLessThan(.00001);
      // Bone origin is the upper-arm joint, not the deltoid's skin surface;
      // the widest helmet uses a lower seat within the upper 10 cm of that arm.
      expect(contact.shoulderOffsetMeters).toBeLessThan(.105);
      expect(contact.rightErrorMeters).toBeLessThan(.00001); expect(contact.leftErrorMeters).toBeLessThan(.003);
      expect(actor.root.userData.weaponContact.leftGripError).toBeLessThan(.003);
      expect(actor.root.userData.weaponContact.sightForwardDot).toBeGreaterThan(.9);
      const clearance = weaponHeadClearance(actor.root); expect(clearance).toBeGreaterThan(.015);
      actor.root.traverse(object => {
        if (!(object instanceof Bone)) return;
        if (armTrack(object.name)) expect(object.position.distanceTo(rest.get(object.name)!.position)).toBeLessThan(.00001);
        expect(object.scale.distanceTo(rest.get(object.name)!.scale)).toBeLessThan(.00001);
      });
      actor.setPose({ ...pose, animationTime: fire ? 8.07 : 8.25 }); expect(skeleton(actor.root)).toEqual(held);
      results.push({ side, fire, clearance, ...contact });
    }
    shoulderMetrics.push({ asset: asset.id, results });
  });

  it.each(['CH-SHAO', 'CH-DOCTOR', 'CH-SHEN', 'CH-LU-CHILD'])('keeps %s off tactical packs even when cover/fire inputs are present', async id => {
    const loader = vi.fn(template), { actor } = create(loader, id); await actor.ready;
    if (actor.worldWeapon) await actor.worldWeapon.ready;
    actor.setPose({ ...idle, animationTime: 3, armed: id !== 'CH-LU-CHILD', aiming: true, lastShotAt: 3,
      combat: { phase: 'peek', side: 'right', moving: false, coverKey: 'real-cover' } });
    expect(loader.mock.calls.some(([source]) => tactical(source))).toBe(false);
    expect(actor.root.userData.motion.clip).toBeUndefined(); expect(visibleSkin(actor.root).length).toBeGreaterThan(0);
    skeleton(actor.root);
    if (actor.worldWeapon) {
      expect(actor.root.getObjectByName('world-ak47-mount')!.parent?.name).toBe('R_Hand');
      expect(actor.root.userData.weaponContact.rightGripError).toBeLessThan(1e-5);
      expect(actor.root.userData.weaponContact.sightForwardDot).toBeGreaterThan(0.999);
    }
  });
});
