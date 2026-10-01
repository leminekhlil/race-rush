import { clamp, wrapAngle, type TrackPath } from '@race-rush/shared';
import type { VehicleModel } from '../scene/VehicleFactory';

export interface PoseInput {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  steer: number;
  grounded: boolean;
  vy: number;
  roll: number;
  pitch: number;
  suspension: number;
  wheelSpin: number;
  drifting: boolean;
  driftDir: number;
  braking: boolean;
}

/** Applies a vehicle pose to its model: ground slope, body roll/pitch, suspension, wheel spin & steer. */
export class VehicleView {
  private hint = -1;
  private slope = 0;

  constructor(
    readonly model: VehicleModel,
    private readonly path: TrackPath,
  ) {}

  apply(p: PoseInput, dt: number): void {
    const m = this.model;
    m.root.position.set(p.x, p.y, p.z);
    // Align with road slope along the heading.
    const proj = this.path.project(p.x, p.z, this.hint);
    this.hint = proj.index;
    const ahead = this.path.groundHeight(proj.s + 1.5) - this.path.groundHeight(proj.s - 1.5);
    const trackHeading = Math.atan2(this.path.txs[proj.index], this.path.tzs[proj.index]);
    const along = Math.cos(wrapAngle(p.heading - trackHeading));
    const targetSlope = p.grounded ? -Math.atan(ahead / 3) * along : clamp(-p.vy * 0.025, -0.35, 0.35);
    this.slope += (targetSlope - this.slope) * Math.min(1, dt * (p.grounded ? 12 : 3));
    m.root.rotation.set(this.slope, p.heading, 0);

    m.chassis.position.y = m.bodyRestY + p.suspension;
    m.chassis.rotation.x = p.pitch;
    m.chassis.rotation.z = p.roll;

    const counter = p.drifting ? -p.driftDir * 0.35 : 0;
    for (const w of m.wheels) {
      w.spin.rotation.x = (p.wheelSpin * 0.4) / w.radius;
      if (w.front) w.pivot.rotation.y = clamp(p.steer * 0.45 + counter, -0.6, 0.6);
      if (!m.wheelsOnChassis) w.pivot.position.y = w.restY;
    }
    m.setBrakeLights(p.braking);
  }
}
