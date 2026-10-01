import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { crownBannerTexture } from '../scene/textures';
import { cabinetTexture, cityViewTexture, floorTexture, hazardTexture, logoSignTexture, posterTexture, wallPanelTexture } from './workshopTextures';

const ROOM = { halfW: 13, back: 10, front: -13, height: 8.5 };

const mat = (scene: Scene, name: string, color: string, opts: { tex?: BaseTexture; emissive?: boolean; spec?: number; alpha?: boolean } = {}) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(color);
  m.specularColor = new Color3(opts.spec ?? 0.08, opts.spec ?? 0.08, opts.spec ?? 0.1);
  if (opts.tex) {
    m.diffuseTexture = opts.tex;
    if (opts.alpha) {
      m.diffuseTexture.hasAlpha = true;
      m.useAlphaFromDiffuseTexture = true;
    }
  }
  if (opts.emissive) {
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(color);
    if (opts.tex) m.emissiveTexture = opts.tex;
  }
  return m;
};

/** Plane facing the camera side (-z) placed against the back wall. */
const wallPlane = (scene: Scene, name: string, w: number, h: number, x: number, y: number, z: number, material: StandardMaterial, rotY = 0) => {
  const p = CreatePlane(name, { width: w, height: h }, scene);
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  p.material = material;
  return p;
};

/**
 * Arcade workshop around the showroom turntable (garage reference): logo wall, open door on a sunny palm city,
 * red tool cabinets, tyre stacks, poster, banner, warm ceiling strips and a hazard-striped turntable.
 * Returns the rotating turntable top the vehicle is parented to.
 */
