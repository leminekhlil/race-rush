import { clamp, damp, wrapAngle } from '../math';
import type { TrackPath } from '../track/TrackPath';
import type { VehicleTuning } from '../vehicles';

export interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
  boost: boolean;
  drift: boolean;
}

export const emptyInput = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, boost: false, drift: false });

/** Another body the local vehicle can bump into (remote player, bot). */
export interface Obstacle {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  mass: number;
}

export type VehicleEvent =
  | { type: 'impact'; kind: 'wall' | 'car'; strength: number; x: number; y: number; z: number; otherId?: string }
  | { type: 'land'; strength: number }
  | { type: 'takeoff' }
  | { type: 'boostStart' }
  | { type: 'boostEnd' }
  | { type: 'driftStart'; dir: number }
  | { type: 'driftEnd'; charged: number }
  | { type: 'respawn' };

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  vy: number;
  /** Signed forward speed (m/s). */
  speed: number;
  grounded: boolean;
  airTime: number;
  boost: number;
  boosting: boolean;
  drifting: boolean;
  driftDir: number;
  driftTime: number;
  steer: number;
  throttle: number;
  s: number;
  lateral: number;
  trackIndex: number;
  offroad: boolean;
  wrongWayTime: number;
  stuckTime: number;
  ghostTime: number;
  // Visual helpers.
  slip: number;
  suspension: number;
  suspensionVel: number;
  pitch: number;
  roll: number;
  wheelSpin: number;
  rpm: number;
}

const GRAVITY = 19.6; // arcade gravity: snappy jumps, quick landings
const WALL_RESTITUTION = 0.25;
const MIN_BOOST_START = 0.2;

/**
 * Arcade vehicle simulation. Engine-agnostic and deterministic for a fixed timestep.
 * Collisions against barriers are resolved analytically in the track frame (robust, cheap on mobile).
 */
export class ArcadeVehicle {
  readonly state: VehicleState;
  readonly events: VehicleEvent[] = [];
  /** Arc-length of the last validated checkpoint (respawn anchor). */
  respawnS = 0;
  /** Owner id: obstacles with the same id are ignored (self). */
  ownerId = '';
  private wallCooldown = 0;

  constructor(
    readonly path: TrackPath,
    public tuning: VehicleTuning,
    s = 0,
    lateral = 0,
  ) {
    this.state = {
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      speed: 0,
      grounded: true,
      airTime: 0,
      boost: tuning.boostCapacity * 0.5,
      boosting: false,
      drifting: false,
      driftDir: 0,
      driftTime: 0,
      steer: 0,
      throttle: 0,
      s: 0,
      lateral: 0,
      trackIndex: -1,
      offroad: false,
      wrongWayTime: 0,
      stuckTime: 0,
      ghostTime: 0,
      slip: 0,
      suspension: 0,
      suspensionVel: 0,
      pitch: 0,
      roll: 0,
      wheelSpin: 0,
      rpm: 0,
    };
    this.placeAt(s, lateral);
    this.respawnS = s;
  }

  placeAt(s: number, lateral: number): void {
    const p = this.path.pointAt(s, lateral);
    const st = this.state;
    st.x = p.x;
    st.z = p.z;
    st.y = p.y;
    st.heading = p.heading;
    st.vx = st.vz = st.vy = 0;
    st.speed = 0;
    st.grounded = true;
    st.airTime = 0;
    st.drifting = false;
    st.boosting = false;
    st.steer = 0;
    st.stuckTime = 0;
    st.wrongWayTime = 0;
    const proj = this.path.project(st.x, st.z);
    st.s = proj.s;
    st.lateral = proj.lateral;
    st.trackIndex = proj.index;
  }

  respawn(): void {
    this.placeAt(this.respawnS + 6, 0);
    this.state.ghostTime = 1.5;
    this.events.push({ type: 'respawn' });
  }

