/**
 * Fixed-timestep simulation loop with decoupled rendering.
 * - onFrame(realDt): real-time bookkeeping (slow motion timers, UI)
 * - update(step): deterministic simulation, called 0..n times per frame
 * - render(alpha, realDt): draws, interpolating between the last two steps
 */
export class FixedLoop {
  constructor({ step, maxFrameDelta, maxSubSteps, onFrame, update, render }) {
    this.step = step;
    this.maxFrameDelta = maxFrameDelta;
    this.maxSubSteps = maxSubSteps;
    this.onFrame = onFrame;
    this.update = update;
    this.render = render;
    this.timeScale = 1;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.rafId = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  renderOnce() {
    this.render(1, 0);
  }

  tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!(frameDt > 0)) frameDt = 0;
    if (frameDt > this.maxFrameDelta) frameDt = this.maxFrameDelta;

    this.onFrame(frameDt);

    this.accumulator += frameDt * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // Spiral-of-death guard: drop the backlog instead of trying to catch up.
    if (steps === this.maxSubSteps) this.accumulator %= this.step;

    this.render(this.accumulator / this.step, frameDt);
  }
}
