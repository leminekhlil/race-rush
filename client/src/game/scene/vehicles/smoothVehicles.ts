import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateRibbon } from '@babylonjs/core/Meshes/Builders/ribbonBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { paintById, type VehicleId } from '@race-rush/shared';
import type { VehicleModel, WheelRig } from '../VehicleFactory';

/**
 * Smooth PBR vehicles (Motorcycle, Buggy, Monster Truck): lofted superellipse bodies, tubular frames, lathed tyres
 * with tread lugs, coil springs and real light lenses, lit by the scene's image-based environment.
 * Parts are merged per material (≈ 6–8 draw calls per body + one mesh per wheel).
 */

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const linear = (hex: string) => Color3.FromHexString(hex).toLinearSpace();

type MatKey = 'paint' | 'trim' | 'chrome' | 'dark' | 'glass' | 'light' | 'tail' | 'rubber' | 'suit' | 'accent' | 'seat';

/* ------------------------------------------------------------------ materials */

const shared = new WeakMap<Scene, Record<string, PBRMaterial>>();

const pbr = (scene: Scene, name: string, albedo: string, metallic: number, roughness: number, extra: (m: PBRMaterial) => void = () => {}) => {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = linear(albedo);
  m.metallic = metallic;
  m.roughness = roughness;
  extra(m);
  return m;
};

const sharedMaterials = (scene: Scene) => {
  let m = shared.get(scene);
  if (m) return m;
  m = {
    trim: pbr(scene, 'svTrim', '#070809', 0.05, 0.5, (t) => (t.environmentIntensity = 0.6)),
    chrome: pbr(scene, 'svChrome', '#e8ebf0', 1, 0.14),
    dark: pbr(scene, 'svDark', '#4a4f58', 0.9, 0.28),
    glass: pbr(scene, 'svGlass', '#06080d', 0.3, 0.04, (g) => {
      g.alpha = 0.82;
      g.environmentIntensity = 1.5;
    }),
    light: pbr(scene, 'svLight', '#ffffff', 0, 0.2, (l) => {
      l.emissiveColor = new Color3(1, 0.96, 0.86);
      l.emissiveIntensity = 2.4;
    }),
    rubber: pbr(scene, 'svRubber', '#050506', 0, 0.85, (r) => (r.environmentIntensity = 0.35)),
    suit: pbr(scene, 'svSuit', '#16171c', 0.1, 0.65),
    accent: pbr(scene, 'svAccent', '#e3262f', 0.3, 0.35),
    seat: pbr(scene, 'svSeat', '#2b0f12', 0, 0.7),
  };
  shared.set(scene, m);
  return m;
};

/* ------------------------------------------------------------------ geometry helpers */

interface Section {
  z: number;
  /** Half width. */
  w: number;
  top: number;
  bottom: number;
  /** Superellipse exponent: 2 = ellipse, 4+ = rounded box. */
  n?: number;
  /** Horizontal shift of the section centre. */
  x?: number;
}

const ring = (s: Section, seg: number) => {
  const pts: Vector3[] = [];
  const e = 2 / (s.n ?? 4);
  const cy = (s.top + s.bottom) / 2;
  const hh = (s.top - s.bottom) / 2;
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    pts.push(V((s.x ?? 0) + s.w * Math.sign(c) * Math.abs(c) ** e, cy + hh * Math.sign(sn) * Math.abs(sn) ** e, s.z));
  }
  return pts;
};

/** Smooth closed body through superellipse sections (ends pinched to close the volume). */
const loft = (scene: Scene, name: string, sections: Section[], seg = 28): Mesh => {
  const first = sections[0];
  const last = sections[sections.length - 1];
  const pinch = (s: Section, dz: number): Section => ({ ...s, z: s.z + dz, w: s.w * 0.02, top: (s.top + s.bottom) / 2 + 0.005, bottom: (s.top + s.bottom) / 2 - 0.005 });
  const all = [pinch(first, 0.001), ...sections, pinch(last, -0.001)];
  return CreateRibbon(name, { pathArray: all.map((s) => ring(s, seg)), closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene);
};

const tube = (scene: Scene, name: string, path: Vector3[], radius: number, tess = 10): Mesh =>
  CreateTube(name, { path, radius, tessellation: tess, cap: Mesh.CAP_ALL }, scene);

/** Smooth arc path (for fenders, hoops). */
const arc = (cx: number, cy: number, cz: number, r: number, from: number, to: number, steps = 14, axis: 'x' | 'z' = 'x') => {
  const pts: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push(axis === 'x' ? V(cx, cy + Math.sin(a) * r, cz + Math.cos(a) * r) : V(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz));
  }
  return pts;
};

