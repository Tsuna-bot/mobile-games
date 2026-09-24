import * as THREE from 'three';

const MODES = { pollen: 0, snow: 1, fireflies: 2, motes: 3 };
const SETTINGS = {
  pollen: { count: 90, color: 0xfff3b0, size: 0.07, additive: false, opacity: 0.8 },
  snow: { count: 260, color: 0xffffff, size: 0.075, additive: false, opacity: 0.95 },
  fireflies: { count: 70, color: 0xd8ff7a, size: 0.12, additive: true, opacity: 1 },
  motes: { count: 110, color: 0x9fe8ff, size: 0.09, additive: true, opacity: 0.9 },
};
const MAX = 260;
const HEIGHT = 4;

const VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uMode;
uniform float uSize;
uniform float uScale;
uniform float uCount;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime + aSeed * 50.0;
  vAlpha = step(aSeed * ${MAX.toFixed(1)}, uCount);
  if (uMode < 0.5) {
    p.x += sin(t * 0.3) * 0.6;
    p.y += sin(t * 0.5) * 0.3;
    p.z += cos(t * 0.25) * 0.5;
  } else if (uMode < 1.5) {
    p.y = ${HEIGHT.toFixed(1)} - mod(uTime * 0.55 + aSeed * ${HEIGHT.toFixed(1)} * 7.0, ${HEIGHT.toFixed(1)});
    p.x += sin(t * 0.8) * 0.25;
    p.z += cos(t * 0.6) * 0.2;
  } else if (uMode < 2.5) {
    p += vec3(sin(t * 0.6), sin(t * 0.9) * 0.4, cos(t * 0.5)) * 0.7;
    p.y = 0.35 + abs(p.y) * 0.35;
    vAlpha *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 3.0), 3.0);
  } else {
    p.y = mod(position.y + uTime * 0.3, ${HEIGHT.toFixed(1)});
    p.x += sin(t * 0.7) * 0.2;
    vAlpha *= sin(p.y / ${HEIGHT.toFixed(1)} * 3.14159);
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uScale / max(-mvPosition.z, 0.1);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.2, 0.5, d)) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

/** Theme-dependent ambient life (pollen, snowfall, fireflies, crystal motes), animated on the GPU. */
export class AmbientParticles {
  constructor(scene) {
    const positions = new Float32Array(MAX * 3);
    const seeds = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) seeds[i] = i / MAX + Math.random() * (0.9 / MAX);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: 0 },
        uSize: { value: 0.08 },
        uScale: { value: 500 },
        uCount: { value: MAX },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 1 },
      },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.density = 1;
    this.settings = SETTINGS.pollen;
    scene.add(this.points);
  }

  configure(mode, halfW, halfH) {
    this.settings = SETTINGS[mode] ?? SETTINGS.pollen;
    const u = this.material.uniforms;
    u.uMode.value = MODES[mode] ?? 0;
    u.uSize.value = this.settings.size;
    u.uColor.value.set(this.settings.color);
    u.uOpacity.value = this.settings.opacity;
    this.material.blending = this.settings.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.needsUpdate = true;
    const position = this.geometry.attributes.position;
    for (let i = 0; i < MAX; i++) {
      position.setXYZ(i, (Math.random() * 2 - 1) * halfW, Math.random() * HEIGHT, (Math.random() * 2 - 1) * halfH);
    }
    position.needsUpdate = true;
    this.setDensity(this.density);
  }

  setDensity(scale) {
    this.density = scale;
    this.material.uniforms.uCount.value = Math.round(this.settings.count * scale);
  }

  setViewport(drawingBufferHeight, fovDeg) {
    this.material.uniforms.uScale.value = drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
