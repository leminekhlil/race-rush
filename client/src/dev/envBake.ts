// Dev-only tool (not bundled): converts an equirectangular HDR into a prefiltered Babylon .env (base64).
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { EnvironmentTextureTools } from '@babylonjs/core/Misc/environmentTextureTools';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';

export const bake = async (url: string, size: number): Promise<string> => {
  const canvas = document.createElement('canvas');
  const engine = new Engine(canvas, false);
  const scene = new Scene(engine);
  const tex = new HDRCubeTexture(url, scene, size, false, true, false, true);
  await new Promise<void>((resolve, reject) => {
    tex.onLoadObservable.addOnce(() => resolve());
    setTimeout(() => reject(new Error('timeout')), 60000);
  });
  const buf = await EnvironmentTextureTools.CreateEnvTextureAsync(tex, { imageType: 'image/png' });
  let s = '';
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  engine.dispose();
  return btoa(s);
};
