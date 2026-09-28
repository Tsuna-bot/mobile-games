import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CELL } from '../sim/arena.js';
import { batchStatic } from './batch.js';
import { Ambience } from './ambience.js';
import { FLOOR_STYLE, occlusionTexture, patchFloor, setRim } from './surfaces.js';

/**
 * Themes: floor checker colours, what stands on blocks, pits and around the arena,
 * sky and light colours.
 */
export const THEMES = {
  forest: {
    floor: [0x94d05a, 0x8bc852], edge: 0x5f9a3c, ground: 0x4a8434, fog: 0x7fae66, sky: 0x9fcf88,
    sun: 0xffeccc, sunIntensity: 2.5, hemi: [0xdff4ff, 0x3f6a30], hemiIntensity: 0.95,
    style: FLOOR_STYLE.grass, groundStyle: FLOOR_STYLE.grass, env: 0.2, back: [0x9fd8ff, 1.2], rim: [0xfff4d0, 0.45],
    grade: { shadows: 0x2a5a7a, highlights: 0xffd8a0, tone: 0.08, saturation: 1.15 },
    // [model, footprint width, height stretch] — props are fitted to the cell.
    blocks: [['Rock_3_A', 0.95], ['Rock_3_B', 0.95], ['Rock_3_C', 0.95], ['Rock_3_E', 0.9], ['Bush_1_A', 0.95], ['Bush_1_C', 0.95]],
    border: [['Tree_1_A', 1.3], ['Tree_1_B', 1.35], ['Tree_3_A', 1.4], ['Tree_4_A', 1.1], ['Bush_1_C', 1.1], ['Tree_1_C', 1.3]],
    outer: [['Tree_1_A', 2], ['Tree_1_B', 2.1], ['Tree_1_C', 2], ['Tree_3_A', 2.2], ['Tree_3_B', 2.2], ['Tree_4_A', 1.6], ['Tree_4_B', 1.6], ['Rock_2_A', 1.6], ['Bush_3_A', 1.4]],
    props: [['Grass_1_A', 0.45], ['Grass_2_A', 0.45], ['Bush_1_G', 0.6], ['Bush_1_E', 0.5], ['Rock_1_A', 0.5], ['barrel', 0.5]],
    floorDecor: [['Bush_1_G', 0.32], ['Bush_1_E', 0.24]],
    pit: { deep: 0x2f7fbf, shallow: 0x6fd0e8, foam: 0xe8fbff },
    door: ['fence_wood_straight_gate', 2.2],
  },
  dungeon: {
    floor: [0x817e9c, 0x7a7794], edge: 0x55526e, ground: 0x221f2e, fog: 0x2a2638, sky: 0x1c1a26,
    sun: 0xffcf98, sunIntensity: 2.4, hemi: [0xc8c0ff, 0x3a3048], hemiIntensity: 0.9,
    style: FLOOR_STYLE.stone, groundStyle: FLOOR_STYLE.soil, env: 0.3, back: [0x8a7aff, 1.4], rim: [0xffc890, 0.5],
    grade: { shadows: 0x3a2a6a, highlights: 0xffb870, tone: 0.1, saturation: 1.1 },
    blocks: [['column', 0.8], ['barrel_large', 0.85], ['crates_stacked', 0.95], ['box_stacked', 0.95], ['keg_decorated', 0.95]],
    walls: ['wall', 2],
    outer: [['pillar', 1.2], ['pillar_decorated', 1.4], ['rubble_half', 2.4], ['barrel_small_stack', 1.4]],
    props: [['chest_gold', 0.7], ['coin_stack_large', 0.55], ['barrel_small_stack', 0.8], ['banner_red', 0.6]],
    pit: { deep: 0x05040a, shallow: 0x251f3a, foam: 0x6a5aa0 },
    door: ['wall_gated', 2.2],
    torch: ['torch_lit', 0.28, 0xffb050],
  },
  graveyard: {
    floor: [0x667a6c, 0x5f7265], edge: 0x43543f, ground: 0x1e2a24, fog: 0x2e3c46, sky: 0x1e2834,
    sun: 0xc8d8ff, sunIntensity: 2, hemi: [0xa8c0ff, 0x2a3024], hemiIntensity: 1,
    style: FLOOR_STYLE.flagstone, groundStyle: FLOOR_STYLE.soil, env: 0.3, back: [0x7affc8, 1.3], rim: [0xb8ffe0, 0.55],
    grade: { shadows: 0x1a4a5a, highlights: 0xc8e0ff, tone: 0.12, saturation: 1.05 },
    blocks: [['gravestone', 0.9], ['grave_A', 0.95], ['grave_B', 0.95], ['pumpkin_orange_jackolantern', 0.8], ['shrine_candles', 0.75]],
    walls: ['fence', 2],
    outer: [['tree_dead_large', 1.8], ['tree_dead_medium', 1.5], ['Tree_Bare_1_A', 1.4], ['Tree_Bare_2_A', 1.3], ['tree_pine_orange_large', 2.6], ['tree_pine_yellow_large', 2.6], ['tree_pine_orange_medium', 2], ['crypt', 2.6]],
    props: [['pumpkin_yellow', 0.5], ['skull_candle', 0.45], ['ribcage', 0.5], ['bone_A', 0.4], ['gravemarker_A', 0.45], ['coffin_decorated', 0.8]],
    pit: { deep: 0x0a1a18, shallow: 0x2a5a48, foam: 0x7fffc0 },
    door: ['fence_gate', 2.2],
    torch: ['post_lantern', 0.5, 0x9fffd0],
  },
};

