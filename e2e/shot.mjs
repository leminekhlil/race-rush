// Usage: node e2e/shot.mjs <url> <outPrefix> <waitMs> [width] [height] [shotsEveryMs]
import { chromium } from '@playwright/test';
const [url, out, wait = '8000', w = '1280', h = '720', every = '0'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
if (process.env.NIGHT) await page.addInitScript(() => { try { const k = 'raceRush.settings.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.timeOfDay = 'night'; localStorage.setItem(k, JSON.stringify(s)); } catch {} });
await page.goto(url);
const start = Date.now();
let i = 0;
if (+every > 0) {
  while (Date.now() - start < +wait) {
    await page.waitForTimeout(+every);
    await page.screenshot({ path: `${out}-${i++}.png` });
    const st = await page.evaluate(() => window.__raceRush?.session?.debugState?.() ?? null).catch(() => null);
    console.log('state', JSON.stringify(st));
  }
} else {
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: `${out}.png` });
  const st = await page.evaluate(() => window.__raceRush?.session?.debugState?.() ?? null).catch(() => null);
  console.log('state', JSON.stringify(st));
}
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 40).join('\n'));
await browser.close();
