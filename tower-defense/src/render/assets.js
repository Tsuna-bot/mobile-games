import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ENEMIES } from '../data/enemies.js';
import { TOWERS } from '../data/towers.js';

const BASE_URL = 'assets/models/';

const TERRAIN = [
  'tile', 'tile-straight', 'tile-corner-round', 'tile-end-round', 'tile-spawn-end',
  'tile-tree', 'tile-tree-double', 'tile-tree-quad', 'tile-rock', 'tile-crystal', 'tile-hill',
  'detail-tree', 'detail-tree-large', 'detail-rocks', 'detail-rocks-large', 'detail-crystal',
];

function modelList() {
  const names = new Set([...TERRAIN, ...TERRAIN.map((name) => `snow-${name}`)]);
  for (const tower of Object.values(TOWERS)) {
    tower.pieces.flat().forEach((piece) => names.add(piece));
    names.add(tower.weapon);
  }
  for (const enemy of Object.values(ENEMIES)) names.add(enemy.model);
  ['weapon-ammo-arrow', 'weapon-ammo-cannonball', 'weapon-ammo-bullet', 'weapon-ammo-boulder',
    'enemy-ufo-beam', 'selection-a', 'spawn-round', 'tower-round-build-f'].forEach((name) => names.add(name));
  return [...names];
}

/**
 * Loads the Kenney Tower Defense Kit models (CC0). Every model uses the same
 * palette texture, so they all share one material: one texture upload, one
 * shader program, and cheap instancing.
 */
export class Assets {
  constructor() {
    this.models = new Map();
    this.geometries = new Map();
    this.material = null;
  }

  async load(onProgress) {
    const names = modelList();
    const loader = new GLTFLoader();
    let loaded = 0;
    await Promise.all(names.map(async (name) => {
      const gltf = await loader.loadAsync(`${BASE_URL}${name}.glb`);
      this.register(name, gltf.scene);
      onProgress?.(++loaded / names.length);
    }));
  }

  register(name, scene) {
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!object.isMesh) return;
      if (!this.material) {
        this.material = object.material;
        this.material.roughness = 0.8;
        this.material.metalness = 0;
      } else if (object.material !== this.material) {
        object.material.map?.dispose();
        object.material.dispose();
        object.material = this.material;
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.models.set(name, scene);
  }

  /** A new instance of a model (geometry and material are shared). */
  clone(name) {
    const source = this.models.get(name);
    if (!source) throw new Error(`Unknown model ${name}`);
    return source.clone(true);
  }

  /** The model merged into a single geometry, for InstancedMesh. */
  geometry(name) {
    if (this.geometries.has(name)) return this.geometries.get(name);
    const source = this.models.get(name);
    let merged = null;
    source.traverse((object) => {
      if (!object.isMesh || merged) return;
      merged = object.geometry.clone().applyMatrix4(object.matrixWorld);
    });
    this.geometries.set(name, merged);
    return merged;
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const scene of this.models.values()) {
      scene.traverse((object) => object.isMesh && object.geometry.dispose());
    }
    this.material?.map?.dispose();
    this.material?.dispose();
  }
}
