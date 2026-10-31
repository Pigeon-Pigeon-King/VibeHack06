import { Box3, Camera, Group, LOD, LoadingManager, Matrix4, Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vec3 } from '../contracts';
import { disposeModelTree, registerModelDisposer } from './model-tools';

/** Source-axis calibration is separate from the level's placement yaw. No collision comes from GLB. */
export const GENERATED_STATIC_CATALOG = {
  'PROP-TANK': { yaw: 0, near: 38, load: 44, limit: 4, texture: 1024, shadow: true, evidence: 'Y-up; round tank, measured X/Z diameters nearly equal.' },
  'ENV-LIGHTKIT-POLE': { yaw: 0, near: 22, load: 28, limit: 3, texture: 512, shadow: false, evidence: 'Y-up; twin-light crossbar spans source X. Raw width/height/depth 0.868/1.896/0.356.' },
  'PROP-VEH-TUG': { yaw: Math.PI / 2, near: 34, load: 40, limit: 2, texture: 1024, shadow: true, evidence: 'Y-up; source long axis X maps to level Z. Cab-side sign needs in-game visual confirmation.' },
  'PROP-TERMINAL-CONSOLE': { yaw: Math.PI / 2, near: 15, load: 20, limit: 2, texture: 1024, shadow: true, evidence: 'Y-up; source width Z maps to level X. Screen-facing sign needs in-game confirmation.' },
  'BG-CRANE': { yaw: Math.PI / 2, near: 155, load: 175, limit: 1, texture: 1024, shadow: false, evidence: 'Y-up; source wide boom envelope Z maps to level X; exterior silhouette only.' },
  'PROP-BENCH': { yaw: Math.PI / 2, near: 16, load: 21, limit: 2, texture: 512, shadow: true, evidence: 'Y-up; source long seat axis Z maps to level X; symmetric bench.' },
  'PROP-MEDICAL-BAG': { yaw: Math.PI / 2, near: 7, load: 10, limit: 2, texture: 512, shadow: true, evidence: 'Y-up; source bag width Z maps to level X; carry attachment not implemented.' },
  'PROP-LIFE-MUG': { yaw: Math.PI / 2, near: 6, load: 9, limit: 2, texture: 512, shadow: true, evidence: 'Y-up; measured width including handle spans source Z (0.878/0.743/1.000); map width to level X. Handle-side sign needs runtime review.' },
} as const;
export type GeneratedStaticAssetId = keyof typeof GENERATED_STATIC_CATALOG;
export interface StaticAssetPlacement {
  /** Bottom centre, in the current PortKit.located coordinate frame. */
  position: Vec3;
  /** Target world X/Y/Z size in metres, after source-axis rotation. */
  size: Vec3;
  yaw?: number;
  instanceId?: string;
  nearDistance?: number;
  loadDistance?: number;
  /** Reject strongly distorted fits instead of silently stretching a different kind of prop. */
  maxAspectDistortion?: number;
}
export type StaticAssetLoader = (url: string, signal: AbortSignal, textureLimit: number) => Promise<Group>;
export interface GeneratedStaticOptions { loader?: StaticAssetLoader; baseURL?: string; pageURL?: string }

export function generatedAssetUrl(id: GeneratedStaticAssetId, baseURL = import.meta.env.BASE_URL, pageURL?: string): string {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  const path = `${base}assets/generated/production-20261031/${id}.glb`;
  const page = pageURL ?? (typeof location === 'undefined' ? undefined : location.href);
  return page ? new URL(path, page).href : path;
}

/** One resize per source texture, before any scene-local clones share it. */
function limitTextures(root: Group, limit: number): void {
  const maps = new Set<Texture>();
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) maps.add(value);
    }
  });
  const retired = new Set<{ close?(): void }>();
  for (const map of maps) {
    const source = map.image as (CanvasImageSource & { width: number; height: number; close?(): void }) | undefined;
    if (!source?.width || !source.height || Math.max(source.width, source.height) <= limit) continue;
    const scale = limit / Math.max(source.width, source.height);
    const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined' ? document.createElement('canvas') : undefined;
    if (!canvas) continue;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) continue;
    context.drawImage(source, 0, 0, width, height);
    map.image = canvas; map.needsUpdate = true; retired.add(source);
  }
  const active = new Set([...maps].map(map => map.image));
  for (const source of retired) if (!active.has(source)) source.close?.();
}

