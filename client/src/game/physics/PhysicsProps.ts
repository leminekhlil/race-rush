import type { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { createRng, type TrackPath } from '@race-rush/shared';

const MAX_PROP_SPEED = 18;

export interface PropsHandle {
  /** Syncs kinematic vehicle bodies to their render transforms (call every frame). */
  update(): void;
  dispose(): void;
}

interface Follower {
  node: TransformNode;
  body: PhysicsBody;
  proxy: Mesh;
  offsetY: number;
  last: Vector3;
  teleporting: boolean;
}

/**
 * Havok-driven props: traffic cones (City) / crates (Desert) that vehicles physically knock around.
 * The arcade driving model stays engine-agnostic (shared with the server); Havok handles the
 * secondary rigid-body interactions. Lazy-loaded (≈2 MB wasm) and skipped on ECO quality.
 */
export const createPhysicsProps = async (
  scene: Scene,
  path: TrackPath,
  vehicles: { node: TransformNode; halfExtents: Vector3; isLocal: boolean }[],
  onLocalHit: (strength: number) => void,
): Promise<PropsHandle | null> => {
  try {
    const [{ default: HavokPhysics }, { default: wasmUrl }, { HavokPlugin }, { PhysicsAggregate }, plugin] = await Promise.all([
      import('@babylonjs/havok'),
      import('@babylonjs/havok/lib/esm/HavokPhysics.wasm?url'),
      import('@babylonjs/core/Physics/v2/Plugins/havokPlugin'),
      import('@babylonjs/core/Physics/v2/physicsAggregate'),
      import('@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'),
      import('@babylonjs/core/Physics/v2/physicsEngineComponent'),
      // Registers scene.enablePhysics / getPhysicsEngine for v2 plugins.
      import('@babylonjs/core/Physics/joinedPhysicsEngineComponent'),
    ]);
    const havok = await HavokPhysics({ locateFile: () => wasmUrl });
    if (scene.isDisposed) return null;
    const hk = new HavokPlugin(true, havok);
    scene.enablePhysics(new Vector3(0, -19.6, 0), hk);
    const { PhysicsShapeType, PhysicsMotionType } = plugin;

    const desert = path.def.theme === 'desert';
    const rng = createRng(path.def.decorSeed + 7);
    const propMat = new StandardMaterial('propMat', scene);
    propMat.diffuseColor = desert ? Color3.FromHexString('#b07a3c') : Color3.FromHexString('#ff6a13');
    propMat.emissiveColor = desert ? Color3.FromHexString('#1a0f05') : Color3.FromHexString('#3a1200');
    const stripeMat = new StandardMaterial('propStripe', scene);
    stripeMat.diffuseColor = Color3.White();
    stripeMat.emissiveColor = new Color3(0.4, 0.4, 0.4);

    const template: Mesh = desert
      ? CreateBox('crate', { size: 1.1 }, scene)
      : CreateCylinder('cone', { height: 0.9, diameterTop: 0.08, diameterBottom: 0.5, tessellation: 10 }, scene);
    template.material = propMat;
    template.isVisible = false;

    const statics: Mesh[] = [];
    const aggregates: { dispose(): void }[] = [];
    const props: Mesh[] = [];
    const propBodies: PhysicsBody[] = [];

    // Clusters on the inside shoulder of the tightest corners (brushing the apex knocks them over).
    const corners: { s: number; k: number }[] = [];
    for (let s = 40; s < path.length - 40; s += 6) {
      const k = path.sampleAt(s).curvature;
      if (Math.abs(k) > 1 / 60 && !corners.some((c) => Math.abs(c.s - s) < 120)) corners.push({ s, k });
    }
    corners.sort((a, b) => Math.abs(b.k) - Math.abs(a.k));
    for (const c of corners.slice(0, 6)) {
      const smp = path.sampleAt(c.s);
      const inside = c.k > 0 ? 1 : -1;
      // On the apex edge of the road: cutting the corner knocks them over.
      const lateral = (path.widthAt(c.s) / 2 - 0.6) * inside;
      const base = path.baseHeight(c.s);
      // Static ground slab under the cluster (props rest on the shoulder level).
      const slab = CreateBox('propGround', { width: 9, height: 1, depth: 22 }, scene);
      slab.position.set(smp.x + smp.rx * lateral, base - 0.45, smp.z + smp.rz * lateral);
      slab.rotation.y = smp.heading;
      slab.isVisible = false;
      statics.push(slab);
      aggregates.push(new PhysicsAggregate(slab, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene));
      for (let i = 0; i < 6; i++) {
        const ds = (i - 2.5) * 3.2;
        const p = path.pointAt(c.s + ds, lateral + (rng() - 0.5) * 0.8);
        const prop = template.clone(`prop-${props.length}`, null) as Mesh;
        prop.isVisible = true;
        prop.position.set(p.x, path.baseHeight(c.s + ds) + (desert ? 0.56 : 0.46), p.z);
        prop.rotation.y = rng() * Math.PI;
        if (!desert) {
          const band = CreateCylinder('coneBand', { height: 0.12, diameterTop: 0.25, diameterBottom: 0.33, tessellation: 10 }, scene);
          band.material = stripeMat;
          band.parent = prop;
          band.position.y = 0.05;
          band.isPickable = false;
        }
        prop.isPickable = false;
        props.push(prop);
        const agg = new PhysicsAggregate(prop, desert ? PhysicsShapeType.BOX : PhysicsShapeType.CYLINDER, { mass: desert ? 6 : 2.5, friction: 0.6, restitution: 0.25 }, scene);
        agg.body.setLinearDamping(0.6);
        agg.body.setAngularDamping(0.6);
        propBodies.push(agg.body);
        aggregates.push(agg);
      }
    }

    // Vehicles: ANIMATED bodies following the arcade simulation (they push props, props don't push them).
    const followers: Follower[] = [];
    for (const v of vehicles) {
      const box = CreateBox(`vehBody-${v.node.name}`, { width: v.halfExtents.x * 2, height: v.halfExtents.y * 2, depth: v.halfExtents.z * 2 }, scene);
      box.isVisible = false;
      box.isPickable = false;
      const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene);
      agg.body.setMotionType(PhysicsMotionType.ANIMATED);
      // Velocity-driven kinematic motion (setTargetTransform) so vehicles push props instead of teleporting.
      agg.body.disablePreStep = true;
      aggregates.push(agg);
      if (v.isLocal) {
        agg.body.setCollisionCallbackEnabled(true);
        let last = 0;
        agg.body.getCollisionObservable().add((ev) => {
          const now = performance.now();
          if (now - last < 120) return;
          last = now;
          onLocalHit(ev.impulse ?? 5);
        });
      }
      box.rotationQuaternion = new Quaternion();
      followers.push({ node: v.node, body: agg.body, proxy: box, offsetY: v.halfExtents.y, last: new Vector3(0, -1000, 0), teleporting: false });
      statics.push(box);
    }

    const pos = new Vector3();
    const vel = new Vector3();
    const rot = new Quaternion();
    return {
      update() {
        for (const f of followers) {
          f.node.computeWorldMatrix(true).decompose(undefined, rot, pos);
          pos.y += f.offsetY;
          if (f.teleporting) {
            f.body.disablePreStep = true;
            f.teleporting = false;
          }
          if (Vector3.DistanceSquared(pos, f.last) > 64) {
            // Respawn / grid placement: snap instantly instead of sweeping through the scenery.
            f.proxy.position.copyFrom(pos);
            f.proxy.rotationQuaternion!.copyFrom(rot);
            f.body.disablePreStep = false;
            f.teleporting = true;
          } else {
            f.body.setTargetTransform(pos, rot);
          }
          f.last.copyFrom(pos);
        }
        // Clamp prop speeds: deep kinematic penetration at low FPS must not launch props into orbit.
        for (const b of propBodies) {
          b.getLinearVelocityToRef(vel);
          const sp = vel.length();
          if (sp > MAX_PROP_SPEED) b.setLinearVelocity(vel.scaleInPlace(MAX_PROP_SPEED / sp));
        }
        // Props that fell off the world are hidden (cheap safety).
        for (const p of props) if (p.position.y < -20) p.setEnabled(false);
      },
      dispose() {
        aggregates.forEach((a) => a.dispose());
        statics.forEach((s) => s.dispose());
        props.forEach((p) => p.dispose());
        template.dispose();
        scene.disablePhysicsEngine();
      },
    };
  } catch (err) {
    console.warn('[physics] Havok unavailable, props disabled', err);
    return null;
  }
};
