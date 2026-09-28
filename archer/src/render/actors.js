import * as THREE from 'three';
import { damp } from '../core/math.js';

const TMP = new THREE.Color();

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Health bar floating above an actor (always faces the camera). */
function makeBar(width, color, disposables) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0.5, 0, 0);
  const mat = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const back = new THREE.Mesh(geometry, mat(0x1a1a24));
  back.scale.set(width + 0.06, 0.13, 1);
  back.position.x = -(width + 0.06) / 2;
  back.renderOrder = 30;
  const fillMaterial = mat(color);
  const fill = new THREE.Mesh(geometry, fillMaterial);
  fill.scale.set(width, 0.08, 1);
  fill.position.x = -width / 2;
  fill.renderOrder = 31;
  const group = new THREE.Group();
  group.add(back, fill);
  disposables.push(geometry, back.material, fillMaterial);
  return { group, fill, width, fillMaterial };
}

/** Soft round shadow under actors (cheaper and clearer than relying on the shadow map). */
function blobShadow(radius, disposables, texture) {
  const geometry = new THREE.PlaneGeometry(radius * 2.6, radius * 2.6);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.45, depthWrite: false, color: 0x000000 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  disposables.push(geometry, material);
  return mesh;
}

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/** Plays one clip at a time with short cross-fades. */
class Animator {
  constructor(model, clips, names) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries(names)) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (key === 'die' || key === 'shoot' || key === 'hit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[key] = action;
    }
    this.current = null;
  }

  play(key, restart = false, speed = 1) {
    const next = this.actions[key];
    if (!next) return;
    next.timeScale = speed;
    if (this.current === key && !restart) return;
    next.reset().fadeIn(0.1).play();
    if (this.current && this.current !== key) this.actions[this.current]?.fadeOut(0.1);
    this.current = key;
  }

  busy() {
    const a = this.actions[this.current];
    return (this.current === 'shoot' || this.current === 'hit') && a?.isRunning();
  }
}

/**
 * The hero (Kenney character with a bow, a quiver and a cape) and the monsters:
 * animated models, health bars, hit flashes, spawn and death animations.
 */
