import type { UpgradeLevels, VehicleId } from './vehicles';

export const PROTOCOL_VERSION = 1;

/** Network rates (Hz). */
export const NET_SEND_HZ = 15;
export const NET_SNAPSHOT_HZ = 15;
export const NET_STANDINGS_HZ = 4;
/** Remote interpolation delay (ms). */
export const NET_INTERP_DELAY = 120;

export const MAX_PLAYERS = 5;
export const COUNTDOWN_MS = 3000;
export const LOAD_TIMEOUT_MS = 20000;
/** After the first human finishes, others have this long before DNF. */
export const FINISH_GRACE_MS = 30000;

export type LobbyStatus = 'WAITING' | 'READY' | 'COUNTDOWN' | 'RACING' | 'FINISHED' | 'CLOSED';

export interface LobbyPlayerDTO {
  id: string;
  name: string;
  vehicle: VehicleId;
  color: string;
  ready: boolean;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  level: number;
}

export interface LobbyDTO {
  code: string;
  hostId: string;
  trackId: string;
  laps: number;
  status: LobbyStatus;
  maxPlayers: number;
  botFill: boolean;
  solo: boolean;
  players: LobbyPlayerDTO[];
}

export interface GridEntry {
  id: string;
  name: string;
  vehicle: VehicleId;
  color: string;
  isBot: boolean;
  slot: number;
  upgrades: UpgradeLevels;
}

/** Flags bitfield in racer state. */
export const FLAG_BOOST = 1;
export const FLAG_DRIFT = 2;
export const FLAG_AIR = 4;
export const FLAG_BRAKE = 8;

export interface RacerStateDTO {
  id: string;
  x: number;
  y: number;
  z: number;
  h: number;
  v: number;
  f: number;
}

export interface StandingDTO {
  id: string;
  position: number;
  lap: number;
  progress: number;
  finished: boolean;
  time: number | null;
}

export interface RewardDTO {
  xp: number;
  vmru: number;
  levelBefore: number;
  levelAfter: number;
  xpTotal: number;
  balance: number;
}

export interface ResultDTO {
  id: string;
  name: string;
  vehicle: VehicleId;
  color: string;
  position: number;
  time: number | null;
  bestLap: number | null;
  finished: boolean;
  isBot: boolean;
  flagged: boolean;
  reward: RewardDTO | null;
}

export type ClientMessage =
  | { t: 'hello'; v: number; ticket?: string; name?: string }
  | { t: 'ping'; c: number }
  | { t: 'lobby.create'; trackId: string; laps: number; botFill: boolean; solo?: boolean; vehicle: VehicleId; color: string }
  | { t: 'lobby.join'; code: string; vehicle: VehicleId; color: string }
  | { t: 'lobby.leave' }
  | { t: 'lobby.select'; vehicle: VehicleId; color: string }
  | { t: 'lobby.ready'; ready: boolean }
  | { t: 'lobby.config'; trackId?: string; laps?: number; botFill?: boolean }
  | { t: 'lobby.start' }
  | { t: 'race.loaded' }
  | { t: 'race.state'; seq: number; x: number; y: number; z: number; h: number; v: number; f: number }
  | { t: 'race.respawn' }
  | { t: 'race.quit' };

export type ServerMessage =
  | { t: 'welcome'; id: string; name: string; serverTime: number; authenticated: boolean }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; code: string; message: string }
  | { t: 'lobby.state'; lobby: LobbyDTO }
  | { t: 'lobby.left'; reason?: string }
  | { t: 'race.load'; raceId: string; trackId: string; laps: number; grid: GridEntry[] }
  | { t: 'race.countdown'; startAt: number; serverTime: number }
  | { t: 'race.snapshot'; s: number; r: RacerStateDTO[] }
  | { t: 'race.standings'; s: number; rows: StandingDTO[] }
  | { t: 'race.finish'; id: string; position: number; time: number }
  | { t: 'race.results'; raceId: string; results: ResultDTO[]; rewards: 'granted' | 'unavailable' | 'none' };

export const isClientMessage = (m: unknown): m is ClientMessage =>
  typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';
