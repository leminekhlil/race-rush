import type { Scene } from '@babylonjs/core/scene';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { particleTexture } from '../scene/textures';
import type { VehicleModel } from '../scene/VehicleFactory';

export interface VehicleEmitters {
  update(opts: { drifting: boolean; boosting: boolean; dust: number; speed: number }): void;
  dispose(): void;
}

/**
 * Particle effects with fixed pools (no per-frame allocation). Burst systems are shared and repositioned;
 * continuous systems are created once per vehicle and only their emit rate changes.
 */
export class Effects {
  private readonly tex: Texture;
  private readonly sparks: ParticleSystem;
  private readonly puffs: ParticleSystem;
  private readonly sparkOrigin = new Vector3();
  private readonly puffOrigin = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly scale: number,
    private readonly desert: boolean,
  ) {
    this.tex = particleTexture(scene);

    this.sparks = new ParticleSystem('sparks', Math.round(240 * scale) + 20, scene);
    this.sparks.particleTexture = this.tex;
    this.sparks.emitter = this.sparkOrigin;
    this.sparks.minEmitBox.set(-0.3, -0.2, -0.3);
    this.sparks.maxEmitBox.set(0.3, 0.2, 0.3);
    this.sparks.color1 = new Color4(1, 0.85, 0.35, 1);
    this.sparks.color2 = new Color4(1, 0.5, 0.1, 1);
    this.sparks.colorDead = new Color4(0.6, 0.1, 0, 0);
    this.sparks.minSize = 0.06;
    this.sparks.maxSize = 0.18;
    this.sparks.minLifeTime = 0.15;
    this.sparks.maxLifeTime = 0.45;
    this.sparks.minEmitPower = 5;
    this.sparks.maxEmitPower = 14;
    this.sparks.direction1.set(-1, 0.6, -1);
    this.sparks.direction2.set(1, 1.6, 1);
    this.sparks.gravity.set(0, -18, 0);
    this.sparks.emitRate = 0;
    this.sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.sparks.start();

    this.puffs = new ParticleSystem('puffs', Math.round(160 * scale) + 16, scene);
    this.puffs.particleTexture = this.tex;
    this.puffs.emitter = this.puffOrigin;
    this.puffs.minEmitBox.set(-1, 0, -1);
    this.puffs.maxEmitBox.set(1, 0.3, 1);
    const dustColor = desert ? new Color4(0.86, 0.68, 0.45, 0.55) : new Color4(0.75, 0.78, 0.85, 0.45);
    this.puffs.color1 = dustColor;
    this.puffs.color2 = dustColor;
    this.puffs.colorDead = new Color4(dustColor.r, dustColor.g, dustColor.b, 0);
    this.puffs.minSize = 0.8;
    this.puffs.maxSize = 2.2;
    this.puffs.minLifeTime = 0.4;
    this.puffs.maxLifeTime = 0.9;
    this.puffs.minEmitPower = 1;
    this.puffs.maxEmitPower = 4;
    this.puffs.direction1.set(-1, 0.4, -1);
    this.puffs.direction2.set(1, 1, 1);
    this.puffs.emitRate = 0;
    this.puffs.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.puffs.start();
  }

  sparksAt(x: number, y: number, z: number, strength: number): void {
    this.sparkOrigin.set(x, y, z);
    this.sparks.manualEmitCount = Math.round(Math.min(60, 8 + strength * 2.5) * this.scale);
  }

  puffAt(x: number, y: number, z: number, strength: number): void {
    this.puffOrigin.set(x, y, z);
    this.puffs.manualEmitCount = Math.round(Math.min(40, 6 + strength * 2) * this.scale);
  }

  /** Continuous emitters attached to a vehicle: tire smoke, dust, boost flames. */
  attachVehicle(model: VehicleModel, full: boolean): VehicleEmitters {
    const systems: ParticleSystem[] = [];
    const anchors: Mesh[] = [];
    const anchor = (pos: Vector3) => {
      const m = new Mesh(`emit-${model.root.name}`, this.scene);
      m.parent = model.chassis;
      m.position.copyFrom(pos);
      m.isVisible = false;
      anchors.push(m);
      return m;
    };

    const smoke = new ParticleSystem('smoke', Math.round((full ? 120 : 40) * this.scale) + 10, this.scene);
    smoke.particleTexture = this.tex;
    smoke.emitter = anchor(new Vector3(0, 0.1, model.rearContacts[0]?.z ?? -1.3));
    const halfTrack = Math.max(0.2, Math.abs(model.rearContacts[0]?.x ?? 0.8));
    smoke.minEmitBox.set(-halfTrack, 0, -0.1);
    smoke.maxEmitBox.set(halfTrack, 0.1, 0.1);
    const sc = this.desert ? new Color4(0.82, 0.64, 0.42, 0.32) : new Color4(0.88, 0.9, 0.95, 0.3);
    smoke.color1 = sc;
    smoke.color2 = new Color4(sc.r * 0.92, sc.g * 0.92, sc.b * 0.92, sc.a * 0.7);
    smoke.colorDead = new Color4(sc.r, sc.g, sc.b, 0);
    smoke.minSize = 0.5;
    smoke.maxSize = 1.5;
    smoke.minScaleX = smoke.minScaleY = 1;
    smoke.addSizeGradient(0, 0.6);
    smoke.addSizeGradient(1, 1.8);
    smoke.minLifeTime = 0.35;
    smoke.maxLifeTime = 0.8;
    smoke.minEmitPower = 0.3;
    smoke.maxEmitPower = 1.2;
    smoke.direction1.set(-0.5, 0.5, -1);
    smoke.direction2.set(0.5, 1, -0.3);
    smoke.gravity.set(0, 0.6, 0);
    smoke.emitRate = 0;
    smoke.start();
    systems.push(smoke);

    const flames: ParticleSystem[] = [];
    for (const ex of model.exhausts) {
      const f = new ParticleSystem('flame', Math.round((full ? 90 : 40) * this.scale) + 10, this.scene);
      f.particleTexture = this.tex;
      f.emitter = anchor(ex);
      f.minEmitBox.setAll(-0.04);
      f.maxEmitBox.setAll(0.04);
      f.color1 = new Color4(0.35, 0.75, 1, 1);
      f.color2 = new Color4(1, 0.8, 0.3, 1);
      f.colorDead = new Color4(1, 0.2, 0.05, 0);
      f.minSize = 0.25;
      f.maxSize = 0.6;
      f.minLifeTime = 0.06;
      f.maxLifeTime = 0.16;
      f.minEmitPower = 6;
      f.maxEmitPower = 10;
      f.direction1.set(-0.08, 0.05, -1);
      f.direction2.set(0.08, 0.15, -1);
      f.blendMode = ParticleSystem.BLENDMODE_ADD;
      f.emitRate = 0;
      f.start();
      flames.push(f);
      systems.push(f);
    }

    return {
      update: ({ drifting, boosting, dust, speed }) => {
        const k = this.scale * (full ? 1 : 0.5);
        smoke.emitRate = (drifting ? 55 : 0) * k + dust * 12 * k;
        for (const f of flames) f.emitRate = boosting ? 160 * k : speed > 50 ? 6 * k : 0;
      },
      dispose: () => {
        systems.forEach((s) => s.dispose());
        anchors.forEach((a) => a.dispose());
      },
    };
  }

  dispose(): void {
    this.sparks.dispose();
    this.puffs.dispose();
  }
}
