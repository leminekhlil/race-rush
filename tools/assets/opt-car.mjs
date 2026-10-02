import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsVariants, KHRMaterialsIridescence, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplifyPrimitive, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
const drop = /^(BodyWindshieldWipers|BodyWindshieldWipersBase|Engine|InteriorPedal|InteriorFloormats|InteriorFloor$|BodyHoodInterior|BodyHoodUnder|License Plate|InteriorSteering(Base|Cylinder|Dash|DashColumn|Handle)|InteriorDoor|InteriorCage|InteriorRearHatch|InteriorRearPanels|Axles|BodyDoor.Handle)/;
for (const n of root.listNodes()) if (drop.test(n.getName())) n.dispose();
// Remove heavy/expensive extensions (variants, iridescence, transmission → alpha glass).
for (const m of root.listMaterials()) {
  if (m.getExtension('KHR_materials_transmission')) {
    m.setExtension('KHR_materials_transmission', null);
    m.setAlphaMode('BLEND');
    const f = m.getBaseColorFactor();
    m.setBaseColorFactor([f[0] * 0.15, f[1] * 0.18, f[2] * 0.22, 0.55]);
    m.setRoughnessFactor(0.05);
    m.setMetallicFactor(0.1);
  }
  m.setExtension('KHR_materials_iridescence', null);
}
doc.getRoot().listExtensionsUsed().filter((e) => ['KHR_materials_variants', 'KHR_materials_iridescence', 'KHR_materials_transmission'].includes(e.extensionName)).forEach((e) => e.dispose());
// Drop secondary UVs and tangents (not needed for our materials at this size).
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  if (p.getAttribute('TEXCOORD_1')) {
    // occlusion uses TEXCOORD_1: keep it if the material samples it
    const occ = p.getMaterial()?.getOcclusionTexture();
    if (!occ) p.setAttribute('TEXCOORD_1', null);
  }
}
await MeshoptSimplifier.ready;
await doc.transform(dedup(), weld({ tolerance: 0.0001 }));
// Per-part budgets: keep the paint surfaces smooth, cut hidden / small detail hard.
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName();
  const mats = mesh.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '').join(',');
  let ratio = 0.12, error = 0.004;
  if (/Paint|Glass/.test(mats)) { ratio = 0.35; error = 0.0012; }
  if (/Rim/.test(name)) { ratio = 0.14; error = 0.002; }
  if (/Interior/.test(name)) { ratio = 0.1; error = 0.006; }
  if (/BrakePad/.test(name)) { ratio = 0.08; error = 0.004; }
  for (const prim of mesh.listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error });
}
await doc.transform(
  dedup(),
  weld({ tolerance: 0.0001 }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
  ...(process.env.NOQ ? [] : [quantize()]),
);
await io.write(out, doc);
