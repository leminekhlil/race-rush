import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { createRng, type TrackPath } from '@race-rush/shared';
import { extrudeAlongTrack, GeometryBatch } from './geometry';
import { roadSignTexture } from './textures';

/**
 * Signature landmarks of each map (map references 07 / 08):
 * - City: tunnel, elevated highway crossing the circuit (with the green RACE RUSH sign and traffic),
 *   harbour with containers and cranes, residential street with power lines, parked cars downtown.
 * - Desert: rock arch, wooden trestle bridge, water towers, abandoned gas station, windmills,
 *   canyon tunnel, wooden fences and dry bushes.
 * Everything sits outside the barriers or high above the road, so gameplay and physics are unchanged.
 * Geometry is merged per material (vertex colours) to keep draw calls low.
 */

const C = (h: string) => Color3.FromHexString(h);

interface Zone {
  x: number;
  z: number;
  r: number;
}

export interface LandmarkPlan {
  /** True when generic roadside props (lamps, palms, banners, signs) must not be placed at arc-length s. */
  skipRoadside(s: number): boolean;
  /** True when a decor footprint (buildings, rocks…) at x,z with radius r overlaps a landmark. */
  blocked(x: number, z: number, r: number): boolean;
}

interface Spec {
  tunnel: [number, number];
  /** Structures spanning the road (arch, bridges, overpass): s positions. */
  spans: number[];
  zones: Zone[];
}

const frac = (path: TrackPath, f: number) => path.wrap(path.length * f);

/** Side (+1 right / -1 left) that points away from the circuit centre at arc-length s. */
const outward = (path: TrackPath, s: number): 1 | -1 => {
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < path.count; i++) {
    cx += path.xs[i];
    cz += path.zs[i];
  }
  cx /= path.count;
  cz /= path.count;
  const p = path.sampleAt(s);
  const dot = (p.x - cx) * p.rx + (p.z - cz) * p.rz;
  return dot >= 0 ? 1 : -1;
};

const worldAt = (path: TrackPath, s: number, lateral: number) => {
  const p = path.pointAt(s, lateral);
  return { x: p.x, z: p.z };
};

const specFor = (path: TrackPath): Spec => {
  const desert = path.def.theme === 'desert';
  const zones: Zone[] = [];
  const zone = (s: number, lateral: number, r: number) => zones.push({ ...worldAt(path, s, lateral), r });
  if (desert) {
    const sArch = frac(path, 0.3);
    const sBridge = frac(path, 0.45);
    const W = (s: number) => path.barrierOffset(s);
    for (const side of [-1, 1]) {
      zone(sArch, side * (W(sArch) + 5), 8);
      zone(sBridge, side * (W(sBridge) + 6), 8);
    }
    zone(frac(path, 0.08), (W(frac(path, 0.08)) + 18) * outward(path, frac(path, 0.08)), 6);
    zone(frac(path, 0.47), -(W(frac(path, 0.47)) + 16) * outward(path, frac(path, 0.47)), 6);
    zone(frac(path, 0.88), (W(frac(path, 0.88)) + 17) * outward(path, frac(path, 0.88)), 12);
    zone(frac(path, 0.12), (W(frac(path, 0.12)) + 30) * outward(path, frac(path, 0.12)), 6);
    zone(frac(path, 0.55), (W(frac(path, 0.55)) + 26) * outward(path, frac(path, 0.55)), 6);
    return { tunnel: [frac(path, 0.68), frac(path, 0.75)], spans: [sArch, sBridge], zones };
  }
  const sOver = frac(path, 0.17);
  const W = (s: number) => path.barrierOffset(s);
  for (const side of [-1, 1]) zone(sOver, side * (W(sOver) + 9), 12);
  const sPort = frac(path, 0.5);
  const oPort = outward(path, sPort);
  zone(sPort, oPort * (W(sPort) + 28), 36);
  zone(sPort, oPort * (W(sPort) + 90), 52);
  for (let f = 0.79; f <= 0.93; f += 0.02) {
    const s = frac(path, f);
    zone(s, outward(path, s) * (W(s) + 17), 8);
  }
  return { tunnel: [frac(path, 0.66), frac(path, 0.72)], spans: [sOver], zones };
};

