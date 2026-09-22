import * as THREE from 'three';
import { CONFIG } from '../config.js';

const C = CONFIG.colors;
const PYLON_PAIRS = 14;
const PYLON_SPACING = 14;
const SPEED_LINES = 48;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunTop;
uniform vec3 uSunBottom;
uniform float uTime;
varying vec3 vDirection;

void main() {
  vec3 dir = normalize(vDirection);
  float h = dir.y;
  vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.5, h));
  color += uGlow * exp(-abs(h) * 14.0) * 0.45;

  vec3 sunDir = normalize(vec3(0.0, 0.1, -1.0));
  float angle = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  float radius = 0.2;
  float sunY = (dir.y - sunDir.y) / radius;
  float disc = 1.0 - smoothstep(radius - 0.004, radius, angle);
  float stripeWidth = clamp((0.25 - sunY) * 0.42, 0.0, 0.62);
  float stripes = step(stripeWidth, fract(sunY * 6.5 + uTime * 0.25));
  vec3 sunColor = mix(uSunBottom, uSunTop, smoothstep(-0.9, 0.9, sunY));
  color = mix(color, sunColor * 0.95, disc * stripes);
  color += sunColor * exp(-angle * 6.0) * 0.12;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GRID_VERTEX = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vWorld;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GRID_FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uBase;
uniform vec3 uLine;
uniform float uOffset;
uniform float uCell;
varying vec2 vWorld;

float gridLine(float coord) {
  float d = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(d / 1.3, 1.0);
}

