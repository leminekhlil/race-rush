// Responsive screenshots of every menu screen at several viewports.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const VIEWPORTS = [
  { name: 'phone-land', width: 844, height: 390, mobile: true },
  { name: 'phone-port', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];
const only = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const vp of VIEWPORTS.filter((v) => !only || v.name === only)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${vp.name} console: ${m.text()}`));
  const click = (id) => (vp.mobile ? page.getByTestId(id).tap() : page.getByTestId(id).click());
  const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/ui-${vp.name}-${n}.png` }); };
  await page.goto(BASE);
  await page.getByTestId('name-input').waitFor({ timeout: 30000 });
  await page.getByTestId('name-input').fill(`Shot${vp.width}`);
  await click('start-button');
  await page.getByTestId('player-name').waitFor();
  await shot('home');
  await click('garage-button');
  await page.getByTestId('garage-screen').waitFor();
  await click('garage-vehicle-monster');
  await shot('garage-stats');
  // Compact layouts (phones) use tabs; the wide garage shows every panel at once.
  if (await page.getByTestId('garage-tab-paint').isVisible()) await click('garage-tab-paint');
  await shot('garage-paint');
  await click('select-vehicle');
  await click('garage-race');
  await page.getByTestId('play-screen').waitFor();
  await shot('play');
  await click('create-lobby');
  await page.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
  await shot('lobby');
  await click('ready-button');
  await shot('lobby-ready');
  await page.getByLabel('Retour').first().click();
  await page.getByTestId('play-screen').waitFor();
  await ctx.close();
  console.log('✓', vp.name);
}
console.log('ERRORS:', errors.filter((e) => !/vibrate/.test(e)).join('\n') || 'none');
await browser.close();
