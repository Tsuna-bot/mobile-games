import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ENEMIES } from '../data/enemies.js';
import { TOWERS } from '../data/towers.js';

const BASE_URL = 'assets/models/';

const TERRAIN = [
  'tile', 'tile-straight', 'tile-corner-round', 'tile-end-round', 'tile-spawn-end',
  'tile-tree', 'tile-tree-double', 'tile-tree-quad', 'tile-rock', 'tile-crystal', 'tile-hill',
  'detail-tree', 'detail-tree-large', 'detail-rocks', 'detail-rocks-large', 'detail-crystal',
];

// Kingdom mode: Survival Kit props, Mini Characters workers and a few more Tower Defense pieces.
export const SURVIVAL_MODELS = [
  'tree', 'tree-tall', 'tree-autumn', 'tree-trunk', 'rock-a', 'rock-b', 'rock-c', 'rock-flat',
  'fence-fortified', 'structure-roof', 'resource-wood', 'resource-stone', 'resource-planks',
  'workbench-anvil', 'chest', 'barrel', 'box-large', 'box', 'tool-axe', 'tool-pickaxe', 'tool-hammer', 'structure',
].map((name) => `survival/${name}`);
export const CHARACTER_MODELS = [
  'character-male-a', 'character-male-c', 'character-female-b', 'character-female-d', 'character-male-e', 'character-female-f',
].map((name) => `characters/${name}`);
// Kingdom buildings and decoration: Castle Kit (walls, keep, flags), Fantasy Town Kit
// (modular houses, market props) and Nature Kit (flowers, bushes, decorative trees).
export const CASTLE_MODELS = [
  'wall', 'wall-corner', 'wall-pillar', 'wall-half', 'wall-narrow-wood', 'wall-narrow-wood-fence', 'wall-narrow', 'wall-doorway', 'gate',
  'tower-square-base', 'tower-square-mid', 'tower-square-mid-windows', 'tower-square-mid-door', 'tower-square-top-roof',
  'tower-square-top-roof-high', 'tower-square-top-roof-high-windows', 'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof',
  'tower-hexagon-top', 'tower-base', 'tower-top', 'flag', 'flag-banner-long', 'flag-pennant', 'flag-wide', 'ground-hills', 'rocks-small',
  'stairs-stone',
].map((name) => `castle/${name}`);
export const TOWN_MODELS = [
  'wall', 'wall-door', 'wall-window-shutters', 'wall-window-glass', 'wall-window-small', 'wall-wood', 'wall-wood-door',
  'wall-wood-window-shutters', 'wall-wood-window-small', 'roof-gable', 'roof-high-gable', 'roof-point', 'roof-high-point', 'chimney',
  'lantern', 'windmill', 'stall-red', 'stall-green', 'cart', 'banner-red', 'banner-green', 'fountain-round', 'hedge', 'planks',
  'fence', 'poles', 'overhang', 'wheel',
].map((name) => `town/${name}`);
export const NATURE_MODELS = [
  'flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'plant_bush', 'plant_bushSmall', 'plant_bushLarge',
  'plant_bushDetailed', 'grass_large', 'grass_leafs', 'mushroom_redGroup', 'mushroom_tanGroup', 'stump_round', 'log_stack',
  'rock_smallA', 'rock_smallC', 'rock_smallFlatA', 'rock_tallA', 'tree_oak', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_default',
  'tree_fat', 'tree_cone', 'tree_detailed', 'tree_oak_fall', 'tree_default_fall',
].map((name) => `nature/${name}`);
const REALM_EXTRA = [
  'tower-square-roof-a', 'tower-square-roof-b', 'tower-square-roof-c', 'tower-round-roof-a', 'tower-round-build-d', 'detail-crystal-large',
];

