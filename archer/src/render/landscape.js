import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL } from '../sim/arena.js';
import { batchStatic } from './batch.js';
import { Ambience } from './ambience.js';
import { FLOOR_STYLE, WORLD, injectWorldLight, occlusionTexture, patchFloor, patchRim, rigidOutlineMaterial, setRim, setWorldLight, toonRamp } from './surfaces.js';

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

/** A round-crowned tree: a leaning trunk under clustered puffs (blossom, autumn, jungle). */
function blossomTree(random, [dark, light], trunk = 0x6a4a3a) {
  const parts = [];
  const h = 0.75 + random() * 0.35;
  const lean = (random() - 0.5) * 0.25;
  parts.push(paint(plain(new THREE.CylinderGeometry(0.05, 0.1, h, 7).translate(0, h / 2, 0).rotateZ(lean)), trunk, trunk));
  const top = h * 0.95;
  const cx = -Math.sin(lean) * top;
  const puffs = 5 + Math.floor(random() * 4);
  for (let i = 0; i < puffs; i++) {
    const r = 0.22 + random() * 0.16;
    const a = random() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.18 + random() * 0.2;
    const y = top + (i === 0 ? 0.12 : (random() - 0.3) * 0.3);
    const puff = new THREE.IcosahedronGeometry(r, 1).translate(cx + Math.cos(a) * d, y, Math.sin(a) * d);
    const g = plain(puff);
    g.computeVertexNormals();
    parts.push(paint(g, dark, light, y - r, y + r));
  }
  return mergeGeometries(parts);
}

/** A palm: a curved segmented trunk and drooping fronds. */
function palmTree(random, [dark, light]) {
  const parts = [];
  const segments = 6;
  const bend = 0.18 + random() * 0.2;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segments; i++) {
    const seg = new THREE.CylinderGeometry(0.045, 0.06, 0.2, 7).translate(0, 0.1, 0).rotateZ(-bend * (i / segments)).translate(x, y, 0);
    parts.push(paint(plain(seg), 0x8a6a48, 0xa88a5a, y, y + 0.2));
    x += Math.sin(bend * (i / segments)) * 0.2;
    y += Math.cos(bend * (i / segments)) * 0.19;
  }
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + random() * 0.3;
    const leaf = new THREE.ConeGeometry(0.09, 0.62, 4).rotateZ(Math.PI / 2).scale(1, 0.25, 1).translate(0.31, 0, 0);
    leaf.rotateZ(-0.45 - random() * 0.25);
    leaf.rotateY(a);
    leaf.translate(x, y, 0);
    parts.push(paint(plain(leaf), dark, light, y - 0.3, y + 0.05));
  }
  return mergeGeometries(parts);
}

/** A saguaro cactus with one or two arms. */
function cactus(random, [dark, light]) {
  const parts = [];
  const h = 0.7 + random() * 0.4;
  parts.push(new THREE.CapsuleGeometry(0.11, h, 4, 8).translate(0, h / 2 + 0.11, 0));
  const arms = 1 + (random() < 0.6 ? 1 : 0);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1;
    const y = h * (0.35 + random() * 0.25);
    parts.push(new THREE.CapsuleGeometry(0.07, 0.18, 4, 6).rotateZ(Math.PI / 2).translate(side * 0.17, y, 0));
    parts.push(new THREE.CapsuleGeometry(0.07, 0.22 + random() * 0.15, 4, 6).translate(side * 0.27, y + 0.16, 0));
  }
  const out = mergeGeometries(parts.map((g) => plain(g)));
  out.computeVertexNormals();
  return paint(out, dark, light, 0, h + 0.3);
}

/** Branching coral (a few bent, tapering fingers). */
function coral(random, [dark, light]) {
  const parts = [];
  const fingers = 4 + Math.floor(random() * 4);
  for (let i = 0; i < fingers; i++) {
    const h = 0.35 + random() * 0.55;
    const g = new THREE.CylinderGeometry(0.025, 0.07, h, 6).translate(0, h / 2, 0);
    g.rotateZ((random() - 0.5) * 0.9);
    g.rotateY(random() * Math.PI * 2);
    g.translate((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3);
    const tip = new THREE.SphereGeometry(0.05, 6, 4).translate(0, h, 0);
    parts.push(paint(plain(g), dark, light, 0, h), paint(plain(tip), light, light));
  }
  return mergeGeometries(parts);
}

/** A giant mushroom: a stem and a wide dome cap with a lighter rim. */
function mushroom(random, [dark, light]) {
  const h = 0.5 + random() * 0.5;
  const r = 0.3 + random() * 0.2;
  const stem = paint(plain(new THREE.CylinderGeometry(0.07, 0.1, h, 8).translate(0, h / 2, 0)), 0xe8dcc8, 0xfff4e0, 0, h);
  const capGeometry = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, h - 0.02, 0);
  const cap = paint(plain(capGeometry), light, dark, h, h + r * 0.6);
  return mergeGeometries([stem, cap]);
}

/**
 * The meshes of a Blender prop as plain geometries (float position, normal, colour, in the
 * prop's space) merged into its body and its glowing parts, and its footprint.
 */
function blenderParts(model) {
  model.updateMatrixWorld(true);
  const body = [];
  const glow = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const count = src.attributes.position.count;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      position.set([src.attributes.position.getX(i), src.attributes.position.getY(i), src.attributes.position.getZ(i)], i * 3);
      normal.set([src.attributes.normal.getX(i), src.attributes.normal.getY(i), src.attributes.normal.getZ(i)], i * 3);
      const c = src.attributes.color;
      color.set(c ? [c.getX(i), c.getY(i), c.getZ(i)] : [1, 1, 1], i * 3);
    }
    if (src !== o.geometry) src.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.applyMatrix4(o.matrixWorld);
    (/glow/.test(o.material.name) ? glow : body).push(g);
  });
  const parts = [body, glow].filter((list) => list.length).map((list, i) => ({ geometry: mergeGeometries(list), glow: i === 1 || !body.length }));
  const box = new THREE.Box3();
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  }
  return { parts, footprint: Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3) };
}

const PROPS = {
  '@crystal': (random, theme) => crystalCluster(random, theme.crystal),
  '@blossom': (random, theme) => blossomTree(random, theme.blossom, theme.trunk),
  '@palm': (random, theme) => palmTree(random, theme.palm ?? [0x2f7a3a, 0x7ad05a]),
  '@cactus': (random, theme) => cactus(random, theme.cactus ?? [0x3a7a4a, 0x7ab86a]),
  '@coral': (random, theme) => coral(random, theme.coral),
  '@mushroom': (random, theme) => mushroom(random, theme.mushroom),
  '@pine': (random, theme) => pineTree(random, { snow: Boolean(theme.snow), colors: theme.pine }),
  '@spire': (random, theme) => spire(random, theme.spire),
};

/**
 * Leaves sway in the wind (the higher, the more), and can take the theme's colour
 * (their painted shading kept): autumn reds, cherry pink, golden or violet crowns.
 */
