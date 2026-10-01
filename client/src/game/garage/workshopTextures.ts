import type { Scene } from '@babylonjs/core/scene';
import { createRng } from '@race-rush/shared';
import { flipForPlane, make, noise } from '../scene/textures';

/** Diagonal yellow / black hazard stripes (turntable rim). Wraps horizontally. */
export const hazardTexture = (scene: Scene) =>
  make(scene, 'wsHazard', 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffc61a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#15171c';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 32, h);
      ctx.lineTo(x + 32 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.closePath();
      ctx.fill();
    }
  });

/** Corrugated blue-grey wall panels. */
export const wallPanelTexture = (scene: Scene) =>
  make(scene, 'wsWall', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, '#2b3b63', 0.06, 9, 1500);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, 0, 6, h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 12, 0, 3, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - 6, w, 6);
  });

/** Polished workshop floor: large tiles with soft noise. */
export const floorTexture = (scene: Scene) =>
  make(scene, 'wsFloor', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, '#3a4766', 0.07, 13, 4000);
    ctx.strokeStyle = 'rgba(10,16,34,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  });

/** Red tool cabinet front with drawers and chrome handles. */
export const cabinetTexture = (scene: Scene) =>
  make(
    scene,
    'wsCabinet',
    128,
    128,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      ctx.fillStyle = '#c81e2a';
      ctx.fillRect(0, 0, w, h);
      const rows = 5;
      for (let i = 0; i < rows; i++) {
        const y = 6 + (i * (h - 12)) / rows;
        const dh = (h - 12) / rows - 4;
        ctx.fillStyle = '#e02a37';
        ctx.fillRect(6, y, w - 12, dh);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(6, y + dh - 2, w - 12, 2);
        ctx.fillStyle = '#d9dde6';
        ctx.fillRect(w * 0.3, y + dh * 0.35, w * 0.4, 3);
      }
    },
    { wrap: false },
  );

/** Sunny palm city seen through the open garage door. */
export const cityViewTexture = (scene: Scene) =>
  make(
    scene,
    'wsCityView',
    1024,
    640,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      sky.addColorStop(0, '#2f7fe6');
      sky.addColorStop(1, '#bfe3ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const rng = createRng(77);
      // Clouds.
      for (let i = 0; i < 9; i++) {
        const cx = rng() * w;
        const cy = 40 + rng() * 140;
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(cx + (rng() - 0.5) * 120, cy + (rng() - 0.5) * 16, 30 + rng() * 30, 14 + rng() * 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Towers (two depth layers).
      const pastel = ['#7fb7ff', '#f2b5c9', '#ffd38a', '#9fe0d0', '#c7b8ff', '#ffe8a6', '#86c5e8'];
      for (let layer = 0; layer < 2; layer++) {
        let x = -20;
        while (x < w) {
          const bw = 50 + rng() * 90;
          const bh = (layer === 0 ? 220 : 140) + rng() * (layer === 0 ? 220 : 160);
          const top = h * 0.72 - bh;
          ctx.fillStyle = pastel[Math.floor(rng() * pastel.length)];
          if (layer === 0) ctx.globalAlpha = 0.65;
          ctx.fillRect(x, top, bw, bh);
          ctx.globalAlpha = 1;
          ctx.fillStyle = layer === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(30,60,110,0.35)';
          for (let wy = top + 10; wy < h * 0.72 - 10; wy += 18)
            for (let wx = x + 8; wx < x + bw - 10; wx += 16) ctx.fillRect(wx, wy, 8, 10);
          x += bw + 6 + rng() * 20;
        }
      }
      // Street, curb and barrier.
      ctx.fillStyle = '#4a505c';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      for (let x = 0; x < w; x += 48) {
        ctx.fillStyle = (x / 48) % 2 ? '#f7f7f7' : '#e23b3b';
        ctx.fillRect(x, h * 0.72, 48, 22);
      }
      ctx.fillStyle = '#ffd03d';
      for (let x = 30; x < w; x += 140) ctx.fillRect(x, h * 0.88, 70, 8);
      // Palms.
      const palm = (px: number, scale: number) => {
        const baseY = h * 0.74;
        ctx.strokeStyle = '#7a5530';
        ctx.lineWidth = 10 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, baseY);
        ctx.quadraticCurveTo(px + 18 * scale, baseY - 140 * scale, px + 6 * scale, baseY - 260 * scale);
        ctx.stroke();
        ctx.fillStyle = '#2f9a45';
        const tx = px + 6 * scale;
        const ty = baseY - 260 * scale;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI + (i / 6) * Math.PI;
          ctx.beginPath();
          ctx.ellipse(tx + Math.cos(a) * 46 * scale, ty + Math.sin(a) * 18 * scale + 16 * scale, 52 * scale, 11 * scale, a * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      palm(120, 1);
      palm(430, 0.8);
      palm(760, 1.05);
      palm(960, 0.75);
    },
    { wrap: false },
  );

/** "SPEED / CUSTOM / WIN" garage poster. */
export const posterTexture = (scene: Scene) =>
  make(
    scene,
    'wsPoster',
    256,
    512,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#13265e');
      g.addColorStop(1, '#081230');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffc61a';
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textAlign = 'center';
      ctx.font = 'italic 900 64px "Russo One", Impact, sans-serif';
      const lines: [string, string][] = [
        ['SPEED', '#ffffff'],
        ['CUSTOM', '#ffd03d'],
        ['WIN', '#19e3ff'],
      ];
      lines.forEach(([t, c], i) => {
        ctx.fillStyle = c;
        ctx.fillText(t, w / 2, 120 + i * 92, w - 36);
      });
      // Little red car silhouette.
      ctx.fillStyle = '#e3262f';
      ctx.beginPath();
      ctx.moveTo(40, 450);
      ctx.lineTo(70, 420);
      ctx.lineTo(150, 410);
      ctx.lineTo(210, 432);
      ctx.lineTo(220, 452);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      for (const x of [80, 185]) {
        ctx.beginPath();
        ctx.arc(x, 455, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { wrap: false },
  );

/** Wall logo "RACE RUSH" with checkered flags (transparent background). */
export const logoSignTexture = (scene: Scene) =>
  make(
    scene,
    'wsLogo',
    1024,
    512,
    (ctx, w, h) => {
      flipForPlane(ctx, h);
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const word = (text: string, y: number, size: number, fill: CanvasGradient | string) => {
        ctx.font = `italic 900 ${size}px "Russo One", Impact, sans-serif`;
        ctx.lineWidth = 34;
        ctx.strokeStyle = '#0a1438';
        ctx.strokeText(text, w / 2, y);
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(text, w / 2, y);
        ctx.fillStyle = fill;
        ctx.fillText(text, w / 2, y);
      };
      const blue = ctx.createLinearGradient(0, 70, 0, 230);
      blue.addColorStop(0, '#7fc0ff');
      blue.addColorStop(1, '#1f6bff');
      const gold = ctx.createLinearGradient(0, 260, 0, 450);
      gold.addColorStop(0, '#ffe07a');
      gold.addColorStop(0.5, '#ffb21a');
      gold.addColorStop(1, '#ff6a1a');
      // Checkered flags.
      for (const [fx, dir] of [
        [150, -1],
        [w - 150, 1],
      ] as const) {
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 5; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
            ctx.fillRect(fx + dir * c * 22 - (dir < 0 ? 22 : 0), 110 + r * 22 + c * 4, 22, 22);
          }
      }
      word('RACE', 160, 170, blue);
      word('RUSH', 350, 200, gold);
    },
    { wrap: false, alpha: true },
  );
