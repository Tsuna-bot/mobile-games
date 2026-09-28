import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TYPES = { skinIndex: Uint16Array };

/**
 * Copy of `geometry` with plain Float32 attributes (the models are quantized),
 * only `keep` attributes, optionally baked by `matrix`.
 */
export function plainGeometry(geometry, keep, matrix = null) {
  const out = new THREE.BufferGeometry();
  for (const name of keep) {
    const source = geometry.attributes[name];
    if (!source) return null;
    const size = source.itemSize;
    const Type = TYPES[name] ?? Float32Array;
    const array = new Type(source.count * size);
    for (let i = 0; i < source.count; i++) {
      array[i * size] = source.getX(i);
      if (size > 1) array[i * size + 1] = source.getY(i);
      if (size > 2) array[i * size + 2] = source.getZ(i);
      if (size > 3) array[i * size + 3] = source.getW(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const index = geometry.index;
  if (index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(index.array), 1));
  else out.setIndex([...Array(out.attributes.position.count).keys()]);
  if (matrix) {
    out.applyMatrix4(matrix);
    // A mirrored transform flips the triangles.
    if (matrix.determinant() < 0) {
      const a = out.index.array;
      for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    }
  }
  return out;
}

/**
 * Static batching: every textured prop mesh under `root` (outside `skip`) is baked
 * into one mesh per material (and per shadow casting: objects under a node with
 * `userData.noShadow` do not cast). A room goes from ~150 draw calls to a handful.
 */
export function batchStatic(root, skip = new Set()) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const drop = [];
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const matrix = new THREE.Matrix4();
  root.traverse((object) => {
    if (skip.has(object)) return;
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh || !object.material.map) return;
    for (let p = object; p && p !== root; p = p.parent) if (skip.has(p) || !p.visible) return;
    const geometry = plainGeometry(object.geometry, ['position', 'normal', 'uv'], matrix.multiplyMatrices(inverse, object.matrixWorld));
    if (!geometry) return;
    let shadow = true;
    for (let p = object; p && p !== root; p = p.parent) if (p.userData.noShadow) shadow = false;
    const key = `${object.material.uuid}|${shadow}`;
    if (!groups.has(key)) groups.set(key, { material: object.material, shadow, parts: [] });
    groups.get(key).parts.push(geometry);
    drop.push(object);
  });
  for (const object of drop) object.removeFromParent();
  const created = [];
  for (const { material, shadow, parts } of groups.values()) {
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    created.push(merged);
  }
  return created;
}

/**
 * Merges the visible skinned parts of a character that share a material into one
 * SkinnedMesh (8 draw calls → 1). Parts must share the skeleton and bind matrix.
 * `cache` keeps the merged geometry per variant so clones reuse it.
 */
export function mergeSkinned(figure, key, cache) {
  const byMaterial = new Map();
  figure.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(o);
  });
  for (const [material, parts] of byMaterial) {
    if (parts.length < 2) continue;
    const first = parts[0];
    const same = parts.every((p) => p.skeleton.bones.length === first.skeleton.bones.length
      && p.skeleton.bones.every((b, i) => b === first.skeleton.bones[i])
      && p.bindMatrix.equals(first.bindMatrix) && p.matrix.equals(first.matrix) && p.parent === first.parent);
    if (!same) continue;
    const id = `${key}|${material.name}`;
    let geometry = cache.get(id);
    if (!geometry) {
      // Quantization gives each part its own scale/offset, folded into its inverse bind
      // matrices: bring every part into the first part's space before merging.
      const reference = first.skeleton.boneInverses[0];
      const toFirst = new THREE.Matrix4();
      const plain = parts.map((p) => {
        toFirst.copy(reference).invert().multiply(p.skeleton.boneInverses[0]);
        return plainGeometry(p.geometry, ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'], toFirst);
      });
      if (plain.some((g) => !g)) continue;
      geometry = mergeGeometries(plain, false);
      for (const g of plain) g.dispose();
      geometry.computeBoundingSphere();
      cache.set(id, geometry);
    }
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `${key}-merged`;
    mesh.matrix.copy(first.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.bind(first.skeleton, first.bindMatrix);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    first.parent.add(mesh);
    for (const p of parts) p.removeFromParent();
  }
}
