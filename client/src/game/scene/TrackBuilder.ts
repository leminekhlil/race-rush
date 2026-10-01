import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
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
import {
  bannerTexture,
  barrierTexture,
  checkerTexture,
  chevronTexture,
  curbTexture,
  facadeTexture,
  groundTexture,
  rampTexture,
  roadTexture,
  skyTexture,
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
export const buildTrack = (scene: Scene, path: TrackPath, decorDensity: number): BuiltTrack => {
  const def = path.def;
  const desert = def.theme === 'desert';
  const pal = def.palette;
  const disposables: { dispose(): void }[] = [];
  const animated: ((dt: number, t: number) => void)[] = [];
  const shadowReceivers: Mesh[] = [];

  // ---------- Sky & ground ----------
  const sky = CreateSphere('sky', { diameter: 1800, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = mat(scene, 'skyMat', '#000000', { unlit: true });
  skyMat.emissiveTexture = skyTexture(scene, pal.sky, pal.horizon, desert);
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
    vLength: 24,
  });
  const roadMat = mat(scene, 'roadMat', '#ffffff', { spec: desert ? 0.02 : 0.12 });
  roadMat.diffuseTexture = roadTexture(scene, pal.road, desert);
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
  const barrierMat = mat(scene, 'barrierMat', '#ffffff', { emissive: desert ? '#000000' : '#0a1a40' });
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

  const startLights: StandardMaterial[] = [];
  const gantry = (s: number, text: string, sub: string, withLights: boolean) => {
    const smp = path.sampleAt(s);
    const off = path.barrierOffset(s) + 0.9;
    const y0 = path.baseHeight(s);
    const frameMat = mat(scene, `gantryFrame-${text}`, '#1b2a55', { spec: 0.3 });
    for (const side of [-1, 1]) {
      const p = CreateBox(`gantryLeg-${text}`, { width: 1, height: 9, depth: 1 }, scene);
      p.position.set(smp.x + smp.rx * off * side, y0 + 4.5, smp.z + smp.rz * off * side);
      p.material = frameMat;
      p.freezeWorldMatrix();
    }
    const beam = CreateBox(`gantryBeam-${text}`, { width: off * 2 + 1, height: 2.6, depth: 0.8 }, scene);
    beam.position.set(smp.x, y0 + 8.2, smp.z);
    beam.rotation.y = smp.heading;
    beam.material = frameMat;
    for (const face of [-1, 1]) {
      const banner = CreatePlane(`banner-${text}`, { width: off * 2 - 1, height: 2.2 }, scene);
      banner.parent = beam;
      banner.position.z = 0.41 * face;
      banner.rotation.y = face > 0 ? Math.PI : 0;
      banner.scaling.x = -1; // canvas text is drawn mirrored relative to the plane UVs
      const bm = mat(scene, `bannerMat-${text}`, '#000000', { unlit: true });
      bm.emissiveTexture = bannerTexture(scene, text, '#0a1a4a', '#ffc61a', sub);
      banner.material = bm;
    }
    if (withLights) {
      for (let i = 0; i < 3; i++) {
        const lm = mat(scene, `startLight${i}`, '#220000', { emissive: '#200000' });
        const lamp = CreateCylinder(`startLamp${i}`, { diameter: 1.1, height: 0.3, tessellation: 16 }, scene);
        lamp.parent = beam;
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set((i - 1) * 1.6, -1.75, -0.2);
        lamp.material = lm;
        startLights.push(lm);
      }
    }
  };
  gantry(0, 'RACE RUSH', 'START · FINISH', false);
  gantry(path.def.gridOffset + 16, 'RACE RUSH', 'GO GO GO', true);

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
  const clearOf = (x: number, z: number, radius: number): boolean => {
    const p = path.project(x, z);
    const h = path.baseHeight(p.s);
    return Math.abs(p.lateral) > path.barrierOffset(p.s) + BARRIER_T + embankment(h) + radius + 1.5;
  };

  // Lamps / torches along the barriers.
  const lampMatrices: number[] = [];
  const lampSpacing = desert ? 46 : 30;
  for (let s = 5; s < path.length; s += lampSpacing / Math.max(0.5, decorDensity)) {
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
  const poleMesh = pole.build('lampPole', scene, mat(scene, 'poleMat', desert ? '#5b3b22' : '#2b3550', { spec: 0.3 }), false);
  poleMesh.unfreezeWorldMatrix();
  const head = CreateBox('lampHead', { width: 0.7, height: 0.2, depth: 1.2 }, scene);
  head.bakeTransformIntoVertices(Matrix.Translation(0, 8.75, 3.1));
  head.material = mat(scene, 'lampHeadMat', '#000000', { emissive: desert ? '#ffb347' : '#cfe8ff', unlit: true });
  head.isPickable = false;
  const lampBuf = new Float32Array(lampMatrices);
  poleMesh.thinInstanceSetBuffer('matrix', lampBuf, 16, true);
  head.thinInstanceSetBuffer('matrix', lampBuf.slice(), 16, true);

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

  if (desert) buildDesertDecor(scene, path, rng, clearOf, decorDensity, minX, maxX, minZ, maxZ, animated);
  else buildCityDecor(scene, path, rng, clearOf, decorDensity, minX, maxX, minZ, maxZ, animated);

  // Billboards near the track.
  const boards = desert ? ['DUNE CANYON', 'RACE RUSH', 'v-MRU'] : ['RACE RUSH', 'BOOST!', 'v-MRU', 'NEON CITY'];
  let bi = 0;
  for (let s = 140; s < path.length - 60; s += 230) {
    const smp = path.sampleAt(s);
    const side = bi % 2 ? 1 : -1;
    const off = (path.barrierOffset(s) + embankment(path.baseHeight(s)) + 5) * side;
    const x = smp.x + smp.rx * off;
    const z = smp.z + smp.rz * off;
    if (!clearOf(x, z, 3)) continue;
    const text = boards[bi++ % boards.length];
    const board = CreatePlane(`board-${bi}`, { width: 14, height: 3.5, sideOrientation: Mesh.DOUBLESIDE }, scene);
    board.position.set(x, 9, z);
    board.rotation.y = smp.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (side > 0 ? -0.5 : 0.5);
    const bm = mat(scene, `boardMat-${bi}`, '#000000', { unlit: true });
    bm.emissiveTexture = bannerTexture(scene, text, '#0a1a4a', '#ffc61a');
    board.material = bm;
    board.freezeWorldMatrix();
    const legs = CreateBox(`boardLeg-${bi}`, { width: 0.5, height: 8, depth: 0.5 }, scene);
    legs.position.set(x, 4, z);
    legs.material = poleMesh.material;
    legs.freezeWorldMatrix();
  }

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

const buildCityDecor = (
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
  const facade = facadeTexture(scene);
  const bMat = new StandardMaterial('buildingMat', scene);
  bMat.diffuseTexture = facade;
  bMat.emissiveTexture = facade;
  bMat.emissiveColor = new Color3(0.55, 0.55, 0.6);
  bMat.specularColor = new Color3(0.05, 0.05, 0.08);
  const tints = ['#7f8db3', '#9aa3bd', '#6b7aa6', '#a7a1c9', '#8095c4', '#b0b8cc'].map((h) => Color3.FromHexString(h));
  const batch = new GeometryBatch();
  const neon = new GeometryBatch();
  const neonColors = ['#1fb7ff', '#ff3d8b', '#ffc61a', '#7d3cff'].map((h) => Color3.FromHexString(h));
  const cell = 30;
  const margin = 220;
  const beacons: { x: number; y: number; z: number }[] = [];
  for (let x = minX - margin; x <= maxX + margin; x += cell) {
    for (let z = minZ - margin; z <= maxZ + margin; z += cell) {
      if (rng() > 0.82 * density + 0.1) continue;
      const sx = 12 + rng() * 14;
      const sz = 12 + rng() * 14;
      const px = x + (rng() - 0.5) * 8;
      const pz = z + (rng() - 0.5) * 8;
      const radius = Math.hypot(sx, sz) / 2;
      if (!clearOf(px, pz, radius)) continue;
      const p = path.project(px, pz);
      const distToTrack = Math.abs(p.lateral);
      const tall = distToTrack > 90 ? 30 + rng() * 60 : 12 + rng() * 26;
      const yaw = Math.atan2(path.txs[p.index], path.tzs[p.index]) + (rng() < 0.5 ? 0 : Math.PI / 2);
      const tint = tints[Math.floor(rng() * tints.length)];
      batch.box(px, tall / 2, pz, sx, tall, sz, yaw, tint, 1 / 6.5);
      if (rng() < 0.35) {
        const nc = neonColors[Math.floor(rng() * neonColors.length)];
        neon.box(px, tall + 0.25, pz, sx + 0.4, 0.5, sz + 0.4, yaw, nc);
      }
      if (tall > 55 && beacons.length < 24) beacons.push({ x: px, y: tall + 1.5, z: pz });
    }
  }
  batch.build('buildings', scene, bMat, true);
  if (neon.vertexCount) {
    const nm = new StandardMaterial('neonMat', scene);
    nm.disableLighting = true;
    nm.emissiveColor = new Color3(1, 1, 1);
    neon.build('neonRims', scene, nm, true);
  }

  // Blinking aviation beacons on skyscrapers (environment animation).
  if (beacons.length) {
    const beaconMat = new StandardMaterial('beaconMat', scene);
    beaconMat.disableLighting = true;
    beaconMat.emissiveColor = new Color3(1, 0.15, 0.15);
    const b = CreateBox('beacon', { size: 0.9 }, scene);
    b.material = beaconMat;
    b.isPickable = false;
    const m: number[] = [];
    for (const p of beacons) Matrix.Translation(p.x, p.y, p.z).copyToArray(m, m.length);
    b.thinInstanceSetBuffer('matrix', new Float32Array(m), 16, true);
    animated.push((_dt, t) => {
      b.visibility = Math.sin(t * 3.2) > 0.2 ? 1 : 0.08;
    });
  }

  // Street trees in planters.
  const trees: number[] = [];
  for (let i = 0; i < 160 * density; i++) {
    const s = rng() * path.length;
    const side = rng() < 0.5 ? -1 : 1;
    const smp = path.sampleAt(s);
    const off = (path.barrierOffset(s) + 6 + rng() * 10) * side;
    const x = smp.x + smp.rx * off;
    const z = smp.z + smp.rz * off;
    if (!clearOf(x, z, 1.5)) continue;
    const sc = 0.8 + rng() * 0.6;
    Matrix.Compose(new Vector3(sc, sc, sc), Quaternion.Identity(), new Vector3(x, 0, z)).copyToArray(trees, trees.length);
  }
  if (trees.length) {
    const trunk = CreateCylinder('trunk', { height: 3, diameterTop: 0.3, diameterBottom: 0.45, tessellation: 6 }, scene);
    trunk.bakeTransformIntoVertices(Matrix.Translation(0, 1.5, 0));
    const tm = new StandardMaterial('trunkMat', scene);
    tm.diffuseColor = Color3.FromHexString('#4a3524');
    tm.specularColor = Color3.Black();
    trunk.material = tm;
    const crown = CreateIcoSphere('crown', { radius: 2.2, subdivisions: 1, flat: true }, scene);
    crown.bakeTransformIntoVertices(Matrix.Translation(0, 4.4, 0));
    const cm = new StandardMaterial('crownMat', scene);
    cm.diffuseColor = Color3.FromHexString('#2f8f6a');
    cm.emissiveColor = Color3.FromHexString('#06251c');
    cm.specularColor = Color3.Black();
    crown.material = cm;
    const buf = new Float32Array(trees);
    trunk.thinInstanceSetBuffer('matrix', buf, 16, true);
    crown.thinInstanceSetBuffer('matrix', buf.slice(), 16, true);
  }
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
