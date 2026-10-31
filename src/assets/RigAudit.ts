import { AttachedBindMode, Bone, DetachedBindMode, Matrix4, Object3D, SkinnedMesh, type AnimationClip } from 'three';

export const RIG_JOINTS = ['root', 'pelvis', 'abdomen', 'chest', 'neck', 'head',
  'clavicle.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upper_arm.R', 'forearm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R'] as const;
export type RigJoint = typeof RIG_JOINTS[number];
export interface RigContract {
  profile: 'adult' | 'child';
  version: string;
  bones: Partial<Record<RigJoint, string>>;
}
export interface RigIssue { code: string; detail: string }
export interface RigHierarchyNode {
  name: string;
  parent: string | null;
  bone: boolean;
  localMatrix: number[];
  restMatrix: number[];
}
export interface RigAudit {
  profile: 'adult' | 'child';
  version: string;
  structureReady: boolean;
  errors: RigIssue[];
  warnings: RigIssue[];
  joints: { semantic: RigJoint; name: string; parent?: RigJoint; restMatrix: number[] }[];
  /** Every bone and intermediate transform, not just the semantic selection. */
  hierarchy: RigHierarchyNode[];
  skinnedMeshes: number;
  vertices: number;
  clips: { name: string; duration: number; tracks: number; valid: boolean }[];
  manualChecks: readonly string[];
}
const PARENTS: Partial<Record<RigJoint, RigJoint>> = {
  pelvis: 'root', abdomen: 'pelvis', chest: 'abdomen', neck: 'chest', head: 'neck',
  'clavicle.L': 'chest', 'upper_arm.L': 'clavicle.L', 'forearm.L': 'upper_arm.L', 'hand.L': 'forearm.L',
  'clavicle.R': 'chest', 'upper_arm.R': 'clavicle.R', 'forearm.R': 'upper_arm.R', 'hand.R': 'forearm.R',
  'thigh.L': 'pelvis', 'shin.L': 'thigh.L', 'foot.L': 'shin.L', 'toe.L': 'foot.L',
  'thigh.R': 'pelvis', 'shin.R': 'thigh.R', 'foot.R': 'shin.R', 'toe.R': 'foot.R',
};
const MANUAL_CHECKS = [
  '逐关节转动：权重串动、拉伸、穿插与关节旋转中心',
  '脚底、握持、枪械、担架和抱持接触；开始、循环与结束',
  '第二名成人共用动作实测；儿童步幅、重心及抱持独立校准',
  '第一人称关卡、暂停、跳过、检查点恢复与Windows运行',
] as const;
const validMatrixArray = (values: readonly number[]): boolean => values.length === 16 && values.every(Number.isFinite)
  && Math.abs(values[3]) < 1e-6 && Math.abs(values[7]) < 1e-6 && Math.abs(values[11]) < 1e-6 && Math.abs(values[15] - 1) < 1e-6
  && Math.abs(new Matrix4().fromArray(values).determinant()) > 1e-10;
const finiteMatrix = (matrix: Matrix4): boolean => Boolean(matrix?.elements) && validMatrixArray(matrix.elements);
const matrixMatches = (a: readonly number[], b: readonly number[], tolerance = 0.001): boolean => validMatrixArray(a) && validMatrixArray(b)
  && a.every((value, i) => Math.abs(value - b[i]) <= tolerance);
