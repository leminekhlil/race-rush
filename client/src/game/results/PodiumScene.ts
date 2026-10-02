import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { VehicleId } from '@race-rush/shared';
import type { EngineHost } from '../engine/EngineHost';
import { createVehicleModel, type VehicleModel } from '../scene/VehicleFactory';
import { prepareVehicles } from '../assets/VehicleAssets';
import { applyEnvironment } from '../assets/environment';
import { crownBannerTexture } from '../scene/textures';
import { cityViewTexture } from '../garage/workshopTextures';
import { confettiTexture, namePlateTexture, podiumFaceTexture, PODIUM_COLORS } from './podiumTextures';

export interface PodiumEntry {
  vehicle: VehicleId;
  color: string;
  name: string;
  time: string;
  local: boolean;
}

/** Block layout, left to right as seen by the camera: 2nd, 1st, 3rd. */
const BLOCKS: { place: 1 | 2 | 3; x: number; h: number; w: number }[] = [
  { place: 2, x: -5, h: 1.15, w: 4.4 },
  { place: 1, x: 0, h: 1.75, w: 4.8 },
  { place: 3, x: 5, h: 0.85, w: 4.4 },
];
const DEPTH = 3.6;
const CONFETTI = ['#ffd03d', '#ff4fa3', '#19e3ff', '#2ee87a', '#8a3dff', '#ff7a1a'];

/**
 * End-of-race podium (results reference): top-3 vehicles on gold / silver / bronze blocks in the sunny city,
 * name plates with times, crown for the winner and confetti. Camera sways gently; no user input.
 */
export class PodiumScene {
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly models: VehicleModel[] = [];
  private time = 0;

  constructor(
    private readonly host: EngineHost,
    entries: PodiumEntry[],
    lowQuality: boolean,
  ) {
    const scene = new Scene(host.engine);
    this.scene = scene;
    scene.clearColor = Color4.FromHexString('#4f9ff0ff');
    scene.skipPointerMovePicking = true;
    scene.ambientColor = new Color3(0.35, 0.38, 0.45);

    this.camera = new ArcRotateCamera('podiumCam', -Math.PI / 2, 1.42, 17.5, new Vector3(0, 2.4, 0), scene);
    this.camera.fov = 0.72;
    this.camera.minZ = 0.2;

    const hemi = new HemisphericLight('pHemi', new Vector3(0, 1, -0.2), scene);
    hemi.intensity = 0.95;
    hemi.groundColor = Color3.FromHexString('#6d7584');
    const sun = new DirectionalLight('pSun', new Vector3(-0.35, -1, 0.55), scene);
    sun.intensity = 1.05;
    sun.diffuse = Color3.FromHexString('#fff4e0');

    this.buildSet();
    this.buildPodium(entries);
    applyEnvironment(scene, 'city-day', 1);
    // Swap in the detailed GLB vehicles once loaded.
    void prepareVehicles(scene, entries.map((e) => e.vehicle)).then(() => {
      if (scene.isDisposed) return;
      for (const m of this.models) m.dispose();
      this.models.length = 0;
      for (const n of scene.meshes.filter((m) => m.name.startsWith('pPlate'))) n.dispose();
      this.buildPodium(entries, true);
    });
    this.buildConfetti(lowQuality);

    for (const m of scene.meshes) m.isPickable = false;
    scene.onBeforeRenderObservable.add(() => this.update());
  }

