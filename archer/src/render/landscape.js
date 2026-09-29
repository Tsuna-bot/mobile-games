import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL } from '../sim/arena.js';
import { batchStatic } from './batch.js';
import { Ambience } from './ambience.js';
import { FLOOR_STYLE, occlusionTexture, patchFloor, patchRim, rigidOutlineMaterial, setRim, toonRamp } from './surfaces.js';

// Open anime landscapes around the (unchanged) 9 × 15 arena of the simulation:
// a sculpted terrain that rises into hills, wind-blown grass and flowers, ponds where
// the layout has pits, rocks or ruins on blocks, trees on the hills, a glowing portal
// instead of a door. Everything is toon-shaded with dark outlines, like the heroes.

// ------------------------------------------------------------ value noise (CPU)

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x, y) {
  return noise(x, y) * 0.55 + noise(x * 2.1 + 3.1, y * 2.1 + 1.7) * 0.3 + noise(x * 4.3 + 7.7, y * 4.3 + 2.3) * 0.15;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A copy of `geometry` whose normals are averaged across hard edges (vertices at the
 * same place share one normal): faceted rocks turn into smooth, painted-looking ones
 * under toon shading.
 */
function smoothedGeometry(geometry) {
  const out = geometry.clone();
  const pos = out.attributes.position;
  const index = out.index;
  const key = (i) => `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`;
  const sums = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const count = index ? index.count : pos.count;
  for (let t = 0; t < count; t += 3) {
    const ia = index ? index.getX(t) : t;
    const ib = index ? index.getX(t + 1) : t + 1;
    const ic = index ? index.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    // Area-weighted face normal.
    const n = c.sub(b).cross(a.sub(b));
    for (const i of [ia, ib, ic]) {
      const k = key(i);
      const sum = sums.get(k);
      if (sum) sum.add(n);
      else sums.set(k, n.clone());
    }
  }
  const normals = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.copy(sums.get(key(i)) ?? n.set(0, 1, 0)).normalize();
    normals.set([n.x, n.y, n.z], i * 3);
  }
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return out;
}

// ------------------------------------------------------------ procedural props

/** Paints every vertex of `geometry` with `color`, or a gradient from `color` to `top` along y. */
function paint(geometry, color, top = null, y0 = 0, y1 = 1) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(color);
  const b = new THREE.Color(top ?? color);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0))));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Only position, normal and colour, not indexed: every generated piece merges with the others. */
function plain(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  return g;
}

/** A cluster of faceted crystals (1 unit wide), dark at the root, bright at the tips. */
function crystalCluster(random, [dark, light]) {
  const parts = [];
  const count = 3 + Math.floor(random() * 4);
  for (let i = 0; i < count; i++) {
    const main = i === 0;
    const r = main ? 0.13 : 0.06 + random() * 0.06;
    const h = main ? 0.9 + random() * 0.4 : 0.3 + random() * 0.45;
    const body = new THREE.CylinderGeometry(r, r * 1.15, h, 6, 1).translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.4, 6).translate(0, h + r * 1.2, 0);
    let piece = mergeGeometries([plain(body), plain(tip)]);
    piece.computeVertexNormals();
    paint(piece, dark, light, 0, h + r * 2.4);
    const angle = random() * Math.PI * 2;
    const spread = main ? 0 : 0.14 + random() * 0.14;
    piece.rotateZ(main ? (random() - 0.5) * 0.2 : (0.35 + random() * 0.45) * (random() < 0.5 ? -1 : 1));
    piece.rotateY(angle);
    piece.translate(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    parts.push(piece);
  }
  return mergeGeometries(parts);
}

/** A stylized pine: stacked cones on a short trunk, with snow caps (1 unit wide). */
function pineTree(random, { snow = false, colors = [0x2a5a3a, 0x4a8a50] } = {}) {
  const parts = [];
  parts.push(paint(plain(new THREE.CylinderGeometry(0.05, 0.08, 0.36, 7).translate(0, 0.18, 0)), 0x5a3a26));
  const tiers = 3 + (random() < 0.4 ? 1 : 0);
  for (let k = 0; k < tiers; k++) {
    const radius = 0.5 - k * (0.36 / tiers);
    const height = 0.5 - k * 0.04;
    const y = 0.26 + k * 0.27;
    const lean = (random() - 0.5) * 0.08;
    const cone = new THREE.ConeGeometry(radius, height, 9).translate(0, y + height / 2, 0).rotateZ(lean);
    const shade = new THREE.Color(colors[0]).lerp(new THREE.Color(colors[1]), k / tiers);
    parts.push(paint(plain(cone), shade.getHex(), new THREE.Color(colors[1]).getHex(), y, y + height * 1.4));
    if (snow) {
      const cap = new THREE.ConeGeometry(radius * 0.74, height * 0.52, 9).translate(0, y + height * 0.74 + 0.012, 0).rotateZ(lean);
      parts.push(paint(plain(cap), 0xe8f2ff, 0xffffff, y + height * 0.5, y + height));
    }
  }
  return mergeGeometries(parts);
}

/** A basalt spire (volcano) or an obelisk (citadel): a leaning faceted column. */
function spire(random, [dark, light]) {
  const h = 1.2 + random() * 1.2;
  const g = new THREE.CylinderGeometry(0.12 + random() * 0.1, 0.4, h, 5, 3).translate(0, h / 2, 0);
  g.rotateZ((random() - 0.5) * 0.25);
  const out = plain(g);
  out.computeVertexNormals();
  return paint(out, dark, light, 0, h);
}

const PROPS = {
  '@crystal': (random, theme) => crystalCluster(random, theme.crystal),
  '@pine': (random, theme) => pineTree(random, { snow: Boolean(theme.snow), colors: theme.pine }),
  '@spire': (random, theme) => spire(random, theme.spire),
};

/** Toon material for the generated props: vertex colours, with a glow for crystals. */
function propMaterial(glow) {
  const material = patchRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
  const rim = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    rim(shader);
    shader.uniforms.uGlow = { value: glow };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * uGlow;');
  };
  material.onBeforeCompile.rim = true;
  material.customProgramCacheKey = () => 'prop-glow';
  return material;
}

// ------------------------------------------------------------ themes

/**
 * One entry per chapter theme. Colours are hex; prop lists are [model, width].
 * `hill`: height of the surrounding hills; `grass`: blade base/tip colours.
 */
