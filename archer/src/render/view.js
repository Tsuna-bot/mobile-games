import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];

// ultra adds ambient occlusion (GTAO), the most expensive effect.
export const QUALITY_PRESETS = {
  ultra: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1, bloom: true, grade: true, ao: true, grass: 1, msaa: 4, lens: 1 },
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1, bloom: true, grade: true, ao: false, grass: 1, msaa: 4, lens: 1 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, effects: 0.75, bloom: true, grade: true, ao: false, grass: 0.6, msaa: 2, lens: 0 },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 1024, effects: 0.5, bloom: false, grade: false, ao: false, grass: 0, msaa: 0, lens: 0 },
};

/**
 * Final pass, in display space: diorama depth of field (the far top of the screen and the
 * very bottom go soft), a light sharpen where it is in focus, filmic S-curve, saturation,
 * split toning, a hint of chromatic fringing at the edges, vignette, grain; and two
 * anime effects driven by the game: speed lines and impact frames.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uContrast: { value: 0.28 },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.55 },
    uShadows: { value: new THREE.Color(0x3a5a9a) },
    uHighlights: { value: new THREE.Color(0xffc890) },
    uTone: { value: 0.05 },
    uTime: { value: 0 },
    // Depth of field: in focus between uFocus.x (bottom) and uFocus.y (top), blur radius uFocus.z (px), on/off w.
    uFocus: { value: new THREE.Vector4(0.12, 0.62, 3.2, 1) },
    uLens: { value: 1 },
    uSpeed: { value: 0 },
    uImpact: { value: 0 },
    uImpactColor: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform vec3 uShadows;
    uniform vec3 uHighlights;
    uniform float uTone;
    uniform float uTime;
    uniform vec4 uFocus;
    uniform float uLens;
    uniform float uSpeed;
    uniform float uImpact;
    uniform vec3 uImpactColor;
    varying vec2 vUv;
    float gHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 px = 1.0 / uResolution;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Diorama blur: grows above the focus band (far hills) and below it (the near edge).
      float blur = 0.0;
      if (uFocus.w > 0.5) blur = smoothstep(uFocus.y, 1.0, vUv.y) + smoothstep(uFocus.x, 0.0, vUv.y) * 0.6;
      if (blur > 0.01) {
        float r = blur * uFocus.z;
        vec3 acc = c;
        acc += texture2D(tDiffuse, vUv + vec2(1.0, 0.0) * r * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(-1.0, 0.0) * r * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(0.0, 1.0) * r * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(0.0, -1.0) * r * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(0.7, 0.7) * r * 1.8 * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(-0.7, 0.7) * r * 1.8 * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(0.7, -0.7) * r * 1.8 * px).rgb;
        acc += texture2D(tDiffuse, vUv + vec2(-0.7, -0.7) * r * 1.8 * px).rgb;
        c = acc / 9.0;
      } else if (uLens > 0.5) {
        // In focus: a light unsharp mask keeps outlines and textures crisp.
        vec3 n = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
          + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
        c = clamp(c + (c - n * 0.25) * 0.35, 0.0, 1.0);
      }
      vec2 d = vUv - 0.5;
      // Chromatic fringing toward the corners (a touch of lens).
      if (uLens > 0.5) {
        vec2 off = d * dot(d, d) * 0.012;
        c.r = mix(c.r, texture2D(tDiffuse, vUv + off).r, 0.8);
        c.b = mix(c.b, texture2D(tDiffuse, vUv - off).b, 0.8);
      }
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, uSaturation);
      c += (uShadows - 0.5) * (1.0 - luma) * uTone + (uHighlights - 0.5) * luma * uTone;
      c *= 1.0 - dot(d, d) * uVignette;
      // Speed lines: thin white streaks racing in from the edges.
      if (uSpeed > 0.01) {
        vec2 q = d * vec2(uResolution.x / uResolution.y, 1.0);
        float ang = atan(q.y, q.x);
        float rad = length(q);
        float lane = floor(ang * 38.0);
        float seed = gHash(vec2(lane, floor(uTime * 14.0)));
        float streak = step(0.62, seed) * smoothstep(0.22 + seed * 0.18, 0.62, rad);
        float thin = 1.0 - abs(fract(ang * 38.0) - 0.5) * 2.0;
        c = mix(c, vec3(1.0), streak * smoothstep(0.55, 0.95, thin) * uSpeed * 0.75);
      }
      // Impact frame: a flash of inverted, high-contrast colour.
      if (uImpact > 0.01) {
        vec3 inv = vec3(1.0) - vec3(smoothstep(0.35, 0.55, luma));
        c = mix(c, inv * uImpactColor, uImpact);
      }
      c += (gHash(vUv * (uTime + 1.0)) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** iPhones and iPads (iPadOS reports itself as a Mac with touch). */
