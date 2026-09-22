import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, lerp } from '../core/math.js';

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Low-poly dart: nose forward (-z), swept wings, raised spine and a notched tail. */
function createHullGeometry() {
  const nose = [0, 0.04, -1.2];
  const left = [-0.6, 0, 0.55];
  const right = [0.6, 0, 0.55];
  const spine = [0, 0.26, 0.32];
  const notch = [0, 0.02, 0.28];
  const belly = [0, -0.12, 0];
  const faces = [
    [nose, left, spine], [nose, spine, right],
    [left, notch, spine], [spine, notch, right],
    [nose, belly, left], [nose, right, belly],
    [left, belly, notch], [belly, right, notch],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The hover ship: simulation state plus its procedural low-poly model. */
export class Player {
  constructor(scene) {
    this.x = 0;
    this.prevX = 0;
    this.targetX = 0;
    this.velocityX = 0;
    this.tilt = 0;
    this.distanceMoved = 0;

    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.disposables = [];

    const hull = createHullGeometry();
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d1648,
      roughness: 0.3,
      metalness: 0.7,
      flatShading: true,
      side: THREE.DoubleSide,
      emissive: CONFIG.colors.player,
      emissiveIntensity: 0.08,
    });
    const hullMesh = new THREE.Mesh(hull, hullMaterial);
    hullMesh.castShadow = true;

    const edges = new THREE.EdgesGeometry(hull);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(CONFIG.colors.player).multiplyScalar(2.5) });
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial);

    const finGeometry = new THREE.BoxGeometry(0.05, 0.3, 0.42);
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d1648,
      emissive: CONFIG.colors.playerAccent,
      emissiveIntensity: 2.2,
    });
    const finLeft = new THREE.Mesh(finGeometry, finMaterial);
    finLeft.position.set(-0.5, 0.12, 0.38);
    finLeft.rotation.z = 0.3;
    const finRight = finLeft.clone();
    finRight.position.x = 0.5;
    finRight.rotation.z = -0.3;

    const engineGeometry = new THREE.BoxGeometry(0.34, 0.1, 0.06);
    const engineMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(CONFIG.colors.player).multiplyScalar(4) });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.position.set(0, 0.1, 0.34);

    this.glowTexture = createGlowTexture();
    const glowGeometry = new THREE.PlaneGeometry(2.6, 3.2);
    glowGeometry.rotateX(-Math.PI / 2);
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      color: CONFIG.colors.player,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.glow.position.y = 0.02;
    this.glow.renderOrder = 1;

    this.model.add(hullMesh, edgeLines, finLeft, finRight, engine);
    this.model.scale.setScalar(1.2);
    this.group.add(this.glow);
    scene.add(this.group);

    this.disposables.push(hull, hullMaterial, edges, edgeMaterial, finGeometry, finMaterial, engineGeometry, engineMaterial, glowGeometry, glowMaterial, this.glowTexture);
  }

  reset() {
    this.x = this.prevX = this.targetX = 0;
    this.velocityX = 0;
    this.tilt = 0;
    this.distanceMoved = 0;
    this.setVisible(true);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  /** Steering from drag deltas (touch/mouse) and held keys. */
  steer(dt, input) {
    const { maxX, dragRange, keyboardSpeed } = CONFIG.player;
    const drag = input.consumeDrag();
    const before = this.targetX;
    this.targetX += drag * dragRange * CONFIG.road.halfWidth * 2;
    this.targetX += input.axis * keyboardSpeed * dt;
    this.targetX = clamp(this.targetX, -maxX, maxX);
    this.distanceMoved += Math.abs(this.targetX - before);
  }

  /** Eases back to the center (menu idle). */
  idle() {
    this.targetX = 0;
  }

  update(dt) {
    const { followSharpness, maxTilt } = CONFIG.player;
    this.prevX = this.x;
    this.x = damp(this.x, this.targetX, followSharpness, dt);
    this.velocityX = (this.x - this.prevX) / dt;
    this.tilt = damp(this.tilt, clamp(-this.velocityX * 0.05, -maxTilt, maxTilt), 12, dt);
  }

  syncVisual(alpha, time) {
    const x = lerp(this.prevX, this.x, alpha);
    this.group.position.x = x;
    this.model.position.y = CONFIG.player.hoverHeight + Math.sin(time * 4.2) * 0.05;
    this.model.rotation.z = this.tilt;
    this.model.rotation.y = -this.tilt * 0.35;
    this.glow.material.opacity = 0.45 + Math.sin(time * 9) * 0.06;
    return x;
  }

  dispose() {
    this.group.removeFromParent();
    for (const resource of this.disposables) resource.dispose();
  }
}
