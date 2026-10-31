// Run with Node 22 --experimental-strip-types. No renderer/browser or image decoder.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, Matrix4, Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SCENE_ASSETS, generatedScenePlacements } from '../../../src/assets/scene-asset-catalog.ts';

const report = { scope: 'Actual GLTFLoader vertex/node/material parsing. Image-to-Texture decode substituted in Node. No rendered-image, gameplay or Windows acceptance.', assets: [], placements: [] };
for (const [id, asset] of Object.entries(SCENE_ASSETS)) {
  const bytes = readFileSync(new URL(`../../../public/${asset.runtimePath}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'audit-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const points = [], geometries = new Set(), materials = new Set(), textures = new Set();
  let meshes = 0, triangles = 0, invalidVertices = 0, invalidNormals = 0, normalMin = Infinity, normalMax = -Infinity;
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++; geometries.add(object.geometry);
    const position = object.geometry.getAttribute('position'), normals = object.geometry.getAttribute('normal');
    triangles += (object.geometry.index?.count ?? position.count) / 3;
    for (let index = 0; index < position.count; index++) {
      const point = new Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (point.toArray().some(value => !Number.isFinite(value))) invalidVertices++;
      points.push(point);
      const normal = new Vector3().fromBufferAttribute(normals, index), length = normal.length();
      if (!Number.isFinite(length) || length === 0) invalidNormals++;
      normalMin = Math.min(normalMin, length); normalMax = Math.max(normalMax, length);
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  const bounds = new Box3().setFromPoints(points), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  report.assets.push({ id, bytes: bytes.length, runtimeSha256: createHash('sha256').update(bytes).digest('hex'), meshes, geometries: geometries.size,
    materials: materials.size, textureObjects: textures.size, vertices: points.length, triangles, invalidVertices, invalidNormals,
    normalLength: [normalMin, normalMax], sourceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, clips: gltf.animations.length,
    pbr: [...materials].map(material => ({ type: material.type, opacity: material.opacity, transparent: material.transparent,
      side: material.side, baseColor: Boolean(material.map), normal: Boolean(material.normalMap), metallic: Boolean(material.metalnessMap), roughness: Boolean(material.roughnessMap) })) });
  for (const scenario of ['frontgate', 'medical', 'epilogue']) for (const placement of generatedScenePlacements(scenario).filter(item => item.assetId === id)) {
    const scale = placement.size.metres / size[placement.size.axis];
    const transform = new Matrix4().makeTranslation(...placement.position).multiply(new Matrix4().makeRotationY(placement.yaw))
      .multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const world = new Box3().setFromPoints(points.map(point => point.clone().applyMatrix4(transform)));
    report.placements.push({ id: placement.id, scenario, assetId: id, role: placement.role, sourceScale: scale, yaw: placement.yaw,
      position: placement.position, dimensions: world.getSize(new Vector3()).toArray(), bounds: { min: world.min.toArray(), max: world.max.toArray() },
      support: placement.support, fallbackSlot: placement.fallbackSlot ?? null });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
writeFileSync(new URL('./runtime-geometry-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ assets: report.assets.length, placements: report.placements.length, invalidVertices: report.assets.reduce((sum, item) => sum + item.invalidVertices, 0), invalidNormals: report.assets.reduce((sum, item) => sum + item.invalidNormals, 0) }) + '\n');
