import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { createRng, type TrackPath } from '@race-rush/shared';
import { extrudeAlongTrack, GeometryBatch } from './geometry';
import { buildLandmarks, planLandmarks } from './landmarks';
import { buildRoadDetails } from './roadDetails';
import { buildCity } from './city/CityBuilder';
import { lightPoolTexture, nightSkyTexture } from './city/cityTextures';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  bannerTexture,
  barrierTexture,
  checkerTexture,
  chevronTexture,
  crownBannerTexture,
  curbTexture,
  groundTexture,
  rampTexture,
  roadBumpTexture,
  roadSignTexture,
  roadTexture,
  skyTexture,
  startSignTexture,
} from './textures';

const BARRIER_H = 1.1;
const BARRIER_T = 0.5;

export interface BuiltTrack {
  /** Animated environment hooks (called every frame). */
  update(dt: number, time: number): void;
  /** Start lights (3) — emissive materials toggled by the countdown. */
  startLights: StandardMaterial[];
  shadowReceivers: Mesh[];
  dispose(): void;
}

const hex = (h: string) => Color3.FromHexString(h);

const mat = (scene: Scene, name: string, color: Color3 | string, opts: { emissive?: Color3 | string; spec?: number; vertexColors?: boolean; unlit?: boolean } = {}) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = typeof color === 'string' ? hex(color) : color;
  m.specularColor = new Color3(opts.spec ?? 0.05, opts.spec ?? 0.05, opts.spec ?? 0.05);
  if (opts.emissive) m.emissiveColor = typeof opts.emissive === 'string' ? hex(opts.emissive) : opts.emissive;
  if (opts.unlit) m.disableLighting = true;
  return m;
};

/** Embankment width at a given elevation (gives elevated sections a believable slope). */
const embankment = (h: number) => 2 + Math.max(0, h) * 1.8;

/**
 * Builds the renderable track + environment from a TrackPath. Everything is procedural so the
 * same code serves City and Desert (TrackDefinition-driven).
 */
