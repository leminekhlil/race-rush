import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { isClientMessage, isVehicleId, PROTOCOL_VERSION, TRACKS, type ClientMessage } from '@race-rush/shared';
import { Client } from './Client';
import { Lobby } from './Lobby';
import { config } from './config';
import { log } from './logger';
import { verifyTicket } from './tickets';
import { iceServersFor, sanitizeSignal } from './voice';

// No 0/O/1/I to keep codes readable when shared aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RealtimeServer {
  readonly http: HttpServer;
  private readonly wss: WebSocketServer;
  readonly lobbies = new Map<string, Lobby>();
  private readonly clients = new Set<Client>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.http = createServer((req, res) => {
      if (req.url === '/health' || req.url === '/ws/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, lobbies: this.lobbies.size, clients: this.clients.size }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
    this.http.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req));
    });
    this.heartbeat = setInterval(() => this.sweep(), 15000);
  }

  listen(port = config.port, host = config.host): Promise<void> {
    return new Promise((resolve) => this.http.listen(port, host, () => resolve()));
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const l of this.lobbies.values()) l.dispose();
    for (const c of this.clients) c.close(1001, 'server shutdown');
    this.wss.close();
    this.http.close();
  }

  private sweep(): void {
    for (const ws of this.wss.clients) {
      const w = ws as WebSocket & { isAlive?: boolean };
      if (w.isAlive === false) {
        w.terminate();
        continue;
      }
      w.isAlive = false;
      w.ping();
    }
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const w = ws as WebSocket & { isAlive?: boolean };
    w.isAlive = true;
    ws.on('pong', () => (w.isAlive = true));
    let client: Client | null = null;
    const helloTimeout = setTimeout(() => {
      if (!client) ws.close(4001, 'hello timeout');
    }, 5000);

    ws.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.close(4002, 'bad json');
        return;
      }
      if (!isClientMessage(msg)) return;
      if (!client) {
        if (msg.t !== 'hello') return;
        clearTimeout(helloTimeout);
        client = this.authenticate(ws, msg, req);
        return;
      }
      if (!client.allowMessage()) {
        if (msg.t === 'race.state' || msg.t.startsWith('voice.')) return; // silently drop floods
      }
      try {
        this.handle(client, msg);
      } catch (err) {
        log('error', 'ws.handler_error', { client: client.id, type: msg.t, error: String(err) });
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimeout);
      if (!client) return;
      this.clients.delete(client);
      const lobby = client.lobbyCode ? this.lobbies.get(client.lobbyCode) : undefined;
      lobby?.remove(client);
      log('info', 'ws.disconnected', { client: client.id });
    });
    ws.on('error', (err) => log('warn', 'ws.error', { error: String(err) }));
  }

  private authenticate(ws: WebSocket, msg: Extract<ClientMessage, { t: 'hello' }>, req: IncomingMessage): Client | null {
    if (msg.v !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ t: 'error', code: 'protocol', message: 'Version du client obsolète, recharge la page.' }));
      ws.close(4003, 'protocol');
      return null;
    }
    const ticket = msg.ticket ? verifyTicket(msg.ticket) : null;
    if (msg.ticket && !ticket) {
      ws.send(JSON.stringify({ t: 'error', code: 'bad_ticket', message: 'Session expirée.' }));
      ws.close(4004, 'bad ticket');
      return null;
    }
    if (!ticket && !config.allowAnonymous) {
      ws.close(4005, 'auth required');
      return null;
    }
    const client = new Client(ws, ticket, typeof msg.name === 'string' ? msg.name : undefined);
    this.clients.add(client);
    client.send({ t: 'welcome', id: client.id, name: client.name, serverTime: Date.now(), authenticated: !!ticket });
    log('info', 'ws.connected', { client: client.id, authenticated: !!ticket, ip: req.socket.remoteAddress });
    return client;
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.lobbies.has(code)) return code;
    }
  }

  private error(client: Client, code: string, message: string): void {
    client.send({ t: 'error', code, message });
  }

  private lobbyOf(client: Client): Lobby | undefined {
    return client.lobbyCode ? this.lobbies.get(client.lobbyCode) : undefined;
  }

  private handle(client: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'ping':
        client.send({ t: 'pong', c: Number(msg.c) || 0, s: Date.now() });
        return;
      case 'lobby.create': {
        this.lobbyOf(client)?.remove(client);
        const trackId = msg.trackId in TRACKS ? msg.trackId : 'city';
        const laps = Number.isInteger(msg.laps) && msg.laps >= 1 && msg.laps <= 5 ? msg.laps : 3;
        const lobby = new Lobby(this.newCode(), client, trackId, laps, msg.botFill !== false, !!msg.solo, (l) => {
          l.dispose();
          this.lobbies.delete(l.code);
        });
        this.lobbies.set(lobby.code, lobby);
        const err = lobby.select(client, isVehicleId(msg.vehicle) ? msg.vehicle : 'sport', msg.color);
        if (err) lobby.select(client, isVehicleId(msg.vehicle) ? msg.vehicle : 'sport', 'red');
        lobby.persist();
        lobby.broadcastState();
        if (lobby.solo) lobby.start(client);
        return;
      }
      case 'lobby.join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const lobby = this.lobbies.get(code);
        if (!lobby || lobby.solo) return this.error(client, 'lobby_not_found', 'Code de partie introuvable.');
        if (lobby.has(client)) return lobby.broadcastState();
        if (lobby.race) return this.error(client, 'race_in_progress', 'Course déjà en cours.');
        if (lobby.members.length >= lobby.maxPlayers) return this.error(client, 'lobby_full', 'Partie complète.');
        this.lobbyOf(client)?.remove(client);
        lobby.add(client);
        if (lobby.select(client, isVehicleId(msg.vehicle) ? msg.vehicle : 'sport', msg.color)) lobby.select(client, isVehicleId(msg.vehicle) ? msg.vehicle : 'sport', 'red');
        log('info', 'lobby.joined', { code, client: client.id });
        lobby.persist();
        lobby.broadcastState();
        return;
      }
      case 'lobby.leave': {
        this.lobbyOf(client)?.remove(client);
        client.send({ t: 'lobby.left' });
        return;
      }
      case 'lobby.select': {
        const lobby = this.lobbyOf(client);
        if (!lobby) return;
        const err = lobby.select(client, msg.vehicle, msg.color);
        if (err) this.error(client, err, 'Sélection refusée.');
        return;
      }
      case 'lobby.ready':
        this.lobbyOf(client)?.setReady(client, !!msg.ready);
        return;
      case 'lobby.config': {
        const err = this.lobbyOf(client)?.configure(client, msg);
        if (err) this.error(client, err, 'Configuration refusée.');
        return;
      }
      case 'lobby.start': {
        const err = this.lobbyOf(client)?.start(client);
        if (err) this.error(client, err, err === 'not_ready' ? 'Tous les joueurs doivent être READY.' : 'Lancement refusé.');
        return;
      }
      case 'race.loaded':
        this.lobbyOf(client)?.race?.onLoaded(client);
        return;
      case 'race.state':
        this.lobbyOf(client)?.race?.onState(client, msg);
        return;
      case 'race.respawn':
        this.lobbyOf(client)?.race?.onRespawn(client);
        return;
      case 'race.quit': {
        const lobby = this.lobbyOf(client);
        lobby?.race?.onDisconnect(client);
        return;
      }
      case 'voice.state': {
        const lobby = this.lobbyOf(client);
        if (!lobby) return;
        if (!config.voiceEnabled || lobby.solo) return this.error(client, 'voice_unavailable', 'Voice chat indisponible pour cette partie.');
        const on = msg.on === true;
        const wasOn = client.voice.on;
        lobby.setVoice(client, on, msg.mic === true);
        if (on && !wasOn) {
          client.send({ t: 'voice.config', ...iceServersFor(client.id) });
          log('info', 'voice.joined', { code: lobby.code, client: client.id });
        }
        return;
      }
      case 'voice.signal': {
        const lobby = this.lobbyOf(client);
        if (!lobby || !client.voice.on || typeof msg.to !== 'string' || msg.to === client.id) return;
        const peer = lobby.member(msg.to);
        if (!peer?.voice.on) return; // only between two lobby members who both opted in
        const signal = sanitizeSignal(msg.signal);
        if (!signal) return;
        peer.send({ t: 'voice.signal', from: client.id, signal });
        return;
      }
      default:
        return;
    }
  }
}
