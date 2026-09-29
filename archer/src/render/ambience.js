import * as THREE from 'three';

// Atmosphere of a room, all animated on the GPU (no per-frame CPU work):
// floating motes (pollen, embers, spirits), light shafts and low mist.

const MOTE_VERTEX = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform float uSize;
uniform vec3 uBox;
uniform float uRise;
varying float vAlpha;
void main() {
  float t = uTime * (0.3 + seed.w * 0.4) + seed.w * 50.0;
  vec3 p = position;
  p.x += sin(t * 0.7 + seed.x * 6.28) * 0.6;
  p.z += cos(t * 0.5 + seed.y * 6.28) * 0.6;
  // Rising motes loop from the floor to the top of the box.
  p.y = mod(p.y + uTime * uRise * (0.5 + seed.z), uBox.y) + 0.1;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + seed.z * 3.0) + seed.x * 20.0);
  float fade = smoothstep(0.0, 0.6, p.y) * smoothstep(uBox.y, uBox.y - 0.8, p.y);
  vAlpha = twinkle * fade;
  gl_PointSize = uSize * (0.6 + seed.z * 0.8) * (10.0 / -mv.z);
}`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d));
  gl_FragColor = vec4(uColor * a * vAlpha, a * vAlpha);
}`;

const SHAFT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uPhase;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float fall = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  float pulse = 0.75 + 0.25 * sin(uTime * 0.6 + uPhase);
  gl_FragColor = vec4(uColor * edge * fall * pulse * uOpacity, 1.0);
}`;

const MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv * vec2(5.0, 8.0);
  float m = n(p + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + n(p * 2.2 - vec2(uTime * 0.08, 0.0)) * 0.4;
  float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  float a = smoothstep(0.35, 0.85, m) * edge * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

// Per theme: motes (colour, count, size, rise speed), shafts, mist.
export const AMBIENCE = {
  forest: { motes: [[0xfff0a0, 70, 0.9, 0.12], [0xb8ff8a, 30, 0.7, 0.05]], shafts: { color: 0xfff1c0, count: 4, opacity: 0.09 } },
  dungeon: { motes: [[0xff9a40, 60, 0.8, 0.35], [0xd8c8ff, 30, 0.6, 0.06]], shafts: { color: 0xffd9a0, count: 3, opacity: 0.07 } },
  graveyard: { motes: [[0x8affc8, 50, 1, 0.1], [0xc8d8ff, 30, 0.7, 0.04]], mist: { color: 0xa8c4d8, opacity: 0.32 } },
  mines: { motes: [[0x9ff0ff, 60, 0.9, 0.08], [0xd8a8ff, 35, 0.7, 0.04]] },
  // A negative rise makes the motes fall: snow.
  tundra: { motes: [[0xffffff, 150, 1.2, -0.35], [0xd8ecff, 60, 0.8, -0.2]], shafts: { color: 0xffffff, count: 3, opacity: 0.06 } },
  swamp: { motes: [[0xd8ff6a, 55, 0.9, 0.05], [0xfff0a0, 25, 0.7, 0.03]], mist: { color: 0xb8d0a0, opacity: 0.34 } },
  volcano: { motes: [[0xff8a3a, 100, 0.8, 0.55], [0xffd070, 40, 0.6, 0.3]] },
  citadel: { motes: [[0xc89aff, 60, 0.9, 0.08], [0xff9ad8, 20, 0.7, 0.04]], mist: { color: 0x8a6ab8, opacity: 0.3 } },
  desert: { motes: [[0xffe0a8, 90, 0.7, 0.06], [0xfff4d8, 30, 0.5, 0.03]], shafts: { color: 0xfff0c8, count: 4, opacity: 0.08 } },
  sakura: { motes: [[0xffa8d0, 120, 1.2, -0.18], [0xffffff, 40, 0.8, -0.12]], shafts: { color: 0xfff0f4, count: 4, opacity: 0.08 } },
  autumn: { motes: [[0xff8a3a, 90, 1.2, -0.2], [0xffd050, 50, 1, -0.15]], shafts: { color: 0xffd8a0, count: 4, opacity: 0.1 } },
  abyss: { motes: [[0xc8ffff, 90, 0.9, 0.45], [0x6affe8, 50, 0.7, 0.12]], shafts: { color: 0x9afff0, count: 5, opacity: 0.1 }, mist: { color: 0x4ab8c0, opacity: 0.22 } },
  sky: { motes: [[0xffffff, 60, 0.9, 0.06], [0xfff0a0, 30, 0.7, 0.1]], shafts: { color: 0xffffff, count: 5, opacity: 0.1 }, mist: { color: 0xffffff, opacity: 0.25 } },
  jungle: { motes: [[0xd8ff6a, 70, 0.9, 0.05], [0xff9ad8, 25, 0.7, 0.04]], mist: { color: 0xc8e8c0, opacity: 0.3 }, shafts: { color: 0xf0ffc8, count: 3, opacity: 0.08 } },
  storm: { motes: [[0xd8e8ff, 220, 0.7, -2.6], [0x8ad0ff, 30, 0.8, 0.05]], mist: { color: 0x8a9ab8, opacity: 0.25 } },
  void: { motes: [[0xd08aff, 80, 1, 0.2], [0x6a3ab8, 40, 0.8, 0.06]], mist: { color: 0x6a3a9a, opacity: 0.32 } },
  golden: { motes: [[0xffe070, 80, 0.9, 0.1], [0xffffff, 25, 0.6, 0.05]], shafts: { color: 0xfff0b0, count: 5, opacity: 0.1 } },
  celestial: { motes: [[0xfff4c0, 90, 1, 0.12], [0xc8d8ff, 50, 0.8, 0.06]], shafts: { color: 0xfff4d8, count: 4, opacity: 0.09 }, mist: { color: 0xb8b8ff, opacity: 0.2 } },
};

export class Ambience {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.time = { value: 0 };
    this.disposables = [];
  }

  clear() {
    for (const child of [...this.root.children]) this.root.remove(child);
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
  }

  build(themeId, halfW, halfH, scale = 1) {
    this.clear();
    const theme = AMBIENCE[themeId];
    if (!theme) return;
    for (const [color, count, size, rise] of theme.motes) this.addMotes(color, Math.round(count * scale), size, rise, halfW, halfH);
    if (theme.shafts && scale > 0.6) this.addShafts(theme.shafts, halfW, halfH);
    if (theme.mist && scale > 0.6) this.addMist(theme.mist, halfW, halfH);
  }

  addMotes(color, count, size, rise, halfW, halfH) {
    if (count <= 0) return;
    const box = new THREE.Vector3(halfW * 2 + 2, 3.2, halfH * 2 + 2);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      positions.set([(Math.random() - 0.5) * box.x, Math.random() * box.y, (Math.random() - 0.5) * box.z], i * 3);
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uSize: { value: size * 6 }, uBox: { value: box }, uRise: { value: rise }, uColor: { value: new THREE.Color(color).multiplyScalar(1.6) } },
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 20;
    this.root.add(points);
    this.disposables.push(geometry, material);
  }

  /** Slanted beams of light falling across the arena from the top-left. */
  addShafts({ color, count, opacity }, halfW, halfH) {
    const geometry = new THREE.PlaneGeometry(1.4, 9);
    geometry.translate(0, 4.5, 0);
    this.disposables.push(geometry);
    for (let i = 0; i < count; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: this.time, uPhase: { value: i * 1.9 }, uOpacity: { value: opacity * (0.7 + Math.random() * 0.6) } },
        vertexShader: SHAFT_VERTEX,
        fragmentShader: SHAFT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const shaft = new THREE.Mesh(geometry, material);
      shaft.position.set(-halfW + (i + 0.5) * (halfW * 2) / count + (Math.random() - 0.5), -0.2, -halfH + 2 + Math.random() * (halfH * 2 - 4));
      shaft.rotation.set(0, -0.5, 0.55);
      shaft.scale.x = 0.7 + Math.random() * 0.9;
      shaft.renderOrder = 19;
      this.root.add(shaft);
      this.disposables.push(material);
    }
  }

  /** A layer of drifting mist just above the floor. */
  addMist({ color, opacity }, halfW, halfH) {
    const geometry = new THREE.PlaneGeometry(halfW * 2 + 6, halfH * 2 + 6);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: this.time, uOpacity: { value: opacity } },
      vertexShader: SHAFT_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const mist = new THREE.Mesh(geometry, material);
    mist.position.y = 0.22;
    mist.renderOrder = 18;
    this.root.add(mist);
    this.disposables.push(geometry, material);
  }

  update(dt) {
    this.time.value += dt;
  }
}
