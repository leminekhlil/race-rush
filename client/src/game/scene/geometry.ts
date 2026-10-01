import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { TrackPath } from '@race-rush/shared';

/**
 * Accumulates raw triangles so many props can be merged into one draw call.
 */
export class GeometryBatch {
  positions: number[] = [];
  indices: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(x: number, y: number, z: number, u: number, v: number, c: Color3 | null = null): number {
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    if (c) this.colors.push(c.r, c.g, c.b, 1);
    else this.colors.push(1, 1, 1, 1);
    return this.vertexCount - 1;
  }

  /** Quad from 4 corners (counter-clockwise when seen from the visible side in Babylon's left-handed space). */
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * Oriented box. `uvScale` maps world meters to texture repeats (facades tile correctly).
   * Top face UVs collapse onto (0,0) so roofs use the plain-wall texel.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, color: Color3 | null, uvScale = 0, topPlain = true): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const hx = sx / 2;
    const hz = sz / 2;
    const corner = (lx: number, lz: number) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
    const p = [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)];
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const widths = [sx, sz, sx, sz];
    for (let i = 0; i < 4; i++) {
      const a = p[i];
      const b = p[(i + 1) % 4];
      const uMax = uvScale ? widths[i] * uvScale : 1;
      const vMax = uvScale ? sy * uvScale : 1;
      const v0 = this.vertex(a.x, y0, a.z, 0, 0, color);
      const v1 = this.vertex(b.x, y0, b.z, uMax, 0, color);
      const v2 = this.vertex(b.x, y1, b.z, uMax, vMax, color);
      const v3 = this.vertex(a.x, y1, a.z, 0, vMax, color);
      this.indices.push(v0, v1, v2, v0, v2, v3);
    }
    const tu = topPlain ? 0.005 : 1;
    const t0 = this.vertex(p[0].x, y1, p[0].z, 0, 0, color);
    const t1 = this.vertex(p[1].x, y1, p[1].z, tu, 0, color);
    const t2 = this.vertex(p[2].x, y1, p[2].z, tu, tu, color);
    const t3 = this.vertex(p[3].x, y1, p[3].z, 0, tu, color);
    this.indices.push(t0, t1, t2, t0, t2, t3);
  }

  build(name: string, scene: Scene, material: Material | null, useColors = true): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.indices = this.indices;
    vd.uvs = this.uvs;
    if (useColors) vd.colors = this.colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(this.positions, this.indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, false);
    mesh.material = material;
    if (useColors) mesh.hasVertexAlpha = false;
    mesh.freezeWorldMatrix();
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }
}

export interface StripProfile {
  /** Lateral offsets (meters, + = right) of the profile vertices, left to right. */
  offsets: (s: number) => number[];
  /** Height above road base for each profile vertex. */
  heights: (s: number) => number[];
  /** U coordinate for each vertex. */
  us: number[];
  /** Meters per texture repeat along the track. */
  vLength: number;
  /** Optional s-range (meters). Defaults to the full loop. */
  from?: number;
  to?: number;
  includeRamps?: boolean;
}

/** Extrudes a cross-section profile along the track centerline. */
export const extrudeAlongTrack = (batch: GeometryBatch, path: TrackPath, profile: StripProfile): void => {
  const from = profile.from ?? 0;
  const to = profile.to ?? path.length;
  const span = to >= from ? to - from : to + path.length - from;
  const steps = Math.max(1, Math.ceil(span / path.step));
  const cols = profile.us.length;
  const base = batch.vertexCount;
  for (let i = 0; i <= steps; i++) {
    const s = from + (span * i) / steps;
    const smp = path.sampleAt(s);
    const y0 = profile.includeRamps ? path.groundHeight(s) : path.baseHeight(s);
    const offs = profile.offsets(s);
    const hs = profile.heights(s);
    for (let c = 0; c < cols; c++) {
      batch.vertex(smp.x + smp.rx * offs[c], y0 + hs[c], smp.z + smp.rz * offs[c], profile.us[c], (s - from) / profile.vLength);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + i * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      batch.indices.push(a, b, e, a, e, d);
    }
  }
};
