import type { TrackPath } from '../track/TrackPath';

/**
 * Staggered 2-wide starting grid just behind the start/finish line (cars face the start gantry and
 * its traffic light, as in the start reference). `gridOffset` = distance from the line to the front row.
 */
export const gridSlot = (path: TrackPath, slot: number): { s: number; lateral: number } => {
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const half = path.def.roadWidth / 2;
  return { s: path.wrap(-(path.def.gridOffset + row * 8 + col * 3)), lateral: (col === 0 ? -1 : 1) * Math.min(4.2, half - 2.5) };
};
