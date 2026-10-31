// Run from the project root with Node 22: node artifacts/asset-jobs/WP-AK47-import/inspect-import.mjs
// This is geometry evidence only. No browser, GPU rendering or real image decoding takes place.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Matrix4, Mesh, PerspectiveCamera, Texture, Vector3, Vector4 } from 'three';

const rawPath = 'assets/source/WP-AK47/ak47_reloadable_world.glb';
const runtimePath = 'public/models/weapons/ak47-world-r1.glb';
const bytes = readFileSync(rawPath), runtime = readFileSync(runtimePath);
const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryStart = 20 + jsonLength + 8;
const pngs = json.images.map(image => {
  const view = json.bufferViews[image.bufferView], offset = binaryStart + (view.byteOffset ?? 0);
  return { name: image.name, embedded: !image.uri, bytes: view.byteLength, width: bytes.readUInt32BE(offset + 16), height: bytes.readUInt32BE(offset + 20) };
});
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let library, weapon;
try {
  const { ModelLibrary } = await server.ssrLoadModule('/src/assets/ModelLibrary.ts');
  const { ImportedWeaponView } = await server.ssrLoadModule('/src/presentation/ImportedWeaponView.ts');
  const { AK47_ASSET, ak47Source } = await server.ssrLoadModule('/src/assets/weapon-catalog.ts');
  library = new ModelLibrary(async () => {
    const loader = new GLTFLoader().register(() => ({ name: 'geometry-inspection-image-decode-only', loadTexture: async () => new Texture() }));
    const loaded = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    return { scene: loaded.scene, scenes: loaded.scenes, animations: loaded.animations };
  });
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  weapon = new ImportedWeaponView(library, ak47Source('https://geometry-check.invalid/index.html'), status => {
    if (status.state === 'ready') resolveReady();
    if (status.state === 'error') rejectReady(new Error(status.message));
  });
  await ready;
  const mount = weapon.root.getObjectByName('imported-weapon-mount');
  let visibleMeshes = 0, visibleTriangles = 0;
  mount.traverseVisible(node => { if (node instanceof Mesh) { visibleMeshes++; visibleTriangles += node.geometry.index.count / 3; } });
  const ads = [];
  for (const [width, height] of [[1366, 768], [844, 390], [390, 844]]) {
    weapon.setPose(0, 0, 1, 0); weapon.root.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(54, width / height, 0.045, 1000);
    const markers = {};
    for (const name of ['ganymede-front-sight', 'ganymede-rear-sight']) {
      const p = weapon.root.getObjectByName(name).getWorldPosition(new Vector3()).project(camera);
      markers[name] = { ndc: p.toArray(), pixelErrorFromCenter: [p.x * width / 2, p.y * height / 2] };
    }
    ads.push({ width, height, markers });
  }
  const camera = new PerspectiveCamera(75, 1366 / 768, 0.045, 1000);
  const v = new Vector3(), clip = new Vector4(), matrix = new Matrix4();
  let samples = 0, sampledVertices = 0, maximumBottomMargin = -Infinity;
  for (const aim of [0, 0.5, 1]) for (const recoil of [0, 1]) for (const reload of [0, 0.35, 0.65, 0.9]) for (const walk of [0, 2]) {
    samples++; weapon.setPose(recoil, reload, aim, walk);
    weapon.root.position.y -= 0.62; weapon.root.position.z += 0.18; weapon.root.rotation.x -= 0.55;
    weapon.root.updateMatrixWorld(true); camera.fov = 75 - aim * 21; camera.updateProjectionMatrix();
    weapon.root.traverseVisible(node => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position'); matrix.multiplyMatrices(camera.projectionMatrix, node.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        sampledVertices++; v.fromBufferAttribute(positions, i); clip.set(v.x, v.y, v.z, 1).applyMatrix4(matrix);
        maximumBottomMargin = Math.max(maximumBottomMargin, clip.y + clip.w);
      }
    });
  }
  const nodes = json.nodes.filter(node => AK47_ASSET.requiredNodes.includes(node.name)).map(node => ({ name: node.name, translation: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1] }));
  const report = {
    recordedDate: '2026-10-31', asset: 'WP-AK47', scope: 'One representative AK-47 body; block arms remain placeholders',
    cost: { externalGenerationJobs: 0, networkDownloads: 0, paidServices: 0 },
    origin: { localPack: '/Users/penguin/Assets/lowpoly-military/packs/github-operation-steel-tide-ak47', originalCreator: 'taradavies', adaptation: 'Operation Steel Tide / AetherRadar', adaptationCommit: AK47_ASSET.provenance.adaptationRevision },
    license: { geometry: 'CC0-1.0', adaptationAndEmbeddedTextures: 'MIT', verifiedAgainstLocalFiles: ['SOURCE_LICENSE.md', 'LICENSE', 'pack.json', 'catalog/assets.json entry'], originalExternalImagesAndHDR: 'Not included according to SOURCE_LICENSE.md; adapted embedded images retained', independentOnlineLicenseRevalidation: false },
    files: { source: { path: rawPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, runtime: { path: runtimePath, bytes: runtime.length, sha256: createHash('sha256').update(runtime).digest('hex') }, byteIdentical: bytes.equals(runtime) },
    resources: { externalURIs: [...json.buffers, ...json.images].flatMap(resource => resource.uri ? [resource.uri] : []), requiredExtensions: json.extensionsRequired ?? [], skins: json.skins?.length ?? 0, animationClips: json.animations?.length ?? 0, sourceMeshResources: json.meshes.length, materials: json.materials.length, textureEntries: json.textures.length, samplerEntries: json.samplers.length, embeddedImages: pngs, visibleDefaultMeshes: visibleMeshes, visibleDefaultTriangles: visibleTriangles, measuredRendererDrawCalls: null, measuredGPUTextureBytes: null },
    nodeInspection: nodes, calibration: mount.userData.calibration, defaultHiddenNodes: AK47_ASSET.defaultHiddenNodes,
    geometryChecks: { parser: 'Three.js 0.186 GLTFLoader.parseAsync; only image decoding replaced by empty Texture objects', ads, heldItemFullyLowered: { samples, sampledVertices, maximumBottomMargin, allVerticesBelowBottomClipPlane: maximumBottomMargin < 0 } },
    remaining: ['Real embedded PNG decoding and PBR materials in the game renderer', 'First-person near hand/contact and reload timing review', 'Normal-speed hip fire / ADS / reload / wall lowering / transition visual checks', 'Desktop and mobile GPU cost, thermal and memory measurements', 'Windows EXE packaged resource loading', 'No other named firearm is imported or enabled by this change'],
  };
  writeFileSync('artifacts/asset-jobs/WP-AK47-import/import-record.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ visibleMeshes, visibleTriangles, scale: report.calibration.uniformScale, samples, sampledVertices, maximumBottomMargin, externalURIs: report.resources.externalURIs }));
} finally {
  weapon?.dispose(); library?.dispose(); await server.close();
}
