// Two real browsers (two guest accounts) play together through the UI:
// A creates a lobby (1 lap), B joins with the code, both READY, host launches, both race (autopilot hook), both rewarded.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const mk = async (label, opts) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/vibrate/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  await page.goto(`${BASE}/?autopilot=1`);
  await page.getByTestId('name-input').waitFor({ timeout: 30000 });
  await page.getByTestId('name-input').fill(label);
  await page.getByTestId('start-button').click();
  await page.getByTestId('player-name').waitFor();
  await page.getByTestId('play-button').click();
  await page.getByTestId('play-screen').waitFor();
  return page;
};
const host = await mk(`Host${Date.now() % 1000}`, { viewport: { width: 800, height: 450 } });
const guest = await mk(`Guest${Date.now() % 1000}`, { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });

await host.getByTestId('create-lobby').click();
await host.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
await host.getByTestId('lobby-laps-1').click();
const code = (await host.getByTestId('lobby-code').innerText()).trim();
console.log('✓ lobby created, code', code);

await guest.getByTestId('join-code').fill(code);
await guest.getByTestId('join-lobby').tap();
await guest.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
await guest.getByTestId('lobby-vehicle-moto').tap();
await host.locator('[data-testid="lobby-players"] li').filter({ hasText: 'Motorcycle' }).waitFor({ timeout: 10000 });
console.log('✓ guest joined and picked the Motorcycle (visible on host)');

await guest.getByTestId('ready-button').tap();
await host.getByTestId('ready-button').click();
await host.waitForFunction(() => !document.querySelector('[data-testid="launch-button"]')?.hasAttribute('disabled'), null, { timeout: 10000 });
await host.screenshot({ path: `${OUT}/mp-lobby-host.png` });
await host.getByTestId('launch-button').click();
console.log('✓ both READY, host launched');

await Promise.all([host.getByTestId('race-hud').waitFor({ timeout: 60000 }), guest.getByTestId('race-hud').waitFor({ timeout: 60000 })]);
await host.waitForFunction(() => window.__raceRush?.session?.debugState?.().phase === 'racing', null, { timeout: 60000 });
await host.waitForTimeout(6000);
await host.screenshot({ path: `${OUT}/mp-race-host.png` });
await guest.screenshot({ path: `${OUT}/mp-race-guest.png` });
console.log('✓ race started on both clients');

await Promise.all([host.getByTestId('results-screen').waitFor({ timeout: 300000 }), guest.getByTestId('results-screen').waitFor({ timeout: 300000 })]);
await host.waitForTimeout(2500);
await host.screenshot({ path: `${OUT}/mp-results-host.png` });
await guest.screenshot({ path: `${OUT}/mp-results-guest.png` });
const read = async (p) => ({ pos: await p.getByTestId('my-position').innerText(), xp: await p.getByTestId('reward-xp').innerText(), vmru: await p.getByTestId('reward-vmru').innerText() });
const rh = await read(host);
const rg = await read(guest);
console.log('✓ results host', JSON.stringify(rh), 'guest', JSON.stringify(rg));
const table = await host.getByTestId('results-table').innerText();
console.log(table.replace(/\n+/g, ' | '));

// Rematch: both return to the lobby (status WAITING).
await host.getByTestId('rematch-button').click();
await host.getByTestId('lobby-screen').waitFor({ timeout: 10000 });
console.log('✓ host back in lobby for a rematch');
console.log('ERRORS:', errors.join('\n') || 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