const inRange = (s: number, a: number, b: number, margin: number, L: number) => {
  const d = (x: number) => ((x % L) + L) % L;
  const from = d(a - margin);
  const len = d(b - a) + margin * 2;
  return d(s - from) <= len;
};

export const planLandmarks = (path: TrackPath): LandmarkPlan => {
  const spec = specFor(path);
  const L = path.length;
  return {
    skipRoadside(s) {
      if (inRange(s, spec.tunnel[0], spec.tunnel[1], 8, L)) return true;
      return spec.spans.some((x) => inRange(s, x, x, 9, L));
    },
    blocked(x, z, r) {
      return spec.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + r);
    },
  };
};

/* ------------------------------------------------------------------ helpers */

/** Track frame at s: local +x = right (lateral), +y = up, +z = driving direction. */
const frameAt = (path: TrackPath, s: number, lateral: number, dy = 0, yawOffset = 0): Matrix => {
  const p = path.pointAt(s, lateral);
  return Matrix.RotationY(p.heading + yawOffset).multiply(Matrix.Translation(p.x, path.baseHeight(s) + dy, p.z));
};

/** Ground-level frame (y = 0 terrain) for props placed off the road. */
const groundFrameAt = (path: TrackPath, s: number, lateral: number, yawOffset = 0): Matrix => {
  const p = path.pointAt(s, lateral);
  return Matrix.RotationY(p.heading + yawOffset).multiply(Matrix.Translation(p.x, 0, p.z));
};

const local = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => Matrix.RotationYawPitchRoll(ry, rx, rz).multiply(Matrix.Translation(x, y, z));

const put = (b: GeometryBatch, frame: Matrix, l: Matrix, sx: number, sy: number, sz: number, color: Color3) => b.orientedBox(l.multiply(frame), sx, sy, sz, color);

/** Octagonal ring (tank walls, roof tiers) around the local origin. */
const octagon = (b: GeometryBatch, frame: Matrix, y: number, r: number, h: number, t: number, color: Color3) => {
  const w = 2 * r * Math.tan(Math.PI / 8) + t * 0.6;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(b, frame, Matrix.Translation(0, y, r).multiply(Matrix.RotationY(a)), w, h, t, color);
  }
};

