import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParticleSystem } from './particles.js';

export const COLORS = {
  spark: new THREE.Color(0xfff2b0),
  soul: new THREE.Color(0xd8f4ff),
  arrow: new THREE.Color(0xfff6d8),
  fire: new THREE.Color(0xff8a2a),
  ice: new THREE.Color(0x8fe0ff),
  poison: new THREE.Color(0x8dff4a),
  bolt: new THREE.Color(0xc9a0ff),
  blood: new THREE.Color(0xff3a4a),
  xp: new THREE.Color(0x5fe8ff),
  coin: new THREE.Color(0xffd23f),
  heart: new THREE.Color(0xff5a7a),
  dust: new THREE.Color(0xd8c8a8),
  smoke: new THREE.Color(0x8a8898),
  danger: new THREE.Color(0xff3a2a),
  heal: new THREE.Color(0x7dff9a),
  magic: new THREE.Color(0xd08cff),
  shadow: new THREE.Color(0xa070ff),
};

const SHOT_COLORS = { orb: 0xff3a6a, arrow: 0xf4ecd8, bone: 0xf4f0e0, rock: 0xa07a50 };
const SHOT_GLOW = { orb: 0xff3a9a, arrow: 0xffc070, bone: 0xd8f0ff, rock: 0xff8a2a };
const RARITY_COLORS = [0xd8e0ea, 0x4fb4ff, 0xc070ff, 0xffc93c];
const ORB_COLORS = { fire: 0xff8a2a, ice: 0x8fe0ff, bolt: 0xc9a0ff };
const Y = 0.55;
const WHITE = new THREE.Color(1, 1, 1);
// Above 1: these glow through the bloom pass.
const HDR = { core: 2.2, halo: 1.5, orb: 2.4 };

// Loot: a column of light in the item's rarity colour (open cylinder, fading upward).
const BEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = uv;
  vTint = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  float fade = pow(1.0 - vUv.y, 1.6);
  float edge = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 3.0 + uTime * 2.0);
  float flow = 0.7 + 0.3 * sin(vUv.y * 18.0 - uTime * 5.0);
  gl_FragColor = vec4(vTint * fade * edge * flow * 0.9, 1.0);
}`;

/** A flat star of `points` branches (outer / inner radius) with a hole: the shuriken. */
function starShape(points, outer, inner, hole) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 4;
    const r = i % 2 ? inner : outer;
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  return shape;
}

/** Thin flat piece from a 2D shape, lying in the ground plane, centred. */
function flatPiece(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.4, bevelSegments: 1, curveSegments: 8 });
  g.center();
  g.rotateX(-Math.PI / 2);
  return g.toNonIndexed();
}

/**
 * The hero's projectile models, one per weapon (the bow keeps the classic arrow):
 * long arrow, crossbow bolt, shuriken, twin-bladed glaive and the tome's sigil.
 */
export function weaponShotGeometries() {
  const tube = (r, length, z, sides = 6) => new THREE.CylinderGeometry(r, r, length, sides).rotateX(Math.PI / 2).translate(0, 0, z).toNonIndexed();
  const cone = (r, length, z, sides) => new THREE.ConeGeometry(r, length, sides).rotateX(Math.PI / 2).translate(0, 0, z).toNonIndexed();
  const vane = (w, length, z, angle) => new THREE.BoxGeometry(w, 0.008, length).rotateZ(angle).translate(0, 0, z).toNonIndexed();
  // Longbow: a long shaft, a wide flat broadhead, long double vanes.
  const broadhead = new THREE.ConeGeometry(0.075, 0.2, 4).rotateX(Math.PI / 2).scale(1, 0.35, 1).translate(0, 0, 0.5).toNonIndexed();
  const longbow = mergeGeometries([tube(0.016, 0.85, 0.02), broadhead, vane(0.13, 0.2, -0.32, 0), vane(0.13, 0.2, -0.32, Math.PI / 2)]);
  // Crossbow bolt: short and thick, a square pyramid tip, short stiff vanes.
  const crossbow = mergeGeometries([tube(0.03, 0.36, 0, 6), cone(0.065, 0.13, 0.24, 4), tube(0.04, 0.03, 0.16, 6), vane(0.1, 0.09, -0.15, 0), vane(0.1, 0.09, -0.15, Math.PI / 2)]);
  // Shuriken: a four-branched steel star.
  const shuriken = flatPiece(starShape(4, 0.2, 0.055, 0.03), 0.018);
  // Twin blades: two curved blades around a hub, spinning like a glaive.
  const blade = new THREE.Shape();
  blade.moveTo(0.04, -0.03);
  blade.quadraticCurveTo(0.2, -0.06, 0.27, 0.07);
  blade.quadraticCurveTo(0.16, 0.0, 0.04, 0.03);
  blade.lineTo(0.04, -0.03);
  const half = flatPiece(blade, 0.014);
  half.translate(0.13, 0, 0);
  const other = half.clone().rotateY(Math.PI);
  const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).toNonIndexed();
  const blades = mergeGeometries([half, other, hub]);
  // Tome: a golden sigil, a six-pointed star in a ring.
  const ring = new THREE.RingGeometry(0.14, 0.17, 24).rotateX(-Math.PI / 2).toNonIndexed();
  const sigil = mergeGeometries([ring, flatPiece(starShape(6, 0.13, 0.065, 0.025), 0.01)]);
  return { longbow, crossbow, shuriken, blades, sigil };
}

// Arrow streak: a flat glowing ribbon trailing behind each arrow, brightest at the head.
const STREAK_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = uv;
  vTint = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const STREAK_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  float along = pow(1.0 - vUv.y, 1.8);
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  gl_FragColor = vec4(vTint * along * across * across, 1.0);
}`;

// Anime hit sparks: camera-facing four-pointed stars, turned by the instance's angle.
const STAR_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vTint = instanceColor;
  float size = length(instanceMatrix[0].xyz);
  float angle = atan(instanceMatrix[0].y, instanceMatrix[0].x);
  vec2 q = position.xy;
  vUv = q;
  q = vec2(q.x * cos(angle) - q.y * sin(angle), q.x * sin(angle) + q.y * cos(angle));
  vec4 center = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  center.xy += q * size;
  gl_Position = projectionMatrix * center;
}`;

const STAR_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec2 p = vUv * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float cross = max(0.0, 1.0 - abs(p.x) * 9.0) * (1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 9.0) * (1.0 - abs(p.x));
  float diag = max(0.0, 1.0 - abs(p.x - p.y) * 7.0) + max(0.0, 1.0 - abs(p.x + p.y) * 7.0);
  float core = pow(max(0.0, 1.0 - r * 2.2), 2.0);
  float a = cross * 1.2 + diag * 0.35 * (1.0 - r) + core * 1.5;
  gl_FragColor = vec4(vTint * a + vec3(core), 1.0);
}`;

