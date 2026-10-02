import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { getTrackPath, type TrackPath, type VehicleId } from '@race-rush/shared';
import type { EngineHost } from '../engine/EngineHost';
import { buildTrack, type BuiltTrack } from '../scene/TrackBuilder';
import { createVehicleModel, type VehicleModel } from '../scene/VehicleFactory';
import { loadFonts } from '../race/RaceSession';
import { prepareVehicles } from '../assets/VehicleAssets';
import { applyEnvironment } from '../assets/environment';

export interface ShowcaseCar {
  key: string;
  vehicle: VehicleId;
  color: string;
}

export type ShowcaseLayout = 'menu' | 'lobby';

/** Arc-length (m) of the showcase spot: just past the start gantry, looking back at it. */
const SPOT_S = 16;

/**
 * Menu / lobby backdrop (main menu and lobby references): the real circuit around the start line, sunny city or
 * desert, with vehicles parked on the road facing the camera. Built with the same procedural track as the race.
 */
export class ShowcaseScene {
  readonly scene: Scene;
  readonly trackId: string;
  private readonly camera: ArcRotateCamera;
  private readonly path: TrackPath;
  private track: BuiltTrack | null = null;
  private readonly cars = new Map<string, { model: VehicleModel; vehicle: VehicleId; color: string }>();
  private layout: ShowcaseLayout = 'menu';
  private time = 0;
  private shiftX = 0.12;
  private disposed = false;

