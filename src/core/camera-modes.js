// Four camera views, cycled by one icon. Pure: returns where the camera wants to be; main.js smooths it.

export const CAMERA_MODES = ['iso-follow', 'iso-fixed', 'chase', 'top'];

export function nextCamera(mode) {
  const i = CAMERA_MODES.indexOf(mode);
  return CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
}

export function validCamera(mode) {
  return CAMERA_MODES.includes(mode) ? mode : CAMERA_MODES[0];
}

// target: {x, y, z, heading, speed}; state: persistent {fx, fz} for the fixed iso view
export function newCameraState(t) {
  return { fx: t.x, fz: t.z };
}

const ISO = { x: 0.62, y: 0.78, z: 0.62 };

export function cameraGoal(mode, t, state) {
  const h = t.heading || 0;
  const sp = t.speed || 0;
  switch (mode) {
    case 'iso-fixed': {
      const dead = 5;
      const dx = t.x - state.fx;
      const dz = t.z - state.fz;
      const d = Math.hypot(dx, dz);
      if (d > dead) { state.fx += (dx / d) * (d - dead); state.fz += (dz / d) * (d - dead); }
      const D = 34;
      return {
        pos: { x: state.fx + ISO.x * D, y: ISO.y * D, z: state.fz + ISO.z * D },
        look: { x: state.fx, y: 0, z: state.fz }, fov: 36,
      };
    }
    case 'chase':
      return {
        pos: { x: t.x - Math.sin(h) * 10, y: t.y + 4.6, z: t.z - Math.cos(h) * 10 },
        look: { x: t.x + Math.sin(h) * 7, y: t.y + 1.2, z: t.z + Math.cos(h) * 7 }, fov: 62,
      };
    case 'top':
      return {
        pos: { x: t.x, y: t.y + 36, z: t.z + 8 },
        look: { x: t.x + Math.sin(h) * sp * 0.15, y: t.y, z: t.z + Math.cos(h) * sp * 0.15 }, fov: 40,
      };
    case 'iso-follow':
    default: {
      const D = 25;
      const lx = t.x + Math.sin(h) * sp * 0.18;
      const lz = t.z + Math.cos(h) * sp * 0.18;
      return {
        pos: { x: lx + ISO.x * D, y: t.y + ISO.y * D, z: lz + ISO.z * D },
        look: { x: lx, y: t.y, z: lz }, fov: 38,
      };
    }
  }
}
