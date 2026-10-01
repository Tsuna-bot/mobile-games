// Packs the fitted armour of the heroes (tools/blender/outfits.py, one JSON and one PNG
// per hero) into assets/anime/outfits.glb: one mesh per hero (node named after it) with
// UVs, joint indices and weights, and its texture (WebP); the node's extras list the
// joint names, which the game binds to the hero's own skeleton.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node outfits.mjs <json dir> <out.glb>
import fs from 'fs';
import path from 'path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, quantize, textureCompress, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import { MeshoptEncoder } from 'meshoptimizer';

const [dir, out] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('outfits');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const hero = path.basename(file, '.json');
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(data.positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(data.normals)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(data.uvs)))
    .setAttribute('JOINTS_0', accessor('VEC4', new Uint8Array(data.jointIndices)))
    .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(data.weights)))
    .setMaterial(doc.createMaterial(`${hero}_outfit`).setRoughnessFactor(0.8)
      .setBaseColorTexture(doc.createTexture(hero).setImage(fs.readFileSync(path.join(dir, data.texture))).setMimeType('image/png').setURI(`${hero}_outfit.png`)));
  const mesh = doc.createMesh(`${hero}_outfit`).addPrimitive(prim);
  scene.addChild(doc.createNode(hero).setMesh(mesh).setExtras({ joints: data.joints }));
}
await doc.transform(weld(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88 }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log('outfits', out, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
