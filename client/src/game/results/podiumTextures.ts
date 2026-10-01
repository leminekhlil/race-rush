import type { Scene } from '@babylonjs/core/scene';
import { flipForPlane, make } from '../scene/textures';

export const PODIUM_COLORS = [
  { light: '#ffe07a', mid: '#ffc61a', dark: '#b07d00' },
  { light: '#f2f5fb', mid: '#c3cad8', dark: '#7c8597' },
  { light: '#ffc08a', mid: '#e0823c', dark: '#8a4515' },
] as const;

const crown = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(60,35,0,0.9)';
  ctx.lineWidth = s * 0.08;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.55);
  ctx.lineTo(cx - s * 1.1, cy - s * 0.55);
  ctx.lineTo(cx - s * 0.45, cy);
  ctx.lineTo(cx, cy - s * 0.8);
  ctx.lineTo(cx + s * 0.45, cy);
  ctx.lineTo(cx + s * 1.1, cy - s * 0.55);
  ctx.lineTo(cx + s, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

/** Laurel branch hugging the number: leaves along an arc on the left (side = -1) or right (side = 1). */
const laurel = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, side: 1 | -1, color: string) => {
  ctx.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const deg = side < 0 ? 125 + t * 110 : 55 - t * 110;
    const a = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2 + side * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.09, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

/** Front face of a podium block: dark panel, coloured trims, big gradient number (laurels for the winner). */
export const podiumFaceTexture = (scene: Scene, place: 1 | 2 | 3) =>
  make(
    scene,
    `podiumFace${place}`,
    512,
    256,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      const c = PODIUM_COLORS[place - 1];
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2c3346');
      bg.addColorStop(1, '#161b28');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c.mid;
      ctx.fillRect(0, 0, w, 16);
      ctx.fillRect(0, 0, 22, h);
      ctx.fillRect(w - 22, 0, 22, h);
      ctx.fillStyle = c.dark;
      ctx.fillRect(0, h - 12, w, 12);
      const g = ctx.createLinearGradient(0, 50, 0, 220);
      g.addColorStop(0, c.light);
      g.addColorStop(0.55, c.mid);
      g.addColorStop(1, c.dark);
      ctx.font = 'italic 900 170px "Russo One", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(String(place), w / 2, h / 2 + 10);
      ctx.fillStyle = g;
      ctx.fillText(String(place), w / 2, h / 2 + 10);
      if (place === 1) {
        laurel(ctx, w / 2, h / 2 + 12, 100, -1, c.mid);
        laurel(ctx, w / 2, h / 2 + 12, 100, 1, c.mid);
      }
    },
    { wrap: false },
  );

/** Name plate above a podium vehicle: coloured place badge, name, time (+ crown for the winner). */
export const namePlateTexture = (scene: Scene, place: 1 | 2 | 3, name: string, time: string, local: boolean) =>
  make(
    scene,
    `plate${place}-${name}`,
    512,
    208,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      ctx.clearRect(0, 0, w, h);
      const c = PODIUM_COLORS[place - 1];
      const top = 64;
      const ph = h - top - 6;
      ctx.fillStyle = local ? 'rgba(40,30,0,0.92)' : 'rgba(8,14,34,0.9)';
      ctx.strokeStyle = local ? '#ffd03d' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 5;
      const r = 22;
      ctx.beginPath();
      ctx.roundRect(110, top, w - 116, ph, r);
      ctx.fill();
      ctx.stroke();
      const badge = ctx.createLinearGradient(0, top, 0, top + ph);
      badge.addColorStop(0, c.light);
      badge.addColorStop(1, c.dark);
      ctx.fillStyle = badge;
      ctx.beginPath();
      ctx.moveTo(10, top);
      ctx.lineTo(130, top);
      ctx.lineTo(110, top + ph);
      ctx.lineTo(10, top + ph);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'italic 900 96px "Russo One", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#121624';
      ctx.fillText(String(place), 64, top + ph / 2 + 4);
      ctx.textAlign = 'left';
      ctx.font = '700 52px "Rajdhani", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name.slice(0, 12), 150, top + ph * 0.34);
      ctx.font = '700 44px "Rajdhani", Arial, sans-serif';
      ctx.fillStyle = '#ffd03d';
      ctx.fillText(time, 150, top + ph * 0.74);
      if (place === 1) crown(ctx, w / 2 + 50, 34, 34, '#ffc61a');
    },
    { wrap: false, alpha: true },
  );

/** Plain white rectangle used by the confetti particles (tinted per system). */
export const confettiTexture = (scene: Scene) =>
  make(
    scene,
    'confetti',
    16,
    32,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    },
    { wrap: false, mips: false },
  );
