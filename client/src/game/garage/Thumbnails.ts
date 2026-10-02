import { useEffect, useState } from 'react';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { VehicleId } from '@race-rush/shared';
import { getEngineHost } from '../engine/EngineHost';
import { createVehicleModel } from '../scene/VehicleFactory';
import { prepareVehicles } from '../assets/VehicleAssets';
import { applyEnvironment } from '../assets/environment';

/** Camera framing per vehicle (radius, target height). */
const FRAMING: Record<VehicleId, { radius: number; y: number }> = {
  sport: { radius: 7.4, y: 0.55 },
  moto: { radius: 3.5, y: 0.85 },
  buggy: { radius: 6.9, y: 1.1 },
  monster: { radius: 7.4, y: 1.55 },
};

let scene: Scene | null = null;
let camera: ArcRotateCamera | null = null;
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

const ensureScene = () => {
  if (scene && !scene.isDisposed) return scene;
  const engine = getEngineHost().engine;
  scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.skipPointerMovePicking = true;
  scene.ambientColor = new Color3(0.3, 0.3, 0.38);
  const hemi = new HemisphericLight('thumbHemi', new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.95;
  hemi.groundColor = Color3.FromHexString('#3a4a7a');
  const key = new DirectionalLight('thumbKey', new Vector3(-0.5, -0.8, 0.6), scene);
  key.intensity = 1.1;
  // 3/4 front view, nose pointing to the left (reference selection screen).
  camera = new ArcRotateCamera('thumbCam', Math.PI / 2 + 0.7, 1.2, 6, Vector3.Zero(), scene);
  camera.fov = 0.55;
  camera.minZ = 0.1;
  applyEnvironment(scene, 'studio', 1.1);
  return scene;
};

/** Renders meshes through a render target, reads pixels back and encodes a PNG (no extra post-process shader). */
const renderToDataUrl = async (s: Scene, meshes: import('@babylonjs/core/Meshes/abstractMesh').AbstractMesh[], width: number, height: number): Promise<string> => {
  const rtt = new RenderTargetTexture('thumbRtt', { width, height }, s, false, true, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  rtt.samples = 4;
  rtt.activeCamera = camera;
  rtt.renderList = meshes.filter((m) => m.isEnabled());
  rtt.clearColor = new Color4(0, 0, 0, 0);
  for (let i = 0; i < 100 && !rtt.isReadyForRendering(); i++) await new Promise((r) => setTimeout(r, 30));
  s.activeCamera = camera;
  s.updateTransformMatrix(true);
  rtt.render(true);
  const data = (await rtt.readPixels()) as Uint8Array;
  rtt.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  // WebGL rows are bottom-up: flip vertically.
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    img.data.set(data.subarray(src, src + width * 4), y * width * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
};

/** Renders a 3/4 front view of a vehicle to a transparent PNG data URL (cached, serialized). */
export const vehicleThumbnail = (vehicle: VehicleId, color: string, width = 400, height = 240): Promise<string> => {
  const key = `${vehicle}:${color}:${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    const s = ensureScene();
    await prepareVehicles(s, [vehicle]);
    const model = createVehicleModel(s, vehicle, color, `thumb-${vehicle}`);
    model.meshes.filter((m) => m.name.endsWith('-shadow')).forEach((m) => m.setEnabled(false));
    const f = FRAMING[vehicle];
    camera!.radius = f.radius;
    camera!.target.set(0, f.y, 0);
    await s.whenReadyAsync();
    const url = await renderToDataUrl(s, model.meshes, width, height);
    model.dispose();
    return url;
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  return job;
};

/** React hook: thumbnail data URL (null while rendering). */
export const useVehicleThumb = (vehicle: VehicleId, color: string, width = 400, height = 240): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    vehicleThumbnail(vehicle, color, width, height)
      .then((u) => alive && setUrl(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [vehicle, color, width, height]);
  return url;
};
