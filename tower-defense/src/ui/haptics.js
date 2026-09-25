const MIN_GAP = 45;

/**
 * Vibration through the Vibration API (Android). iPhones have no such API, but on
 * iOS 18+ toggling an `<input type="checkbox" switch>` plays the system's haptic
 * tick, even when the switch is hidden: each vibration segment becomes one tick.
 * Older iOS versions (and some web views) simply ignore it.
 */
export class Haptics {
  constructor(enabled) {
    this.enabled = enabled;
    this.vibrates = typeof navigator.vibrate === 'function';
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    this.ios = !this.vibrates && ios;
    this.supported = this.vibrates || this.ios;
    this.last = 0;
    this.timers = [];
    if (this.ios) {
      this.label = document.createElement('label');
      this.label.setAttribute('aria-hidden', 'true');
      this.label.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      this.label.append(input);
      document.head.append(this.label);
    }
  }

  /** One iOS tick (rate-limited so a burst of events does not buzz continuously). */
  tick() {
    const now = performance.now();
    if (now - this.last < MIN_GAP) return;
    this.last = now;
    this.label.click();
  }

  /** `pattern`: milliseconds, or [on, off, on, …] like navigator.vibrate. */
  pulse(pattern) {
    if (!this.enabled || !this.supported) return;
    if (this.vibrates) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers throw when vibration is blocked by the user or a policy.
      }
      return;
    }
    const steps = Array.isArray(pattern) ? pattern : [pattern];
    let at = 0;
    steps.forEach((ms, i) => {
      if (i % 2 === 0) {
        if (at === 0) this.tick();
        else this.timers.push(setTimeout(() => this.tick(), at));
      }
      at += ms;
    });
    if (this.timers.length > 20) this.timers = this.timers.slice(-20);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) return;
    if (this.vibrates) navigator.vibrate(0);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
