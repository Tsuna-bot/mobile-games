import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BOLT_POINTS = 12;
const BOLT_POOL = 12;
const DECAL_POOL = 8;
const METEOR_COLOR = new THREE.Color(0xff7a2a);
const EMBER = new THREE.Color(0xffc15a);
const ICE = new THREE.Color(0xbff3ff);
const LIGHTNING = new THREE.Color(0xcfe9ff);

function createDecalTexture(inner, mid, outer) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.55, mid);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  // Irregular splatter so decals don't read as perfect circles.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = size * (0.38 + Math.random() * 0.12);
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(angle) * r, size / 2 + Math.sin(angle) * r, size * (0.05 + Math.random() * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Visuals for the three spells: falling meteors, lightning bolts, ground decals. */
export class SpellViews {
  constructor(scene, assets, effects, camera) {
    this.scene = scene;
    this.effects = effects;
    this.camera = camera;
    this.meteors = [];

    // Meteor: the Kenney boulder, glowing hot.
    this.meteorMaterial = assets.material.clone();
    this.meteorMaterial.emissive.set(0xff5a1a);
    this.meteorMaterial.emissiveIntensity = 1.6;
    this.meteorTemplate = assets.clone('weapon-ammo-boulder');
    this.meteorTemplate.traverse((o) => {
      if (o.isMesh) o.material = this.meteorMaterial;
    });

    // Lightning bolts: camera-facing ribbons rebuilt on each strike.
    this.boltMaterial = new THREE.MeshBasicMaterial({
      color: LIGHTNING.clone().multiplyScalar(3),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.bolts = Array.from({ length: BOLT_POOL }, () => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(BOLT_POINTS * 2 * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      const index = [];
      for (let i = 0; i < BOLT_POINTS - 1; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geometry.setIndex(index);
      const material = this.boltMaterial.clone();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      return { mesh, material, life: 0 };
    });
    this.boltCursor = 0;

    // Ground decals: scorch marks and frost patches that fade out.
    this.scorchTexture = createDecalTexture('rgba(20,10,5,0.85)', 'rgba(40,20,10,0.55)', 'rgba(40,20,10,0)');
    this.frostTexture = createDecalTexture('rgba(235,250,255,0.9)', 'rgba(170,225,255,0.6)', 'rgba(170,225,255,0)');
    this.decalGeometry = new THREE.PlaneGeometry(2, 2);
    this.decalGeometry.rotateX(-Math.PI / 2);
    this.decals = Array.from({ length: DECAL_POOL }, () => {
      const material = new THREE.MeshBasicMaterial({ map: this.scorchTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(this.decalGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      return { mesh, material, life: 0, duration: 1 };
    });
    this.decalCursor = 0;
    this.side = new THREE.Vector3();
    this.segment = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
  }

  // ------------------------------------------------------------ meteor

  castMeteor(x, z, delay) {
    const object = this.meteorTemplate.clone();
    object.scale.setScalar(2.6);
    const start = new THREE.Vector3(x + 2.5, 7.5, z - 3);
    object.position.copy(start);
    this.scene.add(object);
    this.meteors.push({ object, start, x, z, age: 0, delay });
    this.effects.ring(x, z, 1.3, delay, METEOR_COLOR);
  }

  meteorImpact(x, z, radius) {
    this.effects.bigExplosion(x, z, radius);
    this.decal(x, z, radius * 1.1, this.scorchTexture, 7);
  }

  // ------------------------------------------------------------ blizzard

  blizzard(x, z, radius) {
    this.effects.iceBurst(x, z, radius);
    this.decal(x, z, radius, this.frostTexture, 4);
  }

  // ------------------------------------------------------------ lightning

  lightning(x, z, targets, positionOf) {
    const target = new THREE.Vector3();
    let previous = null;
    if (targets.length === 0) {
      this.bolt(new THREE.Vector3(x + 0.6, 7, z - 1), new THREE.Vector3(x, CONFIG.world.tileTop, z));
      this.effects.sparksBurst(x, CONFIG.world.tileTop + 0.1, z, LIGHTNING);
      return;
    }
    for (const enemy of targets) {
      positionOf(enemy, target);
      const end = target.clone();
      if (!previous) this.bolt(new THREE.Vector3(end.x + 0.6, 7, end.z - 1), end);
      else this.bolt(previous, end);
      this.effects.sparksBurst(end.x, end.y, end.z, LIGHTNING);
      previous = end;
    }
  }

  bolt(from, to) {
    const slot = this.bolts[this.boltCursor];
    this.boltCursor = (this.boltCursor + 1) % this.bolts.length;
    const positions = slot.mesh.geometry.attributes.position;
    this.toCamera.copy(this.camera.position).sub(from).normalize();
    this.segment.copy(to).sub(from);
    const length = this.segment.length();
    this.side.crossVectors(this.segment, this.toCamera).normalize();
    for (let i = 0; i < BOLT_POINTS; i++) {
      const t = i / (BOLT_POINTS - 1);
      const jag = i === 0 || i === BOLT_POINTS - 1 ? 0 : (Math.random() - 0.5) * length * 0.12;
      const width = 0.07 * (1 - t * 0.5);
      const px = from.x + this.segment.x * t + this.side.x * jag;
      const py = from.y + this.segment.y * t + this.side.y * jag;
      const pz = from.z + this.segment.z * t + this.side.z * jag;
      positions.setXYZ(i * 2, px - this.side.x * width, py - this.side.y * width, pz - this.side.z * width);
      positions.setXYZ(i * 2 + 1, px + this.side.x * width, py + this.side.y * width, pz + this.side.z * width);
    }
    positions.needsUpdate = true;
    slot.mesh.geometry.computeBoundingSphere();
    slot.life = 0.35;
    slot.mesh.visible = true;
  }

  // ------------------------------------------------------------ decals

  decal(x, z, radius, texture, duration) {
    const slot = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    slot.material.map = texture;
    slot.material.needsUpdate = true;
    slot.mesh.position.set(x, CONFIG.world.tileTop + 0.012, z);
    slot.mesh.rotation.y = Math.random() * Math.PI * 2;
    slot.mesh.scale.setScalar(radius);
    slot.mesh.visible = true;
    slot.life = duration;
    slot.duration = duration;
  }

  update(dt) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const meteor = this.meteors[i];
      meteor.age += dt;
      const t = Math.min(1, meteor.age / meteor.delay);
      const eased = t * t;
      meteor.object.position.set(
        meteor.start.x + (meteor.x - meteor.start.x) * eased,
        meteor.start.y + (CONFIG.world.tileTop + 0.2 - meteor.start.y) * eased,
        meteor.start.z + (meteor.z - meteor.start.z) * eased,
      );
      meteor.object.rotation.x += dt * 8;
      meteor.object.rotation.z += dt * 5;
      const p = meteor.object.position;
      this.effects.meteorTrail(p.x, p.y, p.z, METEOR_COLOR, EMBER);
      if (t >= 1) {
        meteor.object.removeFromParent();
        this.meteors.splice(i, 1);
      }
    }
    for (const slot of this.bolts) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      // Flicker, then fade.
      slot.material.opacity = slot.life > 0.2 ? (Math.random() > 0.3 ? 1 : 0.3) : Math.max(0, slot.life / 0.2);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of this.decals) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.material.opacity = Math.min(1, slot.life / (slot.duration * 0.4));
      if (slot.life <= 0) slot.mesh.visible = false;
    }
  }

  clear() {
    for (const meteor of this.meteors) meteor.object.removeFromParent();
    this.meteors.length = 0;
    for (const slot of this.bolts) {
      slot.life = 0;
      slot.mesh.visible = false;
    }
    for (const slot of this.decals) {
      slot.life = 0;
      slot.mesh.visible = false;
    }
  }

  dispose() {
    this.clear();
    this.meteorMaterial.dispose();
    this.boltMaterial.dispose();
    for (const slot of this.bolts) {
      slot.mesh.geometry.dispose();
      slot.material.dispose();
      slot.mesh.removeFromParent();
    }
    for (const slot of this.decals) {
      slot.material.dispose();
      slot.mesh.removeFromParent();
    }
    this.decalGeometry.dispose();
    this.scorchTexture.dispose();
    this.frostTexture.dispose();
  }
}

export { ICE };
