import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { patchRim } from './surfaces.js';
import { AnimeLibrary } from './anime.js';

const BASE_URL = 'assets/kk/';

// KayKit packs by Kay Lousberg (CC0): Adventurers, Skeletons, Dungeon Remastered,
// Halloween Bits, Medieval Hexagon, Forest Nature; Quaternius Ultimate Monsters (CC0).
// Converted by tools/convert-kaykit.mjs (meshopt, quantized).
const CHARACTERS = ['rogue_hooded', 'rogue', 'mage', 'knight', 'barbarian', 'skeleton_minion', 'skeleton_rogue', 'skeleton_warrior', 'skeleton_mage',
  // Quaternius Ultimate Monsters (CC0), each with its own rig and clips.
  'q_mushnub', 'q_mushnub_evolved', 'q_wizard', 'q_orc', 'q_orc_skull', 'q_demon', 'q_bluedemon', 'q_mushroomking', 'q_tribal',
  'q_ghost', 'q_ghost_skull', 'q_bee', 'q_glub', 'q_hywirl', 'q_dragon', 'q_bat',
  'q_alien', 'q_alien_blob', 'q_bee_evolved', 'q_dino', 'q_dragon_small', 'q_glub_evolved', 'q_greenblob', 'q_ninja', 'q_pinkblob', 'q_spiky', 'q_squidle', 'q_yeti'];
const PROPS = [
  // Forest (KayKit Forest Nature Pack).
  'Tree_1_A', 'Tree_1_B', 'Tree_1_C', 'Tree_2_A', 'Tree_3_A', 'Tree_3_B', 'Tree_4_A', 'Tree_4_B', 'Tree_Bare_1_A', 'Tree_Bare_1_B', 'Tree_Bare_2_A',
  'Bush_1_A', 'Bush_1_C', 'Bush_1_E', 'Bush_1_G', 'Bush_3_A', 'Bush_4_A', 'Rock_3_A', 'Rock_3_B', 'Rock_3_C', 'Rock_3_E', 'Rock_2_A', 'Rock_1_A', 'Grass_1_A', 'Grass_2_A',
  'crate_A_big', 'barrel', 'fence_wood_straight_gate',
  // Dungeon.
  'column', 'pillar', 'pillar_decorated', 'barrel_large', 'barrel_small_stack', 'box_stacked', 'crates_stacked', 'wall', 'wall_gated', 'torch_lit', 'banner_red', 'banner_patternA_blue',
  'chest_gold', 'rubble_half', 'keg_decorated', 'coin_stack_large',
  // Graveyard.
  'grave_A', 'grave_B', 'gravestone', 'gravemarker_A', 'crypt', 'coffin_decorated', 'pumpkin_orange_jackolantern', 'pumpkin_yellow',
  'tree_dead_large', 'tree_dead_medium', 'tree_pine_orange_large', 'tree_pine_yellow_large', 'tree_pine_orange_medium',
  'fence', 'fence_gate', 'fence_pillar', 'post_lantern', 'post_skull', 'shrine_candles', 'skull_candle', 'arch_gate', 'ribcage', 'bone_A',
  // Weapons.
  'crossbow_1handed', 'staff', 'quiver', 'sword_1handed', 'axe_2handed',
];
const MODELS = [...CHARACTERS.map((n) => `chars/${n}`), ...PROPS.map((n) => `props/${n}`)];

