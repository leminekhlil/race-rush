import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { paintById, type VehicleId } from '@race-rush/shared';
import { instantiateGlbVehicle, readyContainer } from '../assets/VehicleAssets';
import { createSmoothVehicle, hasSmoothBlueprint } from './vehicles/smoothVehicles';

export interface WheelRig {
  pivot: TransformNode;
  spin: TransformNode;
  front: boolean;
  radius: number;
  restY: number;
}

export interface VehicleModel {
  id: VehicleId;
  root: TransformNode;
  /** Body node: receives pitch/roll/suspension offsets. */
  chassis: TransformNode;
  wheels: WheelRig[];
  /** Local positions of exhausts (boost flames). */
  exhausts: Vector3[];
  /** Local positions of rear wheels contact (smoke / dust). */
  rearContacts: Vector3[];
  wheelsOnChassis: boolean;
  bodyRestY: number;
  meshes: Mesh[];
  setPaint(colorId: string): void;
  setBrakeLights(on: boolean): void;
  dispose(): void;
}

const C = (h: string) => Color3.FromHexString(h);

/** Builds faceted prisms (8 corners) into a single mesh per material. */
class Shapes {
  positions: number[] = [];
  indices: number[] = [];
  colors: number[] = [];

  private v(p: Vector3, c: Color3): number {
    this.positions.push(p.x, p.y, p.z);
    this.colors.push(c.r, c.g, c.b, 1);
    return this.positions.length / 3 - 1;
  }

  private face(a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Color3): void {
    const i0 = this.v(a, col);
    const i1 = this.v(b, col);
    const i2 = this.v(c, col);
    const i3 = this.v(d, col);
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  /** bottom[4] then top[4]; corners ordered (-x,-z), (+x,-z), (+x,+z), (-x,+z). */
  prism(b: Vector3[], t: Vector3[], col: Color3): void {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.face(b[i], b[j], t[j], t[i], col);
    }
    this.face(t[0], t[1], t[2], t[3], col);
    this.face(b[3], b[2], b[1], b[0], col);
  }

  /** Box with optional taper: top face size (tx, tz) and top z-shift (slopes windshields). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: Color3, taper: { tx?: number; tz?: number; shiftZ?: number; pitch?: number } = {}): void {
    const hx = sx / 2;
    const hz = sz / 2;
    const thx = (taper.tx ?? sx) / 2;
    const thz = (taper.tz ?? sz) / 2;
    const sh = taper.shiftZ ?? 0;
    const y0 = -sy / 2;
    const y1 = sy / 2;
    const m = Matrix.RotationX(taper.pitch ?? 0).multiply(Matrix.Translation(cx, cy, cz));
    const P = (x: number, y: number, z: number) => Vector3.TransformCoordinates(new Vector3(x, y, z), m);
    this.prism(
      [P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz)],
      [P(-thx, y1, -thz + sh), P(thx, y1, -thz + sh), P(thx, y1, thz + sh), P(-thx, y1, thz + sh)],
      col,
    );
  }

  build(name: string, scene: Scene, material: StandardMaterial, parent: TransformNode): Mesh | null {
    if (!this.indices.length) return null;
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.indices = this.indices;
    vd.colors = this.colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(this.positions, this.indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }
}

interface Kit {
  paint: Shapes;
  trim: Shapes;
  glass: Shapes;
  light: Shapes;
  tail: Shapes;
  chrome: Shapes;
  /** Emissive blue: LED headlights, exhaust glow (reference look). */
  blue: Shapes;
}

const WHITE = C('#ffffff');
const TRIM = C('#16181f');
const STRIPE = C('#f4f6fb');
const RED_SPRING = C('#e23b3b');
const SUIT = C('#15171d');

interface Blueprint {
  wheels: { x: number; z: number; r: number; w: number; front: boolean }[];
  bodyRestY: number;
  exhausts: Vector3[];
  wheelsOnChassis?: boolean;
  /** Black rims instead of silver (buggy reference). */
  darkRims?: boolean;
  build(k: Kit): void;
}

