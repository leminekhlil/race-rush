import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { setupPostFx } from '../render/postFx';
import { setupAtmosphere } from '../render/atmosphere';
import { Announcer } from '../audio/Announcer';
import { MusicPlayer } from '../audio/MusicPlayer';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import {
  ArcadeVehicle,
  AutoPilot,
  botPace,
  botSkill,
  clamp,
  FLAG_AIR,
  FLAG_BOOST,
  FLAG_BRAKE,
  FLAG_DRIFT,
  getTrackPath,
  gridSlot,
  LapTracker,
  lerp,
  NET_INTERP_DELAY,
  NET_SEND_HZ,
  paintById,
  rankRacers,
  tunedVehicle,
  VEHICLES,
  wrapAngle,
  type GridEntry,
  type Obstacle,
  type RacerStateDTO,
  type ResultDTO,
  type StandingDTO,
  type TrackPath,
  type VehicleInput,
} from '@race-rush/shared';
import type { EngineHost } from '../engine/EngineHost';
import { buildTrack, type BuiltTrack } from '../scene/TrackBuilder';
import { createVehicleModel, type VehicleModel } from '../scene/VehicleFactory';
import { prepareVehicles } from '../assets/VehicleAssets';
import { nameTagTexture } from '../scene/textures';
import { DynamicRaceCamera } from '../camera/DynamicRaceCamera';
import { InputManager } from '../input/InputManager';
import { Effects, type VehicleEmitters } from '../effects/Effects';
import { AudioEngine, haptic, VehicleAudio } from '../audio/AudioEngine';
import { VehicleView } from './VehicleView';
import { createPhysicsProps, type PropsHandle } from '../physics/PhysicsProps';
import { hudStore, initialHud, type RacePhase, type StandingRow } from './hud';

const STEP = 1 / 60;

export interface RaceNetAdapter {
  serverNow(): number;
  sendState(s: { x: number; y: number; z: number; h: number; v: number; f: number }): void;
  sendRespawn(): void;
  sendLoaded(): void;
}

export interface RaceConfig {
  raceId: string;
  trackId: string;
  laps: number;
  grid: GridEntry[];
  localId: string;
  mode: 'offline' | 'online';
  autopilot?: boolean;
}

export interface RaceCallbacks {
  onResults(results: ResultDTO[], rewards: 'granted' | 'unavailable' | 'none'): void;
}

interface SimRacer {
  info: GridEntry;
  vehicle: ArcadeVehicle;
  tracker: LapTracker;
  pilot: AutoPilot | null;
  model: VehicleModel;
  view: VehicleView;
  emitters: VehicleEmitters;
  audio: VehicleAudio | null;
  prev: { x: number; y: number; z: number; h: number };
  finishedAt: number | null;
}

interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  h: number;
  v: number;
  f: number;
}

interface RemoteRacer {
  info: GridEntry;
  model: VehicleModel;
  view: VehicleView;
  emitters: VehicleEmitters;
  audio: VehicleAudio | null;
  tag: Mesh;
  buffer: Snap[];
  pose: { x: number; y: number; z: number; h: number; v: number; f: number; vx: number; vz: number; steer: number; spin: number };
  standing: StandingDTO | null;
}

/**
 * One race: scene, simulation, racers, HUD publishing. Works offline (local bots) and online
 * (remote racers from server snapshots, server-authoritative standings and results).
 */
export class RaceSession {
  readonly scene: Scene;
  readonly path: TrackPath;
  readonly input = new InputManager();
  private camera!: DynamicRaceCamera;
  private track!: BuiltTrack;
  private effects!: Effects;
  private local!: SimRacer;
  private bots: SimRacer[] = [];
  private remotes = new Map<string, RemoteRacer>();
  private shadow: ShadowGenerator | null = null;
  private sun!: DirectionalLight;
  private night = false;
  private lastPosition = 99;
  private post: import('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline').DefaultRenderingPipeline | null = null;
  private aberration = 0;
  private phase: RacePhase = 'loading';
  private acc = 0;
  private raceTime = 0;
  private envTime = 0;
  private countdownEnd = 0; // performance.now() ms when GO happens
  private lastCountdownShown: number | 'GO' | null = null;
  private hudTimer = 0;
  private sendTimer = 0;
  private seq = 0;
  private finishWait = 0;
  private resultsSent = false;
  private paused = false;
  private toastId = 0;
  private obstacles: Obstacle[] = [];
  private serverStandings: StandingDTO[] | null = null;
  private disposed = false;
  isLoaded = false;
  private readonly onFrame = () => this.frame();
  private instrumentation: SceneInstrumentation | null = null;
  private props: PropsHandle | null = null;
  private readonly tags: { tag: Mesh; node: import('@babylonjs/core/Meshes/transformNode').TransformNode; y: number }[] = [];

