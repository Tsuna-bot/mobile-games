import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { damp } from '../core/math.js';
import { makeNoise, seededRandom } from '../core/random.js';
import { CHARACTER_MODELS } from './assets.js';
import { buildTowerModel, weaponBaseY } from './towerViews.js';

const TOP = CONFIG.world.tileTop;
const NODE_MODELS = {
  tree: ['survival/tree', 'survival/tree-tall', 'survival/tree-autumn'],
  rock: ['survival/rock-a', 'survival/rock-b', 'survival/rock-c'],
  crystal: ['detail-crystal-large', 'detail-crystal-large', 'detail-crystal'],
};
const NODE_SCALE = { tree: 1.55, rock: 1.55, crystal: 1.05 };
const LEFTOVER = { tree: 'survival/tree-trunk', rock: 'survival/rock-flat' };
const LEFTOVER_SCALE = { tree: 1.6, rock: 1.3 };
const WORKER_SCALE = 0.78;
const BAR_WIDTH = 0.8;
const BAR_HEIGHT = 0.08;
const CLIPS = { walk: 'walk', idle: 'idle', work: 'interact-right' };
const CARRY_MODELS = { wood: 'survival/resource-wood', stone: 'survival/resource-stone', crystal: 'detail-crystal' };
const CARRY_SCALE = { wood: 1.5, stone: 1.5, crystal: 0.28 };
const HOUSE_SCALE = 0.8;
const WALL_HEIGHT = 0.8;
const CASTLE_SPAN = 1.12;
const TREE_FALL_TIME = 0.9;
const BIRDS = 12;

const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
// Rotation of the Castle Kit corner piece (open to south + west at 0) for each pair of neighbors.
const CORNER_ROTATION = { SW: 0, ES: Math.PI / 2, EN: Math.PI, NW: Math.PI * 1.5 };

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Bakes a model's static meshes into one mesh per material (one draw call each).
 * Meshes flagged `userData.keep` (waving flags) stay separate.
 */
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const kept = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.keep) {
      kept.push(object);
      return;
    }
    const geometry = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    if (!buckets.has(object.material)) buckets.set(object.material, []);
    buckets.get(object.material).push(geometry);
  });
  const out = new THREE.Group();
  for (const [material, parts] of buckets) {
    const keep = ['position', 'normal', 'uv', 'color'].filter((key) => parts.every((part) => part.attributes[key]));
    for (const part of parts) for (const key of Object.keys(part.attributes)) if (!keep.includes(key)) part.deleteAttribute(key);
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.owned = true;
    out.add(mesh);
  }
  for (const mesh of kept) {
    const copy = mesh.clone();
    copy.matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
    out.add(copy);
  }
  out.userData.glows = root.userData.glows ?? [];
  out.userData.chimney = root.userData.chimney ?? null;
  return out;
}

/** Copy of a material cut by `plane` (a site's building rising from the ground). */
function clippedMaterial(material, plane) {
  const copy = material.clone();
  copy.clippingPlanes = [plane];
  copy.clipShadows = true;
  return copy;
}

function part(assets, root, name, { x = 0, y = 0, z = 0, rotation = 0, scale = 1 } = {}) {
  const mesh = assets.clone(name);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else mesh.scale.set(...scale);
  root.add(mesh);
  return mesh;
}

/** Fantasy Town house: 1 floor, then a stone ground floor under a wooden one, then a tall roof and banner. */
function buildHouse(assets, level) {
  const root = new THREE.Group();
  const house = new THREE.Group();
  house.scale.setScalar(HOUSE_SCALE);
  root.add(house);
  const floor = (y, stone, door) => {
    const kit = stone ? 'town/wall' : 'town/wall-wood';
    part(assets, house, door ? `${kit}-door` : `${kit}-window-small`, { y, rotation: Math.PI * 1.5 });
    part(assets, house, `${kit}-window-shutters`, { y, rotation: 0 });
    part(assets, house, `${kit}-window-shutters`, { y, rotation: Math.PI });
    part(assets, house, kit, { y, rotation: Math.PI / 2 });
  };
  const floors = level === 0 ? 1 : 2;
  floor(0, level > 0, true);
  if (floors > 1) floor(1, false, false);
  part(assets, house, level === 2 ? 'town/roof-high-gable' : 'town/roof-gable', { y: floors });
  part(assets, house, 'town/chimney', { y: floors - 0.2 });
  if (level === 2) {
    part(assets, house, 'town/banner-red', { y: 0.9, rotation: Math.PI * 1.5, z: 0.02 });
    part(assets, root, 'town/lantern', { x: 0.43, z: 0.5, scale: 0.42 });
  }
  if (level > 0) part(assets, root, 'survival/barrel', { x: -0.42, z: 0.4, scale: 1.1 });
  // Warm windows at night (house space, scaled).
  const glows = [];
  for (let f = 0; f < floors; f++) {
    const y = (f + 0.55) * HOUSE_SCALE;
    glows.push([0.5 * HOUSE_SCALE, y, 0], [-0.5 * HOUSE_SCALE, y, 0]);
  }
  glows.push([0, 0.35 * HOUSE_SCALE, 0.52 * HOUSE_SCALE]);
  root.userData.glows = glows;
  root.userData.chimney = [0.3 * HOUSE_SCALE, (floors + 0.85) * HOUSE_SCALE, 0];
  return root;
}

function buildDepot(assets, level) {
  const root = new THREE.Group();
  part(assets, root, 'survival/structure-roof', { scale: level ? 1.95 : 1.8 });
  part(assets, root, 'survival/barrel', { x: -0.25, z: -0.2, scale: 1.4 });
  part(assets, root, 'survival/chest', { x: 0.2, z: -0.18, rotation: 0.3, scale: 1.4 });
  part(assets, root, 'survival/box-large', { x: 0.2, z: 0.22, rotation: 1.57, scale: 1.2 });
  part(assets, root, 'town/cart', { x: -0.32, z: 0.3, rotation: 0.5, scale: 0.42 });
  if (level > 0) {
    part(assets, root, 'survival/resource-planks', { x: -0.2, z: 0.25, scale: 1.6 });
    part(assets, root, 'survival/resource-stone', { x: 0.36, z: 0.4, scale: 1.6 });
    part(assets, root, 'town/lantern', { x: 0.45, z: -0.45, scale: 0.4 });
  }
  root.userData.glows = [[0, 0.7, 0]];
  return root;
}

