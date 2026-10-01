import { NO_UPGRADES, PAINTS, VEHICLE_IDS, type GridEntry, type UpgradeLevels, type VehicleId } from '@race-rush/shared';
import type { RaceConfig } from './RaceSession';

const BOT_NAMES = ['Nitro', 'Viper', 'Blaze', 'Turbo', 'Comet', 'Raptor', 'Flash', 'Storm'];

/** Local race against simple bots (no server needed — practice / fallback mode). */
export const createOfflineRace = (opts: {
  trackId: string;
  laps: number;
  vehicle: VehicleId;
  color: string;
  upgrades: UpgradeLevels;
  playerName: string;
  bots: number;
  autopilot?: boolean;
}): RaceConfig => {
  const localId = 'local';
  const grid: GridEntry[] = [];
  const total = Math.min(5, opts.bots + 1);
  // Player starts at the back of the grid for a proper chase.
  const playerSlot = total - 1;
  let botIndex = 0;
  const seed = Math.floor(Math.random() * 1000);
  for (let slot = 0; slot < total; slot++) {
    if (slot === playerSlot) {
      grid.push({ id: localId, name: opts.playerName || 'Toi', vehicle: opts.vehicle, color: opts.color, isBot: false, slot, upgrades: opts.upgrades });
      continue;
    }
    const vehicle = VEHICLE_IDS[(seed + botIndex) % VEHICLE_IDS.length];
    const color = PAINTS[(seed + botIndex * 3 + 1) % PAINTS.length].id;
    grid.push({
      id: `bot-${botIndex}`,
      name: BOT_NAMES[(seed + botIndex) % BOT_NAMES.length],
      vehicle,
      color,
      isBot: true,
      slot,
      upgrades: { ...NO_UPGRADES },
    });
    botIndex++;
  }
  return { raceId: `offline-${Date.now()}`, trackId: opts.trackId, laps: opts.laps, grid, localId, mode: 'offline', autopilot: opts.autopilot };
};