  /** Advances the simulation by dt seconds. Events are appended to `events` (caller drains them). */
  step(dt: number, input: VehicleInput, obstacles: readonly Obstacle[] = []): void {
    const t = this.tuning;
    const st = this.state;
    st.throttle = input.throttle;
    st.ghostTime = Math.max(0, st.ghostTime - dt);
    this.wallCooldown -= dt;

    // --- Steering input smoothing (faster when reversing direction).
    const steerTarget = clamp(input.steer, -1, 1);
    const response = Math.sign(steerTarget) !== Math.sign(st.steer) ? t.steerResponse * 1.6 : t.steerResponse;
    st.steer += (steerTarget - st.steer) * damp(response, dt);

    // --- Boost resource.
    const wantsBoost = input.boost && st.boost > (st.boosting ? 0 : MIN_BOOST_START);
    if (wantsBoost && !st.boosting) this.events.push({ type: 'boostStart' });
    if (!wantsBoost && st.boosting) this.events.push({ type: 'boostEnd' });
    st.boosting = wantsBoost;
    if (st.boosting) st.boost = Math.max(0, st.boost - dt);
    else st.boost = Math.min(t.boostCapacity, st.boost + t.boostRegen * dt);

    let fx = Math.sin(st.heading);
    let fz = Math.cos(st.heading);
    let vf = st.vx * fx + st.vz * fz;

    if (st.grounded) {
      // --- Drift state machine.
      const absV = Math.abs(vf);
      if (!st.drifting && input.drift && Math.abs(steerTarget) > 0.3 && vf > 17) {
        st.drifting = true;
        st.driftDir = Math.sign(steerTarget);
        st.driftTime = 0;
        this.events.push({ type: 'driftStart', dir: st.driftDir });
      } else if (st.drifting && (!input.drift || vf < 11)) {
        this.endDrift();
      }
      if (st.drifting) st.driftTime += dt;

      // --- Yaw.
      let steer = st.steer;
      if (st.drifting) steer = st.driftDir * (0.6 + 0.45 * st.steer * st.driftDir);
      const speedFactor = clamp(absV / t.turnSpeedRef, 0, 1);
      const highFalloff = 1 - t.highSpeedSteerFalloff * Math.pow(clamp(absV / t.maxSpeed, 0, 1), 2);
      const yawRate = steer * t.turnRate * speedFactor * highFalloff * (st.drifting ? t.driftTurnBoost : 1) * Math.sign(vf || 1);
      st.heading = wrapAngle(st.heading + yawRate * dt);
    } else {
      st.heading = wrapAngle(st.heading + st.steer * t.turnRate * t.airControl * dt);
      if (st.drifting) this.endDrift();
    }

    // --- Decompose world velocity in the (new) vehicle frame.
    fx = Math.sin(st.heading);
    fz = Math.cos(st.heading);
    const rx = fz;
    const rz = -fx;
    vf = st.vx * fx + st.vz * fz;
    let vl = st.vx * rx + st.vz * rz;

    if (st.grounded) {
      const offroadMul = st.offroad ? t.offroadMaxFactor : 1;
      const vmax = t.maxSpeed * offroadMul;
      const vmaxBoost = t.maxSpeed * t.boostMul * offroadMul;
      const cap = st.boosting ? vmaxBoost : vmax;

      if (input.throttle > 0 && vf > -1) {
        const ratio = clamp(vf / vmax, 0, 1.2);
        vf += input.throttle * t.accel * Math.max(0.08, 1 - ratio * ratio) * dt;
      }
      if (st.boosting && vf < vmaxBoost) vf += t.boostAccel * dt;

      if (input.brake > 0) {
        if (st.drifting) vf -= t.brake * 0.12 * dt;
        else if (vf > 0.5) vf -= t.brake * input.brake * dt;
        else vf = Math.max(-t.reverseMax, vf - t.accel * 0.6 * input.brake * dt);
      }
      if (input.throttle <= 0 && input.brake <= 0) {
        const drag = t.coastDrag * dt;
        vf = Math.abs(vf) <= drag ? 0 : vf - Math.sign(vf) * drag;
      }
      if (st.offroad) vf -= Math.sign(vf) * Math.min(Math.abs(vf), t.offroadDrag * dt);
      // Smoothly bleed off excess speed (end of boost, leaving road).
      if (vf > cap) vf = Math.max(cap, vf - (vf - cap) * damp(1.6, dt) - 4 * dt);

      // --- Lateral grip, with part of the lateral energy transferred forward (keeps arcade momentum).
      const grip = st.drifting ? t.driftGrip : t.grip;
      const lost = vl * damp(grip, dt);
      vl -= lost;
      const transfer = st.drifting ? t.gripTransfer * 0.7 : t.gripTransfer;
      if (vf > 0) vf += Math.abs(lost) * transfer * 0.35;
      if (st.drifting) {
        // Keep the slide alive: push outward of the turn proportionally to speed.
        vl += -st.driftDir * Math.min(vf, 40) * 0.9 * dt;
        st.boost = Math.min(t.boostCapacity, st.boost + t.driftBoostCharge * 0.25 * dt);
      }
    } else {
      vf -= Math.sign(vf) * 0.6 * dt;
      if (st.boosting) vf += t.boostAccel * 0.4 * dt;
    }

    st.vx = fx * vf + rx * vl;
    st.vz = fz * vf + rz * vl;
    st.speed = vf;

    // --- Planar integration.
    const prevY = st.y;
    st.x += st.vx * dt;
    st.z += st.vz * dt;

    // --- Vertical: ground following, takeoff and landing.
    const proj = this.path.project(st.x, st.z, st.trackIndex);
    st.s = proj.s;
    st.lateral = proj.lateral;
    st.trackIndex = proj.index;
    const groundY = this.path.groundHeight(proj.s);
    if (st.grounded) {
      const ballistic = st.y + st.vy * dt - 0.5 * GRAVITY * t.gravityScale * dt * dt;
      if (ballistic > groundY + 0.12 && vf > 8) {
        st.grounded = false;
        st.y = ballistic;
        st.vy -= GRAVITY * t.gravityScale * dt;
        st.airTime = 0;
        this.events.push({ type: 'takeoff' });
      } else {
        st.y = groundY;
        st.vy = clamp((groundY - prevY) / dt, -30, 30);
      }
    } else {
      st.vy -= GRAVITY * t.gravityScale * dt;
      st.y += st.vy * dt;
      st.airTime += dt;
      if (st.y <= groundY) {
        const strength = Math.max(0, -st.vy);
        st.y = groundY;
        st.vy = 0;
        st.grounded = true;
        st.suspensionVel -= strength * this.tuning.suspensionTravel * 2.2;
        if (st.airTime > 0.35) st.boost = Math.min(t.boostCapacity, st.boost + t.airBoostCharge * Math.min(st.airTime, 1.5));
        this.events.push({ type: 'land', strength });
        st.airTime = 0;
      }
    }

    st.offroad = Math.abs(st.lateral) > this.path.widthAt(st.s) / 2 + 0.4;

    this.collideBarriers();
    if (st.ghostTime <= 0) this.collideObstacles(obstacles);
    this.updateHelpers(dt, vf, vl);
  }

