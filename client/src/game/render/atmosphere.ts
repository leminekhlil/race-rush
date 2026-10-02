import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TrackPath } from '@race-rush/shared';
import type { QualityParams } from '../quality/QualityManager';
import { applyEnvironment } from '../assets/environment';
import { settingsStore } from '../../state/settings';

export interface Atmosphere {
  night: boolean;
  hemi: HemisphericLight;
  sun: DirectionalLight;
}

/** True when the City should be rendered at night (visual preference, never affects the simulation). */
export const wantsNight = (path: TrackPath): boolean => path.def.theme !== 'desert' && settingsStore.get().timeOfDay === 'night';

/** Fog, sky clear colour, hemisphere + sun/moon and image-based lighting for a circuit scene (race or showcase). */
export const setupAtmosphere = (scene: Scene, path: TrackPath, q: QualityParams, night = wantsNight(path)): Atmosphere => {
  const desert = path.def.theme === 'desert';
  const pal = path.def.palette;
  const fog = night ? '#0b1026' : pal.fog;
  scene.clearColor = Color4.FromHexString(`${fog}ff`);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = q.fogDensity * (desert ? 0.6 : night ? 0.85 : 0.7);
  scene.fogColor = Color3.FromHexString(fog);
  scene.ambientColor = new Color3(0.2, 0.22, 0.3);

  const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = night ? 0.24 : 0.95;
  hemi.diffuse = Color3.FromHexString(night ? '#8fa6ff' : desert ? '#fff1d8' : '#ffffff');
  hemi.groundColor = Color3.FromHexString(night ? '#1a1430' : desert ? '#8a6038' : '#7d8798');
  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.35), scene);
  sun.intensity = night ? 0.28 : desert ? 1.15 : 1.1;
  sun.diffuse = Color3.FromHexString(night ? '#9fb3ff' : desert ? '#ffe2b0' : '#fff4e0');
  applyEnvironment(scene, night ? 'night' : desert ? 'desert' : 'city-day', night ? 0.55 : desert ? 0.9 : 1);
  return { night, hemi, sun };
};