export const buildWorkshop = (scene: Scene): Mesh => {
  // Floor.
  const floor = CreateGround('wsFloor', { width: ROOM.halfW * 2, height: ROOM.back - ROOM.front }, scene);
  floor.position.z = (ROOM.back + ROOM.front) / 2;
  const ft = floorTexture(scene);
  (ft as Texture).uScale = 6;
  (ft as Texture).vScale = 6;
  const fm = mat(scene, 'wsFloorMat', '#ffffff', { tex: ft, spec: 0.45 });
  fm.specularPower = 48;
  floor.material = fm;

  // Walls + ceiling.
  const wt = wallPanelTexture(scene);
  (wt as Texture).uScale = 8;
  (wt as Texture).vScale = 2;
  const wallMat = mat(scene, 'wsWallMat', '#ffffff', { tex: wt });
  const back = CreateBox('wsBack', { width: ROOM.halfW * 2, height: ROOM.height, depth: 0.3 }, scene);
  back.position.set(0, ROOM.height / 2, ROOM.back + 0.15);
  back.material = wallMat;
  const front = back.clone('wsFront');
  front.position.z = ROOM.front - 0.15;
  for (const side of [-1, 1]) {
    const wall = CreateBox(`wsSide${side}`, { width: 0.3, height: ROOM.height, depth: ROOM.back - ROOM.front }, scene);
    wall.position.set(side * (ROOM.halfW + 0.15), ROOM.height / 2, (ROOM.back + ROOM.front) / 2);
    wall.material = wallMat;
  }
  const ceiling = CreateBox('wsCeiling', { width: ROOM.halfW * 2, height: 0.2, depth: ROOM.back - ROOM.front }, scene);
  ceiling.position.set(0, ROOM.height, (ROOM.back + ROOM.front) / 2);
  ceiling.material = mat(scene, 'wsCeilMat', '#141c33');
  // Skirting stripe.
  const skirt = CreateBox('wsSkirt', { width: ROOM.halfW * 2 - 0.1, height: 0.5, depth: 0.05 }, scene);
  skirt.position.set(0, 0.25, ROOM.back - 0.02);
  const hz = hazardTexture(scene);
  (hz as Texture).uScale = 26;
  skirt.material = mat(scene, 'wsSkirtMat', '#ffffff', { tex: hz });

  // Warm ceiling light strips.
  const lightMat = mat(scene, 'wsLightMat', '#fff1cf', { emissive: true });
  for (let i = 0; i < 4; i++) {
    for (const x of [-6.5, 0, 6.5]) {
      const strip = CreateBox(`wsStrip${i}${x}`, { width: 3.4, height: 0.08, depth: 0.3 }, scene);
      strip.position.set(x, ROOM.height - 0.15, ROOM.front + 3 + i * 5.5);
      strip.material = lightMat;
    }
  }
  const blueStripMat = mat(scene, 'wsBlueStrip', '#4d8dff', { emissive: true });
  const blueStrip = CreateBox('wsBlueLine', { width: ROOM.halfW * 2 - 0.4, height: 0.08, depth: 0.08 }, scene);
  blueStrip.position.set(0, 6.6, ROOM.back - 0.05);
  blueStrip.material = blueStripMat;

  // Logo on the back wall (left).
  wallPlane(scene, 'wsLogo', 6.4, 3.2, -3.4, 4.5, ROOM.back - 0.06, mat(scene, 'wsLogoMat', '#ffffff', { tex: logoSignTexture(scene), emissive: true, alpha: true }));

  // Open garage door with the sunny city outside (right of centre).
  const doorX = 6.4;
  wallPlane(scene, 'wsCity', 7.4, 4.8, doorX, 2.4, ROOM.back - 0.04, mat(scene, 'wsCityMat', '#ffffff', { tex: cityViewTexture(scene), emissive: true }));
  const frameMat = mat(scene, 'wsFrameMat', '#59627a', { spec: 0.3 });
  for (const dx of [-3.85, 3.85]) {
    const post = CreateBox(`wsPost${dx}`, { width: 0.35, height: 5.3, depth: 0.5 }, scene);
    post.position.set(doorX + dx, 2.65, ROOM.back - 0.2);
    post.material = frameMat;
  }
  const lintel = CreateBox('wsLintel', { width: 8.05, height: 0.35, depth: 0.5 }, scene);
  lintel.position.set(doorX, 5.12, ROOM.back - 0.2);
  lintel.material = frameMat;
  // Half-rolled shutter.
  const shutter = CreateBox('wsShutter', { width: 7.4, height: 0.7, depth: 0.12 }, scene);
  shutter.position.set(doorX, 4.62, ROOM.back - 0.3);
  shutter.material = mat(scene, 'wsShutterMat', '#8b95ad', { spec: 0.25 });

  // Banner and poster.
  wallPlane(scene, 'wsBanner', 1.3, 2.6, doorX + 4.7, 4.6, ROOM.back - 0.06, mat(scene, 'wsBannerMat', '#ffffff', { tex: crownBannerTexture(scene), emissive: true }));
  wallPlane(scene, 'wsPoster', 2.2, 4.2, ROOM.halfW - 0.06, 3.4, 4, mat(scene, 'wsPosterMat', '#ffffff', { tex: posterTexture(scene), emissive: true }), Math.PI / 2);

  // Tool cabinets (left, against the back wall) with a trophy shelf.
  const cabMat = mat(scene, 'wsCabMat', '#ffffff', { tex: cabinetTexture(scene), spec: 0.3 });
  const cabTop = mat(scene, 'wsCabTop', '#b51a25', { spec: 0.3 });
  const cabinets: [number, number, number][] = [
    [-10.4, 2.4, 2],
    [-7.8, 2.2, 1.4],
  ];
  for (const [x, w, h] of cabinets) {
    const body = CreateBox(`wsCab${x}`, { width: w, height: h, depth: 1 }, scene);
    body.position.set(x, h / 2, ROOM.back - 0.65);
    body.material = cabTop;
    const face = CreatePlane(`wsCabFace${x}`, { width: w - 0.08, height: h - 0.08 }, scene);
    face.position.set(x, h / 2, ROOM.back - 1.16);
    face.material = cabMat;
  }
  const shelf = CreateBox('wsShelf', { width: 3.4, height: 0.12, depth: 0.6 }, scene);
  shelf.position.set(-9.2, 2.9, ROOM.back - 0.35);
  shelf.material = frameMat;
  const goldMat = mat(scene, 'wsGold', '#ffc61a', { spec: 0.9 });
  goldMat.emissiveColor = Color3.FromHexString('#4a3300');
  for (const [i, x] of [-10.4, -9.4, -8.3].entries()) {
    const cup = CreateCylinder(`wsCup${i}`, { diameterTop: 0.5, diameterBottom: 0.18, height: 0.5 + i * 0.1, tessellation: 12 }, scene);
    cup.position.set(x, 3.25 + i * 0.05, ROOM.back - 0.35);
    cup.material = goldMat;
    const base = CreateBox(`wsCupBase${i}`, { size: 0.28 }, scene);
    base.position.set(x, 3.0, ROOM.back - 0.35);
    base.material = frameMat;
  }

  // Tyre stacks (right).
  const tyreMat = mat(scene, 'wsTyre', '#16181d', { spec: 0.15 });
  const stacks: [number, number, number][] = [
    [10.6, 7.4, 4],
    [11.4, 5.8, 3],
    [9.4, 8.6, 2],
    [-11.4, 6.2, 3],
  ];
  for (const [x, z, n] of stacks) {
    for (let k = 0; k < n; k++) {
      const t = CreateTorus(`wsTyre${x}${k}`, { diameter: 1.05, thickness: 0.42, tessellation: 18 }, scene);
      t.position.set(x + (k % 2) * 0.05, 0.21 + k * 0.42, z);
      t.material = tyreMat;
    }
  }

  // Turntable: static hazard-striped base + glowing rings, rotating dark top.
  const rim = CreateCylinder('wsRim', { diameter: 8, height: 0.42, tessellation: 72, cap: Mesh.NO_CAP }, scene);
  rim.position.y = 0.21;
  const rimTex = hazardTexture(scene);
  (rimTex as Texture).uScale = 22;
  rim.material = mat(scene, 'wsRimMat', '#ffffff', { tex: rimTex, spec: 0.2 });
  const baseCap = CreateDisc('wsBaseCap', { radius: 4, tessellation: 72 }, scene);
  baseCap.rotation.x = Math.PI / 2;
  baseCap.position.y = 0.42;
  baseCap.material = mat(scene, 'wsBaseCapMat', '#1a2238', { spec: 0.3 });
  const ringOuter = CreateTorus('wsRingOuter', { diameter: 7.75, thickness: 0.1, tessellation: 72 }, scene);
  ringOuter.position.y = 0.45;
  ringOuter.material = mat(scene, 'wsRingMat', '#19e3ff', { emissive: true });
  const glow = CreateTorus('wsRingGlow', { diameter: 8.3, thickness: 0.06, tessellation: 72 }, scene);
  glow.position.y = 0.02;
  glow.material = mat(scene, 'wsGlowMat', '#1f6bff', { emissive: true });

  const top = CreateCylinder('wsTop', { diameter: 7.2, height: 0.08, tessellation: 72 }, scene);
  top.position.y = 0.48;
  const topMat = mat(scene, 'wsTopMat', '#1c2338', { spec: 0.55 });
  topMat.specularPower = 64;
  top.material = topMat;
  const inner = CreateTorus('wsRingInner', { diameter: 5.2, thickness: 0.05, tessellation: 64 }, scene);
  inner.position.y = 0.05;
  inner.parent = top;
  inner.material = ringOuter.material;

  for (const m of scene.meshes) {
    m.isPickable = false;
    if (m !== top && m.parent !== top) m.freezeWorldMatrix();
  }
  return top;
};