const BLUEPRINTS: Record<VehicleId, Blueprint> = {
  // Reference: low red supercar, white double stripes, big rear wing, blue LEDs, blue exhaust flames.
  sport: {
    bodyRestY: 0,
    wheels: [
      { x: -0.88, z: 1.4, r: 0.36, w: 0.3, front: true },
      { x: 0.88, z: 1.4, r: 0.36, w: 0.3, front: true },
      { x: -0.92, z: -1.3, r: 0.39, w: 0.36, front: false },
      { x: 0.92, z: -1.3, r: 0.39, w: 0.36, front: false },
    ],
    exhausts: [new Vector3(-0.36, 0.42, -2.32), new Vector3(0.36, 0.42, -2.32)],
    build({ paint, trim, glass, tail, chrome, blue }) {
      paint.box(0, 0.48, 0.1, 1.9, 0.36, 4.3, WHITE, { tz: 4.2 });
      paint.box(0, 0.74, 1.36, 1.84, 0.18, 1.7, WHITE, { tx: 1.72, tz: 1.62, pitch: 0.09 });
      paint.box(0, 0.5, 2.22, 1.86, 0.3, 0.3, WHITE, { tz: 0.16, shiftZ: -0.06 });
      paint.box(-0.9, 0.66, -1.22, 0.34, 0.36, 1.7, WHITE, { tx: 0.18 });
      paint.box(0.9, 0.66, -1.22, 0.34, 0.36, 1.7, WHITE, { tx: 0.18 });
      paint.box(0, 0.76, -1.55, 1.62, 0.18, 1.3, WHITE, { tz: 1.2 });
      glass.box(0, 0.98, -0.2, 1.56, 0.44, 2.0, WHITE, { tx: 1.22, tz: 1.0, shiftZ: -0.18 });
      paint.box(0, 1.215, -0.38, 1.2, 0.04, 0.95, WHITE);
      // White double racing stripes (nose → hood → roof → deck).
      for (const x of [-0.2, 0.2]) {
        trim.box(x, 0.66, 2.2, 0.2, 0.02, 0.26, STRIPE);
        trim.box(x, 0.84, 1.36, 0.2, 0.02, 1.64, STRIPE, { pitch: 0.09 });
        trim.box(x, 1.24, -0.38, 0.2, 0.02, 0.93, STRIPE);
        trim.box(x, 0.86, -1.55, 0.2, 0.02, 1.22, STRIPE);
      }
      // Big rear wing on two stands with end plates.
      trim.box(-0.55, 1.06, -2.0, 0.07, 0.44, 0.16, TRIM);
      trim.box(0.55, 1.06, -2.0, 0.07, 0.44, 0.16, TRIM);
      paint.box(0, 1.3, -2.06, 2.0, 0.06, 0.46, WHITE);
      trim.box(-1.01, 1.25, -2.06, 0.04, 0.2, 0.52, TRIM);
      trim.box(1.01, 1.25, -2.06, 0.04, 0.2, 0.52, TRIM);
      // Side intakes, splitter, skirts, diffuser.
      trim.box(-0.97, 0.62, -0.5, 0.04, 0.2, 0.64, TRIM);
      trim.box(0.97, 0.62, -0.5, 0.04, 0.2, 0.64, TRIM);
      trim.box(0, 0.32, 2.3, 1.9, 0.06, 0.32, TRIM);
      trim.box(-0.97, 0.34, 0.2, 0.06, 0.14, 2.3, TRIM);
      trim.box(0.97, 0.34, 0.2, 0.06, 0.14, 2.3, TRIM);
      trim.box(0, 0.38, -2.2, 1.6, 0.2, 0.14, TRIM);
      // Blue LED headlights, red tail bar, exhaust tips with blue glow.
      blue.box(-0.64, 0.64, 2.25, 0.44, 0.06, 0.08, WHITE);
      blue.box(0.64, 0.64, 2.25, 0.44, 0.06, 0.08, WHITE);
      tail.box(0, 0.72, -2.21, 1.5, 0.07, 0.04, WHITE);
      for (const x of [-0.36, 0.36]) {
        chrome.box(x, 0.42, -2.27, 0.18, 0.13, 0.1, WHITE);
        blue.box(x, 0.42, -2.33, 0.11, 0.07, 0.02, WHITE);
      }
    },
  },
  // Reference: red sport bike, rider in black suit with a helmet in the bike colour.
  moto: {
    bodyRestY: 0,
    wheelsOnChassis: true,
    wheels: [
      { x: 0, z: 0.74, r: 0.34, w: 0.16, front: true },
      { x: 0, z: -0.7, r: 0.35, w: 0.2, front: false },
    ],
    exhausts: [new Vector3(0.2, 0.46, -1.0)],
    build({ paint, trim, glass, tail, chrome, blue }) {
      trim.box(0, 0.52, 0, 0.32, 0.36, 0.95, TRIM);
      paint.box(0, 0.86, 0.18, 0.42, 0.26, 0.7, WHITE, { tx: 0.34, tz: 0.55 });
      paint.box(0, 0.78, 0.62, 0.48, 0.44, 0.36, WHITE, { tx: 0.3, tz: 0.2, shiftZ: -0.06 });
      paint.box(-0.22, 0.62, 0.25, 0.04, 0.3, 0.7, WHITE);
      paint.box(0.22, 0.62, 0.25, 0.04, 0.3, 0.7, WHITE);
      trim.box(-0.225, 0.66, 0.25, 0.02, 0.06, 0.6, STRIPE);
      trim.box(0.225, 0.66, 0.25, 0.02, 0.06, 0.6, STRIPE);
      glass.box(0, 1.06, 0.6, 0.34, 0.22, 0.08, WHITE, { pitch: -0.5 });
      trim.box(0, 0.86, -0.42, 0.3, 0.12, 0.62, TRIM);
      paint.box(0, 0.88, -0.84, 0.24, 0.16, 0.34, WHITE, { tz: 0.2, shiftZ: -0.04 });
      chrome.box(0, 0.58, 0.78, 0.06, 0.62, 0.06, WHITE, { pitch: -0.35 });
      chrome.box(0.2, 0.46, -0.78, 0.1, 0.1, 0.46, WHITE);
      trim.box(0, 1.0, 0.66, 0.7, 0.05, 0.05, TRIM);
      // Rider (black suit, helmet in paint colour).
      trim.box(0, 1.25, -0.12, 0.42, 0.55, 0.32, SUIT, { pitch: 0.55 });
      trim.box(-0.28, 1.12, 0.3, 0.1, 0.1, 0.52, SUIT, { pitch: 0.25 });
      trim.box(0.28, 1.12, 0.3, 0.1, 0.1, 0.52, SUIT, { pitch: 0.25 });
      trim.box(-0.2, 0.82, -0.18, 0.13, 0.13, 0.6, SUIT, { pitch: -0.3 });
      trim.box(0.2, 0.82, -0.18, 0.13, 0.13, 0.6, SUIT, { pitch: -0.3 });
      paint.box(0, 1.56, 0.1, 0.3, 0.3, 0.34, WHITE, { tx: 0.26, tz: 0.28 });
      glass.box(0, 1.55, 0.26, 0.26, 0.1, 0.06, WHITE);
      blue.box(0, 0.86, 0.81, 0.16, 0.08, 0.04, WHITE);
      tail.box(0, 0.9, -1.01, 0.12, 0.06, 0.03, WHITE);
    },
  },
  // Reference (09-buggy): yellow body, black hood stripe, black roll cage with a yellow roof panel,
  // 3 big roof lamps, black bull bar with round headlights, chunky black tyres on black rims.
  buggy: {
    bodyRestY: 0.14,
    darkRims: true,
    wheels: [
      { x: -0.98, z: 1.3, r: 0.5, w: 0.4, front: true },
      { x: 0.98, z: 1.3, r: 0.5, w: 0.4, front: true },
      { x: -1.02, z: -1.15, r: 0.55, w: 0.48, front: false },
      { x: 1.02, z: -1.15, r: 0.55, w: 0.48, front: false },
    ],
    exhausts: [new Vector3(-0.3, 0.86, -1.86), new Vector3(0.3, 0.86, -1.86)],
    build({ paint, trim, light, tail, chrome }) {
      // Floor pan + front nose and hood (sloped), black centre stripe.
      trim.box(0, 0.5, 0, 1.34, 0.16, 3.3, TRIM);
      paint.box(0, 0.74, 1.42, 1.5, 0.36, 0.95, WHITE, { tz: 0.7, shiftZ: -0.14 });
      trim.box(0, 0.93, 1.36, 0.46, 0.03, 0.72, TRIM, { pitch: 0.12 });
      // Side pods and fenders arching over the wheels.
      paint.box(-0.74, 0.74, -0.05, 0.16, 0.42, 1.55, WHITE, { tz: 1.4 });
      paint.box(0.74, 0.74, -0.05, 0.16, 0.42, 1.55, WHITE, { tz: 1.4 });
      for (const x of [-0.98, 0.98]) {
        paint.box(x * 0.97, 0.98, 1.3, 0.5, 0.1, 1.0, WHITE, { tz: 0.74 });
        paint.box(x, 1.06, -1.15, 0.56, 0.1, 1.1, WHITE, { tz: 0.82 });
      }
      // Rear engine cover + tail.
      paint.box(0, 0.98, -1.35, 1.36, 0.42, 0.9, WHITE, { tz: 0.7, shiftZ: 0.05 });
      trim.box(0, 0.78, -1.82, 1.3, 0.22, 0.12, TRIM);
      // Seats.
      for (const x of [-0.32, 0.32]) {
        trim.box(x, 0.78, -0.2, 0.44, 0.16, 0.5, TRIM);
        trim.box(x, 1.12, -0.48, 0.44, 0.62, 0.12, TRIM, { pitch: 0.18 });
      }
      // Black roll cage with a yellow roof panel.
      for (const x of [-0.64, 0.64]) {
        trim.box(x, 1.3, 0.52, 0.09, 1.1, 0.09, TRIM, { pitch: -0.38 });
        trim.box(x, 1.32, -0.72, 0.09, 1.16, 0.09, TRIM, { pitch: 0.2 });
        trim.box(x, 1.88, -0.08, 0.09, 0.09, 1.2, TRIM);
        trim.box(x, 1.02, 0.4, 0.07, 0.07, 0.9, TRIM, { pitch: 0.55 });
      }
      trim.box(0, 1.88, 0.52, 1.36, 0.09, 0.09, TRIM);
      trim.box(0, 1.88, -0.68, 1.36, 0.09, 0.09, TRIM);
      paint.box(0, 1.95, -0.08, 1.3, 0.06, 1.18, WHITE);
      trim.box(0, 1.985, -0.08, 0.4, 0.02, 1.1, TRIM);
      // Roof light bar: 3 big lamps with chrome bezels.
      trim.box(0, 2.04, 0.5, 1.2, 0.08, 0.16, TRIM);
      for (const x of [-0.4, 0, 0.4]) {
        chrome.box(x, 2.22, 0.52, 0.3, 0.3, 0.12, WHITE);
        light.box(x, 2.22, 0.59, 0.24, 0.24, 0.04, WHITE);
      }
      // Bull bar with round headlights.
      trim.box(0, 0.64, 1.98, 1.56, 0.1, 0.1, TRIM);
      trim.box(0, 1.0, 1.96, 1.2, 0.08, 0.08, TRIM);
      for (const x of [-0.6, 0.6]) trim.box(x, 0.84, 1.96, 0.08, 0.42, 0.08, TRIM);
      for (const x of [-0.42, 0.42]) {
        chrome.box(x, 0.86, 1.9, 0.28, 0.28, 0.08, WHITE);
        light.box(x, 0.86, 1.95, 0.22, 0.22, 0.04, WHITE);
      }
      trim.box(0, 0.86, 1.92, 0.26, 0.16, 0.04, TRIM);
      // Shocks.
      for (const x of [-0.84, 0.84]) {
        chrome.box(x, 0.72, 1.22, 0.08, 0.4, 0.08, WHITE, { pitch: 0.2 });
        chrome.box(x, 0.78, -1.08, 0.09, 0.44, 0.09, WHITE);
      }
      // Exhausts, tail lights.
      for (const x of [-0.3, 0.3]) chrome.box(x, 0.86, -1.8, 0.12, 0.12, 0.2, WHITE);
      tail.box(-0.52, 0.94, -1.83, 0.2, 0.14, 0.04, WHITE);
      tail.box(0.52, 0.94, -1.83, 0.2, 0.14, 0.04, WHITE);
    },
  },
  // Reference: purple pickup, giant tyres, black fender flares, red springs, chrome bumper, roof light bar.
  monster: {
    bodyRestY: 0.55,
    wheels: [
      { x: -1.3, z: 1.5, r: 0.95, w: 0.78, front: true },
      { x: 1.3, z: 1.5, r: 0.95, w: 0.78, front: true },
      { x: -1.3, z: -1.45, r: 0.95, w: 0.78, front: false },
      { x: 1.3, z: -1.45, r: 0.95, w: 0.78, front: false },
    ],
    exhausts: [new Vector3(-0.85, 2.55, -0.55), new Vector3(0.85, 2.55, -0.55)],
    build({ paint, trim, glass, light, tail, chrome }) {
      trim.box(0, 1.0, 0, 1.0, 0.3, 4.0, TRIM);
      trim.box(0, 0.95, 1.5, 2.2, 0.18, 0.22, TRIM);
      trim.box(0, 0.95, -1.45, 2.2, 0.18, 0.22, TRIM);
      for (const x of [-0.75, 0.75])
        for (const z of [1.5, -1.45]) {
          trim.box(x, 1.28, z, 0.24, 0.7, 0.24, RED_SPRING);
          chrome.box(x, 1.28, z, 0.12, 0.85, 0.12, WHITE);
        }
      paint.box(0, 1.9, 0.2, 2.2, 0.75, 4.1, WHITE, { tz: 4.0 });
      paint.box(0, 2.55, -0.2, 2.0, 0.65, 1.7, WHITE, { tx: 1.9, tz: 1.35, shiftZ: -0.08 });
      glass.box(0, 2.56, 0.6, 1.8, 0.48, 0.08, WHITE, { pitch: -0.35 });
      glass.box(-1.0, 2.56, -0.2, 0.04, 0.42, 1.2, WHITE);
      glass.box(1.0, 2.56, -0.2, 0.04, 0.42, 1.2, WHITE);
      trim.box(0, 2.32, -1.55, 2.1, 0.28, 1.25, TRIM);
      // Black fender flares over the giant tyres.
      for (const x of [-1.15, 1.15])
        for (const z of [1.5, -1.45]) trim.box(x, 2.25, z, 0.5, 0.12, 1.5, TRIM);
      chrome.box(0, 1.62, 2.28, 2.0, 0.42, 0.14, WHITE);
      trim.box(0, 1.98, 2.26, 1.4, 0.32, 0.06, TRIM);
      // Roof light bar (5 lamps).
      trim.box(0, 2.92, 0.2, 1.7, 0.12, 0.18, TRIM);
      for (const x of [-0.64, -0.32, 0, 0.32, 0.64]) light.box(x, 2.94, 0.3, 0.2, 0.15, 0.05, WHITE);
      light.box(-0.82, 1.98, 2.3, 0.3, 0.2, 0.05, WHITE);
      light.box(0.82, 1.98, 2.3, 0.3, 0.2, 0.05, WHITE);
      tail.box(-0.9, 1.92, -1.92, 0.22, 0.3, 0.05, WHITE);
      tail.box(0.9, 1.92, -1.92, 0.22, 0.3, 0.05, WHITE);
      chrome.box(-0.85, 2.35, -0.55, 0.14, 0.9, 0.14, WHITE);
      chrome.box(0.85, 2.35, -0.55, 0.14, 0.9, 0.14, WHITE);
    },
  },
};

