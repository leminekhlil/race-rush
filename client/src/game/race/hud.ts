import { createStore } from '../../state/store';

export type RacePhase = 'loading' | 'intro' | 'countdown' | 'racing' | 'finished' | 'results';

export interface StandingRow {
  id: string;
  name: string;
  position: number;
  isLocal: boolean;
  isBot: boolean;
  finished: boolean;
  time: number | null;
  lap: number;
  color: string;
  vehicle: string;
}

export interface HudState {
  phase: RacePhase;
  loadingProgress: number;
  loadingLabel: string;
  countdown: number | 'GO' | null;
  lap: number;
  laps: number;
  position: number;
  total: number;
  raceTime: number;
  speedKmh: number;
  speedRatio: number;
  boost: number;
  boosting: boolean;
  drifting: boolean;
  airborne: boolean;
  wrongWay: boolean;
  offline: boolean;
  standings: StandingRow[];
  toast: { text: string; id: number; tone: 'info' | 'good' | 'warn' } | null;
  lastLap: number | null;
  bestLap: number | null;
  fps: number;
  paused: boolean;
}

export const initialHud = (): HudState => ({
  phase: 'loading',
  loadingProgress: 0,
  loadingLabel: 'Chargement…',
  countdown: null,
  lap: 1,
  laps: 3,
  position: 1,
  total: 1,
  raceTime: 0,
  speedKmh: 0,
  speedRatio: 0,
  boost: 0,
  boosting: false,
  drifting: false,
  airborne: false,
  wrongWay: false,
  offline: true,
  standings: [],
  toast: null,
  lastLap: null,
  bestLap: null,
  fps: 0,
  paused: false,
});

export const hudStore = createStore<HudState>(initialHud());
