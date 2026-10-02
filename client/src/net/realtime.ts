import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type GridEntry,
  type LobbyDTO,
  type ResultDTO,
  type ServerMessage,
} from '@race-rush/shared';
import type { RaceNetAdapter } from '../game/race/RaceSession';
import { netBridge } from './raceBridge';
import { VoiceChat } from './voice/VoiceChat';

export interface RealtimeHandlers {
  onLobby(lobby: LobbyDTO | null): void;
  onRaceLoad(load: { raceId: string; trackId: string; laps: number; grid: GridEntry[]; localId: string }): void;
  onResults(raceId: string, results: ResultDTO[], rewards: 'granted' | 'unavailable' | 'none'): void;
  onError(code: string, message: string): void;
  onClosed(): void;
}

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * WebSocket client: authentication, clock sync (NTP-style, best RTT sample), message routing.
 */
export class RealtimeClient implements RaceNetAdapter {
  private ws: WebSocket | null = null;
  id = '';
  name = '';
  authenticated = false;
  private offset = 0;
  private bestRtt = Infinity;
  private pingTimer: number | null = null;
  private seq = 0;
  private closedByUs = false;

  constructor(private readonly handlers: RealtimeHandlers) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && !!this.id;
  }

  connect(ticket: string | null, name: string): Promise<void> {
    if (this.connected) return Promise.resolve();
    this.closedByUs = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(WS_URL);
      this.ws = ws;
      const fail = (msg: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };
      const timeout = window.setTimeout(() => {
        fail('timeout');
        ws.close();
      }, 6000);
      ws.onopen = () => this.send({ t: 'hello', v: PROTOCOL_VERSION, ticket: ticket ?? undefined, name });
      ws.onerror = () => fail('ws error');
      ws.onclose = () => {
        window.clearTimeout(timeout);
        fail('closed');
        this.stopPing();
        this.id = '';
        if (!this.closedByUs) this.handlers.onClosed();
      };
      ws.onmessage = (ev) => {
        let m: ServerMessage;
        try {
          m = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (m.t === 'welcome') {
          this.id = m.id;
          this.name = m.name;
          this.authenticated = m.authenticated;
          this.offset = m.serverTime - Date.now();
          this.startPing();
          window.clearTimeout(timeout);
          settled = true;
          resolve();
          return;
        }
        this.route(m);
      };
    });
  }

  private route(m: ServerMessage): void {
    switch (m.t) {
      case 'pong': {
        const now = Date.now();
        const rtt = now - m.c;
        if (rtt < this.bestRtt * 1.5 || rtt < 60) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = m.s + rtt / 2 - now;
        }
        return;
      }
      case 'error':
        if (VoiceChat.onServerError(m.code)) return;
        this.handlers.onError(m.code, m.message);
        return;
      case 'voice.config':
        VoiceChat.onConfig(m.iceServers);
        return;
      case 'voice.signal':
        VoiceChat.onSignal(m.from, m.signal);
        return;
      case 'lobby.state':
        this.handlers.onLobby(m.lobby);
        return;
      case 'lobby.left':
        this.handlers.onLobby(null);
        return;
      case 'race.load':
        netBridge.reset();
        this.handlers.onRaceLoad({ raceId: m.raceId, trackId: m.trackId, laps: m.laps, grid: m.grid, localId: this.id });
        return;
      case 'race.countdown':
        netBridge.countdown(m.startAt);
        return;
      case 'race.snapshot':
        netBridge.session?.onSnapshot(m.s, m.r);
        return;
      case 'race.standings':
        netBridge.session?.onStandings(m.rows);
        return;
      case 'race.finish':
        return;
      case 'race.results':
        if (netBridge.session) netBridge.session.showResults(m.results, m.rewards);
        else this.handlers.onResults(m.raceId, m.results, m.rewards);
        return;
      default:
        return;
    }
  }

  private startPing(): void {
    this.stopPing();
    const ping = () => this.send({ t: 'ping', c: Date.now() });
    ping();
    window.setTimeout(ping, 300);
    window.setTimeout(ping, 700);
    this.pingTimer = window.setInterval(ping, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.closedByUs = true;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.id = '';
  }

  // RaceNetAdapter
  serverNow(): number {
    return Date.now() + this.offset;
  }

  sendState(s: { x: number; y: number; z: number; h: number; v: number; f: number }): void {
    this.send({ t: 'race.state', seq: this.seq++, ...s });
  }

  sendRespawn(): void {
    this.send({ t: 'race.respawn' });
  }

  sendLoaded(): void {
    this.send({ t: 'race.loaded' });
  }
}
