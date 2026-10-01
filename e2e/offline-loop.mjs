// No backend at all (static hosting): onboarding → offline mode → quick race vs local bots → results without rewards.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:4180';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/?autopilot=1`);
await page.getByTestId('name-input').waitFor({ timeout: 30000 });
await page.getByTestId('name-input').fill('Offline');
await page.getByTestId('start-button').tap();
await page.getByTestId('play-button').waitFor();
await page.waitForFunction(() => !document.querySelector('[data-testid="play-button"]').disabled);
console.log('✓ offline onboarding');
await page.getByTestId('play-button').tap();
await page.getByTestId('quick-race').tap();
await page.getByTestId('select-confirm').tap(); // vehicle selection step
await page.getByTestId('race-hud').waitFor({ timeout: 60000 });
console.log('✓ offline race started');
await page.getByTestId('results-screen').waitFor({ timeout: 400000 });
await page.getByTestId('rewards-unavailable').waitFor();
console.log('✓ results:', (await page.getByTestId('my-position').innerText()), '·', (await page.getByTestId('rewards-unavailable').innerText()).slice(0, 60) + '…');
const sw = await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : -1));
console.log('✓ service worker registrations:', sw);
console.log('PAGE ERRORS:', errors.join('\n') || 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
