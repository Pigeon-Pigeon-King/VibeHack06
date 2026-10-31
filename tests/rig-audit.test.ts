import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AnimationClip, Bone, BufferGeometry, Float32BufferAttribute, Group, Matrix4, MeshBasicMaterial, NumberKeyframeTrack, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { auditRig, compareAdultRigs, RIG_JOINTS, type RigContract, type RigJoint } from '../src/assets/RigAudit';

function rig(profile: 'adult' | 'child' = 'adult') {
  const root = new Group();
  const bones = Object.fromEntries(RIG_JOINTS.map(name => { const bone = new Bone(); bone.name = name; return [name, bone]; })) as Record<RigJoint, Bone>;
  root.add(bones.root); bones.root.add(bones.pelvis); bones.pelvis.add(bones.abdomen); bones.abdomen.add(bones.chest); bones.chest.add(bones.neck); bones.neck.add(bones.head);
  for (const side of ['L', 'R'] as const) {
    bones.chest.add(bones[`clavicle.${side}`]); bones[`clavicle.${side}`].add(bones[`upper_arm.${side}`]);
    bones[`upper_arm.${side}`].add(bones[`forearm.${side}`]); bones[`forearm.${side}`].add(bones[`hand.${side}`]);
    bones.pelvis.add(bones[`thigh.${side}`]); bones[`thigh.${side}`].add(bones[`shin.${side}`]);
    bones[`shin.${side}`].add(bones[`foot.${side}`]); bones[`foot.${side}`].add(bones[`toe.${side}`]);
  }
  Object.values(bones).forEach((bone, i) => bone.position.set(i / 100, 0.1, 0));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(RIG_JOINTS.flatMap((_, i) => [0, i / 10, 0]), 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(RIG_JOINTS.flatMap((_, i) => [i, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(RIG_JOINTS.flatMap(() => [1, 0, 0, 0]), 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial()); mesh.name = 'body'; root.add(mesh);
  root.updateMatrixWorld(true); mesh.bind(new Skeleton(Object.values(bones)));
  const contract: RigContract = { profile, version: 'adult-v1', bones: Object.fromEntries(RIG_JOINTS.map(name => [name, name])) };
  return { root, bones, mesh, contract, audit: (clips: AnimationClip[] = []) => auditRig(root, contract, clips) };
}
const trialClip = () => new AnimationClip('trial', 1, [new NumberKeyframeTrack('root.position[x]', [0, 1], [0, 0.1])]);

describe('imported character skeleton structural audit', () => {
  it('requires distinct head, chest, abdomen and both complete limb chains, retaining manual review', () => {
    const a = rig(), report = a.audit();
    expect(report.structureReady).toBe(true); expect(report.joints).toHaveLength(22);
    expect(report.vertices).toBe(22); expect(report.manualChecks.length).toBeGreaterThan(0);
    a.contract.bones.head = 'chest';
    expect(a.audit().errors.some(issue => issue.code === 'shared-joint')).toBe(true);
    delete a.contract.bones['hand.R'];
    expect(a.audit().errors.some(issue => issue.code === 'missing-mapping' && issue.detail === 'hand.R')).toBe(true);
  });
  it('rejects a disconnected anatomical chain and ambiguous exported names', () => {
    const a = rig(); a.bones.root.add(a.bones.head);
    expect(a.audit().errors.some(issue => issue.code === 'wrong-hierarchy')).toBe(true);
    const duplicate = new Bone(); duplicate.name = 'hand.L'; a.root.add(duplicate);
    expect(a.audit().errors.some(issue => issue.code === 'ambiguous-node')).toBe(true);
  });
  it.each(['shoulder-under-head', 'right-leg-under-left-leg'])('rejects crossed mapped chains even when the expected joint remains an ancestor: %s', example => {
    const a = rig();
    if (example === 'shoulder-under-head') a.bones.head.attach(a.bones['clavicle.L']);
    else a.bones['thigh.L'].attach(a.bones['thigh.R']);
    expect(a.audit().errors.some(issue => issue.code === 'wrong-hierarchy')).toBe(true);
  });
  it('permits an unmapped Pelvis helper below Hip without moving the torso mapping', () => {
    const a = rig(), helper = new Bone(); helper.name = 'Pelvis.helper';
    a.bones.pelvis.add(helper); helper.add(a.bones['thigh.L'], a.bones['thigh.R']);
    expect(a.audit().structureReady).toBe(true);
    expect(a.audit().joints.find(joint => joint.semantic === 'thigh.L')?.parent).toBe('pelvis');
  });
  it('detects out-of-range indices, invalid weight sums and nonfinite positions', () => {
    const a = rig();
    a.mesh.geometry.getAttribute('skinIndex').setX(0, 900);
    a.mesh.geometry.getAttribute('skinWeight').setX(1, 0);
    a.mesh.geometry.getAttribute('position').setY(2, Infinity);
    expect(a.audit().errors.map(issue => issue.code)).toEqual(expect.arrayContaining(['invalid-skin-index', 'invalid-skin-weight', 'invalid-position']));
  });
  it('does not accept a named joint that cannot affect any mesh vertices', () => {
    const a = rig();
    a.mesh.geometry.getAttribute('skinIndex').setX(RIG_JOINTS.indexOf('head'), RIG_JOINTS.indexOf('neck'));
    expect(a.audit().errors).toContainEqual({ code: 'joint-controls-no-skin', detail: 'head' });
  });
  it('rejects missing or singular inverse binds and bones outside the cloned model tree', () => {
    const a = rig(); a.mesh.skeleton.boneInverses[0] = new Matrix4().makeScale(0, 1, 1);
    a.mesh.skeleton.bones[1] = new Bone();
    expect(a.audit().errors.map(issue => issue.code)).toEqual(expect.arrayContaining(['invalid-bind-inverses', 'external-skeleton-bone']));
  });
  it('rejects invertible but incorrect inverse binds and bind matrices', () => {
    const a = rig();
    a.mesh.skeleton.boneInverses[4].premultiply(new Matrix4().makeTranslation(0.4, 0, 0));
    expect(a.audit().errors.some(issue => issue.code === 'rest-bind-mismatch')).toBe(true);
    const b = rig(); b.mesh.bindMatrix.makeTranslation(0.4, 0, 0);
    expect(b.audit().errors.some(issue => issue.code === 'rest-bind-mismatch')).toBe(true);
    const c = rig(); c.mesh.bindMatrix.elements[3] = 0.2;
    expect(c.audit().errors.some(issue => issue.code === 'invalid-bind-matrix')).toBe(true);
  });
  it('requires the declared motion root to contain every skeleton joint', () => {
    const a = rig(), detached = new Bone(); detached.name = 'unowned'; a.root.add(detached);
    a.mesh.skeleton.bones.push(detached); a.mesh.skeleton.boneInverses.push(new Matrix4());
    expect(a.audit().errors.some(issue => issue.code === 'bone-outside-rig-root')).toBe(true);
  });
  it('rejects repeated skeleton entries and ambiguous auxiliary bone names', () => {
    const a = rig();
    a.mesh.skeleton.bones.push(a.bones.root); a.mesh.skeleton.boneInverses.push(a.mesh.skeleton.boneInverses[0].clone());
    expect(a.audit().errors.some(issue => issue.code === 'duplicate-skeleton-bone')).toBe(true);
    const b = rig(), left = new Bone(), right = new Bone(); left.name = right.name = 'finger-extra';
    b.bones['hand.L'].add(left); b.bones['hand.R'].add(right);
    expect(b.audit().errors.some(issue => issue.code === 'ambiguous-rig-node')).toBe(true);
  });
  it('checks auxiliary transforms and position attribute shape', () => {
    const a = rig(), helper = new Bone(); helper.name = 'bad-helper'; helper.scale.x = -1; a.bones.head.add(helper);
    expect(a.audit().errors.some(issue => issue.code === 'invalid-rig-scale')).toBe(true);
    const b = rig(); b.mesh.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(22 * 4), 4));
    expect(b.audit().errors.some(issue => issue.code === 'invalid-skin-attributes')).toBe(true);
    const c = rig(); c.root.scale.x = -1;
    expect(c.audit().errors.some(issue => issue.code === 'invalid-root-scale')).toBe(true);
  });
  it('does not call a static or unbound model a valid rig', () => {
    const a = rig(); a.mesh.removeFromParent();
    expect(a.audit().structureReady).toBe(false);
    expect(a.audit().errors.some(issue => issue.code === 'no-skin')).toBe(true);
  });
  it('allows a shared adult-animation trial only for matching rest skeletons, independent of world placement', () => {
    const a = rig(), b = rig(); b.root.position.set(10, 2, -20); b.root.rotation.y = 0.8;
    expect(compareAdultRigs(a.audit([trialClip()]), b.audit()).canAttemptSharedAnimations).toBe(true);
    b.bones['forearm.L'].rotation.x = 0.3;
    expect(compareAdultRigs(a.audit(), b.audit()).canAttemptSharedAnimations).toBe(false);
  });
  it('does not infer a trial or completed animation acceptance from two rigs with no clips', () => {
    const a = rig(), b = rig(), report = a.audit();
    expect(report.structureReady).toBe(true);
    expect(report.warnings.some(issue => issue.code === 'no-animation-clips')).toBe(true);
    expect(compareAdultRigs(report, b.audit()).canAttemptSharedAnimations).toBe(false);
    expect(compareAdultRigs(a.audit([new AnimationClip('empty', 1, [])]), b.audit()).canAttemptSharedAnimations).toBe(false);
  });
  it('compares helper-local transforms even when every semantic joint has the same world rest transform', () => {
    const a = rig(), b = rig(), helper = new Group(); helper.name = 'arm-helper'; helper.position.x = 0.1;
    b.bones['upper_arm.L'].add(helper); helper.add(b.bones['forearm.L']); b.bones['forearm.L'].position.x -= 0.1;
    const first = a.audit([trialClip()]), second = b.audit();
    expect(first.structureReady).toBe(true); expect(second.structureReady).toBe(true);
    for (let i = 0; i < first.joints.length; i++) {
      first.joints[i].restMatrix.forEach((value, n) => expect(second.joints[i].restMatrix[n]).toBeCloseTo(value, 6));
    }
    const comparison = compareAdultRigs(first, second);
    expect(comparison.canAttemptSharedAnimations).toBe(false);
    expect(comparison.reasons.some(reason => reason.includes('完整'))).toBe(true);
  });
  it('rejects incomplete legacy reports, repeated semantics and empty matrix arrays', () => {
    const a = rig().audit([trialClip()]), b = rig().audit();
    b.joints[0].restMatrix = [];
    expect(compareAdultRigs(a, b).canAttemptSharedAnimations).toBe(false);
    const legacy = rig().audit(); delete (legacy as Partial<typeof legacy>).hierarchy;
    expect(compareAdultRigs(a, legacy).reasons).toContain('缺少完整骨架层级记录；旧报告须重新审计');
    const repeated = rig().audit(); repeated.joints[0] = repeated.joints[1];
    expect(compareAdultRigs(a, repeated).reasons).toContain('语义关节记录缺失或重复');
  });
  it('keeps children and different rig versions out of automatic adult sharing', () => {
    const a = rig(), b = rig('child');
    expect(compareAdultRigs(a.audit(), b.audit()).reasons).toContain('儿童须独立校准');
    b.contract.profile = 'adult'; b.contract.version = 'adult-v2';
    expect(compareAdultRigs(a.audit(), b.audit()).reasons).toContain('基础骨架版本不同');
  });
});

function cli(json: Record<string, unknown>, binary?: Uint8Array) {
  const directory = mkdtempSync(join(tmpdir(), 'rig-audit-test-'));
  try {
    const raw = Buffer.from(JSON.stringify(json)), length = Math.ceil(raw.length / 4) * 4;
    const binaryLength = binary ? Math.ceil(binary.byteLength / 4) * 4 : 0;
    const glb = Buffer.alloc(20 + length + (binary ? 8 + binaryLength : 0), 32);
    glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(length, 12); glb.writeUInt32LE(0x4e4f534a, 16); raw.copy(glb, 20);
    if (binary) {
      glb.writeUInt32LE(binaryLength, 20 + length); glb.writeUInt32LE(0x004e4942, 24 + length);
      glb.set(binary, 28 + length);
    }
    const file = join(directory, 'fixture.glb'); writeFileSync(file, glb);
    return spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/audit-character-rig.mjs', import.meta.url)), '--file', file], { encoding: 'utf8', timeout: 30_000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const emptyGlb = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] };

describe('structural CLI stays local and labels untested surfaces', () => {
  it('reports missing skin without claiming image decoding or animation playback', () => {
    const result = cli(emptyGlb); expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.structureReady).toBe(false);
    expect(report.textureValidation).toMatch(/^NOT_RUN:/);
    expect(report.animationValidation).toMatch(/^NOT_RUN:/);
    expect(report.sceneScope.inactiveScenesAudited).toBe(false);
  }, 45_000);
  it.each(['https://example.invalid/mesh.bin', 'file:///never-read.bin', 'data:application/octet-stream;base64,AAAA'])('rejects declared URI dependencies before parsing: %s', uri => {
    const result = cli({ ...emptyGlb, buffers: [{ uri, byteLength: 3 }] });
    expect(result.status).toBe(1); expect(result.stderr).toContain('external URI loading is disabled');
  }, 45_000);
  it.each([
    { extensionsUsed: ['EXT_meshopt_compression'] },
    { extensionsUsed: ['KHR_texture_basisu'] },
    { meshes: [{ primitives: [{ extensions: { KHR_draco_mesh_compression: {} } }] }] },
  ])('rejects optional or undeclared compressed data without attempting a decoder', extra => {
    const result = cli({ ...emptyGlb, ...extra });
    expect(result.status).toBe(1); expect(result.stderr).toContain('explicitly installed local decoder');
  }, 45_000);
  it('detects authored duplicate joint names before GLTFLoader renames them', () => {
    const result = cli({ ...emptyGlb, nodes: [{ name: 'joint' }, { name: 'joint' }], skins: [{ joints: [0, 1] }] });
    expect(result.status).toBe(1); expect(result.stderr).toContain('Duplicate source joint name');
  }, 45_000);
  it.each([0, 2])('retains a source weight error after GLTFLoader repairs a weight sum of %s', amount => {
    const binary = new Uint8Array(36); new DataView(binary.buffer).setFloat32(20, amount, true);
    const result = cli({
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
      nodes: [{ name: 'Root' }, { name: 'Body', mesh: 0, skin: 0 }], skins: [{ joints: [0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
      buffers: [{ byteLength: 36 }], bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 8 }, { buffer: 0, byteOffset: 20, byteLength: 16 },
      ], accessors: [
        { bufferView: 0, componentType: 5126, count: 1, type: 'VEC3', min: [0, 0, 0], max: [0, 0, 0] },
        { bufferView: 1, componentType: 5123, count: 1, type: 'VEC4' },
        { bufferView: 2, componentType: 5126, count: 1, type: 'VEC4' },
      ],
    }, binary);
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.errors.some((issue: { code: string }) => issue.code === 'invalid-source-skin-weight')).toBe(true);
    expect(report.errors.some((issue: { code: string }) => issue.code === 'invalid-skin-weight')).toBe(false);
    expect(report.sourceSkinValidation).toContain('before GLTFLoader normalization');
  }, 45_000);
});