export const LANDS = {
  forest: {
    sky: 0xd4eef0, skyTop: 0x4a9ae0, fog: 0xa8d2c0, fogRange: [24, 58], clouds: 0xffffff,
    sun: 0xfff0d2, sunIntensity: 2.7, hemi: [0xe4f4ff, 0x56863e], hemiIntensity: 1.15, back: [0xa8e4ff, 0.9], rim: [0xfff6e0, 0.5], env: 0.15,
    grade: { shadows: 0x2a5a78, highlights: 0xffe0b0, tone: 0.07, saturation: 1.18 },
    ground: [0x5fa83e, 0x8ccc52], dirt: 0xb89a5c, rock: 0x86908e, sand: 0xe4d49c, style: FLOOR_STYLE.grass,
    hill: 3.2, grass: [0x2f7a2a, 0xb2e864], grassHeight: [0.2, 0.38], grassDensity: 1,
    flowers: [0xfff09a, 0xff9ec8, 0xffffff, 0xb9a4ff, 0xffb070], flowerDensity: 1,
    water: { deep: 0x1f6fb0, shallow: 0x62dbe4, foam: 0xf4ffff },
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['Rock_3_C', 0.9], ['Rock_3_E', 0.9], ['Bush_1_A', 0.9]],
    edge: [['Bush_1_C', 0.9], ['Bush_1_A', 0.75], ['Bush_1_E', 0.6], ['Rock_1_A', 0.55], ['Bush_3_A', 0.9]],
    trees: [['Tree_1_A', 2.3], ['Tree_1_B', 2.5], ['Tree_1_C', 2.3], ['Tree_3_A', 2.7], ['Tree_3_B', 2.6], ['Tree_4_A', 1.9], ['Tree_4_B', 2.1]],
    treeCount: 70, stone: 0xb8b2a4, portal: 0x8ff8d8, ambience: 'forest',
  },
  // Ruins at dusk: a paved court among broken columns, golden grass, a sunset sky.
  dungeon: {
    sky: 0xf2b48a, skyTop: 0x6a5ab8, fog: 0xc89a98, fogRange: [22, 56], clouds: 0xffd8c0,
    sun: 0xffb478, sunIntensity: 2.7, hemi: [0xc0b0ff, 0x4a3a40], hemiIntensity: 1.05, back: [0x9a8aff, 1.2], rim: [0xffc890, 0.65], env: 0.12,
    grade: { shadows: 0x4a2a6a, highlights: 0xffb070, tone: 0.1, saturation: 1.1 },
    ground: [0x5e8a44, 0x8eaa5a], dirt: 0x9a8260, rock: 0x9a8c8a, sand: 0xc8b08a, style: FLOOR_STYLE.grass, court: 0xa4a49c,
    hill: 3.4, grass: [0x3e5a2a, 0xb4d070], grassHeight: [0.18, 0.34], grassDensity: 0.8,
    flowers: [0xffb070, 0xd0a0ff, 0xff8a6a, 0xfff0c0], flowerDensity: 0.6,
    water: { deep: 0x24506e, shallow: 0x6aa8b8, foam: 0xfff0e0 },
    blocks: [['column', 0.75], ['pillar', 0.9], ['rubble_half', 0.95], ['Rock_3_A', 0.9], ['Rock_3_C', 0.9], ['pillar_decorated', 0.85]],
    edge: [['rubble_half', 1.2], ['Rock_1_A', 0.6], ['column', 0.6], ['Bush_1_C', 0.8], ['Bush_1_E', 0.6]],
    trees: [['Tree_Bare_1_A', 2], ['Tree_1_B', 2.3], ['Tree_4_A', 1.9], ['pillar_decorated', 1.6], ['pillar', 1.4], ['Tree_3_A', 2.4], ['column', 1.3]],
    treeCount: 55, stone: 0xcdbca2, portal: 0xc8a0ff, torch: 0xffa850, ambience: 'dungeon',
  },
  // A moor by night: moonlight, an old chapel's pavement, graves, will-o'-the-wisps.
  graveyard: {
    sky: 0x3a5a78, skyTop: 0x0c1428, fog: 0x2e4a5a, fogRange: [18, 48], clouds: 0x5a7090, stars: true,
    sun: 0xb8ccff, sunIntensity: 2.2, hemi: [0x9ab8ff, 0x22302a], hemiIntensity: 1.05, back: [0x7affc8, 1.3], rim: [0xb8ffe0, 0.65], env: 0.12,
    grade: { shadows: 0x1a4a5a, highlights: 0xc8e0ff, tone: 0.12, saturation: 1.05 },
    ground: [0x3e6452, 0x5e8468], dirt: 0x5a5a4a, rock: 0x7a8490, sand: 0x6a7a6a, style: FLOOR_STYLE.grass, court: 0x7e8a8c,
    hill: 3.0, grass: [0x1e3a34, 0x80b8a0], grassHeight: [0.18, 0.32], grassDensity: 0.8,
    flowers: [0x9fffd8, 0xc8d8ff, 0xffffff], flowerDensity: 0.35,
    water: { deep: 0x1a4a58, shallow: 0x4aa8a0, foam: 0xc8fff0 },
    blocks: [['gravestone', 0.85], ['grave_A', 0.95], ['grave_B', 0.95], ['gravestone', 0.8], ['Rock_3_B', 0.85], ['pumpkin_orange_jackolantern', 0.75], ['shrine_candles', 0.7]],
    edge: [['gravemarker_A', 0.5], ['skull_candle', 0.45], ['pumpkin_yellow', 0.5], ['Rock_1_A', 0.5], ['ribcage', 0.5]],
    trees: [['tree_dead_large', 2], ['tree_dead_medium', 1.7], ['Tree_Bare_1_A', 1.9], ['Tree_Bare_2_A', 1.7], ['tree_pine_orange_large', 2.4], ['crypt', 2.6]],
    treeCount: 50, stone: 0x8a9aa8, portal: 0x7affc8, torch: 0x9fffd0, ambience: 'graveyard',
  },
  // Crystal highlands at twilight: glowing crystals among rocks, an underground spring.
  mines: {
    sky: 0x8a7ab8, skyTop: 0x1a1844, fog: 0x5e5888, fogRange: [20, 52], clouds: 0x9a8ac8, stars: true,
    sun: 0xffe0c0, sunIntensity: 2.3, hemi: [0xb0a8e8, 0x302838], hemiIntensity: 1.0, back: [0x6af0ff, 1.3], rim: [0x9ff0ff, 0.65], env: 0.12,
    grade: { shadows: 0x2a2a6a, highlights: 0xffe0b0, tone: 0.1, saturation: 1.05 },
    ground: [0x585a6c, 0x7a768c], dirt: 0x6a5a58, rock: 0x8a8298, sand: 0x9a90a8, style: FLOOR_STYLE.grass,
    hill: 3.6, grass: [0x34445a, 0x8ab8d0], grassHeight: [0.14, 0.26], grassDensity: 0.35,
    flowers: [0x9ff0ff, 0xd8a8ff], flowerDensity: 0.35,
    water: { deep: 0x1a2a7a, shallow: 0x4ad0f0, foam: 0xd0ffff, glow: 1.5 },
    crystal: [0x3a3aa0, 0x9ff4ff],
    blocks: [['@crystal', 0.95], ['@crystal', 0.9], ['Rock_3_A', 0.95], ['Rock_3_C', 0.9]],
    edge: [['Rock_1_A', 0.6], ['@crystal', 0.5], ['Rock_3_B', 0.7]],
    trees: [['@crystal', 1.6], ['@crystal', 2.2], ['Rock_2_A', 2.2], ['Rock_3_E', 1.8], ['Tree_Bare_2_A', 1.7]],
    tint: 0xb8b0d8, treeCount: 55, stone: 0x8a82a8, portal: 0x9ff0ff, torch: 0x9ff0ff, ambience: 'mines',
  },
  // A snowy plain under a blue sky: snow-capped pines, frozen ponds, falling snow.
  tundra: {
    sky: 0xd4e6f4, skyTop: 0x4a8ad8, fog: 0xb8cce0, fogRange: [26, 64], clouds: 0xffffff,
    sun: 0xfff0e0, sunIntensity: 2.1, hemi: [0xd8e8ff, 0x6a8098], hemiIntensity: 0.9, back: [0xa8d8ff, 0.9], rim: [0xe8f8ff, 0.45], env: 0.12,
    grade: { shadows: 0x2a4a8a, highlights: 0xfff0e0, tone: 0.08, saturation: 1.12 },
    ground: [0xa8bccc, 0xd4e0ea], dirt: 0xa8b8c8, rock: 0x8a98a8, sand: 0xc8d8e8, style: FLOOR_STYLE.grass,
    hill: 3.4, grass: [0x7a9498, 0xf4faff], grassHeight: [0.12, 0.24], grassDensity: 0.4,
    flowers: [0xa8d0ff, 0xffffff], flowerDensity: 0.15,
    water: { deep: 0x7ab4e0, shallow: 0xc4e4f8, foam: 0xffffff, calm: true },
    pine: [0x24503e, 0x3e7a58], snow: true,
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['Rock_3_C', 0.9], ['@pine', 0.9]],
    edge: [['Rock_1_A', 0.55], ['@pine', 0.6], ['Rock_3_E', 0.6]],
    trees: [['@pine', 1.5], ['@pine', 1.8], ['@pine', 1.3], ['Rock_2_A', 1.8], ['Tree_Bare_1_A', 1.8]],
    tint: 0xdce8f4, treeCount: 80, stone: 0xc8d4e0, portal: 0x9fe8ff, ambience: 'tundra',
  },
  // A toxic marsh: reeds, dead trees, green ponds, fireflies and mist.
  swamp: {
    sky: 0xb0bc90, skyTop: 0x4a6a64, fog: 0x8a9a78, fogRange: [18, 48], clouds: 0xe0e8c8,
    sun: 0xf0f0c0, sunIntensity: 2.3, hemi: [0xc8e0c0, 0x3a4a2a], hemiIntensity: 1.05, back: [0xb8ff8a, 1.2], rim: [0xd8ffa8, 0.55], env: 0.12,
    grade: { shadows: 0x2a4a3a, highlights: 0xe8f0a0, tone: 0.1, saturation: 1.05 },
    ground: [0x46663a, 0x687a46], dirt: 0x5a5038, rock: 0x6a7060, sand: 0x7a7050, style: FLOOR_STYLE.grass,
    hill: 2.6, grass: [0x2a4a28, 0xa0bc62], grassHeight: [0.26, 0.5], grassDensity: 1,
    flowers: [0xe8e070, 0xc890ff, 0xffffff], flowerDensity: 0.45,
    water: { deep: 0x234a26, shallow: 0x7aac4e, foam: 0xd8ff9a, glow: 0.25 },
    blocks: [['tree_dead_medium', 0.9], ['Rock_3_A', 0.9], ['Rock_3_C', 0.9], ['Bush_1_A', 0.9]],
    edge: [['Bush_1_C', 0.8], ['Rock_1_A', 0.5], ['Bush_1_E', 0.6], ['tree_dead_medium', 0.6]],
    trees: [['tree_dead_large', 2.1], ['tree_dead_medium', 1.8], ['Tree_Bare_1_A', 2], ['Tree_Bare_2_A', 1.8], ['Tree_4_A', 2], ['Tree_Bare_1_B', 2]],
    treeCount: 60, stone: 0x8a9a80, portal: 0xb8ff8a, ambience: 'swamp',
  },
  // The volcano's heart: black basalt, rivers of lava, a red sky full of ash.
  volcano: {
    sky: 0xc8603a, skyTop: 0x241018, fog: 0x4a2a28, fogRange: [18, 50], clouds: 0x4a2a2a,
    sun: 0xffd0a8, sunIntensity: 2.3, hemi: [0xc8b0b8, 0x201818], hemiIntensity: 0.85, back: [0xff5a2a, 1.3], rim: [0xff9a5a, 0.6], env: 0.1,
    grade: { shadows: 0x2a1a30, highlights: 0xffb070, tone: 0.1, saturation: 1.0 },
    ground: [0x2e2a2e, 0x443c3e], dirt: 0x5a4038, rock: 0x2a2426, sand: 0x7a3a24, style: FLOOR_STYLE.grass,
    hill: 3.8, grass: [0x2a2020, 0x7a5a40], grassHeight: [0.12, 0.22], grassDensity: 0.12,
    flowers: [0xff8a3a], flowerDensity: 0.05,
    water: { deep: 0xff3a08, shallow: 0xffa028, foam: 0xfff080, glow: 2.4, lava: true }, cracks: 0xff6a1a,
    spire: [0x1a1618, 0x4a3a3a],
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['Rock_3_C', 0.9], ['@spire', 0.85]],
    edge: [['Rock_1_A', 0.6], ['Rock_3_E', 0.6], ['tree_dead_medium', 0.6]],
    trees: [['@spire', 1.4], ['@spire', 1.8], ['Rock_2_A', 2.2], ['tree_dead_large', 1.8], ['Rock_3_E', 1.8]],
    tint: 0x6a5a58, treeCount: 50, stone: 0x5a4a4a, portal: 0xff8a3a, torch: 0xff7a2a, ambience: 'volcano',
  },
  // The shadow citadel by night: a vast dark courtyard, pillars, violet void pools.
  citadel: {
    sky: 0x5a3a7a, skyTop: 0x100820, fog: 0x3a2a4e, fogRange: [18, 48], clouds: 0x6a4a8a, stars: true,
    sun: 0xe0d4ff, sunIntensity: 2.3, hemi: [0xb0a8d8, 0x262030], hemiIntensity: 0.95, back: [0xc86aff, 1.2], rim: [0xd8a8ff, 0.6], env: 0.12,
    grade: { shadows: 0x2a2050, highlights: 0xf0dcc0, tone: 0.1, saturation: 1.0 },
    ground: [0x383848, 0x4c4a5c], dirt: 0x4a4050, rock: 0x5a5468, sand: 0x5a5068, style: FLOOR_STYLE.grass, court: 0x6e6886,
    hill: 3.4, grass: [0x2a2a3a, 0x8a7aa8], grassHeight: [0.14, 0.26], grassDensity: 0.4,
    flowers: [0xc8a0ff, 0xff9ad8], flowerDensity: 0.12,
    water: { deep: 0x160830, shallow: 0x6a3ac8, foam: 0xd8b0ff, glow: 1.2 },
    spire: [0x22202e, 0x5a5270],
    blocks: [['column', 0.75], ['pillar', 0.9], ['pillar_decorated', 0.85], ['rubble_half', 0.95], ['@spire', 0.8]],
    edge: [['rubble_half', 1.1], ['column', 0.6], ['Rock_1_A', 0.5]],
    trees: [['pillar_decorated', 1.6], ['pillar', 1.4], ['@spire', 1.6], ['@spire', 2], ['Tree_Bare_1_A', 1.9], ['column', 1.3]],
    tint: 0x9a90b8, treeCount: 55, stone: 0x6e6886, portal: 0xc86aff, torch: 0xc86aff, ambience: 'citadel',
  },
};

