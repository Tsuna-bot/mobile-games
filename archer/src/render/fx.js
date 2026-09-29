import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParticleSystem } from './particles.js';

export const COLORS = {
  spark: new THREE.Color(0xfff2b0),
  arrow: new THREE.Color(0xfff6d8),
  fire: new THREE.Color(0xff8a2a),
  ice: new THREE.Color(0x8fe0ff),
  poison: new THREE.Color(0x8dff4a),
  bolt: new THREE.Color(0xc9a0ff),
  blood: new THREE.Color(0xff3a4a),
  xp: new THREE.Color(0x5fe8ff),
  coin: new THREE.Color(0xffd23f),
  heart: new THREE.Color(0xff5a7a),
  dust: new THREE.Color(0xd8c8a8),
  smoke: new THREE.Color(0x8a8898),
  danger: new THREE.Color(0xff3a2a),
  heal: new THREE.Color(0x7dff9a),
  magic: new THREE.Color(0xd08cff),
  shadow: new THREE.Color(0xa070ff),
};

const SHOT_COLORS = { orb: 0xff3a6a, arrow: 0xf4ecd8, bone: 0xf4f0e0, rock: 0xa07a50 };
const SHOT_GLOW = { orb: 0xff4a8a, arrow: 0xffe0a0, bone: 0xfff0c0, rock: 0xffb060 };
const ORB_COLORS = { fire: 0xff8a2a, ice: 0x8fe0ff, bolt: 0xc9a0ff };
const Y = 0.55;
// Above 1: these glow through the bloom pass.
const HDR = { core: 2.2, halo: 1.5, orb: 2.4 };

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const hdrColor = new THREE.Color();

/**
 * Arrows, monster shots, pickups, danger circles, aim lines, orbiting orbs,
 * lightning and particles. Instanced meshes: a handful of draw calls in total.
 */
