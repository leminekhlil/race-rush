import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  ArcadeVehicle,
  AutoPilot,
  getTrackPath,
  gridSlot,
  PROTOCOL_VERSION,
  tunedVehicle,
  type ClientMessage,
  type GridEntry,
  type ServerMessage,
} from '@race-rush/shared';
import { RealtimeServer } from '../src/Server';

process.env.ALLOW_ANONYMOUS = 'true';
let server: RealtimeServer;
let port = 0;

class TestClient {
  ws!: WebSocket;
  inbox: ServerMessage[] = [];
  id = '';
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  async connect(name: string): Promise<void> {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMessage;
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) {
          w.resolve(m);
          const i = this.inbox.indexOf(m);
          if (i >= 0) this.inbox.splice(i, 1);
          return false;
        }
        return true;
      });
    });
    await new Promise((r) => this.ws.on('open', r));
    this.send({ t: 'hello', v: PROTOCOL_VERSION, name });
    const w = (await this.wait((m) => m.t === 'welcome')) as Extract<ServerMessage, { t: 'welcome' }>;
    this.id = w.id;
  }

  send(m: ClientMessage): void {
    this.ws.send(JSON.stringify(m));
  }

  wait(pred: (m: ServerMessage) => boolean, timeout = 15000): Promise<ServerMessage> {
    const hit = this.inbox.find(pred);
    if (hit) {
      this.inbox.splice(this.inbox.indexOf(hit), 1);
      return Promise.resolve(hit);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting message')), timeout);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }

  close(): void {
    this.ws.close();
  }
}

/** Drives a car with the shared simulation (exactly like the browser) and streams positions. */
const drive = (c: TestClient, grid: GridEntry[], trackId: string, startAt: number, opts: { cheatAfterMs?: number } = {}) => {
  const me = grid.find((g) => g.id === c.id)!;
  const path = getTrackPath(trackId);
  const slot = gridSlot(path, me.slot);
  const car = new ArcadeVehicle(path, tunedVehicle(me.vehicle, me.upgrades), slot.s, slot.lateral);
  const pilot = new AutoPilot(car, { skill: 1, lane: slot.lateral * 0.4, seed: me.slot, useBoost: true });
  let simTime = 0;
  let last = Date.now();
  let sendAcc = 0;
  let seq = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (now < startAt) return;
    simTime += dt;
    let steps = Math.round(dt * 60);
    while (steps-- > 0) car.step(1 / 60, pilot.update(1 / 60));
    car.events.length = 0;
    sendAcc += dt;
    if (sendAcc >= 1 / 15) {
      sendAcc = 0;
      const st = car.state;
      let x = st.x;
      let z = st.z;
      if (opts.cheatAfterMs && now - startAt > opts.cheatAfterMs) {
        // Teleport 400 m along the track.
        const p = path.pointAt(st.s + 400, 0);
        x = p.x;
        z = p.z;
      }
      c.send({ t: 'race.state', seq: seq++, x, y: st.y, z, h: st.heading, v: st.speed, f: 0 });
    }
  }, 1000 / 60);
  return () => clearInterval(timer);
};

beforeAll(async () => {
  server = new RealtimeServer();
  await server.listen(0, '127.0.0.1');
  port = (server.http.address() as { port: number }).port;
});

afterAll(() => server.close());

