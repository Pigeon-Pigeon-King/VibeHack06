import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderTarget, WebGLRenderer } from 'three';
import { ESCORT } from '../content/escort-layout';
import { createCharacter } from './characters';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';

/** The departure exists only in this off-world camera feed, never in the combat world. */
export class DepartureMonitor {
  readonly screen: Mesh;
  private readonly scene = new Scene();
  private readonly content = new Group();
  private readonly camera = new PerspectiveCamera(46, 16 / 9, 0.1, 50);
  private readonly target = new WebGLRenderTarget(640, 360);
  private readonly car = new Group();
  private readonly door = new Group();
  private readonly shao = createCharacter('civilian');
  private lastTime = -100;
  constructor() {
    this.scene.background = new Color(0x54666b);
    this.scene.add(this.content);
    this.scene.add(new HemisphereLight(0xcde1df, 0x283737, 2.1));
    const key = new DirectionalLight(0xffe4b0, 2); key.position.set(6, 7, 4); this.scene.add(key);
    const material = characterMaterial();
    new VertexParts().box([32, 0.2, 18], [0, -0.1, 0], 0x516163)
      .box([32, 4, 0.4], [0, 2, -3.8], 0x718487)
      .box([1.4, 2.4, 0.6], [-7, 1.2, -2.8], 0x263d42)
      .box([8, 0.025, 0.12], [0, 0.02, 2.5], 0xb9b69c)
      .mesh(this.content, material, 'east-cargo-camera-backdrop');
    this.content.add(this.car);
    new VertexParts().box([2.1, 0.68, 4.6], [0, 0.85, 0], 0x324347)
      .box([1.9, 1.0, 3.25], [0, 1.61, -0.2], 0x3f5358)
      .box([1.65, 0.52, 0.04], [0, 1.72, 1.45], 0x90b7bb)
      .box([0.04, 0.50, 1.15], [1.01, 1.72, -0.8], 0x90b7bb)
      .box([1.8, 0.16, 0.16], [0, 0.76, 2.32], 0x9bafae)
      .mesh(this.car, material, 'transfer-car');
    for (const x of [-1.02, 1.02]) for (const z of [-1.45, 1.45]) {
      new VertexParts().cylinder(0.48, 0.20, [x, 0.48, z], 0x182b2d, [0, 0, Math.PI / 2]).mesh(this.car, material, 'road-wheel');
    }
    this.door.position.set(1.06, 0, 0.75); this.car.add(this.door);
    new VertexParts().box([0.08, 1.05, 1.13], [0, 1.43, -0.56], 0x34484c)
      .box([0.085, 0.40, 0.88], [0, 1.72, -0.56], 0x90b7bb).mesh(this.door, material, 'open-passenger-door');
    this.content.add(this.shao.root);
    new VertexParts().box([0.49, 0.75, 0.32], [0, 1.03, 0], 0x26323a)
      .box([0.33, 0.08, 0.34], [0, 1.77, 0], 0xaaa99e)
      .cylinder(0.055, 0.14, [0.32, 1.23, 0.3], 0xccd0c5)
      .mesh(this.shao.root, material, 'dark-coat-grey-hair-cup');
    this.camera.position.set(5.8, 3.4, 7.6); this.camera.lookAt(0.7, 1.2, 0);
    this.screen = new Mesh(new PlaneGeometry(...ESCORT.monitorScreenSize), new MeshBasicMaterial({ map: this.target.texture, toneMapped: false }));
    this.screen.name = 'east-cargo-monitor-feed'; this.screen.position.set(...ESCORT.monitorScreen); this.screen.rotation.y = ESCORT.monitorScreenYaw;
  }
  render(renderer: WebGLRenderer, time: number, playing: boolean, confirmed: boolean): void {
    const t = playing ? Math.min(22, time) : confirmed ? 22 : 0;
    if (Math.abs(t - this.lastTime) < 0.10) return;
    this.lastTime = t;
    const approach = Math.min(1, Math.max(0, (t - 4) / 6));
    this.shao.root.visible = t < 10;
    this.shao.root.position.set(2.3 - approach * 1.3, 0, 1.1 - approach * 0.9);
    this.shao.root.rotation.y = -Math.PI / 2;
    this.shao.setPose({ walk: approach * 14, aiming: false, down: false, armed: false, gesture: t < 4 ? 0.5 : 0 });
    this.door.rotation.y = t < 10 ? -1.1 : -1.1 * (1 - Math.min(1, (t - 10) / 2));
    this.car.position.x = -Math.max(0, t - 12) * 2.6;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera); renderer.setRenderTarget(previous);
  }
  dispose(): void {
    this.screen.geometry.dispose(); (this.screen.material as MeshBasicMaterial).dispose(); this.target.dispose();
    disposeModelTree(this.content);
  }
}