// Monster spells: a camera-facing glow with slowly turning rays around each shot.
const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = position.xy;
  vTint = instanceColor;
  vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz);
  center.xy += position.xy * size;
  gl_Position = projectionMatrix * center;
}`;

const GLOW_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRays;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  float r = length(vUv) * 2.0;
  if (r > 1.0) discard;
  float rays = 0.0;
  if (uRays > 0.5) {
    float a = atan(vUv.y, vUv.x);
    rays = pow(max(0.0, cos(a * 3.0 + uTime * 4.0)), 8.0) + pow(max(0.0, cos(a * 5.0 - uTime * 6.0)), 12.0) * 0.6;
  }
  float glow = pow(1.0 - r, 2.2);
  float core = smoothstep(0.35, 0.0, r);
  vec3 c = vTint * (glow * 1.2 + rays * (1.0 - r) * 0.9) + vec3(1.0) * core * 0.9;
  gl_FragColor = vec4(c, 1.0);
}`;

// Danger circles: a rune circle with a turning dashed ring, filling up to the blast.
const RUNE_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RUNE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x);
  float urgent = smoothstep(0.6, 1.0, uProgress);
  float edge = smoothstep(0.9, 0.95, r) * (1.0 - smoothstep(0.985, 1.0, r));
  float dashes = step(0.45, fract(a * 16.0 / 6.2832 + uTime * 0.35)) * smoothstep(0.78, 0.8, r) * (1.0 - smoothstep(0.84, 0.86, r));
  float inner = smoothstep(0.47, 0.49, r) * (1.0 - smoothstep(0.51, 0.53, r)) * 0.6;
  float spokes = pow(max(0.0, cos(a * 3.0 - uTime * 1.2)), 60.0) * smoothstep(0.5, 0.55, r) * (1.0 - smoothstep(0.78, 0.8, r));
  float fill = (1.0 - step(uProgress, r)) * (0.22 + 0.18 * r);
  float front = exp(-abs(r - uProgress) * 28.0) * step(0.02, uProgress);
  float pulse = 0.75 + 0.25 * sin(uTime * (8.0 + urgent * 22.0));
  float alpha = (edge * 0.95 + dashes * 0.7 + inner + spokes * 0.8) * pulse + fill + front * 0.9;
  vec3 c = mix(uColor, vec3(1.0, 0.95, 0.8), front * 0.6 + urgent * 0.15);
  gl_FragColor = vec4(c * (1.0 + urgent * 0.6), clamp(alpha, 0.0, 1.0));
}`;

// Aim lines: a soft lane with chevrons running toward the target.
const LANE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LANE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uLength;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float along = 1.0 - vUv.y;
  float sides = smoothstep(0.75, 1.0, across);
  float body = (1.0 - across) * 0.35;
  float chevron = step(0.72, fract(along * uLength * 0.9 - uTime * 3.0 - across * 0.6)) * (1.0 - across);
  float fade = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.7, 1.0, along));
  float a = (body + sides * 0.8 + chevron * 0.9) * fade * uOpacity;
  gl_FragColor = vec4(uColor * 1.4, a);
}`;

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const hdrColor = new THREE.Color();

/**
 * Arrows, monster shots, pickups, danger circles, aim lines, orbiting orbs,
 * lightning and particles. Instanced meshes: a handful of draw calls in total.
 */
