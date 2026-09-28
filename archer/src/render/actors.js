import * as THREE from 'three';
import { damp } from '../core/math.js';
import { mergeSkinned } from './batch.js';
import { skinOf } from '../data/skins.js';
import { patchRim } from './surfaces.js';

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

/** Assassin marks above a monster: 1 to 3 purple pips (shared textures). */
function markMaterials() {
  return [1, 2, 3].map((n) => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 32;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x + 11, 16);
      ctx.lineTo(x, 28);
      ctx.lineTo(x - 11, 16);
      ctx.closePath();
      ctx.fillStyle = i < n ? (n === 3 ? '#ff5ad8' : '#b98cff') : 'rgba(20, 12, 40, 0.55)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20, 8, 40, 0.9)';
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  });
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

// KayKit characters are ~2.5 units tall: this brings them to ~1.3.
const CHARACTER_SCALE = 0.52;

// Weapons and accessories modelled on the characters: all hidden unless asked for.
const PARTS = new Set(['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Barbarian_Hat',
  '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff']);

/** Plays one clip at a time with short cross-fades. */
class Animator {
  constructor(model, clips, names) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries(names)) {
      const clip = name && THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (key === 'die' || key === 'shoot' || key === 'hit' || key === 'aim' || key === 'spawn' || key === 'slash') {
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
    next.reset().fadeIn(0.12).play();
    if (this.current && this.current !== key) this.actions[this.current]?.fadeOut(0.12);
    this.current = key;
  }

  busy() {
    const a = this.actions[this.current];
    return (this.current === 'shoot' || this.current === 'hit' || this.current === 'slash') && a?.isRunning();
  }
}