const loadStaticAsset: StaticAssetLoader = async (url, signal, textureLimit) => {
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error('Generated model unavailable');
  const bytes = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const view = new DataView(bytes);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a
    || view.getUint32(12, true) > bytes.byteLength - 20) throw new Error('Invalid generated GLB');
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, view.getUint32(12, true))));
  for (const key of ['images', 'buffers']) if ((metadata[key] ?? []).some((item: { uri?: string }) => item.uri !== undefined)) throw new Error('External GLB resources are not supported');
  const unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
  if ([...(metadata.extensionsUsed ?? []), ...(metadata.extensionsRequired ?? [])].some(name => unsupported.includes(name))) throw new Error('Generated GLB requires an unconfigured decoder');
  const manager = new LoadingManager(); let imageFailed = false;
  manager.onError = failed => { imageFailed = true; if (failed.startsWith('blob:')) URL.revokeObjectURL(failed); };
  const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
  if (signal.aborted || imageFailed) { disposeModelTree(gltf.scene); throw new Error('Generated model decode cancelled or failed'); }
  try { limitTextures(gltf.scene, textureLimit); return gltf.scene; }
  catch (error) { disposeModelTree(gltf.scene); throw error; }
};

interface Entry { state: 'queued' | 'loading' | 'ready' | 'error'; controller: AbortController; root?: Group }

