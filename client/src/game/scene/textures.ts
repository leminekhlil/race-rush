import type { Scene } from '@babylonjs/core/scene';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { createRng } from '@race-rush/shared';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export const make = (scene: Scene, name: string, w: number, h: number, paint: Painter, opts: { mips?: boolean; alpha?: boolean; wrap?: boolean } = {}) => {
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

/** Canvas textures are sampled upside-down on Babylon planes: draw plane-facing artwork pre-flipped vertically. */
export const flipForPlane = (ctx: CanvasRenderingContext2D, h: number) => {
  ctx.translate(0, h);
  ctx.scale(1, -1);
};

export const noise = (ctx: CanvasRenderingContext2D, w: number, h: number, base: string, amount: number, seed: number, count = 2400) => {
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

/** Alternating colour blocks (reference: red/white race barriers). */
export const barrierTexture = (scene: Scene, a: string, b: string) =>
  make(scene, 'barrierTex', 64, 256, (ctx, w, h) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect(0, (i * h) / 4, w, h / 4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, w, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, h * 0.5 - 2, w, 2);
  });

/** Daytime facade: light wall (tinted per building via vertex colour) with blue glass windows. Corner (0,0) stays plain wall for roofs. */
export const facadeTexture = (scene: Scene) =>
  make(scene, 'facadeTex', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3f1ec';
    ctx.fillRect(0, 0, w, h);
    const rng = createRng(99);
    const cols = 4;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (w / cols) + 10;
        const y = r * (h / rows) + 12;
        const g = ctx.createLinearGradient(x, y, x + 40, y + 40);
        const dark = rng() < 0.25;
        g.addColorStop(0, dark ? '#3b5d8f' : '#8fc4ef');
        g.addColorStop(1, dark ? '#24406b' : '#5b93cf');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w / cols - 20, h / rows - 26);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(x + 4, y + 4, 8, h / rows - 34);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x - 3, y + h / rows - 26, w / cols - 14, 4);
      }
    }
    ctx.fillStyle = '#f3f1ec';
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

export const bannerTexture = (scene: Scene, text: string, bg = '#0a1a4a', fg = '#ffc61a', sub?: string, mid = '#173b9c') =>
  make(
    scene,
    `banner-${text}`,
    512,
    128,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, bg);
      g.addColorStop(0.5, mid);
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
    ctx.fillStyle = '#ffc61a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#121418';
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
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.strokeRect(w / 2, 0, 0.5, h);
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

/** Sky dome: gradient + soft clouds near the horizon (u wraps around the dome, v top → bottom). */
export const skyTexture = (scene: Scene, top: string, horizon: string, desert: boolean) =>
  make(
    scene,
    'skyTex',
    1024,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(0.36, top);
      g.addColorStop(0.5, horizon);
      g.addColorStop(0.53, desert ? '#f9dcae' : '#e8f4ff');
      g.addColorStop(1, desert ? '#d9a35f' : '#9fb3c8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rng = createRng(desert ? 5 : 21);
      for (let i = 0; i < (desert ? 10 : 22); i++) {
        const cx = rng() * w;
        const cy = h * (0.3 + rng() * 0.15);
        const sw = 40 + rng() * 90;
        for (let k = 0; k < 6; k++) {
          const px = cx + (rng() - 0.5) * sw;
          const py = cy + (rng() - 0.5) * 12;
          const r = 10 + rng() * 22;
          const cg = ctx.createRadialGradient(px, py, 0, px, py, r);
          cg.addColorStop(0, 'rgba(255,255,255,0.95)');
          cg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.ellipse(px, py, r * 1.6, r, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    { wrap: false },
  );

/** Green overhead road sign ("RACE RUSH ↑"). */
export const roadSignTexture = (scene: Scene, text: string) =>
  make(
    scene,
    `roadsign-${text}`,
    512,
    128,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      ctx.fillStyle = '#167a55';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2f6f4';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.font = '700 58px "Rajdhani", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
      for (const x of [56, w - 56]) {
        ctx.beginPath();
        ctx.moveTo(x, 28);
        ctx.lineTo(x + 16, 52);
        ctx.lineTo(x + 6, 52);
        ctx.lineTo(x + 6, 100);
        ctx.lineTo(x - 6, 100);
        ctx.lineTo(x - 6, 52);
        ctx.lineTo(x - 16, 52);
        ctx.closePath();
        ctx.fill();
      }
    },
    { wrap: false },
  );

/** Start gantry sign: teal panel "RACE RUSH" with checkered blocks at both ends (start reference). */
export const startSignTexture = (scene: Scene) =>
  make(
    scene,
    'startSign',
    1024,
    160,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      ctx.fillStyle = '#1c7f6d';
      ctx.fillRect(0, 0, w, h);
      const cw = 160;
      for (const x0 of [0, w - cw])
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            ctx.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
            ctx.fillRect(x0 + (x * cw) / 4, (y * h) / 4, cw / 4, h / 4);
          }
      ctx.strokeStyle = '#e8fff6';
      ctx.lineWidth = 6;
      ctx.strokeRect(cw + 6, 8, w - cw * 2 - 12, h - 16);
      ctx.font = 'italic 900 92px "Russo One", Impact, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RACE RUSH', w / 2, h / 2 + 6);
    },
    { wrap: false },
  );

/** Pink brand banner with a white crown (reference street banners). */
export const crownBannerTexture = (scene: Scene) =>
  make(
    scene,
    'crownBanner',
    128,
    256,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ff4fa3');
      g.addColorStop(1, '#d91f7a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const cx = w / 2;
      const cy = h * 0.5;
      ctx.moveTo(cx - 38, cy + 26);
      ctx.lineTo(cx - 44, cy - 22);
      ctx.lineTo(cx - 18, cy);
      ctx.lineTo(cx, cy - 32);
      ctx.lineTo(cx + 18, cy);
      ctx.lineTo(cx + 44, cy - 22);
      ctx.lineTo(cx + 38, cy + 26);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 38, cy + 34, 76, 6);
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
      flipForPlane(ctx, h);
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
