import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationClip, AnimationMixer, Bone, Box3, Group, LoopOnce, Mesh, Quaternion, QuaternionKeyframeTrack, SkinnedMesh, Texture, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterRole } from '../src/contracts';
import { CHARACTER_ASSETS, CANONICAL_WALK, canonicalWalkSource, characterAssetFor, characterSource, type CharacterAsset, type CharacterIdentity } from '../src/assets/character-catalog';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelAcquireOptions, ModelLease, ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { ImportedCharacter, type CharacterLoadStatus } from '../src/presentation/ImportedCharacter';
import { inspectCharacterRig, restoreCharacterRig, retargetCharacterWalk } from '../src/presentation/CharacterRig';

const baseURL = 'https://example.invalid/game/index.html';
const directory = new URL('../artifacts/asset-integration/characters/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('source-runtime-manifest.json', directory), 'utf8'));
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const readRuntime = (source: ModelSource) => readFileSync(new URL(`../public/models/${source.url.split('/models/')[1]}`, import.meta.url));
const jsonOf = (data: Buffer) => JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
/** Only texture decoding is substituted. Real GLTFLoader nodes, skin, geometry, materials and clips are parsed. No render acceptance. */
async function geometryTemplate(source: ModelSource): Promise<ModelTemplate> {
  const bytes = readRuntime(source), loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-image-decode-substitute-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function library() { const value = new ModelLibrary(geometryTemplate); cleanup.push(() => value.dispose()); return value; }
const roles: Record<string, CharacterRole> = { 'CH-DOCTOR': 'medic', 'CH-ENEMY': 'enemy', 'CH-FATHER': 'father', 'CH-LU': 'ally', 'CH-LU-CHILD': 'child', 'CH-LUO': 'worker', 'CH-MENG': 'ally', 'CH-SHAO': 'opponent', 'CH-SHEN': 'civilian', 'CH-XU': 'medic', 'CH-ZHAO': 'ally', 'CH-ZHENG': 'ally', 'CH-ZHOU': 'ally' };
function view(lib: ModelLibrary, asset: CharacterAsset, statuses: CharacterLoadStatus[] = []) {
  const model = new ImportedCharacter(lib, { id: asset.id, name: asset.label, role: roles[asset.id] }, baseURL, state => statuses.push(state));
  cleanup.push(() => model.dispose()); return model;
}
function skinBounds(root: Group): Box3 {
  root.updateMatrixWorld(true);
  const bounds = new Box3(), point = new Vector3();
  root.traverseVisible(object => {
    if (!(object instanceof SkinnedMesh)) return;
    for (let i = 0; i < object.geometry.getAttribute('position').count; i++) bounds.expandByPoint(object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld));
  });
  return bounds;
}
function skin(root: Group): SkinnedMesh { let result!: SkinnedMesh; root.traverse(object => { if (object instanceof SkinnedMesh) result = object; }); return result; }
function bone(root: Group, name: string): Bone { const node = root.getObjectByName(name); if (!(node instanceof Bone)) throw new Error(name); return node; }
function poseSnapshot(root: Group) { const result: number[][] = []; root.traverse(object => { if (object instanceof Bone) result.push([...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]); }); return result; }

describe('the exact 13 production characters, not extrapolated LU/ZHOU coverage', () => {
  it.each(CHARACTER_ASSETS)('$id preserves source skin and has stable target-rest walk and runtime poses', async asset => {
    const source = characterSource(asset, baseURL), data = readRuntime(source), document = jsonOf(data);
    expect(sha(data)).toBe(asset.sha256); expect(data.length).toBe(asset.bytes);
    expect(document.buffers.every((b: { uri?: string }) => !b.uri)).toBe(true);
    expect(document.images.every((image: { uri?: string }) => !image.uri)).toBe(true);
    expect(document.animations ?? []).toEqual([]);
    const sourceRecord = provenance.assets.find((entry: { id: string }) => entry.id === asset.id);
    const binaryOffset = 28 + data.readUInt32LE(12);
    for (const original of sourceRecord.nonImageBufferViews) {
      const bufferView = document.bufferViews[original.index];
      expect(sha(data.subarray(binaryOffset + bufferView.byteOffset, binaryOffset + bufferView.byteOffset + bufferView.byteLength))).toBe(original.sha256);
    }
    const textureReport = JSON.parse(readFileSync(new URL(`${asset.id}-textures.json`, directory), 'utf8'));
    expect(textureReport.sourceSha256).toBe(asset.sourceSha256);
    expect(textureReport.runtimeSha256).toBe(asset.sha256);
    expect(textureReport.images.every((image: { runtimeDimensions: number[] }) => Math.max(...image.runtimeDimensions) <= 1024)).toBe(true);

    const lib = library(), target = await lib.acquire(source), canonical = await lib.acquire(canonicalWalkSource(baseURL));
    cleanup.push(() => target.dispose(), () => canonical.dispose());
    const rig = inspectCharacterRig(target.root), reference = inspectCharacterRig(canonical.root, false), mesh = skin(target.root);
    const index = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    let maxWeightError = 0, invalidWeights = 0;
    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        const value = weights.getComponent(i, j), joint = index.getComponent(i, j); sum += value;
        if (!Number.isFinite(value) || value < 0 || joint < 0 || joint >= 41 || !Number.isInteger(joint)) invalidWeights++;
      }
      maxWeightError = Math.max(maxWeightError, Math.abs(sum - 1));
    }
    expect(invalidWeights).toBe(0); expect(maxWeightError).toBeLessThan(0.0001);
    const restTracks = reference.nodes.filter(node => node.bone).flatMap(node => [
      new VectorKeyframeTrack(`${node.name}.position`, [0, 1], [...node.position.toArray(), ...node.position.toArray()]),
      new QuaternionKeyframeTrack(`${node.name}.quaternion`, [0, 1], [...node.quaternion.toArray(), ...node.quaternion.toArray()]),
      new VectorKeyframeTrack(`${node.name}.scale`, [0, 1], [...node.scale.toArray(), ...node.scale.toArray()]),
    ]);
    const identity = retargetCharacterWalk(new AnimationClip('bind-reference', 1, restTracks), reference, rig, asset);
    const initialBounds = skinBounds(target.root);
    const restAction = target.mixer.clipAction(identity).play(); target.mixer.setTime(0.5); target.root.updateMatrixWorld(true);
    let restPositionError = 0, restAngleError = 0, restScaleError = 0;
    for (const node of rig.nodes.filter(node => node.bone)) {
      const actual = rig.bones.get(node.name)!;
      restPositionError = Math.max(restPositionError, actual.position.distanceTo(node.position));
      restAngleError = Math.max(restAngleError, actual.quaternion.clone().normalize().angleTo(node.quaternion.clone().normalize()));
      restScaleError = Math.max(restScaleError, actual.scale.distanceTo(node.scale));
    }
    const restoredBounds = skinBounds(target.root), restEnvelopeError = Math.max(initialBounds.min.distanceTo(restoredBounds.min), initialBounds.max.distanceTo(restoredBounds.max));
    expect(restPositionError).toBeLessThan(0.00001); expect(restAngleError).toBeLessThan(0.00001); expect(restScaleError).toBeLessThan(0.00001); expect(restEnvelopeError).toBeLessThan(0.00001);
    restAction.stop(); restoreCharacterRig(rig);
    const clip = retargetCharacterWalk(canonical.animations.find(c => c.name === 'walk_in_place')!, reference, rig, asset);
    expect(clip.tracks).toHaveLength(123);
    const action = target.mixer.clipAction(clip).setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const envelope = new Box3(), rootEnvelope = new Box3(), first = new Map<string, Quaternion>(), last = new Map<string, Quaternion>();
    const localMotion = new Map<string, number>(); let nonFinite = 0, minDeterminant = Infinity, maxQuaternionError = 0, maxAdjacentAngle = 0;
    for (let sample = 0; sample <= 48; sample++) {
      action.paused = false; target.mixer.setTime(clip.duration * sample / 48); target.root.updateMatrixWorld(true);
      const bounds = skinBounds(target.root); envelope.union(bounds);
      if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) nonFinite++;
      rootEnvelope.expandByPoint(rig.bones.get('Root')!.getWorldPosition(new Vector3()));
      for (const [name, joint] of rig.bones) {
        const q = joint.quaternion.clone().normalize();
        if (!first.has(name)) first.set(name, q.clone());
        if (last.has(name)) maxAdjacentAngle = Math.max(maxAdjacentAngle, q.angleTo(last.get(name)!));
        localMotion.set(name, Math.max(localMotion.get(name) ?? 0, q.angleTo(first.get(name)!))); last.set(name, q);
        minDeterminant = Math.min(minDeterminant, joint.matrixWorld.determinant());
        maxQuaternionError = Math.max(maxQuaternionError, Math.abs(joint.quaternion.length() - 1));
      }
    }
    const activeBones = [...localMotion].filter(([name, angle]) => name !== 'Root' && angle > 0.01).map(([name]) => name);
    expect(nonFinite).toBe(0); expect(minDeterminant).toBeGreaterThan(0); expect(maxQuaternionError).toBeLessThan(0.00001);
    expect(maxAdjacentAngle).toBeLessThan(Math.PI / 4); expect(activeBones.length).toBeGreaterThanOrEqual(10);
    expect(rootEnvelope.getSize(new Vector3()).x).toBeLessThan(0.0001); expect(rootEnvelope.getSize(new Vector3()).z).toBeLessThan(0.0001);
    expect(envelope.getSize(new Vector3()).y).toBeLessThan(1.3); action.stop();

    const statuses: CharacterLoadStatus[] = [], character = view(lib, asset, statuses); await character.ready;
    expect(statuses.at(-1)?.state).toBe('ready'); expect(character.root.userData.assetId).toBe(asset.id);
    expect(skin(character.root).skeleton).not.toBe(mesh.skeleton);
    character.setPose({ walk: 0, aiming: false, down: false, armed: false });
    const idleBounds = skinBounds(character.root), idle = poseSnapshot(character.root);
    expect(idleBounds.min.y).toBeCloseTo(0, 4); expect(idleBounds.getSize(new Vector3()).y).toBeCloseTo(asset.heightMeters, 4);
    for (const side of ['L', 'R']) expect(bone(character.root, `${side}_Upperarm`).getWorldPosition(new Vector3()).y - bone(character.root, `${side}_Hand`).getWorldPosition(new Vector3()).y).toBeGreaterThan(asset.heightMeters * 0.20);
    const poses = {
      aiming: { aiming: true, armed: true }, carrying: { carrying: true },
      crouched: { crouched: true }, kneeling: { kneeling: true }, care: { kneeling: true, care: true },
      restrained: { restrained: true }, gesture: { gesture: 0.9 }, reaching: { reaching: 1 }, lookAway: { lookAway: 0.6 },
      down: { down: true }, walking: { walk: 5.3 },
    };
    const poseMetrics: Record<string, { height: number; ground: number; handsForward: number; hipHeight: number }> = {};
    for (const [name, pose] of Object.entries(poses)) {
      character.setPose({ walk: 0, aiming: false, down: false, armed: false, ...pose });
      const bounds = skinBounds(character.root);
      poseMetrics[name] = { height: bounds.getSize(new Vector3()).y, ground: bounds.min.y,
        handsForward: (bone(character.root, 'L_Hand').getWorldPosition(new Vector3()).z + bone(character.root, 'R_Hand').getWorldPosition(new Vector3()).z) / 2,
        hipHeight: bone(character.root, 'Hip').getWorldPosition(new Vector3()).y };
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(bounds.getSize(new Vector3()).length()).toBeLessThan(asset.heightMeters * 2);
      expect(poseSnapshot(character.root)).not.toEqual(idle);
    }
    expect(poseMetrics.aiming.handsForward).toBeGreaterThan(asset.heightMeters * 0.15);
    expect(poseMetrics.carrying.handsForward).toBeGreaterThan(asset.heightMeters * 0.15);
    expect(poseMetrics.restrained.handsForward).toBeLessThan(0);
    expect(poseMetrics.down.height).toBeLessThan(asset.heightMeters * 0.55);
    expect(poseMetrics.crouched.height).toBeLessThan(asset.heightMeters * 0.85);
    expect(poseMetrics.kneeling.height).toBeLessThan(asset.heightMeters * 0.85);
    character.setPose({ walk: 5.3, aiming: false, down: false }); const frozen = poseSnapshot(character.root);
    character.setPose({ walk: 5.3, aiming: false, down: false }); expect(poseSnapshot(character.root)).toEqual(frozen);
    character.setPose({ walk: 0, aiming: false, down: false, armed: false }); expect(poseSnapshot(character.root)).toEqual(idle);
    // Historical audit artifacts are not fixtures to overwrite during every
    // regression run. Re-export only when an evidence update is requested.
    if (process.env.WRITE_CHARACTER_AUDIT === '1') writeFileSync(new URL(`${asset.id}-rig-audit.json`, directory), JSON.stringify({ id: asset.id, sourceSHA256: asset.sourceSha256, runtimeSHA256: asset.sha256,
      bodyPlan: asset.bodyPlan, numericalChecks: 'passed', bones: rig.bones.size, boneNames: [...rig.bones.keys()], vertices: weights.count,
      invalidWeights, maxWeightError, restPositionError, restAngleErrorRadians: restAngleError, restScaleError, restEnvelopeError,
      walk: { samples: 49, tracks: clip.tracks.length, activeBones, nonFinite, minDeterminant, maxQuaternionError, maxAdjacentAngleRadians: maxAdjacentAngle,
        envelope: { min: envelope.min.toArray(), max: envelope.max.toArray() }, rootRange: rootEnvelope.getSize(new Vector3()).toArray() },
      calibration: character.root.userData.calibration, idleHeight: idleBounds.getSize(new Vector3()).y, poseMetrics,
      limitations: ['Node substitutes only image decoding; no PBR or browser acceptance', 'Walk foot contact and procedural hand/equipment/care contact remain unreviewed', 'No original FBX is loaded or played'] }, null, 2) + '\n');
  }, 60_000);
});

