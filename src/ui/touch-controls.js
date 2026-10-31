// Touch / mouse controls: a floating joystick (left zone) and two hold buttons.
// Everything uses pointer events with capture, so each finger stays on its own control.
import { stickVector } from '../core/input.js';

export function createTouchControls({ zone, base, knob, gas, brake }) {
  const state = { x: 0, y: 0, gas: false, brake: false, active: false };
  let pid = null;
  let cx = 0;
  let cy = 0;
  let radius = 60;

  function placeBase(px, py) {
    base.style.left = `${px}px`;
    base.style.top = `${py}px`;
  }
  function restPosition() {
    const r = zone.getBoundingClientRect();
    radius = Math.max(44, Math.min(70, r.height * 0.2));
    base.style.setProperty('--r', `${radius}px`);
    cx = r.left + Math.min(r.width * 0.5, 150);
    cy = r.bottom - radius - 28;
    placeBase(cx - r.left, cy - r.top);
    knob.style.transform = 'translate(-50%, -50%)';
  }

  function reset() {
    pid = null;
    state.x = 0; state.y = 0; state.active = false;
    base.classList.remove('active');
    restPosition();
  }

  zone.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    try { zone.setPointerCapture(pid); } catch { /* capture can fail for synthetic events */ }
    const r = zone.getBoundingClientRect();
    radius = Math.max(44, Math.min(70, r.height * 0.2));
    base.style.setProperty('--r', `${radius}px`);
    cx = Math.min(Math.max(e.clientX, r.left + radius), r.right - radius);
    cy = Math.min(Math.max(e.clientY, r.top + radius), r.bottom - radius);
    placeBase(cx - r.left, cy - r.top);
    base.classList.add('active');
    state.active = true;
    move(e);
  });

  function move(e) {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const s = stickVector(dx, dy, radius);
    state.x = s.x;
    state.y = s.y;
    const m = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, radius / m);
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }
  zone.addEventListener('pointermove', move);
  const up = (e) => { if (e.pointerId === pid) reset(); };
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  zone.addEventListener('lostpointercapture', up);

  function hold(btn, key) {
    let id = null;
    const release = (e) => {
      if (e && e.pointerId !== id) return;
      id = null;
      state[key] = false;
      btn.classList.remove('down');
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try { btn.setPointerCapture(id); } catch { /* ignore */ }
      state[key] = true;
      btn.classList.add('down');
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    return () => release(null);
  }
  const rg = hold(gas, 'gas');
  const rb = hold(brake, 'brake');

  return {
    state,
    layout: restPosition,
    reset() { rg(); rb(); reset(); },
  };
}
