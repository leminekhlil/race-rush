import type { Scene } from '@babylonjs/core/scene';
import { createRng } from '@race-rush/shared';
import { make } from '../textures';

/**
 * Facade textures for the modular city. Each style has a diffuse texture and an emissive "lit windows" texture
 * (random warm / cool interiors) that the night mode turns up. One texture repeat = one facade module:
 * 8 m wide × 7 m high (two floors), so buildings of any size tile cleanly.
 */
export type FacadeStyle = 'glass' | 'office' | 'apartment' | 'brick' | 'shop';

const W = 256;
const H = 256;

type WindowFn = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

const grid = (cols: number, rows: number, pad: { l: number; r: number; t: number; b: number }, fn: WindowFn) => {
  const cw = W / cols;
  const rh = H / rows;
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) cells.push({ x: c * cw + pad.l, y: r * rh + pad.t, w: cw - pad.l - pad.r, h: rh - pad.t - pad.b });
  return (ctx: CanvasRenderingContext2D) => cells.forEach((k) => fn(ctx, k.x, k.y, k.w, k.h));
};

const LAYOUT: Record<FacadeStyle, { cols: number; rows: number; pad: { l: number; r: number; t: number; b: number } }> = {
  glass: { cols: 4, rows: 2, pad: { l: 3, r: 3, t: 4, b: 10 } },
  office: { cols: 4, rows: 2, pad: { l: 2, r: 2, t: 34, b: 30 } },
  apartment: { cols: 4, rows: 2, pad: { l: 16, r: 16, t: 26, b: 40 } },
  brick: { cols: 4, rows: 2, pad: { l: 18, r: 18, t: 22, b: 36 } },
  shop: { cols: 2, rows: 1, pad: { l: 10, r: 10, t: 70, b: 18 } },
};

const paintDiffuse = (style: FacadeStyle) => (ctx: CanvasRenderingContext2D) => {
  const rng = createRng(style.length * 97);
  const L = LAYOUT[style];
  const fill = (c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  };
  switch (style) {
    case 'glass': {
      fill('#c9d3dd');
      grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
        const g = c.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, '#6f8fb5');
        g.addColorStop(0.5, '#a9c3e0');
        g.addColorStop(1, '#5d7ea6');
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(x + w * 0.1, y, w * 0.12, h);
      })(ctx);
      ctx.fillStyle = '#8e99a6';
      for (let r = 0; r < 2; r++) ctx.fillRect(0, (r + 1) * (H / 2) - 10, W, 10);
      break;
    }
    case 'office': {
      fill('#e6e1d6');
      ctx.fillStyle = '#d5cfc2';
      for (let r = 0; r < 2; r++) ctx.fillRect(0, r * (H / 2) + 100, W, 6);
      grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
        c.fillStyle = '#3f5874';
        c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.fillRect(x, y, w, 6);
      })(ctx);
      break;
    }
    case 'apartment': {
      fill('#f1ece3');
      grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
        c.fillStyle = '#f9f7f2';
        c.fillRect(x - 4, y - 4, w + 8, h + 8);
        c.fillStyle = '#41546b';
        c.fillRect(x, y, w, h);
        c.fillStyle = '#8b5a3c';
        c.fillRect(x, y, w, h * 0.12);
        // Balcony rail.
        c.fillStyle = '#5b6470';
        c.fillRect(x - 10, y + h + 10, w + 20, 5);
        for (let k = 0; k <= 6; k++) c.fillRect(x - 10 + (k * (w + 20)) / 6, y + h + 10, 2, 22);
        c.fillRect(x - 10, y + h + 30, w + 20, 3);
      })(ctx);
      break;
    }
    case 'brick': {
      fill('#a6543a');
      for (let y = 0; y < H; y += 8) {
        for (let x = (y / 8) % 2 ? -8 : 0; x < W; x += 16) {
          ctx.fillStyle = rng() < 0.5 ? '#9b4c33' : '#b25e42';
          ctx.fillRect(x + 1, y + 1, 14, 6);
        }
      }
      grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
        c.fillStyle = '#efe7da';
        c.fillRect(x - 4, y - 6, w + 8, h + 14);
        c.fillStyle = '#2f3f52';
        c.fillRect(x, y, w, h);
        c.fillStyle = '#efe7da';
        c.fillRect(x + w / 2 - 2, y, 4, h);
        c.fillRect(x, y + h * 0.45, w, 4);
      })(ctx);
      break;
    }
    case 'shop': {
      fill('#d9d4ca');
      grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
        c.fillStyle = '#2b3442';
        c.fillRect(x, y, w, h);
        const g = c.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#7e98b6');
        g.addColorStop(1, '#3d4f66');
        c.fillStyle = g;
        c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#20262f';
        c.fillRect(x + w * 0.38, y + h * 0.18, w * 0.24, h * 0.82);
      })(ctx);
      ctx.fillStyle = '#4a4f57';
      ctx.fillRect(0, 0, W, 30);
      break;
    }
  }
};

