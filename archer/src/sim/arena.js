// The arena of one room: a grid of 1×1 cells centred on the origin, x to the right,
// z toward the player (the door is at the top, negative z). Pure: no Three.js.

import { CONFIG } from '../config.js';

export const CELL = { FLOOR: 0, BLOCK: 1, PIT: 2 };

export class Arena {
  constructor(layout) {
    this.width = CONFIG.arena.width;
    this.height = CONFIG.arena.height;
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;
    this.cells = new Uint8Array(this.width * this.height);
    layout.forEach((row, r) => {
      for (let c = 0; c < this.width; c++) {
        const ch = row[c];
        this.cells[r * this.width + c] = ch === '#' ? CELL.BLOCK : ch === '~' ? CELL.PIT : CELL.FLOOR;
      }
    });
    this.flow = new Float32Array(this.cells.length);
    // A cell can be queued again when a shorter (diagonal) path reaches it: room for that.
    this.queue = new Int32Array(this.cells.length * 9);
  }

  /** Cell under a world point (null outside). */
  cellAt(x, z) {
    const c = Math.floor(x + this.halfW);
    const r = Math.floor(z + this.halfH);
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return -1;
    return r * this.width + c;
  }

  centerOf(index) {
    const c = index % this.width;
    const r = Math.floor(index / this.width);
    return { x: c - this.halfW + 0.5, z: r - this.halfH + 0.5 };
  }

  /** Blocks walking: out of bounds, blocks and pits. */
  solid(c, r) {
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return true;
    return this.cells[r * this.width + c] !== CELL.FLOOR;
  }

  /** Stops arrows: out of bounds and blocks (they fly over pits). */
  wall(x, z) {
    const c = Math.floor(x + this.halfW);
    const r = Math.floor(z + this.halfH);
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return true;
    return this.cells[r * this.width + c] === CELL.BLOCK;
  }

  /**
   * Moves a circle by (dx, dz) and slides along what it hits (each axis on its own).
   * `flying` things ignore blocks and pits but stay inside the arena.
   */
  move(body, dx, dz, flying = false) {
    const r = body.radius;
    const limitX = this.halfW - r;
    const limitZ = this.halfH - r;
    let x = Math.max(-limitX, Math.min(limitX, body.x + dx));
    if (!flying && this.overlaps(x, body.z, r)) x = body.x;
    let z = Math.max(-limitZ, Math.min(limitZ, body.z + dz));
    if (!flying && this.overlaps(x, z, r)) z = body.z;
    const moved = x !== body.x + dx || z !== body.z + dz;
    body.x = x;
    body.z = z;
    return moved;
  }

  overlaps(x, z, r) {
    const c0 = Math.floor(x - r + this.halfW);
    const c1 = Math.floor(x + r + this.halfW);
    const r0 = Math.floor(z - r + this.halfH);
    const r1 = Math.floor(z + r + this.halfH);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!this.solid(col, row)) continue;
        // Circle vs the cell's square.
        const cx = Math.max(col - this.halfW, Math.min(x, col + 1 - this.halfW));
        const cz = Math.max(row - this.halfH, Math.min(z, row + 1 - this.halfH));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /** Clear straight line for an arrow (blocks only), sampled every quarter tile. */
  lineOfSight(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d * 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.wall(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  /** Walking distance from every cell to the target cell (BFS, 8 directions without corner cutting). */
  computeFlow(targetX, targetZ) {
    const flow = this.flow;
    flow.fill(1e9);
    const start = this.cellAt(targetX, targetZ);
    if (start < 0) return;
    const w = this.width;
    let head = 0;
    let tail = 0;
    flow[start] = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const index = this.queue[head++];
      const c = index % w;
      const r = (index - c) / w;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (this.solid(nc, nr)) continue;
          if (dc && dr && (this.solid(c + dc, r) || this.solid(c, r + dr))) continue;
          const next = nr * w + nc;
          const cost = flow[index] + (dc && dr ? 1.414 : 1);
          if (cost < flow[next] && tail < this.queue.length) {
            flow[next] = cost;
            this.queue[tail++] = next;
          }
        }
      }
    }
  }

  /** Direction to walk from (x, z) along the flow field (toward the target), or null. */
  flowDirection(x, z) {
    const index = this.cellAt(x, z);
    if (index < 0) return null;
    const w = this.width;
    const c = index % w;
    const r = (index - c) / w;
    let best = this.flow[index];
    let bx = 0;
    let bz = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (this.solid(nc, nr)) continue;
        if (dc && dr && (this.solid(c + dc, r) || this.solid(c, r + dr))) continue;
        const v = this.flow[nr * w + nc];
        if (v < best) {
          best = v;
          bx = nc - this.halfW + 0.5 - x;
          bz = nr - this.halfH + 0.5 - z;
        }
      }
    }
    const len = Math.hypot(bx, bz);
    return len > 0 ? { x: bx / len, z: bz / len } : null;
  }

  /** Free floor cells (spawn points), optionally in a row range. */
  freeCells(rowMin = 0, rowMax = this.height - 1) {
    const out = [];
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = 0; c < this.width; c++) if (!this.solid(c, r)) out.push(r * this.width + c);
    }
    return out;
  }
}
