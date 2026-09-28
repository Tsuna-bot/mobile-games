/**
 * Floating joystick: put the thumb down anywhere on the game, the stick appears
 * under it; drag to run, lift to stop (and shoot). Screen up = forward (−z).
 */
export class Joystick {
  constructor(surface, base, knob, radius = 58) {
    this.surface = surface;
    this.base = base;
    this.knob = knob;
    this.radius = radius;
    this.pointer = null;
    this.origin = { x: 0, y: 0 };
    this.value = { x: 0, z: 0 };
    this.enabled = true;
    this.onFirstTouch = null;

    this.down = (e) => {
      if (!this.enabled || this.pointer !== null) return;
      this.pointer = e.pointerId;
      this.surface.setPointerCapture?.(e.pointerId);
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.classList.add('is-active');
      this.setKnob(0, 0);
      this.onFirstTouch?.();
      e.preventDefault();
    };
    this.move = (e) => {
      if (e.pointerId !== this.pointer) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      // Past the rim, the base follows the thumb (no dead stick when you drift).
      if (d > this.radius) {
        const k = (d - this.radius) / d;
        this.origin.x += dx * k;
        this.origin.y += dy * k;
        this.base.style.transform = `translate(${this.origin.x}px, ${this.origin.y}px)`;
        dx = e.clientX - this.origin.x;
        dy = e.clientY - this.origin.y;
      }
      this.setKnob(dx, dy);
      const len = Math.hypot(dx, dy) / this.radius;
      const dead = 0.12;
      if (len < dead) {
        this.value.x = this.value.z = 0;
        return;
      }
      const scale = Math.min(1, (len - dead) / (1 - dead)) / (len || 1);
      this.value.x = (dx / this.radius) * scale;
      this.value.z = (dy / this.radius) * scale;
    };
    this.up = (e) => {
      if (e.pointerId !== this.pointer) return;
      this.release();
    };
    surface.addEventListener('pointerdown', this.down);
    surface.addEventListener('pointermove', this.move);
    surface.addEventListener('pointerup', this.up);
    surface.addEventListener('pointercancel', this.up);

    // Keyboard (computer): arrows / WASD.
    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  key(e, down) {
    const map = { ArrowUp: 'u', KeyW: 'u', KeyZ: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', KeyQ: 'l', ArrowRight: 'r', KeyD: 'r' };
    const k = map[e.code];
    if (!k) return;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    e.preventDefault();
  }

  setKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  release() {
    this.pointer = null;
    this.value.x = this.value.z = 0;
    this.base.classList.remove('is-active');
  }

  read() {
    if (this.pointer === null && this.keys.size) {
      const x = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0);
      const z = (this.keys.has('d') ? 1 : 0) - (this.keys.has('u') ? 1 : 0);
      const len = Math.hypot(x, z) || 1;
      return { x: x / len, z: z / len };
    }
    return this.value;
  }
}