// Checker floor with soft edges and a light vignette toward the walls.
const FLOOR_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WATER_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  float w = sin(p.x * 3.1 + uTime * 1.3) * sin(p.y * 2.7 - uTime * 1.1) * 0.5 + 0.5;
  float w2 = sin((p.x + p.y) * 5.0 - uTime * 2.0) * 0.5 + 0.5;
  vec3 c = mix(uDeep, uShallow, w * 0.6 + w2 * 0.2);
  // Foam along the cell border (the pit edge).
  vec2 f = abs(fract(vUv) - 0.5) * 2.0;
  float edge = smoothstep(0.78, 1.0, max(f.x, f.y));
  c = mix(c, uFoam, edge * (0.5 + 0.5 * w2));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Builds and animates the room: floor, walls or trees around it, blocks and pits
 * from the layout, the door at the top, the lights.
 */
export class ArenaView {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.time = 0;
    this.disposables = [];

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.position.set(-4, 12, 6);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -6.5;
    cam.right = 6.5;
    cam.top = 9.5;
    cam.bottom = -9.5;
    cam.near = 1;
    cam.far = 30;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    // Back light: a coloured edge on everything, seen from the camera side.
    this.back = new THREE.DirectionalLight(0x9fd8ff, 1.2);
    this.back.position.set(3, 6, -10);
    scene.add(this.hemi, this.sun, this.sun.target, this.back);
    this.ambience = new Ambience(scene);
    this.effects = 1;
    this.onTheme = null;
    this.waterMaterials = [];
    this.torches = [];
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
    this.waterMaterials = [];
    this.torches = [];
    this.door = null;
  }

  /** Builds the room of `arena` in `themeId`. `seed` varies decorations. */
  build(arena, themeId, seed = 1) {
    this.clear();
    const theme = THEMES[themeId];
    this.theme = theme;
    this.arena = arena;
    let s = seed >>> 0;
    const random = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const scene = this.scene;
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 26, 52);
    scene.environmentIntensity = theme.env;
    this.back.color.setHex(theme.back[0]);
    this.back.intensity = theme.back[1];
    setRim(theme.rim[0], theme.rim[1]);
    this.onTheme?.(theme);
    this.hemi.color.setHex(theme.hemi[0]);
    this.hemi.groundColor.setHex(theme.hemi[1]);
    this.hemi.intensity = theme.hemiIntensity;
    this.sun.color.setHex(theme.sun);
    this.sun.intensity = theme.sunIntensity;

    const W = arena.width;
    const H = arena.height;
    const halfW = arena.halfW;
    const halfH = arena.halfH;

    // Ground outside the arena.
    const groundGeometry = new THREE.PlaneGeometry(60, 60);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = patchFloor(new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }), { style: theme.groundStyle, detail: 0.6 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.disposables.push(groundGeometry, groundMaterial);

    // Checker floor: one tile per cell, vertex colours, a slight bevel shade at the rim.
    const tile = new RoundedBoxGeometry(0.97, 0.24, 0.97, 1, 0.07);
    tile.translate(0, -0.12, 0);
    const occlusion = occlusionTexture(arena);
    const floorMaterial = patchFloor(new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }), { style: theme.style, occlusion: occlusion.texture, bounds: occlusion.bounds });
    this.disposables.push(occlusion.texture);
    const floor = new THREE.InstancedMesh(tile, floorMaterial, W * H);
    floor.receiveShadow = true;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let n = 0;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (arena.cells[r * W + c] === CELL.PIT) continue;
        m.makeTranslation(c - halfW + 0.5, 0, r - halfH + 0.5);
        floor.setMatrixAt(n, m);
        color.setHex(theme.floor[(r + c) % 2]);
        // A touch of variation so it does not look printed.
        color.offsetHSL(0, 0, (random() - 0.5) * 0.02);
        floor.setColorAt(n, color);
        n++;
      }
    }
    floor.count = n;
    this.root.add(floor);
    this.disposables.push(tile, floorMaterial);

    // Rim around the arena.
    const rimGeometry = new THREE.BoxGeometry(W + 0.6, 0.3, H + 0.6);
    rimGeometry.translate(0, -0.2, 0);
    const rimMaterial = patchFloor(new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 1 }), { style: theme.groundStyle, detail: 0.5 });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.receiveShadow = true;
    this.root.add(rim);
    this.disposables.push(rimGeometry, rimMaterial);

    // Pits: animated water or a dark void.
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (arena.cells[r * W + c] !== CELL.PIT) continue;
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);
        const material = this.waterMaterial(theme);
        const water = new THREE.Mesh(geometry, material);
        water.position.set(c - halfW + 0.5, -0.03, r - halfH + 0.5);
        this.root.add(water);
        this.disposables.push(geometry);
      }
    }

    const pick = (list) => list[Math.floor(random() * list.length)];
    const place = ([name, width, stretch = 1], x, z, rotation, scale = 1) => {
      const prop = this.assets.fitted(name, width * scale);
      prop.scale.y = stretch;
      prop.position.set(x, 0, z);
      prop.rotation.y = rotation;
      this.root.add(prop);
      return prop;
    };

    // Blocks: one prop per cell, turned a little at random.
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (arena.cells[r * W + c] !== CELL.BLOCK) continue;
        place(pick(theme.blocks), c - halfW + 0.5, r - halfH + 0.5, Math.floor(random() * 4) * (Math.PI / 2) + (random() - 0.5) * 0.4);
      }
    }

    // A few tufts on the floor (no gameplay effect, merged with the rest).
    if (theme.floorDecor) {
      for (let i = 0; i < 14; i++) {
        const c = Math.floor(random() * W);
        const r = Math.floor(random() * H);
        if (arena.cells[r * W + c] !== CELL.FLOOR) continue;
        place(pick(theme.floorDecor), c - halfW + 0.5 + (random() - 0.5) * 0.7, r - halfH + 0.5 + (random() - 0.5) * 0.7, random() * Math.PI * 2, 0.8 + random() * 0.5).userData.noShadow = true;
      }
    }

    if (theme.walls) {
      // Walls or fences in 2-unit segments; the near side stays low so it never hides the hero.
      const [name, len] = theme.walls;
      const segments = [];
      for (let x = -halfW + len / 2 - 0.5; x < halfW + 0.5; x += len) segments.push([x, -halfH - 0.55, 0, 1], [x, halfH + 0.55, Math.PI, 0.35]);
      for (let z = -halfH + len / 2 - 0.5; z < halfH + 0.5; z += len) segments.push([-halfW - 0.55, z, Math.PI / 2, 1], [halfW + 0.55, z, -Math.PI / 2, 1]);
      for (const [x, z, rot, height] of segments) {
        if (z < -halfH && Math.abs(x) < 1.2) continue;
        const wall = place([name, len + 0.02], x, z, rot);
        wall.scale.y = height;
      }
      // Corners.
      for (const [x, z] of [[-halfW - 0.55, -halfH - 0.55], [halfW + 0.55, -halfH - 0.55]]) place(theme.outer[0], x, z, 0, 0.7);
    } else {
      // A ring of trees around the arena (lower in front of the camera).
      const ring = [];
      for (let x = -halfW - 0.5; x <= halfW + 0.5; x += 1) ring.push([x, -halfH - 0.75, 1], [x, halfH + 0.8, 0.55]);
      for (let z = -halfH + 0.5; z <= halfH - 0.5; z += 1) ring.push([-halfW - 0.75, z, 1], [halfW + 0.75, z, 1]);
      for (const [x, z, size] of ring) {
        if (z < -halfH && Math.abs(x) < 1.3) continue;
        const prop = place(pick(theme.border), x + (random() - 0.5) * 0.25, z + (random() - 0.5) * 0.25, random() * Math.PI * 2, (0.9 + random() * 0.3) * size);
        prop.scale.y *= size < 1 ? 0.7 : 1;
      }
    }
    // A second, looser ring further out for depth.
    for (let i = 0; i < 40; i++) {
      const side = i % 4;
      const t = random();
      let x;
      let z;
      if (side === 0) [x, z] = [-halfW - 2.2 - random() * 3, (t - 0.5) * (H + 6)];
      else if (side === 1) [x, z] = [halfW + 2.2 + random() * 3, (t - 0.5) * (H + 6)];
      else if (side === 2) [x, z] = [(t - 0.5) * (W + 8), -halfH - 2.4 - random() * 3];
      else [x, z] = [(t - 0.5) * (W + 8), halfH + 1.6 + random() * 3];
      // The near side is right under the camera: only small things there.
      const far = side === 3 ? place(pick(theme.props), x, z, random() * Math.PI * 2, 0.9 + random() * 0.5) : place(pick(theme.outer), x, z, random() * Math.PI * 2, 0.85 + random() * 0.4);
      // Far from the light's frustum: no shadow pass for them.
      far.userData.noShadow = true;
    }
    // Small props just outside the floor (no gameplay effect).
    for (let i = 0; i < 8; i++) {
      const onLeft = random() < 0.5;
      place(pick(theme.props), onLeft ? -halfW - 0.25 : halfW + 0.25, (random() - 0.5) * (H - 2), random() * Math.PI * 2).userData.noShadow = true;
    }

    // Torches: glowing flames, no real lights (cheap on phones).
    if (theme.torch) {
      const [name, width, flameColor] = theme.torch;
      const top = this.assets.fittedHeight(name, width);
      for (const [x, z] of [[-halfW - 0.3, -halfH + 3], [halfW + 0.3, -halfH + 3], [-halfW - 0.3, halfH - 3], [halfW + 0.3, halfH - 3]]) {
        place([name, width], x, z, 0);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: flameColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.position.set(x, top * 0.92, z);
        this.root.add(flame);
        this.disposables.push(flame.geometry, flame.material);
        this.torches.push(flame);
      }
    }

    // The door at the top: closed until the room is cleared.
    const door = place(theme.door, 0, -halfH - 0.55, 0);
    const glowGeometry = new THREE.PlaneGeometry(1.8, 1.6);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(0, 0.8, -halfH - 0.6);
    this.root.add(glow);
    this.disposables.push(glowGeometry, glowMaterial);
    this.door = { mesh: door, glow, open: 0, target: 0, baseY: 0, height: this.assets.fittedHeight(theme.door[0], theme.door[1]) };
    // Everything else stands still: bake it into one mesh per texture.
    this.disposables.push(...batchStatic(this.root, new Set([door])));
    this.ambience.build(themeId, halfW, halfH, this.effects);
  }

  waterMaterial(theme) {
    if (!this.sharedWater || this.sharedWaterTheme !== theme) {
      this.sharedWater = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(theme.pit.deep) },
          uShallow: { value: new THREE.Color(theme.pit.shallow) },
          uFoam: { value: new THREE.Color(theme.pit.foam) },
        },
        vertexShader: FLOOR_VERTEX,
        fragmentShader: WATER_FRAGMENT,
      });
      this.sharedWaterTheme = theme;
    }
    return this.sharedWater;
  }

  openDoor(open) {
    if (this.door) this.door.target = open ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    this.ambience.update(dt);
    if (this.sharedWater) this.sharedWater.uniforms.uTime.value = this.time;
    for (let i = 0; i < this.torches.length; i++) {
      const s = 1 + Math.sin(this.time * 9 + i * 1.7) * 0.12 + Math.sin(this.time * 23 + i) * 0.06;
      this.torches[i].scale.set(s, s * 1.3, s);
    }
    const door = this.door;
    if (door) {
      door.open += (door.target - door.open) * Math.min(1, dt * 3);
      door.mesh.position.y = -door.open * (door.height + 0.1);
      door.glow.material.opacity = door.open * (0.45 + Math.sin(this.time * 4) * 0.15);
    }
  }
}
