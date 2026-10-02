import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { TrackPath } from '@race-rush/shared';
import { brakeBoardTexture, manholeTexture, roadArrowTexture } from './textures';

/**
 * Readability and surface details: painted chevrons before tight corners (pointing the turn), braking-distance
 * boards on the outside, manholes and drain grates near the kerbs. All decals are thin-instanced.
 */
export const buildRoadDetails = (scene: Scene, path: TrackPath, barrierOffset: (s: number) => number, skip: (s: number) => boolean, desert: boolean) => {
  const L = path.length;
  // Find corner entries: where |curvature| rises above the threshold.
  const corners: { s: number; dir: number }[] = [];
  let inCorner = false;
  for (let s = 0; s < L; s += 2) {
    const k = path.sampleAt(s).curvature;
    const tight = Math.abs(k) > 1 / 55;
    if (tight && !inCorner) corners.push({ s, dir: Math.sign(k) });
    inCorner = tight;
  }

  // Painted chevrons on the road, 25 m and 45 m before each corner.
  const arrowMat = new StandardMaterial('roadArrowMat', scene);
  const at = roadArrowTexture(scene);
  arrowMat.diffuseTexture = at;
  arrowMat.diffuseTexture.hasAlpha = true;
  arrowMat.useAlphaFromDiffuseTexture = true;
  arrowMat.specularColor = Color3.Black();
  arrowMat.zOffset = -2;
  const arrow = CreateGround('roadArrow', { width: 6, height: 6 }, scene);
  arrow.material = arrowMat;
  arrow.isPickable = false;
  const am: number[] = [];
  // Braking boards on the outside barrier.
  const boards: Record<number, number[]> = { 150: [], 100: [], 50: [] };
  for (const c of corners) {
    for (const back of [25, 45]) {
      const s = path.wrap(c.s - back);
      if (skip(s)) continue;
      const smp = path.sampleAt(s);
      // Chevrons point towards the turn: rotate so the arrow tip faces the inside lateral direction.
      const yaw = smp.heading + (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(smp.x, path.groundHeight(s) + 0.035, smp.z)).copyToArray(am, am.length);
    }
    for (const d of [150, 100, 50]) {
      const s = path.wrap(c.s - d * 0.6);
      if (skip(s)) continue;
      const smp = path.sampleAt(s);
      const side = -c.dir;
      const off = (barrierOffset(s) + 0.6) * side;
      const pos = new Vector3(smp.x + smp.rx * off, path.baseHeight(s) + 2.4, smp.z + smp.rz * off);
      Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, smp.heading + Math.PI, 0), pos).copyToArray(boards[d], boards[d].length);
    }
  }
  if (am.length) arrow.thinInstanceSetBuffer('matrix', new Float32Array(am), 16, true);
  else arrow.setEnabled(false);

  const postMat = new StandardMaterial('brakePostMat', scene);
  postMat.diffuseColor = Color3.FromHexString('#c3c8d0');
  const posts: number[] = [];
  for (const d of [150, 100, 50]) {
    if (!boards[d].length) continue;
    const m = new StandardMaterial(`brakeBoardMat${d}`, scene);
    m.diffuseTexture = brakeBoardTexture(scene, d);
    m.emissiveColor = new Color3(0.25, 0.25, 0.25);
    const plane = CreatePlane(`brakeBoard${d}`, { width: 1.4, height: 1.4, sideOrientation: Mesh.DOUBLESIDE }, scene);
    plane.material = m;
    plane.isPickable = false;
    plane.thinInstanceSetBuffer('matrix', new Float32Array(boards[d]), 16, true);
    for (let i = 0; i < boards[d].length; i += 16) {
      const mm = Matrix.FromArray(boards[d], i);
      Matrix.Translation(0, -1.2, 0).multiply(mm).copyToArray(posts, posts.length);
    }
  }
  if (posts.length) {
    const post = CreateBox('brakePost', { width: 0.12, height: 2.4, depth: 0.12 }, scene);
    post.material = postMat;
    post.isPickable = false;
    post.thinInstanceSetBuffer('matrix', new Float32Array(posts), 16, true);
  }

  // Manholes / grates near the kerbs (city only).
  if (!desert) {
    const mm = new StandardMaterial('manholeMat', scene);
    const mt = manholeTexture(scene);
    mm.diffuseTexture = mt;
    mm.diffuseTexture.hasAlpha = true;
    mm.useAlphaFromDiffuseTexture = true;
    mm.specularColor = new Color3(0.2, 0.2, 0.2);
    mm.zOffset = -2;
    const hole = CreateGround('manhole', { width: 1.1, height: 1.1 }, scene);
    hole.material = mm;
    hole.isPickable = false;
    const hm: number[] = [];
    for (let s = 11; s < L; s += 37) {
      if (skip(s)) continue;
      const smp = path.sampleAt(s);
      const lat = (path.widthAt(s) / 2 - 1.6) * (Math.floor(s / 37) % 2 ? 1 : -1) * 0.55;
      Matrix.Translation(smp.x + smp.rx * lat, path.groundHeight(s) + 0.03, smp.z + smp.rz * lat).copyToArray(hm, hm.length);
    }
    if (hm.length) hole.thinInstanceSetBuffer('matrix', new Float32Array(hm), 16, true);
  }
};
