import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderTarget, WebGLRenderer } from 'three';
import { ESCORT } from '../content/escort-layout';
import { ImportedCharacter } from './ImportedCharacter';
import type { ModelLibrary } from '../assets/ModelLibrary';
import { characterMaterial, disposeModelTree, VertexParts } from './model-tools';
import { PortKit } from './port-kit';
import { GeneratedSceneAssets } from './GeneratedSceneAssets';
import { GeneratedArchitecture } from './GeneratedArchitecture';
import { bindGeneratedProp, propPlacement, propSlot } from './GeneratedPropBindings';

/** The departure exists only in this off-world camera feed, never in the combat world. */
export class DepartureMonitor {
  readonly screen: Mesh;
  readonly assetErrors = new Set<string>();
  private readonly scene = new Scene();
  private readonly content = new Group();
  private readonly camera = new PerspectiveCamera(46, 16 / 9, 0.1, 50);
  private readonly target = new WebGLRenderTarget(640, 360);
  private readonly car = new Group();
  private readonly door = new Group();
  private readonly shao: ImportedCharacter;
  private readonly kit = new PortKit();
  private readonly scenery: GeneratedSceneAssets;
  private readonly architecture: GeneratedArchitecture;
  readonly ready: Promise<void>;
  private lastTime = -100;
  private disposed = false;
  constructor(library: ModelLibrary, baseURL: string) {
    this.shao = new ImportedCharacter(library, { id: 'shao', name: '邵原', role: 'opponent' }, baseURL, status => {
      this.track('character:CH-SHAO', status.state);
      this.lastTime = -100; // refresh a frozen feed when the real model resolves
      if (this.screen) this.screen.userData.characterAssetStatus = status.state;
    });
    this.scene.background = new Color(0x54666b);
    this.scene.add(this.content);
    this.scene.add(new HemisphereLight(0xcde1df, 0x283737, 2.1));
    const key = new DirectionalLight(0xffe4b0, 2); key.position.set(6, 7, 4); this.scene.add(key);
    const material = characterMaterial();
    this.kit.root.name = 'east-cargo-camera-backdrop';
    this.kit.box('concrete', [0, -.1, 0], [32, .2, 18]);
    this.kit.solid('cargo-ground', [0, -.1, 0], [32, .2, 18]);
    this.kit.box('concrete', [0, 2, -3.8], [32, 4, .4]);
    this.kit.solid('cargo-boundary', [0, 2, -3.8], [32, 4, .4]);
    this.kit.box('amber', [0, .02, 2.5], [8, .025, .12], [0, 0, 0], false);
    propSlot(this.kit, 'monitor-cargo-door', [propPlacement('monitor-cargo-door', 'PROP-DOOR-LEAF', [-7, 0, -2.8], 2.4, 'y', Math.PI / 2)], slot => {
      slot.box('paint', [-7, 1.2, -2.8], [1.4, 2.4, .6]);
    });
    this.kit.flush(); this.content.add(this.kit.root);
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
    bindGeneratedProp(this.car, 'monitor-transport', [propPlacement('monitor-transport', 'PROP-VEH-TRANSPORT', [0, 0, 0], 4.6, 'x', Math.PI / 2)], this.car.children.filter(child => child !== this.door));
    bindGeneratedProp(this.door, 'monitor-passenger-door', [propPlacement('monitor-passenger-door', 'PROP-DOOR-LEAF', [0, .9, -.56], 1.05, 'y')]);
    this.content.add(this.shao.root);
    this.camera.position.set(5.8, 3.4, 7.6); this.camera.lookAt(0.7, 1.2, 0);
    this.screen = new Mesh(new PlaneGeometry(...ESCORT.monitorScreenSize), new MeshBasicMaterial({ map: this.target.texture, toneMapped: false }));
    this.screen.name = 'east-cargo-monitor-feed'; this.screen.position.set(...ESCORT.monitorScreen); this.screen.rotation.y = ESCORT.monitorScreenYaw;
    this.screen.userData.characterAssetId = 'CH-SHAO'; this.screen.userData.characterAssetStatus = this.shao.root.userData.assetStatus;
    this.scenery = new GeneratedSceneAssets(library, { parent: this.content, scenario: 'escort', baseURL, placements: [],
      onStatus: status => this.track(`prop:${status.id}`, status.state) });
    this.architecture = new GeneratedArchitecture(library, { parent: this.kit.root, scenario: 'escort', baseURL,
      onStatus: status => this.track(`architecture:${status.id}`, status.state) });
    this.ready = Promise.all([this.shao.ready, this.scenery.ready, this.architecture.ready]).then(([, props, architecture]) => {
      if (this.disposed) return;
      this.screen.userData.assetCoverage = { props, architecture, character: this.shao.root.userData.assetStatus };
      this.lastTime = -100;
    });
    this.screen.userData.vehicleAdaptation = 'shared production transport; independent door leaf, not a separated source vehicle door';
  }
  private track(id: string, state: string): void {
    if (this.disposed) return;
    if (state === 'error') this.assetErrors.add(id); else this.assetErrors.delete(id);
  }
  render(renderer: WebGLRenderer, time: number, playing: boolean, confirmed: boolean): void {
    if (this.disposed) return;
    const t = playing ? Math.min(22, time) : confirmed ? 22 : 0;
    if (Math.abs(t - this.lastTime) < 0.10) return;
    this.lastTime = t;
    const approach = Math.min(1, Math.max(0, (t - 4) / 6));
    this.shao.root.visible = t < 10;
    this.shao.root.position.set(2.3 - approach * 1.3, 0, 1.1 - approach * 0.9);
    this.shao.root.rotation.y = -Math.PI / 2;
    this.shao.setPose({ walk: approach * 14, aiming: false, down: false, armed: false,
      moveSpeed: t > 4 && t < 10 ? 0.27 : 0, animationTime: t, gesture: t < 4 ? 0.5 : 0 });
    this.door.rotation.y = t < 10 ? -1.1 : -1.1 * (1 - Math.min(1, (t - 10) / 2));
    this.car.position.x = -Math.max(0, t - 12) * 2.6;
    this.architecture.update(this.camera.position);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera); renderer.setRenderTarget(previous);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.architecture.dispose(); this.scenery.dispose();
    this.shao.dispose(); // release borrowed GLB resources before the procedural monitor backdrop
    this.screen.geometry.dispose(); (this.screen.material as MeshBasicMaterial).dispose(); this.target.dispose();
    disposeModelTree(this.content);
  }
}
