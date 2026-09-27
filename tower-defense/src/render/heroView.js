import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/math.js';
import { heroDef } from '../data/heroes.js';

const TOP = CONFIG.world.tileTop;
const SCALE = 1.05;
const CLIPS = { idle: 'idle', walk: 'sprint', attack: 'attack-melee-right', die: 'die', power: 'attack-kick-right' };
// Ranged heroes shoot instead of swinging.
const RANGED_CLIPS = {
  arrow: { attack: 'holding-left-shoot', power: 'holding-both-shoot' },
  frost: { attack: 'holding-right-shoot', power: 'emote-yes' },
  holy: { attack: 'holding-right-shoot', power: 'emote-yes' },
};

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * A hero figure: the character, a cape in their colour and their gear (also used for
 * the portraits). `gear` lists the geometries and materials to dispose of.
 */
export function buildHeroFigure(assets, type) {
  const def = heroDef(type);
  const model = assets.clone(def.model);
  model.scale.setScalar(SCALE);
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const gear = [];
  const parts = { model, gear, cape: null, tip: null, halo: null };
  const right = model.getObjectByName('arm-right') ?? model;
  const left = model.getObjectByName('arm-left') ?? model;
  const torso = model.getObjectByName('torso') ?? model;
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...extra });
    gear.push(m);
    return m;
  };
  const mesh = (geometry, mat) => {
    gear.push(geometry);
    const m = new THREE.Mesh(geometry, mat);
    m.castShadow = true;
    return m;
  };

  // A cape in the hero's colour tells them apart from the workers.
  const cape = mesh(new THREE.PlaneGeometry(0.34, 0.46, 1, 3), material(def.color, { side: THREE.DoubleSide, roughness: 0.8 }));
  cape.geometry.translate(0, -0.2, 0);
  cape.position.set(0, 0.2, -0.13);
  cape.rotation.x = 0.18;
  torso.add(cape);
  parts.cape = cape;

  const wood = 0x7a4a26;
  if (type === 'knight') {
    const hammer = assets.clone('survival/tool-hammer');
    hammer.scale.setScalar(1.9);
    hammer.rotation.set(Math.PI / 2, 0, 0);
    hammer.position.set(-0.02, -0.1, 0.06);
    right.add(hammer);
    const banner = assets.clone('castle/flag-pennant');
    banner.scale.setScalar(0.55);
    banner.position.set(0.05, 0.1, -0.12);
    torso.add(banner);
  } else if (type === 'archer') {
    // Bow in the left hand, quiver on the back.
    const bow = mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 18, Math.PI * 0.9), material(wood));
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
    bow.position.set(0.02, -0.18, 0.08);
    left.add(bow);
    const string = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), material(0xf4ecd8));
    string.position.set(0.02, -0.18, 0.08);
    left.add(string);
    const quiver = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.34, 8), material(0x8a4f2a));
    quiver.position.set(0.08, 0.12, -0.14);
    quiver.rotation.z = -0.35;
    torso.add(quiver);
    const feathers = mesh(new THREE.ConeGeometry(0.06, 0.1, 6), material(0xf3fff0));
    feathers.position.set(0.14, 0.3, -0.14);
    feathers.rotation.z = -0.35;
    torso.add(feathers);
  } else if (type === 'frost' || type === 'priestess') {
    // A tall staff: an ice crystal, or a glowing lantern.
    const staff = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.95, 6), material(type === 'frost' ? 0x5b6f99 : 0xe8d9b0));
    staff.position.set(0, -0.12, 0.08);
    right.add(staff);
    let tip;
    if (type === 'frost') {
      tip = mesh(new THREE.OctahedronGeometry(0.1, 0), material(0x9fe8ff, { emissive: 0x3fb8ff, emissiveIntensity: 1.4, roughness: 0.2 }));
      tip.scale.set(0.8, 1.4, 0.8);
    } else {
      tip = assets.clone('town/lantern');
      tip.scale.setScalar(0.5);
      tip.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xffc94a);
        o.material.emissiveIntensity = 0.9;
        gear.push(o.material);
      });
    }
    tip.position.set(0, 0.36, 0.08);
    right.add(tip);
    parts.tip = tip;
    // A soft halo around the tip (additive, no light: cheap on phones).
    const halo = mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: type === 'frost' ? 0x7fd8ff : 0xffe38a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    gear.push(halo.material);
    halo.castShadow = false;
    tip.add(halo);
    parts.halo = halo;
  } else if (type === 'engineer') {
    const tool = assets.clone('survival/tool-pickaxe');
    tool.scale.setScalar(1.6);
    tool.rotation.set(Math.PI / 2, 0, 0);
    tool.position.set(-0.02, -0.1, 0.06);
    right.add(tool);
    const pack = assets.clone('survival/box');
    pack.scale.setScalar(0.32);
    pack.position.set(0, 0.02, -0.16);
    torso.add(pack);
  }

  return parts;
}

/**
 * The hero: an animated Kenney character with a cape in their colour and their own
 * gear (war hammer, bow and quiver, ice staff, tool and backpack, lantern staff), a
 * ring at their feet, the aura of support heroes, a health bar, a marker where they
 * are heading and the engineer's turret.
 */
