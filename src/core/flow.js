// Screen flow state machine: boot -> intro -> title <-> garage.
// (boot waits for landscape; the intro plays by itself, no tap needed.)
// Pure logic so it is unit tested without a browser.

const TRANSITIONS = {
  boot: { ready: 'intro' },
  intro: { done: 'title', skip: 'title' },
  title: { play: 'garage' },
  garage: { back: 'title' },
};

export const SCREENS = ['intro', 'title', 'garage'];

export function createFlow(onChange) {
  let state = 'boot';
  return {
    get state() { return state; },
    send(event) {
      const next = TRANSITIONS[state] && TRANSITIONS[state][event];
      if (!next) return false;
      const prev = state;
      state = next;
      if (onChange) onChange(next, prev);
      return true;
    },
  };
}

// Portrait needs the rotate prompt (CSS does the same check with orientation: portrait).
export function needsRotate(width, height) {
  return height > width;
}
