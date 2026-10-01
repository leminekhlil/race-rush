// Full MVP loop through the real UI on an emulated phone (landscape, touch).
// Home → onboarding → garage (paint) → play → online quick race (3 laps, autopilot test hook) → results + rewards.
import { chromium, devices } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); };
const shot = (n) => page.screenshot({ path: `${OUT}/mvp-${n}.png` });

const name = `E2E${Math.floor(Math.random() * 9000 + 1000)}`;
await step('home + onboarding', async () => {
  await page.goto(`${BASE}/?autopilot=1`);
  await page.getByTestId('name-input').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('01-home-onboarding');
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('start-button').tap();
  await page.getByTestId('player-name').filter({ hasText: name }).waitFor({ timeout: 15000 });
  await page.getByTestId('vmru-balance').filter({ hasText: '500' }).waitFor();
  await page.waitForTimeout(1200);
  await shot('02-home-profile');
});

await step('garage: paint sport car blue, check upgrade tab', async () => {
  await page.getByTestId('garage-button').tap();
  await page.getByTestId('garage-screen').waitFor();
  await page.getByTestId('garage-tab-paint').tap();
  await page.getByTestId('paint-blue').tap();
  await page.waitForTimeout(1500);
  await shot('03-garage-paint');
  await page.getByTestId('garage-tab-upgrades').tap();
  await page.waitForTimeout(400);
  await shot('04-garage-upgrades');
  await page.getByTestId('garage-race').tap();
});

let raceStart = 0;
await step('play: online quick race on City', async () => {
  await page.getByTestId('play-screen').waitFor();
  await shot('05-play');
  await page.getByTestId('quick-track-city').tap();
  await page.getByTestId('quick-race').tap();
  await page.getByTestId('select-confirm').tap(); // vehicle selection step
  await page.getByTestId('race-hud').waitFor({ timeout: 60000 });
  raceStart = Date.now();
  await page.waitForFunction(() => window.__raceRush?.session?.debugState?.().phase === 'racing', null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot('06-race');
});

await step('race: 3 laps to the finish line', async () => {
  let lastLap = 0;
  for (;;) {
    const st = await page.evaluate(() => window.__raceRush?.session?.debugState?.() ?? null);
    if (!st || st.phase === 'results' || st.finished) break;
    if (st.lap !== lastLap) { lastLap = st.lap; console.log(`   lap ${st.lap} · t=${st.raceTime.toFixed(1)}s · fps=${st.fps.toFixed(1)} · drawCalls=${st.drawCalls}`); if (st.lap === 2) await shot('07-race-lap2'); }
    if (Date.now() - raceStart > 420000) throw new Error('race too long');
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1500);
  await shot('08-finish');
});

let rewards = null;
await step('results with server rewards', async () => {
  await page.getByTestId('results-screen').waitFor({ timeout: 90000 });
  await page.getByTestId('reward-vmru').waitFor({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await shot('09-results');
  rewards = { position: await page.getByTestId('my-position').innerText(), xp: await page.getByTestId('reward-xp').innerText(), vmru: await page.getByTestId('reward-vmru').innerText() };
  console.log('   results:', JSON.stringify(rewards));
});

await step('profile updated server-side (balance & XP)', async () => {
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem('raceRush.token.v1');
    const r = await fetch('./api/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    return (await r.json()).profile;
  });
  console.log('   profile:', JSON.stringify({ level: me.level, xp: me.xp, balance: me.balance, racesPlayed: me.racesPlayed, wins: me.wins }));
  const vm = Number(rewards.vmru.replace(/[^0-9]/g, ''));
  if (me.balance !== 500 + vm) throw new Error(`balance mismatch ${me.balance} vs ${500 + vm}`);
  if (me.racesPlayed !== 1) throw new Error('racesPlayed not incremented');
});

await step('rematch goes back into a new race', async () => {
  await page.getByTestId('rematch-button').tap();
  await page.getByTestId('race-hud').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__raceRush?.session && null);
});

const relevant = errors.filter((e) => !/vibrate|DevTools/.test(e));
console.log('CONSOLE/PAGE ERRORS:', relevant.length ? relevant.join('\n') : 'none');
await browser.close();
process.exit(relevant.length ? 1 : 0);