export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.scale = 1;
    this.time = 0;
    this.sparks = new ParticleSystem(scene, { capacity: 900, additive: true });
    this.puffs = new ParticleSystem(scene, { capacity: 400, additive: false, softness: 0.5 });

    // Arrows: shaft + head + fletching merged.
    const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5);
    shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.05, 0.14, 6);
    head.rotateX(Math.PI / 2);
    head.translate(0, 0, 0.3);
    const fletch = new THREE.BoxGeometry(0.1, 0.01, 0.1);
    fletch.translate(0, 0, -0.22);
    const arrowGeometry = mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed(), fletch.toNonIndexed()]);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.25), toneMapped: false }), 240);
    this.arrowMesh.frustumCulled = false;
    scene.add(this.arrowMesh);

    // Kunai: a dark steel blade with a ring pommel (the assassin's throws).
    const blade = new THREE.OctahedronGeometry(0.08, 0);
    blade.scale(0.7, 0.25, 2.6);
    blade.translate(0, 0, 0.12);
    const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 5);
    grip.rotateX(Math.PI / 2);
    grip.translate(0, 0, -0.08);
    const pommel = new THREE.TorusGeometry(0.035, 0.012, 5, 10);
    pommel.translate(0, 0, -0.19);
    const kunai = mergeGeometries([blade, grip.toNonIndexed(), pommel.toNonIndexed()]);
    this.kunaiMesh = new THREE.InstancedMesh(kunai, new THREE.MeshStandardMaterial({ color: 0x9aa4c0, metalness: 0.85, roughness: 0.25, emissive: 0x4a2a8a, emissiveIntensity: 0.6 }), 240);
    this.kunaiMesh.frustumCulled = false;
    scene.add(this.kunaiMesh);

    // Monster shots: a bright core and an additive halo.
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    this.shotCore = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ toneMapped: false }), 300);
    this.shotHalo = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 300);
    for (const m of [this.shotCore, this.shotHalo]) {
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
      scene.add(m);
    }

    // Pickups.
    const gem = new THREE.OctahedronGeometry(0.1, 0);
    this.xpMesh = new THREE.InstancedMesh(gem, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ff0ff).multiplyScalar(1.8), toneMapped: false }), 300);
    const coin = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14);
    coin.rotateX(Math.PI / 2);
    this.coinMesh = new THREE.InstancedMesh(coin, new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.6, roughness: 0.3, emissive: 0xb07800, emissiveIntensity: 1.4 }), 300);
    const heart = new THREE.SphereGeometry(0.14, 10, 8);
    this.heartMesh = new THREE.InstancedMesh(heart, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a6a).multiplyScalar(1.6), toneMapped: false }), 20);
    for (const m of [this.xpMesh, this.coinMesh, this.heartMesh]) {
      m.frustumCulled = false;
      scene.add(m);
    }

    // Staff orbs and pet shots (the hero's glowing projectiles).
    this.heroOrbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 120);
    this.heroOrbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
    this.heroOrbs.frustumCulled = false;
    scene.add(this.heroOrbs);

    // Orbiting orbs.
    this.orbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), 8);
    this.orbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.orbMesh.frustumCulled = false;
    scene.add(this.orbMesh);

    // Danger circles and aim lines (pooled meshes).
    this.hazardPool = [];
    this.hazardGeometry = { ring: new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2) };
    this.lines = [];
    this.lineGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.bolts = [];
    this.floorRings = [];
    this.ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
  }

  setViewport(height, fov) {
    this.sparks.setViewport(height, fov);
    this.puffs.setViewport(height, fov);
  }

  count(n) {
    return Math.max(1, Math.round(n * this.scale));
  }

  clear() {
    this.sparks.clear();
    this.puffs.clear();
    for (const h of this.hazardPool) h.active = false;
    for (const l of this.lines) l.active = false;
    for (const b of this.bolts) b.life = 0;
    for (const r of this.floorRings) r.life = 0;
  }

  // ------------------------------------------------------------ one-shot effects

  hit(x, z, crit, element) {
    const c = element === 'fire' ? COLORS.fire : element === 'ice' ? COLORS.ice : element === 'poison' ? COLORS.poison : COLORS.spark;
    this.sparks.burst(x, Y, z, this.count(crit ? 14 : 7), crit ? 4 : 2.6, c, crit ? 0.16 : 0.11, 0.3, { gravity: 5, brightness: 1.7 });
    if (crit) this.flash(x, Y, z, 0.9, COLORS.spark);
  }

  /** Assassin vanishing / appearing: a burst of violet smoke and sparks. */
  shadowPuff(x, z) {
    this.puffs.burst(x, 0.4, z, this.count(12), 1.6, COLORS.shadow, 0.35, 0.45, { upward: 0.8, drag: 3, endSize: 0.8 });
    this.sparks.burst(x, 0.6, z, this.count(14), 3, COLORS.shadow, 0.1, 0.35, { gravity: 1, brightness: 2 });
  }

  /** Execution: a bright crossed slash on the monster and a ring. */
  execute(x, z, boss) {
    const c = boss ? COLORS.fire : COLORS.shadow;
    this.flash(x, 0.7, z, boss ? 2.2 : 1.5, c);
    this.sparks.burst(x, 0.6, z, this.count(boss ? 40 : 24), boss ? 6 : 4.5, c, 0.14, 0.45, { gravity: 3, brightness: 2.2 });
    this.ring(x, z, boss ? 2.6 : 1.6, 0.45, c);
  }

  flash(x, y, z, size, c = COLORS.spark) {
    this.sparks.emit(x, y, z, 0, 0, 0, c, size, 0.1, { endSize: size * 1.4, drag: 0, brightness: 2 });
  }

  death(x, z, big, tint = COLORS.smoke) {
    this.puffs.burst(x, 0.3, z, this.count(big ? 30 : 12), big ? 3 : 1.8, tint, big ? 0.5 : 0.3, 0.8, { upward: 0.6, drag: 2.5, endSize: big ? 1.4 : 0.7 });
    this.sparks.burst(x, 0.5, z, this.count(big ? 40 : 10), big ? 5 : 2.5, COLORS.spark, 0.12, 0.5, { gravity: 4, brightness: 1.6 });
    this.ring(x, z, big ? 3 : 0.9, big ? 0.7 : 0.35, COLORS.spark);
  }

  blast(x, z, radius, c = COLORS.fire) {
    this.sparks.burst(x, 0.2, z, this.count(26 + radius * 10), 4 + radius * 2, c, 0.22, 0.55, { gravity: 3, upward: 0.6, brightness: 1.8 });
    this.puffs.burst(x, 0.15, z, this.count(14), radius * 2.4, COLORS.smoke, 0.5, 0.9, { upward: 0.5, drag: 2.5, endSize: 1.2 });
    this.flash(x, 0.4, z, radius * 1.6, c);
    this.ring(x, z, radius, 0.4, c);
  }

  spawn(x, z) {
    this.puffs.burst(x, 0.1, z, this.count(10), 1.6, COLORS.dust, 0.3, 0.7, { upward: 0.4, drag: 3, endSize: 0.7 });
    this.ring(x, z, 0.7, 0.5, COLORS.magic);
  }

  pickup(x, z, kind) {
    const c = kind === 'coin' ? COLORS.coin : kind === 'heart' ? COLORS.heart : COLORS.xp;
    this.sparks.burst(x, 0.5, z, this.count(kind === 'xp' ? 2 : 5), 1.4, c, 0.08, 0.3, { upward: 0.8, brightness: 1.6 });
  }

  levelUp(x, z) {
    this.sparks.burst(x, 0.4, z, this.count(50), 3, COLORS.coin, 0.16, 1, { upward: 0.95, gravity: -1.5, drag: 1.2, brightness: 1.8 });
    this.ring(x, z, 2, 0.6, COLORS.coin);
    this.ring(x, z, 1.2, 0.45, COLORS.spark);
  }

  /** A treasure chest bursting open: a fountain of gold. */
  chest(x, z) {
    this.sparks.burst(x, 0.5, z, this.count(70), 4.2, COLORS.coin, 0.18, 1.3, { upward: 0.98, gravity: -5, drag: 0.6, brightness: 2 });
    this.ring(x, z, 2.4, 0.7, COLORS.coin);
    this.flash(x, 0.6, z, 2.2, COLORS.coin);
  }

  heal(x, z) {
    this.sparks.burst(x, 0.3, z, this.count(26), 1.8, COLORS.heal, 0.14, 0.9, { upward: 0.95, gravity: -1.5, brightness: 1.6 });
    this.ring(x, z, 1, 0.5, COLORS.heal);
  }

  dust(x, z, amount = 6) {
    this.puffs.burst(x, 0.08, z, this.count(amount), 1.2, COLORS.dust, 0.2, 0.5, { upward: 0.3, drag: 3, endSize: 0.5 });
  }

  blink(x0, z0, x1, z1) {
    this.puffs.burst(x0, 0.5, z0, this.count(16), 1.6, COLORS.magic, 0.3, 0.6, { upward: 0.5, drag: 2, endSize: 0.6 });
    this.sparks.burst(x1, 0.5, z1, this.count(18), 2, COLORS.magic, 0.12, 0.5, { brightness: 1.8 });
  }

  wallHit(x, z) {
    this.sparks.burst(x, Y, z, this.count(4), 1.6, COLORS.dust, 0.07, 0.25, { gravity: 5 });
  }

  /** Expanding ring on the floor. */
  ring(x, z, radius, duration, c) {
    let r = this.floorRings.find((item) => item.life <= 0);
    if (!r) {
      if (this.floorRings.length >= 16) return;
      const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      r = { mesh, life: 0 };
      this.floorRings.push(r);
    }
    r.mesh.position.set(x, 0.04, z);
    r.mesh.material.color.copy(c);
    r.radius = radius;
    r.life = r.max = duration;
    r.mesh.visible = true;
  }

  lightning(x0, z0, x1, z1) {
    let b = this.bolts.find((item) => item.life <= 0);
    // A storm of chains: reuse the oldest line rather than adding more.
    if (!b && this.bolts.length >= 24) b = this.bolts.reduce((a, c) => (c.life < a.life ? c : a));
    if (!b) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe0c8ff, transparent: true, toneMapped: false }));
      line.frustumCulled = false;
      this.scene.add(line);
      b = { line, life: 0 };
      this.bolts.push(b);
    }
    const pos = b.line.geometry.attributes.position;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const j = i === 0 || i === 7 ? 0 : 0.25;
      pos.setXYZ(i, x0 + (x1 - x0) * t + (Math.random() - 0.5) * j, Y + (Math.random() - 0.5) * j, z0 + (z1 - z0) * t + (Math.random() - 0.5) * j);
    }
    pos.needsUpdate = true;
    b.life = 0.14;
    b.line.visible = true;
    this.sparks.burst(x1, Y, z1, this.count(6), 2, COLORS.bolt, 0.1, 0.25, { brightness: 2 });
  }

  // ------------------------------------------------------------ telegraphs

  /** Red circle that fills up until the blast. */
  addHazard(h) {
    let item = this.hazardPool.find((x) => !x.active);
    if (!item) {
      const ring = new THREE.Mesh(this.hazardGeometry.ring, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      const disc = new THREE.Mesh(this.hazardGeometry.disc, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
      const fill = new THREE.Mesh(this.hazardGeometry.disc, new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      for (const m of [ring, disc, fill]) {
        m.renderOrder = 2;
        this.scene.add(m);
      }
      item = { ring, disc, fill, active: false };
      this.hazardPool.push(item);
    }
    item.active = true;
    item.hazard = h;
    for (const m of [item.ring, item.disc, item.fill]) {
      m.visible = true;
      m.position.set(h.x, 0.03, h.z);
      m.scale.setScalar(h.radius);
    }
  }

  /** Aim line in front of a monster ('line' thin, 'dash' wide). */
  addLine(enemy, kind, duration) {
    let item = this.lines.find((x) => !x.active);
    if (!item) {
      const mesh = new THREE.Mesh(this.lineGeometry, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      item = { mesh, active: false };
      this.lines.push(item);
    }
    item.active = true;
    item.enemy = enemy;
    item.kind = kind;
    item.life = item.max = duration;
    item.mesh.visible = true;
  }

  // ------------------------------------------------------------ frame

  update(dt, run) {
    this.time += dt;
    const t = this.time;
    this.sparks.update(dt);
    this.puffs.update(dt);

    for (const r of this.floorRings) {
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(r.radius * (0.3 + k * 0.7));
      r.mesh.material.opacity = (1 - k) * 0.9;
    }
    for (const b of this.bolts) {
      if (b.life <= 0) {
        b.line.visible = false;
        continue;
      }
      b.life -= dt;
      b.line.material.opacity = Math.min(1, b.life * 10);
    }
    if (!run) {
      this.kunaiMesh.count = this.arrowMesh.count = this.shotCore.count = this.shotHalo.count = this.xpMesh.count = this.coinMesh.count = this.heartMesh.count = this.orbMesh.count = this.heroOrbs.count = 0;
      return;
    }

    // Arrows (+ a faint trail); staff and pet shots are glowing orbs, blades spin.
    let n = 0;
    let no = 0;
    let nk = 0;
    for (const a of run.arrows) {
      if (a.kind === 'staff' || a.kind === 'tome' || a.kind === 'pet') {
        if (no >= 120) continue;
        const size = a.kind === 'pet' ? 0.9 : a.kind === 'tome' ? 1.45 : 1.3;
        dummy.position.set(a.x, Y, a.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size * (1 + Math.sin(t * 25 + a.id) * 0.12));
        dummy.updateMatrix();
        this.heroOrbs.setMatrixAt(no, dummy.matrix);
        color.setHex(a.kind === 'pet' ? a.color : a.kind === 'tome' ? 0xffe066 : 0xb890ff);
        this.heroOrbs.setColorAt(no++, hdrColor.copy(color).multiplyScalar(HDR.orb));
        this.sparks.emit(a.x, Y, a.z, 0, 0, 0, color, a.kind === 'pet' ? 0.2 : 0.3, 0.22, { endSize: 0.02, drag: 0, brightness: 1.5, opacity: 0.8 });
        continue;
      }
      if (a.kind === 'kunai') {
        if (nk >= 240) continue;
        dummy.position.set(a.x, Y, a.z);
        dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
        dummy.scale.setScalar(1.1);
        dummy.updateMatrix();
        this.kunaiMesh.setMatrixAt(nk++, dummy.matrix);
        if ((a.id + Math.floor(t * 60)) % 2 === 0) this.sparks.emit(a.x - a.dx * 0.2, Y, a.z - a.dz * 0.2, 0, 0, 0, COLORS.shadow, 0.1, 0.16, { endSize: 0.02, drag: 0, brightness: 1.4, opacity: 0.7 });
        continue;
      }
      if (n >= 240) break;
      dummy.position.set(a.x, Y, a.z);
      if (a.kind === 'blades' || a.kind === 'shuriken') {
        // Spinning blades; shurikens a little bigger, spinning faster.
        dummy.rotation.set(0, t * (a.kind === 'shuriken' ? 32 : 25) + a.id, Math.PI / 2);
        if (a.kind === 'shuriken') dummy.scale.set(1.2, 0.8, 0.8);
        else dummy.scale.set(1, 0.6, 0.6);
      } else {
        dummy.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
        dummy.scale.setScalar(a.kind === 'crossbow' ? 1.35 : a.kind === 'longbow' ? 1.55 : 1);
      }
      dummy.updateMatrix();
      this.arrowMesh.setMatrixAt(n++, dummy.matrix);
      if ((a.id + Math.floor(t * 60)) % 2 === 0) this.sparks.emit(a.x - a.dx * 0.25, Y, a.z - a.dz * 0.25, 0, 0, 0, COLORS.arrow, 0.08, 0.14, { endSize: 0.02, drag: 0, brightness: 1.1, opacity: 0.6 });
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.kunaiMesh.count = nk;
    this.kunaiMesh.instanceMatrix.needsUpdate = true;
    this.heroOrbs.count = no;
    this.heroOrbs.instanceMatrix.needsUpdate = true;
    if (this.heroOrbs.instanceColor) this.heroOrbs.instanceColor.needsUpdate = true;

    // Monster shots.
    n = 0;
    for (const s of run.shots) {
      if (n >= 300) break;
      const size = s.kind === 'orb' ? 0.17 : s.kind === 'rock' ? 0.16 : 0.1;
      dummy.position.set(s.x, Y, s.z);
      dummy.rotation.set(0, Math.atan2(s.dx, s.dz), 0);
      if (s.kind === 'arrow' || s.kind === 'bone') dummy.scale.set(size, size, size * 2.6);
      else dummy.scale.setScalar(size);
      dummy.updateMatrix();
      this.shotCore.setMatrixAt(n, dummy.matrix);
      this.shotCore.setColorAt(n, color.setHex(SHOT_COLORS[s.kind] ?? 0xffffff).multiplyScalar(HDR.core));
      dummy.scale.multiplyScalar(2.1 + Math.sin(t * 20 + s.id) * 0.2);
      dummy.updateMatrix();
      this.shotHalo.setMatrixAt(n, dummy.matrix);
      this.shotHalo.setColorAt(n, color.setHex(SHOT_GLOW[s.kind] ?? 0xffffff).multiplyScalar(HDR.halo));
      n++;
    }
    this.shotCore.count = this.shotHalo.count = n;
    for (const m of [this.shotCore, this.shotHalo]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }

    // Pickups bob and spin.
    let nx = 0;
    let nc = 0;
    let nh = 0;
    for (const p of run.pickups) {
      const bob = 0.25 + Math.sin(t * 5 + p.id) * 0.06;
      dummy.position.set(p.x, bob, p.z);
      dummy.rotation.set(0, t * 3 + p.id, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      if (p.kind === 'xp' && nx < 300) this.xpMesh.setMatrixAt(nx++, dummy.matrix);
      else if (p.kind === 'coin' && nc < 300) this.coinMesh.setMatrixAt(nc++, dummy.matrix);
      else if (p.kind === 'heart' && nh < 20) this.heartMesh.setMatrixAt(nh++, dummy.matrix);
    }
    this.xpMesh.count = nx;
    this.coinMesh.count = nc;
    this.heartMesh.count = nh;
    for (const m of [this.xpMesh, this.coinMesh, this.heartMesh]) m.instanceMatrix.needsUpdate = true;

    // Orbs around the hero.
    const orbs = run.orbPositions(this.orbList ?? (this.orbList = []));
    this.orbMesh.count = orbs.length;
    orbs.forEach((o, i) => {
      dummy.position.set(o.x, Y, o.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1 + Math.sin(t * 12 + i) * 0.1);
      dummy.updateMatrix();
      this.orbMesh.setMatrixAt(i, dummy.matrix);
      this.orbMesh.setColorAt(i, color.setHex(ORB_COLORS[o.kind]).multiplyScalar(HDR.orb));
      color.setHex(ORB_COLORS[o.kind]);
      this.sparks.emit(o.x, Y, o.z, 0, 0.3, 0, color, 0.18, 0.25, { endSize: 0.03, drag: 1, brightness: 1.5, opacity: 0.8 });
    });
    this.orbMesh.instanceMatrix.needsUpdate = true;
    if (this.orbMesh.instanceColor) this.orbMesh.instanceColor.needsUpdate = true;

    // Danger circles.
    for (const item of this.hazardPool) {
      if (!item.active) continue;
      const h = item.hazard;
      if (h.dead || h.delay <= 0 || !run.hazards.includes(h)) {
        item.active = false;
        item.ring.visible = item.disc.visible = item.fill.visible = false;
        continue;
      }
      const k = 1 - h.delay / h.max;
      item.fill.scale.setScalar(h.radius * Math.max(0.02, k));
      item.ring.material.opacity = 0.6 + Math.sin(t * (10 + k * 20)) * 0.3;
    }
    // Aim lines follow their monster.
    for (const item of this.lines) {
      if (!item.active) continue;
      item.life -= dt;
      const e = item.enemy;
      if (item.life <= 0 || e.dead || (e.state !== 'aim' && e.state !== 'burst')) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      const wide = item.kind === 'dash';
      item.mesh.position.set(e.x, 0.035, e.z);
      item.mesh.rotation.y = Math.atan2(e.aimX, e.aimZ);
      item.mesh.scale.set(wide ? e.radius * 2 : 0.08, 1, wide ? 9 : 14);
      item.mesh.material.opacity = (wide ? 0.3 : 0.55) * (0.6 + 0.4 * Math.sin(t * 25));
    }
  }
}
