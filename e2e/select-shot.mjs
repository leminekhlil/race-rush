// Screenshots of the vehicle selection screen (phone landscape + desktop).
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const vp of [{ n: 'phone', width: 844, height: 390, m: true }, { n: 'desktop', width: 1280, height: 800, m: false }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.m, hasTouch: vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  await page.getByTestId('name-input').fill(`Sel${vp.width}`);
  await page.getByTestId('start-button').click();
  await page.getByTestId('player-name').waitFor();
  await page.getByTestId('play-button').click();
  await page.getByTestId('quick-race').click();
  await page.getByTestId('select-screen').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="select-card-"] img').length === 4, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/select-${vp.n}.png` });
  await page.close();
}
console.log('ERRORS', errors.join('\n') || 'none');
await browser.close();