/** Coil spring along y between y0 and y1. */
const spring = (scene: Scene, name: string, x: number, z: number, y0: number, y1: number, r: number, turns: number, wire: number) => {
  const path: Vector3[] = [];
  const steps = turns * 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / 14) * Math.PI * 2;
    path.push(V(x + Math.cos(a) * r, y0 + ((y1 - y0) * i) / steps, z + Math.sin(a) * r));
  }
  return tube(scene, name, path, wire, 6);
};

/** Wide fender band arching over a wheel (two concentric arcs bridged by a ribbon). */
const fender = (scene: Scene, name: string, x: number, cy: number, cz: number, r: number, width: number, from = 0.15, to = Math.PI - 0.15) => {
  const a = arc(x - width / 2, cy, cz, r, from, to, 16);
  const b = arc(x + width / 2, cy, cz, r, from, to, 16);
  const outerA = arc(x - width / 2, cy, cz, r + 0.06, from, to, 16);
  const outerB = arc(x + width / 2, cy, cz, r + 0.06, from, to, 16);
  return CreateRibbon(name, { pathArray: [a, outerA, outerB, b, a], sideOrientation: Mesh.DOUBLESIDE }, scene);
};

const lamp = (scene: Scene, add: (k: MatKey, m: Mesh) => void, name: string, pos: Vector3, r: number, dir: 'z' | '-z' | 'y' = 'z', lens: MatKey = 'light') => {
  const body = CreateCylinder(`${name}-housing`, { diameter: r * 2.2, height: r * 0.9, tessellation: 18 }, scene);
  const glass = CreateCylinder(`${name}-lens`, { diameter: r * 1.9, height: 0.03, tessellation: 18 }, scene);
  const rot = dir === 'y' ? Matrix.Identity() : Matrix.RotationX(dir === 'z' ? Math.PI / 2 : -Math.PI / 2);
  const off = dir === 'y' ? V(0, r * 0.46, 0) : V(0, 0, dir === 'z' ? r * 0.46 : -r * 0.46);
  body.bakeTransformIntoVertices(rot.multiply(Matrix.Translation(pos.x, pos.y, pos.z)));
  glass.bakeTransformIntoVertices(rot.multiply(Matrix.Translation(pos.x + off.x, pos.y + off.y, pos.z + off.z)));
  add('chrome', body);
  add(lens, glass);
};

/* ------------------------------------------------------------------ wheels */

type WheelStyle = 'moto' | 'offroad' | 'monster';

