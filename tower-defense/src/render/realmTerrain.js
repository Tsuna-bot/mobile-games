import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeNoise } from '../core/random.js';

const TOP = CONFIG.world.tileTop;
// Texels of the wear map per cell: dirt paths form where workers walk and around buildings.
const WEAR_RES = 4;
// Rolling hills around the playable grid (world units).
export const REALM_MARGIN = 5;

const NOISE_GLSL = /* glsl */ `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

function roundRect(x, z, halfW, halfH, radius) {
  const qx = Math.abs(x) - halfW + radius;
  const qz = Math.abs(z) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius;
}

/**
 * The Kingdom ground: one shader-colored plane for the whole grid (grass shades,
 * worn dirt paths, an optional build grid, cloud shadows) and a ring of rolling
 * hills with forests between the grid and the cliff.
 */
export class RealmTerrain {
  constructor(world) {
    this.world = world;
    this.gridTarget = 0;
    this.wearDirty = false;
    this.wearTimer = 0;
  }

  build(level, random) {
    const world = this.world;
    const size = level.width;
    const half = size / 2;
    this.half = half;
    this.size = size;

    // Wear map (dirt amount per texel).
    const res = size * WEAR_RES;
    this.res = res;
    this.wear = new Uint8Array(res * res);
    this.wearTexture = new THREE.DataTexture(this.wear, res, res, THREE.RedFormat, THREE.UnsignedByteType);
    this.wearTexture.magFilter = THREE.LinearFilter;
    this.wearTexture.minFilter = THREE.LinearFilter;
    this.wearTexture.needsUpdate = true;

    this.uniforms = {
      uTime: world.uniforms.time,
      uCloudShadow: world.uniforms.cloudShadow,
      uWear: { value: this.wearTexture },
      uGrid: { value: 0 },
      uHalf: { value: half },
      uGrassA: { value: new THREE.Color(0x4f9a3a) },
      uGrassB: { value: new THREE.Color(0x86c24e) },
      uDirt: { value: new THREE.Color(0x9a7650) },
    };
    const groundGeometry = new THREE.PlaneGeometry(size, size, 1, 1);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    groundMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vGround;
          uniform float uTime;
          uniform float uCloudShadow;
          uniform sampler2D uWear;
          uniform float uGrid;
          uniform float uHalf;
          uniform vec3 uGrassA;
          uniform vec3 uGrassB;
          uniform vec3 uDirt;
          ${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 p = vGround;
          float n = gNoise(p * 0.22) * 0.55 + gNoise(p * 0.9) * 0.3 + gNoise(p * 4.0) * 0.15;
          vec3 grass = mix(uGrassA, uGrassB, smoothstep(0.25, 0.8, n));
          grass *= 0.92 + gNoise(p * 11.0) * 0.12;
          float wear = texture2D(uWear, p / (2.0 * uHalf) + 0.5).r;
          wear = smoothstep(0.12, 0.75, wear + (gNoise(p * 5.0) - 0.5) * 0.25);
          vec3 dirt = uDirt * (0.85 + gNoise(p * 6.0) * 0.3);
          vec3 ground = mix(grass, dirt, wear);
          vec2 cellEdge = abs(fract(p + 0.5) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.035, min(cellEdge.x, cellEdge.y));
          ground = mix(ground, vec3(1.0), line * uGrid * 0.35);
          vec2 cloudUv = p * 0.16 + vec2(uTime * 0.035, uTime * 0.02);
          float cloud = smoothstep(0.52, 0.72, gNoise(cloudUv) * 0.65 + gNoise(cloudUv * 2.3) * 0.35);
          diffuseColor.rgb = ground * (1.0 - uCloudShadow * cloud);`);
    };
    groundMaterial.customProgramCacheKey = () => 'bastion-realm-ground';
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = TOP;
    ground.receiveShadow = true;
    world.root.add(ground);
    world.disposables.push(groundGeometry, groundMaterial, this.wearTexture);

    // Worn areas from the start: around the castle and at each portal.
    const base = level.base;
    this.addWear(base.x, base.z, 3, 0.9);
    for (const portal of level.portals) this.addWear(portal.x, portal.z, 1.4, 0.8);

    this.buildHills(level, random);
  }

  /** Height of the hills ring at (x, z); the grid itself stays flat. */
  hillHeight(x, z) {
    const half = this.half;
    const outside = Math.max(Math.abs(x), Math.abs(z)) - half;
    if (outside <= 0) return TOP - 0.06;
    const islandHalf = half + REALM_MARGIN;
    const edge = -roundRect(x, z, islandHalf, islandHalf, 0.9);
    if (edge < 0) return -3;
    const rise = THREE.MathUtils.smoothstep(outside, 0, 2.4);
    const fall = THREE.MathUtils.smoothstep(edge, 0, 1.6);
    // Passes in front of the portals, where the saucers come in.
    let pass = 1;
    for (const portal of this.portals) {
      const d = Math.hypot(x - portal.x, z - portal.z);
      pass = Math.min(pass, THREE.MathUtils.smoothstep(d, 1.2, 4.5));
    }
    const n = this.noise(x, z, 3.2) * 0.7 + this.noise(x + 40, z - 17, 1.4) * 0.3;
    const h = (0.25 + n * 1.9) * rise * (0.35 + 0.65 * pass);
    return 0.04 + (TOP - 0.04) + h * fall - (1 - fall) * 0.12;
  }

  buildHills(level, random) {
    const world = this.world;
    this.portals = level.portals;
    this.noise = makeNoise((level.def.seed ?? 7) ^ 0x4411);
    const extent = this.half + REALM_MARGIN;
    const segments = 110;
    const geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const low = new THREE.Color(0x4f9a3a);
    const high = new THREE.Color(0x9cc860);
    const rock = new THREE.Color(0x8a8378);
    const tmp = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = this.hillHeight(x, z);
      position.setY(i, y);
      const k = THREE.MathUtils.clamp((y - TOP) / 1.6, 0, 1);
      tmp.copy(low).lerp(high, k);
      if (k > 0.55 && this.noise(x * 2, z * 2, 1) > 0.62) tmp.lerp(rock, 0.6);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const hills = new THREE.Mesh(geometry, material);
    hills.receiveShadow = true;
    world.root.add(hills);
    world.disposables.push(geometry, material);

    // Forests, rocks and bushes on the hills.
    const props = new Map();
    const put = (model, x, z, scale) => {
      if (!props.has(model)) props.set(model, []);
      props.get(model).push({ x, z, y: this.hillHeight(x, z) - 0.03, rotation: random() * Math.PI * 2, scale });
    };
    const trees = ['nature/tree_pineRoundA', 'nature/tree_pineRoundC', 'nature/tree_oak', 'nature/tree_default', 'nature/tree_fat', 'nature/tree_cone', 'nature/tree_detailed', 'nature/tree_oak_fall', 'nature/tree_default_fall'];
    for (let i = 0; i < 900; i++) {
      const x = (random() * 2 - 1) * extent;
      const z = (random() * 2 - 1) * extent;
      const outside = Math.max(Math.abs(x), Math.abs(z)) - this.half;
      if (outside < 0.6) continue;
      const y = this.hillHeight(x, z);
      if (y < TOP) continue;
      const forest = this.noise(x - 13, z + 29, 2.6);
      const r = random();
      if (forest > 0.5 && r < 0.75) put(trees[Math.floor(random() * trees.length)], x, z, 1.5 + random() * 1.1);
      else if (r < 0.1) put(['nature/rock_tallA', 'nature/rock_smallA', 'nature/rock_smallC'][Math.floor(random() * 3)], x, z, 1.5 + random() * 1.5);
      else if (r < 0.2) put(['nature/plant_bushLarge', 'nature/plant_bush', 'nature/plant_bushDetailed'][Math.floor(random() * 3)], x, z, 1.4 + random());
    }
    const dummy = new THREE.Object3D();
    for (const [model, list] of props) {
      const mesh = new THREE.InstancedMesh(this.world.assets.geometry(model), this.world.assets.materials.nature, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = model.includes('tree');
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      world.root.add(mesh);
      world.disposables.push(mesh);
    }
  }

  /** Darkens the grass into dirt around (x, z). */
  addWear(x, z, radius, amount) {
    const res = this.res;
    const scale = res / this.size;
    const cx = (x + this.half) * scale;
    const cz = (z + this.half) * scale;
    const r = radius * scale;
    const add = amount * 255;
    for (let tz = Math.max(0, Math.floor(cz - r)); tz <= Math.min(res - 1, Math.ceil(cz + r)); tz++) {
      for (let tx = Math.max(0, Math.floor(cx - r)); tx <= Math.min(res - 1, Math.ceil(cx + r)); tx++) {
        const d = Math.hypot(tx + 0.5 - cx, tz + 0.5 - cz) / r;
        if (d >= 1) continue;
        const i = tz * res + tx;
        this.wear[i] = Math.min(255, this.wear[i] + add * (1 - d * d));
      }
    }
    this.wearDirty = true;
  }

  /** Grid lines while placing buildings. */
  showGrid(on) {
    this.gridTarget = on ? 1 : 0;
  }

  update(dt) {
    const grid = this.uniforms.uGrid;
    grid.value += (this.gridTarget - grid.value) * Math.min(1, dt * 8);
    this.wearTimer -= dt;
    if (this.wearDirty && this.wearTimer <= 0) {
      this.wearTimer = 0.4;
      this.wearDirty = false;
      this.wearTexture.needsUpdate = true;
    }
  }

  /** Wear map for the save (run-length encoded bytes). */
  serializeWear() {
    const out = [];
    let run = 0;
    let value = this.wear[0];
    for (let i = 0; i <= this.wear.length; i++) {
      const v = i < this.wear.length ? this.wear[i] >> 3 : -1;
      if (v === value && run < 255) run++;
      else {
        if (run) out.push(run, value);
        value = v;
        run = 1;
      }
    }
    return out;
  }

  restoreWear(data) {
    if (!Array.isArray(data)) return;
    let i = 0;
    for (let k = 0; k + 1 < data.length && i < this.wear.length; k += 2) {
      const value = data[k + 1] << 3;
      for (let r = 0; r < data[k] && i < this.wear.length; r++, i++) this.wear[i] = Math.max(this.wear[i], value);
    }
    this.wearDirty = true;
  }
}
