import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute,
  Group, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, Quaternion,
  Texture, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../contracts';

/** Parts baked into one vertex-coloured mesh, retaining only articulation boundaries. */
export class VertexParts {
  private parts: BufferGeometry[] = [];
  box(size: Vec3, at: Vec3, color: number, rotation: Vec3 = [0, 0, 0]): this {
    return this.add(new BoxGeometry(...size), at, color, rotation);
  }
  cylinder(radius: number, height: number, at: Vec3, color: number, rotation: Vec3 = [0, 0, 0], sides = 8): this {
    return this.add(new CylinderGeometry(radius, radius, height, sides), at, color, rotation);
  }
  add(source: BufferGeometry, at: Vec3, color: number, rotation: Vec3 = [0, 0, 0]): this {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const tint = new Color(color);
    const values = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = tint.r; values[i + 1] = tint.g; values[i + 2] = tint.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
    const matrix = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    this.parts.push(geometry);
    return this;
  }
  mesh(parent: Group, material: Material, name: string): Mesh {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error(`Cannot merge procedural model: ${name}`);
    this.parts.forEach(part => part.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
}

export function characterMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12 });
}

/** Every factory owns its tree. Shared geometry within a tree is disposed exactly once. */
export function disposeModelTree(root: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    });
    if (object instanceof InstancedMesh) object.dispose();
  });
  textures.forEach(texture => texture.dispose());
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  root.removeFromParent();
  root.clear();
}
