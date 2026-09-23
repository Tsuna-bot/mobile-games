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
  // The crystal cluster is centered on its origin; lift it onto the stack.
  weapon.position.y = def.id === 'frost' ? y + 0.37 : y;
  root.add(weapon);
  return { root, weapon, part: weapon.getObjectByName(MOVING_PART[def.weapon]) ?? null };
}

/** Visual counterpart of each simulated tower: aiming, recoil, build and upgrade animations. */
export class TowerViews {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.views = new Set();
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
    this.scene.add(view.group);
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
    view.pop = 1;
  }

  upgrade(tower) {
    this.rebuild(tower.view);
  }

  remove(tower) {
    const view = tower.view;
    if (!view) return;
    view.group.removeFromParent();
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
      if (tower.def.id === 'frost') {
        view.weapon.rotation.y = time * 0.9;
        view.weapon.position.y = stackHeight(tower.def, tower.level) + 0.37 + Math.sin(time * 2 + tower.id) * 0.04;
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

  clear() {
    for (const view of this.views) view.group.removeFromParent();
    this.views.clear();
  }
}
