import { PerspectiveCamera, Vector3 } from 'three';

export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export interface ObjectiveProjection {
  x: number; y: number; angle: number; offscreen: boolean; behind: boolean; turnSide: number;
}

/** Camera-space direction stays signed behind the camera; perspective division would mirror it. */
export function projectObjective(
  point: readonly number[], camera: PerspectiveCamera, width: number, height: number, previousSide = 1,
): ObjectiveProjection | null {
  if (width < 180 || height < 140 || !point.every(Number.isFinite)) return null;
  camera.updateWorldMatrix(true, false);
  const local = new Vector3(point[0], point[1], point[2]).applyMatrix4(camera.matrixWorldInverse);
  if (local.lengthSq() < 0.000001) return null;
  const px = camera.projectionMatrix.elements[0], py = camera.projectionMatrix.elements[5];
  const behind = local.z >= 0;
  const horizontal = Math.hypot(local.x, local.z);
  // Preserve the previous turn at the rear seam, rather than flickering left/right with camera bob.
  const turnSide = Math.abs(local.x) > horizontal * 0.06 ? Math.sign(local.x) : previousSide || 1;
  const depth = Math.max(0.0001, -local.z);
  const nx = local.x * px / depth, ny = -local.y * py / depth;
  const offscreen = behind || Math.abs(nx) > 1 || Math.abs(ny) > 1;
  if (!offscreen) return { x: (nx + 1) * width / 2, y: (ny + 1) * height / 2, angle: 0, offscreen, behind, turnSide };

  let dx = (behind ? turnSide * (Math.abs(local.x) + local.z) : local.x) * px * width / 2;
  const dy = -local.y * py * height / 2;
  if (Math.abs(dx) + Math.abs(dy) < 0.0001) dx = turnSide;
  const bounds = indicatorBounds(width, height);
  const cx = width / 2, cy = height / 2;
  const sx = Math.abs(dx) < 0.0001 ? Infinity : (dx > 0 ? bounds.right - cx : cx - bounds.left) / Math.abs(dx);
  const sy = Math.abs(dy) < 0.0001 ? Infinity : (dy > 0 ? bounds.bottom - cy : cy - bounds.top) / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx), offscreen, behind, turnSide };
}

export function indicatorBounds(width: number, height: number): ScreenRect {
  return { left: 80, right: width - 80, top: 38, bottom: height - 38 };
}

/** Slide along the perimeter to keep the arrow and its label clear of existing HUD blocks. */
export function avoidHud(
  point: ObjectiveProjection, width: number, height: number, occupied: ScreenRect[],
): { x: number; y: number } | null {
  const bounds = indicatorBounds(width, height);
  const clampX = (x: number) => Math.max(bounds.left, Math.min(bounds.right, x));
  const clampY = (y: number) => Math.max(bounds.top, Math.min(bounds.bottom, y));
  const blocked = occupied.map(r => ({ left: r.left - 76, right: r.right + 76, top: r.top - 28, bottom: r.bottom + 28 }));
  const candidates: Array<{ x: number; y: number }> = [];
  for (const x of [bounds.left, bounds.right]) {
    for (const y of [point.y, bounds.top, bounds.bottom, ...blocked.flatMap(r => [r.top - 1, r.bottom + 1])]) candidates.push({ x, y: clampY(y) });
  }
  for (const y of [bounds.top, bounds.bottom]) {
    for (const x of [point.x, bounds.left, bounds.right, ...blocked.flatMap(r => [r.left - 1, r.right + 1])]) candidates.push({ x: clampX(x), y });
  }
  const free = candidates.filter(p => !blocked.some(r => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom));
  free.sort((a, b) => (a.x - point.x) ** 2 + (a.y - point.y) ** 2 - (b.x - point.x) ** 2 - (b.y - point.y) ** 2);
  return free[0] ?? null;
}
