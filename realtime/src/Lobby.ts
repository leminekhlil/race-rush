import {
  isVehicleId,
  MAX_PLAYERS,
  NO_UPGRADES,
  PAINTS,
  TRACKS,
  VEHICLE_IDS,
  type GridEntry,
  type LobbyDTO,
  type LobbyStatus,
  type ResultDTO,
  type ServerMessage,
  type VehicleId,
} from '@race-rush/shared';
import type { Client } from './Client';
import { RaceRoom } from './RaceRoom';
import { internalCall } from './api';
import { config } from './config';
import { log } from './logger';

const BOT_NAMES = ['Nitro', 'Viper', 'Blaze', 'Turbo', 'Comet', 'Raptor', 'Flash', 'Storm'];

interface Member {
  client: Client;
  ready: boolean;
  joinedAt: number;
}

export class Lobby {
  status: LobbyStatus = 'WAITING';
  hostId: string;
  members: Member[] = [];
  race: RaceRoom | null = null;
  private autoStartTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly code: string,
    host: Client,
    public trackId: string,
    public laps: number,
    public botFill: boolean,
    readonly solo: boolean,
    private readonly onEmpty: (lobby: Lobby) => void,
  ) {
    this.hostId = host.id;
    this.add(host);
    log('info', 'lobby.created', { code, host: host.id, solo, track: trackId });
  }

  get maxPlayers(): number {
    return this.solo ? 1 : MAX_PLAYERS;
  }

  has(client: Client): boolean {
    return this.members.some((m) => m.client === client);
  }

  add(client: Client): void {
    this.members.push({ client, ready: false, joinedAt: Date.now() });
    client.lobbyCode = this.code;
  }

  remove(client: Client): void {
    this.members = this.members.filter((m) => m.client !== client);
    client.lobbyCode = null;
    if (this.race) {
      this.race.onDisconnect(client);
      if (this.race.abortIfEmpty()) {
        this.race = null;
        this.status = 'WAITING';
      }
    }
    if (this.hostId === client.id && this.members.length) this.hostId = this.members[0].client.id;
    if (!this.members.length) {
      this.status = 'CLOSED';
      this.persist();
      this.onEmpty(this);
      return;
    }
    this.refreshStatus();
    this.broadcastState();
  }

  select(client: Client, vehicle: VehicleId, color: string): string | null {
    if (this.race) return 'race_in_progress';
    if (!isVehicleId(vehicle)) return 'invalid_vehicle';
    const paint = PAINTS.find((p) => p.id === color);
    if (!paint) return 'invalid_color';
    if (!client.canUsePaint(vehicle, color, paint.premium)) return 'paint_locked';
    client.vehicle = vehicle;
    client.color = color;
    this.broadcastState();
    return null;
  }

  setReady(client: Client, ready: boolean): void {
    const m = this.members.find((x) => x.client === client);
    if (!m || this.race) return;
    m.ready = ready;
    this.refreshStatus();
    this.broadcastState();
    this.scheduleAutoStart();
  }

  configure(client: Client, cfg: { trackId?: string; laps?: number; botFill?: boolean }): string | null {
    if (client.id !== this.hostId) return 'not_host';
    if (this.race) return 'race_in_progress';
    if (cfg.trackId !== undefined) {
      if (!(cfg.trackId in TRACKS)) return 'invalid_track';
      this.trackId = cfg.trackId;
    }
    if (cfg.laps !== undefined) {
      if (!Number.isInteger(cfg.laps) || cfg.laps < 1 || cfg.laps > 5) return 'invalid_laps';
      this.laps = cfg.laps;
    }
    if (cfg.botFill !== undefined) this.botFill = !!cfg.botFill;
    for (const m of this.members) m.ready = false;
    this.refreshStatus();
    this.broadcastState();
    return null;
  }

  private refreshStatus(): void {
    if (this.race) return;
    this.status = this.members.length > 0 && this.members.every((m) => m.ready) ? 'READY' : 'WAITING';
    this.persist();
  }

  /** Auto-launch when the lobby is full and everyone is ready (host can launch earlier). */
  private scheduleAutoStart(): void {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.autoStartTimer = null;
    if (this.status === 'READY' && this.members.length >= this.maxPlayers) {
      this.autoStartTimer = setTimeout(() => this.start(null), 1500);
    }
  }

  start(by: Client | null): string | null {
    if (this.race) return 'race_in_progress';
    if (by && by.id !== this.hostId) return 'not_host';
    if (!this.solo && !this.members.every((m) => m.ready)) return 'not_ready';
    const grid: GridEntry[] = [];
    let slot = 0;
    // Humans first (join order) at the back of the grid, bots ahead: humans chase.
    const humans = [...this.members].sort((a, b) => a.joinedAt - b.joinedAt);
    const botCount = this.botFill || this.solo ? Math.max(0, MAX_PLAYERS - humans.length) : 0;
    const total = humans.length + botCount;
    const humanSlots = Array.from({ length: humans.length }, (_, i) => total - humans.length + i);
    let bi = 0;
    for (slot = 0; slot < total; slot++) {
      const hi = humanSlots.indexOf(slot);
      if (hi >= 0) {
        const c = humans[hi].client;
        grid.push({ id: c.id, name: c.name, vehicle: c.vehicle, color: c.color, isBot: false, slot, upgrades: c.upgradesFor(c.vehicle) });
      } else {
        const seed = this.code.charCodeAt(0) + this.code.charCodeAt(1);
        grid.push({
          id: `bot-${bi}`,
          name: BOT_NAMES[(seed + bi) % BOT_NAMES.length],
          vehicle: VEHICLE_IDS[(seed + bi) % VEHICLE_IDS.length],
          color: PAINTS[(seed + bi * 3) % PAINTS.length].id,
          isBot: true,
          slot,
          upgrades: { ...NO_UPGRADES },
        });
        bi++;
      }
    }
    const clients = new Map(this.members.map((m) => [m.client.id, m.client]));
    this.status = 'COUNTDOWN';
    this.persist();
    this.broadcastState();
    this.race = new RaceRoom({
      trackId: this.trackId,
      laps: this.laps,
      grid,
      clients,
      lobbyCode: this.code,
      onDone: (results) => this.onRaceDone(results),
    });
    this.status = 'RACING';
    this.persist();
    return null;
  }

  private onRaceDone(_results: ResultDTO[]): void {
    this.race = null;
    this.status = 'FINISHED';
    this.persist();
    for (const m of this.members) m.ready = false;
    this.status = 'WAITING';
    this.broadcastState();
  }

  toDTO(): LobbyDTO {
    return {
      code: this.code,
      hostId: this.hostId,
      trackId: this.trackId,
      laps: this.laps,
      status: this.status,
      maxPlayers: this.maxPlayers,
      botFill: this.botFill,
      solo: this.solo,
      players: this.members.map((m) => ({
        id: m.client.id,
        name: m.client.name,
        vehicle: m.client.vehicle,
        color: m.client.color,
        ready: m.ready,
        isBot: false,
        isHost: m.client.id === this.hostId,
        connected: m.client.connected,
        level: m.client.level,
      })),
    };
  }

  broadcast(msg: ServerMessage): void {
    for (const m of this.members) m.client.send(msg);
  }

  broadcastState(): void {
    this.broadcast({ t: 'lobby.state', lobby: this.toDTO() });
  }

  /** Fire-and-forget persistence of lobby state (observability / history). */
  persist(): void {
    if (!config.secret) return;
    const hostUser = this.members.find((m) => m.client.id === this.hostId)?.client.userId ?? null;
    const userIds = this.members.map((m) => m.client.userId).filter((u): u is number => u !== null);
    if (!userIds.length && this.status !== 'CLOSED') return;
    internalCall('POST', '/api/internal/lobbies', {
      code: this.code,
      host_user_id: hostUser,
      track: this.trackId,
      laps: this.laps,
      status: this.status,
      bot_fill: this.botFill,
      solo: this.solo,
      max_players: this.maxPlayers,
      user_ids: userIds,
    }).catch(() => undefined);
  }

  dispose(): void {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.race?.dispose();
  }
}
