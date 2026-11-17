// Keyboard and pointer input. One-shot presses (start, restart, pause) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. Pointer moves are kept as
// the latest client position plus pressed/released edges for the thread.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  let actions = 0;
  const pointer = { x: 0, y: 0, down: false, pressed: false, released: false, moved: false };

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else {
      return;
    }
    event.preventDefault();
  });

  target.addEventListener('pointerdown', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.down = true;
    pointer.pressed = true;
    pointer.moved = false;
    // A click is not a confirm key: the main loop starts the game from a
    // click on the panels and stitches from a click in play, separately,
    // so dragging to stitch never pauses the game.
    event.preventDefault();
  });
  target.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = true;
  });
  target.addEventListener('pointerup', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.down = false;
    pointer.released = true;
  });
  target.addEventListener('pointercancel', () => {
    pointer.down = false;
    pointer.released = true;
  });
  // A pointer released while the tab is hidden never sends pointerup.
  window.addEventListener('blur', () => {
    pointer.down = false;
    pointer.released = true;
  });

  return {
    pointer,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Consume the pointer's pressed/released edges since the last call. */
    takePointerEdges() {
      const edges = { pressed: pointer.pressed, released: pointer.released };
      pointer.pressed = false;
      pointer.released = false;
      return edges;
    },
  };
}
