// Converts Quaternius' Stylized Nature MegaKit (CC0, quaternius.itch.io/stylized-nature-megakit)
// into one small .glb for Aetherfall: every model a named top-level node, shared textures
// (normal maps dropped, resized, WebP), tree bark simplified, meshopt-compressed.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node convert-nature.mjs <MegaKit folder> <out.glb>
import path from 'path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, quantize, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = path.resolve(process.argv[2], 'glTF');
const OUT = path.resolve(process.argv[3]);
const MODELS = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
  'TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3', 'TwistedTree_4', 'TwistedTree_5',
  'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big',
  'Flower_3_Group', 'Flower_4_Group', 'Mushroom_Common', 'Mushroom_Laetiporus', 'Grass_Wispy_Tall', 'Grass_Common_Tall', 'Clover_1',
  'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Square_1', 'Pebble_Square_2',
  'RockPath_Round_Wide', 'RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Square_Wide', 'RockPath_Square_Small_1', 'RockPath_Square_Small_2',
];

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('nature');
for (const name of MODELS) {
  const src = await io.read(path.join(SRC, `${name}.gltf`));
  // Bark is where the triangles are: simplify it hard, keep the leaf cards.
  await src.transform(weld());
  for (const mesh of src.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (/Bark/.test(prim.getMaterial()?.getName() ?? '')) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.02 });
    }
  }
  for (const m of src.getRoot().listMaterials()) m.setNormalTexture(null);
  const map = mergeDocuments(doc, src);
  const holder = doc.createNode(name);
  for (const s of src.getRoot().listScenes()) {
    const merged = map.get(s);
    for (const child of merged.listChildren()) holder.addChild(child);
    merged.dispose();
  }
  scene.addChild(holder);
}
for (const b of doc.getRoot().listBuffers().slice(1)) b.dispose();
for (const acc of doc.getRoot().listAccessors()) acc.setBuffer(doc.getRoot().listBuffers()[0]);
await doc.transform(prune(), dedup());
// Textures: leaves 512, rocks 512, bark / flowers / grass / mushrooms 256.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /baseColor/, pattern: /Leaves|Leaf|Rocks|PathRocks/, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], slots: /baseColor/, pattern: /Bark|Flowers|Grass|Mushrooms/, quality: 80 }),
);
await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
let tris = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log('models', MODELS.length, 'triangles', Math.round(tris), 'textures', doc.getRoot().listTextures().map((t) => `${t.getName() || t.getURI()} ${t.getSize()}`).join(', '));
