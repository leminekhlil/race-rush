import type { GridEntry, LobbyDTO, ResultDTO, UpgradeLevels, VehicleId } from '@race-rush/shared';
import type { RaceConfig } from '../game/race/RaceSession';
import { createStore } from './store';

export type Screen = 'boot' | 'home' | 'play' | 'select' | 'lobby' | 'race' | 'results' | 'garage' | 'settings';

/** What the vehicle selection screen confirms into. */
export type PendingSelect = { kind: 'quick'; trackId: string } | { kind: 'lobby' } | { kind: 'browse' };

export interface PlayerVehicle {
  vehicle: VehicleId;
  owned: boolean;
  color: string;
  level: number;
  upgrades: UpgradeLevels;
}

export interface Profile {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpLevelStart: number;
  xpNextLevel: number;
  balance: number;
  selectedVehicle: VehicleId;
  vehicles: PlayerVehicle[];
  cosmetics: string[];
  racesPlayed: number;
  wins: number;
}

export interface CatalogPaint {
  code: string;
  name: string;
  hex: string;
  premium: boolean;
  price: number;
}

export interface Catalog {
  paints: CatalogPaint[];
  upgradeCosts: number[];
  maxUpgradeLevel: number;
  comingSoon: { code: string; name: string; type: string }[];
}

export interface RaceResultsState {
  raceId: string;
  results: ResultDTO[];
  rewards: 'granted' | 'unavailable' | 'none';
  localId: string;
  trackId: string;
  mode: 'offline' | 'online';
}

export interface AppState {
  screen: Screen;
  apiStatus: 'unknown' | 'online' | 'offline';
  profile: Profile | null;
  catalog: Catalog | null;
  trackId: string;
  lobby: LobbyDTO | null;
  race: RaceConfig | null;
  results: RaceResultsState | null;
  notice: { text: string; tone: 'info' | 'error' | 'good'; id: number } | null;
  busy: boolean;
  pendingSelect: PendingSelect | null;
}

export const appStore = createStore<AppState>({
  screen: 'boot',
  apiStatus: 'unknown',
  profile: null,
  catalog: null,
  trackId: 'city',
  lobby: null,
  race: null,
  results: null,
  notice: null,
  busy: false,
  pendingSelect: null,
});

let noticeId = 0;
export const notify = (text: string, tone: 'info' | 'error' | 'good' = 'info') => appStore.set({ notice: { text, tone, id: ++noticeId } });

export const goTo = (screen: Screen) => appStore.set({ screen });

export const openVehicleSelect = (pending: PendingSelect) => appStore.set({ pendingSelect: pending, screen: 'select' });

export type { GridEntry };
