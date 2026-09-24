import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const QUALITY_PRESETS = {
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1, bloom: true },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, effects: 0.75, bloom: false },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 1024, effects: 0.5, bloom: false },
};

export function detectInitialQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (cores <= 4 || memory <= 2) return 'low';
  if (window.matchMedia('(pointer: coarse)').matches) return cores >= 8 && memory >= 6 ? 'high' : 'medium';
  return 'high';
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
    if (this.preset.bloom && !this.composer) this.createComposer();
    if (!this.preset.bloom && this.composer) this.disposeComposer();
    this.resize();
  }

  createComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // High threshold: only emissive things (spells, crystals, sparks) glow.
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.55, 0.45, 0.9));
    this.composer.addPass(new OutputPass());
  }

  disposeComposer() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.composer = null;
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
