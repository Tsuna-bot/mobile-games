import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { outlineMaterial, patchRim, rigidOutlineMaterial, toonRamp } from './surfaces.js';

// Anime heroes: VRoid sample characters (CC0) converted by tools/convert-vroid.mjs,
// drawn with toon shading (hard light bands), a dark outline and a rim light.
// All of them share one VRoid skeleton, so one set of clips (anims.glb, retargeted
// from Quaternius' Universal Animation Library, CC0) animates every hero.

export const ANIME_HEROES = ['archer', 'assassin', 'ranger', 'mage', 'knight'];

// Face details (eyes, lashes, brows, mouth lines) stay flat and bright, like drawings.
const FLAT = /Eye|Brow|Mouth|Eyeline|Eyelash|Highlight/i;

/**
 * A cape hanging from the shoulders (top edge at the origin, hem at -length): narrow at
 * the neck, wide at the hem, wrapped around the back with soft folds.
 */
function capeGeometry(width, length) {
  const geometry = new THREE.PlaneGeometry(1, length, 10, 14);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i); // -0.5 .. 0.5
    const y = pos.getY(i) - length / 2; // 0 at the top, -length at the hem
    const t = -y / length;
    const w = 0.26 + (width - 0.26) * Math.min(1, t * 1.6);
    const x = u * w;
    // Around the back (+Z), edges pulled forward at the shoulders; folds lower down.
    const wrap = -(u * u) * (0.55 - 0.3 * t) * w;
    const folds = Math.sin(u * Math.PI * 5) * 0.012 * t;
    pos.setXYZ(i, x, y, 0.02 + wrap + folds + t * 0.06);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class AnimeLibrary {
  constructor() {
    this.scenes = new Map();
    this.clips = [];
    this.ramp = toonRamp();
    this.outline = outlineMaterial(0x2a1a2e, 0.0019, true);
    this.rigidOutline = rigidOutlineMaterial(0x2a1a2e, 0.0015);
    this.toonCache = new Map();
    this.geometries = {
      pauldron: new THREE.SphereGeometry(0.075, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1.3, 0.55, 1.2),
      belt: new THREE.TorusGeometry(0.125, 0.02, 8, 28).rotateX(Math.PI / 2).scale(1, 1, 0.78),
      buckle: new THREE.BoxGeometry(0.05, 0.045, 0.02),
      scarf: new THREE.TorusGeometry(0.068, 0.032, 10, 24).rotateX(Math.PI / 2).scale(1, 1, 0.9),
      quiver: new THREE.CylinderGeometry(0.045, 0.038, 0.34, 12),
      fletch: new THREE.ConeGeometry(0.018, 0.07, 6),
      strap: new THREE.TorusGeometry(0.15, 0.011, 6, 36).scale(1, 1.5, 0.72),
    };
  }

  /** Shared toon material of a colour (outfit pieces). */
  toon(color, metal = false) {
    const key = `${color}|${metal}`;
    if (!this.toonCache.has(key)) {
      const material = patchRim(new THREE.MeshToonMaterial({ color, gradientMap: this.ramp, side: THREE.DoubleSide, emissive: metal ? 0x1a2230 : 0x000000 }));
      this.toonCache.set(key, material);
    }
    return this.toonCache.get(key);
  }

  /** Adds a piece to a bone, with its outline; returns the mesh. */
  piece(bone, geometry, material, outline = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    bone.add(mesh);
    if (outline) mesh.add(new THREE.Mesh(geometry, this.rigidOutline));
    return mesh;
  }

  /**
   * Fantasy outfit over the modern clothes: cape, pauldrons, belt, scarf, strap, quiver.
   * Bones are in VRoid's frame: +Y up, the back is +Z.
   */
  dress(model, outfit) {
    const bone = (name) => model.getObjectByName(name);
    const chest = bone('J_Bip_C_UpperChest');
    const parts = {};
    if (outfit.cape && chest) {
      const length = outfit.capeLength ?? 0.8;
      const cape = new THREE.Group();
      cape.position.set(0, 0.1, 0.1);
      chest.add(cape);
      this.piece(cape, this.capeGeometry(outfit.capeWidth ?? 0.42, length), this.toon(outfit.cape));
      parts.cape = cape;
    }
    if (outfit.pauldrons) {
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const arm = bone(`J_Bip_${side}_UpperArm`);
        if (!arm) continue;
        if (outfit.pauldronSide && outfit.pauldronSide !== side) continue;
        // Two overlapping plates, tilted outward over the shoulder.
        for (const [k, dy] of [[1, 0], [0.82, -0.028]]) {
          const plate = this.piece(arm, this.geometries.pauldron, this.toon(outfit.pauldrons, outfit.metal));
          plate.position.set(sign * (0.035 + (1 - k) * 0.04), 0.03 + dy, 0);
          plate.rotation.z = -sign * (0.5 + (1 - k) * 1.2);
          plate.scale.setScalar(k);
        }
      }
    }
    const hips = bone('J_Bip_C_Spine') ?? bone('J_Bip_C_Hips');
    if (outfit.belt && hips) {
      const belt = this.piece(hips, this.geometries.belt, this.toon(outfit.belt), false);
      belt.position.set(0, 0.02, 0.005);
      belt.scale.setScalar(outfit.beltScale ?? 1);
      const buckle = this.piece(belt, this.geometries.buckle, this.toon(outfit.buckle ?? 0xe8c060, true), false);
      buckle.position.set(0, 0, -0.1);
    }
    const neck = bone('J_Bip_C_Neck');
    if (outfit.scarf && neck) {
      const scarf = this.piece(neck, this.geometries.scarf, this.toon(outfit.scarf));
      scarf.position.set(0, 0.0, 0.005);
      // The long tail flying behind.
      const tail = new THREE.Group();
      tail.position.set(0.03, -0.01, 0.07);
      neck.add(tail);
      this.piece(tail, this.capeGeometry(0.12, 0.6), this.toon(outfit.scarf));
      parts.cape = parts.cape ?? tail;
    }
    // A strap across the chest, from the right shoulder to the left hip.
    const spine = bone('J_Bip_C_Chest') ?? chest;
    if (outfit.strap && spine) {
      const strap = this.piece(spine, this.geometries.strap, this.toon(outfit.strap), false);
      strap.position.set(0, 0.02, 0.005);
      strap.rotation.z = -0.62;
    }
    // Tunic flaps over the thighs: they follow the legs, so nothing clips when running.
    if (outfit.tassets) {
      for (const side of ['L', 'R']) {
        const leg = bone(`J_Bip_${side}_UpperLeg`);
        if (!leg) continue;
        const sign = Math.sign(leg.position.x) || (side === 'L' ? -1 : 1);
        this.piece(leg, this.tassetGeometry(sign, outfit.tassetLength ?? 0.3), this.toon(outfit.tassets, outfit.metal));
      }
    }
    if (outfit.quiver && chest) {
      const quiver = this.piece(chest, this.geometries.quiver, this.toon(outfit.quiver));
      quiver.position.set(-0.07, 0.02, 0.13);
      quiver.rotation.z = 0.5;
      for (let i = 0; i < 3; i++) {
        const f = this.piece(quiver, this.geometries.fletch, this.toon(0xf4eee0), false);
        f.position.set((i - 1) * 0.02, 0.2, (i % 2) * 0.01);
      }
    }
    return parts;
  }

  /** A flared shell around a thigh, open toward the other leg (`sign`: side of the leg). */
  tassetGeometry(sign, length) {
    const key = `tasset-${sign}-${length}`;
    if (!this.geometries[key]) {
      const gap = 1.5;
      const geometry = new THREE.CylinderGeometry(0.105, 0.14, length, 18, 3, true, -sign * Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
      geometry.translate(0, 0.03 - length / 2, 0);
      this.geometries[key] = geometry;
    }
    return this.geometries[key];
  }

  capeGeometry(width, length) {
    const key = `cape-${width}-${length}`;
    this.geometries[key] ??= capeGeometry(width, length);
    return this.geometries[key];
  }

  async load(loader, base, onEach) {
    const jobs = ANIME_HEROES.map(async (id) => {
      const gltf = await loader.loadAsync(`${base}${id}.glb`);
      this.register(id, gltf.scene);
      onEach?.();
    });
    jobs.push(loader.loadAsync(`${base}anims.glb`).then((gltf) => {
      this.clips = gltf.animations;
      onEach?.();
    }));
    await Promise.all(jobs);
  }

  get count() {
    return ANIME_HEROES.length + 1;
  }

  /** Replaces the unlit VRoid materials by toon ones (once per hero). */
  register(id, scene) {
    const swapped = new Map();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      let material = swapped.get(old);
      if (!material) {
        if (FLAT.test(old.name)) {
          material = new THREE.MeshBasicMaterial({
            name: old.name, map: old.map, color: old.color, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest, side: old.side, depthWrite: old.depthWrite,
          });
          old.dispose();
        } else {
          material = new THREE.MeshToonMaterial({
            name: old.name, map: old.map, color: old.color, gradientMap: this.ramp,
            transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest, side: old.side, depthWrite: old.depthWrite,
          });
          patchRim(material);
          old.dispose();
        }
        swapped.set(old, material);
      }
      o.material = material;
      o.castShadow = !material.transparent;
      o.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(scene);
    scene.userData.height = box.max.y - box.min.y;
    this.scenes.set(id, scene);
  }

  has(id) {
    return this.scenes.has(id);
  }

  /** A posable copy of hero `id`, `height` units tall, facing +Z, with outlines. */
  create(id, height, outfit = null) {
    const source = this.scenes.get(id);
    const model = SkeletonUtils.clone(source);
    const figure = new THREE.Group();
    // VRoid characters face -Z; the game's +Z is "forward".
    model.rotation.y = Math.PI;
    model.scale.setScalar(height / source.userData.height);
    figure.add(model);
    let face = null;
    const outlined = [];
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (o.morphTargetDictionary?.Fcl_EYE_Close !== undefined) face = o;
      if (o.material.transparent || FLAT.test(o.material.name) || o.morphTargetInfluences?.length) return;
      outlined.push(o);
    });
    for (const mesh of outlined) {
      const outline = new THREE.SkinnedMesh(mesh.geometry, this.outline);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      outline.frustumCulled = false;
      mesh.parent.add(outline);
    }
    const parts = outfit ? this.dress(model, outfit) : {};
    return { figure, model, face, hand: model.getObjectByName('J_Bip_R_Hand'), cape: parts.cape ?? null };
  }
}
