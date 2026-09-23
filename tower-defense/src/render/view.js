import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const QUALITY_PRESETS = {
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, effects: 1 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, effects: 0.75 },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 1024, effects: 0.5 },
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

/** Renderer, scene and camera; handles resizing and WebGL context loss. */
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
      this.onContextRestored?.();
    };
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  applyQuality(level) {
    this.qualityLevel = level;
    this.preset = QUALITY_PRESETS[level];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  resize() {
    this.width = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.onResize?.(this.width, this.height);
  }

  render() {
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.renderer.dispose();
  }
}
