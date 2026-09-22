import { CONFIG } from '../config.js';
import { clamp, lerp } from '../core/math.js';

export const PATTERN = Object.freeze({ WALL: 0, PILLARS: 1, SLIDERS: 2 });

/** Run progression in [0, 1): fast at first, then asymptotically harder. */
export function progressAt(runTime) {
  return 1 - Math.exp(-runTime / CONFIG.speed.rampSeconds);
}

export function speedAt(progress) {
  return lerp(CONFIG.speed.start, CONFIG.speed.max, progress);
}

export function spacingAt(progress) {
  return lerp(CONFIG.track.spacingStart, CONFIG.track.spacingMin, progress);
}

/** Probability that a wall keeps a single opening instead of two. */
export function singleGapChance(progress) {
  return clamp((progress - 0.18) * 1.4, 0, 0.8);
}

export function pickPattern(progress) {
  const sliderWeight = progress < 0.3 ? 0 : lerp(0.12, 0.26, progress);
  const pillarWeight = lerp(0.32, 0.16, progress);
  const roll = Math.random();
  if (roll < sliderWeight) return PATTERN.SLIDERS;
  if (roll < sliderWeight + pillarWeight) return PATTERN.PILLARS;
  return PATTERN.WALL;
}

/**
 * Lateral distance a keyboard player can safely cover between two rows.
 * Touch players are faster, so this keeps every generated row fair for both.
 */
export function lateralReach(spacing, speed) {
  const timeBetweenRows = spacing / speed;
  return CONFIG.player.keyboardSpeed * timeBetweenRows * 0.8 + 0.9;
}
