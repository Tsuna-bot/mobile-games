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
 * Light over the whole world, shared by every patched material: cloud shadows drifting
 * across the land (mode 0), or dancing caustics under water (mode 1).
 */
export const WORLD = {
  uCloudTime: { value: 0 },
  uCloudStrength: { value: 0.4 },
  uCloudMode: { value: 0 },
  uDapple: { value: 0 },
};

/** Sets the world light of a theme: `clouds` 0..1 shadow strength, `caustics` for underwater. */
export function setWorldLight({ clouds = 0.4, caustics = false, dapple = 0 } = {}) {
  WORLD.uCloudStrength.value = clouds;
  WORLD.uDapple.value = dapple;
  WORLD.uCloudMode.value = caustics ? 1 : 0;
}

const CLOUD_GLSL = /* glsl */ `
uniform float uCloudTime;
uniform float uCloudStrength;
uniform float uCloudMode;
uniform float uDapple;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// How much sunlight reaches this point of the world (clouds), or how much more (caustics).
float worldLight(vec2 p) {
  if (uCloudStrength <= 0.0) return 1.0;
  if (uCloudMode > 0.5) {
    vec2 q = p * 1.6 + vec2(uCloudTime * 0.35, uCloudTime * 0.22);
    float a = cNoise(q + cNoise(q * 1.7 - uCloudTime * 0.4) * 1.4);
    float c = 1.0 - abs(a - 0.5) * 2.0;
    return 0.82 + pow(c, 6.0) * 1.1 * uCloudStrength;
  }
  vec2 q = p * 0.085 + vec2(uCloudTime * 0.018, uCloudTime * 0.011);
  float n = cNoise(q) * 0.62 + cNoise(q * 2.3 + 5.0) * 0.28 + cNoise(q * 5.1 + 9.0) * 0.1;
  float light = 1.0 - smoothstep(0.5, 0.6, n) * uCloudStrength;
  // Sun through leaves: patches of dappled light that sway a little.
  if (uDapple > 0.0) {
    float mask = smoothstep(0.42, 0.62, cNoise(p * 0.22 + 3.0));
    vec2 sway = vec2(sin(uCloudTime * 0.7), cos(uCloudTime * 0.55)) * 0.12;
    float spots = smoothstep(0.52, 0.6, cNoise(p * 2.4 + sway)) * 0.7 + smoothstep(0.55, 0.62, cNoise(p * 5.1 - sway)) * 0.3;
    light *= 1.0 - mask * (1.0 - spots) * uDapple;
  }
  return light;
}
`;

