import type { VehicleId } from '@race-rush/shared';
import { getEngineHost } from '../game/engine/EngineHost';
import { getGarageScene, releaseGarageScene } from '../game/garage/GarageScene';
import { PodiumScene, type PodiumEntry } from '../game/results/PodiumScene';
import { ShowcaseScene, type ShowcaseCar, type ShowcaseLayout } from '../game/street/ShowcaseScene';

/**
 * Exactly one 3D backdrop is alive behind the menus:
 * - `showcase`: the real circuit around the start line (home, play, lobby),
 * - `garage`: the workshop showroom (garage, vehicle selection),
 * - `podium`: results.
 * Everything is released during races so the circuit has the GPU memory to itself.
 */
type Mode = 'garage' | 'showcase' | 'podium' | null;

let mode: Mode = null;
let showcase: ShowcaseScene | null = null;
let podium: PodiumScene | null = null;
/** Incremented on every switch so a slow showcase build never mounts after the user moved on. */
let generation = 0;

const releaseGarage = () => {
  if (mode === 'garage') releaseGarageScene();
};
const releaseShowcase = () => {
  showcase?.dispose();
  showcase = null;
};
const releasePodium = () => {
  podium?.dispose();
  podium = null;
};

/* ------------------------------------------------------------- garage */

export const showBackdrop = (interactive: boolean, vehicle: VehicleId, color: string): void => {
  generation++;
  const host = getEngineHost();
  host.setMenuMode(true);
  const g = getGarageScene(host);
  if (mode !== 'garage') {
    releaseShowcase();
    releasePodium();
    g.mount();
    mode = 'garage';
  }
  g.setInteractive(interactive);
  if (!interactive) g.setVehicle(vehicle, color);
};

export const garagePreview = (vehicle: VehicleId, color: string): void => {
  if (mode !== 'garage') return;
  getGarageScene(getEngineHost()).setVehicle(vehicle, color);
};

/** Moves the showroom vehicle into the free area between garage panels. */
export const garageFraming = (x: number, y: number, zoom = 1): void => {
  if (mode !== 'garage') return;
  getGarageScene(getEngineHost()).setFraming(x, y, zoom);
};

/* ----------------------------------------------------------- showcase */

let pendingTrack: string | null = null;
let pendingScene: ShowcaseScene | null = null;

/**
 * Circuit backdrop with parked vehicles. Re-uses the current scene when the track did not change;
 * otherwise builds the new one off-screen and swaps when ready (no blank frame).
 */
export const showShowcase = (trackId: string, layout: ShowcaseLayout, shiftX: number, cars: ShowcaseCar[]): void => {
  const host = getEngineHost();
  host.setMenuMode(true);
  if (mode === 'showcase' && showcase && showcase.trackId === trackId) {
    showcase.setLayout(layout, shiftX);
    showcase.setCars(cars);
    return;
  }
  // Same track already building: just refresh what it will show.
  if (pendingScene && pendingTrack === trackId) {
    pendingScene.setLayout(layout, shiftX);
    pendingScene.setCars(cars);
    return;
  }
  const gen = ++generation;
  const next = new ShowcaseScene(host, trackId);
  pendingScene = next;
  pendingTrack = trackId;
  next.setLayout(layout, shiftX);
  next.setCars(cars);
  void next
    .build()
    .then(() => {
      if (pendingScene === next) {
        pendingScene = null;
        pendingTrack = null;
      }
      if (gen !== generation) {
        next.dispose();
        return;
      }
      releaseGarage();
      releaseShowcase();
      releasePodium();
      showcase = next;
      mode = 'showcase';
      next.mount();
    })
    .catch((err) => {
      console.error('Showcase build failed', err);
      next.dispose();
    });
};

/** Updates the parked vehicles / framing of the live showcase (no-op otherwise). */
export const updateShowcase = (layout: ShowcaseLayout, shiftX: number, cars: ShowcaseCar[]): void => {
  const target = mode === 'showcase' ? showcase : pendingScene;
  target?.setLayout(layout, shiftX);
  target?.setCars(cars);
};

/* ------------------------------------------------------------- podium */

/** Results podium (top 3). */
export const showPodium = (entries: PodiumEntry[], lowQuality: boolean): void => {
  generation++;
  releaseGarage();
  releaseShowcase();
  releasePodium();
  const host = getEngineHost();
  host.setMenuMode(true);
  podium = new PodiumScene(host, entries, lowQuality);
  podium.mount();
  mode = 'podium';
};

/* -------------------------------------------------------------- race */

export const hideBackdrop = (): void => {
  generation++;
  releaseGarage();
  releaseShowcase();
  releasePodium();
  if (mode !== null) getEngineHost().setMenuMode(false);
  mode = null;
};
