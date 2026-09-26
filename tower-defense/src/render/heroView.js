import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/math.js';

const TOP = CONFIG.world.tileTop;
const MODEL = 'characters/character-male-e';
const SCALE = 1.05;
const CLIPS = { idle: 'idle', walk: 'sprint', attack: 'attack-melee-right', die: 'die', power: 'attack-kick-right' };

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * The knight: an animated Kenney character with a war hammer and a pennant on his
 * back, a golden ring at his feet, a health bar and a marker where he is heading.
 */
export class HeroView {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.hero = null;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);

    this.body = new THREE.Group();
    this.root.add(this.body);
    this.model = assets.clone(MODEL);
    this.model.scale.setScalar(SCALE);
    this.model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.body.add(this.model);
    const hand = this.model.getObjectByName('arm-right') ?? this.model;
    this.hammer = assets.clone('survival/tool-hammer');
    this.hammer.scale.setScalar(1.9);
    this.hammer.rotation.set(Math.PI / 2, 0, 0);
    this.hammer.position.set(-0.02, -0.1, 0.06);
    hand.add(this.hammer);
    const torso = this.model.getObjectByName('torso') ?? this.model;
    this.banner = assets.clone('castle/flag-pennant');
    this.banner.scale.setScalar(0.55);
    this.banner.position.set(0.05, 0.1, -0.12);
    torso.add(this.banner);

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = assets.animations.get(MODEL) ?? [];
    this.actions = {};
    for (const [key, name] of Object.entries(CLIPS)) {
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

    // Golden ring at his feet (brighter when selected).
    const ringGeometry = new THREE.RingGeometry(0.34, 0.44, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.7, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ring.position.y = 0.02;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);

    // Where he is heading.
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

    this.disposables = [ringGeometry, markerGeometry, barGeometry, back.material, this.barFillMaterial, this.ringMaterial, this.markerMaterial, this.pickBox.geometry, this.pickBox.material];
    this.yaw = 0;
    this.selected = false;
    this.down = false;
    this.pop = 0;
    this.cameraQuaternion = new THREE.Quaternion();
  }

  attach(hero) {
    this.hero = hero;
    this.root.visible = Boolean(hero);
    this.marker.visible = false;
    this.down = false;
    if (!hero) return;
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

  power() {
    this.current = null;
    this.play(this.actions.power ? 'power' : 'attack');
    this.spin = 1;
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

  pick(raycaster) {
    if (!this.hero || !this.root.visible || this.down) return false;
    return raycaster.intersectObject(this.pickBox, false).length > 0;
  }

  update(dt, time, camera) {
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
    // Fallen: he lies there, then fades until he comes back at the castle.
    this.body.visible = !this.down || hero.respawn > 9;

    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 3);
      const t = 1 - this.pop;
      this.body.scale.setScalar(Math.min(1, t * 1.3) * (1 + Math.sin(t * Math.PI) * 0.2));
    }

    this.ringMaterial.opacity = this.down ? 0.15 : this.selected ? 0.85 + Math.sin(time * 6) * 0.15 : 0.45;
    this.ring.scale.setScalar(this.selected ? 1.15 + Math.sin(time * 4) * 0.05 : 1);

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
  }

  dispose() {
    this.root.removeFromParent();
    this.marker.removeFromParent();
    this.mixer.stopAllAction();
    for (const item of this.disposables) item.dispose();
  }
}
