import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { TrackPath } from '@race-rush/shared';
import { GeometryBatch } from '../geometry';
import { make } from '../textures';
import { adAtlas, AD_COUNT, facadeTextures, signAtlas, SHOP_SIGNS, SIGN_COLS, SIGN_ROWS, type FacadeStyle } from './cityTextures';

/**
 * Modular procedural city (city map references): a continuous street wall of shops and apartments along the circuit,
 * side streets with crossings, taller second rows, glass towers with setbacks and rooftop billboards, a distant
 * skyline ring and street furniture. Facades come from five styles × colour tints × heights so no two blocks repeat.
 * Everything is merged per material (≈ 14 draw calls for the whole city) and lit windows / neon signs come alive
 * in night mode through emissive textures.
 */

export interface CityOptions {
  night: boolean;
  density: number;
  /** Footprint test: true when a circle (x, z, r) is free of road, barriers, embankments and landmarks. */
  clearOf: (x: number, z: number, r: number) => boolean;
  /** Distance from the centreline to the outer side of barrier + embankment at s. */
  setbackAt: (s: number) => number;
  /** Generic roadside props must not be placed at s (tunnels, spans). */
  skipRoadside: (s: number) => boolean;
  rng: () => number;
}

export interface BuiltCity {
  update(dt: number, t: number): void;
}

const C = (h: string) => Color3.FromHexString(h);

const TINTS: Record<FacadeStyle, Color3[]> = {
  glass: ['#ffffff', '#d8e8ff', '#cfeee6', '#e8dcff'].map(C),
  office: ['#ffffff', '#f3e7d3', '#dfe6ee', '#f6dccf'].map(C),
  apartment: ['#ffffff', '#ffe0c2', '#ffd1dc', '#cdeee4', '#fff1b8', '#d6e4ff'].map(C),
  brick: ['#ffffff', '#e8c2b0', '#d9b39c'].map(C),
  shop: ['#ffffff', '#f0e6d8', '#e4ecf2'].map(C),
};

/** Module size (metres) of one facade texture repeat. */
const MODULE = { u: 8, v: 7 };
const SHOP_H = 4.6;
const FLOOR = 3.5;

/* ---------------------------------------------------------------- geometry */

/** Box with walls tiled by facade modules (separate u / v scales) and a plain roof. Local -z = front. */
const facadeBox = (b: GeometryBatch, cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, color: Color3, vMod = MODULE.v) => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hx = w / 2;
  const hz = d / 2;
  const corner = (lx: number, lz: number) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
  const p = [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)];
  const widths = [w, d, w, d];
  const y1 = y0 + h;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const bb = p[(i + 1) % 4];
    const uMax = Math.max(1, Math.round(widths[i] / MODULE.u));
    const vMax = h / vMod;
    const v0 = b.vertex(a.x, y0, a.z, 0, 0, color);
    const v1 = b.vertex(bb.x, y0, bb.z, uMax, 0, color);
    const v2 = b.vertex(bb.x, y1, bb.z, uMax, vMax, color);
    const v3 = b.vertex(a.x, y1, a.z, 0, vMax, color);
    b.indices.push(v0, v1, v2, v0, v2, v3);
  }
  const t = p.map((q) => b.vertex(q.x, y1, q.z, 0.001, 0.001, color));
  b.indices.push(t[0], t[1], t[2], t[0], t[2], t[3]);
};

/** Oriented flat box (awnings, ledges, roof units) in a building frame. */
const frameBox = (b: GeometryBatch, frame: Matrix, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: Color3, rotX = 0) =>
  b.orientedBox(Matrix.RotationX(rotX).multiply(Matrix.Translation(lx, ly, lz)).multiply(frame), sx, sy, sz, color);