describe('realtime lobby', () => {
  it('creates a lobby, rejects bad codes, joins by code, handles READY and host leave', async () => {
    const a = new TestClient();
    const b = new TestClient();
    await a.connect('Alice');
    await b.connect('Bob');
    a.send({ t: 'lobby.create', trackId: 'city', laps: 3, botFill: true, vehicle: 'sport', color: 'red' });
    const created = (await a.wait((m) => m.t === 'lobby.state')) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(created.lobby.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(created.lobby.hostId).toBe(a.id);

    b.send({ t: 'lobby.join', code: 'ZZZZ', vehicle: 'moto', color: 'blue' });
    const err = (await b.wait((m) => m.t === 'error')) as Extract<ServerMessage, { t: 'error' }>;
    expect(err.code).toBe('lobby_not_found');

    b.send({ t: 'lobby.join', code: created.lobby.code.toLowerCase(), vehicle: 'moto', color: 'blue' });
    const joined = (await b.wait((m) => m.t === 'lobby.state' && m.lobby.players.length === 2)) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(joined.lobby.players.map((p) => p.vehicle).sort()).toEqual(['moto', 'sport']);

    // Premium paint without ownership is refused for anonymous players.
    b.send({ t: 'lobby.select', vehicle: 'moto', color: 'gold' });
    expect(((await b.wait((m) => m.t === 'error')) as Extract<ServerMessage, { t: 'error' }>).code).toBe('paint_locked');

    // Start refused until everyone is READY.
    a.send({ t: 'lobby.start' });
    expect(((await a.wait((m) => m.t === 'error')) as Extract<ServerMessage, { t: 'error' }>).code).toBe('not_ready');
    a.send({ t: 'lobby.ready', ready: true });
    b.send({ t: 'lobby.ready', ready: true });
    const ready = (await a.wait((m) => m.t === 'lobby.state' && m.lobby.status === 'READY')) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(ready.lobby.players.every((p) => p.ready)).toBe(true);

    // Host leaves: host role moves to Bob.
    a.send({ t: 'lobby.leave' });
    const after = (await b.wait((m) => m.t === 'lobby.state' && m.lobby.players.length === 1)) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(after.lobby.hostId).toBe(b.id);
    a.close();
    b.close();
  });
});

describe('realtime race', () => {
  it(
    'runs a full multiplayer race with bots, validates laps server-side and flags a teleporting cheater',
    async () => {
      const a = new TestClient();
      const b = new TestClient();
      await a.connect('Honest');
      await b.connect('Cheater');
      a.send({ t: 'lobby.create', trackId: 'city', laps: 1, botFill: true, vehicle: 'sport', color: 'red' });
      const { lobby } = (await a.wait((m) => m.t === 'lobby.state')) as Extract<ServerMessage, { t: 'lobby.state' }>;
      b.send({ t: 'lobby.join', code: lobby.code, vehicle: 'buggy', color: 'yellow' });
      await b.wait((m) => m.t === 'lobby.state' && m.lobby.players.length === 2);
      a.send({ t: 'lobby.ready', ready: true });
      b.send({ t: 'lobby.ready', ready: true });
      await a.wait((m) => m.t === 'lobby.state' && m.lobby.status === 'READY');
      a.send({ t: 'lobby.start' });

      const load = (await a.wait((m) => m.t === 'race.load')) as Extract<ServerMessage, { t: 'race.load' }>;
      expect(load.grid).toHaveLength(5);
      expect(load.grid.filter((g) => g.isBot)).toHaveLength(3);
      await b.wait((m) => m.t === 'race.load');
      a.send({ t: 'race.loaded' });
      b.send({ t: 'race.loaded' });
      const cd = (await a.wait((m) => m.t === 'race.countdown')) as Extract<ServerMessage, { t: 'race.countdown' }>;
      expect(cd.startAt).toBeGreaterThan(cd.serverTime);

      const stopA = drive(a, load.grid, 'city', cd.startAt);
      const stopB = drive(b, load.grid, 'city', cd.startAt, { cheatAfterMs: 8000 });
      const snap = (await a.wait((m) => m.t === 'race.snapshot', 10000)) as Extract<ServerMessage, { t: 'race.snapshot' }>;
      expect(snap.r).toHaveLength(5);

      const results = (await a.wait((m) => m.t === 'race.results', 90000)) as Extract<ServerMessage, { t: 'race.results' }>;
      stopA();
      stopB();
      const honest = results.results.find((r) => r.id === a.id)!;
      const cheater = results.results.find((r) => r.id === b.id)!;
      console.log(results.results.map((r) => `${r.position}. ${r.name}${r.isBot ? ' (bot)' : ''} ${r.time?.toFixed(2) ?? 'DNF'} ${r.flagged ? 'FLAGGED' : ''}`).join('\n'));
      expect(honest.finished).toBe(true);
      expect(honest.flagged).toBe(false);
      expect(honest.time!).toBeGreaterThan(20);
      expect(cheater.flagged).toBe(true);
      expect(results.results.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
      // The flagged cheater is classified last; bot names are distinct.
      expect(results.results.at(-1)!.id).toBe(b.id);
      expect(new Set(results.results.filter((r) => r.isBot).map((r) => r.name)).size).toBe(3);
      // Anonymous players get no rewards.
      expect(results.rewards).toBe('none');
      // Lobby returns to WAITING for a rematch.
      await a.wait((m) => m.t === 'lobby.state' && m.lobby.status === 'WAITING');
      a.close();
      b.close();
    },
    120000,
  );
});

describe('voice signalling', () => {
  it('relays WebRTC signals only between lobby members who opted in, and mints no TURN creds without a secret', async () => {
    const a = new TestClient();
    const b = new TestClient();
    const c = new TestClient();
    await a.connect('Alice');
    await b.connect('Bob');
    await c.connect('Eve');
    a.send({ t: 'lobby.create', trackId: 'city', laps: 3, botFill: false, vehicle: 'sport', color: 'red' });
    const created = (await a.wait((m) => m.t === 'lobby.state')) as Extract<ServerMessage, { t: 'lobby.state' }>;
    b.send({ t: 'lobby.join', code: created.lobby.code, vehicle: 'moto', color: 'blue' });
    await b.wait((m) => m.t === 'lobby.state' && m.lobby.players.length === 2);

    // Not opted in yet: signals are dropped.
    a.send({ t: 'voice.signal', to: b.id, signal: { kind: 'offer', sdp: 'v=0\r\n' } });

    a.send({ t: 'voice.state', on: true, mic: true });
    const cfg = (await a.wait((m) => m.t === 'voice.config')) as Extract<ServerMessage, { t: 'voice.config' }>;
    expect(cfg.iceServers.length).toBeGreaterThan(0);
    expect(cfg.iceServers.every((s) => !s.credential)).toBe(true);
    const st = (await b.wait((m) => m.t === 'lobby.state' && !!m.lobby.players.find((p) => p.id === a.id)?.voice)) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(st.lobby.players.find((p) => p.id === a.id)?.voice).toEqual({ on: true, mic: true });

    b.send({ t: 'voice.state', on: true, mic: false });
    await b.wait((m) => m.t === 'voice.config');
    a.send({ t: 'voice.signal', to: b.id, signal: { kind: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n' } });
    const got = (await b.wait((m) => m.t === 'voice.signal')) as Extract<ServerMessage, { t: 'voice.signal' }>;
    expect(got.from).toBe(a.id);
    expect(got.signal.kind).toBe('offer');

    // Malformed payloads and outsiders are ignored.
    a.send({ t: 'voice.signal', to: b.id, signal: { kind: 'offer', sdp: 'x'.repeat(20) } } as ClientMessage);
    c.send({ t: 'voice.signal', to: b.id, signal: { kind: 'ice', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } });
    a.send({ t: 'voice.signal', to: b.id, signal: { kind: 'ice', candidate: 'candidate:2', sdpMid: '0', sdpMLineIndex: 0 } });
    const ice = (await b.wait((m) => m.t === 'voice.signal')) as Extract<ServerMessage, { t: 'voice.signal' }>;
    expect(ice.from).toBe(a.id);
    expect(ice.signal).toMatchObject({ kind: 'ice', candidate: 'candidate:2' });

    // Leaving the lobby clears the voice flags.
    a.send({ t: 'lobby.leave' });
    const after = (await b.wait((m) => m.t === 'lobby.state' && m.lobby.players.length === 1)) as Extract<ServerMessage, { t: 'lobby.state' }>;
    expect(after.lobby.players[0].voice).toEqual({ on: true, mic: false });
    a.close();
    b.close();
    c.close();
  });
});
