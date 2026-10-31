import { PerspectiveCamera, Vector3 } from 'three';

const local = new Vector3();
// Match the world label, arrow, ground ring, and the destination's torso-height anchor.
const parts = [
  { height: 3.2, halfWidth: 1.4, halfHeight: 0.2625 },
  { height: 2.7, halfWidth: 0.16, halfHeight: 0.175 },
  { height: 0.04, halfWidth: 0.58, halfHeight: 0.1 },
  { height: 1.2, halfWidth: 0.3, halfHeight: 0.6 },
];

/** Fade the whole world marker when the gaze approaches it, including large nearby labels. */
export function objectiveFocusOpacity(camera: PerspectiveCamera, point: readonly number[]): number {
  if (point.length !== 3 || !point.every(Number.isFinite)) return 0;
  camera.updateWorldMatrix(true, false);
  const px = camera.projectionMatrix.elements[0] * camera.aspect, py = camera.projectionMatrix.elements[5];
  let clearance = Infinity;
  for (const part of parts) {
    local.set(point[0], point[1] + part.height, point[2]).applyMatrix4(camera.matrixWorldInverse);
    if (local.z >= -camera.near) continue;
    // Measure the gap from the centre to each projected footprint in units of half screen height.
    const x = Math.max(0, (Math.abs(local.x) - part.halfWidth) * px / -local.z);
    const y = Math.max(0, (Math.abs(local.y) - part.halfHeight) * py / -local.z);
    clearance = Math.min(clearance, Math.hypot(x, y));
  }
  const t = Math.max(0, Math.min(1, (clearance - 0.1) / 0.5));
  return 0.04 + 0.96 * t * t * (3 - 2 * t);
}

export function smoothObjectiveOpacity(current: number, target: number, dt: number, lowMotion = false): number {
  if (lowMotion) return target;
  return current + (target - current) * (1 - Math.exp(-14 * Math.max(0, Math.min(0.1, dt))));
}