export class HeroView {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.hero = null;
    this.type = null;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.gear = [];
    this.current = null;
    this.actions = {};
    this.mixer = null;

    // Ring at their feet (brighter when selected).
    const ringGeometry = new THREE.RingGeometry(0.34, 0.44, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.7, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ring.position.y = 0.02;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);

    // Aura of the support heroes (engineer, priestess): a faint circle on the ground.
    const auraGeometry = new THREE.RingGeometry(0.96, 1, 64);
    auraGeometry.rotateX(-Math.PI / 2);
    this.auraMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
    this.aura = new THREE.Mesh(auraGeometry, this.auraMaterial);
    this.aura.position.y = 0.025;
    this.aura.renderOrder = 2;
    this.aura.visible = false;
    this.root.add(this.aura);

    // Where they are heading.
    const markerGeometry = new THREE.RingGeometry(0.18, 0.26, 24);
    markerGeometry.rotateX(-Math.PI / 2);
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false });
    this.marker = new THREE.Mesh(markerGeometry, this.markerMaterial);
    this.marker.renderOrder = 2;
    this.marker.visible = false;
    scene.add(this.marker);

    // Health bar.
    const barGeometry = new THREE.PlaneGeometry(1, 1);
    barGeometry.translate(0.5, 0, 0);
    const barMaterial = (color) => new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
    this.bar = new THREE.Group();
    const back = new THREE.Mesh(barGeometry, barMaterial(0x23263a));
    back.scale.set(0.74, 0.12, 1);
    back.position.x = -0.37;
    back.renderOrder = 20;
    this.barFillMaterial = barMaterial(0xffd65c);
    this.barFill = new THREE.Mesh(barGeometry, this.barFillMaterial);
    this.barFill.scale.set(0.7, 0.08, 1);
    this.barFill.position.x = -0.35;
    this.barFill.renderOrder = 21;
    this.bar.add(back, this.barFill);
    this.bar.position.y = 1.35;
    this.root.add(this.bar);

    this.pickBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    this.pickBox.position.y = 0.7;
    this.root.add(this.pickBox);

    // The engineer's turret: a small cannon on a stone base, and its lifetime bar.
    this.turret = new THREE.Group();
    this.turret.visible = false;
    const base = assets.clone('tower-round-bottom-a');
    base.scale.set(0.42, 0.3, 0.42);
    this.turretGun = assets.clone('weapon-turret');
    this.turretGun.scale.setScalar(0.5);
    this.turretGun.position.y = 0.3;
    this.turret.add(base, this.turretGun);
    this.turretBar = new THREE.Mesh(barGeometry, barMaterial(0xffb35a));
    this.turretBar.position.set(-0.3, 0.95, 0);
    this.turretBar.scale.set(0.6, 0.07, 1);
    this.turretBar.renderOrder = 21;
    this.turret.add(this.turretBar);
    scene.add(this.turret);
    this.turretPop = 0;

    this.disposables = [ringGeometry, auraGeometry, markerGeometry, barGeometry, back.material, this.barFillMaterial, this.ringMaterial, this.auraMaterial, this.markerMaterial, this.pickBox.geometry, this.pickBox.material, this.turretBar.material];
    this.yaw = 0;
    this.selected = false;
    this.down = false;
    this.pop = 0;
    this.cameraQuaternion = new THREE.Quaternion();
  }

  /** Builds the character and gear of hero `type` (once per type change). */
  setType(type) {
    if (type === this.type) return;
    this.type = type;
    const def = heroDef(type);
    const assets = this.assets;
    if (this.model) {
      this.mixer.stopAllAction();
      this.body.remove(this.model);
    }
    for (const item of this.gear) item.dispose();
    this.gear = [];

    const figure = buildHeroFigure(assets, type);
    this.model = figure.model;
    this.gear = figure.gear;
    this.cape = figure.cape;
    this.tip = figure.tip;
    this.halo = figure.halo;
    this.body.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = assets.animations.get(def.model) ?? [];
    const names = { ...CLIPS, ...(RANGED_CLIPS[def.attack] ?? {}) };
    this.actions = {};
    for (const [key, name] of Object.entries(names)) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (key === 'attack' || key === 'power' || key === 'die') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[key] = action;
    }
    this.current = null;
    this.ringMaterial.color.setHex(def.color);
    this.markerMaterial.color.setHex(def.color).lerp(new THREE.Color(0xffffff), 0.4);
    this.aura.visible = Boolean(def.aura);
    if (def.aura) {
      this.aura.scale.setScalar(def.aura.radius);
      this.auraMaterial.color.setHex(def.color);
    }
  }

  attach(hero) {
    this.hero = hero;
    this.root.visible = Boolean(hero);
    this.marker.visible = false;
    this.turret.visible = false;
    this.down = false;
    if (!hero) return;
    this.setType(hero.type ?? 'knight');
    hero.view = this;
    this.root.position.set(hero.x, TOP, hero.z);
    this.body.visible = true;
    this.body.scale.setScalar(1);
    this.play('idle');
  }

  detach() {
    this.attach(null);
  }

  play(key) {
    if (this.current === key || !this.actions[key]) return;
    const next = this.actions[key];
    next.reset().fadeIn(0.12).play();
    if (this.current && this.actions[this.current]) this.actions[this.current].fadeOut(0.12);
    this.current = key;
  }

  attack() {
    if (!this.actions.attack) return;
    this.current = null;
    this.play('attack');
  }

  /** World position of the weapon tip, where shots start. */
  muzzle(out) {
    const hero = this.hero;
    if (this.tip) return this.tip.getWorldPosition(out);
    return out.set(hero.x + hero.dirX * 0.3, TOP + 0.7, hero.z + hero.dirZ * 0.3);
  }

  power() {
    this.current = null;
    this.play(this.actions.power ? 'power' : 'attack');
    if (this.type === 'knight') this.spin = 1;
  }

  fall() {
    this.down = true;
    this.current = null;
    this.play('die');
  }

  revive() {
    this.down = false;
    this.pop = 1;
    this.current = null;
    this.play('idle');
  }

  setSelected(on) {
    this.selected = on;
  }

  turretPlaced() {
    this.turretPop = 1;
  }

  pick(raycaster) {
    if (!this.hero || !this.root.visible || this.down) return false;
    return raycaster.intersectObject(this.pickBox, false).length > 0;
  }

  update(dt, time, camera, turret = null) {
    const hero = this.hero;
    if (!hero) return;
    this.cameraQuaternion.copy(camera.quaternion);
    this.root.position.x = damp(this.root.position.x, hero.x, 20, dt);
    this.root.position.z = damp(this.root.position.z, hero.z, 20, dt);
    const desired = Math.atan2(hero.dirX, hero.dirZ);
    this.yaw += shortestAngle(this.yaw, desired) * Math.min(1, dt * 12);
    this.body.rotation.y = this.yaw;
    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt * 2.5);
      this.body.rotation.y += (1 - this.spin) * Math.PI * 4;
    }

    if (!this.down) {
      const busy = this.current === 'attack' || this.current === 'power';
      const finished = busy && !this.actions[this.current].isRunning();
      if (hero.moving) this.play('walk');
      else if (!busy || finished) this.play('idle');
    }
    // Fallen: they lie there, then fade until they come back at the castle.
    this.body.visible = !this.down || hero.respawn > hero.def.respawn - 3;

    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 3);
      const t = 1 - this.pop;
      this.body.scale.setScalar(Math.min(1, t * 1.3) * (1 + Math.sin(t * Math.PI) * 0.2));
    }
    // The cape flutters when running.
    if (this.cape) this.cape.rotation.x = 0.18 + (hero.moving ? 0.5 + Math.sin(time * 14) * 0.12 : Math.sin(time * 2) * 0.05);
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(time * 4) * 0.15);

    this.ringMaterial.opacity = this.down ? 0.15 : this.selected ? 0.85 + Math.sin(time * 6) * 0.15 : 0.45;
    this.ring.scale.setScalar(this.selected ? 1.15 + Math.sin(time * 4) * 0.05 : 1);
    if (this.aura.visible) this.auraMaterial.opacity = this.down ? 0 : this.selected ? 0.45 : 0.18 + Math.sin(time * 2) * 0.05;

    const goalDistance = Math.hypot(hero.goalX - hero.x, hero.goalZ - hero.z);
    this.marker.visible = !this.down && goalDistance > 0.3;
    if (this.marker.visible) {
      this.marker.position.set(hero.goalX, TOP + 0.02, hero.goalZ);
      this.marker.scale.setScalar(1 + Math.sin(time * 7) * 0.15);
    }

    const share = hero.maxHp > 0 ? hero.hp / hero.maxHp : 0;
    this.bar.visible = !this.down;
    this.barFill.scale.x = Math.max(0.001, 0.7 * share);
    this.barFillMaterial.color.setHex(share < 0.35 ? 0xff5a5a : 0xffd65c);
    this.bar.quaternion.copy(this.cameraQuaternion);
    this.mixer.update(dt);

    // Turret: pops up, turns toward its target, shows the time left.
    this.turret.visible = Boolean(turret);
    if (turret) {
      this.turret.position.set(turret.x, TOP, turret.z);
      this.turretGun.rotation.y = damp(this.turretGun.rotation.y, this.turretGun.rotation.y + shortestAngle(this.turretGun.rotation.y, Math.atan2(turret.dirX, turret.dirZ)), 14, dt);
      this.turretPop = Math.max(0, this.turretPop - dt * 3);
      const t = 1 - this.turretPop;
      this.turret.scale.setScalar(Math.min(1, t * 1.4) * (1 + Math.sin(t * Math.PI) * 0.2));
      this.turretBar.scale.x = Math.max(0.001, 0.6 * (turret.time / turret.max));
      this.turretBar.quaternion.copy(this.cameraQuaternion);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.marker.removeFromParent();
    this.turret.removeFromParent();
    this.mixer?.stopAllAction();
    for (const item of [...this.disposables, ...this.gear]) item.dispose();
  }
}