/** Shared materials (one set per scene) so vehicles batch well. */
const sharedMaterials = new WeakMap<Scene, Record<string, StandardMaterial>>();

const materialsFor = (scene: Scene) => {
  let m = sharedMaterials.get(scene);
  if (m) return m;
  const mk = (name: string, diffuse: string, spec: number, emissive?: string) => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = C(diffuse);
    mat.specularColor = new Color3(spec, spec, spec);
    mat.specularPower = 48;
    if (emissive) mat.emissiveColor = C(emissive);
    return mat;
  };
  m = {
    trim: mk('vTrim', '#ffffff', 0.15),
    glass: mk('vGlass', '#0d1a36', 0.9, '#050c20'),
    light: mk('vLight', '#ffffff', 0, '#fff4d2'),
    chrome: mk('vChrome', '#cfd5df', 0.9, '#20242c'),
    tire: mk('vTire', '#ffffff', 0.05),
    blue: mk('vBlue', '#000000', 0, '#6cc4ff'),
  };
  m.light.disableLighting = true;
  m.blue.disableLighting = true;
  sharedMaterials.set(scene, m);
  return m;
};

/** Black tyre with an inset silver rim on both sides (reference look). */
const buildWheel = (scene: Scene, r: number, w: number, mat: StandardMaterial, name: string, darkRim = false): Mesh => {
  const rimC = darkRim ? new Color4(0.16, 0.17, 0.2, 1) : new Color4(0.74, 0.77, 0.83, 1);
  const hubC = darkRim ? new Color4(0.45, 0.47, 0.52, 1) : new Color4(0.22, 0.24, 0.29, 1);
  const tireC = new Color4(0.07, 0.075, 0.09, 1);
  const tess = r > 0.6 ? 18 : 14;
  const tire = CreateCylinder(`${name}-tire`, { diameter: r * 2, height: w, tessellation: tess, faceColors: [tireC, tireC, tireC] }, scene);
  const rim = CreateCylinder(`${name}-rim`, { diameter: r * 1.18, height: w + 0.03, tessellation: tess, faceColors: [rimC, tireC, rimC] }, scene);
  const hub = CreateCylinder(`${name}-hub`, { diameter: r * 0.42, height: w + 0.06, tessellation: 8, faceColors: [hubC, hubC, hubC] }, scene);
  const wheel = Mesh.MergeMeshes([tire, rim, hub], true, true) as Mesh;
  wheel.name = name;
  wheel.bakeTransformIntoVertices(Matrix.RotationZ(Math.PI / 2));
  wheel.material = mat;
  wheel.isPickable = false;
  return wheel;
};

