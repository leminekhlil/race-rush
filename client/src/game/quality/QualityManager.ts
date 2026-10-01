import type { QualityProfile } from '../../state/settings';

export type ResolvedQuality = Exclude<QualityProfile, 'auto'>;

export interface QualityParams {
  name: ResolvedQuality;
  /** Max device pixel ratio rendered. */
  maxDpr: number;
  /** Additional render scale (1 = native at maxDpr). */
  renderScale: number;
  shadows: boolean;
  particleScale: number;
  decorDensity: number;
  viewDistance: number;
  fogDensity: number;
  antialias: boolean;
  glow: boolean;
}

export const QUALITY_PRESETS: Record<ResolvedQuality, QualityParams> = {
  eco: {
    name: 'eco',
    maxDpr: 1,
    renderScale: 0.7,
    shadows: false,
    particleScale: 0.35,
    decorDensity: 0.45,
    viewDistance: 260,
    fogDensity: 0.0062,
    antialias: false,
    glow: false,
  },
  standard: {
    name: 'standard',
    maxDpr: 1.5,
    renderScale: 1,
    shadows: false,
    particleScale: 0.7,
    decorDensity: 0.8,
    viewDistance: 480,
    fogDensity: 0.0036,
    antialias: true,
    glow: false,
  },
  high: {
    name: 'high',
    maxDpr: 2,
    renderScale: 1,
    shadows: true,
    particleScale: 1,
    decorDensity: 1,
    viewDistance: 800,
    fogDensity: 0.0022,
    antialias: true,
    glow: true,
  },
};

interface GpuInfo {
  renderer: string;
  mobile: boolean;
}

const detectGpu = (): GpuInfo => {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* ignore */
  }
  return { renderer, mobile };
};

/** Picks an initial profile from device capabilities (AUTO). */
export const autoDetectQuality = (): ResolvedQuality => {
  const { renderer, mobile } = detectGpu();
  const r = renderer.toLowerCase();
  const cores = navigator.hardwareConcurrency || 4;
  const softwareGl = /swiftshader|llvmpipe|software|basic render/.test(r);
  if (softwareGl) return 'eco';
  if (mobile) {
    const strongMobile = /apple gpu|adreno \(tm\) (7[3-9]\d|8\d\d)|mali-g(7[1-9]|[89]\d|7\d\d)|immortalis|xclipse/.test(r);
    return strongMobile && cores >= 6 ? 'standard' : 'eco';
  }
  return cores >= 8 ? 'high' : 'standard';
};

/**
 * Runtime adaptation: watches frame times and lowers / raises the render scale
 * so the game holds ~30 FPS minimum on mid-range phones.
 */
export class AdaptiveResolution {
  private acc = 0;
  private frames = 0;
  private goodWindows = 0;
  scale = 1;
  onChange: ((scale: number) => void) | null = null;
  lastFps = 60;

  constructor(
    private readonly enabled: boolean,
    private readonly minScale = 0.5,
    private readonly maxScale = 1,
  ) {}

  /** Call every frame with the frame delta (seconds). */
  sample(dt: number): void {
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc;
    this.lastFps = fps;
    this.acc = 0;
    this.frames = 0;
    if (!this.enabled) return;
    if (fps < 27 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale - 0.12);
      this.goodWindows = 0;
      this.onChange?.(this.scale);
    } else if (fps > 56) {
      if (++this.goodWindows >= 3 && this.scale < this.maxScale) {
        this.scale = Math.min(this.maxScale, this.scale + 0.08);
        this.goodWindows = 0;
        this.onChange?.(this.scale);
      }
    } else {
      this.goodWindows = 0;
    }
  }
}
