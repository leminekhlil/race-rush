export const TAU = Math.PI * 2;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Wraps an angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  if (r > Math.PI) r -= TAU;
  return r;
};

/** Wraps a scalar distance on a loop of given length to (-len/2, len/2]. */
export const wrapDelta = (d: number, len: number): number => {
  let r = d % len;
  if (r <= -len / 2) r += len;
  if (r > len / 2) r -= len;
  return r;
};

export const mod = (v: number, m: number): number => ((v % m) + m) % m;

/** Deterministic PRNG (mulberry32). */
export const createRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const dist2d = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);