  constructor(
    private readonly host: EngineHost,
    readonly config: RaceConfig,
    private readonly callbacks: RaceCallbacks,
    private readonly net: RaceNetAdapter | null = null,
  ) {
    this.path = getTrackPath(config.trackId);
    this.scene = new Scene(host.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.constantlyUpdateMeshUnderPointer = false;
    hudStore.set({ ...initialHud(), laps: config.laps, total: config.grid.length, offline: config.mode === 'offline' });
  }

  private setLoading(p: number, label: string) {
    hudStore.set({ loadingProgress: p, loadingLabel: label });
  }

  async load(): Promise<void> {
    const q = this.host.quality;
    const scene = this.scene;
    const desert = this.path.def.theme === 'desert';
    this.setLoading(0.1, 'Construction du circuit…');
    await loadFonts();
    await nextFrame();

    MusicPlayer.setDuck(0.6);
    const atmo = setupAtmosphere(scene, this.path, q);
    const night = atmo.night;
    this.night = night;
    this.sun = atmo.sun;
    this.track = buildTrack(scene, this.path, q.decorDensity, { night });
    this.setLoading(0.5, 'Préparation des véhicules…');
    await nextFrame();

    if (q.shadows) {
      this.shadow = new ShadowGenerator(1024, this.sun);
      this.shadow.usePercentageCloserFiltering = true;
      this.sun.autoUpdateExtends = false;
      this.sun.orthoLeft = -40;
      this.sun.orthoRight = 40;
      this.sun.orthoTop = 40;
      this.sun.orthoBottom = -40;
      this.sun.shadowMinZ = 1;
      this.sun.shadowMaxZ = 200;
      for (const r of this.track.shadowReceivers) r.receiveShadows = true;
    }
    if (q.glow || (night && q.postFx !== 'none')) {
      const glow = new GlowLayer('glow', scene, { mainTextureRatio: q.glow ? 0.35 : 0.25, blurKernelSize: night ? 32 : 24 });
      glow.intensity = night ? 0.8 : 0.55;
      // Facades carry lit windows in their emissive texture: they must not bloom as a whole.
      for (const m of scene.meshes) if (/^city-|^lightPool|^sideStreets|^road|^ground/.test(m.name)) glow.addExcludedMesh(m as import('@babylonjs/core/Meshes/mesh').Mesh);
    }

    this.effects = new Effects(scene, q.particleScale, desert);
    this.camera = new DynamicRaceCamera(scene, this.path, q.viewDistance);
    this.post = setupPostFx(scene, this.camera.camera, q, night ? { exposure: 1.0, contrast: 1.2, bloomThreshold: 0.85, bloomWeight: 0.35, vignette: 2.2 } : { exposure: 1.08, contrast: 1.15, vignette: 1.4 });

    AudioEngine.ensure();
    await Promise.all([prepareVehicles(scene, this.config.grid.map((g) => g.vehicle)), AudioEngine.ensure() ? AudioEngine.preload() : Promise.resolve()]);
    for (const entry of this.config.grid) {
      const isLocal = entry.id === this.config.localId;
      const model = createVehicleModel(scene, entry.vehicle, entry.color, `${entry.slot}`);
      if (this.shadow) model.meshes.forEach((m) => this.shadow!.addShadowCaster(m));
      const view = new VehicleView(model, this.path);
      const tuning = tunedVehicle(entry.vehicle, entry.upgrades);
      const simulated = isLocal || this.config.mode === 'offline';
      const emitters = this.effects.attachVehicle(model, isLocal);
      if (isLocal && this.night && q.name !== 'eco') {
        // One dynamic light only: the player's headlights at night.
        const spot = new SpotLight('headlight', new Vector3(0, 1.1, 1.8), new Vector3(0, -0.18, 1), 0.9, 6, scene);
        spot.parent = model.chassis;
        spot.diffuse = Color3.FromHexString('#fff2d6');
        spot.intensity = 3.2;
        spot.range = 70;
      }
      if (simulated) {
        const slot = gridSlot(this.path, entry.slot);
        const vehicle = new ArcadeVehicle(this.path, tuning, slot.s, slot.lateral);
        vehicle.ownerId = entry.id;
        const pilot =
          !isLocal || this.config.autopilot
            ? new AutoPilot(vehicle, { skill: isLocal ? 1 : botSkill(entry.slot), lane: slot.lateral * 0.5, seed: entry.slot * 97 + 3, useBoost: true })
            : null;
        const racer: SimRacer = {
          info: entry,
          vehicle,
          tracker: new LapTracker(this.path, this.config.laps, vehicle.state.s),
          pilot,
          model,
          view,
          emitters,
          audio: null,
          prev: { x: vehicle.state.x, y: vehicle.state.y, z: vehicle.state.z, h: vehicle.state.heading },
          finishedAt: null,
        };
        racer.audio = new VehicleAudio(tuning, !isLocal, isLocal ? 1 : 0.5);
        if (isLocal) this.local = racer;
        else this.bots.push(racer);
      } else {
        const slot = gridSlot(this.path, entry.slot);
        const p = this.path.pointAt(slot.s, slot.lateral);
        const tag = this.makeTag(entry);
        this.tags.push({ tag, node: model.root, y: tag.position.y });
        this.remotes.set(entry.id, {
          info: entry,
          model,
          view,
          emitters,
          audio: new VehicleAudio(tuning, true, 0.5),
          tag,
          buffer: [],
          pose: { x: p.x, y: p.y, z: p.z, h: p.heading, v: 0, f: 0, vx: 0, vz: 0, steer: 0, spin: 0 },
          standing: null,
        });
      }
    }
    if (!this.local) throw new Error('Local racer missing from grid');
    // Name tags are not parented (billboards under a rotating parent can render mirrored): follow manually.
    for (const b of this.bots) {
      const tag = this.makeTag(b.info);
      this.tags.push({ tag, node: b.model.root, y: tag.position.y });
    }
    this.applyAllPoses(0);
    this.camera.update(0, this.local.vehicle.state, this.local.vehicle.tuning);

    if (q.name !== 'eco') {
      this.setLoading(0.7, 'Physique Havok…');
      const half: Record<string, [number, number, number]> = { sport: [0.95, 0.6, 2.2], moto: [0.4, 0.75, 1.05], buggy: [1.0, 0.8, 1.8], monster: [1.7, 1.3, 2.3] };
      const bodies = [...[this.local, ...this.bots].map((r) => ({ model: r.model, id: r.info.vehicle, isLocal: r === this.local })), ...[...this.remotes.values()].map((r) => ({ model: r.model, id: r.info.vehicle, isLocal: false }))];
      this.props = await createPhysicsProps(
        scene,
        this.path,
        bodies.map((b) => ({ node: b.model.root, halfExtents: new Vector3(...half[b.id]), isLocal: b.isLocal })),
        (impulse) => {
          this.camera.addTrauma(clamp(impulse / 60, 0.08, 0.3));
          AudioEngine.impact(Math.min(8, impulse / 4));
          haptic(15);
        },
      );
    }
    if (new URLSearchParams(location.search).has('dev')) this.instrumentation = new SceneInstrumentation(this.scene);
    this.setLoading(0.85, 'Compilation des shaders…');
    await scene.whenReadyAsync();
    scene.blockMaterialDirtyMechanism = true;
    this.setLoading(1, 'Prêt !');

    this.input.attach();
    this.input.onRespawn = () => this.requestRespawn();
    this.input.onPause = () => this.togglePause();
    scene.onBeforeRenderObservable.add(this.onFrame);
    this.host.mount(scene);
    this.setPhase('intro');
    this.isLoaded = true;
    this.net?.sendLoaded();
    if (this.config.mode === 'offline') this.startCountdownAt(performance.now() + 1200 + 3000);
  }

  private makeTag(entry: GridEntry): Mesh {
    const tag = CreatePlane(`tag-${entry.id}`, { width: 2.6, height: 0.65 }, this.scene);
    const m = new StandardMaterial(`tagMat-${entry.id}`, this.scene);
    m.disableLighting = true;
    m.emissiveTexture = nameTagTexture(this.scene, entry.name, paintById(entry.color).hex);
    m.opacityTexture = m.emissiveTexture;
    m.backFaceCulling = false;
    m.fogEnabled = false;
    tag.material = m;
    tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
    tag.position.y = entry.vehicle === 'monster' ? 4.4 : 2.6;
    tag.isPickable = false;
    return tag;
  }

  /** Online: server-provided GO time (server clock). */
  onCountdown(startAtServer: number): void {
    const delay = startAtServer - (this.net?.serverNow() ?? Date.now());
    this.startCountdownAt(performance.now() + delay);
  }

  private startCountdownAt(goAt: number): void {
    this.countdownEnd = goAt;
    this.camera.introDuration = Math.max(1.5, (goAt - performance.now()) / 1000);
    this.camera.setMode('intro');
  }

  private setPhase(phase: RacePhase): void {
    this.phase = phase;
    hudStore.set({ phase });
  }

  private toast(text: string, tone: 'info' | 'good' | 'warn' = 'info'): void {
    hudStore.set({ toast: { text, id: ++this.toastId, tone } });
  }

  requestRespawn(): void {
    if (this.phase !== 'racing') return;
    this.local.vehicle.respawnS = this.local.tracker.lastCheckpointS();
    this.local.vehicle.respawn();
    this.net?.sendRespawn();
  }

  togglePause(): void {
    if (this.config.mode !== 'offline' || this.phase === 'results') return;
    this.paused = !this.paused;
    hudStore.set({ paused: this.paused });
  }

  // ---------------------------------------------------------------- frame loop

  private frame(): void {
    if (this.disposed) return;
    const dt = Math.min(this.host.engine.getDeltaTime() / 1000, 0.17);
    this.envTime += dt;
    this.track.update(dt, this.envTime);

    if (this.paused) return;
    const now = performance.now();

    // Countdown handling.
    if ((this.phase === 'intro' || this.phase === 'countdown') && this.countdownEnd > 0) {
      const remaining = (this.countdownEnd - now) / 1000;
      if (remaining <= 3 && this.phase === 'intro') this.setPhase('countdown');
      if (this.phase === 'countdown') {
        const n = Math.ceil(remaining);
        const show: number | 'GO' = remaining <= 0 ? 'GO' : n;
        if (show !== this.lastCountdownShown) {
          this.lastCountdownShown = show;
          hudStore.set({ countdown: show });
          AudioEngine.countdown(show === 'GO');
          Announcer.countdown(show);
          this.setStartLights(show);
          if (show === 'GO') {
            haptic(60);
            this.setPhase('racing');
            this.camera.setMode('follow');
            this.raceTime = Math.max(0, -remaining);
            setTimeout(() => hudStore.set({ countdown: null }), 800);
          }
        }
      }
    }

    const racing = this.phase === 'racing' || this.phase === 'finished' || this.phase === 'results';
    this.acc += dt;
    let steps = 0;
    // Up to 10 catch-up steps: slow devices (>= 6 FPS) still simulate in real time (the sim is cheap).
    while (this.acc >= STEP && steps < 10) {
      this.acc -= STEP;
      steps++;
      this.fixedStep(racing);
    }
    if (steps === 10) this.acc = 0;
    const alpha = this.acc / STEP;

    this.updateRemotes(dt);
    this.applyAllPoses(dt, alpha);
    for (const t of this.tags) t.tag.position.set(t.node.position.x, t.node.position.y + t.y, t.node.position.z);
    this.props?.update();
    const st = this.local.vehicle.state;
    this.camera.update(dt, st, this.local.vehicle.tuning);
    VehicleAudio.setListener(this.camera.camera.position.x, this.camera.camera.position.y, this.camera.camera.position.z, Math.sin(st.heading), Math.cos(st.heading));
    if (this.shadow) {
      this.sun.position.set(st.x + 45, st.y + 100, st.z - 35);
    }

    // Network send (local state) at NET_SEND_HZ.
    if (this.net && racing) {
      this.sendTimer += dt;
      if (this.sendTimer >= 1 / NET_SEND_HZ) {
        this.sendTimer = 0;
        let f = 0;
        if (st.boosting) f |= FLAG_BOOST;
        if (st.drifting) f |= FLAG_DRIFT;
        if (!st.grounded) f |= FLAG_AIR;
        if (this.local.pilot?.input.brake || this.lastInput.brake) f |= FLAG_BRAKE;
        this.net.sendState({ x: round2(st.x), y: round2(st.y), z: round2(st.z), h: round3(st.heading), v: round2(st.speed), f });
        this.seq++;
      }
    }

    this.hudTimer += dt;
    if (this.hudTimer >= 1 / 20) {
      this.hudTimer = 0;
      this.publishHud();
    }

    if (this.config.mode === 'offline') this.checkOfflineEnd(dt);
  }

  private lastInput: VehicleInput = { throttle: 0, brake: 0, steer: 0, boost: false, drift: false };

  private fixedStep(racing: boolean): void {
    if (racing) this.raceTime += STEP;
    const all: SimRacer[] = [this.local, ...this.bots];
    // Build obstacle lists from current positions.
    this.obstacles.length = 0;
    for (const r of all) {
      const s = r.vehicle.state;
      this.obstacles.push({ id: r.info.id, x: s.x, y: s.y, z: s.z, vx: s.vx, vz: s.vz, radius: r.vehicle.tuning.radius, mass: r.vehicle.tuning.mass });
    }
    for (const rr of this.remotes.values()) {
      const p = rr.pose;
      const t = tunedVehicle(rr.info.vehicle);
      this.obstacles.push({ id: rr.info.id, x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, radius: t.radius, mass: t.mass });
    }

    for (const r of all) {
      const s = r.vehicle.state;
      r.prev.x = s.x;
      r.prev.y = s.y;
      r.prev.z = s.z;
      r.prev.h = s.heading;
      let input: VehicleInput;
      if (!racing) {
        // Held on the grid until GO: throttle revs the engine only.
        const rev = r === this.local ? this.input.sample().throttle > 0 || !!this.config.autopilot : Math.sin(this.envTime * 1.7 + r.info.slot) > 0.2;
        r.vehicle.hold(STEP, this.phase === 'countdown' && rev ? 1 : 0, this.envTime);
        continue;
      }
      if (r === this.local && !r.pilot && r.finishedAt === null) input = this.input.sample();
      else if (r.pilot) {
        if (r !== this.local) {
          // Same rubber band as the server bots (beatable on touch controls).
          const gap = r.tracker.progress - this.local.tracker.progress;
          r.pilot.pace = botPace(r.finishedAt !== null, gap);
        } else if (r.finishedAt !== null) r.pilot.pace = 0.75;
        input = r.pilot.update(STEP);
      } else {
        // Local player after finish: hand over to a cool-down autopilot.
        r.pilot = new AutoPilot(r.vehicle, { skill: 0.9, lane: 0, seed: 1, useBoost: false });
        r.pilot.pace = 0.75;
        input = r.pilot.update(STEP);
      }
      if (r === this.local) Object.assign(this.lastInput, input);
      r.vehicle.step(STEP, input, this.obstacles);

      if (racing) {
        const events = r.tracker.update(s.s, s.lateral, this.raceTime);
        for (const e of events) {
          if (e.type === 'checkpoint') r.vehicle.respawnS = r.tracker.lastCheckpointS();
          if (r !== this.local) {
            if (e.type === 'finish') r.finishedAt = e.time;
            continue;
          }
          if (e.type === 'checkpoint') AudioEngine.checkpoint();
          if (e.type === 'lap' && e.lap < this.config.laps) {
            AudioEngine.lap();
            this.toast(e.lap === this.config.laps - 1 ? 'DERNIER TOUR !' : `TOUR ${e.lap + 1} / ${this.config.laps}`, 'good');
            Announcer.lap(e.lap + 1, this.config.laps);
            hudStore.set({ lastLap: e.lapTime, bestLap: r.tracker.bestLap });
          }
          if (e.type === 'finish') this.onLocalFinish(e.time);
        }
      }
      this.handleVehicleEvents(r);
    }
  }

  private handleVehicleEvents(r: SimRacer): void {
    const isLocal = r === this.local;
    for (const e of r.vehicle.events) {
      switch (e.type) {
        case 'impact':
          this.effects.sparksAt(e.x, e.y, e.z, e.strength);
          if (this.path.def.theme === 'desert') this.effects.puffAt(e.x, e.y - 0.5, e.z, e.strength * 0.5);
          if (isLocal) {
            this.camera.addTrauma(clamp(e.strength / 25, 0.15, 0.8));
            AudioEngine.impact(e.strength);
            haptic(e.strength > 12 ? [40, 30, 40] : 30);
          }
          break;
        case 'land':
          if (e.strength > 3) this.effects.puffAt(r.vehicle.state.x, r.vehicle.state.y, r.vehicle.state.z, e.strength);
          if (isLocal && e.strength > 3) {
            this.camera.addTrauma(clamp(e.strength / 30, 0.1, 0.5));
            AudioEngine.land(e.strength);
            haptic(25);
          }
          break;
        case 'boostStart':
          if (isLocal) {
            this.camera.kickFov(0.08);
            AudioEngine.boost();
            haptic(20);
          }
          break;
        case 'driftEnd':
          if (isLocal && e.charged > 0.2) this.toast('MINI-TURBO +', 'good');
          break;
        case 'respawn':
          if (isLocal) this.toast('REPLACEMENT', 'warn');
          break;
        default:
          break;
      }
    }
    r.vehicle.events.length = 0;
  }

  private onLocalFinish(time: number): void {
    this.local.finishedAt = time;
    AudioEngine.finish();
    const pos = this.lastPosition;
    window.setTimeout(() => Announcer.finish(pos), 400);
    haptic([60, 40, 120]);
    this.camera.setMode('finish');
    this.setPhase('finished');
    hudStore.set({ lastLap: this.local.tracker.lapTimes.at(-1) ?? null, bestLap: this.local.tracker.bestLap });
  }

  private checkOfflineEnd(dt: number): void {
    if (this.phase !== 'finished' || this.resultsSent) return;
    this.finishWait += dt;
    const allDone = this.bots.every((b) => b.finishedAt !== null);
    if (!allDone && this.finishWait < 12) return;
    this.resultsSent = true;
    const racers = [this.local, ...this.bots];
    const ranked = rankRacers(
      racers.map((r) => ({ id: r.info.id, progress: r.tracker.progress, finished: r.finishedAt !== null, finishTime: r.finishedAt, r })),
    );
    const results: ResultDTO[] = ranked.map((x, i) => ({
      id: x.r.info.id,
      name: x.r.info.name,
      vehicle: x.r.info.vehicle,
      color: x.r.info.color,
      position: i + 1,
      time: x.r.finishedAt,
      bestLap: x.r.tracker.bestLap,
      finished: x.r.finishedAt !== null,
      isBot: x.r.info.isBot,
      flagged: false,
      reward: null,
    }));
    this.showResults(results, 'none');
  }

  /** Online: authoritative results from the server. */
  showResults(results: ResultDTO[], rewards: 'granted' | 'unavailable' | 'none'): void {
    this.resultsSent = true;
    if (this.phase !== 'finished') this.camera.setMode('finish');
    this.setPhase('results');
    this.callbacks.onResults(results, rewards);
  }

  // ---------------------------------------------------------------- remotes

  onSnapshot(serverTime: number, racers: RacerStateDTO[]): void {
    for (const r of racers) {
      const rr = this.remotes.get(r.id);
      if (!rr) continue;
      rr.buffer.push({ t: serverTime, x: r.x, y: r.y, z: r.z, h: r.h, v: r.v, f: r.f });
      if (rr.buffer.length > 30) rr.buffer.shift();
    }
  }

  onStandings(rows: StandingDTO[]): void {
    this.serverStandings = rows;
    for (const row of rows) {
      const rr = this.remotes.get(row.id);
      if (rr) rr.standing = row;
    }
  }

  private updateRemotes(dt: number): void {
    if (!this.remotes.size || !this.net) return;
    const renderT = this.net.serverNow() - NET_INTERP_DELAY;
    for (const rr of this.remotes.values()) {
      const b = rr.buffer;
      if (!b.length) continue;
      let a = b[0];
      let c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].t <= renderT && b[i + 1].t >= renderT) {
          a = b[i];
          c = b[i + 1];
          break;
        }
      }
      const p = rr.pose;
      const px = p.x;
      const pz = p.z;
      const ph = p.h;
      if (renderT >= c.t) {
        // Extrapolate briefly (max 250ms) along heading.
        const ex = Math.min(0.25, (renderT - c.t) / 1000);
        p.x = c.x + Math.sin(c.h) * c.v * ex;
        p.z = c.z + Math.cos(c.h) * c.v * ex;
        p.y = c.y;
        p.h = c.h;
        p.v = c.v;
        p.f = c.f;
      } else if (renderT <= a.t) {
        p.x = a.x;
        p.y = a.y;
        p.z = a.z;
        p.h = a.h;
        p.v = a.v;
        p.f = a.f;
      } else {
        const k = (renderT - a.t) / Math.max(1, c.t - a.t);
        p.x = lerp(a.x, c.x, k);
        p.y = lerp(a.y, c.y, k);
        p.z = lerp(a.z, c.z, k);
        p.h = a.h + wrapAngle(c.h - a.h) * k;
        p.v = lerp(a.v, c.v, k);
        p.f = k < 0.5 ? a.f : c.f;
      }
      if (dt > 0) {
        p.vx = (p.x - px) / dt;
        p.vz = (p.z - pz) / dt;
        const yawRate = wrapAngle(p.h - ph) / dt;
        p.steer += (clamp(yawRate / 1.5, -1, 1) - p.steer) * Math.min(1, dt * 8);
      }
      p.spin += (p.v * dt) / 0.4;
    }
  }

  // ---------------------------------------------------------------- render

  private applyAllPoses(dt: number, alpha = 1): void {
    for (const r of [this.local, ...this.bots]) {
      if (!r) continue;
      const s = r.vehicle.state;
      const x = lerp(r.prev.x, s.x, alpha);
      const y = lerp(r.prev.y, s.y, alpha);
      const z = lerp(r.prev.z, s.z, alpha);
      const h = r.prev.h + wrapAngle(s.heading - r.prev.h) * alpha;
      const braking = (r === this.local ? this.lastInput.brake : (r.pilot?.input.brake ?? 0)) > 0 && s.speed > 1;
      r.view.apply(
        { x, y, z, heading: h, speed: s.speed, steer: s.steer, grounded: s.grounded, vy: s.vy, roll: s.roll, pitch: s.pitch, suspension: s.suspension, wheelSpin: s.wheelSpin, drifting: s.drifting, driftDir: s.driftDir, braking },
        dt,
      );
      const dust = (s.offroad || this.path.def.theme === 'desert') && s.grounded ? clamp(Math.abs(s.speed) / 50, 0, 1) * (r.info.vehicle === 'buggy' ? 1.4 : 0.8) : 0;
      r.emitters.update({ drifting: s.drifting && s.grounded, boosting: s.boosting, dust, speed: Math.abs(s.speed), throttle: s.throttle });
      r.audio?.update({ rpm: s.rpm, throttle: s.throttle, brake: s.brake, speed: Math.abs(s.speed), drifting: s.drifting && s.grounded, boosting: s.boosting, offroad: s.offroad, x: s.x, y: s.y, z: s.z });
    }
    for (const rr of this.remotes.values()) {
      const p = rr.pose;
      const t = VEHICLES[rr.info.vehicle].tuning;
      const drifting = (p.f & FLAG_DRIFT) !== 0;
      const boosting = (p.f & FLAG_BOOST) !== 0;
      const air = (p.f & FLAG_AIR) !== 0;
      const lateralG = p.steer * clamp(Math.abs(p.v) / t.maxSpeed, 0, 1);
      rr.view.apply(
        { x: p.x, y: p.y, z: p.z, heading: p.h, speed: p.v, steer: p.steer, grounded: !air, vy: 0, roll: lateralG * (t.bodyRoll - t.lean), pitch: 0, suspension: 0, wheelSpin: p.spin, drifting, driftDir: Math.sign(p.steer), braking: (p.f & FLAG_BRAKE) !== 0 },
        dt,
      );
      rr.emitters.update({ drifting: drifting && !air, boosting, dust: this.path.def.theme === 'desert' && !air ? clamp(Math.abs(p.v) / 50, 0, 1) * 0.8 : 0, speed: Math.abs(p.v), throttle: Math.abs(p.v) > 5 ? 1 : 0 });
      const rpm = clamp(Math.abs(p.v) / (t.maxSpeed * t.boostMul), 0, 1);
      rr.audio?.update({ rpm: 0.2 + rpm * 0.75, throttle: 1, speed: Math.abs(p.v), drifting, boosting, offroad: false, x: p.x, y: p.y, z: p.z });
    }
  }

  private setStartLights(show: number | 'GO'): void {
    const lights = this.track.startLights;
    lights.forEach((m, i) => {
      if (show === 'GO') {
        m.emissiveColor = new Color3(0.1, 1, 0.3);
      } else {
        const lit = i < 4 - show;
        m.emissiveColor = lit ? new Color3(1, 0.08, 0.05) : new Color3(0.12, 0, 0);
      }
    });
  }

  // ---------------------------------------------------------------- HUD

  private publishHud(): void {
    const st = this.local.vehicle.state;
    const t = this.local.vehicle.tuning;
    const standings = this.computeStandings();
    const me = standings.find((r) => r.isLocal);
    // Boost: brief chromatic aberration + stronger vignette (post FX profiles only).
    if (this.post) {
      const target = st.boosting ? 1 : 0;
      this.aberration += (target - this.aberration) * 0.25;
      const on = this.aberration > 0.02;
      this.post.chromaticAberrationEnabled = on;
      if (on) {
        this.post.chromaticAberration.aberrationAmount = 28 * this.aberration;
        this.post.chromaticAberration.radialIntensity = 1.2;
      }
    }
    // Position changes: announcer when taking the lead, rival radio chatter on overtakes.
    const position = me?.position ?? 1;
    if (this.phase === 'racing' && this.lastPosition !== position && this.raceTime > 4) {
      const now = performance.now();
      if (position === 1 && this.lastPosition > 1) Announcer.lead();
      else {
        const rivalRow = standings.find((r) => r.position === (position > this.lastPosition ? position - 1 : position + 1));
        const line = rivalRow && !rivalRow.isLocal ? Announcer.rival(rivalRow.name, position > this.lastPosition, now) : null;
        if (line) this.toast(line, 'info');
      }
    }
    this.lastPosition = position;
    hudStore.set({
      lap: this.local.tracker.lap,
      position: me?.position ?? 1,
      total: standings.length,
      raceTime: this.local.finishedAt ?? this.raceTime,
      speedKmh: Math.round(Math.abs(st.speed) * 3.6),
      speedRatio: clamp(Math.abs(st.speed) / t.maxSpeed, 0, 1.4),
      boost: st.boost / t.boostCapacity,
      boosting: st.boosting,
      drifting: st.drifting,
      airborne: !st.grounded,
      wrongWay: st.wrongWayTime > 1.2 && this.phase === 'racing',
      standings,
      fps: Math.round(this.host.fps),
    });
  }

  private computeStandings(): StandingRow[] {
    const rows: { id: string; progress: number; finished: boolean; finishTime: number | null; info: GridEntry; lap: number; serverPos?: number }[] = [];
    for (const r of [this.local, ...this.bots]) {
      rows.push({ id: r.info.id, progress: r.tracker.progress, finished: r.finishedAt !== null, finishTime: r.finishedAt, info: r.info, lap: r.tracker.lap });
    }
    for (const rr of this.remotes.values()) {
      const s = rr.standing;
      rows.push({ id: rr.info.id, progress: s?.progress ?? 0, finished: s?.finished ?? false, finishTime: s?.time ?? null, info: rr.info, lap: s?.lap ?? 1 });
    }
    // Online: when the server has ranked us, trust its progress for the local racer too.
    if (this.serverStandings) {
      const mine = this.serverStandings.find((r) => r.id === this.config.localId);
      const localRow = rows.find((r) => r.id === this.config.localId);
      if (mine && localRow && mine.finished) {
        localRow.finished = true;
        localRow.finishTime = mine.time;
      }
    }
    return rankRacers(rows).map((r, i) => ({
      id: r.id,
      name: r.info.name,
      position: i + 1,
      isLocal: r.id === this.config.localId,
      isBot: r.info.isBot,
      finished: r.finished,
      time: r.finishTime,
      lap: r.lap,
      color: paintById(r.info.color).hex,
      vehicle: r.info.vehicle,
    }));
  }

  /** Minimap data: normalized track polyline + racers. */
  minimapDots(): { x: number; z: number; local: boolean; color: string }[] {
    const dots: { x: number; z: number; local: boolean; color: string }[] = [];
    for (const r of [this.local, ...this.bots]) {
      dots.push({ x: r.vehicle.state.x, z: r.vehicle.state.z, local: r === this.local, color: paintById(r.info.color).hex });
    }
    for (const rr of this.remotes.values()) dots.push({ x: rr.pose.x, z: rr.pose.z, local: false, color: paintById(rr.info.color).hex });
    return dots;
  }

  /** Test/debug hook. */
  debugState() {
    if (!this.local) return { phase: this.phase } as unknown as ReturnType<RaceSession['fullDebugState']>;
    return this.fullDebugState();
  }

  private fullDebugState() {
    const st = this.local.vehicle.state;
    return {
      phase: this.phase,
      raceTime: this.raceTime,
      lap: this.local.tracker.lap,
      lapsCompleted: this.local.tracker.lapsCompleted,
      progress: this.local.tracker.progress,
      speed: st.speed,
      x: st.x,
      z: st.z,
      finished: this.local.finishedAt !== null,
      boosting: st.boosting,
      drifting: st.drifting,
      boost: st.boost,
      steer: st.steer,
      grounded: st.grounded,
      lateral: st.lateral,
      drawCalls: this.instrumentation?.drawCallsCounter.current ?? -1,
      physicsProps: this.props !== null,
      activeMeshes: this.scene.getActiveMeshes().length,
      fps: this.host.fps,
    };
  }

  setAutopilot(on: boolean): void {
    if (on && !this.local.pilot) this.local.pilot = new AutoPilot(this.local.vehicle, { skill: 1, lane: 0, seed: 5, useBoost: true });
    if (!on && this.local.finishedAt === null) this.local.pilot = null;
  }

  dispose(): void {
    MusicPlayer.setDuck(1);
    this.disposed = true;
    this.input.detach();
    this.host.unmount(this.scene);
    for (const r of [this.local, ...this.bots]) {
      r?.audio?.dispose();
      r?.emitters.dispose();
    }
    for (const rr of this.remotes.values()) {
      rr.audio?.dispose();
      rr.emitters.dispose();
    }
    this.props?.dispose();
    this.effects?.dispose();
    this.track?.dispose();
    this.scene.dispose();
  }
}

/** Canvas textures (banners, name tags) need the display fonts loaded first. */
export const loadFonts = async (): Promise<void> => {
  const fonts = document.fonts;
  if (!fonts?.load) return;
  const timeout = new Promise<void>((r) => setTimeout(r, 1500));
  await Promise.race([Promise.all([fonts.load('72px "Russo One"'), fonts.load('700 30px Rajdhani')]).then(() => undefined), timeout]).catch(() => undefined);
};

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
