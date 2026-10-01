import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { VehicleId } from '@race-rush/shared';
import type { EngineHost } from '../engine/EngineHost';
import { createVehicleModel, type VehicleModel } from '../scene/VehicleFactory';
import { checkerTexture } from '../scene/textures';

/**
 * Showroom: vehicle on a rotating turntable, studio lights, user orbit (drag / pinch / wheel).
 * The same scene is the animated backdrop of the home screen (`interactive = false`).
 */
export class GarageScene {
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private model: VehicleModel | null = null;
  private turntable: TransformNode;
  private vehicleId: VehicleId | null = null;
  private idle = 0;
  private time = 0;
  private interactive = false;
  private targetRadius = 9;

  constructor(private readonly host: EngineHost) {
    const scene = new Scene(host.engine);
    this.scene = scene;
    scene.clearColor = Color4.FromHexString('#081230ff');
    scene.skipPointerMovePicking = true;
    scene.ambientColor = new Color3(0.25, 0.28, 0.4);

    this.camera = new ArcRotateCamera('garageCam', -Math.PI / 2.6, 1.22, 9, new Vector3(0, 0.9, 0), scene);
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 15;
    this.camera.lowerBetaLimit = 0.55;
    this.camera.upperBetaLimit = 1.48;
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.pinchDeltaPercentage = 0.004;
    this.camera.panningSensibility = 0;
    this.camera.minZ = 0.1;
    this.camera.fov = 0.8;

    const hemi = new HemisphericLight('gHemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = Color3.FromHexString('#0b1636');
    const key = new DirectionalLight('gKey', new Vector3(-0.6, -1, 0.5), scene);
    key.intensity = 0.9;
    const blue = new PointLight('gBlue', new Vector3(-5, 3, -4), scene);
    blue.diffuse = Color3.FromHexString('#1f6bff');
    blue.intensity = 1.1;
    const gold = new PointLight('gGold', new Vector3(5, 2.5, 4), scene);
    gold.diffuse = Color3.FromHexString('#ffc61a');
    gold.intensity = 0.8;

    // Studio floor + glowing turntable ring.
    const floor = CreateGround('gFloor', { width: 60, height: 60 }, scene);
    const fm = new StandardMaterial('gFloorMat', scene);
    fm.diffuseColor = Color3.FromHexString('#0b1636');
    fm.specularColor = new Color3(0.25, 0.3, 0.5);
    fm.specularPower = 32;
    floor.material = fm;
    const table = CreateCylinder('gTable', { diameter: 7.4, height: 0.16, tessellation: 64 }, scene);
    table.position.y = 0.08;
    const tm = new StandardMaterial('gTableMat', scene);
    tm.diffuseColor = Color3.FromHexString('#13265e');
    tm.specularColor = new Color3(0.5, 0.5, 0.6);
    table.material = tm;
    const ring = CreateTorus('gRing', { diameter: 7.5, thickness: 0.08, tessellation: 64 }, scene);
    ring.position.y = 0.17;
    const rm = new StandardMaterial('gRingMat', scene);
    rm.disableLighting = true;
    rm.emissiveColor = Color3.FromHexString('#19e3ff');
    ring.material = rm;
    this.turntable = table;

    // Back wall with checkered stripe + light bars (arcade garage vibe).
    const wall = CreateBox('gWall', { width: 30, height: 10, depth: 0.4 }, scene);
    wall.position.set(0, 5, 9);
    const wm = new StandardMaterial('gWallMat', scene);
    wm.diffuseColor = Color3.FromHexString('#0d1b45');
    wm.specularColor = Color3.Black();
    wall.material = wm;
    const stripe = CreateBox('gStripe', { width: 30, height: 0.8, depth: 0.1 }, scene);
    stripe.position.set(0, 3.2, 8.75);
    const sm = new StandardMaterial('gStripeMat', scene);
    const checker = checkerTexture(scene, 4);
    checker.uScale = 18;
    sm.diffuseTexture = checker;
    sm.specularColor = Color3.Black();
    stripe.material = sm;
    for (let i = -2; i <= 2; i++) {
      const bar = CreateBox(`gBar${i}`, { width: 3.2, height: 0.12, depth: 0.12 }, scene);
      bar.position.set(i * 5.5, 7.4, 8.7);
      const bm = new StandardMaterial(`gBarMat${i}`, scene);
      bm.disableLighting = true;
      bm.emissiveColor = i % 2 ? Color3.FromHexString('#ffc61a') : Color3.FromHexString('#4d8dff');
      bar.material = bm;
    }
    for (const m of scene.meshes) m.isPickable = false;

    scene.onBeforeRenderObservable.add(() => this.update());
    this.camera.onViewMatrixChangedObservable.add(() => {
      // Any user interaction pauses the auto-rotation for a few seconds.
    });
    scene.onPointerObservable.add(() => {
      this.idle = 0;
    });
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    const canvas = this.host.canvas;
    if (on) this.camera.attachControl(canvas, true);
    else this.camera.detachControl();
    this.targetRadius = on ? 9 : 10.5;
    this.camera.target.set(0, on ? 0.9 : 1.4, 0);
    this.frame();
  }

  /**
   * Keeps the vehicle centred in the free area between the garage panels (landscape phones),
   * or slightly right of the home menu column.
   */
  private frame(): void {
    const w = this.host.engine.getRenderWidth();
    const h = this.host.engine.getRenderHeight();
    const aspect = w / Math.max(1, h);
    const portrait = aspect < 1;
    // Portrait: keep the whole vehicle in frame horizontally.
    this.camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    this.camera.fov = portrait ? 1.1 : 0.8;
    const tanHalf = Math.tan(this.camera.fov / 2) * this.camera.radius;
    if (portrait) {
      // View-space translation: +y lifts the vehicle into the upper free area above the panels.
      const halfHeight = tanHalf / aspect;
      this.camera.targetScreenOffset.set(0, this.interactive ? 0.32 * halfHeight : 0.12 * halfHeight);
    } else {
      // Landscape: garage → vehicle left of the details panel; home → right of the menu column.
      const halfWidth = tanHalf * aspect;
      const shift = aspect > 1.3 ? (this.interactive ? -0.16 : 0.12) : 0;
      this.camera.targetScreenOffset.set(shift * 2 * halfWidth, 0);
    }
  }

  setVehicle(id: VehicleId, color: string): void {
    if (this.vehicleId === id && this.model) {
      this.model.setPaint(color);
      return;
    }
    this.model?.dispose();
    this.vehicleId = id;
    this.model = createVehicleModel(this.scene, id, color, `garage-${id}`);
    this.model.root.parent = this.turntable;
    this.model.root.position.y = 0.08;
    // Pop-in.
    this.model.root.scaling.setAll(0.6);
    this.idle = 0;
    this.targetRadius = id === 'monster' ? 11.5 : id === 'moto' ? 7 : 9;
  }

  setColor(color: string): void {
    this.model?.setPaint(color);
  }

  private update(): void {
    const dt = Math.min(0.05, this.host.engine.getDeltaTime() / 1000);
    this.time += dt;
    this.idle += dt;
    const spin = this.interactive ? (this.idle > 3 ? 0.25 : 0) : 0.35;
    this.turntable.rotation.y += spin * dt;
    if (this.model) {
      const s = this.model.root.scaling.x;
      if (s < 1) this.model.root.scaling.setAll(Math.min(1, s + dt * 2.5));
      // Idle "breathing" suspension.
      this.model.chassis.position.y = this.model.bodyRestY + Math.sin(this.time * 2) * 0.012;
      for (const w of this.model.wheels) w.spin.rotation.x = 0;
    }
    if (!this.interactive || this.idle > 3) this.camera.radius += (this.targetRadius - this.camera.radius) * Math.min(1, dt * 2);
    this.frame();
  }

  mount(): void {
    this.host.mount(this.scene);
    this.scene.activeCamera = this.camera;
  }

  dispose(): void {
    this.camera.detachControl();
    this.host.unmount(this.scene);
    this.scene.dispose();
  }
}

let shared: GarageScene | null = null;

/** The showroom is kept alive between home and garage screens (no reload flash). */
export const getGarageScene = (host: EngineHost): GarageScene => {
  if (!shared || shared.scene.isDisposed) shared = new GarageScene(host);
  return shared;
};

export const releaseGarageScene = (): void => {
  shared?.dispose();
  shared = null;
};
