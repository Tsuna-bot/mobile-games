import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PIECE_HEIGHT, stackHeight } from '../data/towers.js';
import { damp } from '../core/math.js';

// Child node names in the Kenney weapon models that animate when firing.
const MOVING_PART = {
  'weapon-ballista': 'arrow',
  'weapon-cannon': 'barrel',
  'weapon-turret': 'barrel',
  'weapon-catapult': 'catapult',
};

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

// Towers whose top does not aim: crystals and the gold mine spin and float instead.
const NON_AIMING = new Set(['frost', 'tesla', 'goldmine', 'laser']);
const BEAM_COLOR = new THREE.Color(0xff5ad8).multiplyScalar(2.2);

const tintedMaterials = new Map();

/** Shared glowing variant of the palette material for tinted crystals. */
function tintedMaterial(assets, tint) {
  if (!tintedMaterials.has(tint)) {
    const material = assets.material.clone();
    material.color.set(tint);
    material.emissive.set(tint);
    material.emissiveIntensity = 0.55;
    tintedMaterials.set(tint, material);
  }
  return tintedMaterials.get(tint);
}

/** Height where a tower's weapon sits (crystal clusters are centered on their origin). */
export function weaponBaseY(def, level) {
  const scale = def.weaponScale?.[level] ?? 1;
  return stackHeight(def, level) + (def.weapon === 'tower-round-crystals' ? 0.37 * scale : 0);
}

/** Builds the stacked Kenney tower model for a tower level. */
export function buildTowerModel(assets, def, level) {
  const root = new THREE.Group();
  let y = 0;
  for (const piece of def.pieces[level]) {
    const mesh = assets.clone(piece);
    mesh.position.y = y;
    root.add(mesh);
    y += PIECE_HEIGHT[piece];
  }
  const weapon = assets.clone(def.weapon);
  weapon.scale.setScalar(def.weaponScale?.[level] ?? 1);
  weapon.position.y = weaponBaseY(def, level);
  if (def.weaponTint) {
    const material = tintedMaterial(assets, def.weaponTint);
    weapon.traverse((o) => {
      if (o.isMesh) o.material = material;
    });
  }
  root.add(weapon);
  return { root, weapon, part: weapon.getObjectByName(MOVING_PART[def.weapon]) ?? null };
}

