import { Bone, Box3, Group, Mesh, Quaternion, Vector3 } from 'three';
import type { CharacterModel, ScenarioId } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import type { ModelLease } from '../assets/model-contracts';
import { characterAssetFor, type CharacterIdentity } from '../assets/character-catalog';
import { sceneAssetSource, SCENE_ASSETS, type SceneAssetId } from '../assets/scene-asset-catalog';
import { ImportedCharacter, type CharacterLoadStatus } from './ImportedCharacter';
import { createPatientCart } from './patient-cart';

type Pose = Parameters<CharacterModel['setPose']>[0];
interface Part { lease: ModelLease; mount: Group }

/** A cart is a reusable vehicle plus separate people, not a replacement character identity. */
export function patientIdentity(identity: CharacterIdentity): CharacterIdentity {
  return { id: identity.id, name: identity.name, role: /^(meng|zhou)$/.test(identity.id) ? 'ally' : 'civilian' };
}

export function patientCartAssets(identity: CharacterIdentity, scenario?: ScenarioId): SceneAssetId[] {
  return [scenario === 'rescue' ? 'PROP-STRETCHER' : 'PROP-TRANSFER', ...(identity.id === 'supply-cart' ? ['PROP-CARGO' as const] : [])];
}

export function patientCartPeople(identity: CharacterIdentity): CharacterIdentity[] {
  return [...(['supply-cart', 'zhou-cart'].includes(identity.id) ? [] : [patientIdentity(identity)]),
    { id: `${identity.id}-orderly`, name: '转运医护', role: 'medic' as const }];
}

/** Same actor root/physics and fact-driven occupancy as the original transfer view. */
export class ImportedPatientCart implements CharacterModel {
  readonly root = new Group();
  ready: Promise<void> = Promise.resolve();
  private readonly fallback = createPatientCart();
  private readonly production = new Group();
  private readonly patient = new Group();
  private readonly patientTilt = new Group();
  private readonly cargo = new Group();
  private readonly orderly = new Group();
  private readonly parts = new Set<Part>();
  private patientModel?: ImportedCharacter;
  private orderlyModel?: ImportedCharacter;
  private controller?: AbortController;
  private generation = 0;
  private disposed = false;
  private loaded = false;
  private pose: Pose = { walk: 0, aiming: false, down: false };
  private readonly isCargo: boolean;
  private readonly stretcher: boolean;

  constructor(private readonly library: ModelLibrary, readonly identity: CharacterIdentity,
    private readonly baseURL: string, private readonly onStatus: (status: CharacterLoadStatus) => void = () => {},
    scenario?: ScenarioId) {
    this.isCargo = identity.id === 'supply-cart';
    this.stretcher = scenario === 'rescue';
    this.root.name = `imported-patient-cart:${identity.id}`;
    this.root.userData.forward = '+Z';
    this.root.userData.identity = { ...identity };
    this.production.name = 'generated-patient-cart';
    this.patient.name = 'patient-transfer-offset';
    this.patientTilt.name = 'supine-patient';
    this.cargo.name = 'generated-medical-supplies';
    this.orderly.name = 'generated-cart-orderly';
    // Rotate a standing +Z-forward body onto its back: head +Z, face +Y.
    // This is a rigid body placement; no skin vertex or inverse-bind edits.
    this.patientTilt.rotation.set(Math.PI / 2, Math.PI, 0);
    this.patientTilt.position.set(0, this.stretcher ? .84 : .69, -.86);
    this.patient.add(this.patientTilt);
    this.orderly.position.set(0, 0, -1.4);
    this.production.add(this.patient, this.cargo, this.orderly);
    this.root.add(this.fallback.root, this.production);
    this.production.visible = false;
    this.ready = this.load();
  }

  private notify(state: CharacterLoadStatus['state'], message?: string): void {
    this.root.userData.assetStatus = state;
    try { this.onStatus({ state, assetId: this.stretcher ? 'PROP-STRETCHER' : 'PROP-TRANSFER', message }); } catch { /* Observer owns its work. */ }
  }

  private current(generation: number): boolean { return !this.disposed && this.generation === generation; }

