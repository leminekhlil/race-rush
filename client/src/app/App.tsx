import { Component, useEffect, useState, type ReactNode } from 'react';
import { formatRaceTime, isVehicleId, NO_UPGRADES, TRACKS, type VehicleId } from '@race-rush/shared';
import { useStore } from '../state/store';
import { appStore } from '../state/appStore';
import { settingsStore } from '../state/settings';
import { createOfflineRace } from '../game/race/offline';
import { RaceScreen } from './screens/RaceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { VehicleSelectScreen } from './screens/VehicleSelectScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GarageScreen } from './screens/GarageScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SettingsModal } from './components/SettingsModal';
import { IntroCinematic } from './components/IntroCinematic';
import { MusicPlayer } from '../game/audio/MusicPlayer';
import { SIGNATURE } from './brand';
import { NoticeHost } from './components/ui';
import { actions, currentSelection, getRealtime } from './actions';
import { hideBackdrop, showBackdrop, showPodium, showShowcase } from './backdrop';
import { AudioEngine } from '../game/audio/AudioEngine';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('UI error', error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-night-950 p-6 text-center">
        <div className="font-display text-3xl text-gold-400">Oups, sortie de piste</div>
        <p className="max-w-md text-white/70">Une erreur inattendue est survenue. Recharge pour repartir.</p>
        <button type="button" className="btn-gold font-display rounded-2xl px-6 py-3" onClick={() => location.reload()}>
          RECHARGER
        </button>
      </div>
    );
  }
}

/** Menu line-up (menu reference): the player's vehicle in front, the other classes behind in their reference colours. */
const MENU_EXTRAS: { vehicle: VehicleId; color: string }[] = [
  { vehicle: 'buggy', color: 'yellow' },
  { vehicle: 'monster', color: 'violet' },
  { vehicle: 'moto', color: 'red' },
  { vehicle: 'sport', color: 'red' },
];
const menuCars = (vehicle: VehicleId, color: string) => [
  { key: 'hero', vehicle, color },
  ...MENU_EXTRAS.filter((e) => e.vehicle !== vehicle)
    .slice(0, 3)
    .map((e) => ({ key: `extra-${e.vehicle}`, ...e })),
];

const BootScreen = () => (
  <div className="flex h-full flex-col items-center justify-center bg-night-950" data-testid="boot-screen">
    <div className="font-display text-outline animate-pulse text-5xl text-gold-400 italic">RACE RUSH</div>
    <div className="mt-3 text-white/60">Démarrage…</div>
  </div>
);

/** Dev mode: `?dev=1&track=city&vehicle=sport&bots=4&autopilot=1&laps=3&fps=1&quality=eco` → straight into a race. */
const startDevRace = (): boolean => {
  const q = new URLSearchParams(location.search);
  if (q.get('dev') !== '1') return false;
  if (q.has('fps')) settingsStore.set({ showFps: true });
  const quality = q.get('quality');
  if (quality === 'eco' || quality === 'standard' || quality === 'high' || quality === 'auto') settingsStore.set({ quality });
  const vehicle = q.get('vehicle') ?? 'sport';
  const trackId = q.get('track') ?? 'city';
  const config = createOfflineRace({
    trackId: trackId in TRACKS ? trackId : 'city',
    laps: Math.max(1, Math.min(5, Number(q.get('laps') ?? 3))),
    vehicle: isVehicleId(vehicle) ? vehicle : 'sport',
    color: q.get('color') ?? 'red',
    upgrades: { ...NO_UPGRADES },
    playerName: 'Dev',
    bots: Math.max(0, Math.min(4, Number(q.get('bots') ?? 4))),
    autopilot: q.get('autopilot') === '1',
  });
  appStore.set({ race: config, screen: 'race', apiStatus: 'offline' });
  return true;
};

