import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];

// ultra adds ambient occlusion (GTAO), the most expensive effect.
export const QUALITY_PRESETS = {
  ultra: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1, bloom: true, grade: true, ao: true, grass: 1 },
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1, bloom: true, grade: true, ao: false, grass: 1 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, effects: 0.75, bloom: false, grade: true, ao: false, grass: 0.6 },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 1024, effects: 0.5, bloom: false, grade: false, ao: false, grass: 0 },
};

/** Filmic grade applied last, in display space: S-curve, saturation, split toning, vignette, grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 0.18 },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.55 },
    uShadows: { value: new THREE.Color(0x3a5a9a) },
    uHighlights: { value: new THREE.Color(0xffc890) },
    uTone: { value: 0.05 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform vec3 uShadows;
    uniform vec3 uHighlights;
    uniform float uTone;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, uSaturation);
      c += (uShadows - 0.5) * (1.0 - luma) * uTone + (uHighlights - 0.5) * luma * uTone;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * uVignette;
      c += (fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }`,
};

export function detectInitialQuality() {
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

/** Averages the frame rate and reports when it stays too low. */
export class FrameRateMonitor {
  constructor() {
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.warmup = CONFIG.quality.warmup;
  }

  sample(frameDt) {
    if (frameDt <= 0) return false;
    if (this.warmup > 0) {
      this.warmup -= frameDt;
      return false;
    }
    this.elapsed += frameDt;
    this.frames++;
    if (this.elapsed < CONFIG.quality.sampleWindow) return false;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    if (fps >= CONFIG.quality.minFps) return false;
    this.warmup = CONFIG.quality.warmup;
    return true;
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
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 200);
    this.preset = QUALITY_PRESETS.high;
    this.qualityLevel = 'high';
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
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
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    if (this.composer) this.disposeComposer();
    if (this.preset.grade || this.preset.bloom) this.createComposer();
    this.resize();
  }

  createComposer() {
    const preset = this.preset;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (preset.ao) {
      this.aoPass = new GTAOPass(this.scene, this.camera, this.width, this.height);
      this.aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      this.aoPass.blendIntensity = 0.85;
      this.composer.addPass(this.aoPass);
    }
    // Threshold above lit white (snow at noon): only emissive things (spells, sparks) glow.
    if (preset.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.5, 0.45, 1.5);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    if (preset.grade) {
      this.gradePass = new ShaderPass(GradeShader);
      this.composer.addPass(this.gradePass);
    }
  }

  /** Per-level color grade (split toning colors and strength). */
  setGrade({ shadows, highlights, tone, saturation }) {
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
    this.onResize?.(this.width, this.height);
  }

  render() {
    if (this.contextLost) return;
    if (this.gradePass) this.gradePass.uniforms.uTime.value = (performance.now() % 10000) / 1000;
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
