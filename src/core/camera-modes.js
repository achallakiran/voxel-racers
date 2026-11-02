import { loopWorld } from '../physics/loop.js';
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

// While riding a loop every view becomes a chase view that rides the ring: the camera sits on the inside of the circle,
// a little behind the truck, and looks along the ring ahead, so you see the road curve up and over you (like Hot Wheels
// games). The world stays upright. t.loop = the loop definition L, t.loopTh / t.loopLat = angle on the ring and lane.
export function loopCameraGoal(L, t) {
  const th = t.loopTh ?? 0; const lat = t.loopLat ?? 0;
  const inward = (pt, d) => {
    const nf = -Math.sin(pt.phi); const ny = Math.cos(pt.phi);
    return { f: nf * d, y: ny * d };
  };
  const back = loopWorld(L, Math.max(-0.3, th - 0.55), lat);
  const ahead = loopWorld(L, th + 0.4, lat);
  const bi = inward(back, 3.6); const ai = inward(ahead, 1.2);
  return {
    pos: { x: back.x + L.tx * bi.f, y: back.y + bi.y, z: back.z + L.tz * bi.f },
    look: { x: ahead.x + L.tx * ai.f, y: ahead.y + ai.y, z: ahead.z + L.tz * ai.f },
    fov: 68,
  };
}

export function cameraGoal(mode, t, state) {
  if (t.loop) return loopCameraGoal(t.loop, t);
  const h = t.heading || 0;
  const sp = t.speed || 0;
  // a stage built round a centrepiece (Saturn, always on the driver's right) wants the follow camera to turn with the
  // truck and look a little toward the centre: same distance and height as the isometric view, but heading-relative
  if (t.aim != null && (mode === 'iso-follow' || mode === 'chase')) {
    const a = h - t.aim;                              // the view direction: heading turned toward the right-hand side
    const P = mode === 'chase' ? { back: 11.5, up: 5.2, ahead: 7, ly: 1.4, fov: 62 } : { back: 15.5, up: 7.2, ahead: 9, ly: 1.8, fov: 54 };
    return {
      pos: { x: t.x - Math.sin(a) * P.back, y: t.y + P.up, z: t.z - Math.cos(a) * P.back },
      look: { x: t.x + Math.sin(a) * P.ahead, y: t.y + P.ly + (t.aimLift || 0), z: t.z + Math.cos(a) * P.ahead }, fov: P.fov,
    };
  }
  switch (mode) {
    case 'iso-fixed': {
      const dead = 5;
      const dx = t.x - state.fx;
      const dz = t.z - state.fz;
      const d = Math.hypot(dx, dz);
      if (d > dead) { state.fx += (dx / d) * (d - dead); state.fz += (dz / d) * (d - dead); }
      const D = 24;
      return {
        pos: { x: state.fx + ISO.x * D, y: ISO.y * D, z: state.fz + ISO.z * D },
        look: { x: state.fx, y: 0, z: state.fz }, fov: 36,
      };
    }
    case 'chase':
      return {
        pos: { x: t.x - Math.sin(h) * 8, y: t.y + 3.6, z: t.z - Math.cos(h) * 8 },
        look: { x: t.x + Math.sin(h) * 6, y: t.y + 1.2, z: t.z + Math.cos(h) * 6 }, fov: 62,
      };
    case 'top':
      return {
        pos: { x: t.x, y: t.y + 26, z: t.z + 6 },
        look: { x: t.x + Math.sin(h) * sp * 0.15, y: t.y, z: t.z + Math.cos(h) * sp * 0.15 }, fov: 40,
      };
    case 'iso-follow':
    default: {
      const D = 16;
      const lx = t.x + Math.sin(h) * sp * 0.18;
      const lz = t.z + Math.cos(h) * sp * 0.18;
      return {
        pos: { x: lx + ISO.x * D, y: t.y + ISO.y * D, z: lz + ISO.z * D },
        look: { x: lx, y: t.y, z: lz }, fov: 38,
      };
    }
  }
}
