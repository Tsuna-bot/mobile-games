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
  'workbench-anvil', 'chest', 'barrel', 'box-large', 'box', 'tool-axe', 'tool-pickaxe',
].map((name) => `survival/${name}`);
export const CHARACTER_MODELS = [
  'character-male-a', 'character-male-c', 'character-female-b', 'character-female-d', 'character-male-e', 'character-female-f',
].map((name) => `characters/${name}`);
const REALM_EXTRA = [
  'tower-square-roof-a', 'tower-square-roof-b', 'tower-square-roof-c', 'tower-round-roof-a', 'tower-round-build-d', 'detail-crystal-large',
];

function modelList() {
  const names = new Set([...TERRAIN, ...TERRAIN.map((name) => `snow-${name}`), ...SURVIVAL_MODELS, ...CHARACTER_MODELS, ...REALM_EXTRA]);
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
      for (const key of Object.keys(part.attributes)) if (!['position', 'normal', 'uv'].includes(key)) part.deleteAttribute(key);
      parts.push(part);
    });
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