/** Thin box between two world points (wires, braces). */
const beam = (b: GeometryBatch, a: Vector3, c: Vector3, thickness: number, color: Color3) => {
  const d = c.subtract(a);
  const len = d.length();
  const yaw = Math.atan2(d.x, d.z);
  const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  const m = Matrix.RotationYawPitchRoll(yaw, pitch, 0).multiply(Matrix.Translation((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2));
  b.orientedBox(m, thickness, thickness, len, color);
};

const vcMat = (scene: Scene, name: string, opts: { spec?: number; emissive?: string; twoSided?: boolean } = {}) => {
  const m = new StandardMaterial(name, scene);
  m.specularColor = new Color3(opts.spec ?? 0.05, opts.spec ?? 0.05, opts.spec ?? 0.05);
  if (opts.emissive) {
    m.emissiveColor = C(opts.emissive);
    m.disableLighting = true;
  }
  if (opts.twoSided) m.backFaceCulling = false;
  return m;
};

/* ------------------------------------------------------------- tunnels */

const buildTunnel = (scene: Scene, path: TrackPath, from: number, to: number, desert: boolean, main: GeometryBatch, lights: GeometryBatch) => {
  const L = path.length;
  const span = ((to - from) % L + L) % L;
  const W = (s: number) => path.barrierOffset(s) + 1.0;
  const H = 7.2;
  const shell = new GeometryBatch();
  extrudeAlongTrack(shell, path, {
    from,
    to,
    offsets: (s) => [-W(s), -W(s), -W(s) + 1.2, W(s) - 1.2, W(s), W(s)],
    heights: () => [0, H - 1, H, H, H - 1, 0],
    us: [0, 0.25, 0.4, 0.6, 0.75, 1],
    vLength: 8,
  });
  const sm = vcMat(scene, 'tunnelShellMat', { twoSided: true });
  // Lit from inside: back faces use flipped normals, dim tint so the tube reads as a tunnel.
  sm.twoSidedLighting = true;
  sm.diffuseColor = C(desert ? '#5e3a24' : '#4d525b');
  sm.emissiveColor = C(desert ? '#22140a' : '#1c1f25');
  shell.build('tunnelShell', scene, sm, false);

  const portal = C(desert ? '#a85a32' : '#9aa0a8');
  const hazardA = C('#ffc61a');
  const hazardB = C('#15171c');
  const rock = [C('#b8693a'), C('#c97c45'), C('#9c5a33')];
  const rng = createRng(Math.round(from * 13));
  for (const s of [from, to]) {
    const f = frameAt(path, s, 0);
    const w = W(s);
    put(main, f, local(-w - 1.2, H / 2 + 0.4, 0), 2.4, H + 0.8, 1.6, portal);
    put(main, f, local(w + 1.2, H / 2 + 0.4, 0), 2.4, H + 0.8, 1.6, portal);
    if (desert) {
      put(main, f, local(0, H + 1.6, 0), w * 2 + 5, 3.2, 1.8, portal);
    } else {
      // Concrete lintel with a yellow / black hazard band (city tunnel reference).
      put(main, f, local(0, H + 1.4, 0), w * 2 + 5, 2.8, 1.6, portal);
      const n = 14;
      for (let k = 0; k < n; k++) put(main, f, local(-w - 2 + ((k + 0.5) * (w * 2 + 4)) / n, H + 0.35, -0.85), (w * 2 + 4) / n, 0.7, 0.08, k % 2 ? hazardA : hazardB);
    }
  }
  // Mass over the tunnel: rocky mountain (desert) or planted concrete cover (city).
  for (let d = 0; d <= span; d += 9) {
    const s = from + d;
    const f = frameAt(path, s, 0);
    const w = W(s);
    if (desert) {
      const hgt = 6 + rng() * 9;
      put(main, f, local((rng() - 0.5) * 6, H + hgt / 2, 0, 0, rng() * 0.6), w * 2 + 8 + rng() * 10, hgt, 11, rock[Math.floor(rng() * 3)]);
    } else {
      put(main, f, local(0, H + 0.65, 0), w * 2 + 4, 1, 9.5, C('#7d8590'));
      put(main, f, local(0, H + 1.3, 0), w * 2 + 2, 0.3, 9.5, C('#4f9e47'));
    }
  }
  // Warm ceiling lamps every 8 m on both sides.
  for (let d = 4; d < span; d += 8) {
    const s = from + d;
    const f = frameAt(path, s, 0);
    const w = W(s);
    for (const side of [-1, 1]) put(lights, f, local(side * (w - 1.6), H - 0.15, 0), 1.2, 0.18, 0.5, C('#ffffff'));
  }
};

/* --------------------------------------------------------------- city */

const carBody = (b: GeometryBatch, f: Matrix, color: Color3) => {
  const dark = C('#1b1e26');
  const glass = C('#22344f');
  put(b, f, local(0, 0.6, 0), 1.85, 0.6, 4.1, color);
  put(b, f, local(0, 1.12, -0.25), 1.6, 0.5, 2.1, color);
  put(b, f, local(0, 1.12, -0.25), 1.64, 0.36, 1.9, glass);
  for (const x of [-0.85, 0.85]) for (const z of [-1.3, 1.3]) put(b, f, local(x, 0.36, z), 0.32, 0.72, 0.72, dark);
};

const CAR_COLORS = ['#e3262f', '#1f6bff', '#ffc61a', '#eef1f6', '#2ecc40', '#8a3dff', '#ff7a1a', '#1b1d24'].map(C);

const buildCity = (scene: Scene, path: TrackPath, density: number, main: GeometryBatch, lights: GeometryBatch, animated: ((dt: number, t: number) => void)[]) => {
  const rng = createRng(9071);
  const concrete = C('#b9bec6');
  const concreteDark = C('#8c929b');

  // Elevated highway crossing the circuit, with the green RACE RUSH sign and moving traffic.
  const sOver = frac(path, 0.17);
  const W = path.barrierOffset(sOver);
  const f = frameAt(path, sOver, 0);
  const deckY = 9.4;
  const half = W + 18;
  put(main, f, local(0, deckY, 0), half * 2, 1.3, 10, concrete);
  put(main, f, local(0, deckY - 0.75, 0), half * 2 - 1, 0.25, 9, concreteDark);
  for (const x of [-(W + 3.5), W + 3.5, -(W + 13), W + 13]) {
    put(main, f, local(x, deckY / 2, 0), 1.8, deckY, 5.5, concrete);
    put(main, f, local(x, deckY - 0.9, 0), 3.2, 0.8, 8, concreteDark);
  }
  // Red / white parapets on both deck edges.
  const n = Math.round((half * 2) / 2.4);
  for (const z of [-4.8, 4.8]) for (let k = 0; k < n; k++) put(main, f, local(-half + (k + 0.5) * ((half * 2) / n), deckY + 1.15, z), (half * 2) / n, 1, 0.4, k % 2 ? C('#f7f7f7') : C('#e23b3b'));
  const signMat = new StandardMaterial('overpassSignMat', scene);
  signMat.emissiveTexture = roadSignTexture(scene, 'RACE RUSH');
  signMat.disableLighting = true;
  const sign = CreatePlane('overpassSign', { width: 10, height: 2.5 }, scene);
  const sm = Matrix.Translation(0, deckY - 0.1, -5.15).multiply(f);
  const sp = new Vector3();
  const sq = new Quaternion();
  sm.decompose(undefined, sq, sp);
  sign.position.copyFrom(sp);
  sign.rotationQuaternion = sq;
  sign.material = signMat;
  sign.isPickable = false;
  // Traffic on the overpass: small cars sliding across the deck (hidden past the deck ends).
  const travel = half * 2 + 12;
  for (const [lane, dir] of [
    [-2.2, 1],
    [2.2, -1],
  ] as const) {
    for (let k = 0; k < 3; k++) {
      const car = new GeometryBatch();
      carBody(car, local(0, 0, 0, 0, Math.PI / 2), CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]);
      const mesh = car.build(`overpassCar${lane}-${k}`, scene, vcMat(scene, `overpassCarMat${lane}-${k}`, { spec: 0.3 }), true);
      mesh.unfreezeWorldMatrix();
      const base = Matrix.Translation(0, deckY + 0.65, lane).multiply(f);
      const pos = new Vector3();
      const rot = new Quaternion();
      let offset = (k / 3) * travel + rng() * 8;
      animated.push((dt) => {
        offset = (offset + dt * 12) % travel;
        const x = dir * (offset - travel / 2);
        mesh.setEnabled(Math.abs(x) < half - 2.5);
        Matrix.RotationY(dir > 0 ? 0 : Math.PI).multiply(Matrix.Translation(x, 0, 0)).multiply(base).decompose(undefined, rot, pos);
        mesh.position.copyFrom(pos);
        mesh.rotationQuaternion = rot;
      });
    }
  }

  // Harbour: containers, gantry cranes, quay and water on the outer side.
  const sPort = frac(path, 0.5);
  const o = outward(path, sPort);
  const Wp = path.barrierOffset(sPort);
  const yard = groundFrameAt(path, sPort, o * (Wp + 28));
  const containerColors = ['#d9472b', '#2f6fd6', '#f2b33d', '#2e9e5b', '#e66a1f', '#7a8a99', '#b83280'].map(C);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      if (rng() < 0.15) continue;
      const stack = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < stack; k++) {
        const x = (row - 1.5) * 7.5;
        const z = (col - 2) * 14;
        const color = containerColors[Math.floor(rng() * containerColors.length)];
        put(main, yard, local(x, 1.3 + k * 2.6, z), 2.5, 2.55, 12, color);
        // Corrugation ribs.
        for (const side of [-1, 1]) put(main, yard, local(x + side * 1.27, 1.3 + k * 2.6, z), 0.06, 2.3, 11.2, color.scale(0.75));
      }
    }
  }
  const craneRed = C('#e2552b');
  for (const z of [-26, 26]) {
    const cf = Matrix.Translation(o * 20, 0, z).multiply(yard);
    for (const x of [-5, 5]) for (const zz of [-4, 4]) put(main, cf, local(x, 10, zz), 1.3, 20, 1.3, craneRed);
    put(main, cf, local(0, 20, -4), 11, 0.9, 0.9, craneRed);
    put(main, cf, local(0, 20, 4), 11, 0.9, 0.9, craneRed);
    put(main, cf, local(o * 12, 21, 0), 40, 1.1, 1.6, craneRed);
    put(main, cf, local(o * -2, 22.4, 0), 3, 2.2, 3, C('#f2f2f2'));
    put(main, cf, local(0, 26, 0), 0.8, 10, 0.8, craneRed);
  }
  const quay = groundFrameAt(path, sPort, o * (Wp + 52));
  put(main, quay, local(0, 0.4, 0), 6, 0.8, 120, concreteDark);
  const water = CreateGround('harbourWater', { width: 70, height: 160 }, scene);
  const wq = groundFrameAt(path, sPort, o * (Wp + 90));
  const wp = new Vector3();
  const wr = new Quaternion();
  wq.decompose(undefined, wr, wp);
  water.position.set(wp.x, 0.05, wp.z);
  water.rotationQuaternion = wr;
  const wm = new StandardMaterial('harbourWaterMat', scene);
  wm.diffuseColor = C('#2f86d9');
  wm.specularColor = new Color3(0.6, 0.7, 0.8);
  wm.specularPower = 64;
  water.material = wm;
  water.isPickable = false;

  // Residential street: small pastel houses with pitched roofs, power poles and wires.
  const houseColors = ['#f6d6a8', '#f2b5c9', '#bfe3d0', '#d7e3f5', '#ffe8a6'].map(C);
  const roofColor = C('#a8452e');
  let lastPole: Vector3 | null = null;
  for (let fr = 0.79; fr <= 0.93; fr += 0.02) {
    const s = frac(path, fr);
    const side = outward(path, s);
    const hf = groundFrameAt(path, s, side * (path.barrierOffset(s) + 17), side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const col = houseColors[Math.floor(rng() * houseColors.length)];
    put(main, hf, local(0, 2.6, 0), 9, 5.2, 7, col);
    put(main, hf, local(0, 5.95, -1.9, -0.6), 9.6, 0.3, 4.6, roofColor);
    put(main, hf, local(0, 5.95, 1.9, 0.6), 9.6, 0.3, 4.6, roofColor);
    put(main, hf, local(0, 1.1, -3.52), 1.2, 2.2, 0.1, C('#6b4423'));
    for (const x of [-2.8, 2.8]) put(main, hf, local(x, 3.2, -3.52), 1.6, 1.2, 0.1, C('#3a5f8f'));
    // Power pole by the road with a crossbar; wires to the previous pole.
    const pf = frameAt(path, s, side * (path.barrierOffset(s) + 3.2));
    put(main, pf, local(0, 4.5, 0), 0.3, 9, 0.3, C('#6b4a2b'));
    put(main, pf, local(0, 8.6, 0), 2.6, 0.18, 0.18, C('#6b4a2b'));
    const top = Vector3.TransformCoordinates(new Vector3(0, 8.7, 0), pf);
    if (lastPole && Vector3.Distance(lastPole, top) < 60) {
      for (const dx of [-1.1, 1.1]) beam(main, lastPole.add(new Vector3(dx * 0.7, 0, 0)), top.add(new Vector3(dx * 0.7, 0, 0)), 0.05, C('#222'));
    }
    lastPole = top;
  }

  // Parked cars along the downtown sidewalks.
  for (let s = 20; s < path.length; s += 23 / Math.max(0.4, density)) {
    const fr = s / path.length;
    if (!(fr < 0.15 || fr > 0.95 || (fr > 0.36 && fr < 0.46))) continue;
    const smp = path.sampleAt(s);
    if (Math.abs(smp.curvature) > 1 / 70 || path.baseHeight(s) > 0.3) continue;
    for (const side of [-1, 1]) {
      if (rng() < 0.35) continue;
      carBody(main, frameAt(path, s, side * (path.barrierOffset(s) + 3.2), 0, rng() < 0.5 ? 0 : Math.PI), CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]);
    }
  }
  void lights;
};