/** Loads the models. Every file of a pack shares one texture: one material per texture. */
export class Assets {
  constructor() {
    this.models = new Map();
    this.materials = new Map();
    this.sizes = new Map();
    this.clips = [];
    this.monsterClips = new Map();
    this.mergedCache = new Map();
    this.anime = new AnimeLibrary();
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const bundleUrl = window.ARCHER_MODEL_BUNDLE;
    const bundle = bundleUrl ? await (await fetch(bundleUrl)).json() : null;
    let loaded = 0;
    const total = MODELS.length + this.anime.count;
    const animeJob = bundle ? Promise.resolve() : this.anime.load(loader, 'assets/anime/', () => onProgress?.(++loaded / total));
    await Promise.all(MODELS.map(async (path) => {
      const gltf = bundle
        ? await loader.parseAsync(Uint8Array.from(atob(bundle[path]), (c) => c.charCodeAt(0)).buffer, BASE_URL)
        : await loader.loadAsync(`${BASE_URL}${path}.glb`);
      const name = path.slice(path.indexOf('/') + 1);
      this.register(name, gltf.scene);
      // All the KayKit characters share one rig: their clips live in skeleton_minion.
      if (name === 'skeleton_minion') this.clips = gltf.animations;
      else if (gltf.animations.length) this.monsterClips.set(name, gltf.animations);
      onProgress?.(++loaded / total);
    }));
    await animeJob;
    // Quaternius' Stylized Nature MegaKit: one file, every model a named node (n_<name>).
    const nature = bundle?.['nature/nature']
      ? await loader.parseAsync(Uint8Array.from(atob(bundle['nature/nature']), (c) => c.charCodeAt(0)).buffer, 'assets/nature/')
      : await loader.loadAsync('assets/nature/nature.glb');
    for (const child of [...nature.scene.children]) {
      const holder = new THREE.Group();
      holder.add(child);
      this.register(`n_${child.name}`, holder);
    }
    // The pets, made in Blender by tools/blender/pets.py: one node per pet (pet_<id>).
    const pets = bundle?.['pets/pets']
      ? await loader.parseAsync(Uint8Array.from(atob(bundle['pets/pets']), (c) => c.charCodeAt(0)).buffer, 'assets/pets/')
      : await loader.loadAsync('assets/pets/pets.glb');
    for (const child of [...pets.scene.children]) this.register(`pet_${child.name}`, child);
    // Landscape props of the late chapters, also from Blender (tools/blender/props.py): b_<id>.
    const props = bundle?.['props/props']
      ? await loader.parseAsync(Uint8Array.from(atob(bundle['props/props']), (c) => c.charCodeAt(0)).buffer, 'assets/props/')
      : await loader.loadAsync('assets/props/props.glb');
    for (const child of [...props.scene.children]) this.register(`b_${child.name}`, child);
    onProgress?.(1);
  }

  register(name, scene) {
    scene.updateMatrixWorld(true);
    let skinned = false;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (object.isSkinnedMesh) skinned = true;
      const key = object.material.map?.image ? `${object.material.name}|${object.material.map.name || object.material.map.image.width}` : object.material.name;
      const shared = this.materials.get(key);
      if (!shared) {
        const m = object.material;
        m.roughness = 0.72;
        m.metalness = 0;
        if (m.map) m.map.anisotropy = 4;
        this.materials.set(key, m);
      } else if (object.material !== shared) {
        object.material.map?.dispose();
        object.material.dispose();
        object.material = shared;
      }
      object.castShadow = true;
      object.receiveShadow = !skinned;
    });
    scene.userData.skinned = skinned;
    // Characters get a rim light; weapons in their hands share their pack's material.
    if (skinned) scene.traverse((o) => o.isMesh && patchRim(o.material));
    const box = new THREE.Box3().setFromObject(scene);
    this.sizes.set(name, box);
    this.models.set(name, scene);
  }

  clone(name) {
    const source = this.models.get(name);
    if (!source) throw new Error(`Unknown model ${name}`);
    return source.userData.skinned ? SkeletonUtils.clone(source) : source.clone(true);
  }

  /** A clone scaled so its footprint (widest side) measures `width`, standing on y = 0. */
  fitted(name, width) {
    const prop = this.clone(name);
    const box = this.sizes.get(name);
    const s = width / Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3);
    const holder = new THREE.Group();
    prop.scale.setScalar(s);
    prop.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
    holder.add(prop);
    return holder;
  }

  clipsOf(name) {
    return this.monsterClips.get(name) ?? [];
  }

  /** Height of a model as loaded. */
  height(name) {
    const box = this.sizes.get(name);
    return Math.max(1e-3, box.max.y - box.min.y);
  }

  /** Height of a model once fitted to `width`. */
  fittedHeight(name, width) {
    const box = this.sizes.get(name);
    return (box.max.y - box.min.y) * width / Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3);
  }
}
