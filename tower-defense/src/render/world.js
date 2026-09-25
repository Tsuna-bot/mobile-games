import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { THEMES } from '../data/themes.js';
import { AmbientParticles } from './ambient.js';
import { REALM_MARGIN, RealmTerrain } from './realmTerrain.js';

const TREES = ['tile-tree', 'tile-tree-double', 'tile-tree-quad'];
const DECORATION_MODELS = { rock: ['tile-rock'], crystal: ['tile-crystal'], hill: ['tile-hill'] };
const FOLIAGE = new Set(['tile-tree', 'tile-tree-double', 'tile-tree-quad', 'detail-tree', 'detail-tree-large']);
const ISLAND_MARGIN = 0.65;
const ISLAND_DEPTH = 2.6;
const WATER_LEVEL = -0.62;
// Island top sits below the recessed path surface of the Kenney tiles.
const ISLAND_TOP = 0.04;

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

const NOISE_GLSL = /* glsl */ `
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/**
 * Patches a standard material with drifting cloud shadows and, optionally,
 * wind sway for foliage (vertices above `swayFrom` bend with the wind).
 */
export function patchMaterial(material, uniforms, { sway = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uCloudShadow = uniforms.cloudShadow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec2 vCloudUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 cloudWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cloudWorld = instanceMatrix * cloudWorld;
        #endif
        cloudWorld = modelMatrix * cloudWorld;
        ${sway ? `
        float swayAmount = smoothstep(0.24, 0.85, transformed.y);
        float gust = sin(uTime * 1.6 + cloudWorld.x * 0.9 + cloudWorld.z * 0.7) + 0.4 * sin(uTime * 3.7 + cloudWorld.x * 2.3);
        transformed.x += gust * 0.035 * swayAmount;
        transformed.z += gust * 0.02 * swayAmount;` : ''}
        vCloudUv = cloudWorld.xz * 0.16 + vec2(uTime * 0.035, uTime * 0.02);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uCloudShadow;\nvarying vec2 vCloudUv;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cloudMask = smoothstep(0.52, 0.72, cloudNoise(vCloudUv) * 0.65 + cloudNoise(vCloudUv * 2.3) * 0.35);
        diffuseColor.rgb *= 1.0 - uCloudShadow * cloudMask;`);
  };
  material.customProgramCacheKey = () => (sway ? 'bastion-foliage' : 'bastion-terrain');
  material.needsUpdate = true;
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uStars;
uniform float uTime;
varying vec3 vDirection;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 dir = normalize(vDirection);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uBottom, uTop, smoothstep(0.45, 0.95, h));
  float sun = max(dot(dir, normalize(uSunDir)), 0.0);
  color += uSunColor * (pow(sun, 380.0) * 2.5 + pow(sun, 12.0) * 0.28);
  if (uStars > 0.01) {
    vec3 cell = floor(dir * 180.0);
    float star = step(0.9965, hash(cell)) * smoothstep(0.5, 0.7, h);
    color += star * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 1.0) * 40.0));
  }
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const WATER_VERTEX = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float wave = sin(world.x * 0.9 + uTime * 1.1) * 0.05
             + sin(world.z * 1.3 - uTime * 0.8) * 0.04
             + sin((world.x + world.z) * 2.1 + uTime * 1.7) * 0.02;
  world.y += wave;
  vWave = wave;
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
varying vec3 vWorld;
varying float vWave;
${NOISE_GLSL}
float roundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float d = roundRect(vWorld.xz, uHalf, uRadius);
  float shore = 1.0 - smoothstep(0.0, 5.0, d);
  vec3 color = mix(uDeep, uShallow, shore * shore);
  float ripples = cloudNoise(vWorld.xz * 1.4 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6
                + cloudNoise(vWorld.xz * 3.1 - vec2(uTime * 0.3, uTime * 0.12)) * 0.4;
  color *= 0.92 + ripples * 0.16 + vWave * 1.4;
  float bands = smoothstep(0.7, 1.0, sin(d * 5.5 - uTime * 2.0 + ripples * 2.0)) * (1.0 - smoothstep(0.0, 1.6, d));
  float edge = 1.0 - smoothstep(0.0, 0.22 + ripples * 0.12, d);
  color = mix(color, uFoam, clamp(bands * 0.55 + edge, 0.0, 1.0) * 0.85);
  // Analytic wave normal + ripples: fresnel sky reflection and a sharp sun glint.
  float dhdx = cos(vWorld.x * 0.9 + uTime * 1.1) * 0.045 + cos((vWorld.x + vWorld.z) * 2.1 + uTime * 1.7) * 0.042;
  float dhdz = cos(vWorld.z * 1.3 - uTime * 0.8) * 0.052 + cos((vWorld.x + vWorld.z) * 2.1 + uTime * 1.7) * 0.042;
  vec3 normal = normalize(vec3(-dhdx - (ripples - 0.5) * 0.3, 1.0, -dhdz - (ripples - 0.5) * 0.3));
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  color = mix(color, uSkyColor, fresnel * 0.7 * (1.0 - edge));
  vec3 halfway = normalize(normalize(uSunDir) + view);
  float glint = pow(max(dot(normal, halfway), 0.0), 220.0);
  color += uSunColor * glint * 1.6;
  float sparkle = smoothstep(0.86, 0.97, cloudNoise(vWorld.xz * 6.0 + uTime * vec2(0.6, -0.4)));
  color += uFoam * sparkle * 0.25;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function createIslandGeometry(halfW, halfH, colors, random) {
  const radius = 0.9;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + radius, -halfH);
  shape.lineTo(halfW - radius, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + radius);
  shape.lineTo(halfW, halfH - radius);
  shape.quadraticCurveTo(halfW, halfH, halfW - radius, halfH);
  shape.lineTo(-halfW + radius, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - radius);
  shape.lineTo(-halfW, -halfH + radius);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + radius, -halfH);

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: ISLAND_DEPTH, steps: 6, bevelEnabled: false, curveSegments: 5 });
  geometry.rotateX(Math.PI / 2);
  const position = geometry.attributes.position;
  const color = new Float32Array(position.count * 3);
  const top = new THREE.Color(colors.top);
  const mid = new THREE.Color(colors.mid);
  const bottom = new THREE.Color(colors.bottom);
  const tmp = new THREE.Color();
  const jitter = new Map();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const depth = Math.min(1, Math.max(0, -y / ISLAND_DEPTH)); // 0 at the top, 1 at the bottom
    // Same jitter for shared corners keeps the rock surface closed.
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, (random() - 0.5) * 0.35);
    const noise = depth > 0.01 ? jitter.get(key) : 0;
    const taper = 1 - Math.pow(depth, 1.6) * 0.62 + noise * 0.25;
    position.setXYZ(i, x * taper, y + (depth > 0.99 ? -0.4 - Math.abs(jitter.get(key)) : noise * 0.15), z * taper);
    if (depth < 0.08) tmp.copy(top);
    else if (depth < 0.5) tmp.copy(top).lerp(mid, Math.min(1, (depth - 0.08) / 0.2));
    else tmp.copy(mid).lerp(bottom, (depth - 0.5) / 0.5);
    color[i * 3] = tmp.r;
    color[i * 3 + 1] = tmp.g;
    color[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Three crossed blades; colors (root → tip) are filled per theme. */
function createGrassGeometry() {
  const positions = [];
  const tips = [];
  for (let b = 0; b < 3; b++) {
    const angle = (b / 3) * Math.PI;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const w = 0.022;
    const h = 0.13 + b * 0.02;
    const lean = 0.03 * (b - 1);
    positions.push(-w * ca, 0, -w * sa, w * ca, 0, w * sa, lean * sa, h, lean * ca);
    tips.push(0, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.userData.tips = tips;
  geometry.computeVertexNormals();
  return geometry;
}

function createCloudGeometry(random) {
  const parts = [];
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const blob = new THREE.IcosahedronGeometry(0.5 + random() * 0.5, 1);
    blob.scale(1, 0.7, 1);
    blob.translate((i - count / 2) * 0.6 + random() * 0.3, random() * 0.25, (random() - 0.5) * 0.6);
    parts.push(blob);
  }
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const array = new Float32Array(total * 3);
  let offset = 0;
  for (const part of parts) {
    array.set(part.attributes.position.array, offset);
    offset += part.attributes.position.array.length;
    part.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(array, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * The diorama for a level: a floating island (instanced Kenney tiles on a
 * rocky cliff) in an animated sea, islets, clouds, sky, lights, ambient life.
 */
export class World {
  constructor(scene, assets, renderer) {
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = null;
    this.grassDensity = 1;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.disposables = [];
    this.time = 0;
    this.castleHit = 0;
    this.uniforms = { time: { value: 0 }, cloudShadow: { value: 0.18 } };

    // Shared palette material gets drifting cloud shadows; foliage also sways.
    // Kenney models are closed meshes: casting shadows from back faces removes self-shadow acne.
    assets.material.shadowSide = THREE.BackSide;
    patchMaterial(assets.material, this.uniforms);
    this.foliageMaterial = assets.material.clone();
    patchMaterial(this.foliageMaterial, this.uniforms, { sway: true });
    // Survival Kit props (Kingdom mode): same cloud shadows, trees sway too.
    // Kingdom kits share the same cloud shadows; nature props sway gently.
    for (const palette of ['castle', 'town']) {
      const material = assets.materials[palette];
      if (!material) continue;
      material.shadowSide = THREE.BackSide;
      patchMaterial(material, this.uniforms);
    }
    if (assets.materials.nature) patchMaterial(assets.materials.nature, this.uniforms, { sway: true });
    this.terrain = new RealmTerrain(this);
    const survival = assets.materials.survival;
    if (survival) {
      survival.shadowSide = THREE.BackSide;
      patchMaterial(survival, this.uniforms);
      this.survivalFoliage = survival.clone();
      patchMaterial(this.survivalFoliage, this.uniforms, { sway: true });
    }
    this.cycle = null;

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.radius = 4;
    scene.add(this.hemisphere, this.sun, this.sun.target);

    // Warm light from the castle windows on dark levels.
    this.castleLight = new THREE.PointLight(0xffa04a, 0, 5, 1.6);
    scene.add(this.castleLight);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uBottom: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3() },
          uStars: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.ambient = new AmbientParticles(scene);
    this.clouds = [];

    // Small copy of the sky, rendered into a prefiltered environment map for image-based lighting.
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), this.sky.material);
    this.envScene.add(this.envSky);

    this.grassGeometry = createGrassGeometry();
    this.grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    this.grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bend = transformed.y * transformed.y * 40.0;
          vec3 origin = vec3(instanceMatrix[3]);
          transformed.x += sin(uTime * 2.3 + origin.x * 1.7 + origin.z * 1.3) * 0.012 * bend;
          transformed.z += cos(uTime * 1.9 + origin.x * 1.1) * 0.008 * bend;`);
    };
  }

  build(level) {
    this.clear();
    const theme = THEMES[level.def.theme] ?? THEMES.meadow;
    this.theme = theme;
    this.level = level;
    const prefix = theme.tiles;
    const random = seededRandom(level.index * 977 + level.width * 31 + 13);

    // Sky, fog and light.
    const sky = this.sky.material.uniforms;
    sky.uTop.value.set(theme.skyTop);
    sky.uBottom.value.set(theme.skyBottom);
    sky.uSunColor.value.set(theme.sun);
    sky.uSunDir.value.set(...theme.sunDirection).normalize();
    sky.uStars.value = theme.stars ? 1 : 0;
    this.scene.background = new THREE.Color(theme.fog);
    this.scene.fog = new THREE.Fog(theme.fog, 20, 60);
    this.hemisphere.color.set(theme.hemisphereSky);
    this.hemisphere.groundColor.set(theme.hemisphereGround);
    this.hemisphere.intensity = theme.hemisphereIntensity;
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    // Image-based lighting from this level's sky: soft, colored ambient light and reflections.
    this.envMap?.dispose();
    this.envMap = this.pmrem.fromScene(this.envScene, 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
    this.hemisphere.intensity = theme.hemisphereIntensity * 0.6;
    this.uniforms.cloudShadow.value = theme.stars ? 0.1 : 0.2;

    // Terrain tiles, grouped per model into InstancedMeshes.
    const placements = new Map();
    const place = (model, x, z, rotation, y = 0, scale = 1) => {
      if (!placements.has(model)) placements.set(model, []);
      placements.get(model).push({ x, y, z, rotation, scale });
    };
    const pathTiles = new Map(level.pathTiles.map((tile) => [tile.cell.index, tile]));
    const realm = Boolean(level.portals);
    this.realm = realm;
    if (realm) this.terrain.build(level, random);
    for (const cell of realm ? [] : level.cells) {
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

    // Island rim decorations just outside the playable grid.
    const halfW = level.width / 2;
    const halfH = level.height / 2;
    const rimModels = prefix ? ['snow-detail-tree', 'snow-detail-rocks', 'snow-detail-tree-large'] : ['detail-tree', 'detail-rocks', 'detail-tree-large', 'detail-crystal'];
    for (let i = 0; i < (realm ? 0 : 26); i++) {
      const side = Math.floor(random() * 4);
      const along = random() * 2 - 1;
      const x = side < 2 ? along * (halfW - 0.2) : (side === 2 ? -1 : 1) * (halfW + 0.3);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (halfH + 0.3) : along * (halfH - 0.2);
      place(rimModels[Math.floor(random() * rimModels.length)], x, z, random() * Math.PI * 2, ISLAND_TOP, 0.55 + random() * 0.3);
    }

    // Islets scattered in the sea.
    const isletGeometry = new THREE.CylinderGeometry(1, 0.55, 1.2, 7, 1);
    isletGeometry.translate(0, -0.6, 0);
    const isletMaterial = new THREE.MeshStandardMaterial({ color: theme.cliff.mid, roughness: 1, flatShading: true });
    const isletTopMaterial = new THREE.MeshStandardMaterial({ color: theme.cliff.top, roughness: 1, flatShading: true });
    const isletTop = new THREE.CylinderGeometry(1.02, 1, 0.12, 7, 1);
    this.disposables.push(isletGeometry, isletMaterial, isletTopMaterial, isletTop);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + random() * 0.6;
      const distance = (realm ? REALM_MARGIN + 2.5 : 3.2) + random() * 4;
      const x = Math.cos(angle) * (halfW + distance);
      const z = Math.sin(angle) * (halfH + distance * 0.7);
      const size = 0.45 + random() * 0.55;
      const islet = new THREE.Group();
      islet.position.set(x, WATER_LEVEL + 0.15 + random() * 0.15, z);
      islet.scale.setScalar(size);
      islet.rotation.y = random() * Math.PI;
      const rock = new THREE.Mesh(isletGeometry, isletMaterial);
      const cap = new THREE.Mesh(isletTop, isletTopMaterial);
      rock.receiveShadow = cap.receiveShadow = true;
      islet.add(rock, cap);
      this.root.add(islet);
      const count = 1 + Math.floor(random() * 3);
      for (let k = 0; k < count; k++) {
        const a = random() * Math.PI * 2;
        const r = random() * 0.55 * size;
        place(rimModels[Math.floor(random() * rimModels.length)], x + Math.cos(a) * r, z + Math.sin(a) * r, random() * Math.PI * 2, islet.position.y + 0.06 * size, size * (0.8 + random() * 0.4));
      }
    }

    // Grass tufts swaying on grass cells (not on paths).
    if (theme.grass) {
      const tufts = [];
      for (const cell of level.cells) {
        if (cell.isPath) continue;
        for (let k = 0; k < 7; k++) tufts.push([cell.x + (random() - 0.5) * 0.9, cell.z + (random() - 0.5) * 0.9, random() * Math.PI, 0.7 + random() * 0.6]);
      }
      const colors = this.grassGeometry.attributes.color;
      const base = new THREE.Color(theme.grass[0]);
      const tip = new THREE.Color(theme.grass[1]);
      const tips = this.grassGeometry.userData.tips;
      for (let i = 0; i < colors.count; i++) {
        const c = tips[i] ? tip : base;
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
      this.grass = new THREE.InstancedMesh(this.grassGeometry, this.grassMaterial, tufts.length);
      const d = new THREE.Object3D();
      tufts.forEach(([x, z, r, sc], i) => {
        d.position.set(x, CONFIG.world.tileTop, z);
        d.rotation.set(0, r, 0);
        d.scale.setScalar(sc);
        d.updateMatrix();
        this.grass.setMatrixAt(i, d.matrix);
      });
      this.grass.userData.total = tufts.length;
      this.grass.count = Math.round(tufts.length * this.grassDensity);
      this.grass.receiveShadow = true;
      this.grass.computeBoundingSphere();
      this.root.add(this.grass);
      this.disposables.push(this.grass);
    }

    const dummy = new THREE.Object3D();
    for (const [model, list] of placements) {
      const baseName = model.replace('snow-', '');
      const material = FOLIAGE.has(baseName) ? this.foliageMaterial : this.assets.material;
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), material, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.receiveShadow = true;
      // Terrain tiles self-shadow badly (whole tiles turn dark): only loose props cast.
      mesh.castShadow = baseName.startsWith('detail-');
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.disposables.push(mesh);
    }

    // The floating island under the tiles.
    const islandHalfW = halfW + (realm ? REALM_MARGIN : ISLAND_MARGIN);
    const islandHalfH = halfH + (realm ? REALM_MARGIN : ISLAND_MARGIN);
    const islandGeometry = createIslandGeometry(islandHalfW, islandHalfH, theme.cliff, random);
    const islandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.position.y = ISLAND_TOP;
    island.receiveShadow = true;
    this.root.add(island);
    this.disposables.push(islandGeometry, islandMaterial);

    // Animated sea.
    const waterGeometry = new THREE.PlaneGeometry(160, 160, 96, 96);
    waterGeometry.rotateX(-Math.PI / 2);
    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(theme.water.deep) },
          uShallow: { value: new THREE.Color(theme.water.shallow) },
          uFoam: { value: new THREE.Color(theme.water.foam) },
          uHalf: { value: new THREE.Vector2(islandHalfW * 0.93, islandHalfH * 0.93) },
          uRadius: { value: 0.9 },
          uSunDir: { value: new THREE.Vector3(...theme.sunDirection).normalize() },
          uSunColor: { value: new THREE.Color(theme.sun) },
          uSkyColor: { value: new THREE.Color(theme.skyBottom).lerp(new THREE.Color(theme.skyTop), 0.35) },
        },
      ]),
    });
    const water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    water.position.y = WATER_LEVEL;
    this.root.add(water);
    this.disposables.push(waterGeometry, this.waterMaterial);

    // Clouds drifting around the island.
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: theme.clouds,
      emissive: theme.clouds,
      emissiveIntensity: 0.25,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });
    this.disposables.push(cloudMaterial);
    this.cloudGroup = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const geometry = createCloudGeometry(random);
      const cloud = new THREE.Mesh(geometry, cloudMaterial);
      const angle = (i / 9) * Math.PI * 2 + random();
      const distance = Math.max(halfW, halfH) + 4 + random() * 9;
      cloud.position.set(Math.cos(angle) * distance, 0.2 + random() * 2.2, Math.sin(angle) * distance);
      cloud.scale.setScalar(0.9 + random() * 1.1);
      cloud.userData.speed = 0.15 + random() * 0.2;
      this.cloudGroup.add(cloud);
      this.disposables.push(geometry);
    }
    this.root.add(this.cloudGroup);

    // Castle at the end of the path, turned toward the incoming road (the Kingdom castle is bigger).
    // Kingdom: RealmViews builds the (upgradable) castle itself.
    const baseTile = pathTiles.get(level.base.index);
    this.castleScale = realm ? 1 : 0.9;
    if (!realm) {
      this.castle = this.assets.clone('tower-round-build-f');
      this.castle.position.set(level.base.x, CONFIG.world.tileTop, level.base.z);
      this.castle.rotation.y = baseTile?.rotation ?? 0;
      this.castle.scale.setScalar(this.castleScale);
      this.root.add(this.castle);
    }

    this.castleLight.position.set(level.base.x, CONFIG.world.tileTop + (realm ? 2.6 : 1.6 * this.castleScale), level.base.z + (realm ? 2 : 0.9 * this.castleScale));
    this.castleLight.distance = realm ? 9 : 5 * this.castleScale;
    this.castleLight.intensity = theme.castleLight ?? 0;

    this.portals = (level.portals ?? [level.spawn]).map((cell) => {
      const portal = this.assets.clone('spawn-round');
      portal.position.set(cell.x, CONFIG.world.tileTop + 0.01, cell.z);
      this.root.add(portal);
      return portal;
    });
    this.portal = this.portals[0];

    this.ambient.configure(theme.ambient, halfW + 1.5, halfH + 1.5);
    this.fitShadows(level, theme);
  }

  fitShadows(level, theme) {
    const span = Math.max(level.width, level.height) / 2 + (level.portals ? 3.5 : 2);
    const direction = new THREE.Vector3(...theme.sunDirection).normalize();
    this.sun.position.copy(direction).multiplyScalar(16);
    this.sun.target.position.set(0, 0, 0);
    const camera = this.sun.shadow.camera;
    camera.left = -span;
    camera.right = span;
    camera.top = span;
    camera.bottom = -span;
    camera.near = 1;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }

  setViewDistance(distance) {
    if (!this.scene.fog) return;
    this.scene.fog.near = distance + 6;
    this.scene.fog.far = distance + 55;
  }

  applyQuality(preset) {
    this.sun.castShadow = preset.shadows;
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.ambient.setDensity(preset.effects);
    this.grassDensity = preset.grass;
    if (this.grass) this.grass.count = Math.round(this.grass.userData.total * this.grassDensity);
  }

  get exposure() {
    return this.cycle ? this.cycle.exposure : this.theme?.exposure ?? 1;
  }

  /**
   * Day/night cycle (Kingdom): `t` = 0 full day theme, 1 full night theme.
   * Lerps sky, fog, lights, water and stars; the environment map follows in steps.
   */
  setCycle(t, dayTheme, nightTheme, dayProgress = 0.5) {
    // The sun rises in the east, crosses the sky and sets golden in the west.
    const arc = Math.sin(Math.PI * THREE.MathUtils.clamp(dayProgress, 0, 1));
    const golden = (1 - arc) ** 2;
    const azimuth = (dayProgress - 0.5) * Math.PI * 0.9;
    const elevation = 0.28 + arc * 0.85;
    const dayDirection = new THREE.Vector3(-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation) * 0.55 + 0.3).normalize();
    const warm = new THREE.Color(0xffa25a);
    const dayTint = (color, amount) => new THREE.Color(color).lerp(warm, golden * amount);
    const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), t);
    const n = (a, b) => a + (b - a) * t;
    const sky = this.sky.material.uniforms;
    sky.uTop.value.copy(dayTint(dayTheme.skyTop, 0.25).lerp(new THREE.Color(nightTheme.skyTop), t));
    sky.uBottom.value.copy(dayTint(dayTheme.skyBottom, 0.6).lerp(new THREE.Color(nightTheme.skyBottom), t));
    sky.uSunColor.value.copy(dayTint(dayTheme.sun, 0.8).lerp(new THREE.Color(nightTheme.sun), t));
    const direction = dayDirection.lerp(new THREE.Vector3(...nightTheme.sunDirection).normalize(), t).normalize();
    sky.uSunDir.value.copy(direction);
    sky.uStars.value = Math.max(0, (t - 0.4) / 0.6);
    const fog = dayTint(dayTheme.fog, 0.35).lerp(new THREE.Color(nightTheme.fog), t);
    this.scene.background.copy(fog);
    this.scene.fog.color.copy(fog);
    this.hemisphere.color.copy(c(dayTheme.hemisphereSky, nightTheme.hemisphereSky));
    this.hemisphere.groundColor.copy(c(dayTheme.hemisphereGround, nightTheme.hemisphereGround));
    this.hemisphere.intensity = n(dayTheme.hemisphereIntensity, nightTheme.hemisphereIntensity) * 0.6;
    this.sun.color.copy(sky.uSunColor.value);
    this.sun.intensity = n(dayTheme.sunIntensity * (0.75 + 0.25 * arc), nightTheme.sunIntensity);
    this.sun.position.copy(direction).multiplyScalar(16);
    if (this.waterMaterial) {
      const w = this.waterMaterial.uniforms;
      w.uDeep.value.copy(c(dayTheme.water.deep, nightTheme.water.deep));
      w.uShallow.value.copy(c(dayTheme.water.shallow, nightTheme.water.shallow));
      w.uFoam.value.copy(c(dayTheme.water.foam, nightTheme.water.foam));
      w.uSunDir.value.copy(direction);
      w.uSunColor.value.copy(sky.uSunColor.value);
      w.uSkyColor.value.copy(sky.uBottom.value).lerp(sky.uTop.value, 0.35);
    }
    this.uniforms.cloudShadow.value = n(0.2, 0.08);
    this.cycle = {
      t,
      exposure: n(dayTheme.exposure ?? 1, nightTheme.exposure ?? 1),
      castleLight: n(dayTheme.castleLight ?? 0, nightTheme.castleLight ?? 0),
    };
    const envKey = t + golden * 0.5;
    if (this.envT === undefined || Math.abs(this.envT - envKey) > 0.1 || (envKey !== this.envT && (t === 0 || t === 1) && Math.abs(this.envT - envKey) > 0.02)) {
      this.envT = envKey;
      this.envMap?.dispose();
      this.envMap = this.pmrem.fromScene(this.envScene, 0.04).texture;
      this.scene.environment = this.envMap;
    }
  }

  hitCastle() {
    this.castleHit = 0.5;
  }

  update(dt, camera) {
    this.time += dt;
    this.uniforms.time.value = this.time;
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = this.time;
    if (this.waterMaterial) this.waterMaterial.uniforms.uTime.value = this.time;
    this.ambient.update(this.time);
    if (this.cloudGroup) {
      for (const cloud of this.cloudGroup.children) {
        const angle = Math.atan2(cloud.position.z, cloud.position.x) + dt * cloud.userData.speed * 0.05;
        const distance = Math.hypot(cloud.position.x, cloud.position.z);
        cloud.position.x = Math.cos(angle) * distance;
        cloud.position.z = Math.sin(angle) * distance;
      }
    }
    for (const portal of this.portals ?? []) portal.rotation.y = this.time * 0.8;
    if (this.realm) this.terrain.update(dt);
    if (this.castle) {
      this.castleHit = Math.max(0, this.castleHit - dt);
      const k = this.castleHit * 2;
      const s0 = this.castleScale;
      this.castle.scale.set(s0 * (1 + Math.sin(this.time * 40) * 0.04 * k), s0 * (1 - k * 0.06), s0 * (1 + Math.cos(this.time * 40) * 0.04 * k));
    }
    const castleLight = this.cycle ? this.cycle.castleLight : this.theme?.castleLight;
    if (castleLight) this.castleLight.intensity = castleLight * (0.9 + Math.sin(this.time * 7) * 0.05 + Math.sin(this.time * 13) * 0.05);
  }

  clear() {
    for (const item of this.disposables) item.dispose?.();
    this.disposables = [];
    this.root.clear();
    this.castle = null;
    this.portal = null;
    this.portals = [];
    this.cycle = null;
    this.cloudGroup = null;
    this.waterMaterial = null;
    this.grass = null;
  }

  dispose() {
    this.clear();
    this.ambient.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.foliageMaterial.dispose();
    this.survivalFoliage?.dispose();
    this.grassGeometry.dispose();
    this.grassMaterial.dispose();
    this.envSky.geometry.dispose();
    this.envMap?.dispose();
    this.pmrem.dispose();
    this.sun.shadow.map?.dispose();
  }
}

export { WATER_LEVEL };