function flag(assets, root, name, x, y, z, scale, material) {
  const mesh = part(assets, root, name, { x, y, z, scale });
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    o.material = material;
    o.userData.keep = true;
  });
  return mesh;
}

function buildAcademy(assets, level, flagMaterial) {
  const root = new THREE.Group();
  const s = 0.95;
  part(assets, root, 'castle/tower-hexagon-base', { scale: s });
  part(assets, root, 'castle/tower-hexagon-mid', { y: 1.31 * s, scale: s });
  part(assets, root, 'castle/tower-hexagon-roof', { y: (1.31 + 0.46) * s, scale: s });
  if (flagMaterial) flag(assets, root, 'castle/flag-pennant', 0, (1.31 + 0.46 + 0.7) * s, 0, 0.9, flagMaterial);
  part(assets, root, 'survival/workbench-anvil', { x: 0.42, z: 0.35, rotation: -0.6, scale: 1.4 });
  root.userData.glows = [[0, 0.8, 0.42], [0.4, 1.45, 0], [-0.4, 1.45, 0]];
  return root;
}

/** Model of a Kingdom building level (walls: see `buildWallModel`). */
export function buildBuildingModel(assets, def, level, flagMaterial = null) {
  if (def.id === 'house') return buildHouse(assets, level);
  if (def.id === 'depot') return buildDepot(assets, level);
  if (def.id === 'academy') return buildAcademy(assets, level, flagMaterial);
  const root = new THREE.Group();
  if (def.id === 'wall') root.add(buildWallModel(assets, level, { N: false, E: true, S: false, W: true }));
  return root;
}

const STONE_SCALE = [1, WALL_HEIGHT, 1];
// The survival palisade is half a cell wide at the back edge: stretched and centred.
const PALISADE_SCALE = [2.05, 1.75, 2];
const PALISADE_OFFSET = 0.45;

/** Pieces for a wall cell from its neighbors: wooden stakes (level 0), then Castle Kit stone. */
export function wallPieces(level, n) {
  const count = ['N', 'E', 'S', 'W'].filter((k) => n[k]).length;
  const alongZ = n.N || n.S;
  const alongX = n.E || n.W;
  if (level === 0) {
    const out = [];
    const stakes = (rotation) => ({ model: 'survival/fence-fortified', rotation, scale: PALISADE_SCALE, offset: PALISADE_OFFSET });
    if (alongX || !alongZ) out.push(stakes(0));
    if (alongZ) out.push(stakes(Math.PI / 2));
    if (alongX && alongZ) out.push({ model: 'survival/tree-trunk', rotation: 0, scale: [1.1, 1.5, 1.1], offset: 0 });
    return out;
  }
  if (count === 2 && !(n.N && n.S) && !(n.E && n.W)) {
    const key = ['E', 'N', 'S', 'W'].filter((k) => n[k]).join('');
    const rotation = CORNER_ROTATION[key] ?? CORNER_ROTATION[key.split('').reverse().join('')] ?? 0;
    return [{ model: 'castle/wall-corner', rotation, scale: STONE_SCALE, offset: 0 }];
  }
  if (count <= 2 && !(alongX && alongZ)) return [{ model: 'castle/wall', rotation: alongX ? Math.PI / 2 : 0, scale: STONE_SCALE, offset: 0 }];
  return [{ model: 'castle/wall-pillar', rotation: 0, scale: STONE_SCALE, offset: 0 }];
}

/** Height of a finished wall (for bars, torches and the rising site). */
export function wallHeight(level) {
  return level === 0 ? 0.52 * PALISADE_SCALE[1] : 1.31 * WALL_HEIGHT;
}

/** Places one wall piece: offset along the piece's local z, then rotated. */
function placePiece(object, piece, x = 0, z = 0) {
  const c = Math.cos(piece.rotation);
  const sn = Math.sin(piece.rotation);
  object.position.set(x + piece.offset * sn, 0, z + piece.offset * c);
  object.rotation.set(0, piece.rotation, 0);
  object.scale.set(...piece.scale);
}

export function buildWallModel(assets, level, neighbors) {
  const root = new THREE.Group();
  for (const piece of wallPieces(level, neighbors)) placePiece(part(assets, root, piece.model), piece);
  return root;
}

/** The keep, corner towers and curtain walls of the castle; taller and flagged at each level. */
export function buildCastleModel(assets, level, flagMaterial) {
  const root = new THREE.Group();
  const k = 1.25;
  part(assets, root, 'castle/tower-square-base', { scale: k });
  let y = 1.01 * k;
  part(assets, root, 'castle/tower-square-mid-windows', { y, scale: k });
  y += 1.01 * k;
  if (level >= 1) {
    part(assets, root, 'castle/tower-square-mid', { y, scale: k });
    y += 1.01 * k;
  }
  part(assets, root, level >= 2 ? 'castle/tower-square-top-roof-high-windows' : 'castle/tower-square-top-roof-high', { y, scale: k });
  const top = y + (level >= 2 ? 1.08 : 1.35) * k;
  flag(assets, root, level >= 2 ? 'castle/flag-wide' : 'castle/flag', 0, top - 0.1, 0, 1.3, flagMaterial);

  const c = CASTLE_SPAN;
  const t = 0.8;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(assets, root, 'castle/tower-hexagon-base', { x: dx * c, z: dz * c, scale: t });
    let ty = 1.31 * t;
    if (level >= 1) {
      part(assets, root, 'castle/tower-hexagon-mid', { x: dx * c, y: ty, z: dz * c, scale: t });
      ty += 0.46 * t;
    }
    part(assets, root, 'castle/tower-hexagon-roof', { x: dx * c, y: ty, z: dz * c, scale: t });
    if (level >= 1) flag(assets, root, 'castle/flag-pennant', dx * c, ty + 0.62 * t, dz * c, 0.75, flagMaterial);
  }
  // Curtain walls between the corner towers, with a gate facing south.
  const length = (2 * c - 0.6) / 1;
  part(assets, root, 'castle/wall', { x: c, scale: [0.8, WALL_HEIGHT, length] });
  part(assets, root, 'castle/wall', { x: -c, scale: [0.8, WALL_HEIGHT, length] });
  part(assets, root, 'castle/wall', { z: -c, rotation: Math.PI / 2, scale: [0.8, WALL_HEIGHT, length] });
  part(assets, root, 'castle/wall', { z: c, rotation: Math.PI / 2, scale: [0.8, WALL_HEIGHT, length] });
  part(assets, root, 'castle/gate', { z: c + 0.42, rotation: Math.PI / 2, scale: 1.25 });
  if (level >= 2) {
    part(assets, root, 'town/banner-red', { x: 0.25, z: c + 0.02, y: 0.1, rotation: Math.PI * 1.5, scale: 1 });
    part(assets, root, 'town/banner-red', { x: -0.75, z: c + 0.02, y: 0.1, rotation: Math.PI * 1.5, scale: 1 });
  }
  part(assets, root, 'town/lantern', { x: 0.55, z: c + 0.55, scale: 0.5 });
  part(assets, root, 'town/lantern', { x: -0.55, z: c + 0.55, scale: 0.5 });
  const glows = [[0.55, 0.72, c + 0.55], [-0.55, 0.72, c + 0.55]];
  for (let f = 1; f <= (level >= 1 ? 2 : 1); f++) glows.push([0, (f + 0.5) * k, 0.64], [0.64, (f + 0.5) * k, 0], [-0.64, (f + 0.5) * k, 0]);
  root.userData.glows = glows;
  root.userData.top = top;
  return root;
}