export class Actors {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.disposables = [];
    this.shadowTexture = radialTexture();
    this.enemies = new Map();
    this.cameraQuaternion = new THREE.Quaternion();
    this.hero = null;
  }

  // ------------------------------------------------------------ hero

  createHero(model = 'characters/character-female-b', capeColor = 0x3fa9ff) {
    if (this.hero) this.removeHero();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const figure = this.assets.clone(model);
    figure.scale.setScalar(1.12);
    figure.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    body.add(figure);
    const gear = [];
    const material = (color, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
      gear.push(m);
      return m;
    };
    const mesh = (geometry, mat) => {
      gear.push(geometry);
      const m = new THREE.Mesh(geometry, mat);
      m.castShadow = true;
      return m;
    };
    const left = figure.getObjectByName('arm-left') ?? figure;
    const torso = figure.getObjectByName('torso') ?? figure;
    // Bow in the left hand.
    const bow = mesh(new THREE.TorusGeometry(0.27, 0.024, 6, 20, Math.PI * 0.92), material(0x8a4f2a, { roughness: 0.5 }));
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.04);
    bow.position.set(0.02, -0.18, 0.08);
    left.add(bow);
    const string = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.52, 4), material(0xfff4dc));
    string.position.set(0.02, -0.18, 0.08);
    left.add(string);
    // Quiver and cape.
    const quiver = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.34, 8), material(0x6a3f22));
    quiver.position.set(0.08, 0.12, -0.14);
    quiver.rotation.z = -0.35;
    torso.add(quiver);
    const cape = mesh(new THREE.PlaneGeometry(0.36, 0.48, 1, 3), material(capeColor, { side: THREE.DoubleSide, roughness: 0.8 }));
    cape.geometry.translate(0, -0.2, 0);
    cape.position.set(0, 0.2, -0.13);
    torso.add(cape);

    // Cyan ring at the feet like the original, and a big pick-free health bar.
    const ringGeometry = new THREE.RingGeometry(0.36, 0.46, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.55, depthWrite: false });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.02;
    ring.renderOrder = 2;
    root.add(ring);
    gear.push(ringGeometry, ringMaterial);
    root.add(blobShadow(0.32, gear, this.shadowTexture));
    const bar = makeBar(0.8, 0x5fe06a, gear);
    bar.group.position.y = 1.25;
    root.add(bar.group);

    const animator = new Animator(figure, this.assets.animations.get(model) ?? [], { idle: 'idle', run: 'sprint', shoot: 'holding-left-shoot', die: 'die', hit: 'emote-no' });
    animator.play('idle');
    this.scene.add(root);
    this.hero = { root, body, figure, cape, ring, ringMaterial, bar, animator, gear, yaw: Math.PI, flash: 0, shieldMesh: null };
    // Shield bubble (Bouclier divin).
    const shieldGeometry = new THREE.SphereGeometry(0.62, 20, 14);
    const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shield.position.y = 0.5;
    shield.visible = false;
    root.add(shield);
    gear.push(shieldGeometry, shieldMaterial);
    this.hero.shieldMesh = shield;
    return this.hero;
  }

  // ------------------------------------------------------------ pet

  /** A small glowing creature with flapping wings. */
  createPet(color) {
    this.removePet();
    const gear = [];
    const root = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), bodyMaterial);
    const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x101018 }));
    eyes.position.set(0.05, 0.03, 0.11);
    const eye2 = eyes.clone();
    eye2.position.x = -0.05;
    const wingGeometry = new THREE.PlaneGeometry(0.22, 0.14);
    wingGeometry.translate(0.11, 0, 0);
    const wingMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const left = new THREE.Mesh(wingGeometry, wingMaterial);
    const right = new THREE.Mesh(wingGeometry, wingMaterial);
    right.scale.x = -1;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fly = new THREE.Group();
    fly.add(body, eyes, eye2, left, right, halo);
    root.add(fly);
    root.add(blobShadow(0.12, gear, this.shadowTexture));
    gear.push(body.geometry, bodyMaterial, eyes.geometry, eyes.material, wingGeometry, wingMaterial, halo.geometry, halo.material);
    this.scene.add(root);
    this.pet = { root, fly, left, right, halo, gear };
  }

  removePet() {
    if (!this.pet) return;
    this.pet.root.removeFromParent();
    for (const item of this.pet.gear) item.dispose();
    this.pet = null;
  }

  removeHero() {
    const hero = this.hero;
    if (!hero) return;
    hero.root.removeFromParent();
    hero.animator.mixer.stopAllAction();
    for (const item of hero.gear) item.dispose();
    this.hero = null;
  }

  heroShoot() {
    this.hero?.animator.play('shoot', true, 1.6);
  }

  heroHurt() {
    if (this.hero) this.hero.flash = 0.25;
  }

  heroDie() {
    this.hero?.animator.play('die', true);
  }

  heroRevive() {
    this.hero?.animator.play('idle', true);
  }

  // ------------------------------------------------------------ monsters

  addEnemy(enemy) {
    const def = enemy.def;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const model = this.assets.clone(def.model);
    const scale = def.scale * 1.12;
    model.scale.setScalar(scale);
    // Own material so each monster can flash and be tinted.
    const materials = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      if (def.tint) o.material.color.setHex(def.tint);
      if (def.id === 'ghost' || def.id === 'wisp') {
        o.material.transparent = true;
        o.material.opacity = 0.82;
      }
      o.material.emissive = new THREE.Color(0x000000);
      materials.push(o.material);
    });
    body.add(model);
    const gear = [...materials];
    root.add(blobShadow(def.radius, gear, this.shadowTexture));
    let bar = null;
    if (!def.boss) {
      bar = makeBar(0.7 * Math.max(0.8, def.scale), 0xff5a4a, gear);
      bar.group.position.y = 0.95 * scale + 0.25;
      bar.group.visible = false;
      root.add(bar.group);
    }
    const animator = new Animator(model, this.assets.animations.get(def.model) ?? [], { idle: 'idle', walk: 'walk', run: 'sprint', die: 'die', hit: 'emote-no', aim: 'pick-up' });
    animator.play('idle');
    root.position.set(enemy.x, 0, enemy.z);
    body.position.y = -1.2;
    this.scene.add(root);
    const view = { enemy, root, body, model, materials, bar, animator, gear, yaw: Math.atan2(enemy.dirX, enemy.dirZ), dying: 0, scale, floaty: Boolean(def.flying) };
    enemy.view = view;
    this.enemies.set(enemy.id, view);
    return view;
  }

  enemyDied(enemy) {
    const view = enemy.view;
    if (!view) return;
    view.dying = 1;
    view.animator.play('die', true, 1.4);
    if (view.bar) view.bar.group.visible = false;
  }

  removeEnemy(view) {
    view.root.removeFromParent();
    view.animator.mixer.stopAllAction();
    for (const item of view.gear) item.dispose();
    this.enemies.delete(view.enemy.id);
  }

  clearEnemies() {
    for (const view of [...this.enemies.values()]) this.removeEnemy(view);
  }

  // ------------------------------------------------------------ frame

  update(dt, time, camera, run) {
    this.cameraQuaternion.copy(camera.quaternion);
    const hero = this.hero;
    if (hero && run) {
      const p = run.player;
      hero.root.position.x = damp(hero.root.position.x, p.x, 30, dt);
      hero.root.position.z = damp(hero.root.position.z, p.z, 30, dt);
      const desired = Math.atan2(p.dirX, p.dirZ);
      hero.yaw += shortestAngle(hero.yaw, desired) * Math.min(1, dt * 16);
      hero.body.rotation.y = hero.yaw;
      if (run.state !== 'dead') {
        if (p.moving) hero.animator.play('run', false, 1.1);
        else if (!hero.animator.busy()) hero.animator.play('idle');
      }
      hero.cape.rotation.x = 0.18 + (p.moving ? 0.55 + Math.sin(time * 16) * 0.12 : Math.sin(time * 2) * 0.05);
      const share = p.hp / p.maxHp;
      hero.bar.fill.scale.x = Math.max(0.001, hero.bar.width * share);
      hero.bar.fillMaterial.color.setHex(share < 0.3 ? 0xff5a4a : 0x5fe06a);
      hero.bar.group.quaternion.copy(this.cameraQuaternion);
      // Blink while invulnerable after a hit.
      hero.body.visible = !(p.invulnerable > 0 && p.invulnerable < 0.5 && Math.floor(time * 20) % 2 === 0);
      hero.ringMaterial.opacity = 0.45 + Math.sin(time * 5) * 0.12;
      hero.shieldMesh.visible = Boolean(p.shieldReady);
      if (hero.shieldMesh.visible) hero.shieldMesh.material.opacity = 0.18 + Math.sin(time * 6) * 0.06;
      hero.animator.mixer.update(dt);
    }

    const pet = this.pet;
    if (pet && run?.pet) {
      const p = run.pet;
      pet.root.position.set(damp(pet.root.position.x, p.x, 20, dt), 0, damp(pet.root.position.z, p.z, 20, dt));
      pet.fly.position.y = 0.95 + Math.sin(time * 3.2) * 0.12;
      const flap = Math.sin(time * 22) * 0.9;
      pet.left.rotation.z = flap;
      pet.right.rotation.z = -flap;
      pet.root.rotation.y = hero ? hero.yaw : 0;
      pet.halo.material.opacity = 0.18 + Math.sin(time * 5) * 0.06;
    }

    for (const view of this.enemies.values()) {
      const e = view.enemy;
      if (view.dying > 0) {
        view.dying -= dt * 1.3;
        if (view.dying < 0.35) {
          view.root.position.y -= dt * 1.2;
          for (const m of view.materials) {
            m.transparent = true;
            m.opacity = Math.max(0, view.dying / 0.35);
          }
        }
        view.animator.mixer.update(dt);
        if (view.dying <= 0) this.removeEnemy(view);
        continue;
      }
      view.root.position.x = damp(view.root.position.x, e.x, 25, dt);
      view.root.position.z = damp(view.root.position.z, e.z, 25, dt);
      // Rises from the ground when it spawns.
      view.body.position.y = damp(view.body.position.y, e.spawning > 0 ? -1.2 : view.floaty ? 0.25 + Math.sin(time * 3 + e.id) * 0.08 : 0, 8, dt);
      const aiming = e.state === 'aim';
      if (e.moving || aiming) {
        const desired = Math.atan2(aiming ? e.aimX : e.dirX, aiming ? e.aimZ : e.dirZ);
        view.yaw += shortestAngle(view.yaw, desired) * Math.min(1, dt * 12);
      }
      view.body.rotation.y = view.yaw;
      if (e.state === 'dash') view.animator.play('run', false, 1.6);
      else if (aiming) view.animator.play('aim');
      else if (e.moving) view.animator.play('walk', false, 1 + e.def.speed * 0.3);
      else view.animator.play('idle');
      // Hit flash (white), frozen (blue), burning (orange glow).
      const flash = Math.max(0, e.flash) / 0.12;
      for (const m of view.materials) {
        if (flash > 0) m.emissive.setRGB(flash, flash, flash);
        else if (e.frozen > 0) m.emissive.setHex(0x3a8fd6);
        else if (e.state === 'aim' || e.state === 'slam') m.emissive.copy(TMP.setHex(0xff2a1a).multiplyScalar(0.35 + Math.sin(time * 30) * 0.2));
        else m.emissive.setRGB(0, 0, 0);
      }
      if (view.bar) {
        view.bar.group.visible = e.hp < e.maxHp;
        view.bar.fill.scale.x = Math.max(0.001, view.bar.width * (e.hp / e.maxHp));
        view.bar.group.quaternion.copy(this.cameraQuaternion);
      }
      view.animator.mixer.update(e.frozen > 0 ? 0 : dt * (1 - e.slow * 0.6));
    }
  }
}