export const App = () => {
  const screen = useStore(appStore, (s) => s.screen);
  const race = useStore(appStore, (s) => s.race);
  const results = useStore(appStore, (s) => s.results);
  const profile = useStore(appStore, (s) => s.profile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intro, setIntro] = useState(() => new URLSearchParams(location.search).get('dev') !== '1' && new URLSearchParams(location.search).get('intro') !== '0');

  // Background music: starts once audio is unlocked by a user gesture, follows the settings.
  useEffect(() => {
    let last = '';
    const sync = () => {
      const s = settingsStore.get();
      const key = `${s.musicTrack}`;
      if (key === last && MusicPlayer.isPlaying()) return;
      last = key;
      if (AudioEngine.ctx?.state === 'running') MusicPlayer.sync();
    };
    const offUnlock = AudioEngine.onUnlock(sync);
    const offSettings = settingsStore.subscribe(sync);
    return () => {
      offUnlock();
      offSettings();
    };
  }, []);

  useEffect(() => {
    if (!startDevRace()) void actions.boot();
    // Mobile browsers only allow audio after a user gesture.
    const unlock = () => AudioEngine.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);

  // 3D backdrop lifecycle: circuit showcase (home/play/lobby), workshop (garage/select), podium (results).
  const trackId = useStore(appStore, (s) => s.trackId);
  const lobby = useStore(appStore, (s) => s.lobby);
  useEffect(() => {
    if (screen === 'results') return; // podium effect below
    if (screen === 'race' || screen === 'boot') {
      hideBackdrop();
      return;
    }
    const sel = currentSelection();
    if (screen === 'garage' || screen === 'select') {
      showBackdrop(screen === 'garage', sel.vehicle, sel.color);
      return;
    }
    if (screen === 'lobby' && lobby) {
      showShowcase(lobby.trackId, 'lobby', -0.12, lobby.players.map((p) => ({ key: p.id, vehicle: p.vehicle, color: p.color })));
      return;
    }
    showShowcase(trackId, 'menu', screen === 'home' ? 0.14 : 0, menuCars(sel.vehicle, sel.color));
  }, [screen, profile, trackId, lobby]);

  // Results: 3D podium with the top three.
  useEffect(() => {
    if (screen !== 'results' || !results) return;
    const top = results.results.filter((r) => !r.flagged).slice(0, 3);
    showPodium(
      top.map((r) => ({
        vehicle: r.vehicle,
        color: r.color,
        name: r.id === results.localId ? 'Toi' : r.name,
        time: r.finished ? formatRaceTime(r.time) : 'DNF',
        local: r.id === results.localId,
      })),
      settingsStore.get().quality === 'eco',
    );
  }, [screen, results]);

  let content: ReactNode;
  switch (screen) {
    case 'boot':
      content = <BootScreen />;
      break;
    case 'race':
      content = race ? <RaceScreen config={race} net={race.mode === 'online' ? getRealtime() : null} /> : null;
      break;
    case 'play':
      content = <PlayScreen />;
      break;
    case 'select':
      content = <VehicleSelectScreen />;
      break;
    case 'lobby':
      content = <LobbyScreen />;
      break;
    case 'garage':
      content = <GarageScreen />;
      break;
    case 'results':
      content = <ResultsScreen />;
      break;
    default:
      content = <HomeScreen onSettings={() => setSettingsOpen(true)} />;
  }

  return (
    <ErrorBoundary>
      <div className={`absolute inset-0 ${screen === 'garage' || screen === 'home' ? 'pointer-events-none' : ''}`}>
        {content}
        {settingsOpen && (
          <div className="pointer-events-auto">
            <SettingsModal onClose={() => setSettingsOpen(false)} />
          </div>
        )}
        <NoticeHost />
        {screen !== 'race' && !intro && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 text-center text-[9px] tracking-wider text-white/45 sm:text-[10px]"
            style={{ paddingBottom: 'calc(2px + var(--safe-b))' }}
            data-testid="signature"
          >
            {SIGNATURE}
          </div>
        )}
        {intro && <IntroCinematic onDone={() => setIntro(false)} />}
      </div>
    </ErrorBoundary>
  );
};
