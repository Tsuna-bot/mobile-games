import { CONFIG } from '../config.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const QUALITY_PRESETS = {
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 1024, bloom: true, effects: 1 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 512, bloom: true, effects: 0.75 },
  low: { maxPixelRatio: 1, shadows: false, shadowMapSize: 512, bloom: false, effects: 0.5 },
};

/** Best-effort guess of what the device can sustain at 60 FPS. */
export function detectInitialQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (cores <= 4 || memory <= 2) return 'low';
  if (touchDevice) return cores >= 8 && memory >= 6 ? 'high' : 'medium';
  return 'high';
}

export function lowerQuality(level) {
  const index = QUALITY_LEVELS.indexOf(level);
  return index > 0 ? QUALITY_LEVELS[index - 1] : null;
}

/** Tracks the average frame rate and signals when it stays too low. */
export class FrameRateMonitor {
  constructor() {
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.warmup = CONFIG.quality.warmup;
  }

  /** Returns true when the device is struggling and quality should drop. */
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
    if (fps < CONFIG.quality.minFps) {
      this.warmup = CONFIG.quality.warmup;
      return true;
    }
    return false;
  }
}