/** Visual counterpart of each simulated tower: aiming, recoil, build and upgrade animations. */
export class TowerViews {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.views = new Set();
    this.pickGeometry = new THREE.BoxGeometry(0.8, 1, 0.8);
    this.pickGeometry.translate(0, 0.5, 0);
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    // Golden aura under fully upgraded towers.
    this.auraGeometry = new THREE.RingGeometry(0.42, 0.52, 32, 1, 0, Math.PI * 1.6);
    this.auraGeometry.rotateX(-Math.PI / 2);
    // Prism beam: an open cylinder along +Z, stretched to the target each frame.
    this.beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamGeometry.rotateX(Math.PI / 2);
    this.beamGeometry.translate(0, 0, 0.5);
    this.beamMaterial = new THREE.MeshBasicMaterial({ color: BEAM_COLOR, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamTarget = new THREE.Vector3();
    this.auraMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffc93c).multiplyScalar(1.8),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  add(tower) {
    const view = {
      tower,
      group: new THREE.Group(),
      model: null,
      weapon: null,
      part: null,
      partRest: new THREE.Vector3(),
      partRestRotation: 0,
      yaw: Math.PI,
      recoil: 0,
      pop: 0,
    };
    view.group.position.set(tower.x, CONFIG.world.tileTop, tower.z);
    // Invisible box used for tap picking: a tower can be selected even when another hides its tile.
    view.pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    view.pick.userData.tower = tower;
    view.group.add(view.pick);
    this.scene.add(view.group);
    if (tower.def.levels[0].beam) {
      view.beam = new THREE.Group();
      const glow = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      const core = new THREE.Mesh(this.beamGeometry, this.beamCore);
      core.scale.set(0.4, 0.4, 1);
      view.beam.add(glow, core);
      view.beam.visible = false;
      view.beam.renderOrder = 5;
      this.scene.add(view.beam);
    }
    tower.view = view;
    this.views.add(view);
    this.rebuild(view);
    return view;
  }

  rebuild(view) {
    if (view.model) view.group.remove(view.model);
    const built = buildTowerModel(this.assets, view.tower.def, view.tower.level);
    view.model = built.root;
    view.weapon = built.weapon;
    view.part = built.part;
    if (view.part) {
      view.partRest.copy(view.part.position);
      view.partRestRotation = view.part.rotation.x;
    }
    view.weapon.rotation.y = view.yaw;
    view.group.add(view.model);
    view.pick.scale.y = weaponBaseY(view.tower.def, view.tower.level) + 0.5;
    view.pop = 1;
    if (view.tower.maxed && !view.aura) {
      view.aura = new THREE.Mesh(this.auraGeometry, this.auraMaterial);
      view.aura.position.y = 0.02;
      view.aura.renderOrder = 2;
      view.group.add(view.aura);
    }
  }

  upgrade(tower) {
    this.rebuild(tower.view);
  }

  remove(tower) {
    const view = tower.view;
    if (!view) return;
    view.group.removeFromParent();
    view.beam?.removeFromParent();
    this.views.delete(view);
    tower.view = null;
  }

  fired(tower) {
    const view = tower.view;
    if (view) view.recoil = 1;
  }

  /** Height of the weapon for effects (muzzle flash). */
  muzzleHeight(tower) {
    return CONFIG.world.tileTop + stackHeight(tower.def, tower.level) + 0.3;
  }

  update(dt, time) {
    for (const view of this.views) {
      const { tower } = view;
      if (view.aura) view.aura.rotation.y = time * 1.5;
      if (view.beam) {
        const target = tower.target;
        const on = tower.beaming > 0 && target?.active;
        view.beam.visible = Boolean(on);
        if (on) {
          const muzzle = view.beam.position.set(tower.x, CONFIG.world.tileTop + weaponBaseY(tower.def, tower.level) + 0.35, tower.z);
          const end = target.view ? this.beamTarget.copy(target.view.root.position) : this.beamTarget.set(target.x, CONFIG.world.enemyHover, target.z);
          view.beam.lookAt(end);
          const width = 0.05 + 0.022 * tower.beamHeat + Math.sin(time * 50) * 0.008;
          view.beam.scale.set(width, width, muzzle.distanceTo(end));
        }
      }
      if (NON_AIMING.has(tower.def.id)) {
        // Crystal and gold towers don't aim: their top slowly spins and floats.
        view.weapon.rotation.y = time * (tower.def.id === 'tesla' ? 2.2 : 0.9);
        view.weapon.position.y = weaponBaseY(tower.def, tower.level) + Math.sin(time * 2 + tower.id) * 0.04;
      } else if (tower.target) {
        const desired = Math.atan2(tower.target.x - tower.x, tower.target.z - tower.z);
        view.yaw += shortestAngle(view.yaw, desired) * Math.min(1, dt * 12);
        view.weapon.rotation.y = view.yaw;
      }

      if (view.part) {
        view.recoil = damp(view.recoil, 0, 7, dt);
        const r = view.recoil;
        if (tower.def.id === 'catapult') {
          view.part.rotation.x = view.partRestRotation - r * 1.1;
        } else if (tower.def.id === 'ballista') {
          // The loaded bolt disappears when shot and slides back in while reloading.
          view.part.visible = r < 0.55;
          view.part.position.z = view.partRest.z - r * 0.25;
        } else {
          view.part.position.z = view.partRest.z - r * 0.12;
        }
      }

      if (view.pop > 0) {
        view.pop = Math.max(0, view.pop - dt * 2.2);
        const t = 1 - view.pop;
        // Elastic settle: squash on landing, overshoot, rest.
        const bounce = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.35;
        view.model.scale.set(1 - bounce * 0.5, 1 + bounce, 1 - bounce * 0.5);
      }
    }
  }

  /** Towers under a screen ray, nearest first. */
  pick(raycaster) {
    const boxes = [];
    for (const view of this.views) boxes.push(view.pick);
    return raycaster.intersectObjects(boxes, false).map((hit) => hit.object.userData.tower);
  }

  clear() {
    for (const view of this.views) {
      view.group.removeFromParent();
      view.beam?.removeFromParent();
    }
    this.views.clear();
  }
}
