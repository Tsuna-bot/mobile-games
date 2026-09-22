import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, easeOutCubic, randInt, randRange, smoothstep } from '../core/math.js';
import { PATTERN, lateralReach, pickPattern, singleGapChance, spacingAt, speedAt } from './difficulty.js';

const MAX_ROWS = 18;
const MAX_SHARDS = 56;
const { cellCount, cellWidth } = CONFIG.road;
const CELL_X = Array.from({ length: cellCount }, (_, i) => (i - (cellCount - 1) / 2) * cellWidth);
const BLOCK_HALF_WIDTH = CONFIG.blocks.width / 2;
const BLOCK_HALF_DEPTH = CONFIG.blocks.depth / 2;

function createRow() {
  return {
    active: false,
    crossed: false,
    pos: 0,
    type: PATTERN.WALL,
    count: 0,
    x: new Float32Array(cellCount),
    amp: new Float32Array(cellCount),
    freq: new Float32Array(cellCount),
    phase: new Float32Array(cellCount),
  };
}

function createShard() {
  return { active: false, resolved: false, pos: 0, x: 0, phase: 0 };
}

/** Block material: dark glossy body with neon edges tinted by the instance color. */
function createBlockMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0x0d0820, roughness: 0.28, metalness: 0.55 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeGlow = { value: CONFIG.blocks.edgeGlow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEdgeUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeUv;\nuniform float uEdgeGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec2 edgeDist = min(vEdgeUv, 1.0 - vEdgeUv);
        float edge = 1.0 - smoothstep(0.015, 0.06, min(edgeDist.x, edgeDist.y));
        totalEmissiveRadiance += vColor.rgb * (edge * uEdgeGlow + 0.1);`,
      );
  };
  return material;
}

/**
 * Procedural obstacle course. Rows and shards are pooled; the whole course is
 * drawn with two InstancedMesh draw calls. Positions are stored as distances
 * along the track ("pos"); on screen, z = travelledDistance - pos.
 */
export class Track {
  constructor(scene) {
    this.rows = Array.from({ length: MAX_ROWS }, createRow);
    this.shards = Array.from({ length: MAX_SHARDS }, createShard);
    this.events = { onNearMiss: null, onShard: null, onShardMissed: null };

    this.nextRowPos = 0;
    this.lastRowPos = 0;
    this.safeX = 0;
    this.rowsUntilBreather = CONFIG.track.breatherEvery;

    this.dummy = new THREE.Object3D();
    this.typeColors = [
      new THREE.Color(CONFIG.colors.wall),
      new THREE.Color(CONFIG.colors.pillar),
      new THREE.Color(CONFIG.colors.slider),
    ];

    const { width, height, depth } = CONFIG.blocks;
    this.blockGeometry = new THREE.BoxGeometry(width, height, depth);
    this.blockMaterial = createBlockMaterial();
    this.blockMesh = new THREE.InstancedMesh(this.blockGeometry, this.blockMaterial, MAX_ROWS * cellCount);
    this.blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.blockMesh.count; i++) this.blockMesh.setColorAt(i, this.typeColors[0]);
    this.blockMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.blockMesh.castShadow = true;
    this.blockMesh.frustumCulled = false;
    this.blockMesh.count = 0;

    this.shardGeometry = new THREE.OctahedronGeometry(0.4, 0);
    this.shardMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.shard,
      emissive: CONFIG.colors.shard,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.1,
      flatShading: true,
    });
    this.shardMesh = new THREE.InstancedMesh(this.shardGeometry, this.shardMaterial, MAX_SHARDS);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.count = 0;

    scene.add(this.blockMesh, this.shardMesh);
  }

  clear() {
    for (const row of this.rows) row.active = false;
    for (const shard of this.shards) shard.active = false;
    this.blockMesh.count = 0;
    this.shardMesh.count = 0;
  }

  begin(distance) {
    this.clear();
    this.nextRowPos = distance + CONFIG.track.firstRowAhead;
    this.lastRowPos = distance;
    this.safeX = 0;
    this.rowsUntilBreather = CONFIG.track.breatherEvery;
  }

  update(distance, progress) {
    const behind = CONFIG.track.despawnBehind;
    for (const row of this.rows) {
      if (row.active && distance - row.pos > behind) row.active = false;
    }
    for (const shard of this.shards) {
      if (shard.active && distance - shard.pos > behind) shard.active = false;
    }
    while (this.nextRowPos - distance < CONFIG.track.spawnAhead) this.spawnNext(progress);
  }

  blockX(row, index, time) {
    return row.x[index] + row.amp[index] * Math.sin(row.freq[index] * time + row.phase[index]);
  }

  /** Circle (player) vs boxes (blocks) in the ground plane. */
  hitTest(distance, time, playerX) {
    const radius = CONFIG.player.radius * CONFIG.player.hitboxScale;
    const radiusSq = radius * radius;
    for (const row of this.rows) {
      if (!row.active) continue;
      const dz = Math.max(Math.abs(distance - row.pos) - BLOCK_HALF_DEPTH, 0);
      if (dz >= radius) continue;
      for (let i = 0; i < row.count; i++) {
        const dx = Math.max(Math.abs(playerX - this.blockX(row, i, time)) - BLOCK_HALF_WIDTH, 0);
        if (dx * dx + dz * dz < radiusSq) return true;
      }
    }
    return false;
  }

  /** Flags rows the player just passed and reports near misses. */
  processCrossings(distance, time, playerX) {
    const radius = CONFIG.player.radius;
    for (const row of this.rows) {
      if (!row.active || row.crossed || row.pos > distance) continue;
      row.crossed = true;
      let closestGap = Infinity;
      let closestX = 0;
      for (let i = 0; i < row.count; i++) {
        const bx = this.blockX(row, i, time);
        const gap = Math.abs(bx - playerX) - BLOCK_HALF_WIDTH - radius;
        if (gap < closestGap) {
          closestGap = gap;
          closestX = bx;
        }
      }
      if (closestGap > -0.2 && closestGap < CONFIG.nearMiss.threshold) {
        this.events.onNearMiss?.(closestX, row.type);
      }
    }
  }

  collectShards(distance, playerX) {
    const pickup = CONFIG.shards.pickupRadius;
    const pickupSq = pickup * pickup;
    for (const shard of this.shards) {
      if (!shard.active || shard.resolved) continue;
      const dz = distance - shard.pos;
      const dx = playerX - shard.x;
      if (dx * dx + dz * dz < pickupSq) {
        shard.resolved = true;
        this.events.onShard?.(shard.x);
      } else if (dz > pickup) {
        shard.resolved = true;
        this.events.onShardMissed?.();
      }
    }
  }

  /** Writes instance transforms for the interpolated distance/time. */
  sync(distance, time) {
    const { riseStart, riseEnd } = CONFIG.track;
    const height = CONFIG.blocks.height;
    const dummy = this.dummy;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);

    let n = 0;
    for (const row of this.rows) {
      if (!row.active) continue;
      const rise = easeOutCubic(1 - smoothstep(riseEnd, riseStart, row.pos - distance));
      const y = height / 2 - (1 - rise) * (height + 0.05);
      const color = this.typeColors[row.type];
      for (let i = 0; i < row.count; i++) {
        dummy.position.set(this.blockX(row, i, time), y, distance - row.pos);
        dummy.updateMatrix();
        this.blockMesh.setMatrixAt(n, dummy.matrix);
        this.blockMesh.setColorAt(n, color);
        n++;
      }
    }
    this.blockMesh.count = n;
    this.blockMesh.instanceMatrix.needsUpdate = true;
    this.blockMesh.instanceColor.needsUpdate = true;

    let s = 0;
    for (const shard of this.shards) {
      if (!shard.active || shard.resolved) continue;
      const rise = 1 - smoothstep(riseEnd, riseStart, shard.pos - distance);
      dummy.position.set(shard.x, CONFIG.shards.hoverHeight + Math.sin(time * 3 + shard.phase) * 0.15, distance - shard.pos);
      dummy.rotation.set(0, time * 2.4 + shard.phase, 0);
      dummy.scale.setScalar(rise);
      dummy.updateMatrix();
      this.shardMesh.setMatrixAt(s++, dummy.matrix);
    }
    this.shardMesh.count = s;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  spawnNext(progress) {
    if (--this.rowsUntilBreather <= 0) {
      this.spawnBreather();
      return;
    }

    const spacing = spacingAt(progress) * randRange(1 - CONFIG.track.spacingJitter, 1 + CONFIG.track.spacingJitter);
    const row = this.acquire(this.rows);
    if (!row) {
      this.nextRowPos += spacing;
      return;
    }

    const reach = lateralReach(spacing, speedAt(progress));
    const previousSafeX = this.safeX;
    row.active = true;
    row.crossed = false;
    row.pos = this.nextRowPos;
    row.type = pickPattern(progress);
    row.count = 0;

    if (row.type === PATTERN.WALL) this.buildWall(row, progress, reach);
    else if (row.type === PATTERN.PILLARS) this.buildPillars(row, progress, reach);
    else this.buildSliders(row, progress, reach);

    if (Math.random() < CONFIG.shards.segmentChance) {
      const count = CONFIG.shards.perSegment;
      for (let k = 1; k <= count; k++) {
        const t = k / (count + 1);
        this.spawnShard(this.lastRowPos + (row.pos - this.lastRowPos) * t, previousSafeX + (this.safeX - previousSafeX) * t);
      }
    }

    this.lastRowPos = row.pos;
    this.nextRowPos = row.pos + spacing;
  }

  spawnBreather() {
    const { breatherEvery, breatherLength, breatherShards } = CONFIG.track;
    this.rowsUntilBreather = breatherEvery;
    const start = this.nextRowPos;
    const fromX = this.safeX;
    const toX = CELL_X[randInt(1, cellCount - 2)];
    for (let k = 0; k < breatherShards; k++) {
      const t = k / (breatherShards - 1);
      const eased = t * t * (3 - 2 * t);
      this.spawnShard(start + t * breatherLength * 0.8, fromX + (toX - fromX) * eased);
    }
    this.safeX = toX;
    this.lastRowPos = start + breatherLength * 0.8;
    this.nextRowPos = start + breatherLength;
  }

  buildWall(row, progress, reach) {
    const safeCell = this.pickReachableCell(reach);
    const extraGap = Math.random() < singleGapChance(progress) ? -1 : this.pickOtherCell(safeCell);
    for (let i = 0; i < cellCount; i++) {
      if (i !== safeCell && i !== extraGap) this.addBlock(row, CELL_X[i], 0, 0, 0);
    }
    this.safeX = CELL_X[safeCell];
  }

  buildPillars(row, progress, reach) {
    const safeCell = this.pickReachableCell(reach);
    const target = progress > 0.5 ? 3 : 2;
    let placed = 0;
    // Visit the other cells in a random order and fill `target` of them.
    const offset = randInt(0, cellCount - 1);
    for (let k = 0; k < cellCount && placed < target; k++) {
      const i = (k + offset) % cellCount;
      if (i === safeCell || Math.random() < 0.25) continue;
      this.addBlock(row, CELL_X[i], 0, 0, 0);
      placed++;
    }
    if (placed === 0) this.addBlock(row, CELL_X[this.pickOtherCell(safeCell)], 0, 0, 0);
    this.safeX = CELL_X[safeCell];
  }

  buildSliders(row, progress, reach) {
    const freq = randRange(1.3, 1.9) + progress * 0.4;
    const phase = randRange(0, Math.PI * 2);
    if (progress > 0.6 && Math.abs(this.safeX) <= reach) {
      // Two mirrored blocks: a pair of doors opening and closing.
      this.addBlock(row, -2.25, 1.2, freq, phase);
      this.addBlock(row, 2.25, 1.2, freq, phase + Math.PI);
    } else {
      const amp = randRange(1.3, 2.3);
      const base = clamp(randRange(-2.2, 2.2), -CONFIG.road.halfWidth + BLOCK_HALF_WIDTH + amp, CONFIG.road.halfWidth - BLOCK_HALF_WIDTH - amp);
      this.addBlock(row, base, amp, freq, phase);
    }
  }

  addBlock(row, x, amp, freq, phase) {
    const i = row.count++;
    row.x[i] = x;
    row.amp[i] = amp;
    row.freq[i] = freq;
    row.phase[i] = phase;
  }

  pickReachableCell(reach) {
    let chosen = -1;
    let seen = 0;
    let nearest = 0;
    for (let i = 0; i < cellCount; i++) {
      const dist = Math.abs(CELL_X[i] - this.safeX);
      if (dist < Math.abs(CELL_X[nearest] - this.safeX)) nearest = i;
      // Reservoir sampling: uniform pick among reachable cells without allocating.
      if (dist <= reach && Math.random() * ++seen < 1) chosen = i;
    }
    return chosen === -1 ? nearest : chosen;
  }

  pickOtherCell(excluded) {
    const i = randInt(0, cellCount - 2);
    return i >= excluded ? i + 1 : i;
  }

  spawnShard(pos, x) {
    const shard = this.acquire(this.shards);
    if (!shard) return;
    shard.active = true;
    shard.resolved = false;
    shard.pos = pos;
    shard.x = x;
    shard.phase = Math.random() * Math.PI * 2;
  }

  acquire(pool) {
    for (const item of pool) if (!item.active) return item;
    return null;
  }

  dispose() {
    this.blockMesh.removeFromParent();
    this.shardMesh.removeFromParent();
    this.blockMesh.dispose();
    this.shardMesh.dispose();
    this.blockGeometry.dispose();
    this.blockMaterial.dispose();
    this.shardGeometry.dispose();
    this.shardMaterial.dispose();
  }
}

export { CELL_X };
