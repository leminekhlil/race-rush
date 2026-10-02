// Dev only: autopilot lap on a track, screenshot when the player passes given lap fractions.
// Usage: TRACK=city node e2e/tour-shots.mjs 0.15,0.46,0.65
import { chromium } from '@playwright/test';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const track = process.env.TRACK ?? 'city';
const targets = (process.argv[2] ?? '0.1,0.3,0.5,0.7,0.9').split(',').map(Number);
const LEN = { city: 1651, desert: 1379 }[track] ?? 1500;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:5173/?dev=1&track=${track}&autopilot=1&bots=2&laps=1&quality=${process.env.Q ?? 'standard'}`);
let i = 0;
const t0 = Date.now();
while (i < targets.length && Date.now() - t0 < 240000) {
  const st = await page.evaluate(() => window.__raceRush?.session?.debugState?.() ?? null).catch(() => null);
  if (st && st.phase === 'racing' && st.progress / LEN >= targets[i]) {
    await page.screenshot({ path: `${OUT}/tour-${track}-${targets[i]}.png` });
    console.log('✓', targets[i], 'fps', st.fps?.toFixed(1), 'draw', st.drawCalls);
    i++;
  }
  await page.waitForTimeout(150);
}
console.log('ERRORS:', errors.join('\n') || 'none');
await browser.close();
