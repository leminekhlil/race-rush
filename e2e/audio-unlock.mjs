// Audio unlock check WITHOUT the autoplay override: audio must stay locked until a real gesture, then music runs.
// Usage: node e2e/audio-unlock.mjs [url]
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(1500);
const state = () =>
  page.evaluate(() => ({
    ctx: window.__raceRushAudio?.ctx?.state ?? 'none',
    music: window.__raceRushMusic?.get?.() ?? null,
    chip: document.querySelector('[data-testid=sound-chip]')?.getAttribute('data-status') ?? null,
  }));
const before = await state();
console.log('before gesture', JSON.stringify(before));
await page.mouse.click(640, 360); // skips the intro (real user gesture)
await page.waitForTimeout(2500);
const after = await state();
console.log('after gesture ', JSON.stringify(after));
await page.click('[data-testid=sound-chip]');
await page.waitForTimeout(400);
const muted = await page.evaluate(() => ({ chip: document.querySelector('[data-testid=sound-chip]')?.getAttribute('data-status'), gain: window.__raceRushAudio?.master?.gain.value }));
await page.click('[data-testid=sound-chip]');
console.log('mute toggle   ', JSON.stringify(muted));
const ok = before.ctx !== 'running' && after.ctx === 'running' && after.music?.playing === true && muted.chip === 'muted';
console.log(ok ? 'AUDIO_UNLOCK_OK' : 'AUDIO_UNLOCK_FAIL', errors.length ? errors : '');
await browser.close();
process.exit(ok ? 0 : 1);
