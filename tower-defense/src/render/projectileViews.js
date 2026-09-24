import * as THREE from 'three';

const MODELS = {
  arrow: 'weapon-ammo-arrow',
  cannonball: 'weapon-ammo-cannonball',
  bullet: 'weapon-ammo-bullet',
  boulder: 'weapon-ammo-boulder',
  shell: 'weapon-ammo-cannonball',
  poison: 'weapon-ammo-cannonball',
};

const SCALE = { arrow: 0.7, cannonball: 0.8, bullet: 0.55, boulder: 1.1, shell: 1.25, poison: 0.7 };
// Trail particles emitted per second of flight.
const TRAIL_RATE = { arrow: 40, cannonball: 45, bullet: 30, boulder: 40, shell: 45, poison: 35 };
const SPINNING = new Set(['boulder', 'cannonball', 'shell', 'poison']);

/** Pooled projectile meshes following the simulated projectiles. */
export class ProjectileViews {
  constructor(scene, assets, effects) {
    this.scene = scene;
    this.assets = assets;
    this.effects = effects;
    this.pools = new Map();
    this.active = new Set();
    this.lookTarget = new THREE.Vector3();
  }

  acquire(projectile) {
    const kind = projectile.kind;
    let pool = this.pools.get(kind);
    if (!pool) this.pools.set(kind, (pool = []));
    let view = pool.pop();
    if (!view) {
      view = { kind, object: this.assets.clone(MODELS[kind]), projectile: null, trail: 0 };
      view.object.scale.setScalar(SCALE[kind]);
      view.object.traverse((o) => {
        o.castShadow = SPINNING.has(kind);
        if (o.isMesh && kind === 'poison') o.material = this.poisonMaterial();
      });
    }
    view.projectile = projectile;
    view.trail = 0;
    view.object.position.set(projectile.x, projectile.y, projectile.z);
    this.scene.add(view.object);
    projectile.view = view;
    this.active.add(view);
  }

  /** Glowing green vial material for the acid tower. */
  poisonMaterial() {
    if (!this.acid) {
      this.acid = this.assets.material.clone();
      this.acid.color.set(0x8dff4a);
      this.acid.emissive.set(0x3fbf1a);
      this.acid.emissiveIntensity = 0.8;
    }
    return this.acid;
  }

  release(projectile) {
    const view = projectile.view;
    if (!view) return;
    projectile.view = null;
    view.projectile = null;
    view.object.removeFromParent();
    this.active.delete(view);
    this.pools.get(view.kind).push(view);
  }

  update(dt) {
    for (const view of this.active) {
      const p = view.projectile;
      view.object.position.set(p.x, p.y, p.z);
      view.trail += dt * TRAIL_RATE[p.kind] * this.effects.scale;
      while (view.trail >= 1) {
        view.trail -= 1;
        this.effects.trail(p.kind, p.x, p.y, p.z);
      }
      if (SPINNING.has(p.kind)) {
        view.object.rotation.x += dt * 9;
        view.object.rotation.y += dt * 5;
      } else if (p.vx || p.vy || p.vz) {
        this.lookTarget.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        view.object.lookAt(this.lookTarget);
      }
    }
  }

  clear() {
    for (const view of [...this.active]) this.release(view.projectile);
  }
}