describe('character mapping, instance independence and asynchronous ownership', () => {
  it('maps named characters before generic roles, uses the child asset, and preserves cart identity', () => {
    expect(CHARACTER_ASSETS).toHaveLength(13);
    expect(characterAssetFor({ id: 'xu', name: '许岚', role: 'medic' })?.id).toBe('CH-XU');
    expect(characterAssetFor({ id: 'young-lu', name: '男孩', role: 'child' })?.id).toBe('CH-LU-CHILD');
    expect(characterAssetFor({ id: 'hall-invader-2', name: '敌兵', role: 'opponent' })?.id).toBe('CH-ENEMY');
    expect(characterAssetFor({ id: 'zhou', name: '周延 · 救治中', role: 'cart' })).toBeUndefined();
    expect(canonicalWalkSource('game://local/index.html').url).toBe('game://local/models/animations/walk-canonical-v1.glb');
    expect(sha(readRuntime(canonicalWalkSource(baseURL)))).toBe(CANONICAL_WALK.sha256);
  });

  it('returns a usable cart fallback without requesting a human rig', async () => {
    const lib = library(), acquire = vi.spyOn(lib, 'acquire');
    const character = new ImportedCharacter(lib, { id: 'zhou-cart', name: '空担架', role: 'cart' }, baseURL); cleanup.push(() => character.dispose());
    character.setPose({ walk: 0, aiming: false, down: false, occupied: false }); await character.ready;
    expect(acquire).not.toHaveBeenCalled(); expect(character.root.userData.assetStatus).toBe('placeholder');
  });

  it('shares geometry and materials while isolating skeletons, poses, transforms and release ownership', async () => {
    const lib = library(), asset = CHARACTER_ASSETS.find(entry => entry.id === 'CH-ZHOU')!;
    const a = view(lib, asset), b = view(lib, asset); await Promise.all([a.ready, b.ready]);
    const first = skin(a.root), second = skin(b.root);
    expect(first.geometry).toBe(second.geometry); expect(first.material).toBe(second.material);
    expect(first.skeleton).not.toBe(second.skeleton); expect(first.skeleton.bones[0]).not.toBe(second.skeleton.bones[0]);
    const originalB = poseSnapshot(b.root);
    a.root.position.set(14, 3, -9); a.root.rotation.y = 1.2;
    a.setPose({ walk: 2, aiming: true, down: false, armed: true });
    expect(poseSnapshot(b.root)).toEqual(originalB); expect(a.root.position.toArray()).toEqual([14, 3, -9]); expect(a.root.rotation.y).toBe(1.2);
    const disposeGeometry = vi.spyOn(first.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(Array.isArray(first.material) ? first.material[0] : first.material, 'dispose');
    a.dispose(); a.dispose(); expect(disposeGeometry).not.toHaveBeenCalled(); expect(disposeMaterial).not.toHaveBeenCalled();
    b.dispose(); expect(disposeGeometry).toHaveBeenCalledTimes(1); expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it('releases both leases resolved immediately before disposal without attaching late models', async () => {
    const leases = [fakeLease(), fakeLease()]; let calls = 0;
    const lib = { acquire: () => Promise.resolve(leases[calls++]) } as unknown as ModelLibrary;
    const model = view(lib, CHARACTER_ASSETS[0]); model.dispose(); await model.ready;
    expect(model.root.children).toHaveLength(0);
    for (const lease of leases) expect(lease.dispose).toHaveBeenCalledTimes(1);
  });

  it('cancels superseded requests and keeps a retry failure on the synchronous fallback', async () => {
    const pending: Array<{ resolve(value: ModelLease): void; reject(error: unknown): void; options?: ModelAcquireOptions }> = [];
    const lib = { acquire: (_source: ModelSource, options?: ModelAcquireOptions) => new Promise<ModelLease>((resolve, reject) => pending.push({ resolve, reject, options })) } as unknown as ModelLibrary;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const states: CharacterLoadStatus[] = [], character = view(lib, CHARACTER_ASSETS[0], states), previous = character.ready;
    character.retry(); expect(pending[0].options?.signal?.aborted).toBe(true);
    const late = [fakeLease(), fakeLease()]; pending[0].resolve(late[0]); pending[1].resolve(late[1]); await previous;
    pending[2].reject(new Error('test download failed')); await character.ready;
    const lateAnimation = fakeLease(); pending[3].resolve(lateAnimation); await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1)?.state).toBe('error'); expect(character.root.userData.assetStatus).toBe('error');
    expect(character.root.children.length).toBeGreaterThan(0);
    for (const lease of [...late, lateAnimation]) expect(lease.dispose).toHaveBeenCalledTimes(1);
    character.setPose({ walk: 0, aiming: false, down: true });
  });
});

function fakeLease(): ModelLease {
  const root = new Group(); return { root, animations: [], mixer: new AnimationMixer(root), dispose: vi.fn(() => root.removeFromParent()) };
}

describe('NPC world AK actual character integration', () => {
  it('replaces every existing armed-role socket at metre scale and keeps its old muzzle through all poses', async () => {
    const loader = vi.fn(geometryTemplate), lib = new ModelLibrary(loader); cleanup.push(() => lib.dispose());
    const identities: CharacterIdentity[] = [
      { id: 'zheng', name: '郑铎', role: 'ally' }, { id: 'enemy-0', name: '敌方步枪兵', role: 'enemy' },
      { id: 'shao', name: '邵原', role: 'opponent' }, { id: 'father', name: '陆建平', role: 'father' },
      { id: 'hall-invader-0', name: '冲入主厅的敌兵', role: 'opponent' },
    ];
    const rows = identities.map(identity => {
      const character = new ImportedCharacter(lib, identity, baseURL); cleanup.push(() => character.dispose());
      const attachment = character.worldWeapon!; expect(attachment).toBeDefined();
      const socket = character.root.getObjectByName(identity.id === 'shao' ? 'sidearm-placeholder' : 'carbine-placeholder') as Group;
      return { character, attachment, socket, oldMuzzle: attachment.muzzle };
    });
    await Promise.all(rows.map(async ({ character, attachment }) => { await character.ready; expect(await attachment.ready).toBe('ready'); }));
    expect(loader.mock.calls.filter(([source]) => source.id === 'WP-AK47')).toHaveLength(1);
    const metrics: unknown[] = [];
    for (const { character, attachment, socket, oldMuzzle } of rows) {
      expect(character.root.userData.assetStatus).toBe('ready'); expect(socket.scale.toArray()).toEqual([0.68, 0.68, 0.68]);
      expect(attachment.muzzle).toBe(oldMuzzle);
      const mount = socket.getObjectByName('world-ak47-mount')!, actualMuzzle = mount.getObjectByName('MuzzleDeviceTip')!;
      const placeholder = socket.getObjectByName(character.identity.id === 'shao' ? 'sidearm-body' : 'receiver-stock-barrel')!;
      expect(placeholder.visible).toBe(false); expect(socket.getObjectByName('right-grip-arm')).toBeUndefined();
      let mounts = 0; character.root.traverse(node => { if (node.name === 'world-ak47-mount') mounts++; }); expect(mounts).toBe(1);
      character.root.position.set(12, 0, -8); character.root.rotation.y = 0.73;
      character.setPose({ walk: 0, aiming: true, down: false, armed: true }); character.root.updateMatrixWorld(true);
      const forward = new Vector3(0, 0, 1).transformDirection(character.root.matrixWorld);
      const barrel = new Vector3(0, 0, -1).transformDirection(oldMuzzle.matrixWorld);
      expect(barrel.dot(forward)).toBeGreaterThan(0.999);
      let min = Infinity, max = -Infinity, visibleMeshes = 0, triangles = 0;
      const point = new Vector3();
      mount.traverseVisible(node => {
        if (!(node instanceof Mesh)) return;
        visibleMeshes++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
        const vertices = node.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const span = point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld).dot(barrel);
          min = Math.min(min, span); max = Math.max(max, span);
        }
      });
      expect(max - min).toBeGreaterThan(0.88); expect(max - min).toBeLessThan(0.90);
      expect(visibleMeshes).toBe(10); expect(triangles).toBe(23_644);
      for (const pose of [{ aiming: false, down: false }, { aiming: true, down: false, crouched: true }, { aiming: false, down: true }]) {
        character.setPose({ walk: 0, armed: true, ...pose }); character.root.updateMatrixWorld(true);
        expect(oldMuzzle.getWorldPosition(new Vector3()).distanceTo(actualMuzzle.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
      }
      character.setPose({ walk: 0, aiming: false, down: false, armed: false }); expect(socket.visible).toBe(false);
      character.setPose({ walk: 0, aiming: false, down: false, armed: true, carrying: true }); expect(socket.visible).toBe(false);
      character.setPose({ walk: 0, aiming: true, down: false, armed: true }); expect(socket.visible).toBe(true);
      metrics.push({ actor: character.identity, actualLengthMeters: max - min, aimForwardDot: barrel.dot(forward), visibleMeshes, triangles,
        oldMuzzleObjectPreserved: true, socketScalePreserved: socket.scale.toArray(), source: socket.userData.worldWeapon,
        calibration: mount.userData.calibration });
    }
    writeFileSync(new URL('world-ak-npc-calibration.json', directory), JSON.stringify({ status: 'numerical-runtime-integration-passed', actors: metrics,
      akTemplateLoads: loader.mock.calls.filter(([source]) => source.id === 'WP-AK47').length,
      limitation: 'Image decoding only is substituted in Node; no browser/PBR/hand-contact/performance acceptance.' }, null, 2) + '\n');
  });

  it('keeps the procedural gun on a weapon load error and retries it without hiding the loaded character', async () => {
    let weaponAttempts = 0;
    const lib = new ModelLibrary(async source => {
      if (source.id === 'WP-AK47' && ++weaponAttempts === 1) throw new Error('controlled world gun failure');
      return geometryTemplate(source);
    }); cleanup.push(() => lib.dispose());
    const character = new ImportedCharacter(lib, { id: 'zheng', name: '郑铎', role: 'ally' }, baseURL); cleanup.push(() => character.dispose());
    await character.ready; expect(await character.worldWeapon!.ready).toBe('error');
    character.setPose({ walk: 0, aiming: true, down: false, armed: true });
    const socket = character.root.getObjectByName('carbine-placeholder')!;
    expect(character.root.userData.assetStatus).toBe('ready'); expect(socket.getObjectByName('receiver-stock-barrel')!.visible).toBe(true);
    expect(socket.getObjectByName('world-ak47-mount')).toBeUndefined(); expect(socket.scale.x).toBe(0.68);
    for (let i = 0; i < 10; i++) character.setPose({ walk: i, aiming: true, down: false, armed: true });
    expect(weaponAttempts).toBe(1);
    character.retry(); await character.ready; expect(await character.worldWeapon!.ready).toBe('ready');
    expect(weaponAttempts).toBe(2); expect(socket.getObjectByName('receiver-stock-barrel')!.visible).toBe(false);
  });

  it('cancels a removed real NPC and releases a late decoded AK without attaching or leaking', async () => {
    let resolveWeapon!: (template: ModelTemplate) => void, weaponSignal!: AbortSignal;
    const lib = new ModelLibrary(async (source, signal) => {
      if (source.id !== 'WP-AK47') return geometryTemplate(source);
      weaponSignal = signal; return new Promise<ModelTemplate>(resolve => { resolveWeapon = resolve; });
    }); cleanup.push(() => lib.dispose());
    const character = new ImportedCharacter(lib, { id: 'enemy-0', name: '敌兵', role: 'enemy' }, baseURL); cleanup.push(() => character.dispose());
    await character.ready; const attachment = character.worldWeapon!;
    character.dispose(); expect(await attachment.ready).toBe('disposed'); expect(weaponSignal.aborted).toBe(true);
    const source = await geometryTemplate({ id: 'WP-AK47', revision: '', url: `${baseURL.slice(0, baseURL.lastIndexOf('/') + 1)}models/weapons/ak47-world-r1.glb` });
    const freeGeometry = vi.spyOn((source.scene.getObjectByName('WeaponBodyGeometry') as Mesh).geometry, 'dispose');
    resolveWeapon(source); await new Promise(resolve => setTimeout(resolve, 0));
    expect(character.root.children).toHaveLength(0); expect(freeGeometry).toHaveBeenCalledTimes(1);
  });
});
