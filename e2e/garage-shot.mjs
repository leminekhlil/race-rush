// Usage: node e2e/garage-shot.mjs <outPrefix> [width] [height] [mobile]
import { chromium } from '@playwright/test';
const [out = '/tmp/claude-0/shots/garage', w = '1280', h = '720', mobile = '0'] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const m = mobile === '1';
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, isMobile: m, hasTouch: m, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => msg.type() === 'error' && errors.push(`console: ${msg.text()}`));
await page.goto(BASE);
await page.getByTestId('name-input').waitFor({ timeout: 30000 });
await page.getByTestId('name-input').fill('Garage');
await page.getByTestId('start-button').click();
await page.getByTestId('player-name').waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-home.png` });
await page.getByTestId('garage-button').click();
await page.getByTestId('garage-screen').waitFor();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}-0.png` });
for (const extra of (process.env.CLICKS ?? '').split(',').filter(Boolean)) {
  await page.getByTestId(extra).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${extra}.png` });
}
console.log('ERRORS:', errors.filter((e) => !/vibrate/.test(e)).join('\n') || 'none');
await browser.close();