export function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function detectInitialQuality() {
  // Safari hides the real core count and memory: recent iPhones handle "high" easily,
  // and the dynamic resolution below keeps older ones smooth.
  if (isAppleMobile()) return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (cores <= 4 || memory <= 2) return 'low';
  if (window.matchMedia('(pointer: coarse)').matches) return cores >= 6 ? 'high' : 'medium';
  return cores >= 8 ? 'ultra' : 'high';
}

export function lowerQuality(level) {
  const index = QUALITY_LEVELS.indexOf(level);
  return index > 0 ? QUALITY_LEVELS[index - 1] : null;
}

/**
 * Dynamic resolution: trades sharpness for smoothness before any effect is cut.
 * Below 52 fps the render resolution drops a step; after a long run at 60 it creeps
 * back up, but never again to a step that already proved too slow.
 * `sample` returns true when even the lowest resolution is too slow (drop a quality level).
 */
export class ResolutionScaler {
  constructor(view) {
    this.view = view;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.cooldown = CONFIG.quality.warmup;
    this.good = 0;
    this.ceiling = Infinity;
  }

  sample(frameDt) {
    if (frameDt <= 0) return false;
    if (this.cooldown > 0) {
      this.cooldown -= frameDt;
      return false;
    }
    this.elapsed += frameDt;
    this.frames++;
    if (this.elapsed < 1.5) return false;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    const view = this.view;
    const { minPixelRatio, lowFps, goodFps } = CONFIG.quality;
    const min = Math.min(minPixelRatio, view.maxPixelRatio);
    if (fps < lowFps) {
      this.good = 0;
      if (view.pixelRatio <= min + 0.01) return fps < CONFIG.quality.minFps;
      this.ceiling = view.pixelRatio - 0.05;
      view.setPixelRatio(Math.max(min, view.pixelRatio - 0.25));
      this.cooldown = 1;
      return false;
    }
    if (fps >= goodFps) {
      this.good++;
      const next = Math.min(view.maxPixelRatio, view.pixelRatio + 0.125);
      if (this.good >= 4 && next > view.pixelRatio + 0.01 && next < this.ceiling) {
        view.setPixelRatio(next);
        this.good = 0;
        this.cooldown = 1;
      }
    } else this.good = 0;
    return false;
  }
}