  private endDrift(): void {
    const st = this.state;
    const charged = st.driftTime > 0.7 ? Math.min(1.2, st.driftTime / 2) * this.tuning.driftBoostCharge : 0;
    st.boost = Math.min(this.tuning.boostCapacity, st.boost + charged);
    st.drifting = false;
    this.events.push({ type: 'driftEnd', charged });
  }

  private collideBarriers(): void {
    const st = this.state;
    const t = this.tuning;
    const limit = this.path.barrierOffset(st.s) - t.radius * 0.75;
    const over = Math.abs(st.lateral) - limit;
    if (over <= 0) return;
    const side = Math.sign(st.lateral);
    const smp = this.path.sampleAt(st.s);
    // Push back inside.
    st.x -= smp.rx * over * side;
    st.z -= smp.rz * over * side;
    st.lateral -= over * side;
    // Remove the velocity component going into the wall.
    const vn = (st.vx * smp.rx + st.vz * smp.rz) * side;
    if (vn <= 0) return;
    const impulse = vn * (1 + WALL_RESTITUTION);
    st.vx -= smp.rx * impulse * side;
    st.vz -= smp.rz * impulse * side;
    // Tangential loss proportional to the normal impact (glancing scrapes keep momentum, head-on hits hurt).
    const vt = st.vx * smp.tx + st.vz * smp.tz;
    const loss = Math.min(Math.abs(vt), vn * 0.35);
    st.vx -= smp.tx * Math.sign(vt) * loss;
    st.vz -= smp.tz * Math.sign(vt) * loss;
    // Arcade recovery: nudge heading back along the track (whichever direction is closer).
    let target = smp.heading;
    if (Math.abs(wrapAngle(target - st.heading)) > Math.PI / 2) target = wrapAngle(target + Math.PI);
    st.heading = wrapAngle(st.heading + wrapAngle(target - st.heading) * clamp(vn * 0.025, 0.08, 0.5));
    if (st.drifting && vn > 6) this.endDrift();
    if (vn > 2.5 && (this.wallCooldown <= 0 || vn > 9)) {
      this.wallCooldown = 0.3;
      this.events.push({ type: 'impact', kind: 'wall', strength: vn, x: st.x, y: st.y + 0.6, z: st.z });
    }
  }

