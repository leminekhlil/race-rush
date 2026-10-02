// Renders client/public/app-icons/icon.svg into the PWA PNG icons (run: node scripts/generate-icons.mjs).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('client/public/app-icons/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
for (const [size, maskable] of [[192, false], [512, false], [512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  const pad = maskable ? size * 0.12 : 0;
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#081230' : 'transparent'}"><div style="padding:${pad}px;width:${size - pad * 2}px;height:${size - pad * 2}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: `client/public/app-icons/icon-${size}${maskable ? '-maskable' : ''}.png`, omitBackground: !maskable });
}
await browser.close();
