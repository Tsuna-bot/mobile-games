import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ParticleSystem } from './particles.js';

const COLORS = {
  fire: new THREE.Color(0xffa033),
  ember: new THREE.Color(0xff5a1f),
  smoke: new THREE.Color(0x8c8a99),
  dust: new THREE.Color(0xc79a6a),
  snow: new THREE.Color(0xf4f8ff),
  frost: new THREE.Color(0x7fd8ff),
  gold: new THREE.Color(0xffd23f),
  alien: new THREE.Color(0x9dff6a),
  spark: new THREE.Color(0xfff2b0),
  magic: new THREE.Color(0xd08cff),
};

const RING_POOL = 10;

/** Particles, shock rings, range indicator, selection cursor and spawn beams. */
export class Effects {
  constructor(scene, assets) {
    this.scene = scene;
    this.scale = 1;
    this.sparks = new ParticleSystem(scene, { capacity: 700, additive: true, softness: 0.5 });
    this.puffs = new ParticleSystem(scene, { capacity: 500, additive: false, softness: 0.35 });

    this.ringGeometry = new THREE.RingGeometry(0.86, 1, 48);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: RING_POOL }, () => {
      const material = new THREE.MeshBasicMaterial({ color: COLORS.frost, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      return { mesh, material, life: 0, duration: 1, radius: 1 };
    });
    this.ringCursor = 0;

    // Range indicator: a soft filled disc plus a crisp outline.
    this.rangeGroup = new THREE.Group();
    const discGeometry = new THREE.CircleGeometry(1, 64);
    discGeometry.rotateX(-Math.PI / 2);
    this.rangeFill = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false }));
    const outlineGeometry = new THREE.RingGeometry(0.97, 1, 64);
    outlineGeometry.rotateX(-Math.PI / 2);
    this.rangeOutline = new THREE.Mesh(outlineGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.rangeGroup.add(this.rangeFill, this.rangeOutline);
    this.rangeGroup.position.y = CONFIG.world.tileTop + 0.03;
    this.rangeGroup.visible = false;
    this.rangeGroup.renderOrder = 1;
    scene.add(this.rangeGroup);
    this.disposables = [discGeometry, outlineGeometry, this.rangeFill.material, this.rangeOutline.material];

    this.cursor = assets.clone('selection-a');
    this.cursor.visible = false;
    this.cursor.traverse((o) => { o.castShadow = false; });
    scene.add(this.cursor);

    this.beams = Array.from({ length: 4 }, () => {
      const beam = assets.clone('enemy-ufo-beam');
      const material = assets.material.clone();
      material.transparent = true;
      material.depthWrite = false;
      material.emissive.set(0x66ff88);
      beam.traverse((o) => {
        if (o.isMesh) {
          o.material = material;
          o.castShadow = false;
        }
      });
      beam.visible = false;
      scene.add(beam);
      return { beam, material, life: 0 };
    });
    this.beamCursor = 0;
    this.time = 0;
  }

  setViewport(drawingBufferHeight, fov) {
    this.sparks.setViewport(drawingBufferHeight, fov);
    this.puffs.setViewport(drawingBufferHeight, fov);
  }

  count(base) {
    return Math.max(1, Math.round(base * this.scale));
  }

  // ------------------------------------------------------------ one-shot effects

  explosion(x, y, z, radius) {
    const size = 0.35 + radius * 0.25;
    this.sparks.burst(x, y, z, this.count(22), 3 + radius * 2, COLORS.fire, size, 0.45, { gravity: 3, brightness: 1.4 });
    this.sparks.burst(x, y, z, this.count(10), 5, COLORS.spark, size * 0.5, 0.35, { gravity: 6, brightness: 1.2 });
    this.puffs.burst(x, y, z, this.count(10), 1.5 + radius, COLORS.smoke, size * 1.6, 0.9, { upward: 0.8, drag: 3, endSize: size * 2.6 });
  }

  groundImpact(x, z, radius, snowy) {
    const y = CONFIG.world.tileTop + 0.05;
    this.puffs.burst(x, y, z, this.count(14), 2 + radius, snowy ? COLORS.snow : COLORS.dust, 0.4, 0.8, { upward: 0.5, drag: 3, endSize: 0.9 });
    this.explosion(x, y + 0.1, z, radius);
    this.ring(x, z, radius, 0.4, COLORS.fire);
  }

  sparksAt(x, y, z, color = COLORS.spark) {
    this.sparks.burst(x, y, z, this.count(6), 3, color, 0.14, 0.25, { gravity: 5, brightness: 1.3 });
  }

  muzzle(x, y, z) {
    this.puffs.burst(x, y, z, this.count(4), 0.8, COLORS.smoke, 0.25, 0.5, { upward: 0.9, drag: 3, endSize: 0.5 });
  }

  enemyDeath(x, y, z, big) {
    const n = big ? 2.5 : 1;
    this.sparks.burst(x, y, z, this.count(18 * n), 4 * n, COLORS.alien, 0.22 * n, 0.6, { gravity: 4, brightness: 1.3 });
    this.sparks.burst(x, y, z, this.count(10 * n), 3 * n, COLORS.fire, 0.3 * n, 0.5, { gravity: 2, brightness: 1.4 });
    this.puffs.burst(x, y, z, this.count(8 * n), 1.5 * n, COLORS.smoke, 0.45 * n, 0.9, { upward: 0.7, drag: 2.5, endSize: 1.1 * n });
    this.sparks.burst(x, y + 0.2, z, this.count(6), 2, COLORS.gold, 0.16, 0.7, { upward: 0.95, gravity: 3, brightness: 1.2 });
  }

  frostPulse(x, z, radius) {
    this.ring(x, z, radius, 0.55, COLORS.frost);
    this.sparks.burst(x, CONFIG.world.tileTop + 0.3, z, this.count(10), radius * 2, COLORS.frost, 0.16, 0.5, { upward: 0.2, drag: 2.5, brightness: 1.2 });
  }

  build(x, z, snowy) {
    this.puffs.burst(x, CONFIG.world.tileTop + 0.1, z, this.count(16), 2.4, snowy ? COLORS.snow : COLORS.dust, 0.35, 0.7, { upward: 0.35, drag: 3.5, endSize: 0.8 });
    this.sparks.burst(x, CONFIG.world.tileTop + 0.6, z, this.count(10), 2.2, COLORS.spark, 0.15, 0.6, { upward: 0.9, gravity: 2, brightness: 1.2 });
  }

  upgrade(x, z) {
    this.sparks.burst(x, CONFIG.world.tileTop + 0.8, z, this.count(26), 3, COLORS.gold, 0.18, 0.8, { upward: 0.95, gravity: 2, brightness: 1.3 });
    this.ring(x, z, 0.9, 0.5, COLORS.gold);
  }

  sell(x, z) {
    this.puffs.burst(x, CONFIG.world.tileTop + 0.4, z, this.count(18), 2, COLORS.smoke, 0.45, 0.8, { upward: 0.6, drag: 3, endSize: 1 });
    this.sparks.burst(x, CONFIG.world.tileTop + 0.4, z, this.count(12), 2.5, COLORS.gold, 0.16, 0.7, { upward: 0.9, gravity: 3 });
  }

  castleHit(x, z) {
    this.sparks.burst(x, CONFIG.world.tileTop + 0.8, z, this.count(20), 3, COLORS.ember, 0.25, 0.6, { gravity: 3, brightness: 1.4 });
    this.puffs.burst(x, CONFIG.world.tileTop + 0.8, z, this.count(10), 1.5, COLORS.smoke, 0.5, 1, { upward: 0.8, endSize: 1.2 });
  }

  spawnBeam(x, z) {
    const slot = this.beams[this.beamCursor];
    this.beamCursor = (this.beamCursor + 1) % this.beams.length;
    slot.life = 0.6;
    slot.beam.visible = true;
    slot.beam.position.set(x, CONFIG.world.tileTop, z);
    this.sparks.burst(x, CONFIG.world.tileTop + 0.3, z, this.count(8), 1.5, COLORS.alien, 0.18, 0.5, { upward: 0.9, brightness: 1.3 });
  }

  ring(x, z, radius, duration, color) {
    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    ring.life = duration;
    ring.duration = duration;
    ring.radius = radius;
    ring.material.color.copy(color);
    ring.mesh.position.set(x, CONFIG.world.tileTop + 0.05, z);
    ring.mesh.visible = true;
  }

  // ------------------------------------------------------------ persistent indicators

  showRange(x, z, radius, valid = true) {
    this.rangeGroup.visible = true;
    this.rangeGroup.position.x = x;
    this.rangeGroup.position.z = z;
    this.rangeGroup.scale.set(radius, 1, radius);
    const color = valid ? 0xffffff : 0xff5a5a;
    this.rangeFill.material.color.set(color);
    this.rangeOutline.material.color.set(color);
  }

  hideRange() {
    this.rangeGroup.visible = false;
  }

  showCursor(x, z) {
    this.cursor.visible = true;
    this.cursor.position.set(x, CONFIG.world.tileTop + 0.01, z);
  }

  hideCursor() {
    this.cursor.visible = false;
  }

  update(dt) {
    this.time += dt;
    this.sparks.update(dt);
    this.puffs.update(dt);
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const t = 1 - Math.max(ring.life, 0) / ring.duration;
      const r = ring.radius * (0.2 + 0.8 * (1 - (1 - t) ** 3));
      ring.mesh.scale.set(r, 1, r);
      ring.material.opacity = (1 - t) * 0.8;
      if (ring.life <= 0) ring.mesh.visible = false;
    }
    for (const slot of this.beams) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.material.opacity = Math.max(0, slot.life / 0.6) * 0.7;
      slot.beam.scale.set(1, 0.6 + (0.6 - slot.life), 1);
      if (slot.life <= 0) slot.beam.visible = false;
    }
    if (this.cursor.visible) {
      const s = 1 + Math.sin(this.time * 6) * 0.05;
      this.cursor.scale.set(s, 1, s);
    }
    if (this.rangeGroup.visible) this.rangeOutline.material.opacity = 0.6 + Math.sin(this.time * 4) * 0.2;
  }

  clear() {
    this.sparks.clear();
    this.puffs.clear();
    for (const ring of this.rings) {
      ring.life = 0;
      ring.mesh.visible = false;
    }
    for (const slot of this.beams) {
      slot.life = 0;
      slot.beam.visible = false;
    }
    this.hideRange();
    this.hideCursor();
  }

  dispose() {
    this.sparks.dispose();
    this.puffs.dispose();
    this.ringGeometry.dispose();
    for (const ring of this.rings) ring.material.dispose();
    for (const slot of this.beams) slot.material.dispose();
    for (const item of this.disposables) item.dispose();
  }
}
