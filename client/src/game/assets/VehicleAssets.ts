import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { paintById, type VehicleId } from '@race-rush/shared';
import { assetUrl } from './assetUrl';

/**
 * GLB vehicles (optimised offline, see docs/CREDITS.md). Bytes are fetched once and cached by the service worker;
 * each Babylon scene parses them into its own AssetContainer, then every vehicle is an instantiation of it.
 */
const GLB: Partial<Record<VehicleId, string>> = {
  sport: 'models/sport.glb',
};

const bytes = new Map<string, Promise<ArrayBuffer>>();
const containers = new WeakMap<Scene, Map<VehicleId, Promise<AssetContainer | null>>>();
const ready = new WeakMap<Scene, Map<VehicleId, AssetContainer>>();

const fetchBytes = (url: string) => {
  let p = bytes.get(url);
  if (!p) {
    p = fetch(assetUrl(url)).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => bytes.delete(url));
    bytes.set(url, p);
  }
  return p;
};

export const hasGlb = (id: VehicleId): boolean => !!GLB[id];

/** Loads (once per scene) the GLB containers for the given vehicles. Failures fall back to procedural models. */
export const prepareVehicles = async (scene: Scene, ids: Iterable<VehicleId>): Promise<void> => {
  let map = containers.get(scene);
  if (!map) {
    map = new Map();
    containers.set(scene, map);
  }
  const jobs: Promise<unknown>[] = [];
  for (const id of new Set(ids)) {
    const url = GLB[id];
    if (!url) continue;
    let job = map.get(id);
    if (!job) {
      job = (async () => {
        try {
          const [buf, loader] = await Promise.all([fetchBytes(url), import('./gltfLoader')]);
          if (scene.isDisposed) return null;
          const c = await loader.loadContainer(scene, buf);
          let r = ready.get(scene);
          if (!r) {
            r = new Map();
            ready.set(scene, r);
          }
          r.set(id, c);
          return c;
        } catch (err) {
          console.warn(`Vehicle GLB ${id} unavailable, using procedural model`, err);
          return null;
        }
      })();
      map.set(id, job);
    }
    jobs.push(job);
  }
  await Promise.all(jobs);
};

export const readyContainer = (scene: Scene, id: VehicleId): AssetContainer | null => ready.get(scene)?.get(id) ?? null;

export interface GlbVehicleParts {
  model: TransformNode;
  meshes: Mesh[];
  wheels: { node: TransformNode; front: boolean; position: Vector3; radius: number }[];
  setPaint(colorId: string): void;
  setBrakeLights(on: boolean): void;
  dispose(): void;
}

const WHEEL_NAMES: [RegExp, boolean][] = [
  [/^WheelFrontL$/, true],
  [/^WheelFrontR$/, true],
  [/^WheelRearL$/, false],
  [/^WheelRearR$/, false],
];

/**
 * Instantiates a GLB vehicle under `parent`, normalised so that it faces +z with its wheels on y = 0.
 * Paint, brake-light and headlight materials are cloned per instance.
 */
export const instantiateGlbVehicle = (scene: Scene, container: AssetContainer, parent: TransformNode, name: string, paintId: string): GlbVehicleParts => {
  const inst = container.instantiateModelsToScene((n) => `${name}-${n}`, true, { doNotInstantiate: true });
  const holder = new TransformNode(`${name}-glb`, scene);
  holder.parent = parent;
  for (const r of inst.rootNodes) r.parent = holder;

  const all = holder.getChildMeshes(false) as Mesh[];
  for (const m of all) {
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = false;
  }
  const byName = (re: RegExp) => holder.getChildTransformNodes(false).find((n) => re.test(n.name.replace(`${name}-`, '')));

  // Orientation: front wheels must be on +z.
  holder.computeWorldMatrix(true);
  const frontL = byName(WHEEL_NAMES[0][0]);
  const rearL = byName(WHEEL_NAMES[2][0]);
  if (frontL && rearL) {
    frontL.computeWorldMatrix(true);
    rearL.computeWorldMatrix(true);
    const inv = parent.getWorldMatrix().clone().invert();
    const f = Vector3.TransformCoordinates(frontL.getAbsolutePosition(), inv);
    const r = Vector3.TransformCoordinates(rearL.getAbsolutePosition(), inv);
    if (f.z < r.z) holder.rotation.y = Math.PI;
  }
  holder.computeWorldMatrix(true);

  // Wheels: detach each wheel node so the caller can rig pivot (steer) + spin.
  const wheels: GlbVehicleParts['wheels'] = [];
  const inv = parent.getWorldMatrix().clone().invert();
  for (const [re, front] of WHEEL_NAMES) {
    const node = byName(re);
    if (!node) continue;
    node.computeWorldMatrix(true);
    const position = Vector3.TransformCoordinates(node.getAbsolutePosition(), inv);
    const b = node.getHierarchyBoundingVectors(true);
    const radius = (b.max.y - b.min.y) / 2;
    wheels.push({ node, front, position, radius });
  }

  // Materials: paint (main body colour), brake / head lights.
  const paints: PBRMaterial[] = [];
  const brakes: PBRMaterial[] = [];
  const seen = new Set<string>();
  for (const m of all) {
    const mat = m.material;
    if (!(mat instanceof PBRMaterial) || seen.has(mat.uniqueId.toString())) continue;
    seen.add(mat.uniqueId.toString());
    const n = mat.name;
    if (/Paint 1/.test(n)) paints.push(mat);
    else if (/Brakelight/.test(n)) brakes.push(mat);
    else if (/Headlight/.test(n)) {
      mat.emissiveColor = new Color3(1, 0.97, 0.9);
      mat.emissiveIntensity = 2.2;
    }
    if (/Glass/.test(n)) {
      // Dark tinted glass with strong reflections (transmission is too costly on mobile).
      mat.albedoColor = new Color3(0.01, 0.015, 0.025);
      mat.alpha = 0.78;
      mat.metallic = 0.2;
      mat.roughness = 0.04;
      mat.environmentIntensity = 1.6;
    }
  }

  const parts: GlbVehicleParts = {
    model: holder,
    meshes: all,
    wheels,
    setPaint(colorId) {
      const p = paintById(colorId);
      for (const mat of paints) {
        mat.albedoColor = Color3.FromHexString(p.hex).toLinearSpace();
        mat.metallic = 0.08 + p.metallic * 0.45;
        mat.roughness = 0.38 - p.metallic * 0.14;
      }
    },
    setBrakeLights(on) {
      for (const mat of brakes) {
        mat.emissiveColor = on ? new Color3(1, 0.05, 0.03) : new Color3(0.45, 0.02, 0.02);
        mat.emissiveIntensity = on ? 3 : 1;
      }
    },
    dispose() {
      holder.dispose(false, true);
    },
  };
  parts.setPaint(paintId);
  parts.setBrakeLights(false);
  void ([] as AbstractMesh[]);
  return parts;
};
