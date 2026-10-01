import { createStore } from './store';

export type QualityProfile = 'auto' | 'eco' | 'standard' | 'high';

export interface Settings {
  quality: QualityProfile;
  autoAccelerate: boolean;
  masterVolume: number;
  haptics: boolean;
  showFps: boolean;
  playerName: string;
}

const KEY = 'raceRush.settings.v1';

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const defaults = (): Settings => ({
  quality: 'auto',
  autoAccelerate: isTouchDevice(),
  masterVolume: 0.8,
  haptics: true,
  showFps: false,
  playerName: '',
});

const load = (): Settings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaults();
  }
};

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    /* storage unavailable (private mode): settings stay in memory */
  }
});

export const touchDevice = isTouchDevice();
