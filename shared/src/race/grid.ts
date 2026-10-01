import type { TrackPath } from '../track/TrackPath';

/** Staggered 2-wide starting grid ahead of the start/finish line. */
export const gridSlot = (path: TrackPath, slot: number): { s: number; lateral: number } => {
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const half = path.def.roadWidth / 2;
  return { s: path.def.gridOffset - row * 8 - col * 3, lateral: (col === 0 ? -1 : 1) * Math.min(4.2, half - 2.5) };
};