const IDENTITY = new Matrix4().toArray();
function within(node: Object3D | null, ancestor: Object3D): boolean {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

/** Inspect the imported rest pose. A successful structural report is NOT animation acceptance. */
export function auditRig(root: Object3D, contract: RigContract, clips: readonly AnimationClip[] = []): RigAudit {
  const errors: RigIssue[] = [], warnings: RigIssue[] = [];
  const issue = (code: string, detail: string) => errors.push({ code, detail });
  const all = new Set<Object3D>(), names = new Map<string, Object3D[]>(), meshes: SkinnedMesh[] = [];
  root.traverse(node => {
    all.add(node); names.set(node.name, [...(names.get(node.name) ?? []), node]);
    if (node instanceof SkinnedMesh) meshes.push(node);
  });
  root.updateMatrixWorld(true);
  if (typeof contract.version !== 'string' || !contract.version.trim()) issue('missing-version', '基础骨架须有版本。');
  if (contract.profile !== 'adult' && contract.profile !== 'child') issue('invalid-profile', '骨架类别必须是 adult 或 child。');
  if (!finiteMatrix(root.matrixWorld)) issue('invalid-root-transform', root.name || 'scene');
  if (![root.scale.x, root.scale.y, root.scale.z].every(n => Number.isFinite(n) && n > 0)) issue('invalid-root-scale', root.name || 'scene');
  const selected = new Map<RigJoint, Object3D>(), used = new Map<Object3D, RigJoint>();
  for (const semantic of RIG_JOINTS) {
    const name = contract.bones[semantic];
    if (typeof name !== 'string' || !name.trim()) { issue('missing-mapping', semantic); continue; }
    const matches = names.get(name) ?? [];
    if (matches.length !== 1) { issue(matches.length ? 'ambiguous-node' : 'missing-node', `${semantic}: ${name}`); continue; }
    const node = matches[0];
    if (!(node instanceof Bone) && !(semantic === 'root' && !('isMesh' in node))) { issue('not-a-bone', `${semantic}: ${name}`); continue; }
    if (used.has(node)) issue('shared-joint', `${semantic} 与 ${used.get(node)} 共用 ${name}`);
    used.set(node, semantic); selected.set(semantic, node);
    if (!finiteMatrix(node.matrixWorld)) issue('invalid-joint-transform', name);
    if (![node.scale.x, node.scale.y, node.scale.z].every(n => Number.isFinite(n) && n > 0)) issue('invalid-joint-scale', name);
    else if (Math.max(node.scale.x, node.scale.y, node.scale.z) - Math.min(node.scale.x, node.scale.y, node.scale.z) > 0.001) warnings.push({ code: 'nonuniform-joint-scale', detail: name });
  }
  for (const [joint, expected] of Object.entries(PARENTS) as [RigJoint, RigJoint][]) {
    const child = selected.get(joint), parent = selected.get(expected);
    // Helpers are allowed, but crossing another mapped joint is not. For example,
    // Hip → Pelvis(helper) → thigh remains valid; chest → head → clavicle does not.
    let nearest: Object3D | null = child?.parent ?? null;
    while (nearest && !used.has(nearest)) nearest = nearest.parent;
    if (child && parent && nearest !== parent) issue('wrong-hierarchy', `${joint} 最近的已映射父关节必须为 ${expected}`);
  }
  const rigRoot = selected.get('root'), hierarchyNodes = new Set<Object3D>();
  for (const node of all) if (node instanceof Bone || used.has(node)) {
    for (let current: Object3D | null = node; current && current !== root; current = current.parent) hierarchyNodes.add(current);
  }
  if (rigRoot === root) hierarchyNodes.add(root);
  for (const node of hierarchyNodes) {
    if (!node.name.trim()) issue('unnamed-rig-node', node.type);
    else if ((names.get(node.name)?.length ?? 0) !== 1) issue('ambiguous-rig-node', node.name);
    if (!finiteMatrix(node.matrixWorld) || !finiteMatrix(node.matrix)) issue('invalid-rig-transform', node.name);
    if (![node.scale.x, node.scale.y, node.scale.z].every(n => Number.isFinite(n) && n > 0)) issue('invalid-rig-scale', node.name);
  }
  let vertices = 0;
  const weighted = new Set<Bone>();
  if (!meshes.length) issue('no-skin', '没有 SkinnedMesh；此检查器不能据普通静态网格确认蒙皮。');
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton || !skeleton.bones.length) { issue('missing-skeleton', mesh.name); continue; }
    if (new Set(skeleton.bones).size !== skeleton.bones.length) issue('duplicate-skeleton-bone', mesh.name);
    if (skeleton.bones.some(bone => !(bone instanceof Bone))) issue('invalid-skeleton-bone', mesh.name);
    if (skeleton.bones.some(bone => !all.has(bone))) issue('external-skeleton-bone', mesh.name);
    if (rigRoot && skeleton.bones.some(bone => !within(bone, rigRoot))) issue('bone-outside-rig-root', mesh.name);
    if (skeleton.bones.length !== skeleton.boneInverses.length || skeleton.boneInverses.some(m => !finiteMatrix(m))) issue('invalid-bind-inverses', mesh.name);
    if (!finiteMatrix(mesh.bindMatrix) || !finiteMatrix(mesh.bindMatrixInverse)) issue('invalid-bind-matrix', mesh.name);
    if (mesh.bindMode !== AttachedBindMode && mesh.bindMode !== DetachedBindMode) issue('invalid-bind-mode', mesh.name);
    // At the supplied bind/rest pose each joint must leave mesh-local vertices in
    // place. This includes current owner placement, which cancels in attached mode.
    // An invertible but wrong inverse bind otherwise passes the structural checks.
    let mismatchedBinds = 0;
    for (let i = 0; i < skeleton.bones.length; i++) {
      const bone = skeleton.bones[i], inverse = skeleton.boneInverses[i];
      if (!(bone instanceof Bone) || !finiteMatrix(bone.matrixWorld) || !finiteMatrix(inverse)
        || !finiteMatrix(mesh.bindMatrix) || !finiteMatrix(mesh.bindMatrixInverse)) continue;
      const skin = new Matrix4().copy(mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(inverse).multiply(mesh.bindMatrix);
      if (!matrixMatches(skin.elements, IDENTITY)) mismatchedBinds++;
    }
    if (mismatchedBinds) issue('rest-bind-mismatch', `${mesh.name}: ${mismatchedBinds} 关节的休止姿态与绑定不一致；须确认导入的是绑定休止姿态`);
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getAttribute('skinIndex'), weight = mesh.geometry.getAttribute('skinWeight');
    if (!position || !index || !weight || position.itemSize !== 3 || index.itemSize !== 4 || weight.itemSize !== 4
      || !Number.isInteger(position.count) || position.count <= 0 || position.count !== index.count || position.count !== weight.count) {
      issue('invalid-skin-attributes', mesh.name); continue;
    }
    vertices += position.count;
    let badIndex = 0, badWeight = 0, badPosition = 0;
    for (let i = 0; i < position.count; i++) {
      if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) badPosition++;
      let sum = 0, invalidWeight = false, invalidIndex = false;
      for (let c = 0; c < 4; c++) {
        const boneIndex = index.getComponent(i, c), amount = weight.getComponent(i, c);
        if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= skeleton.bones.length) invalidIndex = true;
        if (!Number.isFinite(amount) || amount < 0 || amount > 1) invalidWeight = true;
        sum += amount;
        if (Number.isFinite(amount) && amount > 0 && skeleton.bones[boneIndex] instanceof Bone) weighted.add(skeleton.bones[boneIndex]);
      }
      if (invalidIndex) badIndex++;
      if (invalidWeight || !Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) badWeight++;
    }
    if (badIndex) issue('invalid-skin-index', `${mesh.name}: ${badIndex} 顶点`);
    if (badWeight) issue('invalid-skin-weight', `${mesh.name}: ${badWeight} 顶点`);
    if (badPosition) issue('invalid-position', `${mesh.name}: ${badPosition} 顶点`);
  }
  for (const [semantic, joint] of selected) {
    if (semantic !== 'root' && ![...weighted].some(bone => within(bone, joint))) issue('joint-controls-no-skin', semantic);
  }
  const rootInverse = root.matrixWorld.clone().invert();
  const joints = [...selected].map(([semantic, node]) => {
    let parent: RigJoint | undefined;
    for (let ancestor = node.parent; ancestor && ancestor !== root.parent; ancestor = ancestor.parent) {
      const mapped = used.get(ancestor); if (mapped) { parent = mapped; break; }
    }
    return { semantic, name: node.name, parent, restMatrix: new Matrix4().multiplyMatrices(rootInverse, node.matrixWorld).toArray() };
  });
  const hierarchy = [...hierarchyNodes].map(node => ({ name: node.name,
    parent: node.parent && hierarchyNodes.has(node.parent) ? node.parent.name : null, bone: node instanceof Bone,
    localMatrix: node === root ? [...IDENTITY] : node.matrix.toArray(),
    restMatrix: new Matrix4().multiplyMatrices(rootInverse, node.matrixWorld).toArray(),
  }));
  const clipReports = clips.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length,
    valid: Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks.length > 0 && clip.validate() }));
  for (const clip of clipReports) if (!clip.valid) warnings.push({ code: 'empty-or-invalid-clip', detail: clip.name });
  if (!clips.length) warnings.push({ code: 'no-animation-clips', detail: '没有动作片段；此报告不证明动作共用或动作质量。' });
  return { profile: contract.profile, version: contract.version, structureReady: errors.length === 0, errors, warnings, joints,
    hierarchy, skinnedMeshes: meshes.length, vertices, clips: clipReports, manualChecks: MANUAL_CHECKS };
}

