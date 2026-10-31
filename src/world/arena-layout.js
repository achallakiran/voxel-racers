// Sandbox arena for Phase 1: a round dirt bowl with kickers, a tabletop, whoops, hills,
// boulders and tire stacks. Pure data + height function (no three.js) so physics and tests
// share exactly what the renderer draws.
//
// Heading convention (whole game): forward = (sin h, cos h). A ramp's `rot` is the heading you
// drive up it with; `u` runs along that direction, `v` across.

export const SANDBOX = {
  radius: 45,                 // drivable radius (tire wall sits just outside)
  wallRadius: 46.6,
  start: { x: 19.8, z: 19.8, heading: -3 * Math.PI / 4 }, // faces the first kicker, "up" on the iso screen
};

const D = Math.SQRT1_2;
const diag = (t) => ({ x: t * D, z: t * D });

// piecewise-linear height profiles along u
const KICKER = (len, h) => [[0, 0], [len, h], [len + 0.4, 0]];
const LANDING = (len, h) => [[0, h], [len, 0]];
const TABLE = [[0, 0], [7, 2.4], [13, 2.4], [20, 0]];

export const FEATURES = [
  { type: 'ramp', kind: 'ramp', ...diag(15), rot: -3 * Math.PI / 4, w: 7, profile: KICKER(8, 2.0) },     // K1
  { type: 'ramp', kind: 'ramp', ...diag(1), rot: -3 * Math.PI / 4, w: 8, profile: LANDING(10, 1.3) },    // K1 landing
  { type: 'ramp', kind: 'table', x: -24, z: 5, rot: 0, w: 8, profile: TABLE },                           // tabletop
  { type: 'ramp', kind: 'ramp', x: -8, z: -30, rot: Math.PI / 2, w: 7, profile: KICKER(9, 3.0) },        // big kicker
  { type: 'ramp', kind: 'ramp', x: 11, z: -30, rot: Math.PI / 2, w: 9, profile: LANDING(11, 1.6) },      // its landing
  { type: 'whoops', kind: 'whoops', x: -22, z: -18, rot: 0, len: 18, w: 6, amp: 0.5, wave: 3 },
  { type: 'hill', kind: 'hill', x: -6, z: 31, r: 10, h: 3.6 },
  { type: 'hill', kind: 'hill', x: 31, z: 4, r: 8, h: 2.6 },
  { type: 'hill', kind: 'hill', x: -22, z: -33, r: 7, h: 2.0 },
];

// Solid obstacles. Jump high enough (y > h) and you fly over them.
export const OBSTACLES = [
  { type: 'boulder', x: -30, z: 20, r: 1.8, h: 1.6 },
  { type: 'boulder', x: 33, z: -22, r: 2.2, h: 2.0 },
  { type: 'boulder', x: 10, z: -14, r: 1.5, h: 1.3 },
  { type: 'boulder', x: -34, z: -4, r: 1.6, h: 1.4 },
  { type: 'boulder', x: 26, z: 32, r: 1.7, h: 1.5 },
  { type: 'stack', x: 5, z: -20, r: 0.9, h: 0.9 },
  { type: 'stack', x: 6.2, z: -20.6, r: 0.9, h: 0.9 },
  { type: 'stack', x: 4.0, z: -20.8, r: 0.9, h: 0.9 },
  { type: 'stack', x: -14, z: 8, r: 0.9, h: 0.9 },
  { type: 'stack', x: -15.2, z: 8.6, r: 0.9, h: 0.9 },
  { type: 'stack', x: 20, z: -2, r: 0.9, h: 0.9 },
  { type: 'stack', x: 8, z: 34, r: 0.9, h: 0.9 },
];

function profileAt(profile, u) {
  if (u < profile[0][0] || u > profile[profile.length - 1][0]) return 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [u0, h0] = profile[i];
    const [u1, h1] = profile[i + 1];
    if (u >= u0 && u <= u1) return u1 === u0 ? h1 : h0 + (h1 - h0) * ((u - u0) / (u1 - u0));
  }
  return 0;
}

function featureHeight(f, x, z) {
  if (f.type === 'hill') {
    const d = Math.hypot(x - f.x, z - f.z);
    return d >= f.r ? 0 : f.h * 0.5 * (1 + Math.cos(Math.PI * d / f.r));
  }
  const dx = x - f.x;
  const dz = z - f.z;
  const s = Math.sin(f.rot);
  const c = Math.cos(f.rot);
  const u = dx * s + dz * c;
  const v = dx * c - dz * s;
  if (Math.abs(v) > f.w / 2) return 0;
  if (f.type === 'ramp') return profileAt(f.profile, u);
  if (f.type === 'whoops') {
    if (u < 0 || u > f.len) return 0;
    return f.amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * u) / f.wave));
  }
  return 0;
}

// Ground height at (x, z) and which feature kind made it.
export function sample(x, z) {
  let h = 0;
  let kind = null;
  for (const f of FEATURES) {
    const fh = featureHeight(f, x, z);
    if (fh > h) { h = fh; kind = f.kind; }
  }
  return { h, kind };
}

export function heightAt(x, z) {
  let h = 0;
  for (const f of FEATURES) {
    const fh = featureHeight(f, x, z);
    if (fh > h) h = fh;
  }
  return h;
}

export const terrain = { heightAt, obstacles: OBSTACLES, radius: SANDBOX.radius };

// Voxel columns for the renderer: one stretched box per cell whose top is the height at the cell centre.
export function terrainColumns(step = 0.5) {
  const out = [];
  const R = SANDBOX.radius;
  for (let ix = -Math.ceil(R / step); ix < Math.ceil(R / step); ix++) {
    for (let iz = -Math.ceil(R / step); iz < Math.ceil(R / step); iz++) {
      const x = (ix + 0.5) * step;
      const z = (iz + 0.5) * step;
      const { h, kind } = sample(x, z);
      if (h > 0.04) out.push({ x, z, h, kind, step, shade: (ix + iz) & 1 });
    }
  }
  return out;
}

// Tire wall around the bowl.
export function wallRing(spacing = 0.95) {
  const n = Math.round((2 * Math.PI * SANDBOX.wallRadius) / spacing);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * SANDBOX.wallRadius, z: Math.sin(a) * SANDBOX.wallRadius, rot: -a, c: i % 9 === 4 ? 1 : (i % 14 === 9 ? 2 : 0) });
  }
  return out;
}
