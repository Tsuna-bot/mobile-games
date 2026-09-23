// Parses an ASCII map into a grid, an ordered path and a smooth enemy route.

const DIRS = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
};
// A +90° rotation around Y (seen from above) turns each side into the next one.
const ROTATE = { E: 'N', N: 'W', W: 'S', S: 'E' };

const DECORATION = { T: 'tree', R: 'rock', C: 'crystal', H: 'hill' };

// Kenney tile sides at rotation 0 (x = east, z = south).
const TILE_BASE = {
  straight: ['N', 'S'],
  corner: ['E', 'S'],
  end: ['S'],
};

function rotationFor(kind, sides) {
  let current = TILE_BASE[kind];
  const target = [...sides].sort().join();
  for (let k = 0; k < 4; k++) {
    if ([...current].sort().join() === target) return k * (Math.PI / 2);
    current = current.map((side) => ROTATE[side]);
  }
  throw new Error(`No rotation for ${kind} ${target}`);
}

export class Level {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    this.height = def.map.length;
    this.width = def.map[0].length;
    this.cells = [];
    this.spawn = null;
    this.base = null;

    for (let row = 0; row < this.height; row++) {
      if (def.map[row].length !== this.width) throw new Error(`Map "${def.id}": row ${row} has the wrong width`);
      for (let col = 0; col < this.width; col++) {
        const char = def.map[row][col];
        const isPath = char === '#' || char === 'S' || char === 'B';
        const cell = {
          index: row * this.width + col,
          col,
          row,
          char,
          isPath,
          decoration: DECORATION[char] ?? null,
          buildable: char === '.',
          ...this.cellCenter(col, row),
        };
        this.cells.push(cell);
        if (char === 'S') this.spawn = cell;
        if (char === 'B') this.base = cell;
      }
    }
    if (!this.spawn || !this.base) throw new Error(`Map "${def.id}" needs one S and one B`);

    this.path = this.tracePath();
    this.pathTiles = this.path.map((cell, i) => this.describePathTile(cell, i));
    this.buildRoute();
  }

  cellCenter(col, row) {
    return { x: col - (this.width - 1) / 2, z: row - (this.height - 1) / 2 };
  }

  cellAt(col, row) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return null;
    return this.cells[row * this.width + col];
  }

  /** Cell under a world position, or null outside the map. */
  cellAtWorld(x, z) {
    return this.cellAt(Math.round(x + (this.width - 1) / 2), Math.round(z + (this.height - 1) / 2));
  }

  pathNeighbors(cell) {
    const result = [];
    for (const [side, d] of Object.entries(DIRS)) {
      const next = this.cellAt(cell.col + d.dc, cell.row + d.dr);
      if (next?.isPath) result.push({ side, cell: next });
    }
    return result;
  }

  /** Walks from S to B; the map must describe a single corridor without branches. */
  tracePath() {
    const path = [this.spawn];
    let previous = null;
    let current = this.spawn;
    while (current !== this.base) {
      const next = this.pathNeighbors(current).filter((n) => n.cell !== previous);
      if (next.length !== 1) throw new Error(`Map "${this.def.id}": path branches or breaks at ${current.col},${current.row}`);
      previous = current;
      current = next[0].cell;
      path.push(current);
    }
    const pathCount = this.cells.filter((c) => c.isPath).length;
    if (pathCount !== path.length) throw new Error(`Map "${this.def.id}": disconnected path cells`);
    return path;
  }

  describePathTile(cell, i) {
    const sides = [];
    const prev = this.path[i - 1];
    const next = this.path[i + 1];
    for (const neighbor of [prev, next]) {
      if (!neighbor) continue;
      const side = Object.keys(DIRS).find((key) => DIRS[key].dc === neighbor.col - cell.col && DIRS[key].dr === neighbor.row - cell.row);
      sides.push(side);
    }
    let kind;
    if (sides.length === 1) kind = 'end';
    else if (DIRS[sides[0]].dc === -DIRS[sides[1]].dc && DIRS[sides[0]].dr === -DIRS[sides[1]].dr) kind = 'straight';
    else kind = 'corner';
    return { cell, kind, sides, rotation: rotationFor(kind, sides) };
  }

  /** Polyline through tile centers, with quarter-circle arcs matching the rounded corner tiles. */
  buildRoute() {
    const xs = [];
    const zs = [];
    for (const tile of this.pathTiles) {
      const { cell } = tile;
      if (tile.kind !== 'corner') {
        xs.push(cell.x);
        zs.push(cell.z);
        continue;
      }
      const [inSide, outSide] = tile.sides;
      const a = DIRS[inSide];
      const b = DIRS[outSide];
      const cx = cell.x + 0.5 * (a.dc + b.dc);
      const cz = cell.z + 0.5 * (a.dr + b.dr);
      const start = Math.atan2(cell.z + 0.5 * a.dr - cz, cell.x + 0.5 * a.dc - cx);
      const end = Math.atan2(cell.z + 0.5 * b.dr - cz, cell.x + 0.5 * b.dc - cx);
      let delta = end - start;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const angle = start + (delta * s) / steps;
        xs.push(cx + Math.cos(angle) * 0.5);
        zs.push(cz + Math.sin(angle) * 0.5);
      }
    }
    this.routeX = Float32Array.from(xs);
    this.routeZ = Float32Array.from(zs);
    this.routeDist = new Float32Array(xs.length);
    for (let i = 1; i < xs.length; i++) {
      this.routeDist[i] = this.routeDist[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    this.routeLength = this.routeDist[xs.length - 1];
  }

  /** Writes x, z and heading (unit dirX, dirZ) at a distance along the route into `out`. */
  sampleRoute(distance, out) {
    const d = Math.min(Math.max(distance, 0), this.routeLength);
    let lo = 0;
    let hi = this.routeDist.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.routeDist[mid] <= d) lo = mid;
      else hi = mid;
    }
    const segment = this.routeDist[hi] - this.routeDist[lo] || 1;
    const t = (d - this.routeDist[lo]) / segment;
    const dx = this.routeX[hi] - this.routeX[lo];
    const dz = this.routeZ[hi] - this.routeZ[lo];
    out.x = this.routeX[lo] + dx * t;
    out.z = this.routeZ[lo] + dz * t;
    const len = Math.hypot(dx, dz) || 1;
    out.dirX = dx / len;
    out.dirZ = dz / len;
    return out;
  }
}