  private collideObstacles(obstacles: readonly Obstacle[]): void {
    const st = this.state;
    const t = this.tuning;
    for (const o of obstacles) {
      if (o.id === this.ownerId) continue;
      const dx = st.x - o.x;
      const dz = st.z - o.z;
      const minD = t.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD || Math.abs(st.y - o.y) > 2.2) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d;
      const nz = dz / d;
      const share = o.mass / (t.mass + o.mass);
      st.x += nx * (minD - d) * Math.max(0.55, share);
      st.z += nz * (minD - d) * Math.max(0.55, share);
      const rvn = (st.vx - o.vx) * nx + (st.vz - o.vz) * nz;
      if (rvn >= 0) continue;
      const j = -(1 + 0.35) * rvn * share;
      st.vx += nx * j;
      st.vz += nz * j;
      // Light vehicles get spun by impacts.
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      const cross = fx * nz - fz * nx;
      st.heading = wrapAngle(st.heading - cross * Math.min(-rvn, 25) * 0.012 * (1 - t.stability) * share * 2);
      if (-rvn > 1.5) {
        this.events.push({
          type: 'impact',
          kind: 'car',
          strength: -rvn,
          x: (st.x + o.x) / 2,
          y: st.y + 0.7,
          z: (st.z + o.z) / 2,
          otherId: o.id,
        });
      }
    }
  }

  private updateHelpers(dt: number, vf: number, vl: number): void {
    const st = this.state;
    const t = this.tuning;
    // Visual slip angle, suspension spring, body roll/pitch.
    st.slip += (Math.atan2(vl, Math.max(Math.abs(vf), 4)) - st.slip) * damp(8, dt);
    const accelPitch = st.boosting ? -0.035 : st.throttle > 0 ? -0.015 : 0;
    st.suspensionVel += (-t.suspensionStiffness * st.suspension - t.suspensionDamping * st.suspensionVel) * dt;
    st.suspension = clamp(st.suspension + st.suspensionVel * dt, -t.suspensionTravel, t.suspensionTravel);
    const lateralG = st.steer * clamp(Math.abs(vf) / t.maxSpeed, 0, 1);
    // Cars roll outward (+), motorcycles lean into the turn (-).
    st.roll += (lateralG * (t.bodyRoll - t.lean) - st.roll) * damp(7, dt);
    st.pitch += (accelPitch + (st.grounded ? 0 : clamp(-st.vy * 0.01, -0.15, 0.15)) - st.pitch) * damp(5, dt);
    st.wheelSpin += (vf * dt) / 0.4;
    // Approximate RPM with gear changes for the audio layer (0..1).
    const ratio = clamp(Math.abs(vf) / (t.maxSpeed * t.boostMul), 0, 1);
    const gear = Math.min(t.audio.gears - 1, Math.floor(ratio * t.audio.gears));
    const inGear = ratio * t.audio.gears - gear;
    const target = clamp(0.18 + inGear * 0.72 + gear * 0.02 + (st.throttle > 0 ? 0.06 : 0), 0, 1);
    st.rpm += (target - st.rpm) * damp(st.grounded ? 9 : 4, dt);

    // Stuck / wrong-way bookkeeping.
    const trackHeading = this.path.sampleAt(st.s).heading;
    const facing = Math.cos(wrapAngle(st.heading - trackHeading));
    st.wrongWayTime = facing < -0.35 && Math.abs(vf) > 4 ? st.wrongWayTime + dt : Math.max(0, st.wrongWayTime - dt * 2);
    st.stuckTime = st.throttle > 0.5 && Math.abs(vf) < 1.5 ? st.stuckTime + dt : 0;
    if (st.stuckTime > 3 || st.y < this.path.groundHeight(st.s) - 6) this.respawn();
  }

  /** Planar speed (m/s). */
  get planarSpeed(): number {
    return Math.hypot(this.state.vx, this.state.vz);
  }
}