/* -------------------------------------------------------------- desert */

const buildDesert = (scene: Scene, path: TrackPath, density: number, main: GeometryBatch, animated: ((dt: number, t: number) => void)[]) => {
  const rng = createRng(4247);
  const rocks = [C('#c4622d'), C('#d0733a'), C('#b25428'), C('#dd8a4a')];
  const wood = C('#7a4f2a');
  const woodDark = C('#5b3a1e');

  // Rock arch spanning the road.
  const sArch = frac(path, 0.3);
  const Wa = path.barrierOffset(sArch) + 4;
  const fa = frameAt(path, sArch, 0);
  for (const side of [-1, 1]) {
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const h = 3.6 + rng() * 1.6;
      put(main, fa, local(side * (Wa + (rng() - 0.5)), y + h / 2, (rng() - 0.5) * 1.2, 0, rng() * 0.4), 6.5 - k * 0.6, h, 7 - k * 0.5, rocks[k % 4]);
      y += h * 0.92;
    }
  }
  const segs = 11;
  for (let k = 0; k < segs; k++) {
    const t0 = Math.PI - (k / segs) * Math.PI;
    const t1 = Math.PI - ((k + 1) / segs) * Math.PI;
    const tm = (t0 + t1) / 2;
    const x = Math.cos(tm) * Wa;
    const y = 15 + Math.sin(tm) * 6.5;
    const len = Math.hypot(Math.cos(t1) * Wa - Math.cos(t0) * Wa, Math.sin(t1) * 6.5 - Math.sin(t0) * 6.5) + 1.2;
    const slope = Math.atan2(Math.sin(t1) * 6.5 - Math.sin(t0) * 6.5, Math.cos(t1) * Wa - Math.cos(t0) * Wa);
    put(main, fa, local(x, y, 0, 0, 0, slope), len, 3.8 + rng(), 6.5 + rng(), rocks[k % 4]);
  }

  // Wooden trestle bridge over the road + a water tower beside it.
  const sBridge = frac(path, 0.45);
  const Wb = path.barrierOffset(sBridge);
  const fb = frameAt(path, sBridge, 0);
  const deck = 8.6;
  const halfB = Wb + 10;
  put(main, fb, local(0, deck, 0), halfB * 2, 0.6, 4.4, wood);
  for (let k = -halfB; k <= halfB; k += 1.4) put(main, fb, local(k, deck + 0.34, 0), 0.9, 0.1, 4.6, woodDark);
  for (const z of [-2.1, 2.1]) {
    put(main, fb, local(0, deck + 1.1, z), halfB * 2, 0.16, 0.16, woodDark);
    for (let k = -halfB; k <= halfB; k += 2.5) put(main, fb, local(k, deck + 0.6, z), 0.16, 1.1, 0.16, woodDark);
  }
  for (const x of [-(Wb + 2), Wb + 2, -(Wb + 8), Wb + 8]) {
    for (const z of [-1.7, 1.7]) put(main, fb, local(x, deck / 2 - 0.5, z), 0.45, deck + 1, 0.45, wood);
    put(main, fb, local(x, deck / 2, 0, 0.75), 0.25, deck * 0.95, 0.25, woodDark);
    put(main, fb, local(x, deck / 2, 0, -0.75), 0.25, deck * 0.95, 0.25, woodDark);
  }

  const waterTower = (f: Matrix) => {
    for (const x of [-1.7, 1.7]) for (const z of [-1.7, 1.7]) put(main, f, local(x, 4.5, z), 0.35, 9, 0.35, wood);
    for (const h of [3, 6.5]) {
      put(main, f, local(0, h, -1.7), 3.4, 0.18, 0.18, woodDark);
      put(main, f, local(0, h, 1.7), 3.4, 0.18, 0.18, woodDark);
      put(main, f, local(-1.7, h, 0), 0.18, 0.18, 3.4, woodDark);
      put(main, f, local(1.7, h, 0), 0.18, 0.18, 3.4, woodDark);
    }
    put(main, f, local(0, 9.1, 0), 5.2, 0.3, 5.2, woodDark);
    octagon(main, f, 10.9, 2.3, 3.4, 0.3, C('#8b5a2b'));
    put(main, f, local(0, 12.7, 0), 4.8, 0.2, 4.8, woodDark);
    octagon(main, f, 13.1, 1.8, 0.6, 0.6, C('#6b4423'));
    octagon(main, f, 13.6, 1.1, 0.5, 0.6, C('#6b4423'));
    put(main, f, local(0, 14.1, 0), 0.6, 0.6, 0.6, C('#6b4423'));
  };
  const s1 = frac(path, 0.08);
  waterTower(groundFrameAt(path, s1, (path.barrierOffset(s1) + 18) * outward(path, s1)));
  const s2 = frac(path, 0.47);
  waterTower(groundFrameAt(path, s2, -(path.barrierOffset(s2) + 16) * outward(path, s2)));

  // Abandoned gas station facing the road.
  const sGas = frac(path, 0.88);
  const og = outward(path, sGas);
  const gf = groundFrameAt(path, sGas, og * (path.barrierOffset(sGas) + 13), og > 0 ? -Math.PI / 2 : Math.PI / 2);
  put(main, gf, local(0, 5.1, 0), 13, 0.7, 7.5, C('#f2eee6'));
  put(main, gf, local(0, 4.6, 0), 13.1, 0.35, 7.6, C('#d33a2c'));
  for (const x of [-4.5, 4.5]) put(main, gf, local(x, 2.4, 0), 0.5, 4.8, 0.5, C('#e9e4da'));
  for (const x of [-2.2, 2.2]) {
    put(main, gf, local(x, 0.9, 0), 0.9, 1.8, 0.7, C('#d33a2c'));
    put(main, gf, local(x, 1.6, -0.36), 0.6, 0.4, 0.05, C('#f2eee6'));
  }
  put(main, gf, local(0, 2.2, 7.5), 10, 4.4, 6, C('#e3c9a0'));
  put(main, gf, local(0, 4.5, 7.5), 10.4, 0.3, 6.4, C('#9c5a33'));
  put(main, gf, local(-2.5, 2.2, 4.48), 3.2, 1.6, 0.1, C('#2a3550'));
  put(main, gf, local(2.6, 1.3, 4.48), 1.3, 2.6, 0.1, C('#5b3a1e'));
  put(main, gf, local(-6.5, 3.5, 0), 0.3, 7, 0.3, C('#8a8f99'));
  put(main, gf, local(-6.5, 7.2, 0), 2.8, 1.8, 0.25, C('#d33a2c'));

  // Windmills with a spinning rotor.
  const windmill = (s: number, lateral: number) => {
    const f = groundFrameAt(path, s, lateral);
    const hgt = 13;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const lean = 0.09;
        put(main, f, local(x * 1.05, hgt / 2, z * 1.05, -z * lean, 0, x * lean), 0.22, hgt + 0.3, 0.22, C('#8a8f99'));
      }
    for (const h of [3.5, 7, 10.5]) {
      const w = 2.6 - h * 0.11;
      put(main, f, local(0, h, -w / 2), w, 0.12, 0.12, C('#8a8f99'));
      put(main, f, local(0, h, w / 2), w, 0.12, 0.12, C('#8a8f99'));
    }
    put(main, f, local(0, hgt + 0.2, 0.6), 0.4, 0.4, 2.4, C('#6d737d'));
    put(main, f, local(0, hgt + 0.4, 2.2), 0.08, 1.2, 1.6, C('#d33a2c'));
    const rotor = new GeometryBatch();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      rotor.orientedBox(Matrix.Translation(0, 1.6, 0).multiply(Matrix.RotationZ(a)), 0.55, 2.6, 0.06, C('#d9dde4'));
    }
    rotor.orientedBox(Matrix.Identity(), 0.6, 0.6, 0.4, C('#6d737d'));
    const mesh = rotor.build(`windRotor${s.toFixed(0)}`, scene, vcMat(scene, `windRotorMat${s.toFixed(0)}`), true);
    mesh.unfreezeWorldMatrix();
    const pos = Vector3.TransformCoordinates(new Vector3(0, hgt + 0.2, -0.75), f);
    const p = path.pointAt(s, lateral);
    mesh.position.copyFrom(pos);
    const speed = 0.8 + rng() * 0.6;
    animated.push((_, t) => mesh.rotation.set(0, p.heading, t * speed));
  };
  const sw1 = frac(path, 0.12);
  windmill(sw1, (path.barrierOffset(sw1) + 30) * outward(path, sw1));
  const sw2 = frac(path, 0.55);
  windmill(sw2, (path.barrierOffset(sw2) + 26) * outward(path, sw2));

  // Wooden fences along the open zones (thin-instanced 3 m segments).
  const fence = new GeometryBatch();
  fence.orientedBox(Matrix.Translation(0, 0.6, 0), 0.16, 1.2, 0.16, woodDark);
  fence.orientedBox(Matrix.Translation(0, 0.95, 1.5), 0.08, 0.14, 3, wood);
  fence.orientedBox(Matrix.Translation(0, 0.5, 1.5), 0.08, 0.14, 3, wood);
  const fenceMesh = fence.build('fence', scene, vcMat(scene, 'fenceMat'), true);
  fenceMesh.unfreezeWorldMatrix();
  const fm: number[] = [];
  for (let s = 0; s < path.length; s += 3) {
    const fr = s / path.length;
    if (!(fr < 0.16 || fr > 0.82 || (fr > 0.36 && fr < 0.42))) continue;
    for (const side of [-1, 1]) {
      const smp = path.sampleAt(s);
      const off = (path.barrierOffset(s) + 3) * side;
      Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, smp.heading, 0), new Vector3(smp.x + smp.rx * off, path.baseHeight(s), smp.z + smp.rz * off)).copyToArray(fm, fm.length);
    }
  }
  if (fm.length) fenceMesh.thinInstanceSetBuffer('matrix', new Float32Array(fm), 16, true);

  // Dry bushes.
  const bush = new GeometryBatch();
  const dry = [C('#a8893f'), C('#8f7434'), C('#b89a52')];
  for (let k = 0; k < 5; k++) bush.orientedBox(Matrix.RotationYawPitchRoll(k * 1.3, 0.5, 0.3 * k).multiply(Matrix.Translation(0, 0.35, 0)), 0.18, 0.9, 0.18, dry[k % 3]);
  const bushMesh = bush.build('bush', scene, vcMat(scene, 'bushMat'), true);
  bushMesh.unfreezeWorldMatrix();
  const bm: number[] = [];
  for (let i = 0; i < 160 * density; i++) {
    const s = rng() * path.length;
    const side = rng() < 0.5 ? -1 : 1;
    const smp = path.sampleAt(s);
    const off = (path.barrierOffset(s) + 4 + rng() * 25) * side;
    const sc = 0.8 + rng() * 0.9;
    Matrix.Compose(new Vector3(sc, sc, sc), Quaternion.FromEulerAngles(0, rng() * 6, 0), new Vector3(smp.x + smp.rx * off, 0, smp.z + smp.rz * off)).copyToArray(bm, bm.length);
  }
  if (bm.length) bushMesh.thinInstanceSetBuffer('matrix', new Float32Array(bm), 16, true);
};

/* ---------------------------------------------------------------- entry */

export const buildLandmarks = (scene: Scene, path: TrackPath, density: number, animated: ((dt: number, t: number) => void)[]): Mesh[] => {
  const desert = path.def.theme === 'desert';
  const spec = specFor(path);
  const main = new GeometryBatch();
  const lights = new GeometryBatch();
  buildTunnel(scene, path, spec.tunnel[0], spec.tunnel[1], desert, main, lights);
  if (desert) buildDesert(scene, path, density, main, animated);
  else buildCity(scene, path, density, main, lights, animated);
  const out: Mesh[] = [];
  out.push(main.build('landmarks', scene, vcMat(scene, 'landmarksMat', { spec: 0.08 }), true));
  if (lights.indices.length) out.push(lights.build('landmarkLights', scene, vcMat(scene, 'landmarkLightsMat', { emissive: '#ffd27a' }), true));
  return out;
};
