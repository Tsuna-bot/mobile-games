import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, wobble } from '../core/math.js';

/** Chase camera that frames the road on any aspect ratio, with trauma-based shake. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.distance = CONFIG.camera.minDistance;
    this.trauma = 0;
    this.time = 0;
    this.x = 0;
    this.fov = CONFIG.camera.fov;
    this.lookTarget = new THREE.Vector3();
    const elevation = THREE.MathUtils.degToRad(CONFIG.camera.elevationDeg);
    this.elevationSin = Math.sin(elevation);
    this.elevationCos = Math.cos(elevation);
  }

  /** Pulls the camera back on narrow (portrait) screens so the whole road stays visible. */
  fit(aspect) {
    const { fov, visibleHalfWidth, minDistance, maxDistance } = CONFIG.camera;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    this.distance = clamp(visibleHalfWidth / (halfTan * aspect), minDistance, maxDistance);
  }

  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset() {
    this.trauma = 0;
  }

  update(dt, playerX, speedFactor, tilt) {
    const { followFactor, lookAhead, speedFovBoost } = CONFIG.camera;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const shake = this.trauma * this.trauma;
    const t = this.time * 28;

    this.x = damp(this.x, playerX * followFactor, 6, dt);
    const camera = this.camera;
    camera.position.set(
      this.x + shake * 0.55 * wobble(t),
      this.distance * this.elevationSin + 0.6 + shake * 0.4 * wobble(t + 17.3),
      this.distance * this.elevationCos,
    );
    this.lookTarget.set(this.x * 1.2, 0.4, -lookAhead);
    camera.lookAt(this.lookTarget);
    camera.rotateZ(-tilt * 0.1 + shake * 0.06 * wobble(t + 41.7));

    const targetFov = CONFIG.camera.fov + speedFactor * speedFovBoost;
    this.fov = damp(this.fov, targetFov, 3, dt);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
      return true;
    }
    return false;
  }
}
