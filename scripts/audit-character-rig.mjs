import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { Texture, Bone, LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { auditRig, RIG_JOINTS } from '../src/assets/RigAudit.ts';

const args = process.argv.slice(2);
const value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
const file = value('--file'), map = value('--map'), out = value('--out');
if (!file || args.includes('--help')) {
  console.log('npm run audit:rig -- --file model.glb [--map rig-map.json] [--out report.json]');
  console.log('Without --map, lists the actual bone names and reports unmapped joints. This checks structure, not textures or animation quality.');
  process.exit(file ? 0 : 1);
}
let gltf, blockedFetch = false;
const originalFetch = globalThis.fetch;
try {
  const bytes = await readFile(resolve(file));
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Expected a complete glTF 2.0 GLB.');
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength > bytes.length - 20) throw new Error('Invalid JSON chunk length.');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri !== undefined)) throw new Error('Audit requires embedded GLB resources; external URI loading is disabled.');
  const compressed = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']);
  const checkExtensions = value => {
    if (!value || typeof value !== 'object') return;
    if (['extensionsUsed', 'extensionsRequired'].some(key => Array.isArray(value[key]) && value[key].some(name => compressed.has(name)))
      || value.extensions && Object.keys(value.extensions).some(name => compressed.has(name))) throw new Error('Compressed asset requires an explicitly installed local decoder before this audit.');
    for (const child of Object.values(value)) checkExtensions(child);
  };
  checkExtensions(json);
  // GLTFLoader uniquifies duplicate source names. Catch ambiguous authored joint
  // names before that rewrite could make an ambiguous semantic map look valid.
  const sourceJointNames = new Map();
  for (const skin of json.skins ?? []) {
    if (!Array.isArray(skin.joints) || new Set(skin.joints).size !== skin.joints.length) throw new Error('Skin joint indices must be unique.');
    for (const index of skin.joints) {
      if (!Number.isInteger(index) || index < 0 || !json.nodes?.[index]) throw new Error('Skin refers to an invalid joint node.');
      const name = json.nodes[index].name;
      if (typeof name === 'string' && name) {
        if (sourceJointNames.has(name) && sourceJointNames.get(name) !== index) throw new Error(`Duplicate source joint name: ${name}`);
        sourceJointNames.set(name, index);
      }
    }
  }
  const contract = map ? JSON.parse(await readFile(resolve(map), 'utf8')) : { profile: 'adult', version: '', bones: {} };
  if (!contract || !['adult', 'child'].includes(contract.profile) || typeof contract.version !== 'string' || !contract.bones || typeof contract.bones !== 'object' || Array.isArray(contract.bones)
    || RIG_JOINTS.some(joint => contract.bones[joint] !== undefined && typeof contract.bones[joint] !== 'string')) throw new Error('Map must declare profile adult/child, string version, and bone-name strings.');
  const manager = new LoadingManager();
  manager.setURLModifier(() => { throw new Error('Audit resource requests are disabled; use an embedded GLB.'); });
  // Defense in depth: even a loader path that bypasses LoadingManager cannot
  // access the network. The one-shot process restores this in finally.
  globalThis.fetch = async () => { throw new Error('Network access is disabled during structural audit.'); };
  blockedFetch = true;
  const loader = new GLTFLoader(manager);
  const sourceSkinErrors = [];
  // Node has no browser image decoder. Geometry, skins and animation tracks are
  // parsed normally; texture checks explicitly remain outside this report.
  loader.register(parser => ({ name: 'PROJECT_RIG_AUDIT_TEXTURES', loadTexture: () => Promise.resolve(new Texture()),
    // GLTFLoader normalizes malformed skin weights while constructing meshes,
    // including replacing all-zero weights. Inspect accessors before that repair.
    beforeRoot: async () => {
      const accessors = new Set();
      for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
        if (primitive.attributes?.WEIGHTS_0 !== undefined) accessors.add(primitive.attributes.WEIGHTS_0);
      }
      for (const index of accessors) {
        const weight = await parser.getDependency('accessor', index);
        if (!weight || weight.itemSize !== 4 || !Number.isInteger(weight.count) || weight.count <= 0) {
          sourceSkinErrors.push({ code: 'invalid-source-skin-attributes', detail: `WEIGHTS_0 accessor ${index}` }); continue;
        }
        let bad = 0;
        for (let vertex = 0; vertex < weight.count; vertex++) {
          let sum = 0, invalid = false;
          for (let component = 0; component < 4; component++) {
            const amount = weight.getComponent(vertex, component); sum += amount;
            if (!Number.isFinite(amount) || amount < 0 || amount > 1) invalid = true;
          }
          if (invalid || !Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) bad++;
        }
        if (bad) sourceSkinErrors.push({ code: 'invalid-source-skin-weight', detail: `WEIGHTS_0 accessor ${index}: ${bad} 顶点在导入器归一化前无效` });
      }
    },
  }));
  gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const boneNames = [];
  gltf.scene.traverse(node => { if (node instanceof Bone) boneNames.push({ name: node.name, parent: node.parent?.name ?? null }); });
  const audit = auditRig(gltf.scene, contract, gltf.animations);
  audit.errors.push(...sourceSkinErrors); audit.structureReady = audit.errors.length === 0;
  const report = { file: relative(process.cwd(), resolve(file)), sha256: createHash('sha256').update(bytes).digest('hex'),
    textureValidation: 'NOT_RUN: image decoding replaced for structural CLI inspection', boneNames,
    animationValidation: 'NOT_RUN: track data inspected; motion quality and cross-character playback not exercised',
    sourceSkinValidation: 'WEIGHTS_0 accessors checked before GLTFLoader normalization',
    sceneScope: { name: gltf.scene.name, index: gltf.scenes.indexOf(gltf.scene), total: gltf.scenes.length, inactiveScenesAudited: false },
    ...audit };
  const text = JSON.stringify(report, null, 2) + '\n';
  if (out) { await writeFile(resolve(out), text); console.log(`${report.structureReady ? 'STRUCTURE_READY' : 'NEEDS_WORK'}: ${report.errors.length} errors, ${boneNames.length} bones; ${out}`); }
  else process.stdout.write(text);
  if (!report.structureReady) process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  if (blockedFetch) globalThis.fetch = originalFetch;
  // The one-shot CLI creates no WebGL context. Release in-memory inspection objects.
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  for (const scene of gltf?.scenes ?? []) scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
      materials.add(material); for (const item of Object.values(material)) if (item?.isTexture) textures.add(item);
    }
  });
  for (const item of [...geometries, ...materials, ...textures, ...skeletons]) item.dispose();
}
