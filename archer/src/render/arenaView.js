import * as THREE from 'three';
import { CELL } from '../sim/arena.js';

/**
 * Themes: floor checker colours, what stands on blocks, pits and around the arena,
 * sky and light colours.
 */
export const THEMES = {
  forest: {
    floor: [0x9fd660, 0x93cc56], edge: 0x6fa844, ground: 0x3f6e2e, fog: 0x86b86a, sky: 0xbfe5a0,
    sun: 0xfff1d6, sunIntensity: 2.6, hemi: [0xdff4ff, 0x4f7a3a], hemiIntensity: 1.4,
    blocks: ['nature/rock_tallA', 'nature/stump_round', 'nature/log_stack', 'nature/plant_bushLarge'],
    border: ['nature/tree_oak', 'nature/tree_default', 'nature/tree_fat', 'nature/tree_pineRoundA', 'nature/tree_detailed'],
    props: ['nature/flower_redA', 'nature/flower_yellowA', 'nature/mushroom_redGroup', 'nature/grass_large', 'nature/plant_bush'],
    pit: { deep: 0x2f7fbf, shallow: 0x6fd0e8, foam: 0xe8fbff },
    door: 'dungeon/gate',
  },
  dungeon: {
    floor: [0x8a88a8, 0x807e9e], edge: 0x5d5b78, ground: 0x2a2838, fog: 0x3a3850, sky: 0x2a2838,
    sun: 0xffd6a8, sunIntensity: 2.2, hemi: [0xc8c0ff, 0x3a3048], hemiIntensity: 1.2,
    blocks: ['dungeon/column', 'dungeon/barrel', 'dungeon/stones', 'dungeon/rocks'],
    border: ['dungeon/wall'],
    props: ['dungeon/pot', 'dungeon/barrel', 'dungeon/banner', 'dungeon/chest'],
    pit: { deep: 0x05040a, shallow: 0x251f3a, foam: 0x6a5aa0 },
    door: 'dungeon/gate',
    torches: true,
  },
  graveyard: {
    floor: [0x6f7f6a, 0x667862], edge: 0x4a5a48, ground: 0x283428, fog: 0x3c4a50, sky: 0x2c3844,
    sun: 0xc8d8ff, sunIntensity: 1.8, hemi: [0xa8c0ff, 0x2a3024], hemiIntensity: 1.3,
    blocks: ['graveyard/gravestone-cross', 'graveyard/gravestone-round', 'graveyard/crypt-small', 'graveyard/rocks-tall', 'graveyard/pillar-large'],
    border: ['graveyard/pine', 'graveyard/pine-crooked', 'graveyard/iron-fence'],
    props: ['graveyard/pumpkin-carved', 'graveyard/grave', 'graveyard/debris', 'graveyard/trunk'],
    pit: { deep: 0x0a1a18, shallow: 0x2a5a48, foam: 0x7fffc0 },
    door: 'graveyard/iron-fence-border-gate',
    torches: true,
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
    scene.add(this.hemi, this.sun, this.sun.target);
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
    scene.fog = new THREE.Fog(theme.fog, 22, 42);
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
    const groundMaterial = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.disposables.push(groundGeometry, groundMaterial);

    // Checker floor: one tile per cell, vertex colours, a slight bevel shade at the rim.
    const tile = new THREE.BoxGeometry(0.98, 0.2, 0.98);
    tile.translate(0, -0.1, 0);
    const floorMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
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
    const rimMaterial = new THREE.MeshStandardMaterial({ color: theme.edge, roughness: 1 });
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

    // Blocks: one prop per cell, turned and scaled a little at random.
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (arena.cells[r * W + c] !== CELL.BLOCK) continue;
        const name = theme.blocks[Math.floor(random() * theme.blocks.length)];
        const prop = this.assets.clone(name);
        prop.position.set(c - halfW + 0.5, 0, r - halfH + 0.5);
        prop.rotation.y = Math.floor(random() * 4) * (Math.PI / 2) + (random() - 0.5) * 0.3;
        prop.scale.setScalar(name.includes('crypt') ? 0.72 : name.includes('column') || name.includes('pillar') ? 1.4 : 1.05);
        this.root.add(prop);
      }
    }

    // Around the arena: a ring of trees, walls or fences, and small props.
    const border = theme.border;
    const ring = [];
    for (let x = -halfW - 0.5; x <= halfW + 0.5; x += 1) {
      ring.push([x, -halfH - 0.7, 0], [x, halfH + 0.7, Math.PI]);
    }
    for (let z = -halfH + 0.5; z <= halfH - 0.5; z += 1) ring.push([-halfW - 0.7, z, Math.PI / 2], [halfW + 0.7, z, -Math.PI / 2]);
    for (const [x, z, rot] of ring) {
      // Leave the door opening free.
      if (z < -halfH && Math.abs(x) < 1.1) continue;
      const name = border[Math.floor(random() * border.length)];
      const prop = this.assets.clone(name);
      const wall = name.includes('wall') || name.includes('fence');
      prop.position.set(x + (wall ? 0 : (random() - 0.5) * 0.3), 0, z + (wall ? 0 : (random() - 0.5) * 0.3));
      prop.rotation.y = wall ? rot : random() * Math.PI * 2;
      prop.scale.setScalar(wall ? 1.05 : 0.9 + random() * 0.5);
      this.root.add(prop);
    }
    // A second, looser ring further out for depth.
    for (let i = 0; i < 44; i++) {
      const side = i % 4;
      const t = random();
      let x;
      let z;
      if (side === 0) [x, z] = [-halfW - 2 - random() * 3, (t - 0.5) * (H + 6)];
      else if (side === 1) [x, z] = [halfW + 2 + random() * 3, (t - 0.5) * (H + 6)];
      else if (side === 2) [x, z] = [(t - 0.5) * (W + 8), -halfH - 2 - random() * 3];
      else [x, z] = [(t - 0.5) * (W + 8), halfH + 2 + random() * 3];
      const pool = theme.border.filter((b) => !b.includes('wall') && !b.includes('fence'));
      const name = (pool.length ? pool : theme.props)[Math.floor(random() * (pool.length || theme.props.length))];
      const prop = this.assets.clone(name);
      prop.position.set(x, 0, z);
      prop.rotation.y = random() * Math.PI * 2;
      prop.scale.setScalar(1 + random() * 0.8);
      this.root.add(prop);
    }
    // Small props on the floor edges (no gameplay effect).
    for (let i = 0; i < 6; i++) {
      const name = theme.props[Math.floor(random() * theme.props.length)];
      const prop = this.assets.clone(name);
      const onLeft = random() < 0.5;
      prop.position.set(onLeft ? -halfW - 0.2 : halfW + 0.2, 0, (random() - 0.5) * (H - 2));
      prop.rotation.y = random() * Math.PI * 2;
      prop.scale.setScalar(0.8);
      this.root.add(prop);
    }

    // Torches (dungeon, graveyard): glowing flames, no real lights (cheap on phones).
    if (theme.torches) {
      for (const [x, z] of [[-halfW - 0.4, -halfH + 3], [halfW + 0.4, -halfH + 3], [-halfW - 0.4, halfH - 3], [halfW + 0.4, halfH - 3]]) {
        const post = this.assets.clone(themeId === 'graveyard' ? 'graveyard/lightpost-single' : 'graveyard/fire-basket');
        post.position.set(x, 0, z);
        this.root.add(post);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: themeId === 'graveyard' ? 0x9fffd0 : 0xffb050, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.position.set(x, themeId === 'graveyard' ? 1.05 : 0.62, z);
        this.root.add(flame);
        this.disposables.push(flame.geometry, flame.material);
        this.torches.push(flame);
      }
    }

    // The door at the top: closed until the room is cleared.
    const door = this.assets.clone(theme.door);
    door.position.set(0, 0, -halfH - 0.15);
    door.scale.setScalar(theme.door.includes('gate') && theme.door.startsWith('dungeon') ? 2 : 1.6);
    this.root.add(door);
    const glowGeometry = new THREE.PlaneGeometry(1.6, 1.4);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(0, 0.7, -halfH - 0.2);
    this.root.add(glow);
    this.disposables.push(glowGeometry, glowMaterial);
    this.door = { mesh: door, glow, open: 0, target: 0, baseY: 0 };
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
    if (this.sharedWater) this.sharedWater.uniforms.uTime.value = this.time;
    for (let i = 0; i < this.torches.length; i++) {
      const s = 1 + Math.sin(this.time * 9 + i * 1.7) * 0.12 + Math.sin(this.time * 23 + i) * 0.06;
      this.torches[i].scale.set(s, s * 1.3, s);
    }
    const door = this.door;
    if (door) {
      door.open += (door.target - door.open) * Math.min(1, dt * 3);
      door.mesh.position.y = -door.open * 1.4;
      door.glow.material.opacity = door.open * (0.45 + Math.sin(this.time * 4) * 0.15);
    }
  }
}
