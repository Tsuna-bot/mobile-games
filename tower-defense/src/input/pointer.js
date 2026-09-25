import { CONFIG } from '../config.js';

/**
 * Turns raw pointer events on the canvas into gestures:
 * tap (select), one-finger drag (pan, or "paint" when `onDragStart` claims it),
 * two-finger pinch (zoom + pan), wheel (zoom).
 */
export class PointerInput {
  constructor(element) {
    this.element = element;
    this.pointers = new Map();
    this.onTap = null;
    this.onPan = null;
    this.onZoom = null;
    this.onDragStart = null;
    this.onDragMove = null;
    this.onDragEnd = null;
    this.gesture = null;

    this.handleDown = (event) => {
      this.element.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.gesture = { startX: event.clientX, startY: event.clientY, startTime: performance.now(), moved: false, pinch: false };
      } else if (this.gesture) {
        if (this.gesture.paint) this.onDragEnd?.();
        this.gesture.paint = false;
        this.gesture.pinch = true;
        this.gesture.moved = true;
        this.gesture.pinchDistance = this.pinchDistance();
        this.gesture.mid = this.midpoint();
      }
    };

    this.handleMove = (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer || !this.gesture) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (this.gesture.pinch && this.pointers.size >= 2) {
        const distance = this.pinchDistance();
        if (this.gesture.pinchDistance > 0) this.onZoom?.(distance / this.gesture.pinchDistance);
        this.gesture.pinchDistance = distance;
        const mid = this.midpoint();
        this.onPan?.(mid.x - this.gesture.mid.x, mid.y - this.gesture.mid.y);
        this.gesture.mid = mid;
        return;
      }
      if (!this.gesture.moved) {
        const total = Math.hypot(event.clientX - this.gesture.startX, event.clientY - this.gesture.startY);
        if (total < CONFIG.input.tapMaxMove) return;
        this.gesture.moved = true;
        // A one-finger drag may paint (walls) instead of panning.
        if (this.pointers.size === 1 && this.onDragStart?.(this.gesture.startX, this.gesture.startY)) {
          this.gesture.paint = true;
          this.onDragMove?.(this.gesture.startX, this.gesture.startY);
        }
      }
      if (this.gesture.paint) {
        this.onDragMove?.(event.clientX, event.clientY);
        return;
      }
      this.onPan?.(dx, dy);
    };

    this.handleUp = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      const gesture = this.gesture;
      if (this.pointers.size > 0) {
        // Leaving a pinch with one finger still down: keep panning from there.
        if (gesture) gesture.pinch = false;
        return;
      }
      this.gesture = null;
      if (gesture?.paint) this.onDragEnd?.();
      if (!gesture || gesture.moved || event.type === 'pointercancel') return;
      if ((performance.now() - gesture.startTime) / 1000 <= CONFIG.input.tapMaxTime) {
        this.onTap?.(event.clientX, event.clientY);
      }
    };

    this.handleWheel = (event) => {
      event.preventDefault();
      this.onZoom?.(Math.exp(-event.deltaY * 0.0015));
    };

    element.addEventListener('pointerdown', this.handleDown);
    element.addEventListener('pointermove', this.handleMove);
    element.addEventListener('pointerup', this.handleUp);
    element.addEventListener('pointercancel', this.handleUp);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  midpoint() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  reset() {
    this.pointers.clear();
    this.gesture = null;
  }

  dispose() {
    this.element.removeEventListener('pointerdown', this.handleDown);
    this.element.removeEventListener('pointermove', this.handleMove);
    this.element.removeEventListener('pointerup', this.handleUp);
    this.element.removeEventListener('pointercancel', this.handleUp);
    this.element.removeEventListener('wheel', this.handleWheel);
  }
}
