import * as THREE from 'three';

const VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.1);
  vColor = aColor;
  vAlpha = aAlpha;
}`;

const FRAGMENT = /* glsl */ `
uniform float uSoftness;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.5 - uSoftness, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

/**
 * Pooled GPU point sprites in a ring buffer: emitting never allocates, the
 * oldest particle is recycled when the pool is full.
 * `additive` suits sparks and glows; normal blending suits smoke, dust and snow.
 */
export class ParticleSystem {
  constructor(scene, { capacity = 500, additive = false, softness = 0.5 } = {}) {
    this.capacity = capacity;
    this.cursor = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.alphas = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.startSize = new Float32Array(capacity);
    this.endSize = new Float32Array(capacity);
    this.peak = new Float32Array(capacity);
    this.fadeIn = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.attributes = {
      position: new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
      aColor: new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage),
      aAlpha: new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage),
      aSize: new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage),
    };
    for (const [name, attribute] of Object.entries(this.attributes)) this.geometry.setAttribute(name, attribute);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uScale: { value: 400 }, uSoftness: { value: softness } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  setViewport(drawingBufferHeight, fovDeg) {
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(x, y, z, vx, vy, vz, color, size, life, { endSize = size * 0.3, drag = 2, gravity = 0, brightness = 1, opacity = 1, fadeIn = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.colors[i3] = color.r * brightness;
    this.colors[i3 + 1] = color.g * brightness;
    this.colors[i3 + 2] = color.b * brightness;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.startSize[i] = size;
    this.endSize[i] = endSize;
    this.sizes[i] = size;
    this.peak[i] = opacity;
    this.fadeIn[i] = fadeIn;
    this.alphas[i] = fadeIn > 0 ? 0 : opacity;
  }

  /** Radial burst around a point, biased upward. */
  burst(x, y, z, count, speed, color, size, life, options = {}) {
    for (let n = 0; n < count; n++) {
      const theta = Math.random() * Math.PI * 2;
      const up = options.upward ?? 0.6;
      const v = speed * (0.35 + Math.random() * 0.65);
      const horizontal = Math.sqrt(1 - up * up) * v;
      this.emit(
        x, y, z,
        Math.cos(theta) * horizontal, up * v * (0.5 + Math.random()), Math.sin(theta) * horizontal,
        color, size * (0.7 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), options,
      );
    }
  }

  update(dt) {
    if (dt <= 0) return;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const damping = Math.max(0, 1 - this.drag[i] * dt);
      this.velocities[i3] *= damping;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * damping - this.gravity[i] * dt;
      this.velocities[i3 + 2] *= damping;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] = Math.max(0.05, this.positions[i3 + 1] + this.velocities[i3 + 1] * dt);
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      // Fade out over the second half of life; optionally fade in (smoke, mist).
      const fadeIn = this.fadeIn[i] > 0 ? Math.min(1, (1 - t) / this.fadeIn[i]) : 1;
      this.alphas[i] = Math.min(1, t * 2) * fadeIn * this.peak[i];
      this.sizes[i] = this.endSize[i] + (this.startSize[i] - this.endSize[i]) * t;
    }
    for (const attribute of Object.values(this.attributes)) attribute.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.sizes.fill(0);
    this.attributes.aAlpha.needsUpdate = true;
    this.attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
