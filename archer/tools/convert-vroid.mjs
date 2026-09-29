// Converts VRoid sample characters (VRM 0.x, CC0) into light .glb files for Sagittaire:
// textures resized and turned to WebP, normal maps and most face expressions dropped,
// hair and cloth pieces sharing a material joined, meshes quantized and meshopt-compressed.
// The VRM extension (spring bones, MToon) is not kept: the game draws its own toon shading.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node tools/convert-vroid.mjs <folder with the .vrm files>
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const SRC = path.resolve(process.argv[2] ?? '.');
const OUT = new URL('../assets/anime', import.meta.url).pathname;

// Game hero -> VRoid sample model and a fantasy recolour of its clothes and hair.
// HairSample_Male and Sakurada_Fumiriya are CC0; AvatarSample_C is free to use
// (commercial use allowed, no credit needed, no paid redistribution of the file).
// `recolor`: material name pattern -> { tint, floor, brightness } (see recolor()).
const HEROES = {
  archer: { model: 'HairSample_Male', recolor: [[/Tops/, { tint: '#5fa84a' }], [/Bottoms/, { tint: '#7a5634', floor: 0.3 }], [/Shoes/, { tint: '#6a4428' }], [/HAIR/, { tint: '#b0703c', floor: 0.3 }]] },
  assassin: { model: 'AvatarSample_C', recolor: [[/Tops/, { tint: '#8a62d8', floor: 0.2 }], [/Bottoms/, { tint: '#3e2e62', floor: 0.3 }], [/Shoes/, { tint: '#2e2640' }], [/HAIR/, { tint: '#3a3050', floor: 0.35 }]] },
  ranger: { model: 'Sakurada_Fumiriya', recolor: [[/Tops/, { tint: '#b08a52' }], [/AccessoryNeck/, { tint: '#b83a3a' }], [/Bottoms/, { tint: '#5a4230', floor: 0.3 }], [/Shoes/, { tint: '#4a3420' }], [/HAIR/, { tint: '#3fb0a0', floor: 0.3 }]] },
  mage: { model: 'HairSample_Male', recolor: [[/Tops/, { tint: '#c8b4ff' }], [/Bottoms/, { tint: '#3c3688', floor: 0.3 }], [/Shoes/, { tint: '#34305a' }], [/HAIR/, { tint: '#f0f2ff', floor: 0.55 }]] },
  knight: { model: 'AvatarSample_C', recolor: [[/Tops/, { tint: '#c0d0e8', floor: 0.3 }], [/Bottoms/, { tint: '#46546e', floor: 0.3 }], [/Shoes/, { tint: '#5a4632' }], [/HAIR/, { tint: '#d0602c', floor: 0.3 }]] },
};
// Face expressions kept (blink and a smile); the rest weighs megabytes.
const KEEP_TARGETS = ['Fcl_EYE_Close', 'Fcl_ALL_Joy', 'Fcl_EYE_Joy'];

/**
 * Joins the primitives of each mesh that share a material (hair comes in ~80 pieces).
 * gltf-transform's join() skips skinned meshes; here every primitive of a mesh shares
 * the node's skin, so concatenating them is safe. Primitives with morph targets stay.
 */
