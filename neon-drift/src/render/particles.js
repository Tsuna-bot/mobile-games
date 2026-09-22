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
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

/**
 * Pooled GPU point sprites (ring buffer). Emitting never allocates: the oldest
 * particle is recycled when the pool is full.
 */
export class ParticleSystem {
  constructor(scene, capacity = 600) {
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
    this.baseSize = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.tmpColor = new THREE.Color();

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  /** Keeps point sizes in world units whatever the resolution and FOV. */
  setViewport(drawingBufferHeight, fovDeg) {
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(x, y, z, vx, vy, vz, color, intensity, size, life, drag = 2, gravity = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.colors[i3] = color.r * intensity;
    this.colors[i3 + 1] = color.g * intensity;
    this.colors[i3 + 2] = color.b * intensity;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.baseSize[i] = size;
    this.sizes[i] = size;
    this.alphas[i] = 1;
  }

  /** Spherical burst; `carryZ` adds the world scroll speed so debris stays with the scenery. */
  burst(x, y, z, count, speed, color, intensity, size, life, carryZ = 0) {
    for (let n = 0; n < count; n++) {
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.emit(
        x, y, z,
        Math.cos(theta) * s * v, Math.abs(u) * v * 0.8 + 1, Math.sin(theta) * s * v + carryZ,
        color, intensity, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), 2.2, 9,
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
      this.alphas[i] = t;
      this.sizes[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.sizes.fill(0);
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