const WARM = ['#ffd38a', '#ffc46b', '#ffe3a8', '#ffb15c'];
const COOL = ['#bfe3ff', '#9fd0ff', '#e6f3ff'];

const paintEmissive = (style: FacadeStyle) => (ctx: CanvasRenderingContext2D) => {
  const rng = createRng(style.length * 31 + 7);
  const L = LAYOUT[style];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const litChance = style === 'office' || style === 'glass' ? 0.6 : style === 'shop' ? 1 : 0.62;
  grid(L.cols, L.rows, L.pad, (c, x, y, w, h) => {
    if (rng() > litChance) return;
    const pal = style === 'office' || style === 'glass' ? (rng() < 0.6 ? COOL : WARM) : WARM;
    const col = pal[Math.floor(rng() * pal.length)];
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, col);
    g.addColorStop(1, `${col}99`);
    c.globalAlpha = style === 'shop' ? 1 : 0.65 + rng() * 0.35;
    c.fillStyle = g;
    c.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Curtains / silhouettes.
    if (style !== 'shop' && rng() < 0.35) {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(x + 1, y + 1, w * (0.2 + rng() * 0.3), h - 2);
    }
    c.globalAlpha = 1;
  })(ctx);
};

export const facadeTextures = (scene: Scene, style: FacadeStyle) => ({
  diffuse: make(scene, `facade-${style}`, W, H, paintDiffuse(style)),
  emissive: make(scene, `facade-${style}-lit`, W, H, paintEmissive(style)),
});

/* -------------------------------------------------------------- signs atlas */

export interface SignDef {
  text: string;
  bg: string;
  fg: string;
  glow: string;
}

export const SHOP_SIGNS: SignDef[] = [
  { text: 'PIZZA', bg: '#2b0b0b', fg: '#ff5a3d', glow: '#ff2a1a' },
  { text: 'CAFÉ', bg: '#1b120b', fg: '#ffd38a', glow: '#ffb15c' },
  { text: 'SUSHI', bg: '#0b1420', fg: '#ff6fb5', glow: '#ff2a8a' },
  { text: 'BURGER', bg: '#1d1406', fg: '#ffc61a', glow: '#ff9a00' },
  { text: 'HÔTEL', bg: '#0a1024', fg: '#7fd4ff', glow: '#19b5ff' },
  { text: '24/7', bg: '#08180d', fg: '#5dff8f', glow: '#1fdc5a' },
  { text: 'CINÉMA', bg: '#1a0a24', fg: '#c79bff', glow: '#9a4dff' },
  { text: 'PHARMACIE', bg: '#06180c', fg: '#4dff7a', glow: '#11c94a' },
  { text: 'MODE', bg: '#1c0d16', fg: '#ff9ad1', glow: '#ff4fa3' },
  { text: 'GARAGE', bg: '#0f1418', fg: '#ffffff', glow: '#9fb3c8' },
  { text: 'TACOS', bg: '#1f0f05', fg: '#ff8a1f', glow: '#ff6a00' },
  { text: 'BOOST BAR', bg: '#04121a', fg: '#19e3ff', glow: '#00b8ff' },
];

