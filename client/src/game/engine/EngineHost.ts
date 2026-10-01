import { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import { settingsStore } from '../../state/settings';
import { AdaptiveResolution, autoDetectQuality, QUALITY_PRESETS, type QualityParams } from '../quality/QualityManager';

export interface FrameStats {
  fps: number;
  drawCalls: number;
  activeMeshes: number;
}

/**
 * Owns the single Babylon engine and the render loop. Screens (garage, race) mount a scene into it.
 */
export class EngineHost {
  readonly engine: Engine;
  private scene: Scene | null = null;
  private resolution: AdaptiveResolution;
  quality: QualityParams;
  stats: FrameStats = { fps: 0, drawCalls: 0, activeMeshes: 0 };
  /** Menus (showroom) are cheap to render: use a crisper resolution than the race profile. */
  private menuMode = false;
  private readonly onResize = () => this.engine.resize();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.quality = this.resolveQuality();
    this.engine = new Engine(
      canvas,
      this.quality.antialias,
      { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance', audioEngine: false, doNotHandleContextLost: false },
      false,
    );
    this.resolution = this.createResolution();
    this.applyScaling();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    settingsStore.subscribe(() => {
      const q = this.resolveQuality();
      if (q.name !== this.quality.name) {
        this.quality = q;
        this.resolution = this.createResolution();
        this.applyScaling();
      }
    });
    this.engine.runRenderLoop(() => {
      const scene = this.scene;
      if (!scene || !scene.activeCamera) return;
      const dt = this.engine.getDeltaTime() / 1000;
      this.resolution.sample(dt);
      scene.render();
      this.stats.fps = this.engine.getFps();
    });
  }

  private resolveQuality(): QualityParams {
    const pref = settingsStore.get().quality;
    return QUALITY_PRESETS[pref === 'auto' ? autoDetectQuality() : pref];
  }

  private createResolution(): AdaptiveResolution {
    const auto = settingsStore.get().quality === 'auto';
    const r = new AdaptiveResolution(auto, 0.45, 1);
    r.onChange = () => this.applyScaling();
    return r;
  }

  setMenuMode(on: boolean): void {
    if (this.menuMode === on) return;
    this.menuMode = on;
    this.applyScaling();
  }

  private applyScaling(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.menuMode ? 2 : this.quality.maxDpr);
    const scale = this.menuMode ? dpr : dpr * this.quality.renderScale * this.resolution.scale;
    this.engine.setHardwareScalingLevel(1 / Math.max(0.25, scale));
  }

  get fps(): number {
    return this.resolution.lastFps;
  }

  mount(scene: Scene): void {
    this.scene = scene;
    this.engine.resize();
  }

  unmount(scene: Scene): void {
    if (this.scene === scene) this.scene = null;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.engine.dispose();
  }
}

let host: EngineHost | null = null;

export const getEngineHost = (): EngineHost => {
  if (!host) {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    host = new EngineHost(canvas);
    (window as unknown as { __raceRushEngine: EngineHost }).__raceRushEngine = host;
  }
  return host;
};