// ------------------------------------------------------------ grass and flowers

/**
 * A tuft of five tapered blades leaning outward, 1 unit tall (scaled per instance);
 * `aH` = height along the blade.
 */
function grassClump() {
  const positions = [];
  const heights = [];
  const indices = [];
  const BLADES = 5;
  for (let b = 0; b < BLADES; b++) {
    const angle = (b / BLADES) * Math.PI * 2 + (b % 2) * 0.5;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const root = 0.12 + (b % 3) * 0.05;
    const tall = 0.75 + ((b * 7) % 5) * 0.07;
    const lean = 0.28 + (b % 2) * 0.12;
    const w = 0.075;
    const base = positions.length / 3;
    // The blade faces the tuft's centre: its width runs across the lean.
    const pts = [[-w, 0], [w, 0], [-w * 0.55, 0.5], [w * 0.55, 0.5], [0, 1]];
    for (const [x, y] of pts) {
      const out = root + lean * y * y;
      positions.push(ca * out - sa * x, y * tall, sa * out + ca * x);
      heights.push(y);
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1));
  // Normals straight up: soft, painterly lighting on the whole field.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(indices);
  return g;
}

/**
 * A flower: a thin stem and a five-petal head facing up (aH = 1 on the petals,
 * 1.25 at the heart, which the shader turns golden).
 */
