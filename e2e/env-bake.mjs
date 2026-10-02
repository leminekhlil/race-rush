// Dev tool: bake public/_hdr/*.hdr into public/env/*.env through Babylon in headless Chromium.
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
const jobs = JSON.parse(process.argv[2]);
mkdirSync('client/public/env', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(6000);
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3000);
for (const [hdr, out, size] of jobs) {
  const b64 = await page.evaluate(async ([u, s]) => (await import('/src/dev/envBake.ts')).bake(u, s), [`/_hdr/${hdr}`, size]);
  writeFileSync(`client/public/env/${out}`, Buffer.from(b64, 'base64'));
  console.log('✓', out, Math.round(Buffer.from(b64, 'base64').length / 1024), 'KB');
}
await browser.close();
