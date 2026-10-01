import type { VehicleId } from '@race-rush/shared';
import { getEngineHost } from '../game/engine/EngineHost';
import { getGarageScene, releaseGarageScene } from '../game/garage/GarageScene';

/**
 * The 3D showroom lives behind every menu screen and is released during races so the
 * circuit has the GPU memory to itself (City/Desert are never loaded at the same time as the garage).
 */
let active = false;

export const showBackdrop = (interactive: boolean, vehicle: VehicleId, color: string): void => {
  const host = getEngineHost();
  host.setMenuMode(true);
  const g = getGarageScene(host);
  if (!active) {
    g.mount();
    active = true;
  }
  g.setInteractive(interactive);
  if (!interactive) g.setVehicle(vehicle, color);
};

export const garagePreview = (vehicle: VehicleId, color: string): void => {
  if (!active) return;
  getGarageScene(getEngineHost()).setVehicle(vehicle, color);
};

export const hideBackdrop = (): void => {
  if (!active) return;
  active = false;
  releaseGarageScene();
  getEngineHost().setMenuMode(false);
};
