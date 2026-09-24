import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp, wobble } from '../core/math.js';

const corners = [];
for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3());

/**
 * Tilted perspective camera that always frames the whole map above/below the
 * HUD, whatever the screen shape. Supports pan and pinch zoom (zoom < 1 moves
 * closer), a slow orbit for the menu backdrop, and shake.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pitch = THREE.MathUtils.degToRad(CONFIG.camera.pitchDeg);
    this.fitDistance = 20;
    this.zoom = 1;
    this.targetZoom = 1;
    // Closest zoom (fraction of the fitted distance); the big Kingdom map allows closer.
    this.minZoom = CONFIG.camera.minZoom;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.bounds = { halfW: 3, halfH: 5 };
    this.orbitPhase = 0;
    this.orbitSpeed = 0;
    this.yaw = 0;
    this.trauma = 0;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.world.tileTop);
    this.hit = new THREE.Vector3();
    this.viewport = { width: 1, height: 1 };
    this.screenOffset = 0;
  }

  setBounds(width, height) {
    this.bounds.halfW = width / 2;
    this.bounds.halfH = height / 2;
  }

  /** Finds the camera distance at which the map fits between the HUD bars. */
  fit(viewportWidth, viewportHeight) {
    this.viewport.width = viewportWidth;
    this.viewport.height = viewportHeight;
    const { hudTop, hudBottom } = CONFIG.camera;
    const top = 1 - (2 * hudTop) / viewportHeight;
    const bottom = -1 + (2 * hudBottom) / viewportHeight;
    const side = 1 - 24 / viewportWidth;
    const { halfW, halfH } = this.bounds;

    this.screenOffset = (top + bottom) / 2;
    const camera = this.camera;
    let lo = 4;
    let hi = 80;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      this.place(camera, d, 0, this.lookOffset(d), 0);
      camera.updateMatrixWorld();
      let fits = true;
      let n = 0;
      for (const x of [-halfW, halfW]) {
        for (const z of [-halfH, halfH]) {
          for (const y of [0, 1.2]) {
            const p = corners[n++].set(x, y, z).project(camera);
            if (p.x < -side || p.x > side || p.y > top || p.y < bottom) fits = false;
          }
        }
      }
      if (fits) hi = d;
      else lo = d;
    }
    this.fitDistance = hi;
  }

  /** Ground shift of the look-at point that centers the map between the HUD bars. */
  lookOffset(distance) {
    return (this.screenOffset * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.sin(this.pitch);
  }

  place(camera, distance, tx, tz, yaw) {
    const horizontal = Math.cos(this.pitch) * distance;
    camera.position.set(tx + Math.sin(yaw) * horizontal, Math.sin(this.pitch) * distance, tz + Math.cos(yaw) * horizontal);
    camera.lookAt(tx, 0, tz);
  }

  pan(dxPixels, dyPixels) {
    const distance = this.fitDistance * this.zoom;
    const worldPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.viewport.height;
    this.goal.x -= dxPixels * worldPerPixel;
    this.goal.z -= (dyPixels * worldPerPixel) / Math.sin(this.pitch);
    this.clampGoal();
  }

  zoomBy(factor) {
    this.targetZoom = clamp(this.targetZoom / factor, this.minZoom, 1);
    this.clampGoal();
  }

  clampGoal() {
    const slack = 1 - this.targetZoom;
    this.goal.x = clamp(this.goal.x, -this.bounds.halfW * slack * 1.4, this.bounds.halfW * slack * 1.4);
    this.goal.z = clamp(this.goal.z, -this.bounds.halfH * slack * 1.2, this.bounds.halfH * slack * 1.2);
  }

  reset() {
    this.yaw = 0;
    this.orbitPhase = 0;
    this.zoom = this.targetZoom = 1;
    this.goal.set(0, 0, 0);
    this.target.set(0, 0, 0);
    this.trauma = 0;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  setOrbit(speed) {
    this.orbitSpeed = speed;
  }

  update(dt) {
    this.time += dt;
    this.zoom = damp(this.zoom, this.targetZoom, 10, dt);
    this.target.x = damp(this.target.x, this.goal.x, 10, dt);
    this.target.z = damp(this.target.z, this.goal.z, 10, dt);
    // Menu backdrop sways gently; in game the camera eases back to facing the map.
    if (this.orbitSpeed) {
      this.orbitPhase += dt * this.orbitSpeed;
      this.yaw = Math.sin(this.orbitPhase) * 0.35;
    } else {
      this.orbitPhase = 0;
      this.yaw = damp(this.yaw, 0, 4, dt);
    }
    const yaw = this.yaw;

    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shake = this.trauma * this.trauma * 0.35;
    const t = this.time * 30;
    const distance = this.fitDistance * this.zoom;
    this.place(this.camera, distance, this.target.x + shake * wobble(t), this.target.z + this.lookOffset(distance) + shake * wobble(t + 9), yaw);
  }

  /** Converts a screen point into the ground point under it (or null). */
  groundAt(clientX, clientY, rect) {
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, this.hit);
  }

  /** Projects a world point to CSS pixels (for floating labels). */
  toScreen(vector, rect) {
    vector.project(this.camera);
    return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height, visible: vector.z < 1 };
  }
}
