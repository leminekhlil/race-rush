import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { VehicleId } from '@race-rush/shared';
import type { EngineHost } from '../engine/EngineHost';
import { createVehicleModel, type VehicleModel } from '../scene/VehicleFactory';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { setupPostFx } from '../render/postFx';
import { buildWorkshop } from './workshop';
import { hasGlb, prepareVehicles, readyContainer } from '../assets/VehicleAssets';
import { applyEnvironment } from '../assets/environment';

/**
 * Showroom: vehicle on a rotating turntable, studio lights, user orbit (drag / pinch / wheel).
 * The same scene is the animated backdrop of the home screen (`interactive = false`).
 */
export class GarageScene {
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private model: VehicleModel | null = null;
  private readonly turntable: TransformNode;
  private vehicleId: VehicleId | null = null;
  private idle = 0;
  private time = 0;
  private interactive = false;
  private targetRadius = 9;
  /** Interactive framing: where the vehicle sits on screen (fractions of width / height) and a zoom-out factor. */
  private frameX = -0.16;
  private frameY = 0;
  private zoom = 1;

  constructor(private readonly host: EngineHost) {
    const scene = new Scene(host.engine);
    this.scene = scene;
    scene.clearColor = Color4.FromHexString('#141c33ff');
    scene.skipPointerMovePicking = true;
    scene.ambientColor = new Color3(0.25, 0.28, 0.4);

    this.camera = new ArcRotateCamera('garageCam', -Math.PI / 2.6, 1.32, 9, new Vector3(0, 1.25, 0), scene);
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 12.5;
    this.camera.lowerBetaLimit = 0.55;
    this.camera.upperBetaLimit = 1.48;
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.pinchDeltaPercentage = 0.004;
    this.camera.panningSensibility = 0;
    this.camera.minZ = 0.1;
    this.camera.fov = 0.8;

    const hemi = new HemisphericLight('gHemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.75;
    hemi.diffuse = Color3.FromHexString('#fff4e0');
    hemi.groundColor = Color3.FromHexString('#1a2440');
    const key = new DirectionalLight('gKey', new Vector3(-0.4, -1, 0.6), scene);
    key.intensity = 0.85;
    const blue = new PointLight('gBlue', new Vector3(-5, 3, -4), scene);
    blue.diffuse = Color3.FromHexString('#4d8dff');
    blue.intensity = 0.9;
    const warm = new PointLight('gWarm', new Vector3(5, 3.5, 3), scene);
    warm.diffuse = Color3.FromHexString('#ffb84d');
    warm.intensity = 0.7;

    // Arcade workshop (garage reference); the turntable top carries the vehicle.
    this.turntable = buildWorkshop(scene);
    applyEnvironment(scene, 'studio', 1);
    this.setupShowroom(key);
    // Start on a 3/4 front view (vehicles face +z, the camera looks from -z).
    this.turntable.rotation.y = Math.PI - 0.75;

    scene.onBeforeRenderObservable.add(() => this.update());
    this.camera.onViewMatrixChangedObservable.add(() => {
      // Any user interaction pauses the auto-rotation for a few seconds.
    });
    scene.onPointerObservable.add(() => {
      this.idle = 0;
    });
  }

  private shadow: ShadowGenerator | null = null;
  private mirror: MirrorTexture | null = null;

  /** Showroom polish: soft shadows on the turntable, planar reflection, glow on neons, tone-mapped post FX. */
  private setupShowroom(key: DirectionalLight): void {
    const q = this.host.quality;
    const top = this.turntable as Mesh;
    key.position = new Vector3(6, 14, -8);
    key.intensity = 1.25;
    if (q.name !== 'eco') {
      const sg = new ShadowGenerator(1024, key);
      sg.useBlurExponentialShadowMap = true;
      sg.blurKernel = 24;
      sg.depthScale = 60;
      sg.setDarkness(0.35);
      this.shadow = sg;
      top.receiveShadows = true;
    }
    if (q.reflections) {
      const mirror = new MirrorTexture('turntableMirror', { ratio: q.name === 'high' ? 0.5 : 0.35 }, this.scene, true);
      mirror.mirrorPlane = new Plane(0, -1, 0, 0.53);
      mirror.adaptiveBlurKernel = 24;
      mirror.level = 0.32;
      mirror.renderList = [];
      const mat = top.material as StandardMaterial;
      mat.reflectionTexture = mirror;
      this.mirror = mirror;
    }
    if (q.glow) {
      const glow = new GlowLayer('garageGlow', this.scene, { mainTextureRatio: 0.4, blurKernelSize: 32 });
      glow.intensity = 0.7;
    }
    setupPostFx(this.scene, this.camera, q, { exposure: 1.05, contrast: 1.2, bloomThreshold: 0.75, vignette: 2.2 });
  }

  private registerCasters(model: VehicleModel): void {
    for (const m of model.meshes) {
      if (m.name.endsWith('-shadow')) {
        // The real shadow replaces the fake contact blob when available.
        if (this.shadow) m.setEnabled(false);
        continue;
      }
      this.shadow?.addShadowCaster(m, true);
      this.mirror?.renderList?.push(m);
    }
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    const canvas = this.host.canvas;
    if (on) this.camera.attachControl(canvas, true);
    else this.camera.detachControl();
    this.targetRadius = on ? this.baseRadius() * this.zoom : 10.5;
    this.camera.target.set(0, on ? 1.25 : 1.75, 0);
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
    if (this.camera.viewport.height !== 1 && !(portrait && this.interactive)) this.camera.viewport = new Viewport(0, 0, 1, 1);
    // Portrait: keep the whole vehicle in frame horizontally.
    this.camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    this.camera.fov = portrait ? 1.1 : 0.8;
    const tanHalf = Math.tan(this.camera.fov / 2) * this.camera.radius;
    if (portrait) {
      if (this.interactive) {
        // Garage portrait: render the showroom only in the free band between the nav and the panels.
        const band = { top: 0.07, height: 0.25 };
        this.camera.viewport = new Viewport(0, 1 - band.top - band.height, 1, band.height);
        const vAspect = w / Math.max(1, h * band.height);
        this.camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
        this.camera.fov = vAspect > 1.4 ? 0.95 : 1.15;
        this.camera.targetScreenOffset.set(0, 0);
        return;
      }
      // View-space translation: +y lifts the vehicle above the menu panels.
      const halfHeight = tanHalf / aspect;
      this.camera.targetScreenOffset.set(0, 0.12 * halfHeight);
    } else {
      // Landscape: garage → vehicle left of the details panel; home → right of the menu column.
      const halfWidth = tanHalf * aspect;
      const shiftX = aspect > 1.3 ? (this.interactive ? this.frameX : 0.12) : 0;
      const shiftY = this.interactive ? this.frameY : 0;
      this.camera.targetScreenOffset.set(shiftX * 2 * halfWidth, shiftY * 2 * tanHalf);
    }
  }

  private color = 'red';

  setVehicle(id: VehicleId, color: string): void {
    this.color = color;
    if (this.vehicleId === id && this.model) {
      this.model.setPaint(color);
      return;
    }
    // GLB vehicles: load first, then rebuild with the detailed model (procedural stand-in meanwhile).
    if (hasGlb(id) && !readyContainer(this.scene, id)) {
      void prepareVehicles(this.scene, [id]).then(() => {
        if (this.vehicleId === id && !this.scene.isDisposed) {
          this.vehicleId = null;
          this.setVehicle(id, this.color);
        }
      });
    }
    this.model?.dispose();
    this.vehicleId = id;
    this.model = createVehicleModel(this.scene, id, color, `garage-${id}`);
    this.model.root.parent = this.turntable;
    this.registerCasters(this.model);
    this.model.root.position.y = 0.04;
    // Pop-in.
    this.model.root.scaling.setAll(0.6);
    this.idle = 0;
    this.targetRadius = this.baseRadius() * (this.interactive ? this.zoom : 1);
  }

  private baseRadius(): number {
    return this.vehicleId === 'monster' ? 11.5 : this.vehicleId === 'moto' ? 7 : 9;
  }

  /** Places the vehicle in the free screen area left by the menu panels (x: + = right, y: + = up). */
  setFraming(x: number, y: number, zoom = 1): void {
    this.frameX = x;
    this.frameY = y;
    this.zoom = zoom;
    if (this.interactive) this.targetRadius = this.baseRadius() * zoom;
    this.frame();
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