/** Quad facing -z in a building frame with explicit atlas UVs (signs, ads). */
const frameQuad = (b: GeometryBatch, frame: Matrix, lx: number, ly: number, lz: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number) => {
  const P = (x: number, y: number) => Vector3.TransformCoordinates(new Vector3(lx + x, ly + y, lz), frame);
  const a = P(-w / 2, -h / 2);
  const bb = P(w / 2, -h / 2);
  const c = P(w / 2, h / 2);
  const d = P(-w / 2, h / 2);
  const i0 = b.vertex(a.x, a.y, a.z, u0, v0);
  const i1 = b.vertex(bb.x, bb.y, bb.z, u1, v0);
  const i2 = b.vertex(c.x, c.y, c.z, u1, v1);
  const i3 = b.vertex(d.x, d.y, d.z, u0, v1);
  b.indices.push(i0, i1, i2, i0, i2, i3);
};

/* ------------------------------------------------------------------ builder */

interface Slot {
  x: number;
  z: number;
  r: number;
}

export const buildCity = (scene: Scene, path: TrackPath, o: CityOptions): BuiltCity => {
  const rng = o.rng;
  const batches: Record<FacadeStyle, GeometryBatch> = {
    glass: new GeometryBatch(),
    office: new GeometryBatch(),
    apartment: new GeometryBatch(),
    brick: new GeometryBatch(),
    shop: new GeometryBatch(),
  };
  const roofs = new GeometryBatch();
  const details = new GeometryBatch();
  const signs = new GeometryBatch();
  const ads = new GeometryBatch();
  const streets = new GeometryBatch();
  const beacons: Vector3[] = [];
  const occupied: Slot[] = [];
  const free = (x: number, z: number, r: number) => o.clearOf(x, z, r) && occupied.every((q) => Math.hypot(q.x - x, q.z - z) > (q.r + r) * 0.82);
  const pick = <T,>(list: T[]) => list[Math.floor(rng() * list.length)];

  let cx = 0;
  let cz = 0;
  let span = 0;
  for (let i = 0; i < path.count; i++) {
    cx += path.xs[i];
    cz += path.zs[i];
  }
  cx /= path.count;
  cz /= path.count;
  for (let i = 0; i < path.count; i++) span = Math.max(span, Math.hypot(path.xs[i] - cx, path.zs[i] - cz));

  const roofGrey = [C('#d9d6cf'), C('#bfc3c9'), C('#e8e1d4')];
  const unitGrey = C('#9aa2ad');
  const awningColors = ['#e23b3b', '#1f6bff', '#2e9e5b', '#ffc61a', '#8a3dff', '#ff7a1a', '#14a38b'].map(C);

  /** Rooftop clutter: AC units, water tank, antenna (with blinking beacon on tall ones). */
  const roofTop = (frame: Matrix, w: number, d: number, top: number, tall: boolean) => {
    frameBox(roofs, frame, 0, top + 0.35, 0, w + 0.4, 0.7, d + 0.4, pick(roofGrey));
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) frameBox(details, frame, (rng() - 0.5) * w * 0.6, top + 1.1, (rng() - 0.5) * d * 0.6, 2 + rng() * 2, 1.2, 1.6 + rng(), unitGrey);
    if (rng() < 0.35) {
      frameBox(details, frame, w * 0.25, top + 2.4, d * 0.2, 2.6, 2.6, 2.6, C('#8b5a3c'));
      frameBox(details, frame, w * 0.25, top + 1.1, d * 0.2, 0.3, 1.6, 0.3, C('#5b6470'));
    }
    if (tall && rng() < 0.6) {
      const ah = 8 + rng() * 14;
      frameBox(details, frame, 0, top + ah / 2, 0, 0.5, ah, 0.5, C('#c3c8d0'));
      beacons.push(Vector3.TransformCoordinates(new Vector3(0, top + ah + 0.4, 0), frame));
    }
  };

  /** One building with a front (local -z) facing the street. */
  const building = (x: number, z: number, yaw: number, w: number, d: number, kind: 'shop' | 'mid' | 'tower', street: boolean) => {
    const frame = Matrix.RotationY(yaw).multiply(Matrix.Translation(x, 0, z));
    let y = 0;
    if (kind === 'shop') {
      facadeBox(batches.shop, x, 0, z, w, SHOP_H, d, yaw, pick(TINTS.shop), SHOP_H);
      y = SHOP_H;
      // Awning + neon sign over the storefront.
      if (street) {
        frameBox(details, frame, 0, SHOP_H - 0.9, -d / 2 - 0.9, w * 0.86, 0.12, 1.9, pick(awningColors), -0.22);
        const sign = Math.floor(rng() * SHOP_SIGNS.length);
        const col = sign % SIGN_COLS;
        const row = Math.floor(sign / SIGN_COLS);
        const sw = Math.min(w * 0.7, 7.5);
        frameQuad(signs, frame, 0, SHOP_H + 0.75, -d / 2 - 0.08, sw, sw * (96 / 512), col / SIGN_COLS, row / SIGN_ROWS, (col + 1) / SIGN_COLS, (row + 1) / SIGN_ROWS);
      }
      const floors = 2 + Math.floor(rng() * 4);
      const style: FacadeStyle = rng() < 0.55 ? 'apartment' : 'brick';
      facadeBox(batches[style], x, y, z, w, floors * FLOOR, d, yaw, pick(TINTS[style]));
      y += floors * FLOOR;
      frameBox(roofs, frame, 0, y + 0.25, -d / 2 - 0.2, w + 0.3, 0.5, 0.5, pick(roofGrey));
      roofTop(frame, w, d, y, false);
      return;
    }
    if (kind === 'mid') {
      const style: FacadeStyle = pick(['office', 'apartment', 'apartment', 'brick', 'glass']);
      const h = (6 + Math.floor(rng() * 10)) * FLOOR;
      facadeBox(batches[style], x, 0, z, w, h, d, yaw, pick(TINTS[style]));
      if (rng() < 0.4) {
        const h2 = (2 + Math.floor(rng() * 4)) * FLOOR;
        facadeBox(batches[style], x, h, z + 0, w * 0.7, h2, d * 0.7, yaw, pick(TINTS[style]));
        roofTop(frame, w * 0.7, d * 0.7, h + h2, true);
      } else roofTop(frame, w, d, h, h > 30);
      return;
    }
    // Tower: 2–3 setback tiers, glass or office, rooftop billboard or crown.
    const style: FacadeStyle = rng() < 0.65 ? 'glass' : 'office';
    const tint = pick(TINTS[style]);
    let tw = w;
    let td = d;
    const tiers = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < tiers; k++) {
      const h = (k === 0 ? 10 + Math.floor(rng() * 14) : 4 + Math.floor(rng() * 8)) * FLOOR;
      facadeBox(batches[style], x, y, z, tw, h, td, yaw, tint);
      y += h;
      frameBox(roofs, frame, 0, y + 0.3, 0, tw + 0.6, 0.6, td + 0.6, pick(roofGrey));
      tw *= 0.78;
      td *= 0.78;
    }
    if (rng() < 0.45) {
      const ad = Math.floor(rng() * AD_COUNT);
      const bw = Math.min(16, w * 0.9);
      const bh = bw / 2;
      frameBox(details, frame, -bw * 0.3, y + 1.2, 0, 0.4, 2.4, 0.4, unitGrey);
      frameBox(details, frame, bw * 0.3, y + 1.2, 0, 0.4, 2.4, 0.4, unitGrey);
      const col = ad % 2;
      const row = Math.floor(ad / 2);
      frameQuad(ads, frame, 0, y + 2.4 + bh / 2, -0.3, bw, bh, col / 2, row / 3, (col + 1) / 2, (row + 1) / 3);
    } else roofTop(frame, tw, td, y, true);
  };

  /* ---- 1. Street wall along the circuit, with side streets ---- */
  const sideStreets: { s: number; side: number }[] = [];
  for (const side of [-1, 1] as const) {
    let s = 4 + rng() * 10;
    let sinceStreet = 0;
    while (s < path.length - 6) {
      if (o.skipRoadside(s)) {
        s += 8;
        continue;
      }
      // Side street every 80–130 m of frontage.
      if (sinceStreet > 80 + rng() * 50) {
        sideStreets.push({ s: s + 6, side });
        s += 13;
        sinceStreet = 0;
        continue;
      }
      const w = 11 + rng() * 13;
      const sm = path.sampleAt(s + w / 2);
      const setback = o.setbackAt(s + w / 2) + 6;
      const out = { x: sm.rx * side, z: sm.rz * side };
      const yaw = Math.atan2(out.x, out.z);
      // Row 1: shops with apartments above, facing the circuit.
      const d1 = 12 + rng() * 6;
      const p1 = { x: sm.x + out.x * (setback + d1 / 2), z: sm.z + out.z * (setback + d1 / 2) };
      const r1 = Math.hypot(w, d1) / 2;
      if (free(p1.x, p1.z, r1 * 0.75)) {
        building(p1.x, p1.z, yaw, w - 0.6, d1, rng() < 0.82 ? 'shop' : 'mid', true);
        occupied.push({ x: p1.x, z: p1.z, r: r1 * 0.75 });
      }
      // Row 2: taller mid-rises / towers behind, across a service alley.
      const d2 = 14 + rng() * 10;
      const off2 = setback + d1 + 5 + d2 / 2;
      const p2 = { x: sm.x + out.x * off2, z: sm.z + out.z * off2 };
      const r2 = Math.hypot(w, d2) / 2;
      if (free(p2.x, p2.z, r2 * 0.75)) {
        building(p2.x, p2.z, yaw, w, d2, rng() < 0.3 * o.density + 0.1 ? 'tower' : 'mid', false);
        occupied.push({ x: p2.x, z: p2.z, r: r2 * 0.75 });
      }
      s += w + 0.8;
      sinceStreet += w;
    }
  }

  /* ---- 2. Side streets: asphalt with centre dashes, zebra crossing, corner traffic lights ---- */
  const streetMat = new StandardMaterial('sideStreetMat', scene);
  streetMat.diffuseTexture = make(scene, 'sideStreetTex', 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#41454d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 40 + Math.random() * 60;
      ctx.fillStyle = `rgba(${v},${v},${v + 6},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w - 6, 0, 6, h);
  });
  streetMat.specularColor = new Color3(0.1, 0.1, 0.1);
  const zebra = new GeometryBatch();
  const poles = new GeometryBatch();
  for (const st of sideStreets) {
    const sm = path.sampleAt(st.s);
    const start = o.setbackAt(st.s) + 0.5;
    const width = 10;
    const out = { x: sm.rx * st.side, z: sm.rz * st.side };
    const along = { x: sm.tx, z: sm.tz };
    const P = (l: number, a: number) => ({ x: sm.x + out.x * l + along.x * a, z: sm.z + out.z * l + along.z * a });
    // Stop the street before it reaches another part of the circuit (or a landmark).
    let len = 8;
    while (len < 90) {
      const p = P(start + len + 4, 0);
      if (!o.clearOf(p.x, p.z, width / 2 + 1)) break;
      len += 4;
    }
    if (len < 24) continue;
    const q = [P(start, -width / 2), P(start, width / 2), P(start + len, width / 2), P(start + len, -width / 2)];
    const vs = q.map((p, i) => streets.vertex(p.x, 0.02, p.z, i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : len / 10));
    streets.indices.push(vs[0], vs[1], vs[2], vs[0], vs[2], vs[3], vs[0], vs[2], vs[1], vs[0], vs[3], vs[2]);
    for (let k = 0; k < 6; k++) {
      const a = -width / 2 + 0.8 + k * 1.65;
      const z0 = P(start + 2, a);
      const z1 = P(start + 5, a);
      const m = Matrix.RotationY(Math.atan2(out.x, out.z)).multiply(Matrix.Translation((z0.x + z1.x) / 2, 0.035, (z0.z + z1.z) / 2));
      zebra.orientedBox(m, 0.8, 0.02, 3, C('#f2f2f2'));
    }
    for (let l = start + 4; l < start + len; l += 8) occupied.push({ ...P(l, 0), r: 7 });
    // Traffic light at the corner + parked cars along the street.
    const corner = P(start + 1.5, width / 2 + 1.2);
    const tf = Matrix.RotationY(Math.atan2(out.x, out.z) + Math.PI).multiply(Matrix.Translation(corner.x, 0, corner.z));
    frameBox(poles, tf, 0, 2.6, 0, 0.18, 5.2, 0.18, C('#2b3038'));
    frameBox(poles, tf, 0, 4.6, 0.25, 0.45, 1.3, 0.4, C('#15171c'));
    for (let l = start + 12; l < start + len - 8; l += 7 + rng() * 6) {
      if (rng() < 0.45) continue;
      const side2 = rng() < 0.5 ? -1 : 1;
      const p = P(l, side2 * (width / 2 - 1.4));
      const f = Matrix.RotationY(Math.atan2(out.x, out.z) + (rng() < 0.5 ? 0 : Math.PI)).multiply(Matrix.Translation(p.x, 0, p.z));
      const body = pick(['#e3262f', '#1f6bff', '#ffc61a', '#eef1f6', '#2ecc40', '#1b1d24', '#8a3dff', '#ff7a1a'].map(C));
      frameBox(details, f, 0, 0.6, 0, 1.8, 0.6, 4.1, body);
      frameBox(details, f, 0, 1.1, -0.25, 1.55, 0.5, 2.1, body);
      frameBox(details, f, 0, 1.12, -0.25, 1.6, 0.34, 1.9, C('#22344f'));
    }
  }

  /* ---- 3. Back-fill blocks and towers inside / around the circuit ---- */
  const cell = 34;
  const margin = 260;
  for (let x = cx - span - margin; x <= cx + span + margin; x += cell) {
    for (let z = cz - span - margin; z <= cz + span + margin; z += cell) {
      if (rng() > 0.7 * o.density + 0.15) continue;
      const w = 14 + rng() * 14;
      const d = 14 + rng() * 14;
      const px = x + (rng() - 0.5) * 8;
      const pz = z + (rng() - 0.5) * 8;
      const r = Math.hypot(w, d) / 2;
      if (!free(px, pz, r * 0.8)) continue;
      const p = path.project(px, pz);
      const dist = Math.abs(p.lateral);
      if (dist < 40) continue;
      const yaw = Math.atan2(path.txs[p.index], path.tzs[p.index]) + (rng() < 0.5 ? 0 : Math.PI / 2);
      building(px, pz, yaw, w, d, dist > 90 && rng() < 0.55 ? 'tower' : 'mid', false);
      occupied.push({ x: px, z: pz, r: r * 0.8 });
    }
  }

  /* ---- 4. Distant skyline ring (cheap boxes, same lit-window materials) ---- */
  const ringR = span + margin + 140;
  const towers = Math.round(70 + 60 * o.density);
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + rng() * 0.05;
    const r = ringR + rng() * 260;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const w = 22 + rng() * 26;
    const h = 50 + rng() * 170;
    const style: FacadeStyle = rng() < 0.6 ? 'glass' : 'office';
    facadeBox(batches[style], x, 0, z, w, h, w * (0.7 + rng() * 0.6), -a + Math.PI / 2, pick(TINTS[style]));
    if (rng() < 0.4) beacons.push(new Vector3(x, h + 6, z));
  }

  /* ---- 5. Street furniture on the sidewalks (thin instances) ---- */
  const tree = new GeometryBatch();
  tree.orientedBox(Matrix.Translation(0, 1.4, 0), 0.25, 2.8, 0.25, C('#6b4a2b'));
  tree.orientedBox(Matrix.Translation(0, 0.2, 0), 1.4, 0.4, 1.4, C('#9aa2ad'));
  const treeMesh = tree.build('cityTreeTrunk', scene, new StandardMaterial('cityTreeTrunkMat', scene), true);
  treeMesh.unfreezeWorldMatrix();
  const canopy = CreateIcoSphere('cityTreeCanopy', { radius: 1.9, subdivisions: 1, flat: true }, scene);
  canopy.bakeTransformIntoVertices(Matrix.Scaling(1, 0.85, 1).multiply(Matrix.Translation(0, 3.9, 0)));
  const canopyMat = new StandardMaterial('cityCanopyMat', scene);
  canopyMat.diffuseColor = C('#3f9e4a');
  canopyMat.specularColor = Color3.Black();
  canopy.material = canopyMat;
  const furniture = new GeometryBatch();
  // Bench, bin, hydrant packed in one prop (offset along the sidewalk).
  furniture.orientedBox(Matrix.Translation(2.2, 0.45, 0), 0.5, 0.08, 1.8, C('#7a4f2a'));
  furniture.orientedBox(Matrix.Translation(2.45, 0.75, 0), 0.08, 0.5, 1.8, C('#7a4f2a'));
  furniture.orientedBox(Matrix.Translation(2.2, 0.22, -0.8), 0.45, 0.44, 0.1, C('#2b3038'));
  furniture.orientedBox(Matrix.Translation(2.2, 0.22, 0.8), 0.45, 0.44, 0.1, C('#2b3038'));
  furniture.orientedBox(Matrix.Translation(2.3, 0.5, 2.0), 0.5, 1.0, 0.5, C('#2e7d4f'));
  furniture.orientedBox(Matrix.Translation(2.2, 0.4, -2.2), 0.3, 0.8, 0.3, C('#e23b3b'));
  const furnMesh = furniture.build('cityFurniture', scene, new StandardMaterial('cityFurnitureMat', scene), true);
  furnMesh.unfreezeWorldMatrix();
  const tm: number[] = [];
  const fm: number[] = [];
  for (const side of [-1, 1]) {
    for (let s = 6; s < path.length; s += 16 / Math.max(0.4, o.density)) {
      if (o.skipRoadside(s)) continue;
      const smp = path.sampleAt(s);
      const lat = (o.setbackAt(s) + 3) * side;
      const x = smp.x + smp.rx * lat;
      const z = smp.z + smp.rz * lat;
      if (!o.clearOf(x, z, 0.2)) continue;
      if (sideStreets.some((st) => st.side === side && Math.abs(st.s - s) < 9)) continue;
      const q = Quaternion.FromEulerAngles(0, smp.heading + (side > 0 ? 0 : Math.PI), 0);
      const sc = 0.85 + rng() * 0.35;
      Matrix.Compose(new Vector3(sc, sc, sc), q, new Vector3(x, 0, z)).copyToArray(tm, tm.length);
      if (rng() < 0.4) Matrix.Compose(Vector3.One(), q, new Vector3(x, 0, z)).copyToArray(fm, fm.length);
    }
  }
  if (tm.length) {
    const buf = new Float32Array(tm);
    treeMesh.thinInstanceSetBuffer('matrix', buf, 16, true);
    canopy.thinInstanceSetBuffer('matrix', buf.slice(), 16, true);
  } else {
    treeMesh.setEnabled(false);
    canopy.setEnabled(false);
  }
  if (fm.length) furnMesh.thinInstanceSetBuffer('matrix', new Float32Array(fm), 16, true);
  else furnMesh.setEnabled(false);

  /* ---- 6. Materials & meshes ---- */
  const facadeMats: StandardMaterial[] = [];
  for (const style of Object.keys(batches) as FacadeStyle[]) {
    const b = batches[style];
    if (!b.indices.length) continue;
    const t = facadeTextures(scene, style);
    const m = new StandardMaterial(`city-${style}`, scene);
    m.diffuseTexture = t.diffuse;
    m.emissiveTexture = t.emissive;
    m.specularColor = style === 'glass' ? new Color3(0.6, 0.65, 0.7) : new Color3(0.06, 0.06, 0.07);
    m.specularPower = style === 'glass' ? 96 : 16;
    facadeMats.push(m);
    b.build(`city-${style}`, scene, m, true);
  }
  const roofMat = new StandardMaterial('cityRoofMat', scene);
  roofMat.specularColor = Color3.Black();
  roofs.build('cityRoofs', scene, roofMat, true);
  const detailMat = new StandardMaterial('cityDetailMat', scene);
  detailMat.specularColor = new Color3(0.15, 0.15, 0.15);
  if (details.indices.length) details.build('cityDetails', scene, detailMat, true);
  if (poles.indices.length) poles.build('cityPoles', scene, detailMat, true);
  const zebraMat = new StandardMaterial('zebraMat', scene);
  zebraMat.specularColor = Color3.Black();
  if (zebra.indices.length) zebra.build('cityZebra', scene, zebraMat, true);
  if (streets.indices.length) streets.build('sideStreets', scene, streetMat, false);

  const signMat = new StandardMaterial('citySignsMat', scene);
  signMat.disableLighting = true;
  signMat.emissiveTexture = signAtlas(scene);
  signMat.backFaceCulling = false;
  if (signs.indices.length) signs.build('citySigns', scene, signMat, false);
  const adMat = new StandardMaterial('cityAdsMat', scene);
  adMat.disableLighting = true;
  adMat.emissiveTexture = adAtlas(scene);
  adMat.backFaceCulling = false;
  if (ads.indices.length) ads.build('cityAds', scene, adMat, false);

  // Aircraft-warning beacons on antennas and skyline towers (blink at night).
  const beaconMat = new StandardMaterial('beaconMat', scene);
  beaconMat.disableLighting = true;
  beaconMat.emissiveColor = C('#ff2a2a');
  const beacon = CreateIcoSphere('beacon', { radius: 0.6, subdivisions: 1 }, scene);
  beacon.material = beaconMat;
  if (beacons.length) {
    const bm: number[] = [];
    for (const p of beacons) Matrix.Translation(p.x, p.y, p.z).copyToArray(bm, bm.length);
    beacon.thinInstanceSetBuffer('matrix', new Float32Array(bm), 16, true);
  } else beacon.setEnabled(false);

  // Night: lit windows, glowing signs; day: windows dark, signs dimmer.
  const windowGlow = o.night ? new Color3(0.85, 0.85, 0.85) : new Color3(0, 0, 0);
  for (const m of facadeMats) m.emissiveColor = windowGlow;
  signMat.emissiveColor = o.night ? new Color3(1.4, 1.4, 1.4) : new Color3(0.85, 0.85, 0.85);
  adMat.emissiveColor = o.night ? new Color3(1.1, 1.1, 1.1) : new Color3(0.95, 0.95, 0.95);
  if (o.night) {
    signMat.alphaMode = Constants.ALPHA_DISABLE;
    canopyMat.diffuseColor = C('#2e7a38');
    canopyMat.emissiveColor = C('#0c2410');
  }

  for (const m of scene.meshes) if (m.name.startsWith('city') || m.name === 'sideStreets' || m.name === 'beacon') m.isPickable = false;
  void Mesh;

  return {
    update(_dt, t) {
      if (!o.night) return;
      const on = Math.sin(t * 3) > 0.2;
      beaconMat.emissiveColor = on ? C('#ff2a2a') : C('#3a0606');
    },
  };
};
