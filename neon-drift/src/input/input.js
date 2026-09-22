const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
const CONFIRM_KEYS = new Set(['Space', 'Enter']);

/**
 * Relative drag steering: wherever the thumb lands, sliding it moves the ship.
 * Drag deltas are normalized by a reference width so the feel is identical on
 * every screen size. Keyboard (arrows, A/D — Q/D on AZERTY) is a bonus.
 */
export class Input {
  constructor(surface) {
    this.surface = surface;
    this.pointerId = null;
    this.lastX = 0;
    this.pendingDrag = 0;
    this.left = false;
    this.right = false;
    this.referenceWidth = 400;
    this.onPause = null;
    this.onConfirm = null;
    this.onPointerDown = null;

    this.handlePointerDown = (event) => {
      if (this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.surface.setPointerCapture?.(event.pointerId);
      this.onPointerDown?.();
    };
    this.handlePointerMove = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.pendingDrag += (event.clientX - this.lastX) / this.referenceWidth;
      this.lastX = event.clientX;
    };
    this.handlePointerEnd = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
    };
    this.handleKeyDown = (event) => {
      if (LEFT_KEYS.has(event.code)) this.left = true;
      else if (RIGHT_KEYS.has(event.code)) this.right = true;
      else if (PAUSE_KEYS.has(event.code)) this.onPause?.();
      else if (CONFIRM_KEYS.has(event.code) && !event.repeat) {
        // Let focused buttons handle Enter/Space natively.
        if (document.activeElement instanceof HTMLButtonElement) return;
        this.onConfirm?.();
      } else return;
      event.preventDefault();
    };
    this.handleKeyUp = (event) => {
      if (LEFT_KEYS.has(event.code)) this.left = false;
      else if (RIGHT_KEYS.has(event.code)) this.right = false;
    };
    this.handleBlur = () => this.reset();

    surface.addEventListener('pointerdown', this.handlePointerDown);
    surface.addEventListener('pointermove', this.handlePointerMove);
    surface.addEventListener('pointerup', this.handlePointerEnd);
    surface.addEventListener('pointercancel', this.handlePointerEnd);
    surface.addEventListener('lostpointercapture', this.handlePointerEnd);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.updateReferenceWidth();
  }

  updateReferenceWidth() {
    // Capped so a wide desktop window does not require huge mouse movements.
    this.referenceWidth = Math.min(window.innerWidth, 480);
  }

  get axis() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  consumeDrag() {
    const drag = this.pendingDrag;
    this.pendingDrag = 0;
    return drag;
  }

  reset() {
    this.pointerId = null;
    this.pendingDrag = 0;
    this.left = false;
    this.right = false;
  }

  dispose() {
    this.surface.removeEventListener('pointerdown', this.handlePointerDown);
    this.surface.removeEventListener('pointermove', this.handlePointerMove);
    this.surface.removeEventListener('pointerup', this.handlePointerEnd);
    this.surface.removeEventListener('pointercancel', this.handlePointerEnd);
    this.surface.removeEventListener('lostpointercapture', this.handlePointerEnd);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
