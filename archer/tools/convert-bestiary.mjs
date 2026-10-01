// Converts Quaternius' Bestiary - Dungeon Monsters Kit (free Standard part: Imp and
// Puglin, CC0, quaternius.com) into light animated monsters for Aetherfall, one file per
// colour variant. Animations come from Quaternius' Universal Animation Library (CC0):
// same humanoid rig, so its clips play as they are (rotations only, the body
// proportions differ), renamed to what the game looks for.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node tools/convert-bestiary.mjs <Bestiary [Standard] folder> <UAL1_Standard.glb>
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = path.resolve(process.argv[2]);
const UAL = path.resolve(process.argv[3]);
const OUT = new URL('../assets/kk/chars', import.meta.url).pathname;

// Monster -> its colour variants (BaseColor texture number) and the game's file names.
const MONSTERS = {
  Imp: { variants: { 1: 'b_imp_red', 3: 'b_imp_blue' }, ratio: 0.3 },
  Puglin: { variants: { 1: 'b_puglin_green', 2: 'b_puglin_red' }, ratio: 0.45 },
};
// Game clip name <- Universal Animation Library clip.
const CLIPS = {
  Idle: 'Idle_Loop', Walk: 'Walk_Loop', Run: 'Jog_Fwd_Loop', Death: 'Death01', HitReact: 'Hit_Chest', Weapon: 'Sword_Attack',
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const library = await io.read(UAL);

/** Copies the wanted clips of the library onto the bones of `doc` with the same names. */
function addClips(doc) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const [name, source] of Object.entries(CLIPS)) {
    const clip = library.getRoot().listAnimations().find((a) => a.getName() === source);
    if (!clip) throw new Error(`No clip ${source}`);
    const anim = doc.createAnimation(name);
    for (const channel of clip.listChannels()) {
      // Rotations only: translations would stretch the monster to the mannequin's size.
      if (channel.getTargetPath() !== 'rotation') continue;
      const target = nodes.get(channel.getTargetNode()?.getName());
      if (!target) continue;
      const s = channel.getSampler();
      const input = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer);
      const output = doc.createAccessor().setType('VEC4').setArray(s.getOutput().getArray().slice()).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath('rotation').setSampler(sampler));
    }
  }
}

const exports = path.join(SRC, 'Exports', 'GLB (Godot-Unreal)');
for (const [monster, { variants, ratio }] of Object.entries(MONSTERS)) {
  for (const [variant, out] of Object.entries(variants)) {
    const doc = await io.read(path.join(exports, `${monster}.glb`));
    const root = doc.getRoot();
    // Colour only: the game draws its own toon shading (no normal, ORM or emissive maps).
    for (const material of root.listMaterials()) {
      // A name per variant: the game shares materials by name, the colours must not mix.
      material.setName(`${material.getName()}_${out}`);
      material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
      material.setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]);
      const base = material.getBaseColorTexture();
      if (base) base.setImage(fs.readFileSync(path.join(SRC, 'Textures', `T_${monster}_BaseColor_${variant}.png`))).setMimeType('image/png').setURI(`T_${monster}_${variant}.png`);
    }
    addClips(doc);
    await doc.transform(
      prune(), dedup(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
      prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const file = path.join(OUT, `${out}.glb`);
    await io.write(file, doc);
    let tris = 0;
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
    console.log(out, 'triangles', Math.round(tris), 'clips', root.listAnimations().length, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
}
