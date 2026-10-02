import type { Scene } from '@babylonjs/core/scene';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';

/** Prefiltered image-based lighting baked from Poly Haven HDRIs (CC0, see docs/CREDITS.md). */
export type EnvName = 'city-day' | 'night' | 'sunset' | 'desert' | 'studio';

export const applyEnvironment = (scene: Scene, name: EnvName, intensity = 1): CubeTexture => {
  const tex = CubeTexture.CreateFromPrefilteredData(new URL(`env/${name}.env`, document.baseURI).href, scene);
  tex.gammaSpace = false;
  scene.environmentTexture = tex;
  scene.environmentIntensity = intensity;
  return tex;
};
