import type { BufferGeometry, InstancedMesh, Material, Object3D, Skeleton, SkinnedMesh, Texture } from 'three';
import type { ModelTemplate } from './model-contracts';

function texture(value: unknown): value is Texture {
  return Boolean(value && typeof value === 'object' && (value as Texture).isTexture);
}

function materialTextures(material: Material, textures: Set<Texture>): void {
  for (const value of Object.values(material)) {
    if (texture(value)) textures.add(value);
    else if (Array.isArray(value)) for (const item of value) if (texture(item)) textures.add(item);
  }
  // ShaderMaterial uniforms can contain nested arrays/structs, including cycles.
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
    visited.add(value);
    if (texture(value)) { textures.add(value); return; }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit((material as Material & { uniforms?: unknown }).uniforms);
}

function closeImage(value: unknown, closed: Set<object>): void {
  if (!value || typeof value !== 'object' || closed.has(value)) return;
  closed.add(value);
  if (Array.isArray(value)) { for (const image of value) closeImage(image, closed); return; }
  const image = value as { close?: () => void; data?: unknown };
  if (typeof image.close === 'function') image.close();
  else if (image.data && !ArrayBuffer.isView(image.data)) closeImage(image.data, closed);
}

/** Instance-owned GPU state; never dispose shared geometry, materials or map images here. */
export function disposeModelInstance(root: Object3D): void {
  const skeletons = new Set<Skeleton>();
  root.traverse(object => {
    const mesh = object as SkinnedMesh & InstancedMesh;
    if (mesh.isSkinnedMesh && mesh.skeleton) skeletons.add(mesh.skeleton);
    if (mesh.isInstancedMesh) mesh.dispose();
  });
  const textures = new Set<Texture>();
  for (const skeleton of skeletons) {
    const boneTexture = skeleton.boneTexture;
    if (boneTexture && textures.has(boneTexture)) skeleton.boneTexture = null;
    else if (boneTexture) textures.add(boneTexture);
    skeleton.dispose();
  }
}

/** Called once by the template owner, after every lease and waiter has gone. */
export function disposeModelTemplate(template: ModelTemplate): void {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  const textures = new Set<Texture>(), skeletons = new Set<Skeleton>(), instances = new Set<InstancedMesh>();
  const objects = new Set<Object3D>();
  for (const scene of new Set([template.scene, ...(template.scenes ?? [])])) {
    scene.traverse(object => {
      if (objects.has(object)) return;
      objects.add(object);
      const mesh = object as SkinnedMesh & InstancedMesh;
      if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
      if (mesh.isSkinnedMesh && mesh.skeleton) skeletons.add(mesh.skeleton);
      if (mesh.isInstancedMesh) instances.add(mesh);
      for (const name of ['background', 'environment'] as const) {
        const value = (object as Object3D & { background?: unknown; environment?: unknown })[name];
        if (texture(value)) textures.add(value);
      }
    });
  }
  for (const material of materials) materialTextures(material, textures);
  for (const skeleton of skeletons) if (skeleton.boneTexture) textures.add(skeleton.boneTexture);
  for (const instance of instances) if (instance.morphTexture) textures.add(instance.morphTexture);
  const closedImages = new Set<object>();
  for (const map of textures) {
    map.dispose();
    closeImage(map.source?.data, closedImages);
    closeImage(map.image, closedImages);
  }
  // Dispose methods normally own these textures. They have already been deduplicated above.
  for (const skeleton of skeletons) { skeleton.boneTexture = null; skeleton.dispose(); }
  for (const instance of instances) { instance.morphTexture = null; instance.dispose(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
