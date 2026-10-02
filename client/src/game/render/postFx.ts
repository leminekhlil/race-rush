import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import type { QualityParams } from '../quality/QualityManager';

export interface PostFxOptions {
  exposure?: number;
  contrast?: number;
  bloomThreshold?: number;
  bloomWeight?: number;
  vignette?: number;
}

/**
 * Shared look: ACES tone mapping and contrast on every profile (cheap, done in the material shaders on ECO),
 * plus a post pipeline (bloom, FXAA, vignette, chromatic aberration hook) on STANDARD / HIGH.
 */
export const setupPostFx = (scene: Scene, camera: Camera, q: QualityParams, o: PostFxOptions = {}): DefaultRenderingPipeline | null => {
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = o.exposure ?? 1.1;
  ip.contrast = o.contrast ?? 1.15;
  if (q.postFx === 'none') return null;
  const p = new DefaultRenderingPipeline(`postfx-${camera.name}`, true, scene, [camera]);
  p.imageProcessingEnabled = true;
  p.imageProcessing.toneMappingEnabled = true;
  p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  p.imageProcessing.exposure = o.exposure ?? 1.1;
  p.imageProcessing.contrast = o.contrast ?? 1.15;
  p.imageProcessing.vignetteEnabled = true;
  p.imageProcessing.vignetteWeight = o.vignette ?? 1.6;
  p.imageProcessing.vignetteStretch = 0.4;
  p.fxaaEnabled = true;
  p.bloomEnabled = true;
  p.bloomThreshold = o.bloomThreshold ?? 0.82;
  p.bloomWeight = o.bloomWeight ?? (q.postFx === 'full' ? 0.45 : 0.3);
  p.bloomKernel = q.postFx === 'full' ? 64 : 32;
  p.bloomScale = q.postFx === 'full' ? 0.5 : 0.35;
  return p;
};
