import * as THREE from 'three';
import { PHASE } from '../sim/realm.js';

const MINIMAP_EVERY = 0.2;
const ARROW_SECTORS = 16;
const RECENTER_DISTANCE = 7;
const COLORS = {
  grass: '#5b9a3e',
  dirt: '#8d7350',
  tree: '#2c5f27',
  rock: '#a3a1b0',
  crystal: '#c886ff',
  palisade: '#9a6632',
  stone: '#e3dccd',
  building: '#f0b865',
  tower: '#79c2ff',
  site: '#ffc93c',
  castle: '#ffd65c',
  portal: '#8dff5a',
  enemy: '#ff4747',
  worker: '#ffffff',
};

/**
 * Kingdom HUD helpers drawn every few frames: the minimap (tap to travel), the
 * "back to the castle" button and arrows toward UFOs outside the screen.
 */
export class RealmHud {
  constructor(realm) {
    this.realm = realm;
    this.canvas = realm.ui.minimap;
    this.ctx = this.canvas.getContext('2d');
    this.timer = 0;
    this.corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.tmp = new THREE.Vector3();
    this.recenterShown = null;
    realm.ui.on('minimap', (u, v) => this.travel(u, v));
    realm.ui.on('btn-recenter', () => this.recenter());
  }

  get game() {
    return this.realm.game;
  }

  get sim() {
    return this.realm.sim;
  }

  travel(u, v) {
    const sim = this.sim;
    if (!sim || this.game.mode !== 'playing') return;
    const size = sim.level.width;
    this.game.rig.goal.set(u * size - size / 2, 0, v * size - size / 2);
    this.game.rig.clampGoal();
    this.game.audio.click();
    this.game.haptics.pulse(6);
    this.timer = 0;
  }

  recenter() {
    const base = this.sim?.level.base;
    if (!base) return;
    const rig = this.game.rig;
    rig.goal.set(base.x, 0, base.z);
    rig.targetZoom = Math.max(rig.targetZoom, 0.42);
    rig.clampGoal();
    this.game.audio.click();
  }

  update(dt) {
    const sim = this.sim;
    if (!sim) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = MINIMAP_EVERY;
      this.drawMinimap();
    }
    const base = sim.level.base;
    const target = this.game.rig.target;
    const far = Math.hypot(target.x - base.x, target.z - base.z) > RECENTER_DISTANCE;
    if (far !== this.recenterShown) {
      this.recenterShown = far;
      this.realm.ui.$('btn-recenter').hidden = !far;
    }
    this.updateArrows();
  }

  drawMinimap() {
    const sim = this.sim;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const size = sim.level.width;
    const k = w / size;
    const half = size / 2;
    const px = (x) => (x + half) * k;
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, w, w);
    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(px(x) - r, px(z) - r, r * 2, r * 2);
    };
    for (const cell of sim.level.cells) {
      const node = cell.node;
      if (node && node.amount > 0) dot(cell.x, cell.z, k * 0.42, COLORS[node.type] ?? COLORS.tree);
    }
    for (const b of sim.buildings) {
      const color = b.def.id === 'wall' ? (b.level > 0 ? COLORS.stone : COLORS.palisade) : COLORS.building;
      dot(b.x, b.z, k * (b.def.id === 'wall' ? 0.5 : 0.45), color);
    }
    for (const t of sim.towers) dot(t.x, t.z, k * 0.45, COLORS.tower);
    for (const s of sim.sites) if (!s.target) dot(s.x, s.z, k * 0.35, COLORS.site);
    const time = performance.now() / 1000;
    const open = sim.activePortals().length;
    sim.level.portals.forEach((portal, i) => {
      ctx.beginPath();
      ctx.arc(px(portal.x), px(portal.z), k * (i < open ? 0.8 + Math.sin(time * 5) * 0.15 : 0.55), 0, Math.PI * 2);
      ctx.fillStyle = i < open ? COLORS.portal : 'rgba(0,0,0,0.35)';
      ctx.fill();
    });
    const base = sim.level.base;
    ctx.fillStyle = COLORS.castle;
    ctx.strokeStyle = '#6b4a10';
    ctx.lineWidth = 2;
    ctx.fillRect(px(base.x) - k * 1.4, px(base.z) - k * 1.4, k * 2.8, k * 2.8);
    ctx.strokeRect(px(base.x) - k * 1.4, px(base.z) - k * 1.4, k * 2.8, k * 2.8);
    for (const worker of sim.workers) if (worker.state !== 'hidden') dot(worker.x, worker.z, 1.6, COLORS.worker);
    if (sim.phase === PHASE.NIGHT) {
      for (const enemy of sim.enemies) {
        if (!enemy.active) continue;
        ctx.beginPath();
        ctx.arc(px(enemy.x), px(enemy.z), enemy.def.id === 'boss' ? 4.5 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.enemy;
        ctx.fill();
      }
    }
    // What the camera sees.
    const rect = this.game.view.canvas.getBoundingClientRect();
    const rig = this.game.rig;
    const points = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]];
    const ground = [];
    for (const [x, y] of points) {
      const hit = rig.groundAt(x, y, rect);
      if (!hit) return;
      ground.push([px(hit.x), px(hit.z)]);
    }
    ctx.beginPath();
    ground.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** At night, arrows on the screen edge toward UFOs out of view (one per direction, with a count). */
  updateArrows() {
    const sim = this.sim;
    const ui = this.realm.ui;
    if (sim.phase !== PHASE.NIGHT || this.game.mode !== 'playing') {
      if (this.arrowsShown) ui.setArrows([]);
      this.arrowsShown = false;
      return;
    }
    const rect = this.game.view.canvas.getBoundingClientRect();
    const camera = this.game.view.camera;
    const top = rect.top + 225;
    const bottom = rect.bottom - 200;
    const left = rect.left + 24;
    const right = rect.right - 24;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const sectors = new Map();
    for (const enemy of sim.enemies) {
      if (!enemy.active) continue;
      const p = this.tmp.set(enemy.x, 0.6, enemy.z).project(camera);
      const behind = p.z > 1;
      let sx = rect.left + ((p.x + 1) / 2) * rect.width;
      let sy = rect.top + ((1 - p.y) / 2) * rect.height;
      if (behind) {
        sx = 2 * cx - sx;
        sy = 2 * cy - sy;
      }
      // The HUD covers the top of the screen and the dock the bottom: UFOs under them count as hidden.
      if (!behind && sx > rect.left && sx < rect.right && sy > rect.top + 200 && sy < rect.bottom - 190) continue;
      const angle = Math.atan2(sy - cy, sx - cx);
      const sector = Math.round((angle / (Math.PI * 2)) * ARROW_SECTORS);
      const entry = sectors.get(sector) ?? { angle: 0, count: 0 };
      entry.angle += angle;
      entry.count++;
      sectors.set(sector, entry);
    }
    const list = [];
    for (const entry of sectors.values()) {
      const angle = entry.angle / entry.count;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // Where the ray from the centre leaves the inner rectangle.
      const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
      const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
      const t = Math.min(tx, ty);
      list.push({ x: cx + dx * t, y: cy + dy * t, angle, count: entry.count });
    }
    ui.setArrows(list);
    this.arrowsShown = list.length > 0;
  }
}
