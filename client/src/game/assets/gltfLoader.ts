// Lazily imported chunk: the glTF loader (and its material extensions) is only downloaded when a GLB is needed.
import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0';

export const loadContainer = async (scene: Scene, buffer: ArrayBuffer): Promise<AssetContainer> =>
  LoadAssetContainerAsync(new Uint8Array(buffer), scene, { pluginExtension: '.glb' });