/** Lathed tyre (rounded sidewalls) + rim with spokes; tread lugs for off-road tyres. Axis along x. */
const buildWheel = (scene: Scene, mats: Record<string, Material>, name: string, r: number, w: number, style: WheelStyle): Mesh => {
  const rubber: Mesh[] = [];
  const rim: Mesh[] = [];
  const inner = style === 'moto' ? r * 0.72 : r * 0.6;
  const shape = [
    V(inner, -w / 2, 0),
    V(r * 0.9, -w / 2, 0),
    V(r * 0.98, -w * 0.42, 0),
    V(r, -w * 0.25, 0),
    V(r, w * 0.25, 0),
    V(r * 0.98, w * 0.42, 0),
    V(r * 0.9, w / 2, 0),
    V(inner, w / 2, 0),
  ];
  rubber.push(CreateLathe(`${name}-tyre`, { shape, tessellation: style === 'moto' ? 26 : 30, sideOrientation: Mesh.DOUBLESIDE }, scene));
  if (style !== 'moto') {
    const lugs = style === 'monster' ? 22 : 18;
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      for (const side of [-1, 1]) {
        const lug = CreateBox(`${name}-lug`, { width: 0.11 * r, height: w * 0.36, depth: r * 0.17 }, scene);
        lug.bakeTransformIntoVertices(
          Matrix.Translation(r + 0.035 * r, side * w * 0.2, 0)
            .multiply(Matrix.RotationY(a + (side > 0 ? 0.12 : 0)))
            .multiply(Matrix.RotationY(0)),
        );
        rubber.push(lug);
      }
    }
  }
  // Rim: dish + hub + spokes.
  const dish = CreateCylinder(`${name}-dish`, { diameter: inner * 2.02, height: w * 0.45, tessellation: 24 }, scene);
  rim.push(dish);
  const hub = CreateCylinder(`${name}-hub`, { diameter: inner * 0.5, height: w * 0.92, tessellation: 12 }, scene);
  rim.push(hub);
  const spokes = style === 'moto' ? 3 : style === 'monster' ? 8 : 6;
  for (let i = 0; i < spokes; i++) {
    const s = CreateBox(`${name}-spoke`, { width: inner * 0.95, height: w * 0.86, depth: inner * (style === 'moto' ? 0.16 : 0.22) }, scene);
    s.bakeTransformIntoVertices(Matrix.Translation(inner * 0.5, 0, 0).multiply(Matrix.RotationY((i / spokes) * Math.PI * 2)));
    rim.push(s);
  }
  if (style === 'monster') {
    // Bead-lock ring with bolts.
    const ringM = CreateTorus(`${name}-bead`, { diameter: inner * 1.92, thickness: inner * 0.08, tessellation: 28 }, scene);
    ringM.position.y = w * 0.41;
    rim.push(ringM);
  }
  const tyre = Mesh.MergeMeshes(rubber, true, true) as Mesh;
  const wheelRim = Mesh.MergeMeshes(rim, true, true) as Mesh;
  tyre.material = mats.rubber;
  wheelRim.material = style === 'offroad' ? mats.dark : mats.chrome;
  const merged = Mesh.MergeMeshes([tyre, wheelRim], true, true, undefined, false, true) as Mesh;
  merged.name = name;
  merged.bakeTransformIntoVertices(Matrix.RotationZ(Math.PI / 2));
  merged.isPickable = false;
  return merged;
};

/* ------------------------------------------------------------------ blueprints */

interface SmoothBlueprint {
  wheels: { x: number; z: number; r: number; w: number; front: boolean; style: WheelStyle }[];
  exhausts: Vector3[];
  wheelsOnChassis?: boolean;
  shadow: [number, number];
  build(scene: Scene, add: (k: MatKey, m: Mesh) => void): void;
}

