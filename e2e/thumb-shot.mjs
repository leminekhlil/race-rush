// Dev only: renders large 3D thumbnails of vehicles through the Vite dev server. Usage: node e2e/thumb-shot.mjs <outDir> <vehicle:color>...
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const [out = '/tmp/claude-0/shots', ...specs] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(process.env.BASE_URL ?? 'http://localhost:5173');
await page.waitForTimeout(3000);
for (const spec of specs.length ? specs : ['buggy:yellow']) {
  const [vehicle, color] = spec.split(':');
  const url = await page.evaluate(async ([v, c]) => (await import('/src/game/garage/Thumbnails.ts')).vehicleThumbnail(v, c, 800, 480), [vehicle, color]);
  writeFileSync(`${out}/thumb-${vehicle}-${color}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('✓', spec);
}
await browser.close();
