// Collects render metrics per quality profile (SwiftShader = CPU rendering: FPS is NOT representative of phones).
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
for (const q of ['eco', 'standard', 'high']) {
  for (const track of ['city', 'desert']) {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(`${BASE}/?dev=1&track=${track}&vehicle=sport&autopilot=1&quality=${q}`);
    await page.waitForFunction(() => window.__raceRush?.session?.debugState?.().phase === 'racing', null, { timeout: 120000 });
    await page.waitForTimeout(6000);
    const m = await page.evaluate(() => {
      const s = window.__raceRush.session;
      const sc = s.scene;
      const d = s.debugState();
      return {
        fps: +d.fps.toFixed(1),
        drawCalls: d.drawCalls,
        activeMeshes: d.activeMeshes,
        triangles: Math.round(sc.getActiveIndices() / 3),
        totalVertices: sc.getTotalVertices(),
        meshes: sc.meshes.length,
        textures: sc.textures.length,
        particles: sc.particleSystems.length,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        havok: d.physicsProps,
      };
    });
    console.log(q.padEnd(9), track.padEnd(7), JSON.stringify(m));
    await page.close();
  }
}
await browser.close();
