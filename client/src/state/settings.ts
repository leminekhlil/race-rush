import { createStore } from './store';

export type QualityProfile = 'auto' | 'eco' | 'standard' | 'high';

export interface Settings {
  quality: QualityProfile;
  autoAccelerate: boolean;
  masterVolume: number;
  haptics: boolean;
  showFps: boolean;
  playerName: string;
  /** Visual only: City by day or by night (never affects the simulation). */
  timeOfDay: 'day' | 'night';
  musicVolume: number;
  sfxVolume: number;
  /** Engines, tyres and wind (separate from effects). */
  engineVolume: number;
  /** Other players' voices (voice chat). */
  voiceVolume: number;
  muted: boolean;
  /** Selected background music id ('off' = silence, 'shuffle' = rotate the playlist). */
  musicTrack: string;
  /** Race announcer voice. */
  announcer: boolean;
  /** Cinematic intro already seen (it becomes skippable / shortened). */
  introSeen: boolean;
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
  timeOfDay: 'day',
  musicVolume: 0.55,
  sfxVolume: 0.9,
  engineVolume: 0.85,
  voiceVolume: 1,
  muted: false,
  musicTrack: 'shuffle',
  announcer: true,
  introSeen: false,
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
