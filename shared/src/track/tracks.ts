import type { TrackDefinition } from './TrackDefinition';
import { TrackPath } from './TrackPath';

/**
 * CITY — "Neon Boulevard".
 * Long start boulevard, climbing east bend with a kicker on the descent,
 * downtown S-curves, a north hairpin and a technical middle section.
 */
export const CITY_TRACK: TrackDefinition = {
  id: 'city',
  name: 'City — Palm Boulevard',
  theme: 'city',
  roadWidth: 17,
  shoulder: 3,
  checkpoints: 8,
  laps: 3,
  gridOffset: 7,
  decorSeed: 1337,
  points: [
    { x: -150, z: 0, y: 0 },
    { x: 0, z: 0, y: 0 },
    { x: 150, z: 0, y: 0 },
    { x: 245, z: 28, y: 0.5 },
    { x: 285, z: 115, y: 3 },
    { x: 255, z: 205, y: 7 },
    { x: 175, z: 250, y: 9 },
    { x: 95, z: 232, y: 4 },
    { x: 40, z: 282, y: 1 },
    { x: -25, z: 330, y: 0 },
    { x: -115, z: 322, y: 0 },
    { x: -168, z: 262, y: 0, width: 19 },
    { x: -125, z: 198, y: 0 },
    { x: -55, z: 165, y: 0 },
    { x: -75, z: 102, y: 0 },
    { x: -170, z: 88, y: 0 },
    { x: -245, z: 52, y: 0 },
    { x: -238, z: 6, y: 0 },
  ],
  ramps: [
    { at: 0.355, length: 16, height: 1.5 },
    { at: 0.86, length: 14, height: 1.2 },
  ],
  // Sunny tropical city (start / HUD references): blue sky, red & white barriers, light sidewalks.
  palette: {
    sky: '#2f7fe6',
    horizon: '#bfe3ff',
    fog: '#cfe6fb',
    ground: '#b9b4a6',
    road: '#454a54',
    shoulder: '#d8d9dd',
    barrierA: '#e23b3b',
    barrierB: '#f7f7f7',
  },
};

/**
 * DESERT — "Dune Canyon". Wide sandy road, rolling dunes and canyon walls.
 */
export const DESERT_TRACK: TrackDefinition = {
  id: 'desert',
  name: 'Desert — Dune Canyon',
  theme: 'desert',
  roadWidth: 19,
  shoulder: 4,
  checkpoints: 8,
  laps: 3,
  gridOffset: 7,
  decorSeed: 4242,
  points: [
    { x: -120, z: -20, y: 0 },
    { x: 40, z: -30, y: 0 },
    { x: 170, z: -10, y: 2 },
    { x: 260, z: 60, y: 6 },
    { x: 270, z: 170, y: 3 },
    { x: 190, z: 240, y: 0 },
    { x: 80, z: 215, y: 4 },
    { x: -10, z: 260, y: 8 },
    { x: -120, z: 250, y: 3 },
    { x: -200, z: 180, y: 0 },
    { x: -190, z: 90, y: 2 },
    { x: -238, z: 38, y: 0 },
    { x: -205, z: -10, y: 0 },
  ],
  ramps: [
    { at: 0.2, length: 18, height: 1.8 },
    { at: 0.6, length: 16, height: 1.5 },
  ],
  palette: {
    sky: '#2f86e8',
    horizon: '#ffd9a0',
    fog: '#f0cf9d',
    ground: '#d9a35f',
    road: '#8c6a45',
    shoulder: '#c9945a',
    barrierA: '#e2552b',
    barrierB: '#fff3dd',
  },
};

export const TRACKS: Record<string, TrackDefinition> = {
  city: CITY_TRACK,
  desert: DESERT_TRACK,
};

export const TRACK_IDS = Object.keys(TRACKS);

const pathCache = new Map<string, TrackPath>();

/** TrackPath instances are immutable; cache one per track id. */
export const getTrackPath = (id: string): TrackPath => {
  const def = TRACKS[id];
  if (!def) throw new Error(`Unknown track: ${id}`);
  let path = pathCache.get(id);
  if (!path) {
    path = new TrackPath(def);
    pathCache.set(id, path);
  }
  return path;
};
