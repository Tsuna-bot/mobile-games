// Converts the KayKit packs (CC0, kaylousberg.itch.io) into small .glb files for Sagittaire.
// All characters share one rig, so only skeleton_minion keeps the animations (the ones
// the game plays, without the tracks that never move); everything is deduplicated,
// quantized and meshopt-compressed.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node tools/convert-kaykit.mjs <folder with the unzipped KayKit packs>
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const K = path.resolve(process.argv[2] ?? 'kits');
const OUT = new URL('../assets/kk', import.meta.url).pathname;
const ADV = `${K}/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures`;
const SKE = `${K}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons`;
const DUN = `${K}/KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf`;
const HAL = `${K}/KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf`;
const HEX = `${K}/KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf`;

const KEEP = new Set(['Idle', 'Idle_Combat', 'Running_A', 'Walking_A', 'Walking_D_Skeletons', 'Death_A', 'Hit_A', '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcast_Summon', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', 'Cheer', 'Spawn_Ground_Skeletons', 'Taunt', 'Throw', 'Dodge_Forward', 'Unarmed_Melee_Attack_Punch_A']);

const CHARACTERS = {
  rogue_hooded: `${ADV}/Characters/gltf/Rogue_Hooded.glb`,
  rogue: `${ADV}/Characters/gltf/Rogue.glb`,
  mage: `${ADV}/Characters/gltf/Mage.glb`,
  knight: `${ADV}/Characters/gltf/Knight.glb`,
  barbarian: `${ADV}/Characters/gltf/Barbarian.glb`,
  skeleton_minion: `${SKE}/Characters/gltf/Skeleton_Minion.glb`,
  skeleton_rogue: `${SKE}/Characters/gltf/Skeleton_Rogue.glb`,
  skeleton_warrior: `${SKE}/Characters/gltf/Skeleton_Warrior.glb`,
  skeleton_mage: `${SKE}/Characters/gltf/Skeleton_Mage.glb`,
};

const find = (dir, name) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const r = find(p, name);
      if (r) return r;
    } else if (entry.name === name) return p;
  }
  return null;
};

const PROPS = {
  // Forest (Medieval Hexagon pack).
  trees_A_large: HEX, trees_A_medium: HEX, trees_B_large: HEX, trees_B_medium: HEX, tree_single_A: HEX, tree_single_B: HEX,
  rock_single_A: HEX, rock_single_B: HEX, rock_single_C: HEX, rock_single_D: HEX, rock_single_E: HEX,
  hill_single_A: HEX, hill_single_B: HEX, resource_lumber: HEX, crate_A_big: HEX, barrel: HEX, waterlily_A: HEX, waterplant_A: HEX, target: HEX, tent: HEX, fence_wood_straight: HEX, fence_wood_straight_gate: HEX,
  // Dungeon.
  'column.gltf': DUN, 'pillar.gltf': DUN, 'pillar_decorated.gltf': DUN, 'barrel_large.gltf': DUN, 'barrel_small_stack.gltf': DUN, 'box_stacked.gltf': DUN, 'crates_stacked.gltf': DUN,
  'wall.gltf': DUN, 'wall_doorway.glb': DUN, 'wall_gated.gltf': DUN, 'torch_mounted.gltf': DUN, 'torch_lit.gltf': DUN, 'banner_red.gltf': DUN, 'banner_patternA_blue.gltf': DUN,
  'chest_gold.gltf': DUN, 'rubble_large.gltf': DUN, 'rubble_half.gltf': DUN, 'keg_decorated.gltf': DUN, 'floor_tile_large.gltf': DUN, 'floor_tile_small_weeds_A.gltf': DUN, 'coin_stack_large.gltf': DUN,
  // Graveyard (Halloween Bits).
  grave_A: HAL, grave_B: HAL, gravestone: HAL, gravemarker_A: HAL, crypt: HAL, coffin_decorated: HAL, pumpkin_orange_jackolantern: HAL, pumpkin_yellow: HAL,
  tree_dead_large: HAL, tree_dead_medium: HAL, tree_pine_orange_large: HAL, tree_pine_yellow_large: HAL, tree_pine_orange_medium: HAL,
  fence: HAL, fence_gate: HAL, fence_pillar: HAL, lantern_standing: HAL, post_lantern: HAL, post_skull: HAL, shrine_candles: HAL, skull_candle: HAL, arch_gate: HAL, ribcage: HAL, bone_A: HAL,
  // Weapons shown in hands.
  crossbow_1handed: `${ADV}/Assets/gltf`, staff: `${ADV}/Assets/gltf`, sword_1handed: `${ADV}/Assets/gltf`, quiver: `${ADV}/Assets/gltf`, arrow: `${ADV}/Assets/gltf`, axe_2handed: `${ADV}/Assets/gltf`,
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const dropAnim = (anim) => {
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput(), out = sampler.getOutput();
    sampler.dispose();
    if (input && input.listParents().length <= 1) input.dispose();
    if (out && out.listParents().length <= 1) out.dispose();
  }
  for (const channel of anim.listChannels()) channel.dispose();
  anim.dispose();
};

async function convert(input, output, character) {
  const doc = await io.read(input);
  const root = doc.getRoot();
  if (character) {
    // All KayKit characters share the same rig: only skeleton_minion carries the clips.
    for (const anim of root.listAnimations()) if (character !== 'anims' || !KEEP.has(anim.getName())) dropAnim(anim);
    // Drop tracks that never move away from the rest pose (most scale and many translation tracks).
    for (const anim of root.listAnimations()) {
      for (const channel of anim.listChannels()) {
        const sampler = channel.getSampler();
        const node = channel.getTargetNode();
        const out = sampler.getOutput().getArray();
        const pathName = channel.getTargetPath();
        const rest = pathName === 'rotation' ? node.getRotation() : pathName === 'scale' ? node.getScale() : node.getTranslation();
        const n = rest.length;
        let still = true;
        for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % n]) > (pathName === 'translation' ? 2e-3 : 1e-3)) still = false;
        if (still) {
          const inp = sampler.getInput(), o = sampler.getOutput();
          channel.dispose(); sampler.dispose();
          if (inp.listParents().length <= 1) inp.dispose();
          if (o.listParents().length <= 1) o.dispose();
        }
      }
    }
  } else for (const anim of root.listAnimations()) dropAnim(anim);
  await doc.transform(...(character ? [resample()] : [weld()]), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }), prune());
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await io.write(output, doc);
  return fs.statSync(output).size;
}

let total = 0;
for (const [name, file] of Object.entries(CHARACTERS)) {
  const size = await convert(file, `${OUT}/chars/${name}.glb`, name === 'skeleton_minion' ? 'anims' : 'mesh');
  total += size;
  console.log('char', name, Math.round(size / 1024), 'KB');
}
for (const [key, dir] of Object.entries(PROPS)) {
  const fileName = key.includes('.') ? key : `${key}.gltf`;
  const file = find(dir, fileName) || find(dir, `${fileName}.glb`) || find(dir, fileName.replace(/\.gltf$/, '.glb'));
  if (!file) {
    console.log('MISSING', key);
    continue;
  }
  const name = fileName.replace(/\.gltf$|\.glb$/, '').replace('.gltf', '');
  const size = await convert(file, `${OUT}/props/${name}.glb`, false);
  total += size;
}
console.log('total', Math.round(total / 1024), 'KB');
