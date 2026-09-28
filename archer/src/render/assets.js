import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE_URL = 'assets/kk/';

// KayKit packs by Kay Lousberg (CC0): Adventurers, Skeletons, Dungeon Remastered,
// Halloween Bits, Medieval Hexagon. Converted by tools (meshopt, quantized).
const CHARACTERS = ['rogue_hooded', 'rogue', 'mage', 'knight', 'barbarian', 'skeleton_minion', 'skeleton_rogue', 'skeleton_warrior', 'skeleton_mage'];
const PROPS = [
  // Forest.
  'trees_A_large', 'trees_A_medium', 'trees_B_large', 'trees_B_medium', 'tree_single_A', 'tree_single_B',
  'rock_single_A', 'rock_single_C', 'rock_single_E', 'resource_lumber', 'crate_A_big', 'barrel', 'waterlily_A', 'target', 'fence_wood_straight', 'fence_wood_straight_gate',
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
    this.mergedCache = new Map();
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const bundleUrl = window.ARCHER_MODEL_BUNDLE;
    const bundle = bundleUrl ? await (await fetch(bundleUrl)).json() : null;
    let loaded = 0;
    await Promise.all(MODELS.map(async (path) => {
      const gltf = bundle
        ? await loader.parseAsync(Uint8Array.from(atob(bundle[path]), (c) => c.charCodeAt(0)).buffer, BASE_URL)
        : await loader.loadAsync(`${BASE_URL}${path}.glb`);
      const name = path.slice(path.indexOf('/') + 1);
      this.register(name, gltf.scene);
      // All the characters share one rig: the clips live in skeleton_minion.
      if (gltf.animations.length) this.clips = gltf.animations;
      onProgress?.(++loaded / MODELS.length);
    }));
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

  /** Height of a model once fitted to `width`. */
  fittedHeight(name, width) {
    const box = this.sizes.get(name);
    return (box.max.y - box.min.y) * width / Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3);
  }
}
