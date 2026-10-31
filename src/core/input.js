// Input mapping, pure so it is unit tested. DOM glue lives in ui/touch-controls.js and main.js.
// Control scheme: one joystick (steer) + 2 buttons. B1 = gas (hold), B2 = brake/reverse,
// flicking the stick up = nitro. Keyboard and gamepad mirror the same three actions.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Pointer offset from the stick centre (screen coords, y down) -> normalised stick (y up).
export function stickVector(dx, dy, radius, dead = 0.12) {
  const rx = dx / radius;
  const ry = -dy / radius;
  const mag = Math.hypot(rx, ry);
  const m = Math.min(1, mag);
  if (m < dead) return { x: 0, y: 0, mag: 0 };
  const scale = (m - dead) / (1 - dead); // keep full range outside the dead zone
  return { x: (rx / mag) * scale, y: (ry / mag) * scale, mag: m };
}

// Gentle response curve: small movements are precise, full lock is still reachable.
export function steerCurve(x) {
  return Math.sign(x) * Math.pow(Math.abs(clamp(x, -1, 1)), 1.25);
}

// Detects "flick up": the stick goes from low to high within a short window.
export function createFlick({ hi = 0.8, lo = 0.4, window = 0.25, cooldown = 0.5 } = {}) {
  let lastLow = -Infinity;
  let nextOk = 0;
  return {
    update(y, t) {
      if (y < lo) { lastLow = t; return false; }
      if (y >= hi && t - lastLow <= window && t >= nextOk) {
        nextOk = t + cooldown;
        lastLow = -Infinity;
        return true;
      }
      return false;
    },
  };
}

export const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  gas: ['ArrowUp', 'KeyW', 'KeyX'],
  brake: ['ArrowDown', 'KeyS', 'KeyZ'],
  boost: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyC'],
};

export function keyboardInput(down) {
  const any = (list) => list.some((k) => down.has(k));
  return {
    steer: (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0),
    gas: any(KEYS.gas) ? 1 : 0,
    brake: any(KEYS.brake) ? 1 : 0,
  };
}

export function isBoostKey(code) {
  return KEYS.boost.includes(code);
}

// Standard-mapping gamepad: left stick steers, A / RT gas, B / LT brake, X / Y nitro.
export function gamepadInput(pad) {
  if (!pad) return { steer: 0, gas: 0, brake: 0, stickY: 0, boostBtn: false };
  const ax = (i) => (Math.abs(pad.axes[i] || 0) < 0.15 ? 0 : pad.axes[i]);
  const b = (i) => (pad.buttons[i] ? (pad.buttons[i].pressed || pad.buttons[i].value > 0.3) : false);
  return {
    steer: clamp(ax(0), -1, 1),
    gas: b(0) || b(7) ? 1 : 0,
    brake: b(1) || b(6) ? 1 : 0,
    stickY: -ax(1),
    boostBtn: b(2) || b(3),
  };
}

// Combine every source into the single input the physics sees.
export function mergeInputs(parts, autoGas = false) {
  let steer = 0;
  let gas = 0;
  let brake = 0;
  let boost = false;
  for (const p of parts) {
    steer += p.steer || 0;
    gas = Math.max(gas, p.gas || 0);
    brake = Math.max(brake, p.brake || 0);
    boost = boost || !!p.boost;
  }
  steer = clamp(steer, -1, 1);
  if (autoGas && brake === 0) gas = 1;
  return { steer, gas, brake, boost };
}