  private async load(): Promise<void> {
    this.controller?.abort(); this.release();
    if (this.disposed) return;
    const generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    this.notify('loading', '转运资产载入中');
    const tasks: Promise<unknown>[] = [];
    const acquire = async (id: SceneAssetId, length: number, parent: Group, at: [number, number, number], axis: 'x' | 'z', yaw: number) => {
      const lease = await this.library.acquire(sceneAssetSource(id, this.baseURL), { signal: controller.signal });
      if (!this.current(generation)) { lease.dispose(); return; }
      try {
        const bounds = new Box3().setFromObject(lease.root, true), size = bounds.getSize(new Vector3());
        const expected = SCENE_ASSETS[id].sourceBounds;
        if (!size.toArray().every(v => Number.isFinite(v) && v > 0)
          || bounds.min.distanceTo(new Vector3(...expected.min)) > .0001
          || bounds.max.distanceTo(new Vector3(...expected.max)) > .0001) throw new Error(`Cart source frame changed: ${id}`);
        const scale = length / size[axis], center = bounds.getCenter(new Vector3());
        const mount = new Group(), normalized = new Group(); mount.name = `cart-part:${id}`;
        mount.position.set(...at); mount.rotation.y = yaw;
        normalized.scale.setScalar(scale);
        normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        normalized.add(lease.root); mount.add(normalized);
        lease.root.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
        mount.userData.assetId = id;
        mount.userData.uniformScale = scale;
        parent.add(mount); this.parts.add({ lease, mount });
      } catch (error) { lease.root.removeFromParent(); lease.dispose(); throw error; }
    };
    tasks.push(acquire(this.stretcher ? 'PROP-STRETCHER' : 'PROP-TRANSFER', this.stretcher ? 2.1 : 1.9,
      this.production, [0, this.stretcher ? .72 : 0, 0], 'x', Math.PI / 2));
    // The player rides zhou-cart in first person; drawing another Zhou there
    // would put a second body directly through that camera.
    if (!this.isCargo && this.identity.id !== 'zhou-cart') {
      this.patientModel = new ImportedCharacter(this.library, patientIdentity(this.identity), this.baseURL);
      this.patientTilt.add(this.patientModel.root);
      tasks.push(this.patientModel.ready);
    }
    this.orderlyModel = new ImportedCharacter(this.library, { id: `${this.identity.id}-orderly`, name: '转运医护', role: 'medic' }, this.baseURL);
    this.orderly.add(this.orderlyModel.root); tasks.push(this.orderlyModel.ready);
    // Two small cases share the measured flat mattress region. The raised +Z
    // backrest is not a shelf: actual source-surface height here is .539–.547m.
    if (this.isCargo) for (const x of [-.18, .18]) tasks.push(acquire('PROP-CARGO', .50, this.cargo, [x, .549, -.35], 'z', 0));
    const results = await Promise.allSettled(tasks);
    if (!this.current(generation)) return;
    const failed = results.find(r => r.status === 'rejected');
    const peopleFailed = [this.patientModel, this.orderlyModel].some(model => model && model.root.userData.assetStatus !== 'ready');
    if (failed || peopleFailed) {
      controller.abort(); this.release(); this.fallback.setPose(this.pose);
      this.notify('error', '转运资产载入失败'); return;
    }
    this.loaded = true; this.fallback.root.visible = false; this.production.visible = true;
    this.root.userData.assembly = {
      vehicle: this.stretcher ? 'PROP-STRETCHER' : 'PROP-TRANSFER',
      patient: this.patientModel ? characterAssetFor(patientIdentity(this.identity))?.id : undefined,
      orderly: 'CH-DOCTOR', cargo: this.isCargo ? 'PROP-CARGO' : undefined,
      collision: 'unchanged actor cart proxy',
      contacts: 'rigid supine placement and existing pushing pose; visual review required',
      wheelArticulation: 'production chassis currently static; damage fact retained',
    };
    this.setPose(this.pose); this.notify('ready');
  }

  setPose(pose: Pose): void {
    if (this.disposed) return;
    this.pose = { ...pose }; this.fallback.setPose(pose);
    if (!this.loaded) return;
    this.patient.visible = (pose.occupied ?? true) && !pose.cargo;
    this.patient.position.set(...(pose.patientOffset ?? [0, 0, 0]));
    this.cargo.visible = pose.cargo ?? this.isCargo;
    this.orderly.visible = !pose.damaged && (pose.orderly ?? true);
    this.root.userData.damaged = !!pose.damaged;
    this.patientModel?.setPose({ walk: 0, aiming: false, down: false, armed: false });
    if (!this.stretcher && this.patientModel) {
      // The produced trolley has an inclined headrest. Bend only the trunk,
      // retaining the legs on the mattress and the patient's actual identity.
      const waist = this.patientModel.root.getObjectByName('Waist');
      if (waist instanceof Bone && waist.parent) {
        this.root.updateMatrixWorld(true);
        const axis = new Vector3(-1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new Quaternion()));
        const rotation = new Quaternion().setFromAxisAngle(axis, 25 * Math.PI / 180).multiply(waist.getWorldQuaternion(new Quaternion()));
        waist.quaternion.copy(waist.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
        waist.updateWorldMatrix(false, true);
      }
    }
    this.orderlyModel?.setPose({ walk: pose.walk, moveSpeed: pose.moveSpeed, aiming: false, down: false, armed: false, care: true });
    this.root.updateMatrixWorld(true);
  }

  private release(): void {
    this.loaded = false; this.production.visible = false; this.fallback.root.visible = true;
    this.patientModel?.dispose(); this.orderlyModel?.dispose();
    this.patientModel = undefined; this.orderlyModel = undefined;
    for (const { lease, mount } of this.parts) { mount.removeFromParent(); lease.root.removeFromParent(); lease.dispose(); mount.clear(); }
    this.parts.clear();
  }

  retry(): void { if (!this.disposed) this.ready = this.load(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.controller?.abort(); this.release();
    this.fallback.dispose(); this.root.removeFromParent(); this.root.clear();
  }
}
