import { PMREMGenerator, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A generated, low-resolution neutral reflection field for imported PBR metals.
 * Built once, shared by the world and held equipment, and owned by Game.
 * This supplies indirect highlights; it does not replace chapter lights or sky.
 */
export function createIndirectLighting(renderer: WebGLRenderer): WebGLRenderTarget {
  const generator = new PMREMGenerator(renderer);
  const source = new RoomEnvironment();
  try {
    const target = generator.fromScene(source, 0.04, 0.1, 100, { size: 128 });
    target.texture.name = 'generated-neutral-industrial-reflections';
    return target;
  } finally {
    source.dispose();
    generator.dispose();
  }
}