function modelList() {
  const names = new Set([...TERRAIN, ...TERRAIN.map((name) => `snow-${name}`), ...SURVIVAL_MODELS, ...CHARACTER_MODELS, ...REALM_EXTRA,
    ...CASTLE_MODELS, ...TOWN_MODELS, ...NATURE_MODELS]);
  for (const tower of Object.values(TOWERS)) {
    tower.pieces.flat().forEach((piece) => names.add(piece));
    names.add(tower.weapon);
  }
  for (const enemy of Object.values(ENEMIES)) names.add(enemy.model);
  ['weapon-ammo-arrow', 'weapon-ammo-cannonball', 'weapon-ammo-bullet', 'weapon-ammo-boulder',
    'enemy-ufo-beam', 'selection-a', 'spawn-round', 'tower-round-build-f'].forEach((name) => names.add(name));
  return [...names];
}

/** Palette of a model: each Kenney kit ships one texture shared by all its models. */
function paletteOf(name) {
  const slash = name.indexOf('/');
  return slash < 0 ? 'td' : name.slice(0, slash);
}

/**
 * Loads the Kenney models (all CC0). Every model of a kit uses the same palette
 * texture, so each kit shares one material: few texture uploads, few shader
 * programs, cheap instancing. `material` is the Tower Defense Kit one.
 */
export class Assets {
  constructor() {
    this.models = new Map();
    this.animations = new Map();
    this.geometries = new Map();
    this.materials = {};
  }

  get material() {
    return this.materials.td;
  }

  async load(onProgress) {
    const names = modelList();
    const loader = new GLTFLoader();
    // Optional single-file bundle ({ name: base64 GLB }) for hosts that cannot serve .glb files.
    const bundleUrl = window.BASTION_MODEL_BUNDLE;
    const bundle = bundleUrl ? await (await fetch(bundleUrl)).json() : null;
    let loaded = 0;
    await Promise.all(names.map(async (name) => {
      const folder = name.includes('/') ? `${name.slice(0, name.lastIndexOf('/') + 1)}` : '';
      const gltf = bundle
        ? await loader.parseAsync(Uint8Array.from(atob(bundle[name]), (c) => c.charCodeAt(0)).buffer, BASE_URL + folder)
        : await loader.loadAsync(`${BASE_URL}${name}.glb`);
      this.register(name, gltf.scene);
      if (gltf.animations.length) this.animations.set(name, gltf.animations);
      onProgress?.(++loaded / names.length);
    }));
  }

  register(name, scene) {
    const palette = paletteOf(name);
    scene.updateMatrixWorld(true);
    let skinned = false;
    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (object.isSkinnedMesh) skinned = true;
      // The Nature Kit uses flat-colored materials: bake each color into the vertices so
      // every nature model shares one vertex-colored material (and can be instanced).
      if (palette === 'nature' && !object.geometry.attributes.color) {
        const color = (object.material.color ?? new THREE.Color(1, 1, 1)).clone();
        // The kit's teal greens clash with the meadow: pull them toward its yellow-green.
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
        object.material.roughness = 0.8;
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

  /** A new instance of a model (geometry and material are shared). */
  clone(name) {
    const source = this.models.get(name);
    if (!source) throw new Error(`Unknown model ${name}`);
    return source.userData.skinned ? SkeletonUtils.clone(source) : source.clone(true);
  }

  /** The model merged into a single geometry, for InstancedMesh. */
  geometry(name) {
    if (this.geometries.has(name)) return this.geometries.get(name);
    const source = this.models.get(name);
    const parts = [];
    source.traverse((object) => {
      if (!object.isMesh) return;
      const part = object.geometry.clone().applyMatrix4(object.matrixWorld);
      parts.push(part.index ? part : part.setIndex([...Array(part.attributes.position.count).keys()]));
    });
    // Merging needs the same attributes everywhere: keep the ones all parts share.
    const keep = ['position', 'normal', 'uv', 'color'].filter((key) => parts.every((part) => part.attributes[key]));
    for (const part of parts) for (const key of Object.keys(part.attributes)) if (!keep.includes(key)) part.deleteAttribute(key);
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) for (const part of parts) part.dispose();
    this.geometries.set(name, merged);
    return merged;
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const scene of this.models.values()) {
      scene.traverse((object) => object.isMesh && object.geometry.dispose());
    }
    for (const material of Object.values(this.materials)) {
      material.map?.dispose();
      material.dispose();
    }
  }
}
