import { Group, MathUtils, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { createReusedAircraft, type ReusedAircraft } from './reused-aircraft';

// Stay beyond the north door's roof edge during the short S12 reception beat.
// Slow distant air cover is a presentation path, not a new flight/physics system.
const CENTER_X = -4, CENTER_Z = -310, RADIUS = 160;
const CRUISE_SPEED = 22, ANGULAR_SPEED = CRUISE_SPEED / RADIUS;
const APPROACH_SECONDS = 6, APPROACH_RADIUS = 180;
const JOIN_ANGLE = Math.PI / 2;
const BASE_ALTITUDE = 60, WINGMAN_DELAY = 4, WINGMAN_HEIGHT = 12;
const up = new Vector3(0, 1, 0), localRollAxis = new Vector3(0, 0, 1);

/** Two distant S12 escorts. This view reads an existing fact and never owns mission progress. */
export class EpilogueAirCover {
  private readonly aircraft: ReusedAircraft[];
  private readonly velocity = new Vector3();
  private readonly target = new Vector3();
  private readonly orientation = new Matrix4();
  private readonly roll = new Quaternion();
  private enabled = false;
  private disposed = false;
  private previousTime?: number;
  private elapsed = 0;

  constructor(parent: Group) {
    this.aircraft = [createReusedAircraft(), createReusedAircraft()];
    for (let i = 0; i < this.aircraft.length; i++) {
      const { root } = this.aircraft[i];
      root.name = `epilogue-air-cover-${i + 1}`;
      root.visible = false;
      root.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
      parent.add(root);
    }
  }

  setFacts(facts: readonly string[]): void {
    if (this.disposed) return;
    const enabled = facts.includes('first-wave-approaching');
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.previousTime = undefined;
    this.elapsed = 0;
    // Fact restoration starts a fresh visual approach on the next simulation sample.
    // There is no fabricated landing, passenger transfer or completion event here.
    for (const aircraft of this.aircraft) {
      aircraft.root.visible = false;
      aircraft.setFlightState({ thrust: 0, gear: 0, tilt: 0, timeSeconds: 0 });
    }
  }

  update(simTimeSeconds: number): void {
    if (this.disposed || !this.enabled || !Number.isFinite(simTimeSeconds) || simTimeSeconds < 0) return;
    if (this.previousTime !== undefined) {
      if (simTimeSeconds === this.previousTime) return;
      if (simTimeSeconds < this.previousTime) {
        // A host clock reset re-anchors time without moving the existing aircraft.
        this.previousTime = simTimeSeconds;
        return;
      }
      this.elapsed += simTimeSeconds - this.previousTime;
    }
    this.previousTime = simTimeSeconds;
    for (let i = 0; i < this.aircraft.length; i++) this.place(this.aircraft[i], this.elapsed - i * WINGMAN_DELAY, i);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.enabled = false;
    // Detach both before either factory releases shared resources. The surrounding
    // environment's owning tree cleanup must not encounter these borrowed meshes.
    for (const aircraft of this.aircraft) aircraft.root.removeFromParent();
    for (const aircraft of this.aircraft) aircraft.dispose();
    this.aircraft.length = 0;
  }

  private place(aircraft: ReusedAircraft, age: number, index: number): void {
    const t = MathUtils.clamp(age / APPROACH_SECONDS, 0, 1);
    // Quintic radius easing has zero first/second derivatives at both ends.
    // It joins the outer approach and the endless patrol without a position,
    // tangent or acceleration seam; no modulo reset or offscreen teleport is used.
    const blend = t * t * t * (t * (t * 6 - 15) + 10);
    const radius = RADIUS + APPROACH_RADIUS * (1 - blend);
    const radialSpeed = -APPROACH_RADIUS / APPROACH_SECONDS * 30 * t * t * (1 - t) * (1 - t);
    const radialAcceleration = -APPROACH_RADIUS / (APPROACH_SECONDS * APPROACH_SECONDS) * 60 * t * (1 - t) * (1 - 2 * t);
    const angle = JOIN_ANGLE + ANGULAR_SPEED * (age - APPROACH_SECONDS);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const { root } = aircraft;
    root.position.set(CENTER_X + radius * cosine, BASE_ALTITUDE + index * WINGMAN_HEIGHT + (radius - RADIUS) * 0.025, CENTER_Z + radius * sine);
    this.velocity.set(radialSpeed * cosine - radius * ANGULAR_SPEED * sine, radialSpeed * 0.025, radialSpeed * sine + radius * ANGULAR_SPEED * cosine);
    const radialTerm = radialAcceleration - radius * ANGULAR_SPEED * ANGULAR_SPEED;
    const accelerationX = radialTerm * cosine - 2 * radialSpeed * ANGULAR_SPEED * sine;
    const accelerationZ = radialTerm * sine + 2 * radialSpeed * ANGULAR_SPEED * cosine;
    const headingRate = (this.velocity.x * accelerationZ - this.velocity.z * accelerationX)
      / (this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    // Keep the short approach's curvature changes from snapping the wings.
    // A small bank reads at this distance without treating this path as physics.
    const bank = MathUtils.clamp(-headingRate * 0.5, -0.18, 0.18);
    this.target.copy(root.position).add(this.velocity);
    this.orientation.lookAt(root.position, this.target, up);
    root.quaternion.setFromRotationMatrix(this.orientation).multiply(this.roll.setFromAxisAngle(localRollAxis, bank));
    root.visible = true;
    aircraft.setFlightState({ thrust: 0.68, gear: 0, tilt: 0, timeSeconds: this.elapsed });
  }
}
