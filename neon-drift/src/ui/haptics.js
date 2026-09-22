/** Thin wrapper around the Vibration API (unsupported on iOS Safari: silently ignored). */
export class Haptics {
  constructor(enabled) {
    this.enabled = enabled;
    this.supported = typeof navigator.vibrate === 'function';
  }

  pulse(pattern) {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw when vibration is blocked by the user or a policy.
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.supported) navigator.vibrate(0);
  }
}
