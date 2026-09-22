export const STATE = Object.freeze({
  BOOT: 'boot',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  GAME_OVER: 'gameover',
});

const TRANSITIONS = {
  [STATE.BOOT]: [STATE.MENU],
  [STATE.MENU]: [STATE.PLAYING],
  [STATE.PLAYING]: [STATE.PAUSED, STATE.DYING],
  [STATE.PAUSED]: [STATE.PLAYING, STATE.MENU],
  [STATE.DYING]: [STATE.GAME_OVER],
  [STATE.GAME_OVER]: [STATE.PLAYING, STATE.MENU],
};

/**
 * Minimal finite state machine. Invalid transitions are ignored (and reported
 * as false) so a double tap on a button can never corrupt the game state.
 */
export class StateMachine {
  constructor(initial, handlers) {
    this.current = initial;
    this.previous = null;
    this.handlers = handlers;
  }

  is(state) {
    return this.current === state;
  }

  can(next) {
    return TRANSITIONS[this.current]?.includes(next) ?? false;
  }

  go(next) {
    if (!this.can(next)) return false;
    this.previous = this.current;
    this.current = next;
    this.handlers[next]?.(this.previous);
    return true;
  }
}