const BLUEPRINTS: Partial<Record<VehicleId, SmoothBlueprint>> = {
  /* Sport bike with a rider in black leathers (motorcycle reference). */
  moto: {
    wheelsOnChassis: true,
    shadow: [1.1, 2.6],
    wheels: [
      { x: 0, z: 0.74, r: 0.34, w: 0.15, front: true, style: 'moto' },
      { x: 0, z: -0.7, r: 0.35, w: 0.22, front: false, style: 'moto' },
    ],
    exhausts: [V(0.16, 0.5, -1.02)],
    build(scene, add) {
      // Front fairing, tank, tail.
      add(
        'paint',
        loft(scene, 'moto-fairing', [
          { z: 1.02, w: 0.05, top: 0.9, bottom: 0.82, n: 2.4 },
          { z: 0.9, w: 0.16, top: 1.02, bottom: 0.62, n: 3 },
          { z: 0.62, w: 0.23, top: 1.08, bottom: 0.48, n: 3.2 },
          { z: 0.32, w: 0.22, top: 1.0, bottom: 0.46, n: 3.4 },
          { z: 0.1, w: 0.12, top: 0.88, bottom: 0.52, n: 3 },
        ]),
      );
      add(
        'paint',
        loft(scene, 'moto-tank', [
          { z: 0.42, w: 0.12, top: 1.06, bottom: 0.86, n: 3 },
          { z: 0.25, w: 0.2, top: 1.14, bottom: 0.82, n: 3.6 },
          { z: -0.05, w: 0.18, top: 1.1, bottom: 0.8, n: 3.6 },
          { z: -0.18, w: 0.12, top: 1.0, bottom: 0.82, n: 3 },
        ]),
      );
      add(
        'paint',
        loft(scene, 'moto-tail', [
          { z: -0.28, w: 0.13, top: 0.98, bottom: 0.82, n: 3 },
          { z: -0.6, w: 0.12, top: 1.04, bottom: 0.88, n: 3 },
          { z: -0.95, w: 0.06, top: 1.08, bottom: 0.98, n: 2.6 },
        ]),
      );
      add('seat', loft(scene, 'moto-seat', [
        { z: -0.12, w: 0.13, top: 1.02, bottom: 0.92, n: 4 },
        { z: -0.5, w: 0.12, top: 1.06, bottom: 0.96, n: 4 },
      ]));
      add('glass', loft(scene, 'moto-screen', [
        { z: 0.86, w: 0.12, top: 1.12, bottom: 1.0, n: 2.2 },
        { z: 0.7, w: 0.14, top: 1.2, bottom: 1.06, n: 2.2 },
      ], 16));
      // Engine, frame, fork, swingarm, exhaust.
      const engine = CreateBox('moto-engine', { width: 0.3, height: 0.32, depth: 0.5 }, scene);
      engine.position.set(0, 0.52, 0.05);
      add('dark', engine);
      for (const x of [-0.09, 0.09]) {
        add('chrome', tube(scene, 'moto-fork', [V(x, 1.0, 0.6), V(x, 0.36, 0.75)], 0.03));
        add('dark', tube(scene, 'moto-arm', [V(x * 1.4, 0.5, -0.12), V(x * 1.1, 0.35, -0.7)], 0.035));
      }
      add('chrome', tube(scene, 'moto-exhaust', [V(0.12, 0.42, 0.2), V(0.16, 0.36, -0.2), V(0.17, 0.48, -0.7), V(0.17, 0.52, -0.98)], 0.045));
      const can = CreateCylinder('moto-can', { diameter: 0.14, height: 0.38, tessellation: 14 }, scene);
      can.rotation.x = Math.PI / 2 - 0.12;
      can.position.set(0.17, 0.5, -0.82);
      add('dark', can);
      add('trim', tube(scene, 'moto-bars', [V(-0.32, 1.06, 0.55), V(0, 1.02, 0.6), V(0.32, 1.06, 0.55)], 0.022));
      for (const x of [-0.07, 0.07]) lamp(scene, add, 'moto-head', V(x, 0.86, 0.97), 0.05);
      const tail = CreateBox('moto-taillight', { width: 0.14, height: 0.05, depth: 0.04 }, scene);
      tail.position.set(0, 1.03, -0.97);
      add('tail', tail);
      // Rider tucked behind the screen: torso, helmet with visor, arms to the bars, knees against the tank.
      add('suit', tube(scene, 'rider-torso', [V(0, 1.05, -0.36), V(0, 1.3, -0.12), V(0, 1.42, 0.1)], 0.17, 12));
      const helmet = CreateSphere('rider-helmet', { diameter: 0.34, segments: 16 }, scene);
      helmet.scaling.set(0.9, 0.9, 1.1);
      helmet.position.set(0, 1.56, 0.24);
      add('paint', helmet);
      const visor = CreateSphere('rider-visor', { diameter: 0.3, segments: 12 }, scene);
      visor.scaling.set(0.82, 0.42, 0.7);
      visor.position.set(0, 1.56, 0.36);
      add('glass', visor);
      for (const x of [-1, 1]) {
        add('suit', tube(scene, 'rider-arm', [V(x * 0.17, 1.4, 0.06), V(x * 0.27, 1.24, 0.3), V(x * 0.3, 1.08, 0.52)], 0.065, 8));
        add('suit', tube(scene, 'rider-leg', [V(x * 0.13, 1.04, -0.32), V(x * 0.25, 0.9, 0.04), V(x * 0.2, 0.56, -0.16)], 0.08, 8));
        const glove = CreateSphere('rider-glove', { diameter: 0.12, segments: 8 }, scene);
        glove.position.set(x * 0.3, 1.07, 0.54);
        add('trim', glove);
        const boot = CreateBox('rider-boot', { width: 0.11, height: 0.13, depth: 0.26 }, scene);
        boot.position.set(x * 0.2, 0.5, -0.1);
        add('trim', boot);
      }
      // Front mudguard over the wheel and belly pan.
      add('paint', fender(scene, 'moto-guard', 0, 0.34, 0.74, 0.4, 0.16, 0.5, Math.PI - 0.3));
      add('dark', loft(scene, 'moto-belly', [
        { z: 0.42, w: 0.16, top: 0.5, bottom: 0.36, n: 3 },
        { z: -0.12, w: 0.14, top: 0.5, bottom: 0.38, n: 3 },
      ], 16));
    },
  },

  /* Off-road buggy: painted body panels, black tubular roll cage, roof panel, 3 roof lamps, bull bar (buggy reference). */
  buggy: {
    shadow: [2.4, 4.4],
    wheels: [
      { x: -1.0, z: 1.3, r: 0.5, w: 0.4, front: true, style: 'offroad' },
      { x: 1.0, z: 1.3, r: 0.5, w: 0.4, front: true, style: 'offroad' },
      { x: -1.04, z: -1.15, r: 0.56, w: 0.48, front: false, style: 'offroad' },
      { x: 1.04, z: -1.15, r: 0.56, w: 0.48, front: false, style: 'offroad' },
    ],
    exhausts: [V(-0.28, 0.95, -1.95), V(0.28, 0.95, -1.95)],
    build(scene, add) {
      add('trim', loft(scene, 'buggy-floor', [
        { z: 1.85, w: 0.55, top: 0.62, bottom: 0.48, n: 6 },
        { z: -1.8, w: 0.62, top: 0.66, bottom: 0.5, n: 6 },
      ]));
      // Nose + hood.
      add('paint', loft(scene, 'buggy-nose', [
        { z: 2.08, w: 0.5, top: 0.86, bottom: 0.6, n: 4 },
        { z: 1.75, w: 0.72, top: 1.0, bottom: 0.56, n: 5 },
        { z: 1.2, w: 0.76, top: 1.06, bottom: 0.56, n: 5 },
        { z: 0.62, w: 0.72, top: 0.98, bottom: 0.56, n: 5 },
      ]));
      add('trim', loft(scene, 'buggy-hoodstripe', [
        { z: 1.95, w: 0.18, top: 0.92, bottom: 0.88, n: 6 },
        { z: 0.7, w: 0.2, top: 1.07, bottom: 1.0, n: 6 },
      ], 12));
      // Side pods and rear engine cover.
      for (const x of [-0.78, 0.78]) {
        add('paint', loft(scene, 'buggy-pod', [
          { z: 0.65, w: 0.14, top: 0.96, bottom: 0.56, x, n: 5 },
          { z: -0.55, w: 0.16, top: 0.98, bottom: 0.56, x, n: 5 },
        ], 20));
      }
      add('paint', loft(scene, 'buggy-engine', [
        { z: -0.6, w: 0.66, top: 1.08, bottom: 0.6, n: 5 },
        { z: -1.35, w: 0.7, top: 1.12, bottom: 0.6, n: 5 },
        { z: -1.95, w: 0.58, top: 0.98, bottom: 0.66, n: 4 },
      ]));
      const grille = CreateBox('buggy-grille', { width: 0.9, height: 0.2, depth: 0.05 }, scene);
      grille.position.set(0, 0.8, -1.97);
      add('dark', grille);
      // Fenders over the four wheels.
      for (const [x, z, r] of [
        [-1.0, 1.3, 0.5],
        [1.0, 1.3, 0.5],
        [-1.04, -1.15, 0.56],
        [1.04, -1.15, 0.56],
      ] as const) {
        add('paint', fender(scene, 'buggy-fender', x, r + 0.06, z, r + 0.1, 0.5));
      }
      // Seats + steering wheel.
      for (const x of [-0.34, 0.34]) {
        add('seat', loft(scene, 'buggy-seat', [
          { z: 0.05, w: 0.22, top: 0.86, bottom: 0.66, x, n: 4 },
          { z: -0.35, w: 0.22, top: 1.5, bottom: 0.66, x, n: 4 },
          { z: -0.45, w: 0.2, top: 1.45, bottom: 0.7, x, n: 4 },
        ], 16));
      }
      const wheel = CreateTorus('buggy-steer', { diameter: 0.36, thickness: 0.04, tessellation: 18 }, scene);
      wheel.rotation.x = -1.1;
      wheel.position.set(-0.34, 1.12, 0.42);
      add('trim', wheel);
      // Tubular roll cage.
      const cage: Vector3[][] = [];
      for (const x of [-0.68, 0.68]) {
        cage.push([V(x, 0.92, 0.7), V(x * 0.96, 1.8, 0.28), V(x * 0.94, 1.95, -0.1), V(x * 0.96, 1.88, -0.65), V(x, 1.0, -0.95)]);
        cage.push([V(x, 1.0, -0.95), V(x * 0.9, 1.12, -1.7)]);
        cage.push([V(x, 0.95, 0.68), V(x * 0.9, 0.88, 1.85)]);
      }
      cage.push([V(-0.65, 1.86, 0.3), V(0.65, 1.86, 0.3)]);
      cage.push([V(-0.65, 1.86, -0.66), V(0.65, 1.86, -0.66)]);
      cage.push([V(-0.66, 1.4, -0.82), V(0.66, 1.4, -0.82)]);
      cage.push([V(-0.65, 1.86, -0.66), V(0.66, 1.4, -0.82)]);
      for (const p of cage) add('trim', tube(scene, 'buggy-cage', p, 0.045));
      add('paint', loft(scene, 'buggy-roof', [
        { z: 0.32, w: 0.66, top: 1.97, bottom: 1.93, n: 8 },
        { z: -0.68, w: 0.66, top: 1.97, bottom: 1.93, n: 8 },
      ], 16));
      // Light bar: three big round lamps.
      add('trim', tube(scene, 'buggy-lightbar', [V(-0.6, 2.04, 0.3), V(0.6, 2.04, 0.3)], 0.035));
      for (const x of [-0.42, 0, 0.42]) lamp(scene, add, 'buggy-roof-lamp', V(x, 2.18, 0.34), 0.13);
      // Bull bar with round headlights.
      add('trim', tube(scene, 'buggy-bull', [V(-0.7, 0.62, 2.0), V(-0.66, 1.02, 2.06), V(0.66, 1.02, 2.06), V(0.7, 0.62, 2.0)], 0.05));
      add('trim', tube(scene, 'buggy-bull2', [V(-0.55, 0.62, 2.08), V(0.55, 0.62, 2.08)], 0.05));
      for (const x of [-0.42, 0.42]) lamp(scene, add, 'buggy-head', V(x, 0.84, 2.08), 0.12);
      // Shocks with accent springs.
      for (const [x, z] of [
        [-0.82, 1.22],
        [0.82, 1.22],
        [-0.86, -1.08],
        [0.86, -1.08],
      ] as const) {
        add('accent', spring(scene, 'buggy-spring', x, z, 0.55, 1.05, 0.07, 6, 0.018));
        add('chrome', tube(scene, 'buggy-shock', [V(x, 0.5, z), V(x, 1.1, z)], 0.025));
      }
      for (const x of [-0.28, 0.28]) {
        const pipe = CreateCylinder('buggy-exhaust', { diameter: 0.12, height: 0.25, tessellation: 12 }, scene);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 0.95, -1.9);
        add('chrome', pipe);
      }
      for (const x of [-0.5, 0.5]) {
        const t = CreateBox('buggy-tail', { width: 0.2, height: 0.12, depth: 0.04 }, scene);
        t.position.set(x, 0.9, -1.98);
        add('tail', t);
      }
    },
  },

  /* Monster truck: pickup body on a lifted chassis, giant lugged tyres with bead-locks, red coil-overs, light bar. */
  monster: {
    shadow: [3.6, 5],
    wheels: [
      { x: -1.32, z: 1.5, r: 0.95, w: 0.78, front: true, style: 'monster' },
      { x: 1.32, z: 1.5, r: 0.95, w: 0.78, front: true, style: 'monster' },
      { x: -1.32, z: -1.45, r: 0.95, w: 0.78, front: false, style: 'monster' },
      { x: 1.32, z: -1.45, r: 0.95, w: 0.78, front: false, style: 'monster' },
    ],
    exhausts: [V(-0.86, 3.02, -0.62), V(0.86, 3.02, -0.62)],
    build(scene, add) {
      // Frame, axles, coil-overs.
      for (const x of [-0.5, 0.5]) add('dark', tube(scene, 'mt-rail', [V(x, 1.05, 2.3), V(x, 1.05, -2.3)], 0.08, 8));
      for (const z of [1.5, -1.45]) add('dark', tube(scene, 'mt-axle', [V(-1.2, 0.95, z), V(1.2, 0.95, z)], 0.11, 10));
      for (const x of [-0.8, 0.8])
        for (const z of [1.5, -1.45]) {
          add('accent', spring(scene, 'mt-spring', x, z, 1.0, 1.75, 0.15, 6, 0.035));
          add('chrome', tube(scene, 'mt-shock', [V(x, 0.95, z), V(x, 1.85, z)], 0.05));
        }
      // Body: lower tub, cab, bed walls.
      add('paint', loft(scene, 'mt-body', [
        { z: 2.42, w: 0.9, top: 2.05, bottom: 1.6, n: 5 },
        { z: 2.2, w: 1.1, top: 2.22, bottom: 1.5, n: 6 },
        { z: 0.8, w: 1.12, top: 2.26, bottom: 1.5, n: 6 },
        { z: -1.6, w: 1.12, top: 2.3, bottom: 1.5, n: 6 },
        { z: -2.32, w: 1.08, top: 2.3, bottom: 1.55, n: 6 },
      ]));
      add('paint', loft(scene, 'mt-cab', [
        { z: 0.85, w: 1.04, top: 2.3, bottom: 2.1, n: 5 },
        { z: 0.55, w: 0.98, top: 3.0, bottom: 2.1, n: 5 },
        { z: -0.55, w: 0.98, top: 3.06, bottom: 2.1, n: 5 },
        { z: -0.72, w: 1.0, top: 2.9, bottom: 2.1, n: 5 },
      ]));
      add('glass', CreateRibbon('mt-windshield', {
        pathArray: [
          [V(-0.88, 2.34, 0.82), V(0.88, 2.34, 0.82)],
          [V(-0.84, 2.94, 0.5), V(0.84, 2.94, 0.5)],
        ],
        sideOrientation: Mesh.DOUBLESIDE,
      }, scene));
      for (const x of [-1, 1]) {
        add('glass', CreateRibbon('mt-sidewin', {
          pathArray: [
            [V(x * 1.0, 2.36, 0.62), V(x * 1.0, 2.36, -0.5)],
            [V(x * 0.97, 2.88, 0.42), V(x * 0.97, 2.9, -0.48)],
          ],
          sideOrientation: Mesh.DOUBLESIDE,
        }, scene));
      }
      const bed = CreateBox('mt-bed', { width: 1.9, height: 0.12, depth: 1.5 }, scene);
      bed.position.set(0, 2.32, -1.55);
      add('trim', bed);
      // Black fender flares.
      for (const x of [-1.3, 1.3]) for (const z of [1.5, -1.45]) add('trim', fender(scene, 'mt-flare', x, 0.95, z, 1.12, 0.62, 0.35, Math.PI - 0.35));
      // Chrome bumper, grille, lights.
      add('chrome', tube(scene, 'mt-bumper', [V(-1.15, 1.62, 2.45), V(-1.05, 1.62, 2.58), V(1.05, 1.62, 2.58), V(1.15, 1.62, 2.45)], 0.12, 12));
      const grille = CreateBox('mt-grille', { width: 1.2, height: 0.36, depth: 0.06 }, scene);
      grille.position.set(0, 1.95, 2.42);
      add('dark', grille);
      for (const x of [-0.8, 0.8]) lamp(scene, add, 'mt-head', V(x, 1.98, 2.36), 0.13);
      add('trim', tube(scene, 'mt-lightbar', [V(-0.85, 3.16, 0.32), V(0.85, 3.16, 0.32)], 0.05));
      for (const x of [-0.68, -0.34, 0, 0.34, 0.68]) lamp(scene, add, 'mt-roof-lamp', V(x, 3.28, 0.36), 0.11);
      for (const x of [-0.86, 0.86]) {
        add('chrome', tube(scene, 'mt-stack', [V(x, 2.2, -0.62), V(x, 3.05, -0.62)], 0.07));
        const t = CreateBox('mt-tail', { width: 0.24, height: 0.32, depth: 0.05 }, scene);
        t.position.set(x, 2.0, -2.35);
        add('tail', t);
      }
    },
  },
};