/** 4 × 3 atlas of neon shop signs (512 × 96 cells). Night: emissive at full strength. */
export const SIGN_COLS = 4;
export const SIGN_ROWS = 3;
export const signAtlas = (scene: Scene) =>
  make(
    scene,
    'shopSigns',
    2048,
    384,
    (ctx, w, h) => {
      const cw = w / SIGN_COLS;
      const ch = h / SIGN_ROWS;
      SHOP_SIGNS.forEach((s, i) => {
        // Canvas textures are sampled with canvas-top at v = 0 on our quads: cell i spans v ∈ [row/rows, (row+1)/rows]
        // and its artwork is drawn vertically flipped.
        const x = (i % SIGN_COLS) * cw;
        const y = Math.floor(i / SIGN_COLS) * ch;
        ctx.save();
        ctx.translate(x, y + ch);
        ctx.scale(1, -1);
        ctx.fillStyle = s.bg;
        ctx.fillRect(4, 4, cw - 8, ch - 8);
        ctx.strokeStyle = s.glow;
        ctx.lineWidth = 5;
        ctx.strokeRect(10, 10, cw - 20, ch - 20);
        ctx.font = `900 ${s.text.length > 7 ? 48 : 60}px "Russo One", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = s.glow;
        ctx.shadowBlur = 18;
        ctx.fillStyle = s.fg;
        ctx.fillText(s.text, cw / 2, ch / 2 + 3, cw - 40);
        ctx.shadowBlur = 0;
        ctx.restore();
      });
    },
    { wrap: false },
  );

/* ------------------------------------------------------------ billboards atlas */

const ADS: { title: string; sub: string; a: string; b: string; fg: string }[] = [
  { title: 'RACE RUSH', sub: 'LA VILLE EST À TOI', a: '#1f6bff', b: '#19e3ff', fg: '#ffffff' },
  { title: 'TURBO COLA', sub: 'ÉNERGIE PURE', a: '#e3262f', b: '#ff8a1f', fg: '#ffffff' },
  { title: 'v-MRU', sub: 'GAGNE • AMÉLIORE • GAGNE', a: '#ffc61a', b: '#ff7a1a', fg: '#1a1200' },
  { title: 'MATER IT', sub: 'SOFTWARE ENGINEERING', a: '#0f2a5c', b: '#1f6bff', fg: '#ffffff' },
  { title: 'NEON NIGHTS', sub: 'FESTIVAL D’ÉTÉ', a: '#8a3dff', b: '#ff4fa3', fg: '#ffffff' },
  { title: 'PALM BEACH', sub: 'HÔTEL & SPA ★★★★', a: '#14a38b', b: '#7fe0c8', fg: '#ffffff' },
];
export const AD_COUNT = ADS.length;

/** 2 × 3 atlas of large billboards (512 × 256 cells). */
export const adAtlas = (scene: Scene) =>
  make(
    scene,
    'cityAds',
    1024,
    768,
    (ctx, w, h) => {
      const cw = w / 2;
      const ch = h / 3;
      ADS.forEach((ad, i) => {
        const x = (i % 2) * cw;
        const y = Math.floor(i / 2) * ch;
        ctx.save();
        ctx.translate(x, y + ch);
        ctx.scale(1, -1);
        const g = ctx.createLinearGradient(0, 0, cw, ch);
        g.addColorStop(0, ad.a);
        g.addColorStop(1, ad.b);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(cw * 0.55, 0);
        ctx.lineTo(cw, 0);
        ctx.lineTo(cw, ch);
        ctx.lineTo(cw * 0.35, ch);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = ad.fg;
        ctx.font = 'italic 900 70px "Russo One", Impact, sans-serif';
        ctx.fillText(ad.title, cw / 2, ch * 0.55, cw - 40);
        ctx.font = '700 28px "Rajdhani", Arial, sans-serif';
        ctx.fillText(ad.sub, cw / 2, ch * 0.82, cw - 40);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, cw - 8, ch - 8);
        ctx.restore();
      });
    },
    { wrap: false },
  );

/** Night sky: deep blue gradient, stars, faint city glow on the horizon. */
export const nightSkyTexture = (scene: Scene) =>
  make(
    scene,
    'nightSky',
    1024,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02040d');
      g.addColorStop(0.35, '#0a1233');
      g.addColorStop(0.5, '#2b2550');
      g.addColorStop(0.53, '#3a2a55');
      g.addColorStop(1, '#0b0d18');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rng = createRng(99);
      for (let i = 0; i < 700; i++) {
        const y = rng() * h * 0.46;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.75})`;
        const s = rng() < 0.08 ? 2 : 1;
        ctx.fillRect(rng() * w, y, s, s);
      }
      // Moon.
      const mg = ctx.createRadialGradient(w * 0.7, h * 0.18, 0, w * 0.7, h * 0.18, 40);
      mg.addColorStop(0, 'rgba(255,250,235,1)');
      mg.addColorStop(0.35, 'rgba(255,250,235,0.95)');
      mg.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.18, 40, 0, Math.PI * 2);
      ctx.fill();
    },
    { wrap: false },
  );

/** Soft round light pool (street lamps on the road at night), additive. */
export const lightPoolTexture = (scene: Scene) =>
  make(
    scene,
    'lightPool',
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,214,150,0.9)');
      g.addColorStop(0.45, 'rgba(255,190,120,0.35)');
      g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { wrap: false, alpha: true },
  );
