// Keyboard and mouse input. The plane flies with the arrow keys or WASD
// (turn, climb, descend); hold Shift to open the throttle and X to close
// it. Space or a click confirms on the title and end screens, P pauses.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
  KeyX: 'throttleDown',
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;

  function keyDown(event) {
    if (event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
      return;
    }
    const name = KEYS[event.code];
    if (name) {
      held.add(name);
      event.preventDefault();
    }
  }
  function keyUp(event) {
    const name = KEYS[event.code];
    if (name) held.delete(name);
  }
  function pointerDown() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', pointerDown);

  function direction() {
    // { turn: -1 left .. 1 right, pitch: -1 down .. 1 up, throttle: -1..1 }
    let turn = 0;
    if (held.has('left')) turn -= 1;
    if (held.has('right')) turn += 1;
    let pitch = 0;
    if (held.has('up')) pitch += 1;
    if (held.has('down')) pitch -= 1;
    let throttle = 0;
    if (held.has('throttleUp')) throttle += 1;
    if (held.has('throttleDown')) throttle -= 1;
    return { turn, pitch, throttle };
  }
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }
  return { direction, takeActions };
}