  constructor(
    private readonly host: EngineHost,
    trackId: string,
  ) {
    this.trackId = trackId;
    this.path = getTrackPath(trackId);
    const scene = new Scene(host.engine);
    this.scene = scene;
    scene.skipPointerMovePicking = true;
    scene.constantlyUpdateMeshUnderPointer = false;
    const pal = this.path.def.palette;
    const desert = this.path.def.theme === 'desert';
    scene.clearColor = Color4.FromHexString(`${pal.fog}ff`);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = host.quality.fogDensity * 0.6;
    scene.fogColor = Color3.FromHexString(pal.fog);
    scene.ambientColor = new Color3(0.2, 0.22, 0.3);

    const hemi = new HemisphericLight('scHemi', new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.95;
    hemi.diffuse = Color3.FromHexString(desert ? '#fff1d8' : '#ffffff');
    hemi.groundColor = Color3.FromHexString(desert ? '#8a6038' : '#7d8798');
    const sun = new DirectionalLight('scSun', new Vector3(-0.45, -1, 0.35), scene);
    sun.intensity = 1.1;
    sun.diffuse = Color3.FromHexString(desert ? '#ffe2b0' : '#fff4e0');

    const spot = this.path.sampleAt(SPOT_S);
    // Camera ahead of the cars, looking back down the start straight (gantry + city behind them).
    const target = new Vector3(spot.x, spot.y + 1.2, spot.z);
    this.camera = new ArcRotateCamera('scCam', 0, 1.38, 13, target, scene);
    this.camera.minZ = 0.3;
    this.camera.maxZ = 1200;
    this.camera.fov = 0.78;
    // Alpha is measured from +x; place the camera along +tangent (ahead of the cars).
    this.baseAlpha = Math.atan2(spot.tz, spot.tx);
    this.camera.alpha = this.baseAlpha;

    scene.onBeforeRenderObservable.add(() => this.update());
  }

  private readonly baseAlpha: number;

  /** Builds the circuit (fonts first: canvas signs use the display fonts). */
  async build(): Promise<void> {
    await loadFonts();
    if (this.disposed) return;
    this.track = buildTrack(this.scene, this.path, this.host.quality.decorDensity * 0.8);
    applyEnvironment(this.scene, this.path.def.theme === 'desert' ? 'desert' : 'city-day');
    await prepareVehicles(this.scene, [...this.cars.values()].map((c) => c.vehicle).concat(['sport']));
    if (this.disposed) return;
    // Rebuild parked vehicles with the detailed GLB models now available.
    const list = this.order.map((key) => ({ key, vehicle: this.cars.get(key)!.vehicle, color: this.cars.get(key)!.color }));
    for (const [, car] of this.cars) car.model.dispose();
    this.cars.clear();
    this.setCars(list);
    // Start lights off-green while idling in menus.
    this.track.startLights.forEach((m) => (m.emissiveColor = Color3.FromHexString('#2bff6a')));
  }

  setLayout(layout: ShowcaseLayout, shiftX: number): void {
    this.layout = layout;
    this.shiftX = shiftX;
    this.placeCars();
  }

  /** Replaces the parked vehicles (reuses models whose vehicle and colour did not change). */
  setCars(list: ShowcaseCar[]): void {
    const keep = new Set(list.map((c) => c.key));
    for (const [key, car] of this.cars) {
      if (!keep.has(key)) {
        car.model.dispose();
        this.cars.delete(key);
      }
    }
    for (const c of list) {
      const existing = this.cars.get(c.key);
      if (existing && existing.vehicle === c.vehicle) {
        if (existing.color !== c.color) {
          existing.model.setPaint(c.color);
          existing.color = c.color;
        }
        continue;
      }
      existing?.model.dispose();
      const model = createVehicleModel(this.scene, c.vehicle, c.color, `show-${c.key}`);
      model.meshes.forEach((m) => (m.isPickable = false));
      this.cars.set(c.key, { model, vehicle: c.vehicle, color: c.color });
    }
    this.order = list.map((c) => c.key);
    this.placeCars();
  }

  private order: string[] = [];

  private placeCars(): void {
    const n = this.order.length;
    this.order.forEach((key, i) => {
      const car = this.cars.get(key);
      if (!car) return;
      let ds: number;
      let lateral: number;
      if (this.layout === 'menu') {
        // Hero in front, the others staggered behind (menu reference).
        const slots: [number, number][] = [
          [0, 0.6],
          [-6, -4.4],
          [-8, 4.6],
          [-11, 1.4],
          [-13, -1.8],
        ];
        [ds, lateral] = slots[i] ?? [-14 - i * 3, 0];
      } else {
        // Lobby: one row across the road, player order left → right as seen by the camera.
        const spacing = Math.min(3.3, 15 / Math.max(1, n));
        ds = -1.5;
        // +lateral is on the camera's left (it looks back along the track): first player on the left.
        lateral = -(i - (n - 1) / 2) * spacing;
      }
      const s = SPOT_S + ds;
      const p = this.path.pointAt(s, lateral);
      const m = car.model;
      m.root.position.set(p.x, p.y, p.z);
      m.root.rotation.y = p.heading;
    });
  }

  private update(): void {
    const dt = Math.min(0.05, this.host.engine.getDeltaTime() / 1000);
    this.time += dt;
    this.track?.update(dt, this.time);
    // Gentle camera drift + idle suspension bob.
    this.camera.alpha = this.baseAlpha + Math.sin(this.time * 0.18) * 0.08 + (this.layout === 'lobby' ? 0 : 0.18);
    for (const [, car] of this.cars) car.model.chassis.position.y = car.model.bodyRestY + Math.sin(this.time * 2 + car.model.root.position.x) * 0.01;
    this.frame();
  }

  private frame(): void {
    const w = this.host.engine.getRenderWidth();
    const h = this.host.engine.getRenderHeight();
    const aspect = w / Math.max(1, h);
    const portrait = aspect < 1;
    this.camera.fovMode = portrait ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    this.camera.fov = portrait ? 1.2 : 0.78;
    this.camera.radius = this.layout === 'lobby' ? (portrait ? 9.5 : 13.5) : portrait ? 8.5 : 9.6;
    this.camera.beta = this.layout === 'lobby' ? 1.32 : 1.43;
    const tanHalf = Math.tan(this.camera.fov / 2) * this.camera.radius;
    if (portrait) {
      const halfHeight = tanHalf / aspect;
      this.camera.targetScreenOffset.set(0, this.layout === 'lobby' ? 0.18 * halfHeight : 0.1 * halfHeight);
    } else {
      this.camera.targetScreenOffset.set(this.shiftX * 2 * tanHalf * aspect, this.layout === 'lobby' ? 0.12 * tanHalf : 0);
    }
  }

  mount(): void {
    this.host.mount(this.scene);
    this.scene.activeCamera = this.camera;
  }

  dispose(): void {
    this.disposed = true;
    for (const [, car] of this.cars) car.model.dispose();
    this.cars.clear();
    this.track?.dispose();
    this.host.unmount(this.scene);
    this.scene.dispose();
  }
}