  private mat(name: string, color: string, tex?: Texture, emissive = false): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(0.12, 0.12, 0.14);
    if (tex) m.diffuseTexture = tex;
    if (emissive) {
      m.disableLighting = true;
      m.emissiveColor = Color3.White();
      if (tex) m.emissiveTexture = tex;
    }
    return m;
  }

  /** Street set: asphalt, curb, red/white barrier, city backdrop and banners. */
  private buildSet(): void {
    const s = this.scene;
    const ground = CreateGround('pGround', { width: 90, height: 60 }, s);
    ground.position.z = 10;
    ground.material = this.mat('pGroundMat', '#4b515d');
    const line = CreateGround('pLine', { width: 90, height: 0.5 }, s);
    line.position.set(0, 0.01, -3.4);
    line.material = this.mat('pLineMat', '#f2f2f2');

    const backdrop = CreatePlane('pCity', { width: 76, height: 38 }, s);
    backdrop.position.set(0, 15.5, 26);
    backdrop.material = this.mat('pCityMat', '#ffffff', cityViewTexture(s), true);

    const barrier = CreateBox('pBarrier', { width: 70, height: 1.1, depth: 0.6 }, s);
    barrier.position.set(0, 0.55, 9);
    barrier.material = this.mat('pBarrierMat', '#e23b3b');
    const white = this.mat('pBarrierWhite', '#f7f7f7');
    for (let i = -17; i <= 17; i += 2) {
      const block = CreateBox(`pB${i}`, { width: 2, height: 1.12, depth: 0.64 }, s);
      block.position.set(i * 2, 0.55, 9);
      block.material = white;
    }

    const crownTex = crownBannerTexture(s);
    for (const x of [-15, -9.5, 9.5, 15]) {
      const pole = CreateBox(`pPole${x}`, { width: 0.18, height: 7, depth: 0.18 }, s);
      pole.position.set(x, 3.5, 10.5);
      pole.material = this.mat(`pPoleMat${x}`, '#d5d9e2');
      const flag = CreatePlane(`pFlag${x}`, { width: 1.6, height: 3.2 }, s);
      flag.position.set(x + 0.9, 5, 10.4);
      flag.material = this.mat(`pFlagMat${x}`, '#ffffff', crownTex, true);
    }
  }

  private buildPodium(entries: PodiumEntry[], vehiclesOnly = false): void {
    const s = this.scene;
    const body = this.mat('pBody', '#252b3b');
    for (const b of BLOCKS) {
      const c = PODIUM_COLORS[b.place - 1];
      if (!vehiclesOnly) this.buildBlock(b, c, body);
      const e = entries[b.place - 1];
      if (!e) continue;
      this.placeVehicle(b, e);
    }
  }

  private buildBlock(b: (typeof BLOCKS)[number], c: (typeof PODIUM_COLORS)[number], body: StandardMaterial): void {
    const s = this.scene;
    {
      const block = CreateBox(`pBlock${b.place}`, { width: b.w, height: b.h, depth: DEPTH }, s);
      block.position.set(b.x, b.h / 2, 0);
      block.material = body;
      const top = CreateBox(`pTop${b.place}`, { width: b.w + 0.1, height: 0.12, depth: DEPTH + 0.1 }, s);
      top.position.set(b.x, b.h + 0.06, 0);
      const tm = this.mat(`pTopMat${b.place}`, c.mid);
      tm.specularColor = new Color3(0.6, 0.6, 0.6);
      top.material = tm;
      const face = CreatePlane(`pFace${b.place}`, { width: b.w, height: b.h }, s);
      face.position.set(b.x, b.h / 2, -DEPTH / 2 - 0.01);
      face.material = this.mat(`pFaceMat${b.place}`, '#ffffff', podiumFaceTexture(s, b.place), true);
    }
  }

  private placeVehicle(b: (typeof BLOCKS)[number], e: PodiumEntry): void {
    const s = this.scene;
    {
      const model = createVehicleModel(s, e.vehicle, e.color, `podium-${b.place}`);
      model.meshes.filter((m) => m.name.endsWith('-shadow')).forEach((m) => m.setEnabled(false));
      model.root.position.set(b.x, b.h + 0.12, 0.2);
      // Vehicles face +z: turn them towards the camera with a slight 3/4 angle.
      model.root.rotation.y = Math.PI + (b.x < 0 ? -0.45 : b.x > 0 ? 0.45 : -0.25);
      this.models.push(model);

      const plateH = e.vehicle === 'monster' ? 4.4 : e.vehicle === 'buggy' ? 3.4 : 3.0;
      const plate = CreatePlane(`pPlate${b.place}`, { width: 3.4, height: 1.38 }, s);
      plate.position.set(b.x, b.h + plateH, -0.4);
      const pm = this.mat(`pPlateMat${b.place}`, '#ffffff', namePlateTexture(s, b.place, e.name, e.time, e.local), true);
      pm.diffuseTexture!.hasAlpha = true;
      pm.useAlphaFromDiffuseTexture = true;
      plate.material = pm;
    }
  }

  private buildConfetti(lowQuality: boolean): void {
    const tex = confettiTexture(this.scene);
    const per = lowQuality ? 18 : 40;
    for (const [i, hex] of CONFETTI.entries()) {
      const ps = new ParticleSystem(`confetti${i}`, per * 6, this.scene);
      ps.particleTexture = tex;
      ps.emitter = new Vector3(0, 13, 1);
      ps.minEmitBox.set(-14, 0, -4);
      ps.maxEmitBox.set(14, 2, 4);
      const c = Color4.FromHexString(`${hex}ff`);
      ps.color1 = c;
      ps.color2 = new Color4(c.r * 0.8, c.g * 0.8, c.b * 0.8, 1);
      ps.colorDead = new Color4(c.r, c.g, c.b, 0.6);
      ps.minSize = 0.14;
      ps.maxSize = 0.26;
      ps.minScaleY = 0.5;
      ps.maxScaleY = 0.9;
      ps.minLifeTime = 5;
      ps.maxLifeTime = 7;
      ps.minEmitPower = 0.3;
      ps.maxEmitPower = 1.2;
      ps.direction1.set(-1, -0.4, -1);
      ps.direction2.set(1, 0.1, 1);
      ps.gravity.set(0, -1.6, 0);
      ps.minAngularSpeed = -4;
      ps.maxAngularSpeed = 4;
      ps.emitRate = per;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.preWarmCycles = 60;
      ps.preWarmStepOffset = 5;
      ps.start();
    }
  }

  private update(): void {
    const dt = Math.min(0.05, this.host.engine.getDeltaTime() / 1000);
    this.time += dt;
    this.camera.alpha = -Math.PI / 2 + Math.sin(this.time * 0.25) * 0.1;
    this.frame();
    // Winner bounces gently on its suspension.
    const winner = this.models[1] ?? this.models[0];
    if (winner) winner.chassis.position.y = winner.bodyRestY + Math.abs(Math.sin(this.time * 2.4)) * 0.05;
  }

  /** Keeps the podium in the free area left of the results panel (landscape) or above it (portrait). */
  private frame(): void {
    const w = this.host.engine.getRenderWidth();
    const h = this.host.engine.getRenderHeight();
    const aspect = w / Math.max(1, h);
    if (aspect >= 1) {
      if (this.camera.viewport.height !== 1) this.camera.viewport = new Viewport(0, 0, 1, 1);
      this.camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
      this.camera.fov = 0.72;
      this.camera.radius = aspect > 1.6 ? 16.5 : 19;
      const tanHalf = Math.tan(this.camera.fov / 2) * this.camera.radius;
      this.camera.targetScreenOffset.set(-0.2 * 2 * tanHalf * aspect, 0.06 * tanHalf);
    } else {
      // Portrait: render the podium in the band between the title and the ranking panel.
      const band = { top: 0.11, height: 0.27 };
      this.camera.viewport = new Viewport(0, 1 - band.top - band.height, 1, band.height);
      this.camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
      this.camera.fov = 1.05;
      this.camera.radius = 17;
      this.camera.targetScreenOffset.set(0, 0);
    }
  }

  mount(): void {
    this.host.mount(this.scene);
    this.scene.activeCamera = this.camera;
  }

  dispose(): void {
    this.host.unmount(this.scene);
    this.scene.dispose();
  }
}
