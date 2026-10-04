import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { RealtimeServer } from '../src/Server';
import { config } from '../src/config';
import { PROTOCOL_VERSION } from '@race-rush/shared';

let server: RealtimeServer;
let url: string;
const original = { origins: config.allowedOrigins, anonymous: config.allowAnonymous };
beforeAll(async () => {
  config.allowedOrigins = ['https://racerush.pro.mr']; config.allowAnonymous = false;
  server = new RealtimeServer(); await server.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); config.allowedOrigins = original.origins; config.allowAnonymous = original.anonymous; });

describe('cloud HTTP and WebSocket boundary', () => {
  it('exposes health to monitors and the permitted frontend origin only', async () => {
    expect((await fetch(`${url}/health`)).status).toBe(200);
    const allowed = await fetch(`${url}/health`, { headers: { Origin: 'https://racerush.pro.mr' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://racerush.pro.mr');
    expect((await allowed.json()).ok).toBe(true);
    expect((await fetch(`${url}/health`, { headers: { Origin: 'https://other.invalid' } })).status).toBe(403);
  });
  it('rejects WebSocket upgrades from a foreign browser origin', async () => {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws', { origin: 'https://other.invalid' });
    const error = await new Promise<Error>((resolve) => ws.once('error', resolve));
    expect(error.message).toContain('403');
  });
  it('accepts the expected browser origin but still rejects anonymous players', async () => {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws', { origin: 'https://racerush.pro.mr' });
    await new Promise<void>((resolve) => ws.once('open', resolve));
    const closed = new Promise<number>((resolve) => ws.once('close', resolve));
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Test' }));
    expect(await closed).toBe(4005);
  });
});