/** Matching full rest skeletons plus available clip data permit a trial, never animation acceptance. */
export function compareAdultRigs(a: RigAudit, b: RigAudit): { canAttemptSharedAnimations: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!a.structureReady || !b.structureReady) reasons.push('结构检查未通过');
  if (a.profile !== 'adult' || b.profile !== 'adult') reasons.push('儿童须独立校准');
  if (!a.version?.trim() || a.version !== b.version) reasons.push('基础骨架版本不同');
  if (![...a.clips, ...b.clips].some(clip => clip.valid && clip.tracks > 0 && Number.isFinite(clip.duration) && clip.duration > 0)) reasons.push('未提供可试用动作；结构匹配不等于动作共用');
  if (a.joints.length !== RIG_JOINTS.length || b.joints.length !== RIG_JOINTS.length
    || new Set(a.joints.map(j => j.semantic)).size !== RIG_JOINTS.length || new Set(b.joints.map(j => j.semantic)).size !== RIG_JOINTS.length) reasons.push('语义关节记录缺失或重复');
  for (const semantic of RIG_JOINTS) {
    const left = a.joints.find(j => j.semantic === semantic), right = b.joints.find(j => j.semantic === semantic);
    if (!left || !right || left.name !== right.name || left.parent !== right.parent
      || !matrixMatches(left.restMatrix, right.restMatrix)) reasons.push(`${semantic} 的命名、层级或休止变换不一致`);
  }
  if (!a.hierarchy?.length || !b.hierarchy?.length) reasons.push('缺少完整骨架层级记录；旧报告须重新审计');
  else {
    const right = new Map(b.hierarchy.map(node => [node.name, node]));
    if (a.hierarchy.length !== b.hierarchy.length || right.size !== b.hierarchy.length || new Set(a.hierarchy.map(node => node.name)).size !== a.hierarchy.length) reasons.push('完整骨架节点数量或唯一命名不一致');
    for (const left of a.hierarchy) {
      const other = right.get(left.name);
      if (!other || left.parent !== other.parent || left.bone !== other.bone
        || !matrixMatches(left.localMatrix, other.localMatrix) || !matrixMatches(left.restMatrix, other.restMatrix)) reasons.push(`${left.name} 的完整层级或局部休止变换不一致`);
    }
  }
  return { canAttemptSharedAnimations: reasons.length === 0, reasons };
}