/** Soft dark blob under the vehicle (cheap fake AO, works on every profile). */
const shadowBlob = (scene: Scene, id: VehicleId, name: string, parent: TransformNode) => {
  const blob = CreateSphere(`veh-${name}-shadow`, { diameter: 1, segments: 6 }, scene);
  blob.scaling.set(id === 'moto' ? 1.2 : id === 'monster' ? 3.6 : 2.4, 0.02, id === 'moto' ? 2.6 : id === 'monster' ? 5 : 4.6);
  blob.position.y = 0.04;
  const blobMat = new StandardMaterial(`veh-${name}-shadowMat`, scene);
  blobMat.diffuseColor = Color3.Black();
  blobMat.specularColor = Color3.Black();
  blobMat.disableLighting = true;
  blobMat.alpha = 0.45;
  blob.material = blobMat;
  blob.parent = parent;
  blob.isPickable = false;
  return { blob, blobMat };
};

/** GLB-based vehicle (see game/assets/VehicleAssets): same rig contract as the procedural models. */
const createGlbModel = (scene: Scene, id: VehicleId, paintId: string, name: string, container: AssetContainer): VehicleModel => {
  const bp = BLUEPRINTS[id];
  const root = new TransformNode(`veh-${name}`, scene);
  const chassis = new TransformNode(`veh-${name}-chassis`, scene);
  chassis.parent = root;
  const parts = instantiateGlbVehicle(scene, container, chassis, `veh-${name}`, paintId);
  const wheels: WheelRig[] = [];
  for (const w of parts.wheels) {
    const pivot = new TransformNode(`veh-${name}-wpivot`, scene);
    pivot.parent = root;
    pivot.position.set(w.position.x, w.radius, w.position.z);
    const spin = new TransformNode(`veh-${name}-wspin`, scene);
    spin.parent = pivot;
    w.node.setParent(spin);
    w.node.position.set(0, 0, 0);
    wheels.push({ pivot, spin, front: w.front, radius: w.radius, restY: pivot.position.y });
  }
  const { blob, blobMat } = shadowBlob(scene, id, name, root);
  const rear = parts.wheels.filter((w) => !w.front);
  return {
    id,
    root,
    chassis,
    wheels,
    exhausts: bp.exhausts,
    rearContacts: rear.map((w) => new Vector3(w.position.x, 0.15, w.position.z)),
    wheelsOnChassis: false,
    bodyRestY: 0,
    meshes: [...parts.meshes, blob],
    setPaint: parts.setPaint,
    setBrakeLights: parts.setBrakeLights,
    dispose() {
      parts.dispose();
      root.dispose(false, false);
      blobMat.dispose();
    },
  };
};

