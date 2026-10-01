import { useEffect, useMemo } from 'react';
import { isVehicleId, TRACKS } from '@race-rush/shared';
import { useStore } from '../state/store';
import { appStore } from '../state/appStore';
import { settingsStore } from '../state/settings';
import { createOfflineRace } from '../game/race/offline';
import { RaceScreen } from './screens/RaceScreen';

export const App = () => {
  const screen = useStore(appStore, (s) => s.screen);
  const race = useStore(appStore, (s) => s.race);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('dev') === '1') {
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
      appStore.set({ race: config, screen: 'race' });
    }
  }, []);

  const content = useMemo(() => {
    if (screen === 'race' && race) return <RaceScreen config={race} net={null} />;
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-display text-4xl text-gold-400">RACE RUSH</div>
      </div>
    );
  }, [screen, race]);

  return <div className="absolute inset-0">{content}</div>;
};