/** Renderer, scene, camera and optional bloom; handles resizing and WebGL context loss. */
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    // Soft studio reflections on every standard material (a small prefiltered cube map).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 200);
    this.preset = QUALITY_PRESETS.high;
    this.qualityLevel = 'high';
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.maxPixelRatio = 1;
    // Phones: the shadow map (a second render of every caster) is refreshed every other frame.
    this.shadowInterval = window.matchMedia?.('(pointer: coarse)').matches ? 2 : 1;
    this.frameCount = 0;
    this.contextLost = false;
    this.onResize = null;
    this.onContextLost = null;
    this.onContextRestored = null;

    this.handleLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.onContextLost?.();
    };
    this.handleRestored = () => {
      this.contextLost = false;
      // Composer render targets belong to the lost context: replace them (disposing
      // objects of a dead context only produces GL warnings).
      if (this.composer) {
        this.composer = null;
        this.createComposer();
        this.resize();
      }
      this.onContextRestored?.();
    };
    this.composer = null;
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  applyQuality(level) {
    this.qualityLevel = level;
    this.preset = QUALITY_PRESETS[level];
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.refreshShadows();
    if (this.composer) this.disposeComposer();
    if (this.preset.grade || this.preset.bloom) this.createComposer();
    this.resize();
  }

  /** Changes the render resolution (dynamic resolution). */
  setPixelRatio(ratio) {
    if (Math.abs(ratio - this.pixelRatio) < 0.01) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  createComposer() {
    const preset = this.preset;
    // A multisampled target: without it, post-processing loses the antialiasing and
    // the anime outlines shimmer.
    const target = new THREE.WebGLRenderTarget(Math.max(1, this.width * this.pixelRatio), Math.max(1, this.height * this.pixelRatio), { type: THREE.HalfFloatType, samples: this.renderer.extensions.has('EXT_color_buffer_float') ? preset.msaa ?? 0 : 0 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (preset.ao) {
      this.aoPass = new GTAOPass(this.scene, this.camera, this.width, this.height);
      this.aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      this.aoPass.blendIntensity = 0.85;
      this.composer.addPass(this.aoPass);
    }
    // Threshold above lit white (snow at noon): only emissive things (spells, sparks) glow.
    if (preset.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.55, 0.5, 1.05);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    if (preset.grade) {
      this.gradePass = new ShaderPass(GradeShader);
      this.gradePass.uniforms.uLens.value = preset.lens ?? 0;
      this.composer.addPass(this.gradePass);
      if (this.grade) this.setGrade(this.grade);
      if (this.focus) this.setFocus(...this.focus);
    }
  }

  /** Per-level color grade (split toning colors and strength). */
  setGrade(grade) {
    this.grade = grade;
    const { shadows, highlights, tone, saturation } = grade;
    const u = GradeShader.uniforms;
    u.uShadows.value.set(shadows);
    u.uHighlights.value.set(highlights);
    u.uTone.value = tone;
    u.uSaturation.value = saturation;
    if (this.gradePass) {
      const pu = this.gradePass.uniforms;
      pu.uShadows.value.set(shadows);
      pu.uHighlights.value.set(highlights);
      pu.uTone.value = tone;
      pu.uSaturation.value = saturation;
    }
  }

  /** Depth of field band (screen fractions from the bottom) and blur radius; `on` false to disable. */
  setFocus(bottom, top, radius, on = true) {
    this.focus = [bottom, top, radius, on];
    this.gradePass?.uniforms.uFocus.value.set(bottom, top, radius * this.pixelRatio, on ? 1 : 0);
  }

  /** Anime effects: speed lines (0..1) and an impact frame (0..1, with its tint). */
  setAnime(speed, impact, color = null) {
    if (!this.gradePass) return;
    const u = this.gradePass.uniforms;
    u.uSpeed.value = speed;
    u.uImpact.value = impact;
    if (color) u.uImpactColor.value.copy(color);
  }

  disposeComposer() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.composer = null;
    this.aoPass = null;
    this.bloomPass = null;
    this.gradePass = null;
  }

  resize() {
    this.width = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
    }
    if (this.gradePass) {
      this.gradePass.uniforms.uResolution.value.set(this.width * this.pixelRatio, this.height * this.pixelRatio);
      if (this.focus) this.setFocus(...this.focus);
    }
    this.onResize?.(this.width, this.height);
  }

  /** Forces the next frame to redraw the shadow map (new level, quality change). */
  refreshShadows() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  render() {
    if (this.contextLost) return;
    const shadows = this.renderer.shadowMap;
    shadows.autoUpdate = this.shadowInterval <= 1;
    if (!shadows.autoUpdate && ++this.frameCount % this.shadowInterval === 0) shadows.needsUpdate = true;
    if (this.gradePass) this.gradePass.uniforms.uTime.value = (performance.now() % 10000) / 1000;
    this.renderer.toneMappingExposure = this.scene.userData.exposure ?? 1;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    if (this.composer) this.disposeComposer();
    this.renderer.dispose();
  }
}
