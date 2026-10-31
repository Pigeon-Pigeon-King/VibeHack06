import RAPIER from '@dimforge/rapier3d-compat';
import type { SolidSpec, Vec3 } from '../contracts';

export const GRAVITY = 1.428;
export const FIXED_DT = 1 / 60;
export interface Body {
  rigid: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  height: number;
  grounded: boolean;
  verticalSpeed: number;
}
export interface TraceHit { id: string; point: Vec3; normal: Vec3; distance: number }

let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  return initialization ??= RAPIER.init();
}

export class Physics {
  readonly world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  readonly bodies = new Map<string, Body>();
  readonly ids = new Map<number, string>();
  private readonly doors: Array<{ collider: RAPIER.Collider; openFact: string }> = [];
  private readonly disabled = new Set<number>();
  private readonly controller = this.world.createCharacterController(0.015);

  constructor(solids: SolidSpec[]) {
    this.world.timestep = FIXED_DT;
    this.controller.enableAutostep(0.28, 0.25, false);
    this.controller.enableSnapToGround(0.25);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI / 3);
    for (const solid of solids) {
      const [x, y, z] = solid.position;
      const [w, h, d] = solid.size;
      const angle = solid.rotationY ?? 0;
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setTranslation(x, y, z)
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        .setFriction(0.8));
      this.ids.set(collider.handle, `solid:${solid.id}`);
      if (solid.openFact) this.doors.push({ collider, openFact: solid.openFact });
    }
    this.world.step();
  }

  applyFacts(facts: readonly string[]): boolean {
    let changed = false;
    for (const door of this.doors) {
      const enabled = !facts.includes(door.openFact);
      if (door.collider.isEnabled() !== enabled) { door.collider.setEnabled(enabled); changed = true; }
      if (enabled) this.disabled.delete(door.collider.handle); else this.disabled.add(door.collider.handle);
    }
    return changed;
  }

  add(id: string, foot: Vec3, height = 1.8): Body {
    const rigid = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(foot[0], foot[1] + height / 2, foot[2]));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.1, height / 2 - 0.28), 0.28), rigid);
    const body: Body = { rigid, collider, height, grounded: false, verticalSpeed: 0 };
    this.bodies.set(id, body);
    this.ids.set(collider.handle, id);
    return body;
  }

  /** Patient cart collision covers its full bed, rather than a person capsule. */
  addCart(id: string, foot: Vec3, yaw = 0): Body {
    const height = 1.15;
    const rigid = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(foot[0], foot[1] + height / 2, foot[2])
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, height / 2, 1.2), rigid);
    const body: Body = { rigid, collider, height, grounded: false, verticalSpeed: 0 };
    this.bodies.set(id, body); this.ids.set(collider.handle, id);
    return body;
  }

  orient(id: string, yaw: number, tolerance = 0.025): void {
    const body = this.bodies.get(id); if (!body) return;
    const current = body.rigid.rotation();
    const previous = 2 * Math.atan2(current.y, current.w);
    const delta = Math.atan2(Math.sin(yaw - previous), Math.cos(yaw - previous));
    // Sub-degree navigation corrections should not rotate a resting bed box
    // into the ground every fixed tick. Its external dimensions are unchanged.
    if (!tolerance || Math.abs(delta) > tolerance) body.rigid.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  }

  remove(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;
    this.ids.delete(body.collider.handle);
    this.world.removeRigidBody(body.rigid);
    this.bodies.delete(id);
  }

  foot(id: string): Vec3 {
    const body = this.bodies.get(id)!;
    const p = body.rigid.translation();
    return [p.x, p.y - body.height / 2, p.z];
  }

  teleport(id: string, foot: Vec3): void {
    const body = this.bodies.get(id)!;
    const p = { x: foot[0], y: foot[1] + body.height / 2, z: foot[2] };
    body.rigid.setTranslation(p, true);
    body.rigid.setNextKinematicTranslation(p);
    body.verticalSpeed = 0;
  }

  setHeight(id: string, height: number): boolean {
    const body = this.bodies.get(id)!;
    if (body.height === height) return true;
    const foot = this.foot(id);
    const shape = new RAPIER.Capsule(Math.max(0.1, height / 2 - 0.28), 0.28);
    if (height > body.height) {
      const blocked = this.world.intersectionWithShape(
        { x: foot[0], y: foot[1] + height / 2 + 0.025, z: foot[2] },
        { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, undefined, body.collider,
        undefined, c => !this.disabled.has(c.handle) && (this.ids.get(c.handle) ?? '').startsWith('solid:'),
      );
      if (blocked) return false;
    }
    body.height = height;
    body.collider.setShape(shape);
    const verticalSpeed = body.verticalSpeed;
    this.teleport(id, foot);
    body.verticalSpeed = verticalSpeed;
    return true;
  }

  move(id: string, x: number, z: number, dt: number, jump = false): void {
    const body = this.bodies.get(id)!;
    if (jump && body.grounded) body.verticalSpeed = 1.65;
    body.verticalSpeed -= GRAVITY * dt;
    if (body.grounded && !jump) body.verticalSpeed = -0.2;
    const desired = { x: x * dt, y: body.verticalSpeed * dt, z: z * dt };
    // NPC routes may overlap other NPCs; render and story slots keep contacts deliberate.
    this.controller.computeColliderMovement(body.collider, desired, undefined, undefined,
      c => !this.disabled.has(c.handle) && (this.ids.get(c.handle) ?? '').startsWith('solid:'));
    const delta = this.controller.computedMovement();
    const p = body.rigid.translation();
    body.rigid.setNextKinematicTranslation({ x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z });
    body.grounded = this.controller.computedGrounded();
    if (delta.y < desired.y - 0.001 && body.verticalSpeed > 0) body.verticalSpeed = 0;
  }

  step(): void { this.world.step(); }

  trace(from: Vec3, to: Vec3, exclude = '', onlySolids = false): TraceHit | null {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-8) return null;
    const ray = new RAPIER.Ray({ x: from[0], y: from[1], z: from[2] }, { x: dx / distance, y: dy / distance, z: dz / distance });
    const hit = this.world.castRayAndGetNormal(ray, distance, true, undefined, undefined,
      this.bodies.get(exclude)?.collider, undefined,
      // A door's broad-phase entry is removed on the next fixed tick. Respect
      // its disabled state immediately, including same-frame interaction rays.
      // Keep the predicate in JS: calling collider methods here would re-enter
      // a borrowed WASM ColliderSet during Rapier's query callback.
      c => !this.disabled.has(c.handle) && (!onlySolids || (this.ids.get(c.handle) ?? '').startsWith('solid:')));
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return { id: this.ids.get(hit.collider.handle) ?? 'unknown', point: [p.x, p.y, p.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z], distance: hit.timeOfImpact };
  }

  dispose(): void { this.world.free(); this.bodies.clear(); this.ids.clear(); this.disabled.clear(); }
}