function joinSkinned(doc) {
  const root = doc.getRoot();
  for (const mesh of root.listMeshes()) {
    const groups = new Map();
    for (const prim of mesh.listPrimitives()) {
      if (prim.listTargets().length || prim.getMode() !== 4 || !prim.getIndices()) continue;
      const key = `${root.listMaterials().indexOf(prim.getMaterial())}|${prim.listSemantics().sort().join('+')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(prim);
    }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      const semantics = prims[0].listSemantics();
      const counts = prims.map((p) => p.getAttribute('POSITION').getCount());
      const total = counts.reduce((a, b) => a + b, 0);
      const merged = doc.createPrimitive().setMaterial(prims[0].getMaterial());
      for (const semantic of semantics) {
        const size = prims[0].getAttribute(semantic).getElementSize();
        const Type = semantic.startsWith('JOINTS') ? Uint16Array : Float32Array;
        const array = new Type(total * size);
        const element = [];
        let offset = 0;
        for (const p of prims) {
          const attr = p.getAttribute(semantic);
          for (let i = 0; i < attr.getCount(); i++) array.set(attr.getElement(i, element), (offset + i) * size);
          offset += attr.getCount();
        }
        merged.setAttribute(semantic, doc.createAccessor().setType(prims[0].getAttribute(semantic).getType()).setArray(array).setBuffer(root.listBuffers()[0]));
      }
      const indices = [];
      let base = 0;
      prims.forEach((p, k) => {
        const idx = p.getIndices();
        for (let i = 0; i < idx.getCount(); i++) indices.push(idx.getScalar(i) + base);
        base += counts[k];
      });
      merged.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(root.listBuffers()[0]));
      for (const p of prims) {
        mesh.removePrimitive(p);
        p.dispose();
      }
      mesh.addPrimitive(merged);
    }
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
fs.mkdirSync(OUT, { recursive: true });

/**
 * Recolours the base texture of every material matching a pattern (once per texture):
 * the pixels' lightness is stretched to the full range (so dark hair can turn silver),
 * then multiplied by the tint. `brightness` scales, `floor` lifts the darkest shade.
 */
async function recolor(doc, rules) {
  const done = new Set();
  for (const material of doc.getRoot().listMaterials()) {
    const rule = rules.find(([pattern]) => pattern.test(material.getName()))?.[1];
    const texture = material.getBaseColorTexture();
    if (!rule || !texture || done.has(texture)) continue;
    done.add(texture);
    const { data, info } = await sharp(Buffer.from(texture.getImage())).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`${material.getName()}: expected RGBA pixels`);
    const tint = [1, 3, 5].map((i) => parseInt(rule.tint.slice(i, i + 2), 16) / 255);
    // Lightness range of the visible pixels (2nd and 98th percentiles).
    const lums = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 16) lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lums.sort((a, b) => a - b);
    const lo = lums[Math.floor(lums.length * 0.02)] ?? 0;
    const hi = Math.max(lo + 1, lums[Math.floor(lums.length * 0.98)] ?? 255);
    const floor = rule.floor ?? 0.25;
    const gain = rule.brightness ?? 1;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const t = Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
      const k = (floor + (1 - floor) * t) * gain;
      for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(tint[c] * k * 255));
    }
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    texture.setImage(new Uint8Array(png)).setMimeType('image/png');
    material.setBaseColorFactor([1, 1, 1, material.getBaseColorFactor()[3]]);
  }
}

for (const [hero, { model: name, recolor: rules }] of Object.entries(HEROES)) {
  const doc = await io.read(path.join(SRC, `${name}.vrm`));
  const root = doc.getRoot();
  await recolor(doc, rules);
  for (const material of root.listMaterials()) {
    // Unlit materials would let prune() drop the normals the toon shading needs.
    material.setExtension('KHR_materials_unlit', null);
    material.setNormalTexture(null);
    material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
    material.setOcclusionTexture(null);
    material.setMetallicRoughnessTexture(null);
  }
  // Keep only a few morph targets.
  for (const mesh of root.listMeshes()) {
    const names = mesh.getExtras()?.targetNames;
    if (!names?.length) continue;
    const keep = names.map((n, i) => (KEEP_TARGETS.includes(n) ? i : -1)).filter((i) => i >= 0);
    for (const prim of mesh.listPrimitives()) {
      prim.listTargets().forEach((target, i) => {
        if (!keep.includes(i)) {
          prim.removeTarget(target);
          target.dispose();
        }
      });
    }
    mesh.setWeights(keep.map(() => 0));
    mesh.setExtras({ ...mesh.getExtras(), targetNames: keep.map((i) => names[i]) });
  }
  await doc.transform(prune(), dedup());
  joinSkinned(doc);
  await doc.transform(
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 88 }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    prune(),
  );
  const file = path.join(OUT, `${hero}.glb`);
  await io.write(file, doc);
  const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  console.log(hero, name, Math.round(fs.statSync(file).size / 1024), 'KB,', prims, 'primitives,', root.listTextures().length, 'textures');
}