void main() {
  vec2 cell = vec2(vWorld.x, vWorld.y - uOffset) / uCell;
  float line = max(gridLine(cell.x), gridLine(cell.y));
  gl_FragColor = vec4(uBase + uLine * line * 0.8, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function createRoadTexture(anisotropy) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0a1f';
  ctx.fillRect(0, 0, size, size);

  // Lane separators between the obstacle cells.
  const { cellCount, cellWidth, halfWidth } = CONFIG.road;
  const roadWidth = halfWidth * 2 + 0.6;
  ctx.fillStyle = 'rgba(58, 215, 255, 0.28)';
  for (let i = 1; i < cellCount; i++) {
    const x = ((i - cellCount / 2) * cellWidth + roadWidth / 2) / roadWidth * size;
    ctx.fillRect(x - 1, 0, 2, size * 0.55);
  }
  // Cross line giving a strong sense of speed.
  ctx.fillStyle = 'rgba(58, 215, 255, 0.55)';
  ctx.fillRect(0, 0, size, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, anisotropy);
  return texture;
}

function createMountainGeometry(side) {
  const width = 70;
  const depth = 280;
  const geometry = new THREE.PlaneGeometry(width, depth, 18, 44);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const offsetX = side * (CONFIG.road.halfWidth + 8 + width / 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + offsetX;
    const z = position.getZ(i);
    const distanceFromRoad = Math.max(0, Math.abs(x) - (CONFIG.road.halfWidth + 9));
    const ridge = Math.sin(z * 0.045 + side) * 0.5 + Math.sin(z * 0.11 + x * 0.07) * 0.35 + 0.6;
    const jitter = Math.sin(x * 12.9898 + z * 78.233) * 0.5 + 0.5;
    position.setY(i, distanceFromRoad * (0.32 + ridge * 0.22) + jitter * Math.min(distanceFromRoad, 3) * 0.6);
    position.setX(i, x);
  }
  geometry.translate(0, -0.05, -depth / 2 + 20);
  geometry.computeVertexNormals();
  return geometry;
}

/** Everything static-looking: sky, fog, ground, road, rails, pylons, mountains, lights. */
export class Environment {
  constructor(scene, view) {
    this.scene = scene;
    this.disposables = [];
    this.dummy = new THREE.Object3D();
    this.effectsScale = 1;

    scene.fog = new THREE.Fog(C.fog, 45, 200);
    scene.background = new THREE.Color(C.skyTop);

    this.createSky();
    this.createLights();
    this.createGround();
    this.createRoad(view.maxAnisotropy);
    this.createRails();
    this.createPylons();
    this.createMountains();
    this.createSpeedLines();
  }

  track(...resources) {
    this.disposables.push(...resources);
  }

  createSky() {
    const geometry = new THREE.SphereGeometry(450, 32, 16);
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(C.skyTop) },
        uHorizon: { value: new THREE.Color(C.skyHorizon) },
        uGlow: { value: new THREE.Color(C.horizonGlow) },
        uSunTop: { value: new THREE.Color(C.sunTop) },
        uSunBottom: { value: new THREE.Color(C.sunBottom) },
        uTime: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(geometry, material);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.track(geometry, material);
  }

  createLights() {
    this.hemisphere = new THREE.HemisphereLight(0x9a6bff, 0x1a0630, 1.1);
    this.sun = new THREE.DirectionalLight(0xffc4ec, 2.0);
    this.sun.position.set(3, 14, -22);
    this.sun.target.position.set(0, 0, -6);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -8;
    shadowCamera.right = 8;
    shadowCamera.top = 34;
    shadowCamera.bottom = -34;
    shadowCamera.near = 1;
    shadowCamera.far = 70;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemisphere, this.sun, this.sun.target);
  }

  createGround() {
    const geometry = new THREE.PlaneGeometry(500, 420);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.06, -190);
    const material = new THREE.ShaderMaterial({
      vertexShader: GRID_VERTEX,
      fragmentShader: GRID_FRAGMENT,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uBase: { value: new THREE.Color(0x0a0318) },
          uLine: { value: new THREE.Color(C.grid) },
          uOffset: { value: 0 },
          uCell: { value: 4 },
        },
      ]),
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.scene.add(this.ground);
    this.track(geometry, material);
  }

  createRoad(anisotropy) {
    const { halfWidth, length, textureTile } = CONFIG.road;
    const geometry = new THREE.PlaneGeometry(halfWidth * 2 + 0.6, length);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -length / 2 + 20);
    this.roadTexture = createRoadTexture(anisotropy);
    this.roadTexture.repeat.set(1, length / textureTile);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roadTexture,
      emissive: 0xffffff,
      emissiveMap: this.roadTexture,
      emissiveIntensity: 1.2,
      roughness: 0.62,
      metalness: 0.15,
    });
    this.road = new THREE.Mesh(geometry, material);
    this.road.receiveShadow = true;
    this.scene.add(this.road);
    this.track(geometry, material, this.roadTexture);
  }

  createRails() {
    const { halfWidth, length } = CONFIG.road;
    const geometry = new THREE.BoxGeometry(0.14, 0.14, length);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.rail).multiplyScalar(3) });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(geometry, material);
      rail.position.set(side * (halfWidth + 0.3), 0.07, -length / 2 + 20);
      this.scene.add(rail);
    }
    this.track(geometry, material);
  }

  createPylons() {
    const geometry = new THREE.BoxGeometry(0.22, 3.4, 0.22);
    geometry.translate(0, 1.7, 0);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pylon).multiplyScalar(2.6) });
    this.pylons = new THREE.InstancedMesh(geometry, material, PYLON_PAIRS * 2);
    this.pylons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pylons.frustumCulled = false;
    this.scene.add(this.pylons);
    this.track(geometry, material);
  }

  createMountains() {
    const fill = new THREE.MeshBasicMaterial({ color: C.mountain, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lines = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.mountainLine).multiplyScalar(0.8), wireframe: true });
    for (const side of [-1, 1]) {
      const geometry = createMountainGeometry(side);
      this.scene.add(new THREE.Mesh(geometry, fill), new THREE.Mesh(geometry, lines));
      this.track(geometry);
    }
    this.track(fill, lines);
  }

  createSpeedLines() {
    const geometry = new THREE.BoxGeometry(0.03, 0.03, 1);
    this.speedLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xbff6ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.speedLines = new THREE.InstancedMesh(geometry, this.speedLineMaterial, SPEED_LINES);
    this.speedLines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.speedLines.frustumCulled = false;
    this.speedLineData = new Float32Array(SPEED_LINES * 3);
    for (let i = 0; i < SPEED_LINES; i++) this.respawnSpeedLine(i, -Math.random() * 130);
    this.scene.add(this.speedLines);
    this.track(geometry, this.speedLineMaterial);
  }

  respawnSpeedLine(index, z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.speedLineData[index * 3] = side * (CONFIG.road.halfWidth + 1 + Math.random() * 7);
    this.speedLineData[index * 3 + 1] = 0.4 + Math.random() * 6;
    this.speedLineData[index * 3 + 2] = z;
  }

  applyQuality(preset) {
    this.sun.castShadow = preset.shadows;
    if (this.sun.shadow.mapSize.x !== preset.shadowMapSize) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.effectsScale = preset.effects;
  }

  /**
   * @param distance interpolated distance travelled
   * @param speed current world speed (units/s)
   * @param speedFactor 0..1 normalized speed, drives intensity of speed effects
   */
  update(distance, speed, speedFactor, dt, time, camera) {
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = time;

    const cell = this.ground.material.uniforms.uCell.value;
    this.ground.material.uniforms.uOffset.value = distance % cell;
    this.roadTexture.offset.y = (distance / CONFIG.road.textureTile) % 1;

    const dummy = this.dummy;
    const loopLength = PYLON_PAIRS * PYLON_SPACING;
    const pylonX = CONFIG.road.halfWidth + 1.4;
    for (let i = 0; i < PYLON_PAIRS; i++) {
      const z = 16 - ((i * PYLON_SPACING - distance) % loopLength + loopLength) % loopLength;
      for (let side = 0; side < 2; side++) {
        dummy.position.set(side === 0 ? -pylonX : pylonX, 0, z);
        dummy.updateMatrix();
        this.pylons.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.pylons.instanceMatrix.needsUpdate = true;

    const visibleLines = Math.round(SPEED_LINES * this.effectsScale);
    const lineLength = 1 + speedFactor * 7;
    this.speedLineMaterial.opacity = Math.max(0, speedFactor - 0.15) * 0.7;
    for (let i = 0; i < visibleLines; i++) {
      const base = i * 3;
      this.speedLineData[base + 2] += speed * 1.6 * dt;
      if (this.speedLineData[base + 2] > 14) this.respawnSpeedLine(i, -120 - Math.random() * 20);
      dummy.position.set(this.speedLineData[base], this.speedLineData[base + 1], this.speedLineData[base + 2]);
      dummy.scale.set(1, 1, lineLength);
      dummy.updateMatrix();
      this.speedLines.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.set(1, 1, 1);
    this.speedLines.count = visibleLines;
    this.speedLines.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const resource of this.disposables) resource.dispose();
    this.pylons.dispose();
    this.speedLines.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.clear();
  }
}
