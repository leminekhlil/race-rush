import { Component, useEffect, useState, type ReactNode } from 'react';
import { isVehicleId, TRACKS } from '@race-rush/shared';
import { useStore } from '../state/store';
import { appStore } from '../state/appStore';
import { settingsStore } from '../state/settings';
import { createOfflineRace } from '../game/race/offline';
import { RaceScreen } from './screens/RaceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GarageScreen } from './screens/GarageScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SettingsModal } from './components/SettingsModal';
import { NoticeHost } from './components/ui';
import { actions, currentSelection, getRealtime } from './actions';
import { hideBackdrop, showBackdrop } from './backdrop';
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
    upgrades: { engine: 0, handling: 0, boost: 0 },
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
  const profile = useStore(appStore, (s) => s.profile);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!startDevRace()) void actions.boot();
    // Mobile browsers only allow audio after a user gesture.
    const unlock = () => AudioEngine.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);

  // 3D backdrop lifecycle: showroom for menus, released during races.
  useEffect(() => {
    if (screen === 'race' || screen === 'boot') {
      hideBackdrop();
      return;
    }
    const sel = currentSelection();
    showBackdrop(screen === 'garage', sel.vehicle, sel.color);
  }, [screen, profile]);

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
      </div>
    </ErrorBoundary>
  );
};