/** Adds the world light (cloud shadows / caustics) to a patched shader; `pos` = GLSL world xz. */
function injectWorldLight(shader, pos) {
  Object.assign(shader.uniforms, WORLD);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${CLOUD_GLSL}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  reflectedLight.directDiffuse *= worldLight(${pos});`);
}

export { injectWorldLight };

/**
 * Patches `material` (MeshStandardMaterial, instanced or not) with the painted floor.
 * `occlusion` is a texture from `occlusionTexture` (null outside the arena).
 */
export function patchFloor(material, { style, occlusion = null, bounds = null, tint = 0xffffff, detail = 1, region = null, cracks = null, flecks = null, fleckAmount = 1 }) {
  const uniforms = {
    uStyle: { value: style },
    uOcc: { value: occlusion },
    uBounds: { value: bounds ?? new THREE.Vector4(0, 0, 1, 1) },
    uHasOcc: { value: occlusion ? 1 : 0 },
    uTint: { value: new THREE.Color(tint) },
    uDetail: { value: detail },
    // Paved court (ruins): half size, enabled; colour of the slabs.
    uRegion: { value: new THREE.Vector4(region?.halfW ?? 0, region?.halfH ?? 0, region ? 1 : 0, 0) },
    uRegionColor: { value: new THREE.Color(region?.color ?? 0xffffff) },
    // Glowing cracks (volcano): their colour, black for none.
    uCracks: { value: new THREE.Color(cracks ?? 0x000000) },
    // Tiny flower heads / fallen leaves speckled over the grass.
    uFleckA: { value: new THREE.Color(flecks?.[0] ?? 0xffffff) },
    uFleckB: { value: new THREE.Color(flecks?.[1] ?? flecks?.[0] ?? 0xffffff) },
    uFleck: { value: flecks ? fleckAmount : 0 },
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
uniform vec4 uRegion;
uniform vec3 uRegionColor;
uniform vec3 uCracks;
uniform vec3 uFleckA;
uniform vec3 uFleckB;
uniform float uFleck;
${NOISE}
// Distance to the nearest cell point (pebbles, cobbles) and that cell's id.
vec2 fVoronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float best = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(fHash(i + g), fHash(i + g + 17.3));
      float d = length(g + o - f);
      if (d < best) { best = d; id = fHash(i + g + 5.1); }
    }
  }
  return vec2(best, id);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 p = vFloorWorld.xz;
    float big = fFbm(p * 0.35);
    float mid = fFbm(p * 1.7);
    vec3 c = diffuseColor.rgb * uTint;
    if (uStyle < 0.5) {
      // Painted grass: warm and cool patches, brush strokes whose direction wanders,
      // lighter tufts, and bare earth with pebbles here and there.
      float hue = fFbm(p * 0.12 + 40.0);
      c *= mix(vec3(0.92, 0.98, 1.08), vec3(1.1, 1.04, 0.84), smoothstep(0.3, 0.7, hue));
      c *= 0.82 + big * 0.34;
      float ang = fNoise(p * 0.5) * 3.14;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 sp = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
      float stroke = fNoise(vec2(sp.x * 5.0, sp.y * 26.0));
      float blades = fNoise(vec2(p.x * 38.0, p.y * 9.0 + fNoise(p * 6.0) * 3.0));
      c *= 0.9 + stroke * 0.16 * uDetail + blades * 0.08 * uDetail;
      c = mix(c, c * vec3(1.14, 1.1, 0.72), smoothstep(0.62, 0.8, mid) * 0.5);
      // Bare patches: earth tone with pebbles.
      float bare = smoothstep(0.64, 0.74, fFbm(p * 0.32 + 23.0)) * uDetail;
      if (bare > 0.01) {
        vec3 earth = c * vec3(1.18, 0.95, 0.66) * 0.9;
        vec2 v = fVoronoi(p * 5.5);
        float pebble = 1.0 - smoothstep(0.18, 0.26, v.x);
        vec3 stone = mix(vec3(0.62, 0.6, 0.56), vec3(0.8, 0.76, 0.68), v.y);
        earth = mix(earth, stone * (0.8 + smoothstep(0.25, 0.0, v.x) * 0.35), pebble * step(0.45, v.y));
        c = mix(c, earth, bare);
      }
      // Speckles: tiny flower heads, petals or leaves.
      if (uFleck > 0.0) {
        vec2 g = p * 9.0;
        vec2 cell = floor(g);
        float h = fHash(cell + 3.3);
        vec2 dot2 = fract(g) - 0.5 - (vec2(fHash(cell + 1.1), fHash(cell + 2.2)) - 0.5) * 0.6;
        float speck = (1.0 - smoothstep(0.07, 0.12, length(dot2))) * step(1.0 - 0.14 * uFleck * smoothstep(0.35, 0.6, big), h);
        c = mix(c, mix(uFleckA, uFleckB, step(0.5, fHash(cell + 7.7))), speck * (1.0 - bare));
      }
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
    // Paved court: offset slabs with grass in the joints, thinning out at the edges.
    if (uRegion.z > 0.5) {
      vec2 q = abs(p) - uRegion.xy;
      float edge = max(q.x, q.y) + (fFbm(p * 0.9 + 17.0) - 0.5) * 1.6;
      vec2 g = p * vec2(1.1, 1.45);
      g.x += floor(g.y) * 0.5;
      vec2 f = fract(g);
      float slab = fHash(floor(g) + 3.7);
      float joint = min(min(f.x, 1.0 - f.x) / 1.1, min(f.y, 1.0 - f.y) / 1.45);
      vec3 stone = uRegionColor * uTint * (0.82 + slab * 0.26 + (mid - 0.5) * 0.2);
      // Bevelled slabs: the edge facing the light is brighter, the opposite one darker.
      float lit = smoothstep(0.1, 0.0, f.x) + smoothstep(0.1, 0.0, 1.0 - f.y);
      float dark = smoothstep(0.1, 0.0, 1.0 - f.x) + smoothstep(0.1, 0.0, f.y);
      stone *= 1.0 + lit * 0.16 - dark * 0.2;
      stone *= 0.94 + fNoise(p * 7.0 + slab * 13.0) * 0.12;
      stone *= mix(0.55, 1.0, smoothstep(0.012, 0.05, joint));
      stone = mix(stone, c * 0.9, smoothstep(0.5, 0.78, fFbm(p * 1.4 + 9.0)) * 0.7);
      float keep = step(smoothstep(-1.8, 0.3, edge) * 0.9 + 0.06, slab);
      float m = keep * (1.0 - smoothstep(0.1, 0.35, edge)) * smoothstep(0.0, 0.025, joint);
      c = mix(c, stone, m);
    }
    // Soft occlusion around blocks, walls and the arena rim.
    if (uHasOcc > 0.5) {
      vec2 uv = (p - uBounds.xy) / uBounds.zw;
      float occ = texture2D(uOcc, uv).r;
      c *= 1.0 - occ * 0.55;
    }
    diffuseColor.rgb = c;
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uCracks.r + uCracks.g + uCracks.b > 0.0) {
    vec2 q = vFloorWorld.xz;
    float n = fNoise(q * 1.1 + fNoise(q * 2.7) * 0.9);
    float crack = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.5));
    crack *= smoothstep(0.42, 0.66, fFbm(q * 0.35 + 5.0));
    diffuseColor.rgb *= 1.0 - crack * 0.8;
    totalEmissiveRadiance += uCracks * crack * 1.6;
  }`);
    injectWorldLight(shader, 'vFloorWorld.xz');
  };
  material.customProgramCacheKey = () => `floor-${style}-${region ? 'court' : 'open'}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Occlusion map of the arena: 1 near blocks and the rim, fading over ~1 cell.
 * Returns { texture, bounds } where bounds = (minX, minZ, sizeX, sizeZ).
 */
export function occlusionTexture(arena, perCell = 6, pad = 1, rimSolid = true) {
  const W = arena.width + pad * 2;
  const H = arena.height + pad * 2;
  const w = W * perCell;
  const h = H * perCell;
  const solid = (c, r) => {
    const ac = c - pad;
    const ar = r - pad;
    if (ac < 0 || ar < 0 || ac >= arena.width || ar >= arena.height) return rimSolid;
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRimWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 rimWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    rimWorld = instanceMatrix * rimWorld;
  #endif
  vRimWorld = (modelMatrix * rimWorld).xyz;`);
    injectWorldLight(shader, 'vRimWorld.xz');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRimWorld;\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
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

