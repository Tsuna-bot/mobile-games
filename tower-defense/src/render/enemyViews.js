import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ENEMIES } from '../data/enemies.js';
import { lerp } from '../core/math.js';

const BAR_WIDTH = 0.62;
const HIT_FLASH = new THREE.Color(0xffffff);
const FROST_TINT = new THREE.Color(0x3aa8ff);
const FREEZE_TINT = new THREE.Color(0x9fe6ff);
const BLACK = new THREE.Color(0x000000);
const GLOW_COLORS = { scout: 0x7dff6a, runner: 0x5ee8ff, tank: 0xffa347, boss: 0xff5cf0 };

function createRadialTexture(inner, outer) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Pooled enemy visuals: each UFO gets its own material clone (same shader
 * program) so it can flash when hit and tint blue when slowed, plus a
 * billboarded health bar.
 */
export class EnemyViews {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.pools = new Map();
    this.active = new Set();
    this.barGeometry = new THREE.PlaneGeometry(1, 1);
    this.barGeometry.translate(0.5, 0, 0);
    this.barBackMaterial = new THREE.MeshBasicMaterial({ color: 0x1b1530, transparent: true, opacity: 0.75, depthWrite: false });
    this.cameraQuaternion = new THREE.Quaternion();
    this.tmpColor = new THREE.Color();
    this.discGeometry = new THREE.PlaneGeometry(1, 1);
    this.discGeometry.rotateX(-Math.PI / 2);
    this.shadowTexture = createRadialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    this.glowTexture = createRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    this.glowMaterials = {};
    this.iceGeometry = new THREE.IcosahedronGeometry(0.55, 0);
    this.iceMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfefff,
      emissive: 0x4fc3ff,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      flatShading: true,
      depthWrite: false,
    });
  }

  glowMaterial(type) {
    if (!this.glowMaterials[type]) {
      this.glowMaterials[type] = new THREE.MeshBasicMaterial({
        map: this.glowTexture,
        color: new THREE.Color(GLOW_COLORS[type] ?? 0xffffff).multiplyScalar(1.6),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    return this.glowMaterials[type];
  }

  createView(type) {
    const def = ENEMIES[type];
    const root = new THREE.Group();
    const model = this.assets.clone(def.model);
    const material = this.assets.material.clone();
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.material = material;
      // The contact shadow below replaces real shadows (cheaper, and readable on every quality level).
      object.castShadow = false;
    });
    const scale = def.scale * CONFIG.world.enemyScale;
    model.scale.setScalar(scale);
    root.add(model);

    // Soft contact shadow on the ground and an alien glow under the saucer.
    const shadow = new THREE.Mesh(this.discGeometry, this.shadowMaterial);
    shadow.scale.setScalar(scale * 1.3);
    shadow.renderOrder = 1;
    const glow = new THREE.Mesh(this.discGeometry, this.glowMaterial(type));
    glow.scale.setScalar(scale * 1.6);
    glow.position.y = 0.02;
    glow.renderOrder = 2;
    root.add(shadow, glow);

    const ice = new THREE.Mesh(this.iceGeometry, this.iceMaterial);
    ice.scale.set(scale * 1.25, scale * 1.05, scale * 1.25);
    ice.position.y = 0.3 * scale;
    ice.visible = false;
    ice.renderOrder = 3;
    root.add(ice);

    const bar = new THREE.Group();
    const back = new THREE.Mesh(this.barGeometry, this.barBackMaterial);
    back.scale.set(BAR_WIDTH + 0.06, 0.12, 1);
    back.position.set(-(BAR_WIDTH + 0.06) / 2, 0, -0.001);
    const fillMaterial = new THREE.MeshBasicMaterial({ color: 0x5cff7a, depthWrite: false });
    const fill = new THREE.Mesh(this.barGeometry, fillMaterial);
    fill.scale.set(BAR_WIDTH, 0.07, 1);
    fill.position.x = -BAR_WIDTH / 2;
    back.renderOrder = 4;
    fill.renderOrder = 5;
    bar.add(back, fill);
    bar.position.y = 0.68 * scale + 0.18;
    root.add(bar);

    return { type, root, model, material, bar, fill, fillMaterial, shadow, glow, ice, flash: 0, spawn: 0, spin: Math.random() * Math.PI * 2, px: 0, pz: 0 };
  }

  acquire(enemy) {
    const type = enemy.def.id;
    let pool = this.pools.get(type);
    if (!pool) this.pools.set(type, (pool = []));
    const view = pool.pop() ?? this.createView(type);
    view.enemy = enemy;
    view.flash = 0;
    view.spawn = 1;
    view.px = enemy.x;
    view.pz = enemy.z;
    view.root.visible = true;
    view.root.position.set(enemy.x, CONFIG.world.enemyHover, enemy.z);
    this.scene.add(view.root);
    enemy.view = view;
    this.active.add(view);
  }

  release(enemy) {
    const view = enemy.view;
    if (!view) return;
    enemy.view = null;
    view.enemy = null;
    view.root.removeFromParent();
    this.active.delete(view);
    this.pools.get(view.type).push(view);
  }

  hit(enemy) {
    if (enemy.view) enemy.view.flash = 1;
  }

  /** Current rendered position of an enemy (for effects anchored to it). */
  positionOf(enemy, target) {
    return target.copy(enemy.view ? enemy.view.root.position : target.set(enemy.x, CONFIG.world.enemyHover, enemy.z));
  }

  update(dt, time, camera) {
    this.cameraQuaternion.copy(camera.quaternion);
    for (const view of this.active) {
      const enemy = view.enemy;
      // Smooth toward the simulated position (hides the 60 Hz step on faster screens).
      view.px = lerp(view.px, enemy.x, Math.min(1, dt * 30));
      view.pz = lerp(view.pz, enemy.z, Math.min(1, dt * 30));
      const frozen = enemy.freezeTimer > 0;
      const bob = frozen ? 0 : Math.sin(time * 3 + enemy.id) * 0.06;
      const y = CONFIG.world.enemyHover + bob;
      view.root.position.set(view.px, y, view.pz);
      view.shadow.position.y = CONFIG.world.tileTop + 0.015 - y;
      view.glow.position.y = CONFIG.world.tileTop + 0.03 - y;
      view.glow.material.opacity = 0.55 + Math.sin(time * 6 + enemy.id) * 0.15;
      view.ice.visible = frozen;
      if (frozen) view.ice.rotation.y = enemy.id;

      if (!frozen) view.spin += dt * (enemy.def.id === 'runner' ? 5 : 1.6);
      view.model.rotation.y = view.spin;
      // Lean into the direction of travel.
      view.model.rotation.x = enemy.dirZ * 0.12;
      view.model.rotation.z = -enemy.dirX * 0.12;

      if (view.spawn > 0) {
        view.spawn = Math.max(0, view.spawn - dt * 3);
        const s = 1 - view.spawn;
        view.root.scale.setScalar(s * (1 + Math.sin(s * Math.PI) * 0.3));
      }

      view.flash = Math.max(0, view.flash - dt * 7);
      const emissive = view.material.emissive;
      if (frozen) emissive.copy(FREEZE_TINT).multiplyScalar(0.7);
      else if (enemy.slowFactor < 1) emissive.copy(FROST_TINT).multiplyScalar(0.45);
      else emissive.copy(BLACK);
      if (view.flash > 0) emissive.lerp(HIT_FLASH, view.flash * 0.8);

      const fraction = Math.max(0, enemy.hp / enemy.maxHp);
      view.bar.visible = fraction < 0.999;
      view.fill.scale.x = BAR_WIDTH * fraction;
      view.fillMaterial.color.setHSL(0.33 * fraction, 0.9, 0.55);
      view.bar.quaternion.copy(this.cameraQuaternion);
    }
  }

  clear() {
    for (const view of [...this.active]) this.release(view.enemy);
  }

  dispose() {
    this.clear();
    for (const pool of this.pools.values()) {
      for (const view of pool) {
        view.material.dispose();
        view.fillMaterial.dispose();
      }
    }
    this.pools.clear();
    this.barGeometry.dispose();
    this.barBackMaterial.dispose();
    this.discGeometry.dispose();
    this.shadowTexture.dispose();
    this.glowTexture.dispose();
    this.shadowMaterial.dispose();
    for (const material of Object.values(this.glowMaterials)) material.dispose();
    this.iceGeometry.dispose();
    this.iceMaterial.dispose();
  }
}
