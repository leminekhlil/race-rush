import { clamp, mod, wrapAngle } from '../math';
import type { TrackDefinition, TrackRamp } from './TrackDefinition';

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent (driving direction). */
  tx: number;
  tz: number;
  /** Unit right vector. */
  rx: number;
  rz: number;
  width: number;
  /** Yaw angle (rad) of the driving direction: forward = (sin h, cos h). */
  heading: number;
  curvature: number;
}

export interface Projection {
  /** Arc-length position along the loop [0, length). */
  s: number;
  /** Signed lateral offset from centerline (positive = right). */
  lateral: number;
  /** Index of the sample segment start. Reusable as a search hint. */
  index: number;
}

const SAMPLE_STEP = 2; // meters between resampled points
const SUBDIVISIONS = 48;

interface RawPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Centripetal Catmull-Rom (alpha = 0.5), avoids cusps and self-loops on uneven spacing. */
const catmullRom = (p0: RawPoint, p1: RawPoint, p2: RawPoint, p3: RawPoint, u: number): RawPoint => {
  const knot = (a: RawPoint, b: RawPoint) => Math.max(Math.pow(Math.hypot(b.x - a.x, b.z - a.z), 0.5), 1e-4);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: RawPoint, b: RawPoint, ta: number, tb: number): RawPoint => {
    const wa = (tb - t) / (tb - ta);
    const wb = (t - ta) / (tb - ta);
    return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb, w: a.w * wa + b.w * wb };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
};

/**
 * Arc-length parameterised closed centerline of a track.
 * Pure math: shared by the renderer, the vehicle simulation, bots and the authoritative race server.
 */
export class TrackPath {
  readonly length: number;
  readonly count: number;
  readonly halfWidthMax: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
  readonly txs: Float64Array;
  readonly tzs: Float64Array;
  readonly widths: Float64Array;
  readonly curvatures: Float64Array;
  readonly step: number;
  private readonly ramps: TrackRamp[];

