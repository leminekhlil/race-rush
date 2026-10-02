import type { TrackPath } from './track/TrackPath';
import { absoluteMaxSpeed, type VehicleId } from './vehicles';

export type AnomalyKind = 'speed' | 'teleport' | 'checkpoint_skip' | 'lap_time' | 'race_time' | 'off_track' | 'payload' | 'flood';

export interface Anomaly {
  kind: AnomalyKind;
  detail: string;
  at: number;
}

/** Tolerances: generous enough for network jitter, strict enough to catch edits. */
export const SPEED_TOLERANCE = 1.25;
export const SPEED_SLACK = 6; // m/s
export const TELEPORT_DISTANCE = 45; // meters in one update without a declared respawn
export const MAX_STATE_RATE = 40; // messages per second

/** Planar speed check between two consecutive positions received by the server. */
export const checkMovement = (
  vehicle: VehicleId,
  prev: { x: number; z: number; t: number },
  next: { x: number; z: number; t: number },
): Anomaly | null => {
  const dt = Math.max(0.03, (next.t - prev.t) / 1000);
  const d = Math.hypot(next.x - prev.x, next.z - prev.z);
  if (d > TELEPORT_DISTANCE && d / dt > absoluteMaxSpeed(vehicle) * 2) {
    return { kind: 'teleport', detail: `moved ${d.toFixed(1)}m in ${(dt * 1000).toFixed(0)}ms`, at: next.t };
  }
  const v = d / dt;
  const limit = absoluteMaxSpeed(vehicle) * SPEED_TOLERANCE + SPEED_SLACK;
  if (v > limit && d > 4) {
    return { kind: 'speed', detail: `${v.toFixed(1)} m/s > ${limit.toFixed(1)}`, at: next.t };
  }
  return null;
};

/** Fastest physically possible lap (seconds) for a vehicle on a track. */
export const minimumLapTime = (path: TrackPath, vehicle: VehicleId): number => (path.length / absoluteMaxSpeed(vehicle)) * 0.92;

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Measures sustained speed over a server-clock window, rather than packet arrival gaps. */
export class MovementWindow {
  private startedAt: number | null = null;
  private distance = 0;

  reset(): void {
    this.startedAt = null;
    this.distance = 0;
  }

  check(vehicle: VehicleId, prev: { x: number; z: number; t: number }, next: { x: number; z: number; t: number }): Anomaly | null {
    const instant = checkMovement(vehicle, prev, next);
    if (instant?.kind === 'teleport') {
      this.reset();
      return instant;
    }
    this.startedAt ??= prev.t;
    this.distance += Math.hypot(next.x - prev.x, next.z - prev.z);
    const elapsed = (next.t - this.startedAt) / 1000;
    if (elapsed < 1) return null;
    const distance = this.distance;
    this.startedAt = next.t;
    this.distance = 0;
    const limit = absoluteMaxSpeed(vehicle) * SPEED_TOLERANCE + SPEED_SLACK;
    // A bounded 150ms allowance absorbs packets crossing a window boundary.
    if (distance > limit * (elapsed + 0.15)) {
      return { kind: 'speed', detail: `${(distance / elapsed).toFixed(1)} m/s over ${elapsed.toFixed(2)}s > ${limit.toFixed(1)}`, at: next.t };
    }
    return null;
  }
}
