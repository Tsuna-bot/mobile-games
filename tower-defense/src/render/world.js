import * as THREE from 'three';
import { CONFIG } from '../config.js';

const THEMES = {
  grass: {
    skyTop: '#6cc7ff',
    skyBottom: '#d7f1ff',
    fog: 0xcfeeff,
    ground: 0x3e9c5c,
    hemisphereSky: 0xcfeaff,
    hemisphereGround: 0x3c7a45,
    sun: 0xfff1d6,
    scenery: ['detail-tree', 'detail-tree-large', 'detail-tree', 'detail-rocks', 'detail-rocks-large'],
  },
  snow: {
    skyTop: '#8fb7e0',
    skyBottom: '#eef5fb',
    fog: 0xe6f0f8,
    ground: 0xd9e6f0,
    hemisphereSky: 0xe8f2ff,
    hemisphereGround: 0x8fa7bd,
    sun: 0xffffff,
    scenery: ['snow-detail-tree', 'snow-detail-tree-large', 'snow-detail-tree', 'snow-detail-rocks', 'snow-detail-crystal'],
  },
};

const TREES = ['tile-tree', 'tile-tree-double', 'tile-tree-quad'];
const DECORATION_MODELS = { rock: ['tile-rock'], crystal: ['tile-crystal'], hill: ['tile-hill'] };

/** Deterministic PRNG so every visit of a level looks the same. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSkyTexture(top, bottom) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The static diorama for a level: instanced terrain tiles, surrounding scenery,
 * the castle, the spawn portal, sky and lights. Rebuilt when the level changes.
 */
export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.disposables = [];
    this.skyTexture = null;
    this.time = 0;

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 1.25);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2;
    scene.add(this.hemisphere, this.sun, this.sun.target);
  }

  build(level) {
    this.clear();
    const theme = THEMES[level.def.theme] ?? THEMES.grass;
    const prefix = level.def.theme === 'snow' ? 'snow-' : '';
    const random = seededRandom(level.index * 977 + 13);
    this.level = level;

    this.skyTexture = createSkyTexture(theme.skyTop, theme.skyBottom);
    this.scene.background = this.skyTexture;
    this.scene.fog = new THREE.Fog(theme.fog, 22, 55);
    this.hemisphere.color.set(theme.hemisphereSky);
    this.hemisphere.groundColor.set(theme.hemisphereGround);
    this.sun.color.set(theme.sun);

    // Terrain tiles, grouped per model into InstancedMeshes.
    const placements = new Map();
    const place = (model, x, z, rotation, y = 0) => {
      if (!placements.has(model)) placements.set(model, []);
      placements.get(model).push({ x, y, z, rotation });
    };
    const pathTiles = new Map(level.pathTiles.map((tile) => [tile.cell.index, tile]));
    for (const cell of level.cells) {
      const randomTurn = Math.floor(random() * 4) * (Math.PI / 2);
      const tile = pathTiles.get(cell.index);
      if (tile) {
        let model = tile.kind === 'straight' ? 'tile-straight' : tile.kind === 'corner' ? 'tile-corner-round' : 'tile-end-round';
        if (cell === level.spawn) model = 'tile-spawn-end';
        place(prefix + model, cell.x, cell.z, tile.rotation);
      } else if (cell.decoration) {
        const options = cell.decoration === 'tree' ? TREES : DECORATION_MODELS[cell.decoration];
        place(prefix + options[Math.floor(random() * options.length)], cell.x, cell.z, randomTurn);
      } else {
        place(`${prefix}tile`, cell.x, cell.z, randomTurn);
      }
    }

    // Scenery scattered on the lower ground around the plateau.
    const halfW = level.width / 2;
    const halfH = level.height / 2;
    for (let i = 0; i < 90; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 1.2 + random() * 9;
      const x = Math.cos(angle) * (halfW + radius);
      const z = Math.sin(angle) * (halfH + radius);
      if (Math.abs(x) < halfW + 0.7 && Math.abs(z) < halfH + 0.7) continue;
      place(theme.scenery[Math.floor(random() * theme.scenery.length)], x, z, random() * Math.PI * 2, -CONFIG.world.tileTop);
    }

    const dummy = new THREE.Object3D();
    for (const [model, list] of placements) {
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), this.assets.material, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.receiveShadow = true;
      mesh.castShadow = !model.endsWith('tile');
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.disposables.push(mesh);
    }

    // Lower ground: the map reads as a raised diorama.
    const groundGeometry = new THREE.CircleGeometry(60, 48);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -CONFIG.world.tileTop;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.disposables.push(groundGeometry, groundMaterial);

    // Castle at the end of the path, turned toward the incoming road.
    const baseTile = pathTiles.get(level.base.index);
    this.castle = this.assets.clone('tower-round-build-f');
    this.castle.position.set(level.base.x, CONFIG.world.tileTop, level.base.z);
    this.castle.rotation.y = baseTile.rotation;
    this.castle.scale.setScalar(0.9);
    this.root.add(this.castle);

    this.portal = this.assets.clone('spawn-round');
    this.portal.position.set(level.spawn.x, CONFIG.world.tileTop + 0.01, level.spawn.z);
    this.root.add(this.portal);

    this.fitShadows(level);
  }

  fitShadows(level) {
    const span = Math.max(level.width, level.height) / 2 + 1.5;
    this.sun.position.set(-4, 12, 6);
    this.sun.target.position.set(0, 0, 0);
    const camera = this.sun.shadow.camera;
    camera.left = -span;
    camera.right = span;
    camera.top = span;
    camera.bottom = -span;
    camera.near = 1;
    camera.far = 30;
    camera.updateProjectionMatrix();
  }

  /** Keeps the fog behind the map whatever the camera distance. */
  setViewDistance(distance) {
    if (!this.scene.fog) return;
    this.scene.fog.near = distance + 4;
    this.scene.fog.far = distance + 45;
  }

  applyQuality(preset) {
    this.sun.castShadow = preset.shadows;
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Makes the castle wobble when an enemy gets through. */
  hitCastle() {
    this.castleHit = 0.5;
  }

  update(dt) {
    this.time += dt;
    if (this.portal) this.portal.rotation.y = this.time * 0.8;
    if (this.castle) {
      this.castleHit = Math.max(0, (this.castleHit ?? 0) - dt);
      const k = this.castleHit * 2;
      this.castle.scale.set(0.9 + Math.sin(this.time * 40) * 0.04 * k, 0.9 - k * 0.06, 0.9 + Math.cos(this.time * 40) * 0.04 * k);
    }
  }

  clear() {
    for (const item of this.disposables) item.dispose?.();
    this.disposables = [];
    this.root.clear();
    this.skyTexture?.dispose();
    this.skyTexture = null;
    this.castle = null;
    this.portal = null;
  }

  dispose() {
    this.clear();
    this.sun.shadow.map?.dispose();
  }
}