export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.scale = 1;
    this.time = 0;
    this.sparks = new ParticleSystem(scene, { capacity: 900, additive: true });
    this.puffs = new ParticleSystem(scene, { capacity: 400, additive: false, softness: 0.5 });

    // Arrows: shaft + head + fletching merged.
    const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5);
    shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.05, 0.14, 6);
    head.rotateX(Math.PI / 2);
    head.translate(0, 0, 0.3);
    const fletch = new THREE.BoxGeometry(0.1, 0.01, 0.1);
    fletch.translate(0, 0, -0.22);
    const arrowGeometry = mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed(), fletch.toNonIndexed()]);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.25), toneMapped: false }), 240);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.pillars = [];
    scene.add(this.arrowMesh);
    // Behind each arrow: from the head (z = 0) back to the tail (z = -1), lying flat.
    const streak = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    this.streakMesh = new THREE.InstancedMesh(streak, new THREE.ShaderMaterial({
      vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), 240);
    this.streakMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.renderOrder = 23;
    scene.add(this.streakMesh);

    // Kunai: a dark steel blade with a ring pommel (the assassin's throws).
    const blade = new THREE.OctahedronGeometry(0.08, 0);
    blade.scale(0.7, 0.25, 2.6);
    blade.translate(0, 0, 0.12);
    const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 5);
    grip.rotateX(Math.PI / 2);
    grip.translate(0, 0, -0.08);
    const pommel = new THREE.TorusGeometry(0.035, 0.012, 5, 10);
    pommel.translate(0, 0, -0.19);
    const kunai = mergeGeometries([blade, grip.toNonIndexed(), pommel.toNonIndexed()]);
    this.kunaiMesh = new THREE.InstancedMesh(kunai, new THREE.MeshStandardMaterial({ color: 0x9aa4c0, metalness: 0.85, roughness: 0.25, emissive: 0x4a2a8a, emissiveIntensity: 0.6 }), 240);
    this.kunaiMesh.frustumCulled = false;
    scene.add(this.kunaiMesh);

    // The other weapons' projectiles (instance colour: white, or the hero's element).
    const shots = weaponShotGeometries();
    // Bright steel: it must read against any floor, seen from above.
    const steel = () => new THREE.MeshStandardMaterial({ color: 0xf0f4ff, metalness: 0.6, roughness: 0.3, emissive: 0x8a96b4, emissiveIntensity: 0.75 });
    this.weaponShots = {
      longbow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.2), toneMapped: false }),
      crossbow: new THREE.MeshStandardMaterial({ color: 0xe0b878, metalness: 0.4, roughness: 0.4, emissive: 0x8a6030, emissiveIntensity: 0.7 }),
      shuriken: steel(),
      blades: steel(),
      sigil: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe070).multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    for (const [id, material] of Object.entries(this.weaponShots)) {
      const mesh = new THREE.InstancedMesh(shots[id], material, 160);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3).fill(1), 3);
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (id === 'sigil') mesh.renderOrder = 24;
      scene.add(mesh);
      this.weaponShots[id] = mesh;
    }

    // Monster shots: a bright core and an additive halo.
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    this.shotCore = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ toneMapped: false }), 300);
    this.glowTime = { value: 0 };
    this.shotHalo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uTime: this.glowTime, uRays: (this.glowRays = { value: 1 }) }, vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 300);
    this.shotHalo.renderOrder = 25;
    for (const m of [this.shotCore, this.shotHalo]) {
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
      scene.add(m);
    }

    // Pickups.
    const gem = new THREE.OctahedronGeometry(0.1, 0);
    this.xpMesh = new THREE.InstancedMesh(gem, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ff0ff).multiplyScalar(1.8), toneMapped: false }), 300);
    const coin = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14);
    coin.rotateX(Math.PI / 2);
    this.coinMesh = new THREE.InstancedMesh(coin, new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.6, roughness: 0.3, emissive: 0xb07800, emissiveIntensity: 1.4 }), 300);
    const heart = new THREE.SphereGeometry(0.14, 10, 8);
    this.heartMesh = new THREE.InstancedMesh(heart, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a6a).multiplyScalar(1.6), toneMapped: false }), 20);
    for (const m of [this.xpMesh, this.coinMesh, this.heartMesh]) {
      m.frustumCulled = false;
      scene.add(m);
    }

    // Staff orbs and pet shots (the hero's glowing projectiles).
    this.heroOrbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 120);
    this.heroOrbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
    this.heroOrbs.frustumCulled = false;
    scene.add(this.heroOrbs);

    // Orbiting orbs.
    this.orbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), 8);
    this.orbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.orbMesh.frustumCulled = false;
    scene.add(this.orbMesh);

    // Loot on the floor: a spinning gem in the rarity colour under a column of light; runes.
    this.lootMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 16);
    this.lootMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
    const beam = new THREE.CylinderGeometry(0.1, 0.2, 2.8, 14, 1, true).translate(0, 1.4, 0);
    this.beamMesh = new THREE.InstancedMesh(beam, new THREE.ShaderMaterial({
      uniforms: { uTime: this.glowTime }, vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), 16);
    this.beamMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
    this.beamMesh.renderOrder = 24;
    this.runeMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc890ff).multiplyScalar(2.2), toneMapped: false }), 30);
    for (const m of [this.lootMesh, this.beamMesh, this.runeMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }

    // Hit stars (pooled, one draw call).
    this.starList = [];
    this.starMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
    }), 64);
    this.starMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    this.starMesh.frustumCulled = false;
    this.starMesh.renderOrder = 30;
    this.starMesh.count = 0;
    scene.add(this.starMesh);

    // Danger circles and aim lines (pooled meshes).
    this.hazardPool = [];
    this.hazardGeometry = { ring: new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2) };
    this.lines = [];
    this.lineGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.bolts = [];
    this.floorRings = [];
    this.ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
  }

  /**
   * Creates the pooled effect meshes ahead of time and shows them all, so that one
   * compile pass (behind a fade) prepares their shaders; `prewarm(false)` hides them.
   * Without it the first bomb, aim line or lightning of a run stutters on phones.
   */
  prewarm(on) {
    if (on) {
      if (!this.hazardPool.length) {
        this.addHazard({ x: 0, z: -99, radius: 0.1, delay: 1, max: 1 });
        this.addHazard({ x: 0, z: -99, radius: 0.1, delay: 1, max: 1 }, 0xffffff);
      }
      if (!this.lines.length) this.addLine({ x: 0, z: -99, aimX: 0, aimZ: 1, radius: 0.3, dead: true, state: 'idle' }, 'line', 0);
      if (!this.floorRings.length) this.ring(0, -99, 0.1, 0.01, COLORS.spark);
      if (!this.bolts.length) this.lightning(0, -99, 0.1, -99);
      this.warmList = [...this.hazardPool.map((h) => h.mesh), ...this.lines.map((l) => l.mesh), ...this.floorRings.map((r) => r.mesh), ...this.bolts.map((b) => b.line),
        this.lootMesh, this.beamMesh, this.runeMesh, this.starMesh, this.heroOrbs, this.orbMesh, this.kunaiMesh, this.shotCore, this.shotHalo, this.xpMesh, this.coinMesh, this.heartMesh, this.arrowMesh, this.streakMesh,
        ...Object.values(this.weaponShots)];
      for (const m of this.warmList) {
        m.userData.wasVisible = m.visible;
        m.visible = true;
        if (m.isInstancedMesh) {
          m.userData.wasCount = m.count;
          m.count = Math.max(1, m.count);
        }
      }
    } else if (this.warmList) {
      for (const m of this.warmList) {
        m.visible = m.userData.wasVisible;
        if (m.isInstancedMesh) m.count = m.userData.wasCount;
      }
      for (const h of this.hazardPool) h.active = false;
      for (const l of this.lines) l.active = false;
      this.warmList = null;
    }
  }

  setViewport(height, fov) {
    this.sparks.setViewport(height, fov);
    this.puffs.setViewport(height, fov);
  }

  count(n) {
    return Math.max(1, Math.round(n * this.scale));
  }

  clear() {
    this.starList.length = 0;
    this.pillars.length = 0;
    this.sparks.clear();
    this.puffs.clear();
    for (const h of this.hazardPool) h.active = false;
    for (const l of this.lines) l.active = false;
    for (const b of this.bolts) b.life = 0;
    for (const r of this.floorRings) r.life = 0;
  }

  // ------------------------------------------------------------ one-shot effects

  /** An anime hit star at (x, y, z): pops open fast, then shrinks. */
  star(x, y, z, size, c, life = 0.18) {
    if (this.starList.length >= 64) this.starList.shift();
    this.starList.push({ x, y, z, size, life, max: life, color: c.clone ? c.clone() : new THREE.Color(c), angle: Math.random() * Math.PI });
  }

  hit(x, z, crit, element) {
    const c = element === 'fire' ? COLORS.fire : element === 'ice' ? COLORS.ice : element === 'poison' ? COLORS.poison : COLORS.spark;
    this.star(x + (Math.random() - 0.5) * 0.3, Y + 0.15, z + (Math.random() - 0.5) * 0.3, crit ? 1.5 : 0.75, c, crit ? 0.24 : 0.16);
    this.sparks.burst(x, Y, z, this.count(crit ? 14 : 7), crit ? 4 : 2.6, c, crit ? 0.16 : 0.11, 0.3, { gravity: 5, brightness: 1.7 });
    if (crit) this.flash(x, Y, z, 0.9, COLORS.spark);
  }

  /** Assassin vanishing / appearing: a burst of violet smoke and sparks. */
  shadowPuff(x, z) {
    this.puffs.burst(x, 0.4, z, this.count(12), 1.6, COLORS.shadow, 0.35, 0.45, { upward: 0.8, drag: 3, endSize: 0.8 });
    this.sparks.burst(x, 0.6, z, this.count(14), 3, COLORS.shadow, 0.1, 0.35, { gravity: 1, brightness: 2 });
  }

  /** Execution: a bright crossed slash on the monster and a ring. */
  execute(x, z, boss) {
    const c = boss ? COLORS.fire : COLORS.shadow;
    this.star(x, 0.8, z, boss ? 3.4 : 2.2, c, 0.3);
    this.flash(x, 0.7, z, boss ? 2.2 : 1.5, c);
    this.sparks.burst(x, 0.6, z, this.count(boss ? 40 : 24), boss ? 6 : 4.5, c, 0.14, 0.45, { gravity: 3, brightness: 2.2 });
    this.ring(x, z, boss ? 2.6 : 1.6, 0.45, c);
  }

  flash(x, y, z, size, c = COLORS.spark) {
    this.sparks.emit(x, y, z, 0, 0, 0, c, size, 0.1, { endSize: size * 1.4, drag: 0, brightness: 2 });
  }

  death(x, z, big, tint = COLORS.smoke) {
    this.star(x, 0.7, z, big ? 4 : 1.8, COLORS.spark, big ? 0.45 : 0.26);
    this.puffs.burst(x, 0.3, z, this.count(big ? 30 : 12), big ? 3 : 1.8, tint, big ? 0.5 : 0.3, 0.8, { upward: 0.6, drag: 2.5, endSize: big ? 1.4 : 0.7 });
    this.sparks.burst(x, 0.5, z, this.count(big ? 40 : 10), big ? 5 : 2.5, COLORS.spark, 0.12, 0.5, { gravity: 4, brightness: 1.6 });
    this.ring(x, z, big ? 3 : 0.9, big ? 0.7 : 0.35, COLORS.spark);
    // The soul drifts up in slow motes of light.
    const n = this.count(big ? 18 : 6);
    for (let i = 0; i < n; i++) {
      this.sparks.emit(x + (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, COLORS.soul, 0.12, 0.9 + Math.random() * 0.5, { endSize: 0.02, drag: 0.6, brightness: 2, fadeIn: 0.2 });
    }
    if (big) this.pillar(x, z, COLORS.coin, 1.4, 1.6);
  }

  /** A column of light (level up, portal opening, boss down). */
  pillar(x, z, c, duration = 1, width = 1) {
    if (this.pillars.length >= 6) this.pillars.shift();
    this.pillars.push({ x, z, color: c.clone(), life: duration, max: duration, width });
  }

  /** Little dust puffs under running feet. */
  footstep(x, z, c) {
    this.puffs.burst(x, 0.05, z, this.count(2), 0.5, c, 0.14, 0.45, { upward: 0.5, drag: 3, endSize: 0.35 });
  }

  blast(x, z, radius, c = COLORS.fire) {
    this.star(x, 0.5, z, radius * 1.6, c, 0.28);
    this.sparks.burst(x, 0.2, z, this.count(26 + radius * 10), 4 + radius * 2, c, 0.22, 0.55, { gravity: 3, upward: 0.6, brightness: 1.8 });
    this.puffs.burst(x, 0.15, z, this.count(14), radius * 2.4, COLORS.smoke, 0.5, 0.9, { upward: 0.5, drag: 2.5, endSize: 1.2 });
    this.flash(x, 0.4, z, radius * 1.6, c);
    this.ring(x, z, radius, 0.4, c);
  }

  spawn(x, z) {
    this.puffs.burst(x, 0.1, z, this.count(10), 1.6, COLORS.dust, 0.3, 0.7, { upward: 0.4, drag: 3, endSize: 0.7 });
    this.ring(x, z, 0.7, 0.5, COLORS.magic);
  }

  pickup(x, z, kind) {
    const c = kind === 'coin' ? COLORS.coin : kind === 'heart' ? COLORS.heart : COLORS.xp;
    this.sparks.burst(x, 0.5, z, this.count(kind === 'xp' ? 2 : 5), 1.4, c, 0.08, 0.3, { upward: 0.8, brightness: 1.6 });
  }

  levelUp(x, z) {
    this.pillar(x, z, COLORS.coin, 1.1, 1.3);
    this.star(x, 1, z, 2.6, COLORS.coin, 0.4);
    this.sparks.burst(x, 0.4, z, this.count(50), 3, COLORS.coin, 0.16, 1, { upward: 0.95, gravity: -1.5, drag: 1.2, brightness: 1.8 });
    this.ring(x, z, 2, 0.6, COLORS.coin);
    this.ring(x, z, 1.2, 0.45, COLORS.spark);
  }

  /** A treasure chest bursting open: a fountain of gold. */
  chest(x, z) {
    this.sparks.burst(x, 0.5, z, this.count(70), 4.2, COLORS.coin, 0.18, 1.3, { upward: 0.98, gravity: -5, drag: 0.6, brightness: 2 });
    this.ring(x, z, 2.4, 0.7, COLORS.coin);
    this.flash(x, 0.6, z, 2.2, COLORS.coin);
  }

  heal(x, z) {
    this.sparks.burst(x, 0.3, z, this.count(26), 1.8, COLORS.heal, 0.14, 0.9, { upward: 0.95, gravity: -1.5, brightness: 1.6 });
    this.ring(x, z, 1, 0.5, COLORS.heal);
  }

  dust(x, z, amount = 6) {
    this.puffs.burst(x, 0.08, z, this.count(amount), 1.2, COLORS.dust, 0.2, 0.5, { upward: 0.3, drag: 3, endSize: 0.5 });
  }

  blink(x0, z0, x1, z1) {
    this.puffs.burst(x0, 0.5, z0, this.count(16), 1.6, COLORS.magic, 0.3, 0.6, { upward: 0.5, drag: 2, endSize: 0.6 });
    this.sparks.burst(x1, 0.5, z1, this.count(18), 2, COLORS.magic, 0.12, 0.5, { brightness: 1.8 });
  }

  wallHit(x, z) {
    this.sparks.burst(x, Y, z, this.count(4), 1.6, COLORS.dust, 0.07, 0.25, { gravity: 5 });
  }

  /** Expanding ring on the floor. */
  ring(x, z, radius, duration, c) {
    let r = this.floorRings.find((item) => item.life <= 0);
    if (!r) {
      if (this.floorRings.length >= 16) return;
      const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      r = { mesh, life: 0 };
      this.floorRings.push(r);
    }
    r.mesh.position.set(x, 0.04, z);
    r.mesh.material.color.copy(c);
    r.radius = radius;
    r.life = r.max = duration;
    r.mesh.visible = true;
  }

  lightning(x0, z0, x1, z1) {
    let b = this.bolts.find((item) => item.life <= 0);
    // A storm of chains: reuse the oldest line rather than adding more.
    if (!b && this.bolts.length >= 24) b = this.bolts.reduce((a, c) => (c.life < a.life ? c : a));
    if (!b) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe0c8ff, transparent: true, toneMapped: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      b = { line, life: 0 };
      this.bolts.push(b);
    }
    const pos = b.line.geometry.attributes.position;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const j = i === 0 || i === 7 ? 0 : 0.25;
      pos.setXYZ(i, x0 + (x1 - x0) * t + (Math.random() - 0.5) * j, Y + (Math.random() - 0.5) * j, z0 + (z1 - z0) * t + (Math.random() - 0.5) * j);
    }
    pos.needsUpdate = true;
    b.life = 0.14;
    b.line.visible = true;
    this.sparks.burst(x1, Y, z1, this.count(6), 2, COLORS.bolt, 0.1, 0.25, { brightness: 2 });
  }

  // ------------------------------------------------------------ telegraphs

  /** The hero's ground spells: a rune circle in the spell's colour. */
  addZone(zone, hex) {
    this.addHazard(zone, hex);
  }

  /** A column of sparks falling on a spot (arrow rain, meteor) for `delay` seconds. */
  spellFall(x, z, delay, c, big) {
    const n = this.count(big ? 26 : 8);
    for (let i = 0; i < n; i++) {
      const h = big ? 5 + Math.random() * 2 : 3.5 + Math.random() * 1.5;
      const ox = (Math.random() - 0.5) * (big ? 0.8 : 1.4);
      const oz = (Math.random() - 0.5) * (big ? 0.8 : 1.4);
      const t = delay * (0.7 + Math.random() * 0.3);
      this.sparks.emit(x + ox - 1.2, h, z + oz - 1.2, 1.2 / t, -h / t, 1.2 / t, c, big ? 0.5 + Math.random() * 0.3 : 0.14, t, { endSize: big ? 0.25 : 0.1, drag: 0, brightness: 2.2 });
    }
  }

  /** An expanding wave around the hero (novas). */
  nova(x, z, radius, c) {
    this.ring(x, z, radius, 0.5, c);
    this.ring(x, z, radius * 0.6, 0.35, COLORS.spark);
    this.flash(x, 0.5, z, radius * 1.1, c);
    const n = this.count(40);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = radius * (2.2 + Math.random());
      this.sparks.emit(x, 0.4, z, Math.sin(a) * v, 0.6 + Math.random(), Math.cos(a) * v, c, 0.18, 0.45, { endSize: 0.04, drag: 2.5, brightness: 2 });
    }
    this.puffs.burst(x, 0.15, z, this.count(12), radius * 1.6, COLORS.dust, 0.35, 0.6, { upward: 0.3, drag: 3, endSize: 0.8 });
  }

  /** A streak of light along a dash. */
  trail(x0, z0, x1, z1, c) {
    const n = this.count(24);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.sparks.emit(x0 + (x1 - x0) * t, 0.5 + Math.random() * 0.4, z0 + (z1 - z0) * t, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, c, 0.2, 0.25 + t * 0.25, { endSize: 0.03, drag: 2, brightness: 2 });
    }
    this.puffs.burst(x0, 0.4, z0, this.count(8), 1.2, COLORS.smoke, 0.3, 0.5, { upward: 0.5, drag: 3, endSize: 0.6 });
  }

  /** A boost glowing around the hero (buffs, guard). */
  aura(x, z, c) {
    this.sparks.burst(x, 0.2, z, this.count(36), 2, c, 0.16, 0.9, { upward: 0.95, gravity: -2, drag: 1.4, brightness: 2 });
    this.ring(x, z, 1.4, 0.5, c);
    this.flash(x, 0.8, z, 1.4, c);
  }

  /** Loot on the floor: a burst in the rarity colour. */
  lootDrop(x, z, c) {
    this.sparks.burst(x, 0.4, z, this.count(30), 3, c, 0.16, 0.8, { upward: 0.9, gravity: 3, brightness: 2.2 });
    this.ring(x, z, 1.2, 0.5, c);
  }

  /** Red circle that fills up until the blast. */
  addHazard(h, hex = null) {
    let item = this.hazardPool.find((x) => !x.active);
    if (!item) {
      const material = new THREE.ShaderMaterial({
        uniforms: { uTime: this.glowTime, uProgress: { value: 0 }, uColor: { value: new THREE.Color() } },
        vertexShader: RUNE_VERTEX, fragmentShader: RUNE_FRAGMENT,
        transparent: true, depthWrite: false, toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.hazardGeometry.disc, material);
      // Above the water of the ponds.
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      item = { mesh, active: false };
      this.hazardPool.push(item);
    }
    item.active = true;
    item.hazard = h;
    item.friendly = hex !== null;
    item.mesh.visible = true;
    item.mesh.position.set(h.x, 0.04, h.z);
    item.mesh.scale.setScalar(h.radius);
    item.mesh.rotation.y = Math.random() * Math.PI * 2;
    // Bombs red, ground slams and rocks amber.
    item.mesh.material.uniforms.uColor.value.setHex(hex ?? (h.kind === 'bomb' ? 0xff3a2a : 0xff8a1a));
  }

  /** Aim line in front of a monster ('line' thin, 'dash' wide). */
  addLine(enemy, kind, duration) {
    let item = this.lines.find((x) => !x.active);
    if (!item) {
      const mesh = new THREE.Mesh(this.lineGeometry, new THREE.ShaderMaterial({
        uniforms: { uTime: this.glowTime, uOpacity: { value: 1 }, uLength: { value: 10 }, uColor: { value: new THREE.Color(0xff3a2a) } },
        vertexShader: LANE_VERTEX, fragmentShader: LANE_FRAGMENT,
        transparent: true, depthWrite: false, toneMapped: false,
      }));
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      item = { mesh, active: false };
      this.lines.push(item);
    }
    item.active = true;
    item.enemy = enemy;
    item.kind = kind;
    item.life = item.max = duration;
    item.mesh.visible = true;
  }

  // ------------------------------------------------------------ frame

  update(dt, run) {
    this.time += dt;
    this.frame = (this.frame ?? 0) + 1;
    this.glowTime.value = this.time;
    const t = this.time;
    this.sparks.update(dt);
    this.puffs.update(dt);
    // Hit stars: open in the first third of their life, then close and fade.
    let ns = 0;
    for (const st of this.starList) {
      st.life -= dt;
      if (st.life <= 0) continue;
      const k = 1 - st.life / st.max;
      const grow = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
      dummy.position.set(st.x, st.y, st.z);
      dummy.rotation.set(0, 0, st.angle + k * 0.6);
      dummy.scale.setScalar(Math.max(0.001, st.size * (0.4 + grow * 0.6)));
      dummy.updateMatrix();
      this.starMesh.setMatrixAt(ns, dummy.matrix);
      this.starMesh.setColorAt(ns++, hdrColor.copy(st.color).multiplyScalar(1.6 * grow + 0.2));
    }
    this.starList = this.starList.filter((st) => st.life > 0);
    this.starMesh.count = ns;
    this.starMesh.instanceMatrix.needsUpdate = true;
    this.starMesh.instanceColor.needsUpdate = true;

    for (const r of this.floorRings) {
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(r.radius * (0.3 + k * 0.7));
      r.mesh.material.opacity = (1 - k) * 0.9;
    }
    for (const b of this.bolts) {
      if (b.life <= 0) {
        b.line.visible = false;
        continue;
      }
      b.life -= dt;
      b.line.material.opacity = Math.min(1, b.life * 10);
    }
    if (!run) {
      this.lootMesh.count = this.beamMesh.count = this.runeMesh.count = 0;
      this.kunaiMesh.count = this.streakMesh.count = this.arrowMesh.count = this.shotCore.count = this.shotHalo.count = this.xpMesh.count = this.coinMesh.count = this.heartMesh.count = this.orbMesh.count = this.heroOrbs.count = 0;
      for (const mesh of Object.values(this.weaponShots)) mesh.count = 0;
      return;
    }

    // Each weapon shows its own projectile: arrows (bow, wind arrow), long arrows, crossbow
    // bolts, spinning shurikens and blades, the staff's orbs, the tome's sigils, kunai.
    const hero = run.player;
    const arrowTint = hero.burn ? COLORS.fire : hero.frost ? COLORS.ice : hero.poison ? COLORS.poison : hero.bolt ? COLORS.bolt : COLORS.arrow;
    const elemental = arrowTint !== COLORS.arrow;
    // Steel and wood keep their colour, only tinted by an element.
    const solidTint = elemental ? hdrColor.copy(arrowTint).lerp(WHITE, 0.45).clone() : WHITE;
    const ws = this.weaponShots;
    const counts = { longbow: 0, crossbow: 0, shuriken: 0, blades: 0, sigil: 0 };
    let n = 0;
    let no = 0;
    let nk = 0;
    let nt = 0;
    const streak = (a, k, tint) => {
      if (nt >= 240) return;
      dummy.position.set(a.x, Y - 0.02, a.z);
      dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
      dummy.scale.set(0.15 * k, 1, 1.1 * k);
      dummy.updateMatrix();
      this.streakMesh.setMatrixAt(nt, dummy.matrix);
      this.streakMesh.setColorAt(nt++, hdrColor.copy(tint).multiplyScalar(tint === COLORS.arrow ? 0.9 : 1.4));
    };
    const put = (id, color) => {
      const i = counts[id];
      if (i >= 160) return;
      dummy.updateMatrix();
      ws[id].setMatrixAt(i, dummy.matrix);
      ws[id].setColorAt(i, color);
      counts[id]++;
    };
    for (const a of run.arrows) {
      if (a.kind === 'staff' || a.kind === 'tome' || a.kind === 'pet') {
        if (no >= 120) continue;
        const size = a.kind === 'pet' ? 0.9 : a.kind === 'tome' ? 0.85 : 1.3;
        dummy.position.set(a.x, Y, a.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size * (1 + Math.sin(t * 25 + a.id) * 0.12));
        dummy.updateMatrix();
        this.heroOrbs.setMatrixAt(no, dummy.matrix);
        color.setHex(a.kind === 'pet' ? a.color : a.kind === 'tome' ? 0xffe066 : 0xb890ff);
        this.heroOrbs.setColorAt(no++, hdrColor.copy(color).multiplyScalar(HDR.orb));
        if (a.kind === 'tome') {
          // The tome's sigil turns around its spark, crackling.
          dummy.rotation.set(0, t * 6 + a.id, 0);
          dummy.scale.setScalar(1.15);
          put('sigil', elemental && arrowTint !== COLORS.bolt ? hdrColor.copy(arrowTint).lerp(WHITE, 0.3) : WHITE);
          if ((a.id + Math.floor(t * 30)) % 3 === 0) this.sparks.emit(a.x, Y, a.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, COLORS.bolt, 0.12, 0.15, { endSize: 0.02, drag: 4, brightness: 2.4 });
        }
        this.sparks.emit(a.x, Y, a.z, 0, 0, 0, color, a.kind === 'pet' ? 0.2 : 0.3, 0.22, { endSize: 0.02, drag: 0, brightness: 1.5, opacity: 0.8 });
        continue;
      }
      if (a.kind === 'kunai') {
        if (nk >= 240) continue;
        dummy.position.set(a.x, Y, a.z);
        dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
        dummy.scale.setScalar(1.1);
        dummy.updateMatrix();
        this.kunaiMesh.setMatrixAt(nk++, dummy.matrix);
        if ((a.id + Math.floor(t * 60)) % 2 === 0) this.sparks.emit(a.x - a.dx * 0.2, Y, a.z - a.dz * 0.2, 0, 0, 0, COLORS.shadow, 0.1, 0.16, { endSize: 0.02, drag: 0, brightness: 1.4, opacity: 0.7 });
        continue;
      }
      dummy.position.set(a.x, Y, a.z);
      if (a.kind === 'shuriken' || a.kind === 'blades') {
        // Flat, spinning fast; a glint of steel (or of the element) behind.
        dummy.rotation.set(0, -t * (a.kind === 'shuriken' ? 30 : 22) - a.id, 0);
        dummy.scale.setScalar(a.kind === 'shuriken' ? 1.35 : 1.4);
        put(a.kind, solidTint);
        if ((a.id + Math.floor(t * 60)) % 2 === 0) this.sparks.emit(a.x, Y, a.z, 0, 0, 0, elemental ? arrowTint : COLORS.soul, 0.1, 0.14, { endSize: 0.02, drag: 0, brightness: 1.6, opacity: 0.6 });
        continue;
      }
      if (a.kind === 'longbow' || a.kind === 'crossbow') {
        dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
        dummy.scale.setScalar(a.kind === 'longbow' ? 1.15 : 1.35);
        put(a.kind, a.kind === 'longbow' ? hdrColor.copy(arrowTint).multiplyScalar(elemental ? 1.6 : 1).clone() : solidTint);
        streak(a, a.kind === 'longbow' ? 1.4 : 1.15, arrowTint);
        this.sparks.emit(a.x - a.dx * 0.25, Y, a.z - a.dz * 0.25, 0, 0.1, 0, arrowTint, elemental ? 0.13 : 0.09, 0.18, { endSize: 0.02, drag: 0, brightness: 1.5, opacity: 0.75 });
        continue;
      }
      // The bow's arrows and the wind arrow.
      if (n >= 240) continue;
      dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
      dummy.scale.setScalar(a.kind === 'gale' ? 3.2 : 1);
      // The wind arrow: a thick cyan wake.
      if (a.kind === 'gale') {
        for (let k = 0; k < 3; k++) this.sparks.emit(a.x - a.dx * (0.3 + k * 0.25), Y + (Math.random() - 0.5) * 0.3, a.z - a.dz * (0.3 + k * 0.25), (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, COLORS.ice, 0.32 - k * 0.06, 0.3, { endSize: 0.04, drag: 2, brightness: 2.2 });
      }
      dummy.updateMatrix();
      this.arrowMesh.setMatrixAt(n, dummy.matrix);
      // Arrows glow in the colour of the hero's element (fire, ice, poison, lightning).
      this.arrowMesh.setColorAt(n++, hdrColor.copy(arrowTint).multiplyScalar(elemental ? 2 : 1.25));
      streak(a, a.kind === 'gale' ? 2.2 : 1, arrowTint);
      this.sparks.emit(a.x - a.dx * 0.25, Y, a.z - a.dz * 0.25, 0, 0.1, 0, arrowTint, elemental ? 0.13 : 0.09, 0.18, { endSize: 0.02, drag: 0, brightness: 1.5, opacity: 0.75 });
    }
    for (const [id, mesh] of Object.entries(ws)) {
      mesh.count = counts[id];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.arrowMesh.instanceColor.needsUpdate = true;
    this.streakMesh.count = nt;
    this.streakMesh.instanceMatrix.needsUpdate = true;
    this.streakMesh.instanceColor.needsUpdate = true;
    this.kunaiMesh.count = nk;
    this.kunaiMesh.instanceMatrix.needsUpdate = true;
    this.heroOrbs.count = no;
    this.heroOrbs.instanceMatrix.needsUpdate = true;
    if (this.heroOrbs.instanceColor) this.heroOrbs.instanceColor.needsUpdate = true;

    // Monster shots. In a storm of shots the halos get cheaper (no rays) and the embers stop.
    n = 0;
    const crowded = run.shots.length > 40;
    this.glowRays.value = crowded ? 0 : 1;
    for (const s of run.shots) {
      if (n >= 300) break;
      const size = s.kind === 'orb' ? 0.17 : s.kind === 'rock' ? 0.16 : 0.1;
      dummy.position.set(s.x, Y, s.z);
      dummy.rotation.set(0, Math.atan2(s.dx, s.dz), 0);
      if (s.kind === 'arrow' || s.kind === 'bone') dummy.scale.set(size, size, size * 2.6);
      else dummy.scale.setScalar(size);
      dummy.updateMatrix();
      this.shotCore.setMatrixAt(n, dummy.matrix);
      this.shotCore.setColorAt(n, color.setHex(SHOT_COLORS[s.kind] ?? 0xffffff).multiplyScalar(HDR.core));
      // Glow sprite (size in world units, taken from the matrix scale).
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar((s.kind === 'orb' ? 0.95 : s.kind === 'rock' ? 0.7 : 0.5) * (1 + Math.sin(t * 18 + s.id) * 0.08));
      dummy.updateMatrix();
      this.shotHalo.setMatrixAt(n, dummy.matrix);
      color.setHex(SHOT_GLOW[s.kind] ?? 0xffffff);
      this.shotHalo.setColorAt(n, hdrColor.copy(color).multiplyScalar(HDR.halo));
      // A short trail of embers behind the spell.
      if (!crowded && (s.id + this.frame) % 3 === 0 && this.scale > 0.4) this.sparks.emit(s.x - s.dx * 0.15, Y, s.z - s.dz * 0.15, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, color, s.kind === 'orb' ? 0.16 : 0.1, 0.35, { endSize: 0.02, drag: 1.5, brightness: 1.6, opacity: 0.85 });
      n++;
    }
    this.shotCore.count = this.shotHalo.count = n;
    for (const m of [this.shotCore, this.shotHalo]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }

    // Pickups bob and spin.
    let nx = 0;
    let nc = 0;
    let nh = 0;
    let nl = 0;
    let nr = 0;
    for (const p of run.pickups) {
      if (p.kind === 'loot' && nl < 16) {
        const rc = color.set(RARITY_COLORS[p.value.rarity] ?? 0xffffff);
        dummy.position.set(p.x, 0.45 + Math.sin(t * 3 + p.id) * 0.08, p.z);
        dummy.rotation.set(0, t * 2.4 + p.id, 0);
        dummy.scale.setScalar(1 + p.value.rarity * 0.12);
        dummy.updateMatrix();
        this.lootMesh.setMatrixAt(nl, dummy.matrix);
        this.lootMesh.setColorAt(nl, hdrColor.copy(rc).multiplyScalar(2.2));
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, t * 0.8, 0);
        dummy.scale.set(1 + p.value.rarity * 0.15, 0.7 + p.value.rarity * 0.3, 1 + p.value.rarity * 0.15);
        dummy.updateMatrix();
        this.beamMesh.setMatrixAt(nl, dummy.matrix);
        this.beamMesh.setColorAt(nl++, hdrColor.copy(rc).multiplyScalar(0.45 + p.value.rarity * 0.2));
        if ((p.id + this.frame) % 6 === 0) this.sparks.emit(p.x + (Math.random() - 0.5) * 0.5, 0.2, p.z + (Math.random() - 0.5) * 0.5, 0, 1.2 + Math.random(), 0, rc, 0.12, 0.8, { endSize: 0.02, drag: 0.5, brightness: 2 });
        continue;
      }
      if (p.kind === 'rune' && nr < 30) {
        dummy.position.set(p.x, 0.35 + Math.sin(t * 4 + p.id) * 0.07, p.z);
        dummy.rotation.set(t * 2 + p.id, t * 3, 0);
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        this.runeMesh.setMatrixAt(nr++, dummy.matrix);
        continue;
      }
      const bob = 0.25 + Math.sin(t * 5 + p.id) * 0.06;
      dummy.position.set(p.x, bob, p.z);
      dummy.rotation.set(0, t * 3 + p.id, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      if (p.kind === 'xp' && nx < 300) this.xpMesh.setMatrixAt(nx++, dummy.matrix);
      else if (p.kind === 'coin' && nc < 300) this.coinMesh.setMatrixAt(nc++, dummy.matrix);
      else if (p.kind === 'heart' && nh < 20) this.heartMesh.setMatrixAt(nh++, dummy.matrix);
    }
    this.lootMesh.count = nl;
    let nb = nl;
    for (const pl of this.pillars) {
      pl.life -= dt;
      if (pl.life <= 0 || nb >= 16) continue;
      const k = 1 - pl.life / pl.max;
      const grow = Math.min(1, k * 6);
      const fade = 1 - Math.max(0, (k - 0.5) / 0.5);
      dummy.position.set(pl.x, 0, pl.z);
      dummy.rotation.set(0, t * 1.5, 0);
      dummy.scale.set(pl.width * (2.2 + k), 1.6 * grow, pl.width * (2.2 + k));
      dummy.updateMatrix();
      this.beamMesh.setMatrixAt(nb, dummy.matrix);
      this.beamMesh.setColorAt(nb++, hdrColor.copy(pl.color).multiplyScalar(0.95 * fade));
    }
    this.pillars = this.pillars.filter((pl) => pl.life > 0);
    this.beamMesh.count = nb;
    this.runeMesh.count = nr;
    for (const m of [this.lootMesh, this.beamMesh, this.runeMesh]) m.instanceMatrix.needsUpdate = true;
    this.lootMesh.instanceColor.needsUpdate = this.beamMesh.instanceColor.needsUpdate = true;
    this.xpMesh.count = nx;
    this.coinMesh.count = nc;
    this.heartMesh.count = nh;
    for (const m of [this.xpMesh, this.coinMesh, this.heartMesh]) m.instanceMatrix.needsUpdate = true;

    // Orbs around the hero.
    const orbs = run.orbPositions(this.orbList ?? (this.orbList = []));
    this.orbMesh.count = orbs.length;
    orbs.forEach((o, i) => {
      dummy.position.set(o.x, Y, o.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1 + Math.sin(t * 12 + i) * 0.1);
      dummy.updateMatrix();
      this.orbMesh.setMatrixAt(i, dummy.matrix);
      this.orbMesh.setColorAt(i, color.setHex(ORB_COLORS[o.kind]).multiplyScalar(HDR.orb));
      color.setHex(ORB_COLORS[o.kind]);
      this.sparks.emit(o.x, Y, o.z, 0, 0.3, 0, color, 0.18, 0.25, { endSize: 0.03, drag: 1, brightness: 1.5, opacity: 0.8 });
    });
    this.orbMesh.instanceMatrix.needsUpdate = true;
    if (this.orbMesh.instanceColor) this.orbMesh.instanceColor.needsUpdate = true;

    // Danger circles.
    for (const item of this.hazardPool) {
      if (!item.active) continue;
      const h = item.hazard;
      if (h.dead || h.delay <= 0 || !(item.friendly ? run.zones : run.hazards).includes(h)) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      item.mesh.material.uniforms.uProgress.value = 1 - h.delay / h.max;
    }
    // Aim lines follow their monster.
    for (const item of this.lines) {
      if (!item.active) continue;
      item.life -= dt;
      const e = item.enemy;
      if (item.life <= 0 || e.dead || (e.state !== 'aim' && e.state !== 'burst')) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      const wide = item.kind === 'dash';
      item.mesh.position.set(e.x, 0.035, e.z);
      item.mesh.rotation.y = Math.atan2(e.aimX, e.aimZ);
      const length = wide ? 9 : 14;
      item.mesh.scale.set(wide ? e.radius * 2.2 : 0.22, 1, length);
      const u = item.mesh.material.uniforms;
      u.uLength.value = length / (wide ? 2 : 1.2);
      u.uOpacity.value = (wide ? 0.75 : 0.9) * (0.75 + 0.25 * Math.sin(t * 20));
    }
  }
}