/** A KayKit character with the wanted weapon parts shown, and an extra prop in the right hand. */
function dressCharacter(assets, name, show = [], attach = null) {
  const figure = assets.clone(name);
  figure.scale.setScalar(CHARACTER_SCALE);
  figure.traverse((o) => {
    if (PARTS.has(o.name)) o.visible = show.includes(o.name);
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  mergeSkinned(figure, `${name}|${show.join(',')}`, assets.mergedCache);
  if (attach) {
    const hand = figure.getObjectByName('handslot.r');
    if (hand) hand.add(assets.clone(attach));
  }
  return figure;
}

/**
 * The hero and the monsters (KayKit characters with their weapons), health bars,
 * hit flashes, spawn and death animations.
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
    this.theme = 'forest';
    this.markGeometry = new THREE.PlaneGeometry(0.54, 0.18);
    this.markMats = null;
  }

  // ------------------------------------------------------------ hero

  createHero(def) {
    if (this.hero) this.removeHero();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const gear = [];
    const figure = dressCharacter(this.assets, def.model, def.show, def.attach);
    body.add(figure);
    // A tinted hero (the assassin) gets its own copies of the shared materials.
    if (def.tint) {
      const copies = new Map();
      figure.traverse((o) => {
        if (!o.isMesh) return;
        let copy = copies.get(o.material);
        if (!copy) {
          copy = patchRim(o.material.clone());
          if (copy.map) copy.color.setHex(def.tint);
          copies.set(o.material, copy);
          gear.push(copy);
        }
        o.material = copy;
      });
    }

    // Ring at the feet in the hero's colour, and a big health bar.
    const ringGeometry = new THREE.RingGeometry(0.36, 0.46, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: def.cape ?? 0x5fe0ff, transparent: true, opacity: 0.55, depthWrite: false });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.02;
    ring.renderOrder = 2;
    root.add(ring);
    gear.push(ringGeometry, ringMaterial);
    root.add(blobShadow(0.32, gear, this.shadowTexture));
    const bar = makeBar(0.8, 0x5fe06a, gear);
    bar.group.position.y = 1.35;
    root.add(bar.group);

    const animator = new Animator(figure, this.assets.clips, { idle: 'Idle', run: 'Running_A', shoot: def.shoot ?? '1H_Ranged_Shoot', die: 'Death_A', hit: 'Hit_A', cheer: 'Cheer', slash: '2H_Melee_Attack_Spin' });
    animator.play('idle');
    this.scene.add(root);
    this.hero = { root, body, figure, ring, ringMaterial, bar, animator, gear, yaw: Math.PI, flash: 0, shieldMesh: null };
    // Shield bubble (Bouclier divin).
    const shieldGeometry = new THREE.SphereGeometry(0.66, 24, 16);
    const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shield.position.y = 0.55;
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

  /** Shadow strike: vanish (`out`), appear and slash (`in`), come back (`back`). */
  heroShadow(phase, x, z) {
    const hero = this.hero;
    if (!hero) return;
    hero.root.position.set(x, 0, z);
    if (phase === 'in') hero.animator.play('slash', true, 2.2);
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
    const gear = [];
    const materials = [];
    const skin = skinOf(def, this.theme);
    const monster = skin.model.startsWith('q_');
    const model = monster ? this.assets.clone(skin.model) : dressCharacter(this.assets, skin.model, skin.show, skin.attach);
    // Quaternius monsters are fitted to a height; KayKit characters share one scale.
    const height = skin.height ?? 1.3 * def.scale;
    if (skin.height) model.scale.setScalar(height / this.assets.height(skin.model));
    else model.scale.setScalar(CHARACTER_SCALE * def.scale);
    // Own materials so each monster can flash and be tinted.
    const copies = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      // Blob shadows are enough for the crowd; only bosses cast real ones.
      o.castShadow = Boolean(def.boss);
      let copy = copies.get(o.material);
      if (!copy) {
        copy = o.material.clone();
        if (skin.tint && copy.map) copy.color.setHex(skin.tint);
        copy.emissive = new THREE.Color(0x000000);
        patchRim(copy);
        copies.set(o.material, copy);
        materials.push(copy);
      }
      o.material = copy;
    });
    gear.push(...materials);
    const scale = def.scale;
    body.add(model);
    root.add(blobShadow(def.radius, gear, this.shadowTexture));
    let bar = null;
    if (!def.boss) {
      bar = makeBar(0.7 * Math.max(0.8, def.scale), 0xff5a4a, gear);
      bar.group.position.y = height + (skin.hover ? 0.55 : 0.25);
      bar.group.visible = false;
      root.add(bar.group);
    }
    // Assassin marks (only drawn when the monster carries some).
    this.markMats ??= markMaterials();
    const mark = new THREE.Mesh(this.markGeometry, this.markMats[0]);
    mark.renderOrder = 32;
    mark.visible = false;
    mark.position.y = height + (skin.hover ? 0.8 : 0.5);
    root.add(mark);
    const skeleton = skin.model.startsWith('skeleton');
    const clips = monster ? this.assets.clipsOf(skin.model) : this.assets.clips;
    const has = (name) => clips.some((c) => c.name === name);
    const pickClip = (...names) => names.find(has) ?? null;
    const animator = new Animator(model, clips, monster ? {
      idle: pickClip('Idle', 'Flying_Idle'), walk: pickClip('Walk', 'Fast_Flying', 'Flying_Idle'), run: pickClip('Run', 'Fast_Flying', 'Walk'),
      die: pickClip('Death'), hit: pickClip('HitReact', 'HitRecieve'), aim: pickClip('Weapon', 'Punch', 'Bite_Front', 'Headbutt'),
    } : {
      idle: skeleton ? 'Idle_Combat' : 'Idle', walk: skeleton ? 'Walking_D_Skeletons' : 'Walking_A', run: 'Running_A', die: 'Death_A', hit: 'Hit_A', aim: skin.aimClip, spawn: skeleton ? 'Spawn_Ground_Skeletons' : null,
    });
    animator.play(animator.actions.spawn ? 'spawn' : 'idle');
    root.position.set(enemy.x, 0, enemy.z);
    // Skeletons climb out of the ground with their own animation; the others rise.
    body.position.y = animator.actions.spawn ? 0 : -1.2;
    this.scene.add(root);
    const view = { enemy, root, body, model, materials, bar, mark, animator, gear, yaw: Math.atan2(enemy.dirX, enemy.dirZ), dying: 0, scale, floaty: skin.hover, risesByAnim: Boolean(animator.actions.spawn) };
    enemy.view = view;
    this.enemies.set(enemy.id, view);
    return view;
  }

  /** Squash and a white flash when an arrow lands. */
  enemyHit(enemy, crit) {
    const view = enemy.view;
    if (!view || view.dying > 0) return;
    view.punch = crit ? 1 : 0.6;
  }

  enemyDied(enemy) {
    const view = enemy.view;
    if (!view) return;
    view.dying = 1;
    view.animator.play('die', true, 1.4);
    if (view.bar) view.bar.group.visible = false;
    view.mark.visible = false;
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
      const blink = p.shadow?.blink;
      const vanished = Boolean(blink && blink.phase !== 'strike');
      hero.ring.visible = !vanished;
      const desired = Math.atan2(p.dirX, p.dirZ);
      hero.yaw += shortestAngle(hero.yaw, desired) * Math.min(1, dt * 16);
      hero.body.rotation.y = hero.yaw;
      if (run.state !== 'dead') {
        if (p.moving) hero.animator.play('run', false, 1.1);
        else if (!hero.animator.busy()) hero.animator.play('idle');
      }
      const share = p.hp / p.maxHp;
      hero.bar.fill.scale.x = Math.max(0.001, hero.bar.width * share);
      hero.bar.fillMaterial.color.setHex(share < 0.3 ? 0xff5a4a : 0x5fe06a);
      hero.bar.group.quaternion.copy(this.cameraQuaternion);
      // Blink while invulnerable after a hit.
      hero.body.visible = !vanished && !(p.invulnerable > 0 && p.invulnerable < 0.5 && !p.shadow && Math.floor(time * 20) % 2 === 0);
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
      const hidden = e.spawning > 0 && !view.risesByAnim;
      view.body.position.y = damp(view.body.position.y, hidden ? -1.2 : view.floaty ? 0.25 + Math.sin(time * 3 + e.id) * 0.08 : 0, 8, dt);
      const aiming = e.state === 'aim';
      if (e.moving || aiming) {
        const desired = Math.atan2(aiming ? e.aimX : e.dirX, aiming ? e.aimZ : e.dirZ);
        view.yaw += shortestAngle(view.yaw, desired) * Math.min(1, dt * 12);
      }
      view.body.rotation.y = view.yaw;
      if (view.punch > 0) {
        view.punch = Math.max(0, view.punch - dt * 7);
        const k = Math.sin(view.punch * Math.PI) * 0.16 * view.punch;
        view.body.scale.set(1 + k, 1 - k, 1 + k);
      } else view.body.scale.set(1, 1, 1);
      if (e.spawning > 0 && view.risesByAnim) view.animator.play('spawn', false, 1.3);
      else if (e.state === 'dash') view.animator.play('run', false, 1.6);
      else if (aiming || e.state === 'slam') view.animator.play('aim', false, 0.8);
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
      const marks = e.marks ?? 0;
      view.mark.visible = marks > 0;
      if (marks > 0) {
        view.mark.material = this.markMats[marks - 1];
        view.mark.quaternion.copy(this.cameraQuaternion);
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