  constructor(readonly def: TrackDefinition) {
    const raw: RawPoint[] = def.points.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z, w: p.width ?? def.roadWidth }));
    const n = raw.length;
    const dense: RawPoint[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = raw[mod(i - 1, n)];
      const p1 = raw[i];
      const p2 = raw[(i + 1) % n];
      const p3 = raw[(i + 2) % n];
      for (let k = 0; k < SUBDIVISIONS; k++) dense.push(catmullRom(p0, p1, p2, p3, k / SUBDIVISIONS));
    }
    // Cumulative arc length of the dense polyline.
    const cum = new Float64Array(dense.length + 1);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i];
      const b = dense[(i + 1) % dense.length];
      cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const total = cum[dense.length];
    const count = Math.max(16, Math.round(total / SAMPLE_STEP));
    this.count = count;
    this.length = total;
    this.step = total / count;
    this.xs = new Float64Array(count);
    this.ys = new Float64Array(count);
    this.zs = new Float64Array(count);
    this.txs = new Float64Array(count);
    this.tzs = new Float64Array(count);
    this.widths = new Float64Array(count);
    this.curvatures = new Float64Array(count);

    let j = 0;
    for (let i = 0; i < count; i++) {
      const s = i * this.step;
      while (j < dense.length - 1 && cum[j + 1] < s) j++;
      const segLen = cum[j + 1] - cum[j] || 1;
      const f = (s - cum[j]) / segLen;
      const a = dense[j];
      const b = dense[(j + 1) % dense.length];
      this.xs[i] = a.x + (b.x - a.x) * f;
      this.ys[i] = a.y + (b.y - a.y) * f;
      this.zs[i] = a.z + (b.z - a.z) * f;
      this.widths[i] = a.w + (b.w - a.w) * f;
    }
    let maxW = 0;
    for (let i = 0; i < count; i++) {
      const prev = mod(i - 1, count);
      const next = (i + 1) % count;
      const dx = this.xs[next] - this.xs[prev];
      const dz = this.zs[next] - this.zs[prev];
      const len = Math.hypot(dx, dz) || 1;
      this.txs[i] = dx / len;
      this.tzs[i] = dz / len;
      maxW = Math.max(maxW, this.widths[i]);
    }
    for (let i = 0; i < count; i++) {
      const prev = mod(i - 2, count);
      const next = (i + 2) % count;
      const h0 = Math.atan2(this.txs[prev], this.tzs[prev]);
      const h1 = Math.atan2(this.txs[next], this.tzs[next]);
      this.curvatures[i] = wrapAngle(h1 - h0) / (4 * this.step);
    }
    this.halfWidthMax = maxW / 2;
    this.ramps = def.ramps.map((r) => ({ ...r, at: r.at * total }));
  }

  /** Normalises any arc-length value into [0, length). */
  wrap(s: number): number {
    return mod(s, this.length);
  }

  checkpointS(index: number): number {
    return (index / this.def.checkpoints) * this.length;
  }

  sampleAt(sIn: number, out: PathSample = createSample()): PathSample {
    const s = this.wrap(sIn);
    const fi = s / this.step;
    const i = Math.floor(fi) % this.count;
    const k = (i + 1) % this.count;
    const f = fi - Math.floor(fi);
    out.x = this.xs[i] + (this.xs[k] - this.xs[i]) * f;
    out.z = this.zs[i] + (this.zs[k] - this.zs[i]) * f;
    out.y = this.groundHeight(s);
    let tx = this.txs[i] + (this.txs[k] - this.txs[i]) * f;
    let tz = this.tzs[i] + (this.tzs[k] - this.tzs[i]) * f;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    out.tx = tx;
    out.tz = tz;
    out.rx = tz;
    out.rz = -tx;
    out.width = this.widths[i] + (this.widths[k] - this.widths[i]) * f;
    out.heading = Math.atan2(tx, tz);
    out.curvature = this.curvatures[i] + (this.curvatures[k] - this.curvatures[i]) * f;
    return out;
  }

  /** Road elevation without ramps. */
  baseHeight(sIn: number): number {
    const s = this.wrap(sIn);
    const fi = s / this.step;
    const i = Math.floor(fi) % this.count;
    const k = (i + 1) % this.count;
    const f = fi - Math.floor(fi);
    return this.ys[i] + (this.ys[k] - this.ys[i]) * f;
  }

  /** Extra height contributed by kicker ramps at arc-length s. */
  rampHeight(sIn: number): number {
    const s = this.wrap(sIn);
    let h = 0;
    for (const r of this.ramps) {
      let d = s - (r.at - r.length);
      if (d < 0) d += this.length;
      if (d >= 0 && d <= r.length) h = Math.max(h, r.height * (d / r.length));
    }
    return h;
  }

  /** Ramp extents in arc-length (start, lip), already scaled to meters. */
  rampSpans(): { start: number; lip: number; height: number }[] {
    return this.ramps.map((r) => ({ start: this.wrap(r.at - r.length), lip: this.wrap(r.at), height: r.height }));
  }

  groundHeight(s: number): number {
    return this.baseHeight(s) + this.rampHeight(s);
  }

  widthAt(sIn: number): number {
    const s = this.wrap(sIn);
    const i = Math.floor(s / this.step) % this.count;
    return this.widths[i];
  }

  /** Half distance between centerline and barrier face. */
  barrierOffset(s: number): number {
    return this.widthAt(s) / 2 + this.def.shoulder;
  }

  /**
   * Projects a world XZ position onto the centerline.
   * With a valid `hint` (previous index) the search is local and O(1).
   */
  project(x: number, z: number, hint = -1, out: Projection = { s: 0, lateral: 0, index: 0 }): Projection {
    let bestD = Infinity;
    let bestI = 0;
    let bestF = 0;
    const scan = (from: number, to: number) => {
      for (let n = from; n <= to; n++) {
        const i = mod(n, this.count);
        const k = (i + 1) % this.count;
        const ax = this.xs[i];
        const az = this.zs[i];
        const sx = this.xs[k] - ax;
        const sz = this.zs[k] - az;
        const l2 = sx * sx + sz * sz || 1;
        const f = clamp(((x - ax) * sx + (z - az) * sz) / l2, 0, 1);
        const px = ax + sx * f - x;
        const pz = az + sz * f - z;
        const d = px * px + pz * pz;
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestF = f;
        }
      }
    };
    if (hint >= 0) {
      scan(hint - 30, hint + 30);
      const limit = this.halfWidthMax + this.def.shoulder + 12;
      if (bestD > limit * limit) {
        bestD = Infinity;
        scan(0, this.count - 1);
      }
    } else {
      scan(0, this.count - 1);
    }
    const i = bestI;
    const k = (i + 1) % this.count;
    const cx = this.xs[i] + (this.xs[k] - this.xs[i]) * bestF;
    const cz = this.zs[i] + (this.zs[k] - this.zs[i]) * bestF;
    const tx = this.txs[i];
    const tz = this.tzs[i];
    out.s = this.wrap((i + bestF) * this.step);
    out.lateral = (x - cx) * tz - (z - cz) * tx;
    out.index = i;
    return out;
  }

  /** World position of a point at arc-length s with lateral offset. */
  pointAt(s: number, lateral: number): { x: number; y: number; z: number; heading: number } {
    const p = this.sampleAt(s);
    return { x: p.x + p.rx * lateral, y: p.y, z: p.z + p.rz * lateral, heading: p.heading };
  }

  /** Maximum absolute curvature over a window ahead, used by bots to anticipate turns. */
  maxCurvatureAhead(s: number, distance: number): number {
    let k = 0;
    const steps = Math.max(1, Math.ceil(distance / this.step));
    const i0 = Math.floor(this.wrap(s) / this.step);
    for (let n = 0; n < steps; n++) k = Math.max(k, Math.abs(this.curvatures[(i0 + n) % this.count]));
    return k;
  }
}

export const createSample = (): PathSample => ({
  x: 0,
  y: 0,
  z: 0,
  tx: 0,
  tz: 1,
  rx: 1,
  rz: 0,
  width: 0,
  heading: 0,
  curvature: 0,
});