export const hasSmoothBlueprint = (id: VehicleId): boolean => !!BLUEPRINTS[id];

export const createSmoothVehicle = (scene: Scene, id: VehicleId, paintId: string, name: string): VehicleModel => {
  const bp = BLUEPRINTS[id]!;
  const mats = sharedMaterials(scene);
  const root = new TransformNode(`veh-${name}`, scene);
  const chassis = new TransformNode(`veh-${name}-chassis`, scene);
  chassis.parent = root;

  const paint = pbr(scene, `veh-${name}-paint`, '#e3262f', 0.3, 0.32, (m) => {
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 0.9;
    m.clearCoat.roughness = 0.08;
  });
  const tail = pbr(scene, `veh-${name}-tail`, '#3a0000', 0, 0.3, (m) => {
    m.emissiveColor = new Color3(0.5, 0.02, 0.02);
  });
  const matFor = (k: MatKey): Material => (k === 'paint' ? paint : k === 'tail' ? tail : mats[k]);

  const groups = new Map<MatKey, Mesh[]>();
  const add = (k: MatKey, m: Mesh) => {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  };
  bp.build(scene, add);
  const meshes: Mesh[] = [];
  for (const [k, list] of groups) {
    const merged = list.length === 1 ? list[0] : (Mesh.MergeMeshes(list, true, true) as Mesh);
    merged.name = `veh-${name}-${k}`;
    merged.material = matFor(k);
    merged.parent = chassis;
    merged.isPickable = false;
    meshes.push(merged);
  }

  const wheels: WheelRig[] = [];
  const wheelParent = bp.wheelsOnChassis ? chassis : root;
  const templates = new Map<string, Mesh>();
  for (const w of bp.wheels) {
    const pivot = new TransformNode(`veh-${name}-wpivot`, scene);
    pivot.parent = wheelParent;
    pivot.position.set(w.x, w.r, w.z);
    const spin = new TransformNode(`veh-${name}-wspin`, scene);
    spin.parent = pivot;
    const key = `${w.r}:${w.w}:${w.style}`;
    let mesh = templates.get(key);
    if (!mesh) {
      mesh = buildWheel(scene, mats, `veh-${name}-wheel`, w.r, w.w, w.style);
      templates.set(key, mesh);
    } else {
      mesh = mesh.clone(`veh-${name}-wheel`, null) as Mesh;
    }
    if (w.x < 0) mesh.scaling.x = -1;
    mesh.parent = spin;
    meshes.push(mesh);
    wheels.push({ pivot, spin, front: w.front, radius: w.r, restY: pivot.position.y });
  }

  // Soft contact shadow.
  const blob = CreateSphere(`veh-${name}-shadow`, { diameter: 1, segments: 6 }, scene);
  blob.scaling.set(bp.shadow[0], 0.02, bp.shadow[1]);
  blob.position.y = 0.04;
  const blobMat = new StandardMaterial(`veh-${name}-shadowMat`, scene);
  blobMat.diffuseColor = Color3.Black();
  blobMat.specularColor = Color3.Black();
  blobMat.disableLighting = true;
  blobMat.alpha = 0.45;
  blob.material = blobMat;
  blob.parent = root;
  blob.isPickable = false;
  meshes.push(blob);

  const model: VehicleModel = {
    id,
    root,
    chassis,
    wheels,
    exhausts: bp.exhausts,
    rearContacts: bp.wheels.filter((w) => !w.front).map((w) => V(w.x, 0.15, w.z)),
    wheelsOnChassis: !!bp.wheelsOnChassis,
    bodyRestY: 0,
    meshes,
    setPaint(colorId) {
      const p = paintById(colorId);
      paint.albedoColor = linear(p.hex);
      paint.metallic = 0.1 + p.metallic * 0.5;
      paint.roughness = 0.36 - p.metallic * 0.14;
    },
    setBrakeLights(on) {
      tail.emissiveColor = on ? new Color3(1, 0.06, 0.04) : new Color3(0.5, 0.02, 0.02);
      tail.emissiveIntensity = on ? 2.5 : 1;
    },
    dispose() {
      root.dispose(false, false);
      paint.dispose();
      tail.dispose();
      blobMat.dispose();
    },
  };
  model.setPaint(paintId);
  return model;
};
