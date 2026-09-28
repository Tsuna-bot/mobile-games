import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE_URL = 'assets/models/';

// Kenney kits (CC0): Mini Characters (heroes), Mini Dungeon, Graveyard Kit, Nature Kit.
const MODELS = [
  ...['character-female-b', 'character-female-d', 'character-female-f', 'character-male-a', 'character-male-c', 'character-male-e'].map((n) => `characters/${n}`),
  ...['character-orc', 'character-human', 'floor', 'floor-detail', 'wall', 'wall-half', 'column', 'gate', 'barrel', 'chest', 'coin', 'banner', 'stones', 'rocks', 'pot', 'wood-structure', 'trap', 'potion'].map((n) => `dungeon/${n}`),
  ...['character-zombie', 'character-skeleton', 'character-ghost', 'character-vampire', 'character-keeper', 'gravestone-cross', 'gravestone-round', 'gravestone-bevel', 'grave', 'pine', 'pine-crooked', 'lightpost-single', 'fence', 'iron-fence', 'iron-fence-border-gate', 'stone-wall', 'pumpkin-carved', 'crypt-small', 'rocks-tall', 'fire-basket', 'debris', 'trunk', 'pillar-large'].map((n) => `graveyard/${n}`),
  ...['tree_oak', 'tree_pineRoundA', 'tree_default', 'tree_fat', 'tree_detailed', 'plant_bush', 'plant_bushLarge', 'rock_tallA', 'rock_smallA', 'stump_round', 'log_stack', 'flower_redA', 'flower_yellowA', 'mushroom_redGroup', 'grass_large'].map((n) => `nature/${n}`),
];

/** Palette of a model: each Kenney kit ships one texture shared by all its models. */
function paletteOf(name) {
  return name.slice(0, name.indexOf('/'));
}

/**
 * Loads the models. Every model of a kit uses the same palette texture, so each kit
 * shares one material: few texture uploads, few shader programs, cheap instancing.
 */
export class Assets {
  constructor() {
    this.models = new Map();
    this.animations = new Map();
    this.geometries = new Map();
    this.materials = {};
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const bundleUrl = window.ARCHER_MODEL_BUNDLE;
    const bundle = bundleUrl ? await (await fetch(bundleUrl)).json() : null;
    let loaded = 0;
    await Promise.all(MODELS.map(async (name) => {
      const folder = name.slice(0, name.lastIndexOf('/') + 1);
      const gltf = bundle
        ? await loader.parseAsync(Uint8Array.from(atob(bundle[name]), (c) => c.charCodeAt(0)).buffer, BASE_URL + folder)
        : await loader.loadAsync(`${BASE_URL}${name}.glb`);
      this.register(name, gltf.scene);
      if (gltf.animations.length) this.animations.set(name, gltf.animations);
      onProgress?.(++loaded / MODELS.length);
    }));
  }

  register(name, scene) {
    const palette = paletteOf(name);
    scene.updateMatrixWorld(true);
    let skinned = false;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (object.isSkinnedMesh) skinned = true;
      // The Nature Kit uses flat colours: bake them into the vertices, one shared material.
      if (palette === 'nature' && !object.geometry.attributes.color) {
        const color = (object.material.color ?? new THREE.Color(1, 1, 1)).clone();
        // The kit's teal greens clash with the grass: pull them toward yellow-green.
        const hsl = color.getHSL({});
        if (hsl.h > 0.26 && hsl.h < 0.56 && hsl.s > 0.15) color.setHSL(0.24 + (hsl.h - 0.26) * 0.22, hsl.s * 0.9, hsl.l * 1.02);
        const count = object.geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
        object.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        if (!this.materials.nature) this.materials.nature = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
      }
      const shared = this.materials[palette];
      if (!shared) {
        this.materials[palette] = object.material;
        object.material.roughness = 0.75;
        object.material.metalness = 0;
      } else if (object.material !== shared) {
        object.material.map?.dispose();
        object.material.dispose();
        object.material = shared;
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    scene.userData.skinned = skinned;
    this.models.set(name, scene);
  }

  clone(name) {
    const source = this.models.get(name);
    if (!source) throw new Error(`Unknown model ${name}`);
    return source.userData.skinned ? SkeletonUtils.clone(source) : source.clone(true);
  }

  /** The model merged into one geometry (for InstancedMesh). */
  geometry(name) {
    if (this.geometries.has(name)) return this.geometries.get(name);
    const source = this.models.get(name);
    const parts = [];
    source.traverse((object) => {
      if (!object.isMesh) return;
      const part = object.geometry.clone().applyMatrix4(object.matrixWorld);
      parts.push(part.index ? part : part.setIndex([...Array(part.attributes.position.count).keys()]));
    });
    const keep = ['position', 'normal', 'uv', 'color'].filter((key) => parts.every((part) => part.attributes[key]));
    for (const part of parts) for (const key of Object.keys(part.attributes)) if (!keep.includes(key)) part.deleteAttribute(key);
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    this.geometries.set(name, merged);
    return merged;
  }

  materialOf(name) {
    return this.materials[paletteOf(name)];
  }
}
