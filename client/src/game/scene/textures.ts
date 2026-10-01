import type { Scene } from '@babylonjs/core/scene';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { createRng } from '@race-rush/shared';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const make = (scene: Scene, name: string, w: number, h: number, paint: Painter, opts: { mips?: boolean; alpha?: boolean; wrap?: boolean } = {}) => {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, opts.mips ?? true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  paint(ctx, w, h);
  tex.update(false);
  tex.hasAlpha = !!opts.alpha;
  if (opts.wrap !== false) {
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
  }
  tex.anisotropicFilteringLevel = 4;
  return tex;
};

const noise = (ctx: CanvasRenderingContext2D, w: number, h: number, base: string, amount: number, seed: number, count = 2400) => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const rng = createRng(seed);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${amount * rng()})`;
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
};

/** Road surface: u spans the road width, v runs along the track. */
export const roadTexture = (scene: Scene, base: string, desert: boolean) =>
  make(scene, 'roadTex', 256, 512, (ctx, w, h) => {
    noise(ctx, w, h, base, 0.18, 11, 5000);
    // Edge lines.
    ctx.fillStyle = desert ? 'rgba(255,240,210,0.55)' : 'rgba(240,244,255,0.9)';
    ctx.fillRect(8, 0, 7, h);
    ctx.fillRect(w - 15, 0, 7, h);
    // Lane dashes.
    ctx.fillStyle = desert ? 'rgba(255,230,190,0.45)' : 'rgba(255,214,64,0.95)';
    for (const x of desert ? [w / 2 - 3] : [w / 3 - 2, (2 * w) / 3 - 2]) {
      for (let y = 0; y < h; y += 128) ctx.fillRect(x, y + 20, 5, 64);
    }
    // Tire marks.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(w * 0.27, 0, 10, h);
    ctx.fillRect(w * 0.7, 0, 10, h);
  });

export const curbTexture = (scene: Scene) =>
  make(scene, 'curbTex', 32, 128, (ctx, w, h) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#f4f4f4' : '#e0262f';
      ctx.fillRect(0, (i * h) / 4, w, h / 4);
    }
  });

export const barrierTexture = (scene: Scene, a: string, b: string) =>
  make(scene, 'barrierTex', 64, 256, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 24);
      ctx.lineTo(w, y + 44);
      ctx.lineTo(0, y + 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, 6, h);
  });

/** Building facade: dark wall with a grid of windows, some lit. Corner (0,0) stays plain wall for roofs. */
export const facadeTexture = (scene: Scene) =>
  make(scene, 'facadeTex', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a6278';
    ctx.fillRect(0, 0, w, h);
    const rng = createRng(99);
    const cols = 4;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (w / cols) + 10;
        const y = r * (h / rows) + 12;
        const lit = rng() < 0.42;
        const warm = rng() < 0.6;
        ctx.fillStyle = lit ? (warm ? '#ffd27a' : '#9fd8ff') : '#1d2638';
        ctx.fillRect(x, y, w / cols - 20, h / rows - 26);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, w / cols - 20, 4);
      }
    }
    ctx.fillStyle = '#5a6278';
    ctx.fillRect(0, 0, 8, 8);
  });

export const checkerTexture = (scene: Scene, n = 8) =>
  make(scene, 'checkerTex', 128, 128, (ctx, w, h) => {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
        ctx.fillRect((x * w) / n, (y * h) / n, w / n, h / n);
      }
  });

export const rampTexture = (scene: Scene) =>
  make(scene, 'rampTex', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffc61a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#14161c';
    for (let x = -h; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 16, h);
      ctx.lineTo(x + 16 + h / 2, 0);
      ctx.lineTo(x + h / 2, 0);
      ctx.closePath();
      ctx.fill();
    }
  });

export const bannerTexture = (scene: Scene, text: string, bg = '#0a1a4a', fg = '#ffc61a', sub?: string) =>
  make(
    scene,
    `banner-${text}`,
    512,
    128,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, bg);
      g.addColorStop(0.5, '#173b9c');
      g.addColorStop(1, bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, 6);
      ctx.fillRect(0, h - 6, w, 6);
      ctx.font = `italic 900 ${sub ? 58 : 72}px "Russo One", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#1f6bff';
      ctx.shadowBlur = 12;
      ctx.fillText(text, w / 2, sub ? h / 2 - 12 : h / 2 + 4);
      if (sub) {
        ctx.font = '600 26px Rajdhani, sans-serif';
        ctx.fillStyle = fg;
        ctx.fillText(sub, w / 2, h - 24);
      }
    },
    { wrap: false },
  );

export const chevronTexture = (scene: Scene) =>
  make(scene, 'chevronTex', 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#0d1a3f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffc61a';
    for (let x = 6; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x + 18, h / 2);
      ctx.lineTo(x, h - 8);
      ctx.lineTo(x + 12, h - 8);
      ctx.lineTo(x + 30, h / 2);
      ctx.lineTo(x + 12, 8);
      ctx.closePath();
      ctx.fill();
    }
  });

export const groundTexture = (scene: Scene, base: string, desert: boolean) =>
  make(scene, 'groundTex', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, base, desert ? 0.12 : 0.1, 5, 6000);
    if (!desert) {
      ctx.strokeStyle = 'rgba(120,140,190,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    } else {
      ctx.strokeStyle = 'rgba(150,95,40,0.18)';
      ctx.lineWidth = 3;
      for (let y = 20; y < h; y += 48) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4) * 6);
        ctx.stroke();
      }
    }
  });

export const skyTexture = (scene: Scene, top: string, horizon: string, desert: boolean) =>
  make(
    scene,
    'skyTex',
    16,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(0.42, top);
      g.addColorStop(0.5, horizon);
      g.addColorStop(0.53, desert ? '#f9dcae' : '#5b86e8');
      g.addColorStop(1, desert ? '#d9a35f' : '#0b1430');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { wrap: false },
  );

/** Soft radial dot for particles. */
export const particleTexture = (scene: Scene) =>
  make(
    scene,
    'particleTex',
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { alpha: true, wrap: false },
  );

export const nameTagTexture = (scene: Scene, name: string, color: string) =>
  make(
    scene,
    `tag-${name}`,
    256,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(8,18,48,0.78)';
      const r = 18;
      ctx.beginPath();
      ctx.moveTo(r, 4);
      ctx.arcTo(w - 4, 4, w - 4, h - 4, r);
      ctx.arcTo(w - 4, h - 4, 4, h - 4, r);
      ctx.arcTo(4, h - 4, 4, 4, r);
      ctx.arcTo(4, 4, w - 4, 4, r);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(16, h / 2 - 8, 16, 16);
      ctx.font = '700 30px Rajdhani, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 14), 42, h / 2 + 2);
    },
    { alpha: true, wrap: false, mips: false },
  );