function patchFoliage(material, time, recolor) {
  const tint = recolor != null ? new THREE.Color(recolor) : null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFoliageTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFoliageTime;\nvarying vec3 vFolWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec4 fw = modelMatrix * vec4(transformed, 1.0);
    float k = max(0.0, fw.y - 0.4);
    transformed.x += sin(uFoliageTime * 1.4 + fw.x * 0.5 + fw.z * 0.3) * 0.035 * k;
    transformed.z += cos(uFoliageTime * 1.1 + fw.x * 0.4) * 0.025 * k;
    vFolWorld = fw.xyz;
  }`);
    injectWorldLight(shader, 'vFolWorld.xz');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFolWorld;');
    if (tint) {
      shader.uniforms.uLeafTint = { value: tint };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uLeafTint;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = uLeafTint * (0.35 + l * 1.9);
  }`);
    }
  };
  material.onBeforeCompile.rim = true;
  material.customProgramCacheKey = () => `foliage-${tint ? 'tint' : 'plain'}`;
  material.needsUpdate = true;
  return material;
}

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
    grade: { shadows: 0x2a4a78, highlights: 0xffe0b8, tone: 0.07, saturation: 1.04 },
    ground: [0x4a8c3a, 0x70a848], dirt: 0xb89a5c, rock: 0x86908e, sand: 0xe4d49c, style: FLOOR_STYLE.grass,
    hill: 3.2, grass: [0x2f7a2a, 0xb2e864], grassHeight: [0.2, 0.38], grassDensity: 1,
    flowers: [0xfff09a, 0xff9ec8, 0xffffff, 0xb9a4ff, 0xffb070], flowerDensity: 1,
    water: { deep: 0x1f6fb0, shallow: 0x62dbe4, foam: 0xf4ffff },
    blocks: [['n_Rock_Medium_1', 0.95], ['n_Rock_Medium_2', 0.95], ['n_Rock_Medium_3', 0.9], ['n_Bush_Common_Flowers', 0.95], ['Rock_3_A', 0.95]],
    edge: [['n_Bush_Common', 0.9], ['n_Bush_Common_Flowers', 0.8], ['n_Fern_1', 0.7], ['n_Plant_7_Big', 0.7], ['n_Flower_3_Group', 0.6], ['n_Mushroom_Common', 0.35], ['n_Rock_Medium_2', 0.55]],
    trees: [['n_CommonTree_1', 2], ['n_CommonTree_2', 2.1], ['n_CommonTree_3', 1.8], ['n_CommonTree_4', 2], ['n_CommonTree_5', 2.1], ['n_Pine_2', 1.7], ['Tree_1_A', 2.3], ['n_Bush_Common', 1.4]],
    treeCount: 56, stone: 0xb8b2a4, portal: 0x8ff8d8, ambience: 'forest',
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
    edge: [['rubble_half', 1.2], ['Rock_1_A', 0.6], ['column', 0.6], ['Bush_1_C', 0.8], ['Bush_1_E', 0.6], ['n_Fern_1', 0.6], ['n_Plant_7_Big', 0.6]],
    trees: [['Tree_Bare_1_A', 2], ['Tree_1_B', 2.3], ['Tree_4_A', 1.9], ['pillar_decorated', 1.6], ['pillar', 1.4], ['Tree_3_A', 2.4], ['column', 1.3], ['n_CommonTree_2', 2], ['n_CommonTree_4', 1.9], ['n_TwistedTree_1', 2.2]],
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
    edge: [['gravemarker_A', 0.5], ['skull_candle', 0.45], ['pumpkin_yellow', 0.5], ['Rock_1_A', 0.5], ['ribcage', 0.5], ['n_Mushroom_Common', 0.35], ['n_Fern_1', 0.55]],
    trees: [['tree_dead_large', 2], ['tree_dead_medium', 1.7], ['Tree_Bare_1_A', 1.9], ['Tree_Bare_2_A', 1.7], ['tree_pine_orange_large', 2.4], ['crypt', 2.6], ['n_DeadTree_1', 2.2], ['n_DeadTree_2', 2], ['n_DeadTree_3', 2.3], ['n_TwistedTree_2', 2.2]],
    treeCount: 50, stone: 0x8a9aa8, portal: 0x7affc8, torch: 0x9fffd0, ambience: 'graveyard', leaves: 0x3a7a6a, natureTint: 0x9aa8b8,
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
    edge: [['Rock_1_A', 0.55], ['@pine', 0.6], ['Rock_3_E', 0.6], ['n_Rock_Medium_1', 0.55]],
    trees: [['@pine', 1.5], ['@pine', 1.8], ['@pine', 1.3], ['Rock_2_A', 1.8], ['Tree_Bare_1_A', 1.8], ['n_Pine_1', 1.7], ['n_Pine_2', 1.7], ['n_Pine_3', 1.8], ['n_Pine_4', 1.6], ['n_Pine_5', 1.8]],
    tint: 0xdce8f4, treeCount: 64, stone: 0xc8d4e0, portal: 0x9fe8ff, ambience: 'tundra', leaves: 0x3e7068, natureTint: 0xdce8f4, light: { dapple: 0.12 },
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
    edge: [['Bush_1_C', 0.8], ['Rock_1_A', 0.5], ['Bush_1_E', 0.6], ['tree_dead_medium', 0.6], ['n_Fern_1', 0.7], ['n_Plant_1_Big', 0.7], ['n_Mushroom_Laetiporus', 0.4], ['n_Mushroom_Common', 0.35]],
    trees: [['tree_dead_large', 2.1], ['tree_dead_medium', 1.8], ['Tree_Bare_1_A', 2], ['Tree_Bare_2_A', 1.8], ['Tree_4_A', 2], ['Tree_Bare_1_B', 2], ['n_TwistedTree_3', 2.2], ['n_TwistedTree_4', 2], ['n_DeadTree_4', 2], ['n_TwistedTree_5', 2.1]],
    treeCount: 48, stone: 0x8a9a80, portal: 0xb8ff8a, ambience: 'swamp', leaves: 0x5a8a3a,
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
    trees: [['@spire', 1.4], ['@spire', 1.8], ['Rock_2_A', 2.2], ['tree_dead_large', 1.8], ['Rock_3_E', 1.8], ['n_DeadTree_1', 2], ['n_DeadTree_5', 2.2]],
    tint: 0x6a5a58, treeCount: 50, stone: 0x5a4a4a, portal: 0xff8a3a, torch: 0xff7a2a, ambience: 'volcano', natureTint: 0x5a4848, light: { dapple: 0, clouds: 0.22 },
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
    trees: [['pillar_decorated', 1.6], ['pillar', 1.4], ['@spire', 1.6], ['@spire', 2], ['Tree_Bare_1_A', 1.9], ['column', 1.3], ['n_DeadTree_2', 2], ['n_DeadTree_3', 2.1]],
    tint: 0x9a90b8, treeCount: 55, stone: 0x6e6886, portal: 0xc86aff, torch: 0xc86aff, ambience: 'citadel', natureTint: 0x7a6a98,
  },
  // Golden dunes under a hazy sun: sandstone court, cacti, palms around an oasis.
  desert: {
    sky: 0xf4dcae, skyTop: 0x5aa0e0, fog: 0xe8c898, fogRange: [26, 62], clouds: 0xfff4e0,
    sun: 0xfff0d0, sunIntensity: 2.9, hemi: [0xfff0d8, 0xa07a48], hemiIntensity: 1.1, back: [0xffc890, 0.9], rim: [0xfff0c8, 0.55], env: 0.14,
    grade: { shadows: 0x5a3a4a, highlights: 0xffe8c0, tone: 0.07, saturation: 1.02 },
    ground: [0xc89a60, 0xe4c690], dirt: 0xc8985a, rock: 0xb07a4a, sand: 0xf4dca8, style: FLOOR_STYLE.grass, court: 0xd8b888,
    hill: 3.6, grass: [0x9a8a4a, 0xe0d08a], grassHeight: [0.14, 0.26], grassDensity: 0.15,
    flowers: [0xff8a5a, 0xffe07a], flowerDensity: 0.08,
    water: { deep: 0x1a7ab0, shallow: 0x5ae0d8, foam: 0xf4ffff },
    cactus: [0x3a7a4a, 0x8ac06a], palm: [0x2f7a3a, 0x8ad05a], spire: [0x9a5a3a, 0xe0a870],
    blocks: [['Rock_3_A', 0.95], ['Rock_3_C', 0.9], ['@cactus', 0.8], ['@spire', 0.8], ['pillar', 0.85], ['n_Rock_Medium_1', 0.95], ['n_Rock_Medium_3', 0.9]],
    edge: [['Rock_1_A', 0.55], ['@cactus', 0.55], ['Rock_3_E', 0.6], ['n_Rock_Medium_2', 0.6]],
    trees: [['@palm', 1.8], ['@palm', 2.2], ['@cactus', 1.3], ['@spire', 2], ['Rock_2_A', 2.2], ['n_DeadTree_4', 1.9]],
    tint: 0xf0d8b0, treeCount: 45, stone: 0xe0c8a0, portal: 0xffd070, torch: 0xffb050, ambience: 'desert', natureTint: 0xf0d0a0, light: { dapple: 0, clouds: 0.35 },
  },
  // A spring garden: cherry trees in bloom, a stone path, falling petals.
  sakura: {
    sky: 0xfde4ec, skyTop: 0x7ab0f0, fog: 0xf0d4e0, fogRange: [24, 60], clouds: 0xffffff,
    sun: 0xfff4ea, sunIntensity: 2.6, hemi: [0xffe8f4, 0x6a8a58], hemiIntensity: 1.15, back: [0xffc0e0, 0.9], rim: [0xfff0f8, 0.55], env: 0.15,
    grade: { shadows: 0x5a3a6a, highlights: 0xffe0f0, tone: 0.08, saturation: 1.04 },
    ground: [0x5a9448, 0x86b45e], dirt: 0xc8a888, rock: 0x98969c, sand: 0xe8d8c8, style: FLOOR_STYLE.grass, court: 0xb8b4b0,
    hill: 3.2, grass: [0x3a7a3a, 0xc8f080], grassHeight: [0.16, 0.3], grassDensity: 0.9,
    flowers: [0xffb0d0, 0xffffff, 0xff8ab8, 0xffe0f0], flowerDensity: 1.2,
    water: { deep: 0x2a70a8, shallow: 0x7ae0e8, foam: 0xffffff, calm: true },
    blossom: [0xe87aa8, 0xffd4e8], trunk: 0x5a3a3a,
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['@blossom', 0.9], ['shrine_candles', 0.7], ['pillar', 0.85]],
    edge: [['Bush_1_C', 0.8], ['Rock_1_A', 0.5], ['@blossom', 0.6], ['Bush_1_E', 0.6], ['n_Bush_Common', 0.8], ['n_Flower_4_Group', 0.6], ['n_Fern_1', 0.55]],
    trees: [['@blossom', 2.2], ['@blossom', 2.6], ['@blossom', 1.8], ['Tree_1_A', 2.3], ['Rock_2_A', 2], ['n_CommonTree_1', 2], ['n_CommonTree_3', 1.8], ['n_CommonTree_5', 2]],
    treeCount: 58, stone: 0xd8ccd4, portal: 0xffa8d8, ambience: 'sakura', leaves: 0xff9ac8, flecks: [0xffb0d0, 0xfff0f6], fleckAmount: 2.2,
  },
  // Autumn woods at golden hour: red and orange crowns, leaves drifting down.
  autumn: {
    sky: 0xffd8a8, skyTop: 0x6a8ad8, fog: 0xe8b890, fogRange: [22, 58], clouds: 0xfff0d8,
    sun: 0xffd8a0, sunIntensity: 2.8, hemi: [0xffe0c0, 0x6a4a2a], hemiIntensity: 1.05, back: [0xffa860, 1.1], rim: [0xffd8a0, 0.6], env: 0.13,
    grade: { shadows: 0x4a2a4a, highlights: 0xffc890, tone: 0.08, saturation: 1.04 },
    ground: [0x6a7a38, 0x8e9650], dirt: 0x7a5a3a, rock: 0x8a7a6a, sand: 0xc8b088, style: FLOOR_STYLE.grass, court: 0x9a9084,
    hill: 3.4, grass: [0x4a5a24, 0xd8b050], grassHeight: [0.18, 0.34], grassDensity: 0.85,
    flowers: [0xff8a3a, 0xffd050, 0xd84a3a], flowerDensity: 0.6,
    water: { deep: 0x2a5a78, shallow: 0x6ab0b8, foam: 0xfff0e0 },
    blossom: [0xc83a1a, 0xffa830], trunk: 0x4a3024,
    blocks: [['Rock_3_A', 0.95], ['Rock_3_C', 0.9], ['@blossom', 0.9], ['barrel_large', 0.7], ['crates_stacked', 0.8]],
    edge: [['Bush_1_C', 0.8], ['Rock_1_A', 0.55], ['pumpkin_orange_jackolantern', 0.5], ['Bush_1_A', 0.7], ['n_Bush_Common', 0.8], ['n_Mushroom_Laetiporus', 0.4], ['n_Fern_1', 0.6]],
    trees: [['@blossom', 2.4], ['tree_pine_orange_large', 2.4], ['tree_pine_yellow_large', 2.4], ['@blossom', 2], ['tree_pine_orange_medium', 2], ['Tree_Bare_1_A', 2], ['n_CommonTree_1', 2], ['n_CommonTree_2', 2.1], ['n_CommonTree_4', 2], ['n_TwistedTree_1', 2.2]],
    treeCount: 56, stone: 0xc8a888, portal: 0xffb050, torch: 0xffa040, ambience: 'autumn', leaves: 0xe8682a, flecks: [0xd8501a, 0xffa830], fleckAmount: 2.4,
  },
  // Coral abyss: a sunken reef in blue-green light, glowing corals, rising bubbles.
  abyss: {
    sky: 0x2a8a9a, skyTop: 0x0a2a4a, fog: 0x1a6a7a, fogRange: [16, 46], clouds: 0x4ab0c0,
    sun: 0xc8fff4, sunIntensity: 2.2, hemi: [0x9af0ff, 0x1a3a4a], hemiIntensity: 1.1, back: [0x4affe0, 1.3], rim: [0x9afff0, 0.65], env: 0.12,
    grade: { shadows: 0x0a3a5a, highlights: 0xc8fff0, tone: 0.12, saturation: 1.1 },
    ground: [0x4a8a8a, 0x7ab0a0], dirt: 0x8a9a88, rock: 0x4a6a78, sand: 0xc8d0b0, style: FLOOR_STYLE.grass,
    hill: 3.4, grass: [0x1a5a5a, 0x6ad8b8], grassHeight: [0.24, 0.5], grassDensity: 0.6,
    flowers: [0xff8ab8, 0xffb070, 0x9af0ff], flowerDensity: 0.5,
    water: { deep: 0x0a2a6a, shallow: 0x3ae0f0, foam: 0xd0ffff, glow: 1.4 },
    coral: [0xd83a6a, 0xffa0c0], crystal: [0x1a6a9a, 0x9ffff0], glowProps: ['@coral'], crystalGlow: 0.5,
    blocks: [['@coral', 0.95], ['@crystal', 0.9], ['Rock_3_A', 0.95], ['Rock_3_C', 0.9]],
    edge: [['@coral', 0.6], ['Rock_1_A', 0.5], ['@crystal', 0.5]],
    trees: [['@coral', 1.8], ['@coral', 2.2], ['@crystal', 1.8], ['Rock_2_A', 2.2], ['Rock_3_E', 1.8]],
    tint: 0xa8d8e0, treeCount: 60, stone: 0x6aa8b0, portal: 0x6affe8, torch: 0x6affe8, ambience: 'abyss', light: { clouds: 0.9, caustics: true },
  },
  // Sky islands: bright heights above a sea of clouds, white blossoms, sunbeams.
  sky: {
    sky: 0xe4f4ff, skyTop: 0x3a8ae8, fog: 0xd8ecff, fogRange: [26, 66], clouds: 0xffffff,
    sun: 0xfffaf0, sunIntensity: 2.8, hemi: [0xf0f8ff, 0x7aa8c8], hemiIntensity: 1.05, back: [0xb8e0ff, 1], rim: [0xffffff, 0.55], env: 0.16,
    grade: { shadows: 0x3a5a9a, highlights: 0xfff4e0, tone: 0.07, saturation: 1.1 },
    ground: [0x7ac86a, 0xb0e088], dirt: 0xd8c8a0, rock: 0xc8ccd8, sand: 0xf0ecd8, style: FLOOR_STYLE.grass, court: 0xbcc0cc,
    hill: 2.4, grass: [0x4a9a5a, 0xe0ffb0], grassHeight: [0.16, 0.3], grassDensity: 0.9,
    flowers: [0xffffff, 0xfff09a, 0xb0d8ff], flowerDensity: 1,
    water: { deep: 0x3a8ad8, shallow: 0xa8f0ff, foam: 0xffffff, glow: 0.3 },
    blossom: [0xd8e8f8, 0xffffff], trunk: 0x7a6a5a,
    blocks: [['column', 0.75], ['pillar_decorated', 0.85], ['Rock_3_A', 0.95], ['@blossom', 0.9]],
    edge: [['%cloud', 1.1], ['Rock_1_A', 0.5], ['column', 0.55], ['n_Bush_Common_Flowers', 0.8], ['%cloud', 0.8], ['n_Flower_3_Group', 0.6]],
    trees: [['@blossom', 2.2], ['%floating_isle', 1.8], ['%cloud', 2.4], ['pillar_decorated', 1.6], ['%floating_isle', 2.3], ['Tree_1_B', 2.3], ['n_CommonTree_3', 1.9], ['%cloud', 3]],
    treeCount: 50, stone: 0xf0f0f8, portal: 0xa8f0ff, ambience: 'sky', leaves: 0x8ad06a, light: { clouds: 0.5 },
  },
  // Emerald jungle: humid and dense, palms, giant glowing mushrooms, fireflies, mist.
  jungle: {
    sky: 0xc8e8b8, skyTop: 0x3a8a7a, fog: 0x8ab890, fogRange: [16, 44], clouds: 0xe8f8e0,
    sun: 0xfff8d0, sunIntensity: 2.5, hemi: [0xd8ffd0, 0x2a4a2a], hemiIntensity: 1.1, back: [0x9aff9a, 1.1], rim: [0xd8ffb8, 0.55], env: 0.13,
    grade: { shadows: 0x1a4a3a, highlights: 0xf0ffb0, tone: 0.1, saturation: 1.18 },
    ground: [0x3a8a3a, 0x5aaa48], dirt: 0x6a5a38, rock: 0x5a7060, sand: 0x9a8a60, style: FLOOR_STYLE.grass,
    hill: 3.6, grass: [0x1a5a2a, 0x9ae05a], grassHeight: [0.3, 0.58], grassDensity: 1.2,
    flowers: [0xff5a8a, 0xffd03a, 0xb870ff, 0xff8a3a], flowerDensity: 0.9,
    water: { deep: 0x1a5a4a, shallow: 0x5ac8a0, foam: 0xe0ffe0 },
    palm: [0x1f6a2a, 0x6ad04a], mushroom: [0xb03a8a, 0xff8ad8], glowProps: ['@mushroom'], crystalGlow: 0.45,
    blocks: [['Bush_4_A', 0.95], ['Rock_3_A', 0.9], ['@mushroom', 0.85], ['Bush_1_G', 0.9]],
    edge: [['Bush_1_C', 0.9], ['Bush_4_A', 0.7], ['@mushroom', 0.5], ['Bush_1_E', 0.7], ['n_Fern_1', 0.8], ['n_Plant_1_Big', 0.9], ['n_Plant_7_Big', 0.8], ['n_Mushroom_Common', 0.4]],
    trees: [['@palm', 2.2], ['@palm', 2.6], ['Tree_2_A', 2.4], ['@mushroom', 1.6], ['Tree_1_C', 2.4], ['Tree_3_A', 2.6], ['n_CommonTree_2', 2.2], ['n_TwistedTree_3', 2.4], ['n_CommonTree_4', 2.2], ['n_TwistedTree_5', 2.3]],
    treeCount: 64, stone: 0x8aa890, portal: 0x8aff9a, ambience: 'jungle', leaves: 0x2e8a3a, light: { clouds: 0.5 },
  },
  // Storm peaks: slate crags under a black sky, driving rain, flashes of light.
  storm: {
    sky: 0x5a6a88, skyTop: 0x141c30, fog: 0x3a4658, fogRange: [16, 46], clouds: 0x4a5670,
    sun: 0xd0e0ff, sunIntensity: 2.3, hemi: [0xb0c8ff, 0x22283a], hemiIntensity: 1.0, back: [0x8ab8ff, 1.4], rim: [0xc8e0ff, 0.7], env: 0.12,
    grade: { shadows: 0x1a2a5a, highlights: 0xd8e8ff, tone: 0.12, saturation: 0.98 },
    ground: [0x4a5a58, 0x6a7a70], dirt: 0x5a5a58, rock: 0x4a5060, sand: 0x7a8088, style: FLOOR_STYLE.grass,
    hill: 4.0, grass: [0x2a3a3a, 0x8aa8a0], grassHeight: [0.16, 0.3], grassDensity: 0.55,
    flowers: [0xa8c8ff, 0xffffff], flowerDensity: 0.15,
    water: { deep: 0x1a2a4a, shallow: 0x5a80a8, foam: 0xd8e8ff, glow: 0.2 },
    spire: [0x2a2e3a, 0x6a7488], pine: [0x1a3a34, 0x3a5a50],
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['@spire', 0.85], ['@pine', 0.9]],
    edge: [['Rock_1_A', 0.6], ['Rock_3_E', 0.6], ['@pine', 0.6], ['n_Rock_Medium_3', 0.6]],
    trees: [['@spire', 1.8], ['@spire', 2.4], ['@pine', 1.8], ['@pine', 1.5], ['Rock_2_A', 2.4], ['n_Pine_1', 1.7], ['n_Pine_3', 1.8], ['n_DeadTree_2', 2]],
    tint: 0x9aa4b8, treeCount: 70, stone: 0x8a94a8, portal: 0x8ad0ff, torch: 0x8ad0ff, ambience: 'storm', leaves: 0x2e4a48, natureTint: 0x9aa4b8, light: { clouds: 0.5 },
  },
  // The void rift: a shattered black plain, violet crystals, pools of nothing.
  void: {
    sky: 0x4a2a6a, skyTop: 0x06040e, fog: 0x2a1a3e, fogRange: [16, 44], clouds: 0x5a3a8a, stars: true,
    sun: 0xe0c8ff, sunIntensity: 2.2, hemi: [0xc0a0ff, 0x1a1024], hemiIntensity: 0.95, back: [0xb05aff, 1.4], rim: [0xe0a8ff, 0.7], env: 0.1,
    grade: { shadows: 0x200a40, highlights: 0xf0c8ff, tone: 0.12, saturation: 1.02 },
    ground: [0x2a2438, 0x3e3450], dirt: 0x3a2a4a, rock: 0x241e30, sand: 0x4a3a60, style: FLOOR_STYLE.grass, cracks: 0xc86aff,
    hill: 3.8, grass: [0x1a1428, 0x7a5aa8], grassHeight: [0.12, 0.22], grassDensity: 0.2,
    flowers: [0xd08aff], flowerDensity: 0.08,
    water: { deep: 0x0a0418, shallow: 0x7a3ae0, foam: 0xe0b8ff, glow: 1.8 },
    crystal: [0x3a1a7a, 0xe0a8ff], spire: [0x14101c, 0x4a3a60], crystalGlow: 0.55,
    blocks: [['@crystal', 0.95], ['@spire', 0.85], ['Rock_3_A', 0.9], ['@crystal', 0.9]],
    edge: [['@crystal', 0.5], ['Rock_1_A', 0.5], ['@spire', 0.6]],
    trees: [['@crystal', 2], ['@crystal', 2.6], ['@spire', 2], ['@spire', 2.6], ['tree_dead_large', 1.8], ['n_DeadTree_3', 2.2], ['n_DeadTree_5', 2.3]],
    tint: 0x7a6a98, treeCount: 55, stone: 0x5a4a78, portal: 0xd08aff, torch: 0xd08aff, ambience: 'void', natureTint: 0x6a5a8a,
  },
  // The golden city: gilded courts and columns in the desert sun, palms and banners.
  golden: {
    sky: 0xffe8b0, skyTop: 0x4a8ae0, fog: 0xd8bc88, fogRange: [26, 62], clouds: 0xfff8e0,
    sun: 0xfff0c8, sunIntensity: 2.6, hemi: [0xfff4d8, 0x8a6a38], hemiIntensity: 0.95, back: [0xffd070, 1], rim: [0xfff0b0, 0.6], env: 0.18,
    grade: { shadows: 0x4a3a5a, highlights: 0xffe8b0, tone: 0.08, saturation: 1.02 },
    ground: [0x86904e, 0xaaa274], dirt: 0xb89868, rock: 0xa08a5a, sand: 0xe8d8a8, style: FLOOR_STYLE.grass, court: 0xc4ae7c,
    hill: 3.2, grass: [0x6a7a3a, 0xd8d88a], grassHeight: [0.14, 0.26], grassDensity: 0.45,
    flowers: [0xffd050, 0xffffff], flowerDensity: 0.2,
    water: { deep: 0x1a6ab8, shallow: 0x5ad8f0, foam: 0xffffff, glow: 0.3 },
    palm: [0x2f7a3a, 0x9ae060],
    blocks: [['%obelisk', 0.72], ['%lotus_column', 0.75], ['%gold_urn', 0.8], ['%brazier', 0.75], ['coin_stack_large', 0.6], ['chest_gold', 0.7]],
    edge: [['%gold_urn', 0.5], ['%brazier', 0.5], ['banner_red', 0.5], ['coin_stack_large', 0.45], ['Rock_1_A', 0.5], ['n_Bush_Common', 0.7]],
    trees: [['@palm', 2.2], ['%sphinx', 1.6], ['%obelisk', 1.1], ['%lotus_column', 1.2], ['@palm', 1.8], ['%sphinx', 1.9], ['n_CommonTree_1', 2], ['n_CommonTree_3', 1.8]],
    tint: 0xffe8a0, treeCount: 55, stone: 0xf0d890, portal: 0xffe070, torch: 0xffc040, ambience: 'golden', leaves: 0xe8b830, light: { dapple: 0, clouds: 0.3 },
  },
  // The celestial throne: a white and gold court among the stars, drifting light.
  celestial: {
    sky: 0x6a6ab8, skyTop: 0x0a0a2a, fog: 0x4a4a8a, fogRange: [18, 52], clouds: 0x9a9ad8, stars: true,
    sun: 0xfff4e0, sunIntensity: 2.5, hemi: [0xe0e0ff, 0x2a2a4a], hemiIntensity: 0.9, back: [0xffe0a0, 1.3], rim: [0xfff0d0, 0.7], env: 0.14,
    grade: { shadows: 0x2a2a6a, highlights: 0xfff0d0, tone: 0.1, saturation: 1.05 },
    ground: [0x5a5a88, 0x7a7aa8], dirt: 0x8a88a8, rock: 0x6a6a90, sand: 0xa8a8c8, style: FLOOR_STYLE.grass, court: 0xb0aacc,
    hill: 3.4, grass: [0x3a3a6a, 0xc8c8ff], grassHeight: [0.14, 0.26], grassDensity: 0.4,
    flowers: [0xffffff, 0xfff0a0, 0xc8d8ff], flowerDensity: 0.4,
    water: { deep: 0x1a1a5a, shallow: 0x8a9aff, foam: 0xffffff, glow: 1.3 },
    crystal: [0x8a7a3a, 0xfff4c0], crystalGlow: 0.6,
    blocks: [['%marble_column', 0.75], ['%star_altar', 0.8], ['@crystal', 0.9], ['%marble_column', 0.72]],
    edge: [['@crystal', 0.5], ['%star_altar', 0.5], ['rubble_half', 0.9], ['n_Bush_Common', 0.7]],
    trees: [['%broken_arch', 2.4], ['@crystal', 2.2], ['@crystal', 2.8], ['%marble_column', 1.2], ['%broken_arch', 2], ['n_CommonTree_2', 2], ['n_CommonTree_5', 2]],
    tint: 0xe8e4ff, treeCount: 50, stone: 0xf0ecff, portal: 0xfff0a0, torch: 0xfff0a0, ambience: 'celestial', leaves: 0xeaf0ff,
  },

  // Chapters 19 to 30.

  // An azure lagoon: white sand, turquoise water, palms and corals in the afternoon sun.
  lagoon: {
    sky: 0xc8ecf4, skyTop: 0x2a8ad8, fog: 0x9ad0d8, fogRange: [26, 62], clouds: 0xffffff,
    sun: 0xfff4e0, sunIntensity: 2.5, hemi: [0xe0f8ff, 0x6a8a70], hemiIntensity: 1.0, back: [0x9af0ff, 0.9], rim: [0xfff4e0, 0.5], env: 0.14,
    grade: { shadows: 0x1a4a7a, highlights: 0xfff0d0, tone: 0.08, saturation: 1.1 },
    ground: [0x5a9a58, 0x86b468], dirt: 0xc8b088, rock: 0x9a948a, sand: 0xe0d0a0, style: FLOOR_STYLE.grass, court: 0xc8b48c,
    hill: 2.8, grass: [0x3a7a4a, 0xc0e880], grassHeight: [0.16, 0.3], grassDensity: 0.7,
    flowers: [0xff8ab0, 0xffe07a, 0xffffff], flowerDensity: 0.5,
    water: { deep: 0x0a6aa8, shallow: 0x3ae8e0, foam: 0xffffff },
    palm: [0x2a7a3a, 0x8ad05a], coral: [0xe85a7a, 0xffb0a0],
    blocks: [['Rock_3_A', 0.95], ['Rock_3_C', 0.9], ['@coral', 0.85], ['barrel_large', 0.7], ['n_Rock_Medium_2', 0.9]],
    edge: [['@coral', 0.55], ['Rock_1_A', 0.5], ['n_Bush_Common', 0.8], ['n_Plant_1_Big', 0.8], ['n_Fern_1', 0.6]],
    trees: [['@palm', 2.2], ['@palm', 2.6], ['@palm', 1.9], ['Rock_2_A', 2], ['n_CommonTree_3', 1.9], ['Tree_2_A', 2.2]],
    treeCount: 48, stone: 0xd8c8a8, portal: 0x6af0ff, torch: 0xffc070, ambience: 'lagoon', leaves: 0x3a9a4a, light: { clouds: 0.35 },
  },
  // Firefly wood: a forest at night, giant glowing mushrooms, blue moonlight.
  glowwood: {
    sky: 0x2a4a6a, skyTop: 0x080e22, fog: 0x1e3448, fogRange: [16, 46], clouds: 0x3a5070, stars: true,
    sun: 0xb8c8ff, sunIntensity: 2.0, hemi: [0x8aa8e8, 0x1a2a24], hemiIntensity: 0.95, back: [0x8affd0, 1.2], rim: [0xb8ffe8, 0.6], env: 0.1,
    grade: { shadows: 0x102a4a, highlights: 0xd0f0ff, tone: 0.12, saturation: 1.08 },
    ground: [0x2a4a3e, 0x3e6450], dirt: 0x3e3e34, rock: 0x4a5462, sand: 0x5a6a5a, style: FLOOR_STYLE.grass,
    hill: 3.2, grass: [0x14302a, 0x5aa888], grassHeight: [0.2, 0.36], grassDensity: 0.9,
    flowers: [0x9affe0, 0xb8a8ff, 0xffffff], flowerDensity: 0.5,
    water: { deep: 0x0a2a3a, shallow: 0x3aa8b0, foam: 0xc8fff0, glow: 0.8 },
    mushroom: [0x3a6ad8, 0x9ae8ff], glowProps: ['@mushroom'], crystalGlow: 0.6,
    blocks: [['@mushroom', 0.9], ['Rock_3_A', 0.9], ['Bush_1_C', 0.9], ['n_Rock_Medium_1', 0.9]],
    edge: [['@mushroom', 0.5], ['n_Fern_1', 0.7], ['n_Mushroom_Common', 0.4], ['Bush_1_E', 0.6], ['Rock_1_A', 0.5]],
    trees: [['@mushroom', 1.8], ['@mushroom', 2.4], ['n_TwistedTree_1', 2.3], ['n_CommonTree_2', 2.1], ['n_TwistedTree_3', 2.2], ['Tree_3_A', 2.4], ['n_Pine_3', 1.8]],
    tint: 0x8aa0b8, treeCount: 62, stone: 0x7a8aa0, portal: 0x8affd0, torch: 0x9affe0, ambience: 'glowwood', leaves: 0x1e5a4a, natureTint: 0x7a90a8,
  },
  // The scarlet canyon: red rock spires and mesas under a dusty sunset.
  canyon: {
    sky: 0xf0a878, skyTop: 0x5a4a98, fog: 0xa87868, fogRange: [22, 58], clouds: 0xffd0b0,
    sun: 0xffc890, sunIntensity: 2.5, hemi: [0xffd8c0, 0x6a3a2a], hemiIntensity: 0.95, back: [0xff9a6a, 1.1], rim: [0xffc890, 0.6], env: 0.12,
    grade: { shadows: 0x4a2040, highlights: 0xffc080, tone: 0.1, saturation: 0.96 },
    ground: [0x8a5a44, 0xa47452], dirt: 0x8a4a2a, rock: 0x9a4a32, sand: 0xd09a6a, style: FLOOR_STYLE.grass, court: 0xa8705a,
    hill: 4.0, grass: [0x6a5a2a, 0xd0b060], grassHeight: [0.14, 0.26], grassDensity: 0.25,
    flowers: [0xffd050, 0xff7a4a], flowerDensity: 0.1,
    water: { deep: 0x1a5a8a, shallow: 0x5ac0c8, foam: 0xfff0e0 },
    spire: [0x7a2e1e, 0xd0784a], cactus: [0x3a6a3a, 0x8ab060],
    blocks: [['@spire', 0.85], ['Rock_3_A', 0.95], ['Rock_3_C', 0.9], ['@cactus', 0.8], ['n_Rock_Medium_3', 0.9]],
    edge: [['Rock_1_A', 0.55], ['@cactus', 0.5], ['Rock_3_E', 0.6], ['n_Rock_Medium_2', 0.55], ['n_DeadTree_4', 0.8]],
    trees: [['@spire', 2], ['@spire', 2.6], ['@spire', 1.6], ['Rock_2_A', 2.4], ['@cactus', 1.4], ['n_DeadTree_1', 2.1], ['Tree_Bare_2_A', 1.8]],
    tint: 0xe0b098, treeCount: 52, stone: 0xc89070, portal: 0xffb070, torch: 0xff9a40, ambience: 'canyon', natureTint: 0xd8a080, light: { dapple: 0, clouds: 0.3 },
  },
  // The boreal glacier: blue ice and snow by night, glowing ice crystals, snowy pines.
  glacier: {
    sky: 0x3a5a88, skyTop: 0x0a1230, fog: 0x3a5272, fogRange: [18, 52], clouds: 0x6a80a8, stars: true,
    sun: 0xc8dcff, sunIntensity: 2.0, hemi: [0xb0c8f0, 0x2a3a50], hemiIntensity: 0.9, back: [0x7ad8ff, 1.2], rim: [0xc8f0ff, 0.6], env: 0.12,
    grade: { shadows: 0x1a2a5a, highlights: 0xd8f0ff, tone: 0.12, saturation: 1.06 },
    ground: [0x7088a0, 0x90a8c0], dirt: 0x7a8aa0, rock: 0x5a6a88, sand: 0xa0b4c8, style: FLOOR_STYLE.grass,
    hill: 3.6, grass: [0x4a6a7a, 0xd8f0ff], grassHeight: [0.12, 0.22], grassDensity: 0.3,
    flowers: [0x9ae8ff, 0xffffff], flowerDensity: 0.12,
    water: { deep: 0x2a5aa0, shallow: 0x8ad8f8, foam: 0xffffff, calm: true, glow: 0.4 },
    pine: [0x1e4038, 0x3a6a58], snow: true, crystal: [0x2a6ab0, 0xb8f4ff], crystalGlow: 0.5,
    blocks: [['@crystal', 0.9], ['Rock_3_A', 0.95], ['@pine', 0.9], ['Rock_3_B', 0.95]],
    edge: [['@crystal', 0.5], ['@pine', 0.6], ['Rock_1_A', 0.55], ['n_Rock_Medium_1', 0.55]],
    trees: [['@pine', 1.6], ['@pine', 2], ['@crystal', 2], ['@crystal', 2.6], ['n_Pine_2', 1.8], ['n_Pine_4', 1.7], ['Rock_2_A', 2]],
    tint: 0xa8bcd8, treeCount: 60, stone: 0x9ab0cc, portal: 0x9af0ff, torch: 0x9af0ff, ambience: 'glacier', leaves: 0x2e5a58, natureTint: 0xa8bcd8, light: { dapple: 0.1 },
  },
  // The jade valley: misty green terraces, jade crystals, white blossoms and pines.
  jade: {
    sky: 0xc8e0d0, skyTop: 0x4a8a98, fog: 0x98b8a8, fogRange: [18, 50], clouds: 0xeef8f0,
    sun: 0xfff4e0, sunIntensity: 2.4, hemi: [0xe0f4e8, 0x3a5a40], hemiIntensity: 1.0, back: [0xa8ffd8, 1], rim: [0xe0fff0, 0.55], env: 0.13,
    grade: { shadows: 0x1a4a4a, highlights: 0xf0fff0, tone: 0.1, saturation: 1.06 },
    ground: [0x3e7a4a, 0x5e9a5e], dirt: 0x7a6a4a, rock: 0x6a7a74, sand: 0xb8b498, style: FLOOR_STYLE.grass, court: 0x9aa89c,
    hill: 3.6, grass: [0x245a34, 0xa8e08a], grassHeight: [0.2, 0.38], grassDensity: 1,
    flowers: [0xffffff, 0xffd8e8, 0xd0ffa8], flowerDensity: 0.7,
    water: { deep: 0x1a5a5a, shallow: 0x5ad0b0, foam: 0xf0fff8, calm: true },
    crystal: [0x1a7a5a, 0x9affd0], crystalGlow: 0.4, blossom: [0xd8e8e0, 0xffffff], trunk: 0x4a3a34, pine: [0x1e4a34, 0x3a7a50],
    blocks: [['@crystal', 0.9], ['Rock_3_A', 0.95], ['@blossom', 0.9], ['shrine_candles', 0.7], ['pillar', 0.85]],
    edge: [['@crystal', 0.45], ['n_Fern_1', 0.7], ['n_Bush_Common', 0.8], ['@pine', 0.6], ['Rock_1_A', 0.5]],
    trees: [['@pine', 1.9], ['@blossom', 2.2], ['@pine', 2.3], ['@crystal', 2], ['n_TwistedTree_2', 2.2], ['n_CommonTree_5', 2], ['Tree_1_C', 2.3]],
    treeCount: 60, stone: 0xa8c0b0, portal: 0x8affc8, ambience: 'jade', leaves: 0x3a8a5a, flecks: [0xffffff, 0xd8ffe8], fleckAmount: 1.4, light: { clouds: 0.45 },
  },
  // The scarlet necropolis: crypts and bones under a blood-red moon.
  necropolis: {
    sky: 0x4a2a40, skyTop: 0x12060e, fog: 0x2e1e2c, fogRange: [16, 46], clouds: 0x6a3040, stars: true,
    sun: 0xffc0c0, sunIntensity: 2.0, hemi: [0xd8a8b8, 0x24141a], hemiIntensity: 0.9, back: [0xff6a7a, 1.0], rim: [0xffa0a8, 0.65], env: 0.1,
    grade: { shadows: 0x2a0a2a, highlights: 0xffc0b0, tone: 0.12, saturation: 1.02 },
    ground: [0x3e383e, 0x564c52], dirt: 0x4a3434, rock: 0x5a4a50, sand: 0x6a5054, style: FLOOR_STYLE.grass, court: 0x6e6468, cracks: 0x9a2a3a,
    hill: 3.4, grass: [0x2a2024, 0x8a6a6a], grassHeight: [0.14, 0.26], grassDensity: 0.35,
    flowers: [0xff4a5a, 0xffd0d8], flowerDensity: 0.15,
    water: { deep: 0x3a0610, shallow: 0xb8203a, foam: 0xffa0a8, glow: 1.2 },
    spire: [0x1e1418, 0x5a3a44],
    blocks: [['crypt', 0.9], ['gravestone', 0.8], ['grave_A', 0.95], ['coffin_decorated', 0.8], ['@spire', 0.8], ['pillar_decorated', 0.85]],
    edge: [['ribcage', 0.5], ['skull_candle', 0.45], ['bone_A', 0.5], ['gravemarker_A', 0.5], ['post_skull', 0.6], ['Rock_1_A', 0.5]],
    trees: [['tree_dead_large', 2.1], ['crypt', 2.6], ['@spire', 2], ['n_DeadTree_3', 2.2], ['n_TwistedTree_4', 2.1], ['tree_dead_medium', 1.8], ['pillar_decorated', 1.6]],
    tint: 0x9a7a84, treeCount: 54, stone: 0x7a6a72, portal: 0xff5a6a, torch: 0xff5a4a, ambience: 'necropolis', leaves: 0x5a2a34, natureTint: 0x8a6a74,
  },
  // The titans' forge: black iron courts, pillars, rivers of molten metal.
  forge: {
    sky: 0xa8502a, skyTop: 0x1a0c0c, fog: 0x3e2420, fogRange: [16, 48], clouds: 0x4a2a24,
    sun: 0xffd0a0, sunIntensity: 2.4, hemi: [0xc8a8a0, 0x1a1210], hemiIntensity: 1.0, back: [0xff7a2a, 1.4], rim: [0xffa860, 0.65], env: 0.1,
    grade: { shadows: 0x2a1420, highlights: 0xffb060, tone: 0.1, saturation: 1.0 },
    ground: [0x3a3434, 0x524846], dirt: 0x4a3830, rock: 0x2e2a2a, sand: 0x6a3a26, style: FLOOR_STYLE.grass, court: 0x686060, cracks: 0xff8a2a,
    hill: 3.8, grass: [0x241e1c, 0x6a5040], grassHeight: [0.12, 0.2], grassDensity: 0.08,
    flowers: [0xffa040], flowerDensity: 0.04,
    water: { deep: 0xff5a08, shallow: 0xffb838, foam: 0xfff4a0, glow: 2.2, lava: true },
    spire: [0x1a1616, 0x5a4440],
    blocks: [['pillar', 0.9], ['%brazier', 0.75], ['barrel_large', 0.7], ['@spire', 0.85], ['Rock_3_A', 0.95], ['keg_decorated', 0.7]],
    edge: [['%brazier', 0.5], ['Rock_1_A', 0.55], ['crates_stacked', 0.6], ['torch_lit', 0.5], ['Rock_3_E', 0.6]],
    trees: [['@spire', 1.8], ['pillar_decorated', 1.6], ['@spire', 2.4], ['pillar', 1.4], ['Rock_2_A', 2.2], ['n_DeadTree_5', 2.1], ['wall', 1.8]],
    tint: 0x6a5a58, treeCount: 50, stone: 0x5a4e4c, portal: 0xffa040, torch: 0xff8a2a, ambience: 'forge', natureTint: 0x5a4a48, light: { dapple: 0, clouds: 0.25 },
  },
  // The spore grotto: a violet twilight, giant purple mushrooms, drifting spores.
  fungal: {
    sky: 0x6a4a88, skyTop: 0x140c24, fog: 0x3a2a4e, fogRange: [16, 46], clouds: 0x7a5a9a,
    sun: 0xf0d8ff, sunIntensity: 2.1, hemi: [0xd0b8f0, 0x241a2a], hemiIntensity: 0.95, back: [0xff8ae0, 1.2], rim: [0xf0b8ff, 0.6], env: 0.11,
    grade: { shadows: 0x2a1448, highlights: 0xffd8f8, tone: 0.12, saturation: 1.08 },
    ground: [0x3e3a50, 0x564c68], dirt: 0x4a3a4a, rock: 0x544a64, sand: 0x6a5a78, style: FLOOR_STYLE.grass,
    hill: 3.2, grass: [0x2a2438, 0xa88ac8], grassHeight: [0.18, 0.34], grassDensity: 0.6,
    flowers: [0xff9ae8, 0xd0a8ff, 0x9affe8], flowerDensity: 0.4,
    water: { deep: 0x200a3a, shallow: 0xa04ad8, foam: 0xf0c8ff, glow: 1.1 },
    mushroom: [0x8a2ab0, 0xff9ae8], glowProps: ['@mushroom'], crystalGlow: 0.55, crystal: [0x5a2a8a, 0xf0b0ff],
    blocks: [['@mushroom', 0.9], ['@mushroom', 0.85], ['@crystal', 0.9], ['Rock_3_A', 0.9]],
    edge: [['@mushroom', 0.5], ['n_Mushroom_Laetiporus', 0.45], ['n_Mushroom_Common', 0.4], ['Rock_1_A', 0.5], ['@crystal', 0.45]],
    trees: [['@mushroom', 2], ['@mushroom', 2.6], ['@mushroom', 1.6], ['@crystal', 2], ['n_TwistedTree_5', 2.1], ['Rock_2_A', 2]],
    tint: 0x9a88b8, treeCount: 60, stone: 0x7a6a98, portal: 0xff9ae8, torch: 0xe08aff, ambience: 'fungal', leaves: 0x6a3a8a, natureTint: 0x8a78a8,
  },
  // The golden steppe: tall grass at sunset, twisted lone trees, old standing stones.
  steppe: {
    sky: 0xf0c8a0, skyTop: 0x4a6ac0, fog: 0xb8a080, fogRange: [24, 62], clouds: 0xffe8c8,
    sun: 0xffe0b8, sunIntensity: 2.5, hemi: [0xf0e8d0, 0x4a4a2a], hemiIntensity: 0.95, back: [0xffb070, 1.1], rim: [0xffd8a0, 0.6], env: 0.12,
    grade: { shadows: 0x3a2a4a, highlights: 0xffc888, tone: 0.09, saturation: 0.98 },
    ground: [0x5e7438, 0x7e8c48], dirt: 0x8a6a40, rock: 0x8a8070, sand: 0xc8a870, style: FLOOR_STYLE.grass, court: 0x9a8a70,
    hill: 2.8, grass: [0x4e6428, 0xd0c060], grassHeight: [0.3, 0.56], grassDensity: 1.2,
    flowers: [0xffd050, 0xff8a3a, 0xffffff], flowerDensity: 0.5,
    water: { deep: 0x2a5a80, shallow: 0x6ab0b8, foam: 0xfff0e0 },
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['column', 0.75], ['n_Rock_Medium_1', 0.9], ['Bush_1_A', 0.85]],
    edge: [['Rock_1_A', 0.55], ['Bush_1_C', 0.7], ['rubble_half', 0.9], ['n_Rock_Medium_2', 0.55], ['n_Plant_7_Big', 0.6]],
    trees: [['Tree_4_A', 2.2], ['Tree_4_B', 2], ['n_TwistedTree_1', 2.3], ['n_TwistedTree_2', 2.1], ['Rock_2_A', 2.2], ['column', 1.3], ['Tree_Bare_1_B', 2]],
    treeCount: 40, stone: 0xc0a880, portal: 0xffc060, torch: 0xffa040, ambience: 'steppe', leaves: 0xc8a030, flecks: [0xe8c060, 0xffe0a0], fleckAmount: 1.2, light: { clouds: 0.4 },
  },
  // The fairy glade: a violet dusk, pink and lilac blossom, glowing flowers.
  fairy: {
    sky: 0xd8a8d8, skyTop: 0x3a3a8a, fog: 0xa080b8, fogRange: [20, 54], clouds: 0xf8e0f8,
    sun: 0xffe8f8, sunIntensity: 2.3, hemi: [0xf0d8ff, 0x4a3a5a], hemiIntensity: 1.0, back: [0xffa8f0, 1.1], rim: [0xffe0ff, 0.6], env: 0.13,
    grade: { shadows: 0x3a2a6a, highlights: 0xffe0f8, tone: 0.1, saturation: 1.06 },
    ground: [0x4a7a5a, 0x6a9a6e], dirt: 0x7a6a6a, rock: 0x8a7c96, sand: 0xc8b0c8, style: FLOOR_STYLE.grass, court: 0xa898b0,
    hill: 3.2, grass: [0x2e5a4a, 0xc0e8b0], grassHeight: [0.18, 0.34], grassDensity: 0.9,
    flowers: [0xffa8f0, 0xd8b0ff, 0xffffff, 0x9ae8ff], flowerDensity: 1.3,
    water: { deep: 0x3a2a8a, shallow: 0x9a8aff, foam: 0xfff0ff, glow: 0.6, calm: true },
    blossom: [0xb87ae0, 0xffc8f4], trunk: 0x4a3448, crystal: [0x8a5ac0, 0xffd8ff], crystalGlow: 0.5,
    blocks: [['@blossom', 0.9], ['@crystal', 0.85], ['Rock_3_A', 0.95], ['shrine_candles', 0.7]],
    edge: [['n_Flower_3_Group', 0.6], ['n_Flower_4_Group', 0.6], ['@crystal', 0.45], ['n_Bush_Common_Flowers', 0.8], ['n_Mushroom_Common', 0.35]],
    trees: [['@blossom', 2.2], ['@blossom', 2.6], ['@blossom', 1.8], ['n_TwistedTree_3', 2.2], ['@crystal', 1.8], ['n_CommonTree_1', 2]],
    treeCount: 56, stone: 0xc8b8d8, portal: 0xffb0f0, torch: 0xffb0f0, ambience: 'fairy', leaves: 0xd890e8, flecks: [0xffc0f0, 0xd8c0ff], fleckAmount: 2,
  },
  // The astral archipelago: floating isles adrift among the stars, blue crystals.
  astral: {
    sky: 0x2a3a7a, skyTop: 0x04061a, fog: 0x1e2a5a, fogRange: [18, 52], clouds: 0x4a5a9a, stars: true,
    sun: 0xd8e0ff, sunIntensity: 2.1, hemi: [0xb8c8ff, 0x1a1e34], hemiIntensity: 0.95, back: [0x7a9aff, 1.3], rim: [0xc8d8ff, 0.65], env: 0.12,
    grade: { shadows: 0x101a4a, highlights: 0xe0e8ff, tone: 0.12, saturation: 1.05 },
    ground: [0x3e4a6e, 0x56648a], dirt: 0x4a4a68, rock: 0x4e5878, sand: 0x7480a0, style: FLOOR_STYLE.grass, court: 0x7a84a8,
    hill: 2.6, grass: [0x26304e, 0x9ab0e8], grassHeight: [0.14, 0.26], grassDensity: 0.45,
    flowers: [0xc8d8ff, 0xffffff, 0xffe8a0], flowerDensity: 0.3,
    water: { deep: 0x060a30, shallow: 0x4a6aff, foam: 0xd8e0ff, glow: 1.4 },
    crystal: [0x2a3a9a, 0xb8d0ff], crystalGlow: 0.6,
    blocks: [['@crystal', 0.9], ['%star_altar', 0.8], ['%marble_column', 0.72], ['Rock_3_A', 0.9]],
    edge: [['%cloud', 0.9], ['@crystal', 0.5], ['rubble_half', 0.9], ['Rock_1_A', 0.5]],
    trees: [['%floating_isle', 2], ['%floating_isle', 2.5], ['@crystal', 2.2], ['%broken_arch', 2.2], ['@crystal', 2.8], ['%cloud', 2.4]],
    tint: 0x9aa8d0, treeCount: 46, stone: 0x8a98c0, portal: 0x9ab8ff, torch: 0xa8c0ff, ambience: 'astral', leaves: 0x6a7ac8, natureTint: 0x8a98c0,
  },
  // The heart of the Aether, the end of the journey: a cyan rift, broken arches, raw light.
  aether: {
    sky: 0x1a5a6a, skyTop: 0x020a14, fog: 0x0e3440, fogRange: [16, 48], clouds: 0x2a7080, stars: true,
    sun: 0xd0fff8, sunIntensity: 2.1, hemi: [0xa8f0ff, 0x0e1a20], hemiIntensity: 0.95, back: [0x3affe8, 1.4], rim: [0xa8fff4, 0.7], env: 0.12,
    grade: { shadows: 0x08283a, highlights: 0xd8fff8, tone: 0.12, saturation: 1.06 },
    ground: [0x22343c, 0x344a54], dirt: 0x2a3a42, rock: 0x1e2c34, sand: 0x3a5a64, style: FLOOR_STYLE.grass, court: 0x4e6a74, cracks: 0x3affe8,
    hill: 3.8, grass: [0x142228, 0x5ac8c0], grassHeight: [0.12, 0.24], grassDensity: 0.25,
    flowers: [0x8afff0, 0xffffff], flowerDensity: 0.12,
    water: { deep: 0x02141e, shallow: 0x1ad8d0, foam: 0xd0fff8, glow: 1.8 },
    crystal: [0x0a6a7a, 0xa8fff4], spire: [0x0e181e, 0x3a5a64], crystalGlow: 0.65,
    blocks: [['@crystal', 0.95], ['@spire', 0.85], ['%marble_column', 0.72], ['@crystal', 0.9]],
    edge: [['@crystal', 0.5], ['@spire', 0.6], ['rubble_half', 0.9], ['Rock_1_A', 0.5]],
    trees: [['%broken_arch', 2.4], ['@crystal', 2.4], ['@spire', 2.2], ['@crystal', 3], ['%floating_isle', 2], ['@spire', 2.8]],
    tint: 0x7aa0a8, treeCount: 56, stone: 0x5a8088, portal: 0x6afff0, torch: 0x6afff0, ambience: 'aether', natureTint: 0x6a9098,
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
varying vec2 vGrassXZ;
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
  vGrassXZ = (modelMatrix * vec4(iPos, 1.0)).xz;
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
varying vec2 vGrassXZ;
uniform vec3 uBase;
uniform vec3 uTip;`)
      .replace('#include <color_fragment>', flower
        ? `#include <color_fragment>
  if (vH < 0.9) diffuseColor.rgb = uBase * (0.7 + vH * 0.6);
  else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.3), smoothstep(1.03, 1.2, vH));`
        : `#include <color_fragment>
  diffuseColor.rgb *= mix(uBase, uTip, smoothstep(0.0, 1.0, vH));`);
    injectWorldLight(shader, 'vGrassXZ');
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
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform sampler2D uHeight;
uniform vec4 uBounds;
uniform vec2 uRange;
uniform float uLevel;
uniform float uGlow;
uniform float uFlow;
varying vec3 vWorld;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
  float ground = mix(uRange.x, uRange.y, texture2D(uHeight, uv).r);
  float depth = uLevel - ground;
  if (depth <= 0.0) discard;
  vec2 p = vWorld.xz;
  float t = uTime * uFlow;
  // Ripples: two drifting noise layers give a wobbling surface normal.
  float h1 = wNoise(p * 3.0 + vec2(t * 0.6, t * 0.4));
  float h2 = wNoise(p * 5.3 - vec2(t * 0.5, -t * 0.7));
  vec3 n = normalize(vec3((h1 - 0.5) * 0.5 + (h2 - 0.5) * 0.3, 1.0, (h1 - h2) * 0.4));
  float w = sin(p.x * 2.3 + t * 1.1) * sin(p.y * 2.9 - t * 0.9);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.02, 0.3, depth + (h1 - 0.5) * 0.03));
  // Light dancing on the shallow bottom.
  float ca = wNoise(p * 4.0 + wNoise(p * 2.0 + t * 0.3) * 1.5 + t * 0.2);
  c += uShallow * pow(1.0 - abs(ca - 0.5) * 2.0, 5.0) * 0.35 * (1.0 - smoothstep(0.05, 0.3, depth));
  // Sky in the surface, stronger at grazing angles.
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  float wet = uGlow > 1.0 ? 0.15 : 1.0;
  c = mix(c, uSky, (0.08 + fresnel * 0.35) * wet);
  // Sun glints: little stars on the ripples.
  vec3 r = reflect(-view, n);
  float glint = pow(max(dot(r, uSunDir), 0.0), 60.0);
  float sparkle = step(0.975, wNoise(p * 14.0 + t * 1.5)) * step(0.5, h1);
  c += uSun * (glint * 0.6 + sparkle * 0.4) * wet;
  // Foam: a breathing line along the shore and rings rolling toward it.
  float foam = 1.0 - smoothstep(0.0, 0.035 + 0.015 * (w * 0.5 + 0.5), depth);
  float rings = smoothstep(0.82, 0.95, fract(depth * 14.0 - t * 0.5 + h1 * 0.4)) * (1.0 - smoothstep(0.03, 0.08, depth));
  c = mix(c, uFoam, max(foam * 0.9, rings * 0.35));
  // Lava and glowing springs shine (the bloom picks them up).
  c *= 1.0 + uGlow * (0.6 + 0.4 * w);
  gl_FragColor = vec4(c, uGlow > 1.0 ? 1.0 : 0.94);
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
uniform vec3 uSunDir;
uniform vec3 uSunColor;
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
  // Sun (or moon) low over the far side of the arena: disk, halo and a warm horizon.
  float g = max(dot(d, uSunDir), 0.0);
  float halo = pow(g, 7.0) * 0.28 + pow(g, 48.0) * 0.45;
  c += uSunColor * halo;
  c = mix(c, uSunColor, smoothstep(0.9975, 0.999, g) * 0.95);
  c += uSunColor * (1.0 - smoothstep(0.0, 0.25, abs(h))) * pow(g, 3.0) * 0.2;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
    float n = sFbm(uv);
    float cloud = smoothstep(0.55, 0.58, n) * smoothstep(0.0, 0.18, h);
    float lit = smoothstep(0.55, 0.7, sFbm(uv - vec2(0.04, 0.06)));
    vec3 cc = mix(mix(uClouds, uTop, 0.35), uClouds, lit);
    // Silver linings: clouds near the sun catch its light.
    cc += uSunColor * pow(g, 10.0) * (0.35 + lit * 0.4);
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
    // By night the hero carries a warm glow that lights the ground around them.
    this.heroLight = new THREE.PointLight(0xffd8a0, 0, 6, 1.4);
    scene.add(this.hemi, this.sun, this.sun.target, this.back, this.heroLight);

    this.ambience = new Ambience(scene);
    this.outline = rigidOutlineMaterial(0x2a2230, 0.0016);
    this.toonCache = new Map();
    this.shared = { uTime: { value: 0 }, uPush: { value: new THREE.Vector3(0, 0, 0.9) }, uWind: { value: 1 } };
    this.grassGeometry = grassClump();
    this.flowerGeometry = flowerGeometry();
    this.torches = [];
    this.door = null;

    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uClouds: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: this.shared.uTime,
        uSunDir: { value: new THREE.Vector3(0.32, 0.16, -1).normalize() }, uSunColor: { value: new THREE.Color() },
      },
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
  toonize(object, tint = null, smoothRocks = false, recolorLeaves = null) {
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
      // Foliage (alpha-tested leaf cards) can be recoloured by the theme (autumn, blossom).
      const leaf = o.material.alphaTest > 0 && /Lea|Grass|Flower/.test(o.material.name);
      const recolor = leaf ? recolorLeaves ?? null : null;
      // The nature pack paints shading into vertex colours.
      const vertexColors = Boolean(o.geometry.attributes.color) && o.material.vertexColors;
      const key = `${o.material.uuid}|${tint ?? ''}|${recolor ?? ''}|${vertexColors}`;
      let toon = this.toonCache.get(key);
      if (!toon) {
        toon = new THREE.MeshToonMaterial({
          map: o.material.map, color: leaf ? 0xffffff : tint ?? 0xffffff, gradientMap: toonRamp(), vertexColors,
          alphaTest: o.material.alphaTest, side: o.material.alphaTest > 0 ? THREE.DoubleSide : o.material.side,
        });
        toon.name = o.material.name;
        // Leaf cards: no rim light (thin cards seen edge-on would turn white), wind instead.
        if (o.material.alphaTest > 0) patchFoliage(toon, this.shared.uTime, recolor);
        else patchRim(toon);
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
    // The sky's light: the back light's colour, a pale moon at night.
    sky.uSunColor.value.setHex(theme.stars ? 0xd8e4ff : theme.back[0]).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(theme.stars ? 0.7 : 1);
    scene.fog = new THREE.Fog(theme.fog, theme.fogRange[0], theme.fogRange[1]);
    scene.environmentIntensity = theme.env;
    this.hemi.color.setHex(theme.hemi[0]);
    this.hemi.groundColor.setHex(theme.hemi[1]);
    // A little less fill light than before: shadows and toon bands read more clearly.
    this.hemi.intensity = theme.hemiIntensity * 0.85;
    this.sun.color.setHex(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    // Bright daylight themes were washing out under the toon bands: a touch less exposure.
    this.scene.userData.exposure = theme.exposure ?? (theme.stars ? 0.92 : 0.85);
    this.back.color.setHex(theme.back[0]);
    this.back.intensity = theme.back[1];
    this.heroLightLevel = theme.stars ? 10 : 0;
    // Only lit by night: an unused light still costs every lit pixel.
    this.heroLight.visible = this.heroLightLevel > 0;
    this.heroLight.color.setHex(theme.heroLight ?? 0xffd8a8);
    setRim(theme.rim[0], theme.rim[1]);
    // Drifting cloud shadows by day, fainter at night, caustics under the sea.
    setWorldLight({ clouds: theme.stars ? 0.18 : 0.42, dapple: theme.stars ? 0 : 0.2, ...theme.light });
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
    const terrainMaterial = patchFloor(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }), { style: theme.style, occlusion: occlusion.texture, bounds: occlusion.bounds, detail: 0.8, region: court, cracks: theme.cracks ?? null, flecks: theme.flecks ?? theme.flowers.slice(0, 2), fleckAmount: theme.fleckAmount ?? Math.min(1.2, theme.flowerDensity) });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.receiveShadow = true;
    this.root.add(terrain);
    this.disposables.push(terrainGeometry, terrainMaterial, occlusion.texture);

    // Water over the ponds (a height texture tells the shader how deep it is).
    if (arena.cells.includes(CELL.PIT)) this.buildWater(arena, heightAt, theme);

    const place = ([name, width], x, z, rotation, scale = 1) => {
      if (name.startsWith('@')) return this.addProcedural(name, width * scale, x, heightAt(x, z) - 0.05, z, rotation, random, theme);
      if (name.startsWith('%')) return this.addBlender(name.slice(1), width * scale, x, heightAt(x, z) - 0.03, z, rotation);
      const prop = this.toonize(this.assets.fitted(name, width * scale), name.startsWith('n_') ? theme.natureTint ?? null : theme.tint ?? null, /^Rock|rubble/.test(name), theme.leaves ?? null);
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
    for (let i = 0; i < Math.round(26 + 16 * this.effects); i++) {
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
    // Fewer trees on the lighter quality levels.
    const treeTarget = Math.round(theme.treeCount * (0.55 + 0.45 * this.effects));
    for (let tries = 0; tries < treeTarget * 6 && planted < treeTarget; tries++) {
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
      // Leaf cards get no outline (an inflated card would draw a dark slab).
      if (child.isMesh && merged.includes(child.geometry) && !child.userData.noOutline && !(child.material.alphaTest > 0)) child.add(new THREE.Mesh(child.geometry, this.outline));
      // Leaves cast no shadow: alpha-tested cards are costly in the shadow pass on phones.
      if (child.isMesh && child.material.alphaTest > 0) child.castShadow = false;
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
    holder.userData.procedural = [{ geometry, glow: name === '@crystal' || (theme.glowProps ?? []).includes(name) }];
    this.root.add(holder);
    return holder;
  }

  /**
   * A prop made in Blender (assets/props/props.glb, tools/blender/props.py), merged with the
   * generated ones: its body in toon shading, its `_glow` parts (flames, orbs) glowing.
   */
  addBlender(name, width, x, y, z, rotation) {
    this.blenderCache ??= new Map();
    let source = this.blenderCache.get(name);
    if (!source) {
      source = blenderParts(this.assets.models.get(`b_${name}`));
      this.blenderCache.set(name, source);
    }
    const holder = new THREE.Object3D();
    holder.position.set(x, y, z);
    holder.rotation.y = rotation;
    holder.scale.setScalar(width / source.footprint);
    holder.userData.procedural = source.parts.map(({ geometry, glow }) => ({ geometry: geometry.clone(), glow }));
    this.root.add(holder);
    return holder;
  }

  /** Bakes the generated props into one mesh per look (glow, shadow, outline). */
  mergeProcedural(theme) {
    const groups = new Map();
    for (const holder of [...this.root.children]) {
      const pieces = holder.userData.procedural;
      if (!pieces) continue;
      holder.updateMatrix();
      const shadow = !holder.userData.noShadow;
      const outline = !holder.userData.noOutline;
      for (const { geometry, glow } of pieces) {
        const key = `${glow}|${shadow}|${outline}`;
        if (!groups.has(key)) groups.set(key, { glow, shadow, outline, parts: [] });
        groups.get(key).parts.push(geometry.applyMatrix4(holder.matrix));
      }
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
        uSky: { value: new THREE.Color(theme.skyTop ?? theme.sky).lerp(new THREE.Color(theme.fog), 0.5) },
        uSun: { value: new THREE.Color(theme.sun) },
        uSunDir: { value: new THREE.Vector3(0.32, 0.55, -1).normalize() },
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
    const grassCount = Math.round(8000 * theme.grassDensity * scale);
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
    // Pebbles scattered over the floor and the edges (little details the eye enjoys).
    const pebbles = Math.round(110 * scale);
    if (pebbles) {
      this.pebbleGeometry ??= (() => {
        const g = new THREE.DodecahedronGeometry(0.07, 0);
        g.scale(1, 0.55, 0.8);
        g.translate(0, 0.012, 0);
        return g;
      })();
      this.pebbleMaterial ??= patchRim(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp() }));
      const rock = new THREE.Color(theme.rock);
      const pebbleSpot = () => {
        for (let k = 0; k < 10; k++) {
          const x = (random() - 0.5) * (arena.width + 3);
          const z = (random() - 0.5) * (arena.height + 3);
          const y = heightAt(x, z);
          if (y < -0.06 || blocked(x, z)) continue;
          return [x, y, z];
        }
        return null;
      };
      const mesh = make(this.pebbleGeometry, pebbles, this.pebbleMaterial, pebbleSpot, () => 0.6 + random() * 1.1, (c) => c.copy(rock).lerp(new THREE.Color(0xffffff), 0.15 + random() * 0.35));
      mesh.castShadow = false;
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
    WORLD.uCloudTime.value = this.time;
    if (hero) {
      this.heroLight.position.set(hero.x, 1.35, hero.z + 0.2);
      this.heroLight.intensity = (this.heroLightLevel ?? 0) * (1 + Math.sin(this.time * 7) * 0.04 + Math.sin(this.time * 17) * 0.03);
    } else this.heroLight.intensity = 0;
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