const GLOW_VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uNight;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float flicker = 0.82 + 0.12 * sin(uTime * 9.0 + aSeed * 40.0) + 0.06 * sin(uTime * 23.0 + aSeed * 13.0);
  vAlpha = uNight * flicker;
  gl_PointSize = 0.9 * uScale * flicker / max(-mvPosition.z, 0.1);
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = 1.0 - smoothstep(0.0, 0.12, d);
  float halo = 1.0 - smoothstep(0.05, 0.5, d);
  float a = (core * 0.9 + halo * halo * 0.55) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.72, 0.36) * (1.2 + core), a);
}`;

/**
 * Kingdom visuals on top of the World island: resource nodes and decoration
 * (instanced), castle, buildings, joined walls, construction sites that rise
 * from the ground, workers (skinned, animated), night lights, smoke and birds.
 */
export class RealmViews {
  constructor(scene, assets, world, effects) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.effects = effects;
    this.root = new THREE.Group();
    scene.add(this.root);
    world.renderer.localClippingEnabled = true;
    this.nodeMeshes = [];
    this.nodes = new Map();
    this.animating = new Set();
    this.falling = [];
    this.decor = new Map();
    this.decorMeshes = [];
    this.structures = new Map();
    this.sites = new Map();
    this.workers = new Map();
    this.modelCache = new Map();
    this.wallMeshes = [];
    this.wallsDirty = false;
    this.glowsDirty = false;
    this.dummy = new THREE.Object3D();
    this.cameraQuaternion = new THREE.Quaternion();
    this.pickGeometry = new THREE.BoxGeometry(0.9, 1, 0.9);
    this.pickGeometry.translate(0, 0.5, 0);
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.barGeometry = new THREE.PlaneGeometry(1, 1);
    this.barGeometry.translate(0.5, 0, 0);
    const barMaterial = (color) => new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
    this.barBack = barMaterial(0x23263a);
    this.barFill = barMaterial(0x6ad0ff);
    this.barLow = barMaterial(0xff5a5a);
    this.barBuild = barMaterial(0xffc93c);
    this.barCastle = barMaterial(0x5cff7a);
    this.shadowTexture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    this.discGeometry = new THREE.PlaneGeometry(1, 1);
    this.discGeometry.rotateX(-Math.PI / 2);

    // Flags wave in the wind (the cloth, away from the pole, moves most).
    this.flagUniforms = { uTime: { value: 0 } };
    this.flagMaterial = (assets.materials.castle ?? assets.material).clone();
    this.flagMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.flagUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float cloth = smoothstep(0.02, 0.45, abs(position.z));
          transformed.x += sin(uTime * 5.0 + position.z * 9.0 + position.y * 3.0) * 0.07 * cloth;
          transformed.y += sin(uTime * 3.0 + position.z * 6.0) * 0.015 * cloth;`);
    };
    this.flagMaterial.customProgramCacheKey = () => 'bastion-flag';

    // Night lights: windows, lanterns and torches (one Points draw call).
    this.glowMaterial = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowGeometry = new THREE.BufferGeometry();
    this.glowPoints = new THREE.Points(this.glowGeometry, this.glowMaterial);
    this.glowPoints.frustumCulled = false;
    this.glowPoints.renderOrder = 8;
    this.root.add(this.glowPoints);

    // Birds circling over the kingdom by day.
    const bird = new THREE.BufferGeometry();
    bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.3, 0.12, -0.05, 0, 0, -0.05, 0, 0, 0.12, 0, 0, -0.05, 0.3, 0.12, -0.05], 3));
    bird.computeVertexNormals();
    this.birdGeometry = bird;
    this.birdMaterial = new THREE.MeshBasicMaterial({ color: 0x3a3f52, side: THREE.DoubleSide, fog: true });
    this.birds = new THREE.InstancedMesh(bird, this.birdMaterial, BIRDS);
    this.birds.frustumCulled = false;
    this.birdState = Array.from({ length: BIRDS }, (_, i) => ({
      flock: i % 2,
      offset: new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6),
      phase: Math.random() * 10,
    }));
    this.root.add(this.birds);
    this.wearTimer = 0;
    this.smokeTimer = 0;
  }

  // ------------------------------------------------------------ build

  build(sim) {
    this.clear();
    this.sim = sim;
    const random = seededRandom(sim.seed ^ 0x9e37);
    const groups = new Map();
    const push = (model, entry) => {
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(entry);
    };
    for (const cell of sim.level.cells) {
      const node = cell.node;
      if (!node) continue;
      const entry = {
        cell,
        type: node.type,
        rotation: random() * Math.PI * 2,
        size: NODE_SCALE[node.type] * (0.88 + random() * 0.26),
        offsetX: (random() - 0.5) * 0.12,
        offsetZ: (random() - 0.5) * 0.12,
        current: 0,
        target: 0,
        shake: 0,
        tilt: 0,
        tiltAxis: random() * Math.PI * 2,
      };
      push(NODE_MODELS[node.type][node.variant % 3], entry);
      if (LEFTOVER[node.type]) push(LEFTOVER[node.type], { ...entry, leftover: true, size: LEFTOVER_SCALE[node.type] * (0.9 + random() * 0.2) });
      this.nodes.set(cell.index, this.nodes.get(cell.index) ?? {});
    }
    const survivalFoliage = this.world.survivalFoliage ?? this.assets.materials.survival;
    for (const [model, list] of groups) {
      const material = model.startsWith('survival/tree') && model !== 'survival/tree-trunk' ? survivalFoliage : model.startsWith('survival/') ? this.assets.materials.survival : this.assets.material;
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), material, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = !model.includes('rock-flat');
      mesh.receiveShadow = true;
      list.forEach((entry, i) => {
        entry.mesh = mesh;
        entry.index = i;
        entry.current = 1;
        this.writeNode(entry);
      });
      mesh.computeBoundingSphere();
      mesh.userData.entries = list;
      this.root.add(mesh);
      this.nodeMeshes.push(mesh);
      for (const entry of list) {
        const slot = this.nodes.get(entry.cell.index);
        if (entry.leftover) slot.leftover = entry;
        else slot.node = entry;
      }
    }
    for (const slot of this.nodes.values()) this.syncNode(slot, true);
    this.buildDecor(sim, random);
    this.buildCastle();
    for (const building of sim.buildings) this.addStructure(building);
    for (const tower of sim.towers) this.trackTower(tower);
    for (const site of sim.sites) this.addSite(site);
    this.rebuildWalls();
    for (const worker of sim.workers) this.addWorker(worker);
    this.glowsDirty = true;
  }

  /** Flowers, grass clumps, bushes, mushrooms and pebbles on free cells (hidden under buildings). */
  buildDecor(sim, random) {
    const noise = makeNoise(sim.seed ^ 0x5a5a);
    const groups = new Map();
    const push = (model, cell, scale) => {
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push({
        cell,
        x: cell.x + (random() - 0.5) * 0.8,
        z: cell.z + (random() - 0.5) * 0.8,
        rotation: random() * Math.PI * 2,
        scale,
      });
    };
    const level = sim.level;
    const nearNode = (cell, type) => {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (level.cellAt(cell.col + dc, cell.row + dr)?.node?.type === type) return true;
      return false;
    };
    for (const cell of level.cells) {
      if (cell.castle || cell.portal >= 0 || cell.node) continue;
      const meadow = noise(cell.col, cell.row, 5);
      const forest = nearNode(cell, 'tree');
      // Flowers grow in a few meadows, one kind per patch.
      if (meadow > 0.66 && random() < 0.7) {
        const flower = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/flower_redB', 'nature/flower_yellowB'][Math.floor(noise(cell.col + 50, cell.row, 3) * 5)];
        for (let k = 0; k < 1 + Math.floor(random() * 2); k++) push(flower, cell, 0.9 + random() * 0.4);
      }
      if (random() < 0.18) push(random() < 0.7 ? 'nature/grass_large' : 'nature/grass_leafs', cell, 1 + random() * 0.4);
      if (forest && random() < 0.3) push(['nature/plant_bush', 'nature/plant_bushSmall', 'nature/plant_bushDetailed'][Math.floor(random() * 3)], cell, 1.1 + random() * 0.5);
      if (forest && random() < 0.12) push(random() < 0.5 ? 'nature/mushroom_redGroup' : 'nature/mushroom_tanGroup', cell, 1.4);
      if (nearNode(cell, 'rock') && random() < 0.25) push(random() < 0.5 ? 'nature/rock_smallA' : 'nature/rock_smallFlatA', cell, 1 + random() * 0.6);
    }
    const material = this.assets.materials.nature;
    for (const [model, list] of groups) {
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), material, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.receiveShadow = true;
      mesh.castShadow = model.includes('bush');
      list.forEach((entry, i) => {
        entry.mesh = mesh;
        entry.index = i;
        this.writeDecor(entry, true);
        if (!this.decor.has(entry.cell.index)) this.decor.set(entry.cell.index, []);
        this.decor.get(entry.cell.index).push(entry);
      });
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.decorMeshes.push(mesh);
    }
    for (const cell of level.cells) if (cell.structure) this.decorChanged(cell);
  }

  writeDecor(entry, visible) {
    const d = this.dummy;
    d.position.set(entry.x, TOP, entry.z);
    d.rotation.set(0, entry.rotation, 0);
    d.scale.setScalar(visible ? entry.scale : 0.0001);
    d.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, d.matrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  decorChanged(cell) {
    for (const entry of this.decor.get(cell.index) ?? []) this.writeDecor(entry, !cell.structure);
  }

  writeNode(entry) {
    const d = this.dummy;
    const s = Math.max(0.0001, entry.current * entry.size);
    d.position.set(entry.cell.x + entry.offsetX, TOP, entry.cell.z + entry.offsetZ);
    // Swaying when hit; a felled tree tips over around its base.
    const tipX = Math.cos(entry.tiltAxis) * entry.tilt;
    const tipZ = Math.sin(entry.tiltAxis) * entry.tilt;
    d.rotation.set(Math.sin(entry.shake * 40) * entry.shake * 0.35 + tipX, entry.rotation, Math.cos(entry.shake * 33) * entry.shake * 0.25 + tipZ);
    d.scale.setScalar(s);
    d.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, d.matrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Targets the node (and its stump) scale from the simulated amount. */
  syncNode(slot, instant = false) {
    const node = slot.node?.cell.node;
    const alive = Boolean(node && node.amount > 0);
    if (slot.node) {
      slot.node.target = alive ? 0.82 + 0.18 * (node.amount / node.max) : 0;
      if (instant) slot.node.current = slot.node.target;
      if (alive) slot.node.tilt = 0;
      this.animating.add(slot.node);
    }
    if (slot.leftover) {
      slot.leftover.target = node && !alive ? 1 : 0;
      if (instant) slot.leftover.current = slot.leftover.target;
      this.animating.add(slot.leftover);
    }
  }

  nodeChanged(cell) {
    const slot = this.nodes.get(cell.index);
    if (!slot) return;
    const node = cell.node;
    // A felled tree first topples over, then shrinks away; the stump appears.
    if (slot.node && node && node.amount <= 0 && node.type === 'tree' && slot.node.current > 0.1) {
      this.falling.push({ entry: slot.node, time: 0 });
      if (slot.leftover) {
        slot.leftover.target = 1;
        this.animating.add(slot.leftover);
      }
      return;
    }
    this.syncNode(slot);
    this.decorChanged(cell);
  }

  harvestHit(cell) {
    const entry = this.nodes.get(cell.index)?.node;
    if (!entry) return;
    entry.shake = 0.35;
    this.animating.add(entry);
  }

  /**
   * Compiles every shader the Kingdom may need (rising sites, instanced walls) up front,
   * so the first construction site does not stall a frame.
   */
  warmUp(renderer, camera) {
    const group = new THREE.Group();
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const materials = new Set([this.assets.material, this.assets.materials.castle, this.assets.materials.town, this.assets.materials.survival, this.flagMaterial].filter(Boolean));
    // Kept alive: disposing them would release the compiled programs.
    this.warmMaterials ??= [...materials].map((material) => clippedMaterial(material, plane));
    for (const clipped of this.warmMaterials) group.add(new THREE.Mesh(this.pickGeometry, clipped));
    for (const material of [this.assets.materials.castle, this.assets.materials.survival]) {
      if (material) group.add(new THREE.InstancedMesh(this.pickGeometry, material, 1));
    }
    group.traverse((o) => {
      o.frustumCulled = false;
      o.castShadow = true;
    });
    group.scale.setScalar(0.001);
    group.position.set(camera.position.x, -5, camera.position.z);
    this.root.add(group);
    try {
      renderer.compile(this.scene, camera);
    } finally {
      group.removeFromParent();
    }
  }

  // ------------------------------------------------------------ castle

  cachedModel(key, build) {
    if (!this.modelCache.has(key)) this.modelCache.set(key, mergeByMaterial(build()));
    const template = this.modelCache.get(key);
    const copy = template.clone();
    copy.userData = template.userData;
    return copy;
  }

  buildCastle() {
    const castle = this.sim.castle;
    const group = new THREE.Group();
    group.position.set(castle.x, TOP, castle.z);
    this.root.add(group);
    const view = { structure: castle, group, model: null, pop: 0, shake: 0, bar: null, key: '', castle: true };
    view.pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    view.pick.scale.set(3, 3.5, 3);
    view.pick.userData.structure = castle;
    group.add(view.pick);
    this.castleView = view;
    this.structures.set(castle, view);
    this.rebuildCastle(false);
    this.world.castle = group;
    this.world.castleScale = 1;
  }

  rebuildCastle(pop = true) {
    const view = this.castleView;
    const level = this.sim.castle.level;
    if (view.model) view.group.remove(view.model);
    view.model = this.cachedModel(`castle:${level}`, () => buildCastleModel(this.assets, level, this.flagMaterial));
    view.group.add(view.model);
    view.key = `castle:${level}`;
    view.pop = pop ? 1 : 0;
    this.glowsDirty = true;
  }

  /** World position of the castle top (for effects). */
  castleTop(out) {
    return out.set(this.sim.castle.x, TOP + (this.castleView?.model?.userData.top ?? 3), this.sim.castle.z);
  }

  // ------------------------------------------------------------ structures

  addStructure(structure) {
    const view = {
      structure,
      group: new THREE.Group(),
      model: null,
      pop: 1,
      shake: 0,
      bar: null,
      key: '',
    };
    view.group.position.set(structure.cell.x, TOP, structure.cell.z);
    view.pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    view.pick.userData.structure = structure;
    view.pick.scale.y = structure.def.id === 'wall' ? WALL_HEIGHT * 1.3 : 1.6;
    view.group.add(view.pick);
    this.root.add(view.group);
    structure.view = view;
    this.structures.set(structure, view);
    this.rebuildStructure(view);
    this.decorChanged(structure.cell);
    this.world.terrain?.addWear(structure.cell.x, structure.cell.z, 0.9, 0.35);
    if (structure.def.id === 'wall') this.wallsDirty = true;
    this.glowsDirty = true;
    return view;
  }

  /** Towers are drawn by TowerViews; here they get a damage bar and a scaffold when upgrading. */
  trackTower(tower) {
    const view = { structure: tower, group: new THREE.Group(), tower: true, shake: 0, bar: null };
    view.group.position.set(tower.cell.x, TOP, tower.cell.z);
    this.root.add(view.group);
    tower.realmView = view;
    this.structures.set(tower, view);
    this.decorChanged(tower.cell);
    this.world.terrain?.addWear(tower.cell.x, tower.cell.z, 0.8, 0.3);
  }

  rebuildStructure(view) {
    const s = view.structure;
    if (s.def.id === 'wall') return;
    const key = `${s.def.id}:${s.level}`;
    if (key === view.key) return;
    if (view.model) view.group.remove(view.model);
    view.model = this.cachedModel(key, () => buildBuildingModel(this.assets, s.def, s.level, this.flagMaterial));
    view.key = key;
    view.group.add(view.model);
    this.glowsDirty = true;
  }

  upgradeStructure(structure) {
    if (structure.kind === 'castle') {
      this.rebuildCastle(true);
      return;
    }
    const view = this.structures.get(structure);
    if (!view || view.tower) return;
    if (structure.def.id === 'wall') {
      this.wallsDirty = true;
      view.pop = 1;
      return;
    }
    view.key = '';
    view.pop = 1;
    this.rebuildStructure(view);
  }

  removeStructure(structure) {
    // An upgrade in progress goes with it.
    for (const site of [...this.sites.keys()]) if (site.target === structure) this.removeSite(site);
    const view = this.structures.get(structure);
    if (!view) return;
    view.group.removeFromParent();
    this.structures.delete(structure);
    structure.view = view.tower ? structure.view : null;
    if (view.tower) structure.realmView = null;
    if (structure.def.id === 'wall') this.wallsDirty = true;
    this.decorChanged(structure.cell);
    this.glowsDirty = true;
  }

  wallNeighbors(cell) {
    const level = this.sim.level;
    const out = {};
    for (const [key, [dc, dr]] of Object.entries(DIR)) {
      const s = level.cellAt(cell.col + dc, cell.row + dr)?.structure;
      out[key] = s?.def?.id === 'wall' || (s?.kind === 'site' && s.typeId === 'wall');
    }
    return out;
  }

  /** All walls as instanced pieces (straight, corner, pillar), rebuilt when a wall changes. */
  rebuildWalls() {
    this.wallsDirty = false;
    for (const mesh of this.wallMeshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.wallMeshes = [];
    const pieces = new Map();
    for (const building of this.sim.buildings) {
      if (building.def.id !== 'wall') continue;
      for (const piece of wallPieces(building.level, this.wallNeighbors(building.cell))) {
        if (!pieces.has(piece.model)) pieces.set(piece.model, []);
        pieces.get(piece.model).push({ cell: building.cell, piece, building });
      }
    }
    const material = this.assets.materials.castle ?? this.assets.material;
    for (const [model, list] of pieces) {
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), model.startsWith('survival/') ? this.assets.materials.survival : material, list.length);
      list.forEach((p, i) => {
        placePiece(this.dummy, p.piece, p.cell.x, p.cell.z);
        this.dummy.position.y = TOP;
        const view = this.structures.get(p.building);
        const pop = view?.pop ?? 0;
        const bounce = pop > 0 ? Math.sin((1 - pop) * Math.PI * 2.5) * pop * 0.35 : 0;
        this.dummy.scale.x *= 1 - bounce * 0.4;
        this.dummy.scale.y *= 1 + bounce;
        this.dummy.scale.z *= 1 - bounce * 0.4;
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.wallMeshes.push(mesh);
    }
  }

  hitStructure(structure) {
    const view = this.structures.get(structure) ?? this.sites.get(structure);
    if (view) view.shake = 0.3;
  }

  /** The live resource node drawn under a screen ray (tall trees hide the cells behind them). */
  pickNode(raycaster) {
    const meshes = this.nodeMeshes.filter((mesh) => !mesh.userData.entries[0]?.leftover);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const entry = hit.object.userData.entries[hit.instanceId];
      if (entry?.cell.node?.amount > 0) return entry.cell;
    }
    return null;
  }

  /** Buildings, walls, sites and the castle under a screen ray, nearest first. */
  pick(raycaster) {
    const boxes = [];
    for (const view of this.structures.values()) if (view.pick) boxes.push(view.pick);
    for (const view of this.sites.values()) if (view.pick) boxes.push(view.pick);
    return raycaster.intersectObjects(boxes, false).map((hit) => hit.object.userData.structure);
  }

  ensureBar(view, height) {
    if (view.bar) return view.bar;
    const bar = new THREE.Group();
    const width = view.castle ? BAR_WIDTH * 2.2 : BAR_WIDTH;
    const back = new THREE.Mesh(this.barGeometry, this.barBack);
    back.scale.set(width + 0.06, BAR_HEIGHT + 0.05, 1);
    back.position.x = -(width + 0.06) / 2;
    back.renderOrder = 20;
    const fill = new THREE.Mesh(this.barGeometry, view.site ? this.barBuild : view.castle ? this.barCastle : this.barFill);
    fill.scale.set(width, BAR_HEIGHT, 1);
    fill.position.x = -width / 2;
    fill.renderOrder = 21;
    bar.add(back, fill);
    bar.position.y = height;
    bar.userData.fill = fill;
    bar.userData.width = width;
    view.group.add(bar);
    view.bar = bar;
    return bar;
  }

  setBar(view, fraction, visible, height, lowColor = true) {
    if (!visible && !view.bar) return;
    const bar = this.ensureBar(view, height);
    bar.visible = visible;
    if (!visible) return;
    const fill = bar.userData.fill;
    fill.scale.x = Math.max(0.001, bar.userData.width * Math.max(0, Math.min(1, fraction)));
    if (lowColor) fill.material = fraction < 0.35 ? this.barLow : view.castle ? this.barCastle : this.barFill;
    bar.quaternion.copy(this.cameraQuaternion);
  }

  // ------------------------------------------------------------ construction sites

  /** A site: scaffold plus the future building rising from the ground as work progresses. */
  addSite(site) {
    const view = { site: true, structure: site, group: new THREE.Group(), shake: 0, bar: null, materials: [], rising: null, scaffold: null };
    const anchor = site.target?.kind === 'castle' ? site.target : site;
    view.group.position.set(anchor.x, TOP, anchor.z);
    this.root.add(view.group);
    if (!site.target) {
      let model;
      let height = 1.4;
      if (site.tower) {
        model = buildTowerModel(this.assets, site.def, 0).root;
        height = weaponBaseY(site.def, 0) + 0.6;
      } else if (site.typeId === 'wall') {
        model = buildWallModel(this.assets, 0, this.wallNeighbors(site.cell));
        height = wallHeight(0);
      } else {
        model = buildBuildingModel(this.assets, site.def, 0, this.flagMaterial);
        height = site.typeId === 'academy' ? 2.6 : site.typeId === 'house' ? 1.5 : 1.2;
      }
      view.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), TOP);
      view.height = height;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = clippedMaterial(o.material, view.plane);
        view.materials.push(o.material);
      });
      view.rising = model;
      view.group.add(model);
      view.pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
      view.pick.userData.structure = site;
      view.group.add(view.pick);
      this.decorChanged(site.cell);
      if (site.typeId === 'wall') this.wallsDirty = true;
    }
    if (site.typeId !== 'wall') {
      const big = site.target?.kind === 'castle';
      const scaffold = new THREE.Group();
      const frame = part(this.assets, scaffold, 'survival/structure', { scale: big ? [6.2, 4.4, 6.2] : [1.8, site.tower || site.target ? 3 : 2.3, 1.8] });
      frame.position.set(0, 0, 0);
      part(this.assets, scaffold, 'survival/resource-planks', { x: big ? 1.9 : 0.55, z: big ? 1.9 : 0.5, rotation: 0.4, scale: 1.6 });
      view.scaffold = scaffold;
      view.group.add(scaffold);
      view.scaffoldPop = 1;
    }
    this.sites.set(site, view);
    site.view = view;
    return view;
  }

  removeSite(site) {
    const view = this.sites.get(site);
    if (!view) return;
    view.group.removeFromParent();
    for (const material of view.materials) material.dispose();
    this.sites.delete(site);
    site.view = null;
    if (!site.target) this.decorChanged(site.cell);
    if (site.typeId === 'wall') this.wallsDirty = true;
  }

  // ------------------------------------------------------------ workers

  addWorker(worker) {
    const name = CHARACTER_MODELS[(worker.id - 1) % CHARACTER_MODELS.length];
    const root = new THREE.Group();
    const model = this.assets.clone(name);
    model.scale.setScalar(WORKER_SCALE);
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    root.add(model);
    const shadow = new THREE.Mesh(this.discGeometry, this.shadowMaterial);
    shadow.scale.setScalar(0.45);
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    root.add(shadow);
    const mixer = new THREE.AnimationMixer(model);
    const clips = this.assets.animations.get(name) ?? [];
    const actions = {};
    for (const [key, clipName] of Object.entries(CLIPS)) {
      const clip = THREE.AnimationClip.findByName(clips, clipName);
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    const hand = model.getObjectByName('arm-right');
    const tools = {};
    for (const [key, toolName] of [['axe', 'survival/tool-axe'], ['pickaxe', 'survival/tool-pickaxe'], ['hammer', 'survival/tool-hammer']]) {
      const tool = this.assets.clone(toolName);
      tool.scale.setScalar(1.25);
      tool.rotation.set(Math.PI / 2, 0, 0);
      tool.position.set(-0.02, -0.08, 0.05);
      tool.visible = false;
      (hand ?? model).add(tool);
      tools[key] = tool;
    }
    const loads = {};
    for (const [resource, loadName] of Object.entries(CARRY_MODELS)) {
      const load = this.assets.clone(loadName);
      load.scale.setScalar(CARRY_SCALE[resource]);
      load.position.set(0, 0.6, -0.02);
      load.visible = false;
      root.add(load);
      loads[resource] = load;
    }
    root.position.set(worker.x, TOP, worker.z);
    this.root.add(root);
    const view = { worker, root, model, mixer, actions, current: null, tools, loads, yaw: Math.atan2(worker.dirX, worker.dirZ), phase: Math.random() * 10, appear: 1 };
    worker.view = view;
    this.workers.set(worker, view);
    this.play(view, 'idle');
    return view;
  }

  removeWorker(worker) {
    const view = this.workers.get(worker);
    if (!view) return;
    view.mixer.stopAllAction();
    view.root.removeFromParent();
    this.workers.delete(worker);
    worker.view = null;
  }

  play(view, key) {
    if (view.current === key || !view.actions[key]) return;
    const next = view.actions[key];
    next.reset().fadeIn(0.2).play();
    if (view.current && view.actions[view.current]) view.actions[view.current].fadeOut(0.2);
    view.current = key;
  }

  // ------------------------------------------------------------ night lights

  rebuildGlows() {
    this.glowsDirty = false;
    const positions = [];
    const seeds = [];
    const add = (group, local) => {
      for (const [x, y, z] of local ?? []) {
        positions.push(group.position.x + x, group.position.y + y, group.position.z + z);
        seeds.push(Math.random());
      }
    };
    if (this.castleView?.model) add(this.castleView.group, this.castleView.model.userData.glows);
    for (const view of this.structures.values()) {
      if (view.tower || !view.model) continue;
      add(view.group, view.model.userData.glows);
    }
    // A torch on every third wall.
    let k = 0;
    for (const building of this.sim?.buildings ?? []) {
      if (building.def.id !== 'wall' || k++ % 3) continue;
      positions.push(building.cell.x, TOP + wallHeight(building.level) - 0.08, building.cell.z);
      seeds.push(Math.random());
    }
    this.glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.glowGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.glowGeometry.setDrawRange(0, seeds.length);
  }

  setViewport(drawingBufferHeight, fovDeg) {
    this.glowMaterial.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  // ------------------------------------------------------------ frame

  update(dt, time, camera, night = 0) {
    this.cameraQuaternion.copy(camera.quaternion);
    this.flagUniforms.uTime.value = time;
    this.glowMaterial.uniforms.uTime.value = time;
    this.glowMaterial.uniforms.uNight.value = THREE.MathUtils.smoothstep(night, 0.35, 0.9);
    if (this.wallsDirty) this.rebuildWalls();
    if (this.glowsDirty) this.rebuildGlows();

    for (const entry of this.animating) {
      entry.current = damp(entry.current, entry.target, entry.target > entry.current ? 3 : 7, dt);
      if (entry.shake > 0) entry.shake = Math.max(0, entry.shake - dt);
      if (Math.abs(entry.current - entry.target) < 0.002) entry.current = entry.target;
      this.writeNode(entry);
      if (entry.current === entry.target && entry.shake === 0) this.animating.delete(entry);
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const fall = this.falling[i];
      fall.time += dt;
      const t = Math.min(1, fall.time / TREE_FALL_TIME);
      fall.entry.tilt = (t * t) * 1.45;
      if (t >= 1) {
        fall.entry.target = 0;
        this.animating.add(fall.entry);
        this.falling.splice(i, 1);
        this.onTreeLanded?.(fall.entry.cell);
      } else {
        this.writeNode(fall.entry);
      }
    }

    const sim = this.sim;
    if (sim) {
      const open = sim.activePortals().length;
      (this.world.portals ?? []).forEach((portal, i) => {
        portal.visible = i < open;
      });
      // Worn paths where workers walk.
      this.wearTimer -= dt;
      if (this.wearTimer <= 0) {
        this.wearTimer = 0.5;
        for (const w of sim.workers) if (w.state !== 'hidden' && w.path.length && w.pathIndex < w.path.length) this.world.terrain?.addWear(w.x, w.z, 0.28, 0.035);
      }
      this.updateCastle(dt, time, sim);
    }

    for (const view of this.structures.values()) {
      if (view.castle) continue;
      const s = view.structure;
      if (view.pop > 0) {
        view.pop = Math.max(0, view.pop - dt * 2.2);
        const t = 1 - view.pop;
        const bounce = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.35;
        if (view.model) view.model.scale.set(1 - bounce * 0.5, 1 + bounce, 1 - bounce * 0.5);
        else if (s.def.id === 'wall') this.wallsDirty = true;
      }
      if (view.shake > 0) {
        view.shake = Math.max(0, view.shake - dt);
        const target = view.tower ? s.view?.group : view.model;
        if (target) target.position.x = (view.tower ? s.cell.x : 0) + Math.sin(time * 60) * view.shake * 0.12;
      } else if (view.tower && s.view?.group) {
        s.view.group.position.x = s.cell.x;
      } else if (view.model) {
        view.model.position.x = 0;
      }
      const height = view.tower ? 2.3 : s.def.id === 'wall' ? wallHeight(s.level) + 0.3 : s.def.id === 'academy' ? 2.9 : 1.9;
      this.setBar(view, s.hp / s.maxHp, s.hp < s.maxHp - 0.5 && !s.upgrading, height);
    }

    for (const view of this.sites.values()) this.updateSite(view, dt, time);
    this.updateWorkers(dt, time);
    this.updateBirds(dt, time, night, camera);
    this.updateSmoke(dt, camera);
  }

  updateCastle(dt, time, sim) {
    const view = this.castleView;
    if (!view) return;
    if (view.pop > 0) {
      view.pop = Math.max(0, view.pop - dt * 1.6);
      const t = 1 - view.pop;
      const bounce = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.25;
      view.model.scale.set(1 - bounce * 0.4, 1 + bounce, 1 - bounce * 0.4);
    }
    const fraction = sim.lives / sim.startLives;
    this.setBar(view, fraction, fraction < 0.999 || sim.phase === 'night', (view.model.userData.top ?? 4) + 0.9);
  }

  updateSite(view, dt, time) {
    const site = view.structure;
    const progress = Math.min(1, site.progress / site.work);
    if (view.plane) {
      // The building grows out of the scaffold from the ground up.
      view.plane.constant = TOP + 0.05 + view.height * (0.08 + 0.92 * progress);
    }
    if (view.scaffold && view.scaffoldPop > 0) {
      view.scaffoldPop = Math.max(0, view.scaffoldPop - dt * 3);
      const t = 1 - view.scaffoldPop;
      view.scaffold.scale.setScalar(Math.min(1, t * 1.2) * (1 + Math.sin(t * Math.PI) * 0.1));
    }
    if (view.shake > 0) {
      view.shake = Math.max(0, view.shake - dt);
      view.group.position.x = site.x + Math.sin(time * 60) * view.shake * 0.12;
    }
    const height = site.target?.kind === 'castle' ? 5.6 : site.target ? 2.5 : 1.9;
    this.setBar(view, progress, site.typeId !== 'wall', height, false);
  }

  updateWorkers(dt, time) {
    for (const view of this.workers.values()) {
      const w = view.worker;
      const visible = w.state !== 'hidden';
      view.root.visible = visible;
      if (!visible) {
        view.appear = 1;
        continue;
      }
      if (view.appear > 0) {
        view.appear = Math.max(0, view.appear - dt * 4);
        view.root.scale.setScalar(1 - view.appear * view.appear);
        if (view.appear > 0.95) view.root.position.set(w.x, TOP, w.z);
      }
      view.root.position.x = damp(view.root.position.x, w.x, 18, dt);
      view.root.position.z = damp(view.root.position.z, w.z, 18, dt);
      const moving = w.path.length > 0 && w.pathIndex < w.path.length && w.state !== 'harvest' && w.state !== 'building';
      const desired = Math.atan2(w.dirX, w.dirZ);
      view.yaw += shortestAngle(view.yaw, desired) * Math.min(1, dt * 10);
      view.root.rotation.y = view.yaw;
      const working = w.state === 'harvest' || w.state === 'building';
      this.play(view, working ? 'work' : moving ? 'walk' : 'idle');
      const building = w.site && (w.state === 'building' || w.state === 'toSite');
      const toolKey = building ? 'hammer' : w.job === 'wood' ? 'axe' : w.job ? 'pickaxe' : null;
      const holdTool = !w.carry && (building || w.state === 'harvest' || w.state === 'toNode');
      for (const [key, tool] of Object.entries(view.tools)) tool.visible = holdTool && toolKey === key;
      for (const [resource, load] of Object.entries(view.loads)) load.visible = w.carry?.resource === resource;
      if (w.carry) {
        const load = view.loads[w.carry.resource];
        load.position.y = 0.6 + (moving ? Math.abs(Math.sin(time * 9 + view.phase)) * 0.03 : 0);
      }
      view.mixer.update(dt * (moving ? 1.15 : working ? 1.1 : 1));
    }
  }

  updateBirds(dt, time, night, camera) {
    const birds = this.birds;
    const alpha = 1 - THREE.MathUtils.smoothstep(night, 0.3, 0.7);
    birds.visible = alpha > 0.02;
    if (!birds.visible) return;
    const d = this.dummy;
    this.birdState.forEach((bird, i) => {
      const flockTime = time * (bird.flock ? 0.09 : 0.07) + bird.flock * 3;
      const radius = bird.flock ? 11 : 15;
      const cx = Math.cos(flockTime) * radius;
      const cz = Math.sin(flockTime * (bird.flock ? 1 : -1)) * radius * 0.7;
      const heading = Math.atan2(-Math.sin(flockTime) * radius, Math.cos(flockTime * (bird.flock ? 1 : -1)) * radius * 0.7 * (bird.flock ? 1 : -1));
      d.position.set(cx + bird.offset.x, 3.6 + bird.flock * 0.6 + bird.offset.y + Math.sin(time * 0.7 + bird.phase) * 0.2, cz + bird.offset.z);
      d.rotation.set(0, heading, 0);
      const flap = Math.sin(time * 11 + bird.phase);
      // Birds that pass right in front of the lens shrink away instead of filling the screen.
      const near = THREE.MathUtils.smoothstep(d.position.distanceTo(camera.position), 3, 6);
      const size = 0.5 * near * alpha;
      d.scale.set(size, flap * size, size);
      d.updateMatrix();
      birds.setMatrixAt(i, d.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;
  }

  /** Chimney smoke from the houses near the camera. */
  updateSmoke(dt, camera) {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0 || !this.effects) return;
    this.smokeTimer = 0.28;
    for (const view of this.structures.values()) {
      const chimney = view.model?.userData.chimney;
      if (!chimney) continue;
      const x = view.group.position.x + chimney[0];
      const z = view.group.position.z + chimney[2];
      if (Math.hypot(x - camera.position.x, z - camera.position.z + camera.position.y * 0.6) > 26) continue;
      this.effects.chimneySmoke(x, view.group.position.y + chimney[1], z);
    }
  }

  clear() {
    for (const mesh of [...this.nodeMeshes, ...this.decorMeshes, ...this.wallMeshes]) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.nodeMeshes = [];
    this.decorMeshes = [];
    this.wallMeshes = [];
    this.nodes.clear();
    this.decor.clear();
    this.animating.clear();
    this.falling = [];
    for (const view of this.structures.values()) view.group.removeFromParent();
    this.structures.clear();
    for (const site of [...this.sites.keys()]) this.removeSite(site);
    for (const view of this.workers.values()) {
      view.mixer.stopAllAction();
      view.root.removeFromParent();
    }
    this.workers.clear();
    this.castleView = null;
    this.glowGeometry.setDrawRange(0, 0);
    this.sim = null;
  }

  dispose() {
    this.clear();
    for (const template of this.modelCache.values()) {
      template.traverse((o) => {
        if (o.isMesh && o.userData.owned) o.geometry.dispose();
      });
    }
    this.modelCache.clear();
    this.pickGeometry.dispose();
    this.pickMaterial.dispose();
    this.barGeometry.dispose();
    for (const material of [this.barBack, this.barFill, this.barLow, this.barBuild, this.barCastle, this.shadowMaterial, this.flagMaterial, this.glowMaterial, this.birdMaterial, ...(this.warmMaterials ?? [])]) material.dispose();
    this.shadowTexture.dispose();
    this.discGeometry.dispose();
    this.glowGeometry.dispose();
    this.birdGeometry.dispose();
    this.birds.dispose();
  }
}
