import { clamp, createRng, wrapAngle } from '../math';
import type { ArcadeVehicle, VehicleInput } from '../physics/ArcadeVehicle';

export interface AutoPilotOptions {
  /** 0.8 (casual) .. 1.0 (perfect). Scales cornering speed and reaction. */
  skill: number;
  /** Preferred lateral offset from the centerline (meters). */
  lane: number;
  seed: number;
  /** Allow using boost on straights. */
  useBoost: boolean;
}

/**
 * Steering/throttle controller following the racing line. Drives bots (server + offline)
 * and the player car in automated tests / dev "autopilot".
 */
export class AutoPilot {
  readonly input: VehicleInput = { throttle: 0, brake: 0, steer: 0, boost: false, drift: false };
  /** Externally adjustable rubber-band multiplier on target speed. */
  pace = 1;
  private readonly rng: () => number;
  private lane: number;
  private laneTarget: number;
  private laneTimer = 0;

  constructor(
    readonly vehicle: ArcadeVehicle,
    readonly opts: AutoPilotOptions,
  ) {
    this.rng = createRng(opts.seed);
    this.lane = opts.lane;
    this.laneTarget = opts.lane;
  }

  update(dt: number): VehicleInput {
    const v = this.vehicle;
    const st = v.state;
    const path = v.path;
    const t = v.tuning;
    const speed = Math.max(0, st.speed);

    // Wander slowly between lanes so bots don't drive in a perfect line.
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + this.rng() * 3;
      const half = path.widthAt(st.s) / 2 - t.radius - 1;
      this.laneTarget = clamp(this.opts.lane + (this.rng() - 0.5) * 6, -half, half);
    }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 0.8);

    // Pure-pursuit target ahead on the line; tighter lane in corners.
    const lookahead = 9 + speed * 0.42;
    const kNear = Math.abs(path.sampleAt(st.s + lookahead * 0.5).curvature);
    const laneNow = this.lane * clamp(1 - kNear * 25, 0.2, 1);
    const target = path.pointAt(st.s + lookahead, laneNow);
    const desired = Math.atan2(target.x - st.x, target.z - st.z);
    const err = wrapAngle(desired - st.heading);
    const gain = 1.6 + this.opts.skill * 0.8;
    this.input.steer = clamp(err * gain, -1, 1);

    // Corner speed: v <= turnRate * falloff / curvature.
    const brakingWindow = 18 + speed * 1.1;
    const k = Math.max(path.maxCurvatureAhead(st.s + 4, brakingWindow), 1e-4);
    const falloff = 1 - t.highSpeedSteerFalloff * Math.pow(clamp(speed / t.maxSpeed, 0, 1), 2);
    const vCorner = (t.turnRate * falloff * 0.92) / k;
    const targetSpeed = Math.min(t.maxSpeed * (this.pace < 1 ? 1 : 1.1), vCorner * (0.8 + 0.2 * this.opts.skill)) * this.pace;

    this.input.throttle = speed < targetSpeed ? 1 : speed < targetSpeed + 2 ? 0.3 : 0;
    this.input.brake = speed > targetSpeed + 4 ? clamp((speed - targetSpeed) / 10, 0.3, 1) : 0;
    if (st.speed < -1) {
      // Recover from reversing after a crash.
      this.input.throttle = 1;
      this.input.brake = 0;
    }
    const straight = path.maxCurvatureAhead(st.s, 120) < 0.006;
    this.input.boost = this.opts.useBoost && this.pace >= 1 && straight && st.boost > 1 && speed > 25 && Math.abs(err) < 0.15;
    if (st.boosting && !straight) this.input.boost = false;
    if (st.boosting && straight && st.boost > 0 && this.pace >= 1) this.input.boost = true;
    this.input.drift = false;
    return this.input;
  }
}
