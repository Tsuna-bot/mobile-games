import * as THREE from 'three';

const MODELS = {
  arrow: 'weapon-ammo-arrow',
  cannonball: 'weapon-ammo-cannonball',
  bullet: 'weapon-ammo-bullet',
  boulder: 'weapon-ammo-boulder',
};

const SCALE = { arrow: 0.7, cannonball: 0.8, bullet: 0.55, boulder: 1.1 };

/** Pooled projectile meshes following the simulated projectiles. */
export class ProjectileViews {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
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
      view = { kind, object: this.assets.clone(MODELS[kind]), projectile: null };
      view.object.scale.setScalar(SCALE[kind]);
      view.object.traverse((o) => { o.castShadow = kind === 'boulder' || kind === 'cannonball'; });
    }
    view.projectile = projectile;
    view.object.position.set(projectile.x, projectile.y, projectile.z);
    this.scene.add(view.object);
    projectile.view = view;
    this.active.add(view);
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
      if (p.kind === 'boulder' || p.kind === 'cannonball') {
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