function flowerGeometry() {
  const positions = [];
  const heights = [];
  const indices = [];
  const STEM = 0.2;
  // Stem: two crossed thin quads.
  for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const base = positions.length / 3;
    const w = 0.01;
    positions.push(-w * dx, 0, -w * dz, w * dx, 0, w * dz, w * dx, STEM, w * dz, -w * dx, STEM, -w * dz);
    heights.push(0, 0, 0.5, 0.5);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Head: a fan whose rim follows five rounded petals.
  const centre = positions.length / 3;
  positions.push(0, STEM + 0.012, 0);
  heights.push(1.25);
  const RIM = 30;
  for (let i = 0; i < RIM; i++) {
    const a = (i / RIM) * Math.PI * 2;
    const r = 0.085 * (0.35 + 0.65 * Math.abs(Math.cos(a * 2.5)));
    positions.push(Math.cos(a) * r, STEM + 0.01 - r * 0.15, Math.sin(a) * r);
    heights.push(1);
  }
  for (let i = 0; i < RIM; i++) indices.push(centre, centre + 1 + i, centre + 1 + ((i + 1) % RIM));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(indices);
  return g;
}

/**
 * Toon material for grass and flowers: sways in the wind, bends away from the hero,
 * colour from base to tip (flowers: green stems, instance-coloured petals).
 */
