// Post-process: remap materials, merge every non-wheel part into one "Body" mesh and each wheel subtree into one mesh.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh, joinPrimitives, prune, dedup, quantize, weld } from '@gltf-transform/functions';
import { mat4 } from 'gl-matrix';

const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
const mats = Object.fromEntries(root.listMaterials().map((m) => [m.getName(), m]));
const pick = (n) => mats[n];
const remap = (name) => {
  if (/^Paint 1/.test(name)) return pick('Paint 1 Carmine');
  if (/^Paint 2/.test(name)) return pick('Paint 2 Carmine');
  if (/Glass|Mirror/.test(name)) return pick('Glass');
  if (/Interior|Dashboard|Panel Sides|Floormat/.test(name)) return pick('Interior 1');
  if (/Brakelight|Signallight/.test(name)) return pick('Brakelight');
  if (/Headlight/.test(name)) return pick('Headlight');
  if (/Tireside|Tiretread/.test(name)) return pick('Tiretread');
  if (/Rim/.test(name)) return pick('Rim1');
  if (/Brake|Disc/.test(name)) return pick('Brake');
  return pick('Mechanical');
};
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) p.setMaterial(remap(p.getMaterial()?.getName() ?? ''));

const rel = (parent, node) => {
  const inv = mat4.invert(mat4.create(), parent.getWorldMatrix());
  return mat4.multiply(mat4.create(), inv, node.getWorldMatrix());
};
const collect = (top, skip) => {
  const prims = [];
  const visit = (n) => {
    if (skip(n)) return;
    const m = n.getMesh();
    if (m) {
      const copy = m.clone();
      transformMesh(copy, rel(top, n));
      prims.push(...copy.listPrimitives());
    }
    n.listChildren().forEach(visit);
  };
  visit(top);
  return prims;
};
const mergeInto = (node, prims, name) => {
  const byMat = new Map();
  for (const p of prims) {
    const key = p.getMaterial();
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(p);
  }
  const mesh = doc.createMesh(name);
  for (const [, list] of byMat) {
    // Align attribute sets before joining (drop attributes not shared by all).
    const sem = list.map((p) => new Set(p.listSemantics()));
    const common = [...sem[0]].filter((s) => sem.every((x) => x.has(s)));
    for (const p of list) for (const s of p.listSemantics()) if (!common.includes(s)) p.setAttribute(s, null);
    mesh.addPrimitive(list.length === 1 ? list[0] : joinPrimitives(list));
  }
  node.setMesh(mesh);
};
const scene = root.listScenes()[0];
const body = scene.listChildren()[0];
const isWheel = (n) => /^Wheel(Front|Rear)[LR]$/.test(n.getName());
const wheels = body.listChildren().filter(isWheel);
for (const w of wheels) {
  const prims = collect(w, () => false);
  for (const c of [...w.listChildren()]) c.dispose();
  mergeInto(w, prims, `${w.getName()}Mesh`);
}
const bodyPrims = collect(body, (n) => n !== body && isWheel(n));
for (const c of [...body.listChildren()]) if (!isWheel(c)) c.dispose();
mergeInto(body, bodyPrims, 'Body');
await doc.transform(prune(), dedup(), weld({ tolerance: 0.0001 }), quantize());
await io.write(out, doc);
const count = root.listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0);
console.log('meshes', root.listMeshes().length, 'primitives', count, 'materials', root.listMaterials().map((m) => m.getName()).join(' | '));
