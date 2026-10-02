// Voice chat E2E: two browsers in one lobby with Chromium's fake microphone (beep tone), WebRTC mesh over loopback.
// Checks: opt-in flow, peer connection, remote audio playback element, speaking indicator, local mute, self mute,
// track release on leave, and the "permission refused" path in a third browser without a mic grant.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/shots';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const gl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: exe, args: [...gl, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const errors = [];
const ok = (m) => console.log('✓', m);
const mk = async (b, label, opts) => {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'warning' && m.text().includes('[api]') && console.log('  ', label, m.text()));
  page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && console.log('  ', label, r.status(), r.url()));
  page.on('console', (m) => m.type() === 'error' && !/vibrate|favicon/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
  await page.goto(BASE);
  // Skip the cinematic intro (it covers the screen and would swallow the first click).
  for (let i = 0; i < 30 && !(await page.getByTestId('name-input').isVisible().catch(() => false)); i++) {
    await page.getByTestId('intro').click({ timeout: 1000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  await page.getByTestId('name-input').waitFor({ timeout: 30000 });
  await page.getByTestId('name-input').fill(label);
  await page.getByTestId('start-button').click();
  await page.getByTestId('player-name').waitFor();
  await page.waitForFunction(() => !!window.__raceRushApp?.get().profile, null, { timeout: 20000 }).catch(async () => {
    throw new Error(`${label}: no server profile ${JSON.stringify(await page.evaluate(() => { const s = window.__raceRushApp?.get(); return { api: s?.apiStatus, busy: s?.busy, notices: s?.notices }; }))}`);
  });
  await page.getByTestId('play-button').click();
  await page.getByTestId('play-screen').waitFor();
  return page;
};
const voice = (p) => p.evaluate(() => {
  const v = window.__raceRushVoice;
  const s = v.store.get();
  const els = [...document.querySelectorAll('audio[data-peer]')].map((e) => ({ peer: e.dataset.peer, muted: e.muted, live: !!e.srcObject?.getAudioTracks().some((t) => t.readyState === 'live') }));
  return { status: s.status, mic: s.mic, error: s.error, peers: s.peers, els, localTrack: v.chat.stream?.getAudioTracks()[0]?.readyState ?? null };
});

const host = await mk(browser, `VHost${Date.now() % 1000}`, { viewport: { width: 1100, height: 620 }, permissions: ['microphone'] });
const guest = await mk(browser, `VGuest${Date.now() % 1000}`, { viewport: { width: 1100, height: 620 }, permissions: ['microphone'] });
await host.getByTestId('create-lobby').click();
await host.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
const code = (await host.getByTestId('lobby-code').innerText()).trim();
await guest.getByTestId('join-code').fill(code);
await guest.getByTestId('join-lobby').click();
await guest.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
ok(`lobby ${code} with 2 players`);

// Nothing is requested before the explicit click.
const before = await voice(host);
if (before.status !== 'off' || before.localTrack) throw new Error('voice active before opt-in');
ok('voice off and no mic track before opt-in');

await host.getByTestId('voice-toggle').click();
await host.getByTestId('mic-toggle').click();
await guest.getByTestId('voice-toggle').click();
await guest.getByTestId('mic-toggle').click();
await host.waitForFunction(() => window.__raceRushVoice.store.get().mic === 'on', null, { timeout: 10000 });
await host.waitForFunction(() => Object.values(window.__raceRushVoice.store.get().peers).some((p) => p.link === 'connected'), null, { timeout: 20000 });
await guest.waitForFunction(() => Object.values(window.__raceRushVoice.store.get().peers).some((p) => p.link === 'connected'), null, { timeout: 20000 });
ok('WebRTC peer connection established both ways');

await host.waitForFunction(() => document.querySelector('audio[data-peer]')?.srcObject?.getAudioTracks().length > 0, null, { timeout: 10000 });
// Chromium's fake mic emits a periodic beep: the guest must show up as speaking on the host at some point.
await host.waitForFunction(() => Object.values(window.__raceRushVoice.store.get().peers).some((p) => p.speaking), null, { timeout: 15000 });
ok('remote audio element playing and speaking indicator lit');
await host.screenshot({ path: `${OUT}/voice-lobby-host.png` });
await guest.screenshot({ path: `${OUT}/voice-lobby-guest.png` });

// Local mute of the other player.
const guestId = (await voice(host)).els[0].peer;
await host.getByTestId(`voice-mute-${guestId}`).click();
if (!(await voice(host)).els[0].muted) throw new Error('local mute did not mute the element');
await host.getByTestId(`voice-mute-${guestId}`).click();
ok('local mute / unmute of a player');

// Self mute: the host sees the guest's mic flag drop.
await guest.getByTestId('mic-mute').click();
await host.locator(`[data-testid="voice-badge-${guestId}"]`).filter({ hasText: '🔈' }).waitFor({ timeout: 5000 });
await guest.getByTestId('mic-mute').click();
await host.locator(`[data-testid="voice-badge-${guestId}"]`).filter({ hasText: '🎤' }).waitFor({ timeout: 5000 });
ok('self mute visible to the other player');

// Leaving the lobby releases the microphone and closes the connections.
await guest.getByTestId('lobby-quit').click();
await guest.waitForTimeout(800);
const g = await voice(guest);
if (g.localTrack !== null || g.status !== 'off' || g.els.length) throw new Error(`guest not cleaned: ${JSON.stringify(g)}`);
await host.waitForFunction(() => document.querySelectorAll('audio[data-peer]').length === 0, null, { timeout: 8000 });
ok('leave: mic tracks stopped, peer closed, remote audio removed');

// Turning voice off on the host stops its track too.
await host.getByTestId('voice-toggle').click();
const h = await voice(host);
if (h.localTrack !== null || h.status !== 'off') throw new Error('host not cleaned');
ok('voice off: tracks stopped');
await browser.close();

// Permission refused path (no fake UI, no grant).
const b2 = await chromium.launch({ executablePath: exe, args: [...gl, '--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
const solo = await mk(b2, `VDeny${Date.now() % 1000}`, { viewport: { width: 1100, height: 620 } });
await solo.getByTestId('create-lobby').click();
await solo.getByTestId('lobby-screen').waitFor({ timeout: 15000 });
await solo.getByTestId('mic-toggle').click();
await solo.getByTestId('voice-error').waitFor({ timeout: 10000 });
const d = await voice(solo);
console.log('  denied state:', d.mic, '-', d.error);
if (d.mic !== 'denied') errors.push(`expected denied, got ${d.mic}`);
else ok('permission refused handled');
await solo.screenshot({ path: `${OUT}/voice-denied.png` });
await b2.close();

console.log('ERRORS:', errors.join('\n') || 'none');
process.exit(errors.length ? 1 : 0);
