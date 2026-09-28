import * as THREE from 'three';
import { CELL } from '../sim/arena.js';

// Shader patches for the standard material: the floor gets a painted look (noise,
// grass blades or stone, cracks) and soft occlusion around blocks and walls;
// characters get a rim light that detaches them from the floor.

const NOISE = /* glsl */ `
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fFbm(vec2 p) { return fNoise(p) * 0.55 + fNoise(p * 2.1 + 3.1) * 0.3 + fNoise(p * 4.3 + 7.7) * 0.15; }
`;

export const FLOOR_STYLE = { grass: 0, stone: 1, flagstone: 2, soil: 3 };

/**
 * Patches `material` (MeshStandardMaterial, instanced or not) with the painted floor.
 * `occlusion` is a texture from `occlusionTexture` (null outside the arena).
 */
export function patchFloor(material, { style, occlusion = null, bounds = null, tint = 0xffffff, detail = 1 }) {
  const uniforms = {
    uStyle: { value: style },
    uOcc: { value: occlusion },
    uBounds: { value: bounds ?? new THREE.Vector4(0, 0, 1, 1) },
    uHasOcc: { value: occlusion ? 1 : 0 },
    uTint: { value: new THREE.Color(tint) },
    uDetail: { value: detail },
  };
  material.userData.floor = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 floorWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    floorWorld = instanceMatrix * floorWorld;
  #endif
  vFloorWorld = (modelMatrix * floorWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFloorWorld;
uniform float uStyle;
uniform sampler2D uOcc;
uniform vec4 uBounds;
uniform float uHasOcc;
uniform vec3 uTint;
uniform float uDetail;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vFloorWorld.xz;
    float big = fFbm(p * 0.35);
    float mid = fFbm(p * 1.7);
    vec3 c = diffuseColor.rgb * uTint;
    if (uStyle < 0.5) {
      // Grass: patches, fine blades, a few lighter tufts.
      float blades = fNoise(vec2(p.x * 38.0, p.y * 9.0 + fNoise(p * 6.0) * 3.0));
      c *= 0.84 + big * 0.3;
      c *= 0.93 + blades * 0.14 * uDetail;
      c = mix(c, c * vec3(1.12, 1.08, 0.7), smoothstep(0.62, 0.8, mid) * 0.5);
    } else if (uStyle < 1.5 || uStyle > 2.5) {
      // Stone slabs / soil: tone per slab, worn centre, cracks.
      vec2 cell = floor(p + 0.5);
      float slab = fHash(cell);
      c *= 0.88 + slab * 0.2 + (mid - 0.5) * 0.18;
      float crack = abs(fNoise(p * 2.6 + slab * 9.0) - 0.5);
      float cracked = smoothstep(0.62, 0.75, fNoise(p * 0.7 + 11.0)) * uDetail;
      c *= 1.0 - (1.0 - smoothstep(0.0, 0.03, crack)) * 0.25 * cracked;
      c = mix(c, c * 1.1, smoothstep(0.55, 0.9, big) * 0.6);
    } else {
      // Mossy flagstones.
      vec2 cell = floor(p + 0.5);
      float slab = fHash(cell);
      c *= 0.86 + slab * 0.22;
      float moss = smoothstep(0.5, 0.75, fFbm(p * 1.3 + 4.0));
      c = mix(c, vec3(0.2, 0.36, 0.22), moss * 0.45);
      float crack = abs(fNoise(p * 2.6 + slab * 7.0) - 0.5);
      float cracked = smoothstep(0.6, 0.75, fNoise(p * 0.7 + 5.0));
      c *= 1.0 - (1.0 - smoothstep(0.0, 0.03, crack)) * 0.25 * cracked;
    }
    // Soft occlusion around blocks, walls and the arena rim.
    if (uHasOcc > 0.5) {
      vec2 uv = (p - uBounds.xy) / uBounds.zw;
      float occ = texture2D(uOcc, uv).r;
      c *= 1.0 - occ * 0.55;
    }
    diffuseColor.rgb = c;
  }`);
  };
  material.customProgramCacheKey = () => `floor-${style}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Occlusion map of the arena: 1 near blocks and the rim, fading over ~1 cell.
 * Returns { texture, bounds } where bounds = (minX, minZ, sizeX, sizeZ).
 */
export function occlusionTexture(arena, perCell = 6, pad = 1) {
  const W = arena.width + pad * 2;
  const H = arena.height + pad * 2;
  const w = W * perCell;
  const h = H * perCell;
  const solid = (c, r) => {
    const ac = c - pad;
    const ar = r - pad;
    if (ac < 0 || ar < 0 || ac >= arena.width || ar >= arena.height) return true;
    return arena.cells[ar * arena.width + ac] === CELL.BLOCK;
  };
  const data = new Uint8Array(w * h);
  const reach = 0.9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / perCell;
      const py = (y + 0.5) / perCell;
      let best = 9;
      const c0 = Math.floor(px);
      const r0 = Math.floor(py);
      for (let r = r0 - 2; r <= r0 + 2; r++) {
        for (let c = c0 - 2; c <= c0 + 2; c++) {
          if (!solid(c, r)) continue;
          // Distance from the point to that cell's square.
          const dx = Math.max(c - px, 0, px - (c + 1));
          const dy = Math.max(r - py, 0, py - (r + 1));
          best = Math.min(best, Math.hypot(dx, dy));
        }
      }
      const v = best >= reach ? 0 : (1 - best / reach) ** 2;
      data[y * w + x] = Math.round(v * 255);
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bounds: new THREE.Vector4(-arena.halfW - pad, -arena.halfH - pad, W, H) };
}

const RIM_UNIFORMS = { uRimColor: { value: new THREE.Color(0xfff2d8) }, uRimStrength: { value: 0.55 } };

/** Sets the rim light colour and strength for every patched character material. */
export function setRim(color, strength) {
  RIM_UNIFORMS.uRimColor.value.set(color);
  RIM_UNIFORMS.uRimStrength.value = strength;
}

/** Rim (fresnel) light on a character material: silhouettes glow softly. */
export function patchRim(material) {
  if (material.onBeforeCompile.rim) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = RIM_UNIFORMS.uRimColor;
    shader.uniforms.uRimStrength = RIM_UNIFORMS.uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
      .replace('#include <opaque_fragment>', `{
    float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
    outgoingLight += uRimColor * pow(rim, 2.6) * uRimStrength;
  }
  #include <opaque_fragment>`);
  };
  material.onBeforeCompile.rim = true;
  material.customProgramCacheKey = () => 'rim';
  material.needsUpdate = true;
  return material;
}