/** Owned by exactly one PortKit tree. The hidden originals join its normal deduplicated cleanup. */
export class GeneratedStaticAssets {
  private readonly entries = new Map<GeneratedStaticAssetId, Entry>();
  private readonly originals = new Group();
  private readonly slots: GeneratedAssetSlot[] = [];
  private readonly loader: StaticAssetLoader;
  private active = 0;
  private disposed = false;
  constructor(private readonly root: Group, private readonly options: GeneratedStaticOptions = {}) {
    this.loader = options.loader ?? loadStaticAsset;
    this.originals.name = 'generated-static-source-resources'; this.originals.visible = false;
    root.add(this.originals);
    registerModelDisposer(root, () => {
      this.disposed = true;
      for (const entry of this.entries.values()) entry.controller.abort();
      for (const slot of this.slots) slot.userData.loadState = 'disposed';
      // Already attached resources remain in this tree for disposeModelTree's Sets.
      this.entries.clear(); this.slots.length = 0;
    });
  }
  add(id: GeneratedStaticAssetId, placement: StaticAssetPlacement, matrix: Matrix4): GeneratedAssetSlot {
    const slot = new GeneratedAssetSlot(this, id, placement, this.slots.length);
    slot.matrixAutoUpdate = false; slot.matrix.copy(matrix);
    this.slots.push(slot); this.root.add(slot);
    return slot;
  }
  allowed(slot: GeneratedAssetSlot, camera: Vector3, distance: number): boolean {
    const limit = GENERATED_STATIC_CATALOG[slot.assetId].limit;
    let closer = 0;
    for (const other of this.slots) {
      if (other === slot || other.assetId !== slot.assetId) continue;
      const d = other.getWorldPosition(new Vector3()).distanceTo(camera);
      if (d < distance - 0.001 || Math.abs(d - distance) <= 0.001 && other.order < slot.order) closer++;
    }
    return closer < limit;
  }
  request(slot: GeneratedAssetSlot): void {
    if (this.disposed || slot.loaded || slot.userData.loadState === 'fit-rejected') return;
    let entry = this.entries.get(slot.assetId);
    if (!entry) { entry = { state: 'queued', controller: new AbortController() }; this.entries.set(slot.assetId, entry); }
    if (entry.state === 'ready') { slot.install(entry.root!); return; }
    slot.userData.loadState = entry.state;
    if (entry.state !== 'error') this.pump();
  }
  private pump(): void {
    // Texture decoding is deliberately serial on the shared 8 GB machine.
    if (this.disposed || this.active) return;
    for (const [id, entry] of this.entries) {
      if (entry.state !== 'queued' || !this.slots.some(slot => slot.assetId === id && slot.wantsLoad)) continue;
      entry.state = 'loading'; this.active++;
      const spec = GENERATED_STATIC_CATALOG[id];
      void Promise.resolve().then(() => this.loader(generatedAssetUrl(id, this.options.baseURL, this.options.pageURL), entry.controller.signal, spec.texture))
        .then(template => {
          if (this.disposed) { disposeModelTree(template); return; }
          let skinned = false;
          template.traverse(node => { if ((node as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true; });
          if (skinned) { disposeModelTree(template); throw new Error('Static asset unexpectedly contains a skin'); }
          entry.root = template; entry.state = 'ready'; this.originals.add(template);
          for (const slot of this.slots) if (slot.assetId === id && slot.wantsLoad) slot.install(template);
        }).catch(() => {
          if (this.disposed) return;
          entry.state = 'error';
          for (const slot of this.slots) if (slot.assetId === id) slot.userData.loadState = 'error';
        }).finally(() => { this.active--; this.pump(); });
      return;
    }
  }
}

/** WebGLRenderer calls LOD.update(camera), so loading does not require editing the game loop. */
export class GeneratedAssetSlot extends LOD {
  readonly fallback = new Group();
  readonly detail = new Group();
  readonly nearDistance: number;
  readonly loadDistance: number;
  loaded = false;
  wantsLoad = false;
  private readonly cameraPosition = new Vector3();
  private readonly worldPosition = new Vector3();
  constructor(private readonly owner: GeneratedStaticAssets, readonly assetId: GeneratedStaticAssetId,
    readonly placement: StaticAssetPlacement, readonly order: number) {
    super();
    const spec = GENERATED_STATIC_CATALOG[assetId];
    this.name = `generated-slot-${placement.instanceId ?? `${assetId}-${order}`}`;
    this.nearDistance = placement.nearDistance ?? spec.near;
    this.loadDistance = Math.max(this.nearDistance, placement.loadDistance ?? spec.load);
    this.fallback.name = `generated-fallback-${assetId}`; this.detail.name = `generated-detail-${assetId}`;
    this.addLevel(this.detail, 0); this.addLevel(this.fallback, this.nearDistance);
    this.detail.visible = false;
    this.userData = { assetId, revision: 'production-20261031-v1', loadState: 'idle', display: 'fallback',
      targetSizeMeters: [...placement.size], orientationEvidence: spec.evidence, collision: 'unchanged-authored-solids', acceptance: 'runtime-review-pending' };
  }
  override getCurrentLevel(): number { return this.detail.visible ? 0 : 1; }
  override update(camera: Camera): void {
    if (this.userData.loadState === 'disposed') return;
    camera.getWorldPosition(this.cameraPosition); this.getWorldPosition(this.worldPosition);
    const distance = this.cameraPosition.distanceTo(this.worldPosition);
    const allowed = this.owner.allowed(this, this.cameraPosition, distance);
    this.wantsLoad = allowed && distance <= this.loadDistance;
    if (this.wantsLoad) this.owner.request(this);
    this.detail.visible = this.loaded && allowed && distance <= this.nearDistance;
    this.fallback.visible = !this.detail.visible;
    this.userData.display = this.detail.visible ? 'generated' : 'fallback';
  }
  install(template: Group): void {
    if (this.loaded || this.userData.loadState === 'disposed' || this.userData.loadState === 'fit-rejected') return;
    const rotated = new Group(); rotated.rotation.y = GENERATED_STATIC_CATALOG[this.assetId].yaw;
    const instance = template.clone(true); rotated.add(instance); rotated.updateMatrixWorld(true);
    const box = new Box3().setFromObject(rotated), size = box.getSize(new Vector3());
    const target = new Vector3(...this.placement.size);
    const scale = new Vector3(target.x / size.x, target.y / size.y, target.z / size.z);
    const values = scale.toArray();
    if (!values.every(n => Number.isFinite(n) && n > 0) || Math.max(...values) / Math.min(...values) > (this.placement.maxAspectDistortion ?? 1.5)) {
      this.userData.loadState = 'fit-rejected'; this.userData.measuredSize = size.toArray(); return;
    }
    const pivot = new Group(), normalized = new Group();
    pivot.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    pivot.add(rotated); normalized.scale.copy(scale); normalized.add(pivot);
    instance.traverse(node => { if (node instanceof Mesh) { node.castShadow = GENERATED_STATIC_CATALOG[this.assetId].shadow; node.receiveShadow = true; } });
    this.detail.add(normalized); this.loaded = true; this.userData.loadState = 'ready';
    this.userData.measuredSize = size.toArray(); this.userData.appliedScale = scale.toArray();
  }
}
