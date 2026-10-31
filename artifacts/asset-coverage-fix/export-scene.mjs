// Offline inspection only: real scene builders, GLB geometry, transforms and LOD.
// Node substitutes texture decoding; Blender imports the actual embedded images.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { Box3, Frustum, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const scenario = process.argv[2] ?? 'workers';
const views = { workers: { position: [0, 1.62, 33], target: [0, 1.62, 3] },
  escort: { position: [4, 6, 28], target: [0, 1, -10] }, medical: { position: [0, 1.62, 17], target: [0, 1.62, -12] } };
const cameraView = views[scenario]; if (!cameraView) throw Error('Choose an authored inspection view');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { ModelLibrary } = await server.ssrLoadModule('/src/assets/ModelLibrary.ts');
  const { buildEnvironment } = await server.ssrLoadModule('/src/presentation/environment.ts');
  const { GeneratedArchitecture } = await server.ssrLoadModule('/src/presentation/GeneratedArchitecture.ts');
  const { GeneratedSceneAssets } = await server.ssrLoadModule('/src/presentation/GeneratedSceneAssets.ts');
  const library = new ModelLibrary(async source => {
    const path = 'public' + new URL(source.url).pathname, bytes = readFileSync(path), loader = new GLTFLoader();
    loader.register(() => ({ name: 'offline-image-decoder-substitute', loadTexture: async () => new Texture() }));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.traverse(o => { if (o instanceof Mesh) for (const mat of [o.material].flat()) mat.userData.offlineSource = { path, name: mat.name }; });
    return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
  });
  const env = buildEnvironment(scenario), options = { parent: env.root, scenario, baseURL: 'https://example.invalid/' };
  const architecture = new GeneratedArchitecture(library, options), props = new GeneratedSceneAssets(library, options);
  const [archStatus, propStatus] = await Promise.all([architecture.ready, props.ready]);
  const failed = [...archStatus, ...propStatus].filter(s => s.state !== 'ready'); if (failed.length) throw Error(JSON.stringify(failed));
  env.root.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(70, 16 / 9, .1, 300); camera.position.set(...cameraView.position); camera.lookAt(...cameraView.target); camera.updateMatrixWorld(true);
  architecture.update(camera.position); env.root.updateMatrixWorld(true);
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const geometries = {}, materials = {}, objects = [];
  env.root.traverseVisible(o => {
    if (!(o instanceof Mesh)) return;
    const geometry = o.geometry; if (!geometry.boundingBox) geometry.computeBoundingBox();
    const matrices = []; const count = o instanceof InstancedMesh ? o.count : 1;
    for (let i = 0; i < count; i++) {
      const matrix = o.matrixWorld.clone();
      if (o instanceof InstancedMesh) { const instance = new Matrix4(); o.getMatrixAt(i, instance); matrix.multiply(instance); }
      if (Math.abs(matrix.determinant()) < 1e-12) continue;
      const box = geometry.boundingBox.clone().applyMatrix4(matrix); if (frustum.intersectsBox(box)) matrices.push(matrix.toArray());
    }
    if (!matrices.length) return;
    const id = geometry.uuid, attr = geometry.attributes;
    if (!geometries[id]) geometries[id] = { position: Array.from(attr.position.array), normal: attr.normal ? Array.from(attr.normal.array) : null,
      uv: attr.uv ? Array.from(attr.uv.array) : null, color: attr.color ? Array.from(attr.color.array) : null,
      indices: geometry.index ? Array.from(geometry.index.array) : Array.from({ length: attr.position.count }, (_, i) => i), groups: geometry.groups };
    const mats = [o.material].flat();
    for (const material of mats) if (!materials[material.uuid]) materials[material.uuid] = { ...material.userData.offlineSource,
      color: material.color?.toArray() ?? [.5, .5, .5], roughness: material.roughness ?? .8,
      metalness: material.metalness ?? 0, vertexColors: material.vertexColors, opacity: material.opacity };
    objects.push({ name: o.name, geometry: id, materials: mats.map(m => m.uuid), matrices, provenance: o.userData.generatedArchitecture });
  });
  const file = `artifacts/asset-coverage-fix/${scenario}-assembly.json`;
  writeFileSync(file, JSON.stringify({ scope: 'Offline scenery inspection. Real scene/GLB/LOD; no browser rendering, input or performance acceptance.', scenario,
    camera: { ...cameraView, fov: 70 }, geometries, materials, objects, archStatus, propStatus }));
  console.log(JSON.stringify({ file, geometries: Object.keys(geometries).length, groups: objects.length, instances: objects.reduce((n, o) => n + o.matrices.length, 0) }));
  props.dispose(); architecture.dispose(); env.dispose(); library.dispose();
} finally { await server.close(); }
