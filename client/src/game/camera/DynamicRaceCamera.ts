import type { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { clamp, damp, lerp, wrapAngle, type TrackPath, type VehicleState, type VehicleTuning } from '@race-rush/shared';

export type CameraMode = 'intro' | 'follow' | 'finish';

const angleLerp = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;

/**
 * Third-person race camera: speed-dependent FOV and distance, drift swing, boost punch,
 * airtime float, impact trauma shake, subtle roll into turns, intro and finish orbits.
 */
export class DynamicRaceCamera {
  readonly camera: FreeCamera;
  mode: CameraMode = 'intro';
  private yaw = 0;
  private dist = 7;
  private height = 2.6;
  private fov = 0.95;
  private roll = 0;
  private trauma = 0;
  private fovKick = 0;
  private time = 0;
  private modeTime = 0;
  private hint = -1;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private readonly tmp = new Vector3();
  private initialized = false;
  introDuration = 3.5;

  constructor(
    scene: Scene,
    private readonly path: TrackPath,
    viewDistance: number,
  ) {
    this.camera = new FreeCamera('raceCam', new Vector3(0, 5, -10), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.3;
    this.camera.maxZ = viewDistance;
    this.camera.fov = this.fov;
    scene.activeCamera = this.camera;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  kickFov(amount: number): void {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  update(dt: number, st: VehicleState, tuning: VehicleTuning): void {
    this.time += dt;
    this.modeTime += dt;
    const cfg = tuning.camera;
    const scale = cfg.height / 2.6;
    const speedRatio = clamp(Math.abs(st.speed) / tuning.maxSpeed, 0, 1.4);

    if (!this.initialized) {
      this.yaw = st.heading;
      this.dist = cfg.distance;
      this.height = cfg.height;
      this.pos.set(st.x - Math.sin(st.heading) * cfg.distance, st.y + cfg.height, st.z - Math.cos(st.heading) * cfg.distance);
      this.initialized = true;
    }

    let targetYaw: number;
    let targetDist: number;
    let targetHeight: number;
    let posRate: number;
    let targetFov = cfg.fov;

    if (this.mode === 'intro') {
      const t = clamp(this.modeTime / this.introDuration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      targetYaw = st.heading + (1 - ease) * (Math.PI * 0.85);
      targetDist = lerp(cfg.distance * 1.5, cfg.distance, ease);
      targetHeight = lerp(cfg.height * 0.7, cfg.height, ease);
      posRate = 30;
      this.yaw = targetYaw;
    } else if (this.mode === 'finish') {
      targetYaw = st.heading + Math.PI * 0.25 + this.modeTime * 0.35;
      targetDist = cfg.distance * 1.35;
      targetHeight = cfg.height * 1.1;
      posRate = 3;
      this.yaw = angleLerp(this.yaw, targetYaw, damp(2, dt));
    } else {
      // Follow: blend heading with velocity direction so drifts show the slide angle.
      const vel = Math.hypot(st.vx, st.vz);
      let follow = st.heading;
      if (vel > 6 && st.speed > 0) follow = angleLerp(st.heading, Math.atan2(st.vx, st.vz), st.drifting ? 0.55 : 0.3);
      targetYaw = follow;
      this.yaw = angleLerp(this.yaw, targetYaw, damp(4 + speedRatio * 2.5, dt));
      targetDist = cfg.distance * (1 + 0.16 * speedRatio) + (st.boosting ? 1.1 * scale : 0);
      targetHeight = cfg.height * (1 - 0.1 * speedRatio);
      posRate = st.grounded ? 9 : 4;
      targetFov = cfg.fov + 0.2 * Math.min(speedRatio, 1.2) + (st.boosting ? 0.13 : 0);
    }

    this.dist += (targetDist - this.dist) * damp(3, dt);
    this.height += (targetHeight - this.height) * damp(3, dt);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const tx = st.x - fx * this.dist;
    const tz = st.z - fz * this.dist;
    const ty = st.y + this.height;
    const kXZ = damp(this.mode === 'intro' ? 30 : 14, dt);
    const kY = damp(posRate, dt);
    this.pos.x += (tx - this.pos.x) * kXZ;
    this.pos.z += (tz - this.pos.z) * kXZ;
    this.pos.y += (ty - this.pos.y) * kY;

    // Keep the camera above the road surface.
    const p = this.path.project(this.pos.x, this.pos.z, this.hint);
    this.hint = p.index;
    const minY = this.path.groundHeight(p.s) + 0.9;
    if (this.pos.y < minY) this.pos.y = minY;

    // Shake (trauma^2) and FOV punch.
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.fovKick = Math.max(0, this.fovKick - dt * 0.6);
    const shake = this.trauma * this.trauma * 0.32 * scale;
    const n1 = Math.sin(this.time * 47.3) * Math.cos(this.time * 31.1);
    const n2 = Math.sin(this.time * 39.7 + 1.3) * Math.cos(this.time * 23.9);
    // High-speed micro vibration (very subtle).
    const buzz = st.grounded ? speedRatio * speedRatio * 0.012 : 0;
    this.camera.position.set(this.pos.x + n1 * shake, this.pos.y + n2 * shake + Math.sin(this.time * 61) * buzz, this.pos.z + n2 * shake * 0.6);

    const lookAhead = this.mode === 'follow' ? 4 + speedRatio * 3 : 0.5;
    this.look.set(st.x + fx * lookAhead, st.y + 1.1 * scale + (st.grounded ? 0 : -0.3), st.z + fz * lookAhead);
    this.camera.setTarget(this.look);

    this.fov += (targetFov + this.fovKick - this.fov) * damp(3.2, dt);
    this.camera.fov = this.fov;

    const targetRoll = this.mode === 'follow' ? -st.steer * Math.min(speedRatio, 1) * 0.035 - st.slip * 0.05 : 0;
    this.roll += (targetRoll - this.roll) * damp(4, dt);
    this.tmp.set(Math.sin(this.roll) * fz, Math.cos(this.roll), -Math.sin(this.roll) * fx);
    this.camera.upVector.copyFrom(this.tmp);
  }
}