export const buildTrack = (scene: Scene, path: TrackPath, decorDensity: number, opts: { night?: boolean } = {}): BuiltTrack => {
  const def = path.def;
  const desert = def.theme === 'desert';
  const night = !!opts.night && !desert;
  const pal = def.palette;
  const disposables: { dispose(): void }[] = [];
  const animated: ((dt: number, t: number) => void)[] = [];
  const shadowReceivers: Mesh[] = [];

  // ---------- Sky & ground ----------
  const sky = CreateSphere('sky', { diameter: 1800, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = mat(scene, 'skyMat', '#000000', { unlit: true });
  skyMat.emissiveTexture = night ? nightSkyTexture(scene) : skyTexture(scene, pal.sky, pal.horizon, desert);
  skyMat.fogEnabled = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < path.count; i++) {
    minX = Math.min(minX, path.xs[i]);
    maxX = Math.max(maxX, path.xs[i]);
    minZ = Math.min(minZ, path.zs[i]);
    maxZ = Math.max(maxZ, path.zs[i]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const groundSize = Math.max(maxX - minX, maxZ - minZ) + 1400;
  const ground = CreateGround('ground', { width: groundSize, height: groundSize, subdivisions: 1 }, scene);
  ground.position.set(cx, -0.06, cz);
  const groundMat = mat(scene, 'groundMat', '#ffffff');
  const gTex = groundTexture(scene, pal.ground, desert);
  gTex.uScale = gTex.vScale = groundSize / (desert ? 30 : 24);
  groundMat.diffuseTexture = gTex;
  ground.material = groundMat;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  shadowReceivers.push(ground);

  // ---------- Road ----------
  const road = new GeometryBatch();
  extrudeAlongTrack(road, path, {
    offsets: (s) => {
      const w = path.widthAt(s) / 2;
      return [-w, w];
    },
    heights: () => [0.02, 0.02],
    us: [0, 1],
    vLength: 36,
  });
  const roadMat = mat(scene, 'roadMat', '#ffffff', { spec: desert ? 0.02 : night ? 0.35 : 0.14 });
  roadMat.diffuseTexture = roadTexture(scene, pal.road, desert);
  roadMat.specularPower = night ? 48 : 24;
  if (decorDensity >= 0.8) {
    const bump = roadBumpTexture(scene);
    (bump as Texture).uScale = 6;
    (bump as Texture).vScale = 40;
    roadMat.bumpTexture = bump;
    roadMat.bumpTexture.level = 0.35;
  }
  const roadMesh = road.build('road', scene, roadMat, false);
  shadowReceivers.push(roadMesh);

  // Curbs (city) / sand berms (desert).
  const curbs = new GeometryBatch();
  for (const side of [-1, 1]) {
    extrudeAlongTrack(curbs, path, {
      offsets: (s) => {
        const w = path.widthAt(s) / 2;
        return side < 0 ? [-w - 1, -w] : [w, w + 1];
      },
      heights: () => [0.07, 0.07],
      us: [0, 1],
      vLength: 4,
    });
  }
  const curbMat = mat(scene, 'curbMat', '#ffffff');
  if (!desert) curbMat.diffuseTexture = curbTexture(scene);
  else curbMat.diffuseColor = hex('#c58a4e');
  curbs.build('curbs', scene, curbMat, false);

  // Shoulders (sidewalk / packed sand).
  const shoulder = new GeometryBatch();
  for (const side of [-1, 1]) {
    extrudeAlongTrack(shoulder, path, {
      offsets: (s) => {
        const w = path.widthAt(s) / 2 + 1;
        const b = path.barrierOffset(s);
        return side < 0 ? [-b, -w] : [w, b];
      },
      heights: () => [0.05, 0.05],
      us: [0, 1],
      vLength: 6,
    });
  }
  shoulder.build('shoulder', scene, mat(scene, 'shoulderMat', pal.shoulder), false);

  // Barriers: inner face, top, outer face — separate strips for crisp flat shading.
  const barriers = new GeometryBatch();
  for (const side of [-1, 1]) {
    const inner = (s: number) => path.barrierOffset(s) * side;
    const outer = (s: number) => (path.barrierOffset(s) + BARRIER_T) * side;
    const faces: [(s: number) => number[], number[]][] =
      side > 0
        ? [
            [(s) => [inner(s), inner(s)], [0, BARRIER_H]],
            [(s) => [inner(s), outer(s)], [BARRIER_H, BARRIER_H]],
            [(s) => [outer(s), outer(s)], [BARRIER_H, -0.4]],
          ]
        : [
            [(s) => [outer(s), outer(s)], [-0.4, BARRIER_H]],
            [(s) => [outer(s), inner(s)], [BARRIER_H, BARRIER_H]],
            [(s) => [inner(s), inner(s)], [BARRIER_H, 0]],
          ];
    for (const [offsets, h] of faces) {
      extrudeAlongTrack(barriers, path, { offsets, heights: () => h, us: [0, 1], vLength: 8 });
    }
  }
  const barrierMat = mat(scene, 'barrierMat', '#ffffff', { emissive: '#1a1a1a' });
  barrierMat.diffuseTexture = barrierTexture(scene, pal.barrierA, pal.barrierB);
  barriers.build('barriers', scene, barrierMat, false);

  // Embankments for elevated sections.
  const emb = new GeometryBatch();
  for (const side of [-1, 1]) {
    extrudeAlongTrack(emb, path, {
      offsets: (s) => {
        const o = path.barrierOffset(s) + BARRIER_T;
        const far = o + embankment(path.baseHeight(s));
        return side < 0 ? [-far, -o] : [o, far];
      },
      heights: (s) => {
        const h = path.baseHeight(s);
        return side < 0 ? [-h - 0.05, -0.4] : [-0.4, -h - 0.05];
      },
      us: [0, 1],
      vLength: 10,
    });
  }
  emb.build('embankment', scene, mat(scene, 'embMat', desert ? '#c08a50' : '#3a4256'), false);

  // ---------- Ramps ----------
  const rampMat = mat(scene, 'rampMat', '#ffffff', { emissive: '#2a2000' });
  rampMat.diffuseTexture = rampTexture(scene);
  for (const r of path.rampSpans()) {
    const rb = new GeometryBatch();
    const w = (s: number) => path.widthAt(s) / 2;
    extrudeAlongTrack(rb, path, {
      from: r.start,
      to: r.lip,
      includeRamps: true,
      offsets: (s) => [-w(s), w(s)],
      heights: () => [0.04, 0.04],
      us: [0, 4],
      vLength: 6,
    });
    // Vertical lip face.
    const lip = path.sampleAt(r.lip - 0.05);
    const by = path.baseHeight(r.lip);
    const half = lip.width / 2;
    const a = rb.vertex(lip.x - lip.rx * half, by + r.height, lip.z - lip.rz * half, 0, 0);
    const b = rb.vertex(lip.x + lip.rx * half, by + r.height, lip.z + lip.rz * half, 4, 0);
    const c = rb.vertex(lip.x + lip.rx * half, by, lip.z + lip.rz * half, 4, 0.3);
    const d = rb.vertex(lip.x - lip.rx * half, by, lip.z - lip.rz * half, 0, 0.3);
    rb.indices.push(a, b, c, a, c, d);
    rb.build('ramp', scene, rampMat, false);
  }

  // ---------- Start / finish ----------
  const checkerMat = mat(scene, 'checkerMat', '#ffffff');
  checkerMat.diffuseTexture = checkerTexture(scene);
  const line = new GeometryBatch();
  extrudeAlongTrack(line, path, {
    from: path.length - 1.5,
    to: 1.5,
    offsets: (s) => [-path.widthAt(s) / 2, path.widthAt(s) / 2],
    heights: () => [0.04, 0.04],
    us: [0, path.def.roadWidth / 3],
    vLength: 3,
  });
  line.build('finishLine', scene, checkerMat, false);

  // Start/finish gantry over the checkered line, traffic light facing the grid (start reference).
  const startLights: StandardMaterial[] = [];
  {
    const smp = path.sampleAt(0);
    const off = path.barrierOffset(0) + 0.9;
    const y0 = path.baseHeight(0);
    const frameMat = mat(scene, 'gantryFrame', desert ? '#7a4a24' : '#2b3038', { spec: 0.25 });
    for (const side of [-1, 1]) {
      const p = CreateBox('gantryLeg', { width: 1, height: 9, depth: 1 }, scene);
      p.position.set(smp.x + smp.rx * off * side, y0 + 4.5, smp.z + smp.rz * off * side);
      p.material = frameMat;
      p.freezeWorldMatrix();
    }
    const beam = CreateBox('gantryBeam', { width: off * 2 + 1, height: 2.6, depth: 0.8 }, scene);
    beam.position.set(smp.x, y0 + 8.2, smp.z);
    beam.rotation.y = smp.heading;
    beam.material = frameMat;
    const signMat = mat(scene, 'startSignMat', '#000000', { unlit: true });
    signMat.emissiveTexture = startSignTexture(scene);
    for (const face of [-1, 1]) {
      const banner = CreatePlane('startSign', { width: off * 2 - 0.6, height: 2.3 }, scene);
      banner.parent = beam;
      banner.position.z = 0.41 * face;
      banner.rotation.y = face > 0 ? Math.PI : 0;
      banner.material = signMat;
    }
    // Traffic light housing under the sign, lamps facing the cars on the grid (behind the line).
    const housing = CreateBox('trafficLight', { width: 4.6, height: 1.5, depth: 0.7 }, scene);
    housing.parent = beam;
    housing.position.set(0, -2.05, -0.1);
    housing.material = mat(scene, 'trafficMat', '#111318', { spec: 0.4 });
    for (let i = 0; i < 3; i++) {
      const lm = mat(scene, `startLight${i}`, '#220000', { emissive: '#2a0000' });
      const lamp = CreateCylinder(`startLamp${i}`, { diameter: 1.05, height: 0.3, tessellation: 18 }, scene);
      lamp.parent = housing;
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set((i - 1) * 1.45, 0, -0.38);
      lamp.material = lm;
      startLights.push(lm);
    }
  }

  // Checkpoint light strips (subtle feedback when crossing).
  const cpMat = mat(scene, 'cpMat', '#000000', { emissive: desert ? '#ff8a3d' : '#1fb7ff', unlit: true });
  cpMat.alpha = 0.55;
  const cpBatch = new GeometryBatch();
  for (let i = 1; i < def.checkpoints; i++) {
    const s = path.checkpointS(i);
    extrudeAlongTrack(cpBatch, path, {
      from: s - 0.4,
      to: s + 0.4,
      includeRamps: true,
      offsets: (ss) => [-path.widthAt(ss) / 2, path.widthAt(ss) / 2],
      heights: () => [0.05, 0.05],
      us: [0, 1],
      vLength: 1,
    });
  }
  cpBatch.build('checkpoints', scene, cpMat, false);

  // ---------- Decor ----------
  const rng = createRng(def.decorSeed);
  const plan = planLandmarks(path);
  const clearOf = (x: number, z: number, radius: number): boolean => {
    const p = path.project(x, z);
    const h = path.baseHeight(p.s);
    const lat = Math.abs(p.lateral);
    if (lat <= path.barrierOffset(p.s) + BARRIER_T + embankment(h) + radius + 1.5) return false;
    // Keep tunnel mountains / bridges / overpass clear of generic decor.
    if (plan.skipRoadside(p.s) && lat < path.barrierOffset(p.s) + 22 + radius) return false;
    return !plan.blocked(x, z, radius);
  };

  // Lamps / torches along the barriers.
  const lampMatrices: number[] = [];
  const lampSpacing = desert ? 46 : 30;
  for (let s = 5; s < path.length; s += lampSpacing / Math.max(0.5, decorDensity)) {
    if (plan.skipRoadside(s)) continue;
    for (const side of [-1, 1]) {
      if (desert && side > 0) continue;
      const smp = path.sampleAt(s);
      const off = (path.barrierOffset(s) + 1.4) * side;
      const y = path.baseHeight(s);
      const yaw = smp.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      Matrix.Compose(new Vector3(1, 1, 1), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(smp.x + smp.rx * off, y, smp.z + smp.rz * off)).copyToArray(
        lampMatrices,
        lampMatrices.length,
      );
    }
  }
  const pole = new GeometryBatch();
  pole.box(0, 4.5, 0, 0.3, 9, 0.3, 0, null);
  pole.box(0, 8.9, 1.6, 0.25, 0.25, 3.4, 0, null);
  const poleMesh = pole.build('lampPole', scene, mat(scene, 'poleMat', desert ? '#5b3b22' : '#c3c8d0', { spec: 0.3 }), false);
  poleMesh.unfreezeWorldMatrix();
  const head = CreateBox('lampHead', { width: 0.7, height: 0.2, depth: 1.2 }, scene);
  head.bakeTransformIntoVertices(Matrix.Translation(0, 8.75, 3.1));
  head.material = mat(scene, 'lampHeadMat', '#e9eef5', { emissive: night ? '#ffe2a8' : '#3a3f48' });
  head.isPickable = false;
  const lampBuf = new Float32Array(lampMatrices);
  poleMesh.thinInstanceSetBuffer('matrix', lampBuf, 16, true);
  head.thinInstanceSetBuffer('matrix', lampBuf.slice(), 16, true);
  if (night && lampMatrices.length) {
    // Warm light pools on the road under every lamp (additive decals instead of dynamic lights).
    const pool = CreateGround('lightPool', { width: 16, height: 16 }, scene);
    pool.bakeTransformIntoVertices(Matrix.Translation(0, 0.09, 4.2));
    const pm = new StandardMaterial('lightPoolMat', scene);
    pm.disableLighting = true;
    const pt = lightPoolTexture(scene);
    pm.emissiveTexture = pt;
    pm.opacityTexture = pt;
    pm.alphaMode = Constants.ALPHA_ADD;
    pm.fogEnabled = true;
    pool.material = pm;
    pool.isPickable = false;
    pool.thinInstanceSetBuffer('matrix', lampBuf.slice(), 16, true);
  }

  // Chevron boards on the outside of tight corners.
  const chevMat = mat(scene, 'chevMat', '#000000', { emissive: '#ffffff', unlit: true });
  chevMat.emissiveTexture = chevronTexture(scene);
  const chevMatrices: number[] = [];
  for (let s = 0; s < path.length; s += 9) {
    const smp = path.sampleAt(s);
    if (Math.abs(smp.curvature) < 1 / 48) continue;
    const outside = smp.curvature > 0 ? -1 : 1;
    const off = (path.barrierOffset(s) + BARRIER_T * 0.5) * outside;
    const yaw = smp.heading + (outside > 0 ? -Math.PI / 2 : Math.PI / 2);
    const flip = smp.curvature > 0 ? 1 : -1;
    Matrix.Compose(
      new Vector3(flip, 1, 1),
      Quaternion.FromEulerAngles(0, yaw, 0),
      new Vector3(smp.x + smp.rx * off, path.baseHeight(s) + BARRIER_H + 0.6, smp.z + smp.rz * off),
    ).copyToArray(chevMatrices, chevMatrices.length);
  }
  if (chevMatrices.length) {
    const chev = CreatePlane('chevron', { width: 2.4, height: 1.2, sideOrientation: Mesh.DOUBLESIDE }, scene);
    chev.material = chevMat;
    chev.isPickable = false;
    chev.thinInstanceSetBuffer('matrix', new Float32Array(chevMatrices), 16, true);
  }

  buildBannersAndSigns(scene, path, desert, plan.skipRoadside);
  if (!desert) buildPalms(scene, path, rng, clearOf, decorDensity);
  if (desert) buildDesertDecor(scene, path, rng, clearOf, decorDensity, minX, maxX, minZ, maxZ, animated);
  else {
    const city = buildCity(scene, path, {
      night,
      density: decorDensity,
      clearOf,
      setbackAt: (s) => path.barrierOffset(s) + BARRIER_T + embankment(path.baseHeight(s)),
      skipRoadside: plan.skipRoadside,
      rng,
    });
    animated.push((dt, t) => city.update(dt, t));
  }

  // Billboards near the track.
  const boards = desert ? ['DUNE CANYON', 'RACE RUSH', 'v-MRU'] : ['RACE RUSH', 'BOOST!', 'v-MRU', 'PALM CITY'];
  let bi = 0;
  for (let s = 140; s < path.length - 60; s += 230) {
    if (plan.skipRoadside(s)) continue;
    const smp = path.sampleAt(s);
    const side = bi % 2 ? 1 : -1;
    const off = (path.barrierOffset(s) + embankment(path.baseHeight(s)) + 5) * side;
    const x = smp.x + smp.rx * off;
    const z = smp.z + smp.rz * off;
    if (!clearOf(x, z, 3)) continue;
    const text = boards[bi++ % boards.length];
    const bm = mat(scene, `boardMat-${bi}`, '#000000', { unlit: true });
    bm.emissiveTexture = desert ? bannerTexture(scene, text, '#7a2e12', '#ffe0a6', undefined, '#c2532a') : bannerTexture(scene, text, '#b0145f', '#ffffff', undefined, '#ff4fa3');
    const yaw = smp.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (side > 0 ? -0.5 : 0.5);
    // Two single-sided faces so the text reads correctly from both directions.
    for (const flip of [0, Math.PI]) {
      const board = CreatePlane(`board-${bi}`, { width: 14, height: 3.5 }, scene);
      board.position.set(x, 9, z);
      board.rotation.y = yaw + flip;
      board.material = bm;
      board.freezeWorldMatrix();
    }
    const legs = CreateBox(`boardLeg-${bi}`, { width: 0.5, height: 8, depth: 0.5 }, scene);
    legs.position.set(x, 4, z);
    legs.material = poleMesh.material;
    legs.freezeWorldMatrix();
  }

  buildLandmarks(scene, path, decorDensity, animated);
  buildRoadDetails(scene, path, (ss) => path.barrierOffset(ss), plan.skipRoadside, desert);

  for (const m of scene.meshes) m.isPickable = false;

  return {
    startLights,
    shadowReceivers,
    update(dt, t) {
      for (const a of animated) a(dt, t);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
};

type ClearFn = (x: number, z: number, r: number) => boolean;

/** Pink crown banners on poles + green overhead "RACE RUSH" signs (city) along the circuit. */
const buildBannersAndSigns = (scene: Scene, path: TrackPath, desert: boolean, skip: (s: number) => boolean) => {
  const bannerMat = new StandardMaterial('crownBannerMat', scene);
  bannerMat.diffuseTexture = crownBannerTexture(scene);
  bannerMat.emissiveColor = new Color3(0.45, 0.45, 0.45);
  bannerMat.specularColor = Color3.Black();
  bannerMat.backFaceCulling = false;
  const poleM: number[] = [];
  const flagM: number[] = [];
  const place = (s: number, side: number) => {
    if (skip(s)) return;
    const smp = path.sampleAt(s);
    const off = (path.barrierOffset(s) + 1.1) * side;
    const y = path.baseHeight(s);
    const x = smp.x + smp.rx * off;
    const z = smp.z + smp.rz * off;
    Matrix.Translation(x, y, z).copyToArray(poleM, poleM.length);
    // Banner faces the road (plane normal along the track's right vector).
    Matrix.Compose(new Vector3(1, 1, 1), Quaternion.FromEulerAngles(0, smp.heading + Math.PI / 2, 0), new Vector3(x, y + 5.2, z)).copyToArray(flagM, flagM.length);
  };
  // Dense around the start, sparser elsewhere.
  for (let s = -70; s <= 70; s += 14) for (const side of [-1, 1]) place(path.wrap(s), side);
  for (let s = 140; s < path.length - 120; s += desert ? 160 : 85) place(s, Math.floor(s / 85) % 2 ? 1 : -1);
  const pole = CreateCylinder('bannerPole', { height: 7.4, diameter: 0.18, tessellation: 6 }, scene);
  pole.bakeTransformIntoVertices(Matrix.Translation(0, 3.7, 0));
  const pm = new StandardMaterial('bannerPoleMat', scene);
  pm.diffuseColor = Color3.FromHexString(desert ? '#6b4423' : '#cfd4dc');
  pole.material = pm;
  pole.thinInstanceSetBuffer('matrix', new Float32Array(poleM), 16, true);
  const flag = CreatePlane('crownBanner', { width: 1.7, height: 3.4 }, scene);
  flag.material = bannerMat;
  flag.thinInstanceSetBuffer('matrix', new Float32Array(flagM), 16, true);
  pole.isPickable = flag.isPickable = false;
  if (desert) return;

  const signMat = new StandardMaterial('roadSignMat', scene);
  signMat.emissiveTexture = roadSignTexture(scene, 'RACE RUSH');
  signMat.disableLighting = true;
  const frame = new StandardMaterial('signFrameMat', scene);
  frame.diffuseColor = Color3.FromHexString('#8f969f');
  // The 17 % sign hangs on the elevated highway (landmarks); this one has its own gantry.
  for (const s of [path.length * 0.58]) {
    const smp = path.sampleAt(s);
    const off = path.barrierOffset(s) + 0.8;
    const y0 = path.baseHeight(s);
    for (const side of [-1, 1]) {
      const post = CreateBox('signPost', { width: 0.5, height: 8, depth: 0.5 }, scene);
      post.position.set(smp.x + smp.rx * off * side, y0 + 4, smp.z + smp.rz * off * side);
      post.material = frame;
      post.freezeWorldMatrix();
    }
    const beam = CreateBox('signBeam', { width: off * 2, height: 0.4, depth: 0.4 }, scene);
    beam.position.set(smp.x, y0 + 7.6, smp.z);
    beam.rotation.y = smp.heading;
    beam.material = frame;
    const sign = CreatePlane('roadSign', { width: 9, height: 2.25 }, scene);
    sign.parent = beam;
    sign.position.set(0, -0.6, -0.25);
    sign.material = signMat;
  }
};

/** Low-poly palm tree (curved segmented trunk + drooping fronds), thin-instanced along the road. */
const buildPalms = (scene: Scene, path: TrackPath, rng: () => number, clearOf: ClearFn, density: number) => {
  if (density <= 0) return;
  const palm = new GeometryBatch();
  const trunkA = Color3.FromHexString('#9a6b3d');
  const trunkB = Color3.FromHexString('#7f5530');
  let x = 0;
  let y = 0;
  for (let i = 0; i < 7; i++) {
    const tilt = 0.05 + i * 0.035;
    const segH = 1.15;
    const m = Matrix.RotationZ(-tilt).multiply(Matrix.Translation(x, y + segH / 2, 0));
    palm.orientedBox(m, 0.46 - i * 0.03, segH, 0.46 - i * 0.03, i % 2 ? trunkA : trunkB);
    x += Math.sin(tilt) * segH;
    y += Math.cos(tilt) * segH;
  }
  const top = new Vector3(x, y, 0);
  const greens = ['#2f9e44', '#3cb35a', '#258a3a'].map((h) => Color3.FromHexString(h));
  for (let k = 0; k < 9; k++) {
    const yaw = (k / 9) * Math.PI * 2;
    const droop = 0.35 + (k % 3) * 0.12;
    const m = Matrix.Translation(1.55, 0, 0).multiply(Matrix.RotationZ(-droop)).multiply(Matrix.RotationY(yaw)).multiply(Matrix.Translation(top.x, top.y, top.z));
    palm.orientedBox(m, 3.2, 0.08, 0.85, greens[k % 3]);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    palm.orientedBox(Matrix.Translation(top.x + Math.cos(a) * 0.25, top.y - 0.3, Math.sin(a) * 0.25), 0.3, 0.3, 0.3, Color3.FromHexString('#6b4423'));
  }
  const pm = new StandardMaterial('palmMat', scene);
  pm.specularColor = Color3.Black();
  pm.backFaceCulling = false;
  const mesh = palm.build('palm', scene, pm, true);
  mesh.unfreezeWorldMatrix();
  const mats: number[] = [];
  for (let s = 8; s < path.length; s += 17 / Math.max(0.3, density)) {
    for (const side of [-1, 1]) {
      const ss = s + (side > 0 ? 8 : 0) + rng() * 4;
      const smp = path.sampleAt(ss);
      const off = (path.barrierOffset(ss) + 5.5 + embankment(path.baseHeight(ss)) + rng() * 3) * side;
      const px = smp.x + smp.rx * off;
      const pz = smp.z + smp.rz * off;
      if (!clearOf(px, pz, 1)) continue;
      const sc = 0.85 + rng() * 0.45;
      Matrix.Compose(new Vector3(sc, sc, sc), Quaternion.FromEulerAngles(0, rng() * Math.PI * 2, 0), new Vector3(px, 0, pz)).copyToArray(mats, mats.length);
    }
  }
  if (mats.length) mesh.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
};

const buildDesertDecor = (
  scene: Scene,
  path: TrackPath,
  rng: () => number,
  clearOf: ClearFn,
  density: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  animated: ((dt: number, t: number) => void)[],
) => {
  // Rocks & mesas merged into one mesh.
  const rocks = new GeometryBatch();
  const rockTints = ['#b8693a', '#c97c45', '#9c5a33', '#d79257'].map((h) => Color3.FromHexString(h));
  const margin = 260;
  for (let i = 0; i < 260 * density; i++) {
    const x = minX - margin + rng() * (maxX - minX + margin * 2);
    const z = minZ - margin + rng() * (maxZ - minZ + margin * 2);
    const big = rng() < 0.25;
    const sx = big ? 20 + rng() * 40 : 3 + rng() * 6;
    const sz = big ? 20 + rng() * 40 : 3 + rng() * 6;
    const sy = big ? 18 + rng() * 45 : 2 + rng() * 4;
    if (!clearOf(x, z, Math.hypot(sx, sz) / 2)) continue;
    const tint = rockTints[Math.floor(rng() * rockTints.length)];
    const yaw = rng() * Math.PI;
    rocks.box(x, sy / 2 - 0.3, z, sx, sy, sz, yaw, tint);
    if (big) rocks.box(x, sy + sy * 0.12, z, sx * 0.75, sy * 0.25, sz * 0.75, yaw + 0.2, tint);
  }
  // Canyon walls hugging part of the track.
  for (let s = path.length * 0.62; s < path.length * 0.8; s += 14) {
    for (const side of [-1, 1]) {
      const smp = path.sampleAt(s);
      const off = (path.barrierOffset(s) + embankment(path.baseHeight(s)) + 9 + rng() * 6) * side;
      const x = smp.x + smp.rx * off;
      const z = smp.z + smp.rz * off;
      if (!clearOf(x, z, 7)) continue;
      const h = 14 + rng() * 16;
      rocks.box(x, h / 2, z, 12 + rng() * 6, h, 14, smp.heading + (rng() - 0.5) * 0.4, rockTints[Math.floor(rng() * rockTints.length)]);
    }
  }
  const rm = new StandardMaterial('rockMat', scene);
  rm.specularColor = Color3.Black();
  rocks.build('rocks', scene, rm, true);

  // Cacti.
  const cactus = new GeometryBatch();
  const green = Color3.FromHexString('#3f7d3a');
  cactus.box(0, 2.2, 0, 0.7, 4.4, 0.7, 0, green);
  cactus.box(0.7, 2.4, 0, 0.9, 0.45, 0.45, 0, green);
  cactus.box(1.0, 3.1, 0, 0.45, 1.6, 0.45, 0, green);
  cactus.box(-0.6, 1.9, 0, 0.7, 0.4, 0.4, 0, green);
  cactus.box(-0.85, 2.5, 0, 0.4, 1.3, 0.4, 0, green);
  const cMat = new StandardMaterial('cactusMat', scene);
  cMat.specularColor = Color3.Black();
  const cMesh = cactus.build('cactus', scene, cMat, true);
  cMesh.unfreezeWorldMatrix();
  const cm: number[] = [];
  for (let i = 0; i < 140 * density; i++) {
    const s = rng() * path.length;
    const side = rng() < 0.5 ? -1 : 1;
    const smp = path.sampleAt(s);
    const off = (path.barrierOffset(s) + 5 + rng() * 40) * side;
    const x = smp.x + smp.rx * off;
    const z = smp.z + smp.rz * off;
    if (!clearOf(x, z, 1.5)) continue;
    const sc = 0.7 + rng() * 0.8;
    Matrix.Compose(new Vector3(sc, sc, sc), Quaternion.FromEulerAngles(0, rng() * 6, 0), new Vector3(x, 0, z)).copyToArray(cm, cm.length);
  }
  if (cm.length) cMesh.thinInstanceSetBuffer('matrix', new Float32Array(cm), 16, true);

  // Dunes: flattened spheres far from the road.
  const dunes = CreateSphere('dune', { diameter: 1, segments: 8 }, scene);
  const dm = new StandardMaterial('duneMat', scene);
  dm.diffuseColor = Color3.FromHexString('#e0aa66');
  dm.specularColor = Color3.Black();
  dunes.material = dm;
  const dmx: number[] = [];
  for (let i = 0; i < 60 * density; i++) {
    const x = minX - 300 + rng() * (maxX - minX + 600);
    const z = minZ - 300 + rng() * (maxZ - minZ + 600);
    const w = 30 + rng() * 60;
    if (!clearOf(x, z, w / 2)) continue;
    Matrix.Compose(new Vector3(w, 6 + rng() * 10, w * (0.5 + rng())), Quaternion.FromEulerAngles(0, rng() * 3, 0), new Vector3(x, -1, z)).copyToArray(dmx, dmx.length);
  }
  if (dmx.length) dunes.thinInstanceSetBuffer('matrix', new Float32Array(dmx), 16, true);

  // Tumbleweeds rolling across (ambient animation).
  const weedMat = new StandardMaterial('weedMat', scene);
  weedMat.diffuseColor = Color3.FromHexString('#8a6a3a');
  weedMat.wireframe = true;
  const weeds: { mesh: Mesh; s: number; side: number; speed: number }[] = [];
  for (let i = 0; i < Math.round(6 * density); i++) {
    const w = CreateIcoSphere(`weed${i}`, { radius: 0.7, subdivisions: 1 }, scene);
    w.material = weedMat;
    w.isPickable = false;
    weeds.push({ mesh: w, s: rng() * path.length, side: rng() < 0.5 ? -1 : 1, speed: 3 + rng() * 4 });
  }
  animated.push((dt, t) => {
    for (const w of weeds) {
      w.s += w.speed * dt;
      const smp = path.sampleAt(w.s);
      const off = (path.barrierOffset(w.s) + 3 + Math.sin(t * 0.5 + w.speed) * 2) * w.side;
      w.mesh.position.set(smp.x + smp.rx * off, path.baseHeight(w.s) + 0.7 + Math.abs(Math.sin(t * 4 + w.speed)) * 0.6, smp.z + smp.rz * off);
      w.mesh.rotation.x += dt * w.speed;
    }
  });
};