let RAMP = null;

/** Three light bands (shadow, mid-tone, lit), shared by every toon material. */
export function toonRamp() {
  if (RAMP) return RAMP;
  const data = new Uint8Array([150, 150, 150, 255, 212, 212, 212, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  RAMP.minFilter = THREE.NearestFilter;
  RAMP.magFilter = THREE.NearestFilter;
  RAMP.generateMipmaps = false;
  RAMP.needsUpdate = true;
  return RAMP;
}

/**
 * Anime outline: the mesh drawn again, inflated along its normals, back faces only,
 * in a dark tint. `width` is a fraction of the distance to the camera, so the line
 * keeps about the same thickness on screen near and far; `skinned` for characters.
 */
export function outlineMaterial(color = 0x2a1a2e, width = 0.0018, skinned = false) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: width };
    const inflate = (normal) => `{
    float outlineScale = length(modelMatrix[0].xyz);
    vec4 outlineView = modelViewMatrix * vec4(transformed, 1.0);
    transformed += normalize(${normal}) * uOutline * max(-outlineView.z, 1.0) / outlineScale;
  }`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uOutline;');
    shader.vertexShader = skinned
      ? shader.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>\n  ${inflate('objectNormal')}`)
      : shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  ${inflate('normal')}`);
  };
  material.customProgramCacheKey = () => (skinned ? 'outline-skinned' : 'outline-rigid');
  return material;
}

/** Outline for rigid meshes (props, outfit pieces). */
export function rigidOutlineMaterial(color = 0x2a1a2e, width = 0.0018) {
  return outlineMaterial(color, width, false);
}

let SHARED_OUTLINES = null;

/**
 * Adds an outline copy to every opaque mesh of `model` (skinned ones bound to the same
 * skeleton). `skip(mesh)` leaves some out. Returns the outline meshes.
 */
export function addOutlines(model, skip = null) {
  SHARED_OUTLINES ??= { skinned: outlineMaterial(0x2a1a2e, 0.0018, true), rigid: outlineMaterial(0x2a1a2e, 0.0018, false) };
  const meshes = [];
  model.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || o.material.transparent || skip?.(o)) return;
    meshes.push(o);
  });
  const outlines = [];
  for (const mesh of meshes) {
    let outline;
    if (mesh.isSkinnedMesh) {
      outline = new THREE.SkinnedMesh(mesh.geometry, SHARED_OUTLINES.skinned);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      mesh.parent.add(outline);
    } else {
      outline = new THREE.Mesh(mesh.geometry, SHARED_OUTLINES.rigid);
      mesh.add(outline);
    }
    outline.userData.isOutline = true;
    outline.frustumCulled = false;
    outline.castShadow = false;
    outlines.push(outline);
  }
  return outlines;
}

/** A toon copy of a lit material (same texture, colour and transparency), with rim light. */
export function toonCopy(material) {
  const toon = new THREE.MeshToonMaterial({
    name: material.name, map: material.map, color: material.color, vertexColors: material.vertexColors, gradientMap: toonRamp(),
    transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest, side: material.side, depthWrite: material.depthWrite,
  });
  return patchRim(toon);
}
