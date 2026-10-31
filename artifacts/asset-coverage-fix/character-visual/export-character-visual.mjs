import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Group, Matrix3, Matrix4, Mesh, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const output = 'artifacts/asset-coverage-fix/character-visual';
mkdirSync(output, { recursive: true });
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceFiles = [
  'src/presentation/CareView.ts', 'src/presentation/FirstPersonArms.ts', 'src/presentation/FirstPersonSeatedLegs.ts',
  'src/presentation/CarriedSupplyHands.ts', 'src/presentation/ImportedCharacter.ts', 'src/presentation/TacticalAnimations.ts',
  'src/presentation/WorldAK47.ts', 'src/presentation/GeneratedSceneAssets.ts', 'src/main.ts',
];
const hashes = Object.fromEntries(sourceFiles.map(path => [path, sha(path)]));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const sourceManifest = {}, cases = [], owners = [];
try {
  const { ModelLibrary } = await server.ssrLoadModule('/src/assets/ModelLibrary.ts');
  const { CareView } = await server.ssrLoadModule('/src/presentation/CareView.ts');
  const { CarriedSupplyHands } = await server.ssrLoadModule('/src/presentation/CarriedSupplyHands.ts');
  const { ImportedCharacter } = await server.ssrLoadModule('/src/presentation/ImportedCharacter.ts');
  const { GeneratedSceneAssets } = await server.ssrLoadModule('/src/presentation/GeneratedSceneAssets.ts');
  const { bindGeneratedProp, propPlacement } = await server.ssrLoadModule('/src/presentation/GeneratedPropBindings.ts');
  const library = new ModelLibrary(async source => {
    const path = 'public' + new URL(source.url).pathname, bytes = readFileSync(path), loader = new GLTFLoader();
    sourceManifest[source.id] = { path, sha256: sha(path), revision: source.revision, bytes: bytes.length };
    loader.register(() => ({ name: 'offline-texture-decode-substitute', loadTexture: async () => new Texture() }));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.traverse(o => {
      if (!(o instanceof Mesh)) return;
      o.userData.inspectionSource = path;
      o.userData.inspectionMaterials = (Array.isArray(o.material) ? o.material : [o.material]).map(m =>
        ({ index: gltf.parser.associations.get(m)?.materials ?? null, name: m.name }));
    });
    return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
  });
  owners.push(library);
  const freeze = (id, root, evidence, views) => {
    const meshes = [], bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, boneWorld = {}, regions = {};
    // Match renderer traversal: SkinnedMesh.updateMatrixWorld refreshes its
    // attached bindMatrixInverse; Object3D.updateWorldMatrix does not.
    root.updateMatrixWorld(true);
    root.traverseVisible(o => {
      if (!(o instanceof Mesh)) return;
      if (o instanceof SkinnedMesh) { o.skeleton.update(); for (const bone of o.skeleton.bones) boneWorld[bone.name] = bone.getWorldPosition(new Vector3()).toArray(); }
      const geometry = o.geometry, p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal');
      const positions = [], normals = [], v = new Vector3(), n = new Vector3(), skin = new Matrix4(), bone = new Matrix4(), linear = new Matrix3();
      const worldNormal = new Matrix3().getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); positions.push(...v.toArray());
        if (o instanceof SkinnedMesh) {
          const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
          for (const region of ['Head', 'NeckTwist01', 'NeckTwist02']) {
            let weight = 0;
            for (let j = 0; j < 4; j++) if (o.skeleton.bones[joints.getComponent(i, j)]?.name === region) weight += weights.getComponent(i, j);
            if (weight < .5) continue;
            const box = regions[region] ??= { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 }; box.count++;
            for (let axis = 0; axis < 3; axis++) { box.min[axis] = Math.min(box.min[axis], v.getComponent(axis)); box.max[axis] = Math.max(box.max[axis], v.getComponent(axis)); }
          }
        }
        for (let axis = 0; axis < 3; axis++) { bounds.min[axis] = Math.min(bounds.min[axis], v.getComponent(axis)); bounds.max[axis] = Math.max(bounds.max[axis], v.getComponent(axis)); }
        if (normal) {
          n.fromBufferAttribute(normal, i);
          if (o instanceof SkinnedMesh) {
            const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight'); skin.elements.fill(0);
            for (let j = 0; j < 4; j++) {
              bone.fromArray(o.skeleton.boneMatrices, joints.getComponent(i, j) * 16);
              for (let k = 0; k < 16; k++) skin.elements[k] += bone.elements[k] * weights.getComponent(i, j);
            }
            skin.premultiply(o.bindMatrixInverse).multiply(o.bindMatrix); linear.setFromMatrix4(skin); n.applyMatrix3(linear);
          }
          n.applyMatrix3(worldNormal).normalize(); normals.push(...n.toArray());
        }
      }
      if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite)) throw Error(`Non-finite mesh ${id}/${o.name}`);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      meshes.push({ name: o.name, source: o.userData.inspectionSource, materials: o.userData.inspectionMaterials,
        fallbackMaterials: mats.map(m => ({ name: m.name, color: m.color?.toArray(), emissive: m.emissive?.toArray(), opacity: m.opacity })),
        positions, normals, indices: geometry.index ? Array.from(geometry.index.array) : Array.from({ length: p.count }, (_, i) => i),
        uv: uv ? Array.from(uv.array) : null, groups: geometry.groups, croppedSourceVertexIndices: geometry.userData.sourceVertexIndices });
    });
    const doc = { id, evidence, views, bounds, boneWorld, regions, meshes };
    writeFileSync(`${output}/${id}.json`, JSON.stringify(doc));
    cases.push({ id, evidence, views, bounds, meshes: meshes.length, triangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0) });
  };
  const zhou = { id: 'player', name: '周延 · 二十三岁', role: 'ally' }, baseURL = 'https://example.invalid/';
  const care = new CareView(library); owners.push(care); await care.setCharacter(zhou, baseURL);
  if (care.status.legs.state !== 'ready') throw Error('Seat load failed');
  care.update([0, 0, 0], 0, 'seat', .8, true);
  freeze('zhou-seat', care.root, { status: care.status, input: { position: [0, 0, 0], yaw: 0, mode: 'seat', progress: .8, adjusted: true },
    contact: care.root.getObjectByName('first-person-production-seated-legs').userData.contact }, [
    { name: 'overview', camera: [1.5, 1.1, -2.2], target: [0, .3, -.28], ortho: 1.35 },
    { name: 'first-person', camera: [0, 1.18, .08], target: [0, .30, -.50], fov: 75 },
  ]);
  const supply = new Group(); supply.position.set(0, -.44, -.72);
  bindGeneratedProp(supply, 'first-person-supply', [propPlacement('first-person-supply', 'PROP-CARGO', [0, -.21, 0], .62, 'z', Math.PI / 2)]);
  const hands = new CarriedSupplyHands(library); owners.push(hands); supply.add(hands.root);
  const cargo = new GeneratedSceneAssets(library, { parent: supply, scenario: 'nightshift', baseURL, placements: [] }); owners.push(cargo);
  await Promise.all([hands.setCharacter(zhou, baseURL), cargo.ready]);
  if (hands.status.state !== 'ready' || cargo.getStatus().some(s => s.state !== 'ready')) throw Error('Supply load failed');
  freeze('zhou-supply', supply, { status: hands.status, cargo: cargo.getStatus(), exactMainPlacement: { root: [0, -.44, -.72], bottom: [0, -.21, 0], sourceAxis: 'z', metres: .62, yaw: Math.PI / 2 },
    contacts: hands.root.getObjectByName('first-person-character-arms').userData.contact }, [
    { name: 'first-person', camera: [0, 0, 0], target: [0, 0, -1], fov: 75 },
    { name: 'overview', camera: [1.1, .5, .5], target: [0, -.42, -.72], ortho: 1.25 },
  ]);
  const tacticalCases = [['enemy', 'CH-ENEMY', '敌兵'], ['lu', 'CH-LU', '陆闻川'], ['zhou', 'CH-ZHOU', '周延']]
    .flatMap(([prefix, assetId, label]) => ['left', 'right'].flatMap(side => [false, true].map(fire =>
      ({ id: `${prefix}-${fire ? 'fire' : 'aim'}-${side}`, assetId, label, side, fire }))));
  tacticalCases.push({ id: 'xu-aim-left', assetId: 'CH-XU', label: '许岚', side: 'left', fire: false });
  for (const { id, assetId, label, side, fire } of tacticalCases) {
    const actor = new ImportedCharacter(library, { id: assetId, name: label, role: assetId === 'CH-ENEMY' ? 'enemy' : 'ally' }, baseURL); owners.push(actor);
    await actor.ready; await actor.worldWeapon.ready;
    if (actor.root.userData.assetId !== assetId) throw Error(`Inspection identity mismatch: ${id} expected ${assetId}, got ${actor.root.userData.assetId}`);
    const pose = { walk: 0, aiming: true, down: false, armed: true, moveSpeed: 0, animationTime: 8.07,
      ...(fire ? { lastShotAt: 8.02 } : {}), combat: { phase: 'peek', moving: false, side, coverKey: 'inspection-cover' } };
    actor.setPose(pose);
    const expected = `cover_${fire ? 'fire' : 'aim'}_${side}`;
    if (actor.root.userData.motion.clip !== expected) throw Error(`Wrong runtime clip: ${id}`);
    freeze(id, actor.root, { poseInput: pose, motion: actor.root.userData.motion, tacticalStatus: actor.root.userData.tacticalStatus,
      weaponContact: actor.root.userData.weaponContact, shoulderContact: actor.root.userData.shoulderContact, assetStatus: actor.root.userData.assetStatus,
      scope: 'Synthetic simulation input through the actual frozen runtime presenter; not a captured gameplay event.' }, [
      { name: 'front', camera: [2.6, 1.8, 3.2], target: [0, .85, .15], ortho: 2.0 },
      ...(side === 'left' && !fire ? [{ name: 'side', camera: [-3, 1.5, .4], target: [0, .85, .15], ortho: 2.0 }] : []),
    ]);
  }
  const after = Object.fromEntries(sourceFiles.map(path => [path, sha(path)]));
  writeFileSync(`${output}/export-manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Frozen actual runtime mesh after skin.getVertexPosition; Node image decode substituted only. Blender reads original runtime GLB PBR textures. Not WebGL acceptance.',
    sourceHashes: hashes, sourceHashesAfter: after, sourceChangedDuringExport: sourceFiles.filter(path => hashes[path] !== after[path]), sources: sourceManifest, cases }, null, 2));
  console.log(JSON.stringify(cases.map(c => ({ id: c.id, meshes: c.meshes, triangles: c.triangles, bounds: c.bounds }))));
} finally { owners.reverse().forEach(owner => owner.dispose()); await server.close(); }