function vegetationMaterial(uniforms, flower) {
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aH;
varying float vH;
uniform float uTime;
uniform vec3 uPush;
uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vH = aH;
  #ifdef USE_INSTANCING
    vec3 iPos = instanceMatrix[3].xyz;
    mat3 iRot = mat3(instanceMatrix);
  #else
    vec3 iPos = vec3(0.0);
    mat3 iRot = mat3(1.0);
  #endif
  float sway = sin(uTime * 1.7 + iPos.x * 0.6 + iPos.z * 0.45) * 0.6 + sin(uTime * 3.3 + iPos.x * 1.9 - iPos.z) * 0.25;
  // Wind in proportion to the plant's size; the hero parts the grass (world units).
  float s = sqrt(dot(iRot[0], iRot[0]));
  vec3 bend = vec3(sway * 0.34, 0.0, sway * 0.16) * uWind * s;
  vec2 away = iPos.xz - uPush.xy;
  float d = length(away) + 1e-4;
  bend.xz += away / d * (1.0 - smoothstep(0.0, uPush.z, d)) * 0.16;
  // World bend back into the instance's frame (rotation about Y and uniform scale).
  vec3 localBend = transpose(iRot) * bend / (s * s);
  float k = min(aH, 1.0);
  k *= k;
  transformed += localBend * k;
  transformed.y -= length(bend.xz) / s * k * 0.35;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vH;
uniform vec3 uBase;
uniform vec3 uTip;`)
      .replace('#include <color_fragment>', flower
        ? `#include <color_fragment>
  if (vH < 0.9) diffuseColor.rgb = uBase * (0.7 + vH * 0.6);
  else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.3), smoothstep(1.03, 1.2, vH));`
        : `#include <color_fragment>
  diffuseColor.rgb *= mix(uBase, uTip, smoothstep(0.0, 1.0, vH));`);
  };
  material.customProgramCacheKey = () => (flower ? 'flower' : 'grass');
  return material;
}

// ------------------------------------------------------------ water

const WATER_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WATER_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform sampler2D uHeight;
uniform vec4 uBounds;
uniform vec2 uRange;
uniform float uLevel;
uniform float uGlow;
uniform float uFlow;
varying vec3 vWorld;
void main() {
  vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
  float ground = mix(uRange.x, uRange.y, texture2D(uHeight, uv).r);
  float depth = uLevel - ground;
  if (depth <= 0.0) discard;
  vec2 p = vWorld.xz;
  float t = uTime * uFlow;
  float w = sin(p.x * 2.3 + t * 1.1) * sin(p.y * 2.9 - t * 0.9);
  float caustic = smoothstep(0.55, 0.95, sin(p.x * 6.0 + sin(p.y * 5.0 + t) * 1.5 + t * 0.8) * 0.5 + 0.5);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.02, 0.28, depth + w * 0.02));
  c += caustic * 0.08 * (1.0 - smoothstep(0.1, 0.3, depth));
  // A bright foam line along the shore, breathing with the ripples.
  float foam = 1.0 - smoothstep(0.0, 0.035 + 0.015 * (w * 0.5 + 0.5), depth);
  c = mix(c, uFoam, foam * 0.9);
  // Sky glint.
  c += vec3(0.12) * smoothstep(0.75, 1.0, sin(p.x * 1.3 - p.y * 0.7 + t * 0.6) * 0.5 + 0.5) * (1.0 - foam);
  // Lava and glowing springs shine (the bloom picks them up).
  c *= 1.0 + uGlow * (0.6 + 0.4 * w);
  gl_FragColor = vec4(c, uGlow > 1.0 ? 1.0 : 0.93);
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------ portal

const PORTAL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = atan(d.y, d.x);
  float swirl = sin(a * 5.0 + r * 9.0 - uTime * 3.0) * 0.5 + 0.5;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  float edge = smoothstep(0.75, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
  float k = mix(0.18, 1.0, uOpen);
  vec3 c = uColor * (core * (0.4 + swirl * 0.6) * k + edge * 1.4) * 1.8;
  gl_FragColor = vec4(c, (core * 0.8 * k + edge) );
}`;

const SIMPLE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// ------------------------------------------------------------ sky

