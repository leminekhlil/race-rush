// Production smoke test of an extracted Hostinger package (Apache + .htaccess + laravel-api.php + imported SQL).
// Usage: BASE_URL=http://localhost:8081 node e2e/hostinger-smoke.mjs
// No autoplay override: audio must unlock from the user's first tap, like on a real phone/desktop.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 640 } });
const errors = [];
const bad = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/vibrate|favicon/.test(m.text()) && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
const ok = (m) => console.log('✓', m);
const audio = () => page.evaluate(() => ({ ctx: window.__raceRushAudio?.ctx?.state ?? 'none', samples: null }));

await page.goto(BASE);
for (let i = 0; i < 30 && !(await page.getByTestId('name-input').isVisible().catch(() => false)); i++) {
  await page.getByTestId('intro').click({ timeout: 1000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}
ok('intro skipped, onboarding visible');
await page.getByTestId('name-input').fill('Preprod');
await page.getByTestId('start-button').click();
await page.getByTestId('vmru-balance').first().waitFor({ timeout: 20000 });
const bal0 = (await page.getByTestId('vmru-balance').first().innerText()).replace(/\D/g, '');
ok(`guest account created through /api (balance ${bal0} v-MRU)`);
await page.waitForTimeout(1500);
const a = await audio();
if (a.ctx !== 'running') errors.push(`audio not running after gesture: ${a.ctx}`);
else ok('audio unlocked by the first tap (no autoplay flag)');
if (await page.getByTestId('home-create').isEnabled()) errors.push('home "Créer une partie" should be disabled without realtime server');
await page.screenshot({ path: `${OUT}/prod-home.png` });

await page.getByTestId('garage-button').click();
await page.getByTestId('garage-screen').waitFor();
await page.getByTestId('garage-tab-upgrades').click().catch(() => undefined);
await page.getByTestId('upgrade-engine').click();
await page.waitForTimeout(1500);
const bal1 = (await page.getByTestId('vmru-balance').first().innerText()).replace(/\D/g, '');
if (!(Number(bal1) < Number(bal0))) errors.push(`upgrade did not debit v-MRU (${bal0} → ${bal1})`);
else ok(`garage upgrade purchased server-side (${bal0} → ${bal1} v-MRU)`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/prod-garage.png` });

await page.getByTestId('garage-race').click();
await page.getByTestId('play-screen').waitFor();
if (await page.getByTestId('create-lobby').isEnabled()) errors.push('multiplayer should be disabled without realtime server');
await page.getByTestId('multi-unavailable').waitFor();
ok('multiplayer / voice cleanly disabled (no realtime server configured)');
await page.screenshot({ path: `${OUT}/prod-play.png` });
await page.getByTestId('quick-race').click();
await page.getByTestId('select-confirm').click();
await page.getByTestId('race-hud').waitFor({ timeout: 90000 });
ok('offline race loaded (3D city, GLB car, environment map)');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(14000);
const t = await page.getByTestId('hud-time').innerText();
await page.screenshot({ path: `${OUT}/prod-race.png` });
await page.keyboard.up('ArrowUp');
ok(`race running, chrono ${t}`);

const sw = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state ?? 'none');
console.log('  service worker:', sw);
const real = bad.filter((b) => !/\/favicon/.test(b));
console.log('HTTP >= 400:', real.join('\n') || 'none');
console.log('ERRORS:', errors.join('\n') || 'none');
await browser.close();
process.exit(errors.length || real.length ? 1 : 0);
