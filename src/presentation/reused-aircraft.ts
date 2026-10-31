import * as THREE from 'three';
import { createF35B } from './reused-aircraft/f35b.js';

/** Visual configuration only: the host owns movement, physics and mission facts. */
export interface ReusedAircraftFlightState {
  /** 0 = engine dark/stopped; 1 = full visual engine power. */
  thrust: number;
  /** 0 = retracted; 1 = extended, following the source gear mechanisms. */
  gear: number;
  /** 0 = cruise; 1 = hover. This is source conversion progress, not a linear angle. */
  tilt: number;
  /** Optional host simulation time. Supplying it animates the original lift fan. */
  timeSeconds?: number;
}

export interface ReusedAircraft {
  root: THREE.Group;
  setFlightState(state: ReusedAircraftFlightState): void;
  dispose(): void;
}

const unit = (value: number): number => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

/**
 * Source-preserving F-35B support aircraft. Metres; +Y up; -Z forward.
 * Suitable for distant S12 air cover, not a transport, dropship or player vehicle.
 * Geometry is shared; mechanisms and engine material are owned by each instance.
 * Provenance, original files and limits: docs/REUSE_MILITARY_AIR_ASSETS.md.
 */
export function createReusedAircraft(): ReusedAircraft {
  const root = createF35B(THREE, { pylons: false });
  root.name = 'reused-f35b-air-cover';
  root.userData.assetId = 'AIR-VTOL-F35B-REUSED';
  root.userData.assetStatus = 'prepared';
  root.userData.forward = '-Z';
  root.userData.units = 'metres';
  root.userData.role = 'distant-air-cover';
  const updateSource = root.userData.update as (time: number, conversion: number, gear: number, controls: { throttle: number; thrust: number }) => void;
  const disposeSource = root.userData.dispose as () => void;
  const exhaust = root.getObjectByName('ReheatL-geometry') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const exhaustPart = root.getObjectByName('ReheatL')!;
  // Retain the original reheat surface, with per-instance light intensity.
  // The source material is also used by other dark parts, so never mutate it.
  const exhaustMaterial = exhaust.material.clone();
  exhaustMaterial.name = 'f35b-instance-reheat';
  exhaustMaterial.emissive.setHex(0xff934a);
  exhaustMaterial.transparent = true;
  exhaustMaterial.depthWrite = false;
  exhaust.material = exhaustMaterial;
  // These are distant support aircraft. Shadow passes remain a host opt-in.
  root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false; });
  let disposed = false;
  let timeSeconds = 0;

  function setFlightState(state: ReusedAircraftFlightState): void {
    if (disposed) return;
    const thrust = unit(state.thrust), gear = unit(state.gear), tilt = unit(state.tilt);
    if (state.timeSeconds !== undefined && Number.isFinite(state.timeSeconds)) timeSeconds = Math.max(0, state.timeSeconds);
    updateSource(timeSeconds, 1 - tilt, gear, { throttle: thrust, thrust });
    exhaustPart.visible = thrust > 0;
    exhaustMaterial.emissiveIntensity = thrust * 1.5;
    exhaustMaterial.opacity = thrust * 0.8;
    root.userData.flightState = { thrust, gear, tilt, timeSeconds };
    root.updateMatrixWorld(true);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    exhaustMaterial.dispose();
    disposeSource();
  }

  // Legacy-style cleanup routed through the same owner, including its material.
  root.userData.dispose = dispose;
  setFlightState({ thrust: 0, gear: 0, tilt: 0 });
  return { root, setFlightState, dispose };
}