// A painted sky dome drawn at infinity: gradient from the horizon (the fog colour) to
// the zenith, flat anime clouds with hard edges and shaded bellies, stars at night.
const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uClouds;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y);
}
float sFbm(vec2 p) { return sNoise(p) * 0.5 + sNoise(p * 2.03 + 1.7) * 0.28 + sNoise(p * 4.1 + 3.1) * 0.14 + sNoise(p * 8.3) * 0.08; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
    float n = sFbm(uv);
    float cloud = smoothstep(0.55, 0.58, n) * smoothstep(0.0, 0.18, h);
    float lit = smoothstep(0.55, 0.7, sFbm(uv - vec2(0.04, 0.06)));
    vec3 cc = mix(mix(uClouds, uTop, 0.35), uClouds, lit);
    c = mix(c, cc, cloud * 0.95);
    if (uStars > 0.5) {
      vec2 g = d.xz / (h + 0.25) * 70.0;
      float star = step(0.992, sHash(floor(g))) * (0.6 + 0.4 * sin(uTime * 2.0 + sHash(floor(g) + 1.0) * 30.0));
      c += star * (1.0 - cloud) * smoothstep(0.05, 0.3, h) * 0.9;
    }
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------ the landscape

export class Landscape {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.disposables = [];
    this.time = 0;
    this.effects = 1;
    // Grass density of the quality preset (never bare: a thin field on low).
    this.grass = 1;
    this.onTheme = null;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.position.set(-5, 12, 6);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -7;
    cam.right = 7;
    cam.top = 10;
    cam.bottom = -10;
    cam.near = 1;
    cam.far = 34;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.back = new THREE.DirectionalLight(0x9fd8ff, 1);
    this.back.position.set(4, 7, -10);
    scene.add(this.hemi, this.sun, this.sun.target, this.back);

    this.ambience = new Ambience(scene);
    this.outline = rigidOutlineMaterial(0x2a2230, 0.0016);
    this.toonCache = new Map();
    this.shared = { uTime: { value: 0 }, uPush: { value: new THREE.Vector3(0, 0, 0.9) }, uWind: { value: 1 } };
    this.grassGeometry = grassClump();
    this.flowerGeometry = flowerGeometry();
    this.torches = [];
    this.door = null;

    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uClouds: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: this.shared.uTime },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
  }

  setShadowSize(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  clear() {
    for (const child of [...this.root.children]) this.root.remove(child);
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    this.torches = [];
    this.door = null;
    this.water = null;
    this.chest = null;
  }

  /**
   * The textured standard materials of the kits, as toon ones (cached, so batching still
   * merges). Rocks get smoothed normals.
   */
  toonize(object, tint = null, smoothRocks = false) {
    object.traverse((o) => {
      if (!o.isMesh || !o.material.map) return;
      if (smoothRocks) {
        this.smoothCache ??= new Map();
        let smoothed = this.smoothCache.get(o.geometry);
        if (!smoothed) {
          smoothed = smoothedGeometry(o.geometry);
          this.smoothCache.set(o.geometry, smoothed);
        }
        o.geometry = smoothed;
      }
      const key = `${o.material.uuid}|${tint ?? ''}`;
      let toon = this.toonCache.get(key);
      if (!toon) {
        toon = patchRim(new THREE.MeshToonMaterial({ map: o.material.map, color: tint ?? 0xffffff, gradientMap: toonRamp() }));
        this.toonCache.set(key, toon);
      }
      o.material = toon;
    });
    return object;
  }

  /** Builds the landscape of `arena` in theme `themeId`; `seed` varies the details. */
  build(arena, themeId, seed = 1) {
    this.clear();
    const theme = LANDS[themeId] ?? LANDS.forest;
    this.theme = theme;
    this.arena = arena;
    let s = seed >>> 0;
    const random = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const scene = this.scene;
    scene.background = new THREE.Color(theme.sky);
    const sky = this.skyMaterial.uniforms;
    sky.uHorizon.value.setHex(theme.fog);
    sky.uTop.value.setHex(theme.skyTop ?? theme.sky);
    sky.uClouds.value.setHex(theme.clouds ?? 0xffffff);
    sky.uStars.value = theme.stars ? 1 : 0;
    scene.fog = new THREE.Fog(theme.fog, theme.fogRange[0], theme.fogRange[1]);
    scene.environmentIntensity = theme.env;
    this.hemi.color.setHex(theme.hemi[0]);
    this.hemi.groundColor.setHex(theme.hemi[1]);
    this.hemi.intensity = theme.hemiIntensity;
    this.sun.color.setHex(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    this.back.color.setHex(theme.back[0]);
    this.back.intensity = theme.back[1];
    setRim(theme.rim[0], theme.rim[1]);
    this.onTheme?.(theme);

    const W = arena.width;
    const H = arena.height;
    const halfW = arena.halfW;
    const halfH = arena.halfH;

    // Ponds: pit cells, blurred, carve the ground.
    const pondRes = 4;
    const pw = (W + 4) * pondRes;
    const ph = (H + 4) * pondRes;
    const pond = new Float32Array(pw * ph);
    const isPit = (c, r) => c >= 0 && r >= 0 && c < W && r < H && arena.cells[r * W + c] === CELL.PIT;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const wx = x / pondRes - 2 - halfW;
        const wz = y / pondRes - 2 - halfH;
        let sum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const c = Math.floor(wx + halfW + dx * 0.22);
            const r = Math.floor(wz + halfH + dy * 0.22);
            if (isPit(c, r)) sum++;
          }
        }
        pond[y * pw + x] = sum / 25;
      }
    }
    const pondAt = (x, z) => {
      const fx = (x + halfW + 2) * pondRes;
      const fz = (z + halfH + 2) * pondRes;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      if (ix < 0 || iz < 0 || ix >= pw - 1 || iz >= ph - 1) return 0;
      const tx = fx - ix;
      const tz = fz - iz;
      const a = pond[iz * pw + ix];
      const b = pond[iz * pw + ix + 1];
      const c = pond[(iz + 1) * pw + ix];
      const d = pond[(iz + 1) * pw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };

    // Ground height: flat play area, hills around (low in front of the camera), ponds.
    const hill = theme.hill;
    const heightAt = (x, z) => {
      const dx = Math.max(0, Math.abs(x) - (halfW + 0.35));
      const dTop = Math.max(0, -z - (halfH + 0.35));
      const dBottom = Math.max(0, z - (halfH + 0.35));
      const d = Math.hypot(dx, Math.max(dTop, dBottom));
      const front = dBottom > 0 && dBottom >= dTop ? 0.35 : 1;
      const rise = hill * front * smooth(0.1, 5.5, d) * (0.75 + 0.5 * fbm(x * 0.18 + 3, z * 0.18));
      const ripple = (fbm(x * 0.9, z * 0.9) - 0.5) * 0.05 * (1 - smooth(0, 1, d));
      return rise + ripple - 0.42 * smooth(0.3, 0.85, pondAt(x, z));
    };
    this.heightAt = heightAt;
    // Meadows: where the grass grows thick (the ground under it takes its colour).
    const meadow = (x, z) => smooth(0.36, 0.62, fbm(x * 0.3 + 11, z * 0.3 + 5));

    // Terrain: ~4 vertices per unit, vertex colours for grass, dirt, rock and sand.
    const TW = W + 30;
    const TH = H + 34;
    const terrainGeometry = new THREE.PlaneGeometry(TW, TH, Math.round(TW * 3.2), Math.round(TH * 3.2));
    terrainGeometry.rotateX(-Math.PI / 2);
    const pos = terrainGeometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(theme.ground[0]);
    const cB = new THREE.Color(theme.ground[1]);
    const cDirt = new THREE.Color(theme.dirt);
    const cRock = new THREE.Color(theme.rock);
    const cSand = new THREE.Color(theme.sand);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 2;
      const y = heightAt(x, z);
      pos.setXYZ(i, x, y, z);
      const n = fbm(x * 0.9 + 4, z * 0.9);
      col.copy(cB).lerp(cA, meadow(x, z) * 0.85 + (n - 0.5) * 0.3);
      // Worn path through the middle of the play area.
      const path = (1 - smooth(0.6, 1.6, Math.abs(x + Math.sin(z * 0.4) * 0.8))) * (Math.abs(z) < halfH + 0.5 ? 1 : 0);
      col.lerp(cDirt, path * 0.35 * smooth(0.35, 0.65, fbm(x * 1.3, z * 1.3)));
      const slope = Math.hypot(heightAt(x + 0.3, z) - y, heightAt(x, z + 0.3) - y) / 0.3;
      col.lerp(cRock, smooth(0.9, 1.6, slope) * 0.85);
      if (y < -0.02) col.lerp(cSand, smooth(-0.02, -0.12, y) * 0.8);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeometry.computeVertexNormals();
    const occlusion = occlusionTexture(arena, 6, 1, false);
    const court = theme.court ? { halfW: halfW - 1.1, halfH: halfH - 1.4, color: theme.court } : null;
    const terrainMaterial = patchFloor(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }), { style: theme.style, occlusion: occlusion.texture, bounds: occlusion.bounds, detail: 0.8, region: court, cracks: theme.cracks ?? null });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.receiveShadow = true;
    this.root.add(terrain);
    this.disposables.push(terrainGeometry, terrainMaterial, occlusion.texture);

    // Water over the ponds (a height texture tells the shader how deep it is).
    if (arena.cells.includes(CELL.PIT)) this.buildWater(arena, heightAt, theme);

    const place = ([name, width], x, z, rotation, scale = 1) => {
      if (name.startsWith('@')) return this.addProcedural(name, width * scale, x, heightAt(x, z) - 0.05, z, rotation, random, theme);
      const prop = this.toonize(this.assets.fitted(name, width * scale), theme.tint ?? null, /Rock|rubble/.test(name));
      prop.position.set(x, heightAt(x, z) - 0.03, z);
      prop.rotation.y = rotation;
      this.root.add(prop);
      return prop;
    };

    // Blocks: rocks, ruins or graves, one per cell.
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (arena.cells[r * W + c] !== CELL.BLOCK) continue;
        place(pick(theme.blocks), c - halfW + 0.5, r - halfH + 0.5, Math.floor(random() * 4) * (Math.PI / 2) + (random() - 0.5) * 0.5);
      }
    }
    // Bushes and stones along the edge of the play area.
    for (let i = 0; i < 26; i++) {
      const side = i % 3;
      let x;
      let z;
      if (side === 0) [x, z] = [-halfW - 0.35 - random() * 0.7, (random() - 0.5) * (H + 1)];
      else if (side === 1) [x, z] = [halfW + 0.35 + random() * 0.7, (random() - 0.5) * (H + 1)];
      else [x, z] = [(random() - 0.5) * (W + 1), -halfH - 0.5 - random() * 0.8];
      if (z < -halfH && Math.abs(x) < 1.6) continue;
      place(pick(theme.edge), x, z, random() * Math.PI * 2, 0.8 + random() * 0.5).userData.noShadow = true;
    }
    // Trees on the hills (none right under the camera).
    let planted = 0;
    for (let tries = 0; tries < theme.treeCount * 6 && planted < theme.treeCount; tries++) {
      const x = (random() - 0.5) * (TW - 4);
      const z = (random() - 0.5) * (TH - 6) - 3;
      const dx = Math.max(0, Math.abs(x) - (halfW + 1.1));
      const dz = Math.max(0, Math.abs(z) - (halfH + 1.1));
      if (dx === 0 && dz === 0) continue;
      if (z > halfH + 0.5 && Math.abs(x) < halfW + 3 && z < halfH + 7) continue;
      if (z < -halfH && Math.abs(x) < 2.2 && z > -halfH - 3) continue;
      const tree = place(pick(theme.trees), x, z, random() * Math.PI * 2, 0.8 + random() * 0.6);
      // Far trees: no shadow, no outline (like distant objects in anime backgrounds).
      tree.userData.noShadow = Math.hypot(dx, dz) > 3;
      tree.userData.noOutline = Math.hypot(dx, dz) > 5;
      planted++;
    }

    // Torches by the portal (dusk and night themes).
    if (theme.torch) {
      for (const x of [-2, 2]) {
        const z = -halfH - 0.2;
        const post = place(['torch_lit', 0.3], x, z, 0);
        post.userData.noShadow = true;
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.torch).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        flame.position.set(x, heightAt(x, z) + this.assets.fittedHeight('torch_lit', 0.3) * 0.95, z);
        this.root.add(flame);
        this.disposables.push(flame.geometry, flame.material);
        this.torches.push(flame);
      }
    }

    const door = this.buildPortal(theme, halfH, heightAt);
    this.mergeProcedural(theme);

    // Everything static merges into a few meshes, each with an outline copy.
    const skip = new Set([door, terrain]);
    if (this.water) skip.add(this.water);
    for (const flame of this.torches) skip.add(flame);
    const merged = batchStatic(this.root, skip);
    this.disposables.push(...merged);
    // The props' holders are empty once batched.
    for (const child of [...this.root.children]) if (!child.isMesh && !child.children.length) child.removeFromParent();
    for (const child of this.root.children) {
      if (child.isMesh && merged.includes(child.geometry) && !child.userData.noOutline) child.add(new THREE.Mesh(child.geometry, this.outline));
    }

    this.buildVegetation(arena, heightAt, meadow, theme, random, TW, TH);
    this.ambience.build(theme.ambience, halfW, halfH, this.effects);
  }

  /** A generated prop (crystals, pine, spire) `width` wide, merged later with the others. */
  addProcedural(name, width, x, y, z, rotation, random, theme) {
    const geometry = PROPS[name](random, theme);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const holder = new THREE.Object3D();
    holder.position.set(x, y, z);
    holder.rotation.y = rotation;
    holder.scale.setScalar(width / Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3));
    holder.userData.procedural = { geometry, glow: name === '@crystal' };
    this.root.add(holder);
    return holder;
  }

  /** Bakes the generated props into one mesh per look (glow, shadow, outline). */
  mergeProcedural(theme) {
    const groups = new Map();
    for (const holder of [...this.root.children]) {
      const info = holder.userData.procedural;
      if (!info) continue;
      holder.updateMatrix();
      const shadow = !holder.userData.noShadow;
      const outline = !holder.userData.noOutline;
      const key = `${info.glow}|${shadow}|${outline}`;
      if (!groups.has(key)) groups.set(key, { glow: info.glow, shadow, outline, parts: [] });
      groups.get(key).parts.push(info.geometry.applyMatrix4(holder.matrix));
      holder.removeFromParent();
    }
    this.propMaterials ??= new Map();
    for (const { glow, shadow, outline, parts } of groups.values()) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const amount = glow ? (theme.crystalGlow ?? 0.35) : 0;
      if (!this.propMaterials.has(amount)) this.propMaterials.set(amount, propMaterial(amount));
      const mesh = new THREE.Mesh(geometry, this.propMaterials.get(amount));
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      if (outline) mesh.add(new THREE.Mesh(geometry, this.outline));
      this.root.add(mesh);
      this.disposables.push(geometry);
    }
  }

  buildWater(arena, heightAt, theme) {
    const res = 6;
    const w = (arena.width + 2) * res;
    const h = (arena.height + 2) * res;
    const x0 = -arena.halfW - 1;
    const z0 = -arena.halfH - 1;
    const range = [-0.5, 0.2];
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gh = heightAt(x0 + (x + 0.5) / res, z0 + (y + 0.5) / res);
        data[y * w + x] = Math.round(Math.min(1, Math.max(0, (gh - range[0]) / (range[1] - range[0]))) * 255);
      }
    }
    const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(arena.width + 2, arena.height + 2);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.shared.uTime,
        uDeep: { value: new THREE.Color(theme.water.deep) },
        uShallow: { value: new THREE.Color(theme.water.shallow) },
        uFoam: { value: new THREE.Color(theme.water.foam) },
        uHeight: { value: texture },
        uBounds: { value: new THREE.Vector4(x0, z0, arena.width + 2, arena.height + 2) },
        uRange: { value: new THREE.Vector2(range[0], range[1]) },
        uLevel: { value: -0.12 },
        uGlow: { value: theme.water.glow ?? 0 },
        uFlow: { value: theme.water.lava ? 0.35 : theme.water.calm ? 0.15 : 1 },
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const water = new THREE.Mesh(geometry, material);
    water.position.y = -0.12;
    water.renderOrder = 3;
    this.root.add(water);
    this.water = water;
    this.disposables.push(geometry, material, texture);
  }

  /** A stone arch with a swirling portal: dim while the room is fought, bright once open. */
  buildPortal(theme, halfH, heightAt) {
    const group = new THREE.Group();
    const z = -halfH - 0.45;
    group.position.set(0, heightAt(0, z), z);
    const stone = patchRim(new THREE.MeshToonMaterial({ color: theme.stone, gradientMap: toonRamp() }));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 10, 28, Math.PI), stone);
    arch.position.y = 1.1;
    const pillars = [-1.05, 1.05].map((x) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 1.15, 10), stone);
      p.position.set(x, 0.55, 0);
      return p;
    });
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: this.shared.uTime, uOpen: { value: 0 }, uColor: { value: new THREE.Color(theme.portal) } },
      vertexShader: SIMPLE_VERTEX,
      fragmentShader: PORTAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), glowMaterial);
    disc.position.y = 1.0;
    disc.scale.y = 1.1;
    disc.renderOrder = 4;
    group.add(arch, ...pillars, disc);
    for (const m of [arch, ...pillars]) {
      m.castShadow = true;
      m.add(new THREE.Mesh(m.geometry, this.outline));
    }
    this.root.add(group);
    this.disposables.push(stone, glowMaterial, arch.geometry, pillars[0].geometry, disc.geometry);
    this.door = { mesh: group, glow: glowMaterial, open: 0, target: 0 };
    return group;
  }

  /** Grass tufts and flowers as instanced meshes (one draw call each). */
  buildVegetation(arena, heightAt, meadow, theme, random, TW, TH) {
    const scale = Math.max(0.3, this.grass);
    const grassCount = Math.round(6000 * theme.grassDensity * scale);
    const flowerCount = Math.round(420 * theme.flowerDensity * scale);
    if (!grassCount) return;
    const blocked = (x, z) => {
      const c = Math.floor(x + arena.halfW);
      const r = Math.floor(z + arena.halfH);
      if (c < 0 || r < 0 || c >= arena.width || r >= arena.height) return false;
      return arena.cells[r * arena.width + c] !== CELL.FLOOR;
    };
    const inside = (x, z) => Math.abs(x) < arena.halfW && Math.abs(z) < arena.halfH;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    // Denser near the play area, sparse far away; thick in meadows, a few tufts elsewhere.
    const grassSpot = () => {
      for (let k = 0; k < 10; k++) {
        const far = random() < 0.3;
        const x = (random() - 0.5) * (far ? TW - 6 : arena.width + 6);
        const z = (random() - 0.5) * (far ? TH - 8 : arena.height + 6) - (far ? 3 : 0);
        if (random() > (0.12 + 0.88 * meadow(x, z)) * (theme.court && inside(x, z) ? 0.3 : 1)) continue;
        const y = heightAt(x, z);
        if (y < -0.08 || blocked(x, z)) continue;
        return [x, y, z];
      }
      return null;
    };
    // Flowers grow in little clusters, on the meadows' edges.
    let cluster = null;
    let left = 0;
    const flowerSpot = () => {
      for (let k = 0; k < 10; k++) {
        if (!left) {
          cluster = [(random() - 0.5) * (arena.width + 8), (random() - 0.5) * (arena.height + 8)];
          left = 4 + Math.floor(random() * 6);
        }
        left--;
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 0.55;
        const x = cluster[0] + Math.cos(a) * r;
        const z = cluster[1] + Math.sin(a) * r;
        const y = heightAt(x, z);
        if (y < -0.08 || blocked(x, z)) continue;
        return [x, y, z];
      }
      return null;
    };
    const make = (geometry, count, material, spot, sizeOf, colorOf) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      let n = 0;
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const p = spot();
        if (!p) continue;
        q.setFromAxisAngle(up, random() * Math.PI * 2);
        const size = sizeOf(p);
        m.compose(v.set(p[0], p[1] - 0.01, p[2]), q, sc.set(size, size, size));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, colorOf(color));
        n++;
      }
      mesh.count = n;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    const grassUniforms = { ...this.shared, uBase: { value: new THREE.Color(theme.grass[0]) }, uTip: { value: new THREE.Color(theme.grass[1]) } };
    const grassMaterial = vegetationMaterial(grassUniforms, false);
    const [gMin, gMax] = theme.grassHeight;
    // Shorter in the play area, so the fight stays readable.
    const grassSize = ([x, , z]) => (gMin + random() * (gMax - gMin)) * (inside(x, z) ? 0.75 : 1) * (0.8 + meadow(x, z) * 0.35);
    make(this.grassGeometry, grassCount, grassMaterial, grassSpot, grassSize, (c) => c.setHSL(0, 0, 0.86 + random() * 0.28));
    this.disposables.push(grassMaterial);
    if (flowerCount) {
      const flowerUniforms = { ...this.shared, uBase: { value: new THREE.Color(theme.grass[0]) }, uTip: { value: new THREE.Color(0xffffff) } };
      const flowerMaterial = vegetationMaterial(flowerUniforms, true);
      make(this.flowerGeometry, flowerCount, flowerMaterial, flowerSpot, () => 0.85 + random() * 0.45, (c) => c.setHex(theme.flowers[Math.floor(random() * theme.flowers.length)]));
      this.disposables.push(flowerMaterial);
    }
  }

  /** The treasure chest of a treasure room (a golden chest with a glow under it). */
  addChest(x, z) {
    const chest = this.toonize(this.assets.fitted('chest_gold', 0.95));
    chest.position.set(x, this.heightAt?.(x, z) ?? 0, z);
    chest.rotation.y = 0.35;
    chest.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: 0xffc84a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    chest.add(glow);
    this.root.add(chest);
    this.disposables.push(glow.geometry, glow.material);
    this.chest = chest;
  }

  openChest() {
    this.chest?.removeFromParent();
    this.chest = null;
  }

  openDoor(open) {
    if (this.door) this.door.target = open ? 1 : 0;
  }

  /** `hero` (x, z) bends the grass around it. */
  update(dt, hero = null) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    if (hero) this.shared.uPush.value.set(hero.x, hero.z, 0.9);
    this.ambience.update(dt);
    for (let i = 0; i < this.torches.length; i++) {
      const s = 1 + Math.sin(this.time * 9 + i * 1.7) * 0.12 + Math.sin(this.time * 23 + i) * 0.06;
      this.torches[i].scale.set(s, s * 1.3, s);
    }
    const door = this.door;
    if (door) {
      door.open += (door.target - door.open) * Math.min(1, dt * 3);
      door.glow.uniforms.uOpen.value = door.open;
    }
    // The chest bobs and glows.
    if (this.chest) {
      const k = Math.sin(this.time * 3);
      this.chest.children[0].position.y = 0.04 * k;
      this.chest.children.at(-1).material.opacity = 0.28 + 0.12 * k;
    }
  }
}