export const createVehicleModel = (scene: Scene, id: VehicleId, paintId: string, name: string = id): VehicleModel => {
  const container = readyContainer(scene, id);
  if (container) return createGlbModel(scene, id, paintId, name, container);
  if (hasSmoothBlueprint(id)) return createSmoothVehicle(scene, id, paintId, name);
  const bp = BLUEPRINTS[id];
  const shared = materialsFor(scene);
  const root = new TransformNode(`veh-${name}`, scene);
  const chassis = new TransformNode(`veh-${name}-chassis`, scene);
  chassis.parent = root;
  chassis.position.y = bp.bodyRestY;

  const paintMat = new StandardMaterial(`veh-${name}-paint`, scene);
  paintMat.specularPower = 64;
  const tailMat = new StandardMaterial(`veh-${name}-tail`, scene);
  tailMat.diffuseColor = C('#3a0000');
  tailMat.emissiveColor = C('#7a0505');

  const kit: Kit = { paint: new Shapes(), trim: new Shapes(), glass: new Shapes(), light: new Shapes(), tail: new Shapes(), chrome: new Shapes(), blue: new Shapes() };
  bp.build(kit);
  const meshes: Mesh[] = [];
  const add = (m: Mesh | null) => m && meshes.push(m);
  add(kit.paint.build(`veh-${name}-body`, scene, paintMat, chassis));
  add(kit.trim.build(`veh-${name}-trim`, scene, shared.trim, chassis));
  add(kit.glass.build(`veh-${name}-glass`, scene, shared.glass, chassis));
  add(kit.light.build(`veh-${name}-lights`, scene, shared.light, chassis));
  add(kit.tail.build(`veh-${name}-tail`, scene, tailMat, chassis));
  add(kit.chrome.build(`veh-${name}-chrome`, scene, shared.chrome, chassis));
  add(kit.blue.build(`veh-${name}-blue`, scene, shared.blue, chassis));

  const wheels: WheelRig[] = [];
  const wheelParent = bp.wheelsOnChassis ? chassis : root;
  let template: Mesh | null = null;
  for (const w of bp.wheels) {
    const pivot = new TransformNode(`veh-${name}-wpivot`, scene);
    pivot.parent = wheelParent;
    pivot.position.set(w.x, w.r - (bp.wheelsOnChassis ? bp.bodyRestY : 0), w.z);
    const spin = new TransformNode(`veh-${name}-wspin`, scene);
    spin.parent = pivot;
    let mesh: Mesh;
    if (!template || template.metadata?.r !== w.r) {
      template = buildWheel(scene, w.r, w.w, shared.tire, `veh-${name}-wheel`, bp.darkRims);
      template.metadata = { r: w.r };
      mesh = template;
    } else {
      mesh = template.clone(`veh-${name}-wheel`, null) as Mesh;
    }
    mesh.parent = spin;
    meshes.push(mesh);
    wheels.push({ pivot, spin, front: w.front, radius: w.r, restY: pivot.position.y });
  }

  const { blob, blobMat } = shadowBlob(scene, id, name, root);
  meshes.push(blob);

  const rearWheels = bp.wheels.filter((w) => !w.front);
  const model: VehicleModel = {
    id,
    root,
    chassis,
    wheels,
    exhausts: bp.exhausts,
    rearContacts: rearWheels.map((w) => new Vector3(w.x, 0.15, w.z)),
    wheelsOnChassis: !!bp.wheelsOnChassis,
    bodyRestY: bp.bodyRestY,
    meshes,
    setPaint(colorId: string) {
      const p = paintById(colorId);
      paintMat.diffuseColor = C(p.hex);
      const spec = 0.25 + p.metallic * 0.7;
      paintMat.specularColor = new Color3(spec, spec, spec);
      paintMat.emissiveColor = C(p.hex).scale(0.12);
    },
    setBrakeLights(on: boolean) {
      tailMat.emissiveColor = on ? C('#ff2020') : C('#7a0505');
    },
    dispose() {
      root.dispose(false, false);
      paintMat.dispose();
      tailMat.dispose();
      blobMat.dispose();
    },
  };
  model.setPaint(paintId);
  return model;
};
