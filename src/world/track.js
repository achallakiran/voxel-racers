// Race track "Greenridge Run": a closed, bounded loop with a real road (asphalt and dirt sections,
// a mud strip), grass shoulders, hills, jumps, whoops and rumble logs, fenced by barriers.
// Pure data + functions (no three.js) so the physics, race logic and tests all share it.
//
// Heading convention (whole game): forward = (sin h, cos h).

import { featureHeight } from './arena-layout.js';
import { rng } from './layout.js';

export const ROAD_HALF = 7;       // road is 14 wide
export const SHOULDER = 7;        // grass strip between road edge and barrier
export const BARRIER = ROAD_HALF + SHOULDER;

const CTRL_COUNT = 18;
const SPACING = 2;

// closed Catmull-Rom through the control points, resampled to even spacing
function buildCenterline() {
  const ctrl = [];
  for (let k = 0; k < CTRL_COUNT; k++) {
    const th = (2 * Math.PI * k) / CTRL_COUNT;
    const r = 1 + 0.13 * Math.sin(3 * th + 0.6) + 0.05 * Math.sin(5 * th + 1.3);
    ctrl.push({ x: 135 * Math.cos(th) * r, z: 88 * Math.sin(th) * r });
  }
  const dense = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i + n - 1) % n]; const p1 = ctrl[i]; const p2 = ctrl[(i + 1) % n]; const p3 = ctrl[(i + 2) % n];
    for (let t = 0; t < 1; t += 1 / 40) {
      const t2 = t * t; const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]; const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cum[cum.length - 1];
  const m = Math.round(total / SPACING);
  const ds = total / m;
  const out = [];
  let j = 0;
  for (let i = 0; i < m; i++) {
    const target = i * ds;
    while (cum[j + 1] < target) j++;
    const a = dense[j]; const b = dense[(j + 1) % dense.length];
    const f = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return { pts: out, length: total, ds };
}

const { pts, length: LENGTH, ds: DS } = buildCenterline();
const N = pts.length;

// elevation along the track (always above the ground floor)
function elevation(s) {
  return 3.4 + 1.1 * Math.sin(2 * Math.PI * 2 * s + 0.7) + 0.6 * Math.sin(2 * Math.PI * 5 * s + 0.3);
}

export const SAMPLES = pts.map((p, i) => {
  const q = pts[(i + 1) % N];
  const o = pts[(i + N - 1) % N];
  let tx = q.x - o.x; let tz = q.z - o.z;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l; tz /= l;
  const s = i / N;
  return { x: p.x, z: p.z, y: elevation(s), tx, tz, s, i };
});

// surface by lap fraction along the road
export const SECTIONS = [
  { from: 0.0, to: 0.14, surf: 'asphalt' },
  { from: 0.14, to: 0.29, surf: 'dirt' },
  { from: 0.29, to: 0.43, surf: 'sand' },
  { from: 0.43, to: 0.56, surf: 'asphalt' },
  { from: 0.56, to: 0.67, surf: 'dirt' },
  { from: 0.67, to: 0.73, surf: 'mud' },
  { from: 0.73, to: 0.83, surf: 'asphalt' },
  { from: 0.83, to: 0.93, surf: 'dirt' },
  { from: 0.93, to: 1.0, surf: 'asphalt' },
];

export const CHECKPOINTS = [0, 0.25, 0.5, 0.75];

// ---- spatial grid for nearest-sample queries
const CELL = 30;
const grid = new Map();
const gk = (cx, cz) => `${cx},${cz}`;
for (const p of SAMPLES) {
  const k = gk(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(p.i);
}

function segInfo(x, z, i) {
  const a = SAMPLES[i];
  const b = SAMPLES[(i + 1) % N];
  const sx = b.x - a.x; const sz = b.z - a.z;
  const l2 = sx * sx + sz * sz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / l2));
  const px = a.x + sx * t; const pz = a.z + sz * t;
  const dist = Math.hypot(x - px, z - pz);
  // signed lateral offset: + to the left of travel direction (left normal = (-tz... ) in our frame)
  const tx = a.tx + (b.tx - a.tx) * t; const tz = a.tz + (b.tz - a.tz) * t;
  const side = (x - px) * tz - (z - pz) * tx;          // + = right-hand side when facing (tx,tz)
  return { dist, t, px, pz, tx, tz, side };
}

// Nearest point on the centreline: { i, t, dist, d (signed lateral, + right), s (0..1), px, pz, tx, tz, y }
export function nearest(x, z) {
  const cx = Math.floor(x / CELL); const cz = Math.floor(z / CELL);
  let best = null;
  const consider = (i) => {
    const info = segInfo(x, z, i);
    if (!best || info.dist < best.dist) best = { ...info, i };
  };
  for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
    const list = grid.get(gk(cx + ax, cz + az));
    if (list) for (const i of list) { consider(i); consider((i + N - 1) % N); }
  }
  if (!best || best.dist > CELL - 2) for (let i = 0; i < N; i++) consider(i);
  const a = SAMPLES[best.i];
  const b = SAMPLES[(best.i + 1) % N];
  let sA = a.s; let sB = b.s;
  if (sB < sA) sB += 1;
  best.s = (sA + (sB - sA) * best.t) % 1;
  best.y = a.y + (b.y - a.y) * best.t;
  best.d = best.side >= 0 ? best.dist : -best.dist;
  return best;
}

export function sampleAt(s) {
  const f = ((s % 1) + 1) % 1 * N;
  const i = Math.floor(f);
  const t = f - i;
  const a = SAMPLES[i % N];
  const b = SAMPLES[(i + 1) % N];
  const tx = a.tx + (b.tx - a.tx) * t; const tz = a.tz + (b.tz - a.tz) * t;
  const l = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx: tx / l, tz: tz / l, s };
}

export const headingAt = (s) => { const p = sampleAt(s); return Math.atan2(p.tx, p.tz); };

// ---- natural terrain beyond the road: gentle rolling hills
function natural(x, z) {
  const h = 2.4 + 1.3 * Math.sin(x * 0.045) * Math.cos(z * 0.05) + 1.0 * Math.sin((x + z) * 0.03 + 1) + 0.5 * Math.sin(x * 0.11 + z * 0.07);
  return Math.max(0.2, h);
}
const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

// ---- road features (jumps, whoops, logs), placed from the track frame
function feat(s, type, extra) {
  const p = sampleAt(s);
  return { type, x: p.x, z: p.z, rot: Math.atan2(p.tx, p.tz), ...extra };
}
const kicker = (len, h) => [[0, 0], [len, h], [len + 0.4, 0]];
const landing = (len, h) => [[0, h], [len, 0]];
const log = [[0, 0], [0.3, 0.5], [0.9, 0.5], [1.2, 0]];

// every feature starts at its sample's position and extends forward (u >= 0)
const lateral = (s, off, extra) => { const p = sampleAt(s); return { x: p.x + p.tz * off, z: p.z - p.tx * off, ...extra }; };

// gentle landing slopes (never a cliff): any short jump just rolls out
const JUMP = (s, h, len) => [
  feat(s, 'ramp', { kind: 'ramp', w: 11, profile: kicker(len, h) }),
  feat(s + (len + 7) / LENGTH, 'ramp', { kind: 'ramp', w: 12, profile: landing(18, 1.0) }),
];
const rockRand = rng(5);
const rocks = [];
for (let i = 0; i < 26; i++) {      // rock garden on the dirt section
  const s = 0.57 + rockRand() * 0.095;
  rocks.push(lateral(s, (rockRand() - 0.5) * 11, { type: 'bump', kind: 'rock', r: 1.2 + rockRand() * 1.3, h: 0.35 + rockRand() * 0.65 }));
}
const pits = [
  lateral(0.745, -2.5, { type: 'pit', kind: 'pit', r: 4.6, depth: 1.5 }),    // massive pothole, left lane
  lateral(0.765, 3.0, { type: 'pit', kind: 'pit', r: 3.0, depth: 1.1 }),
  lateral(0.785, -3.5, { type: 'pit', kind: 'pit', r: 3.4, depth: 1.2 }),
  lateral(0.8, 2.5, { type: 'pit', kind: 'pit', r: 2.4, depth: 0.9 }),
  lateral(0.815, -1.0, { type: 'pit', kind: 'pit', r: 2.8, depth: 1.0 }),
];

export const FEATURES = [
  ...JUMP(0.07, 2.4, 9),
  feat(0.31, 'whoops', { kind: 'whoops', len: 34, w: 11, amp: 0.7, wave: 4.5 }),       // sand dunes
  ...JUMP(0.49, 3.0, 10),
  ...rocks,
  ...pits,
  feat(0.865, 'ramp', { kind: 'log', w: 12, profile: log }),
  feat(0.865 + 7 / LENGTH, 'ramp', { kind: 'log', w: 12, profile: log }),
  feat(0.865 + 14 / LENGTH, 'ramp', { kind: 'log', w: 12, profile: log }),
];

function bumpHeight(f, x, z) {
  const d = Math.hypot(x - f.x, z - f.z);
  return d >= f.r ? 0 : f.h * 0.5 * (1 + Math.cos(Math.PI * d / f.r));
}
function pitDepth(f, x, z) {
  const d = Math.hypot(x - f.x, z - f.z);
  return d >= f.r ? 0 : f.depth * 0.5 * (1 + Math.cos(Math.PI * d / f.r));
}

function featureSum(x, z) {
  let up = 0;
  let down = 0;
  for (const f of FEATURES) {
    if (f.type === 'pit') { const d = pitDepth(f, x, z); if (d > down) down = d; }
    else if (f.type === 'bump') { const v = bumpHeight(f, x, z); if (v > up) up = v; }
    else { const v = featureHeight(f, x, z); if (v > up) up = v; }
  }
  return up - down;
}

// which kind of feature (for colouring) is at this spot
function featureKind(x, z) {
  let best = null; let bestV = 0.05;
  for (const f of FEATURES) {
    let v = 0;
    if (f.type === 'pit') v = pitDepth(f, x, z);
    else if (f.type === 'bump') v = bumpHeight(f, x, z);
    else v = featureHeight(f, x, z);
    if (v > bestV) { bestV = v; best = f.kind; }
  }
  return best;
}

function surfaceFor(s) {
  for (const sec of SECTIONS) if (s >= sec.from && s < sec.to) return sec.surf;
  return 'asphalt';
}

// Height + surface in one lookup (used by physics and by the mesh builder)
export function sample(x, z) {
  const n = nearest(x, z);
  const ad = Math.abs(n.d);
  const nat = natural(x, z);
  const road = n.y;
  // beyond the road the ground only rolls gently around the road height, so there are no steep embankments
  const blend = smooth((ad - ROAD_HALF) / 10);
  const base = Math.max(0.1, road + (nat - 2.6) * blend);
  const f = ad < ROAD_HALF + 4 ? featureSum(x, z) : 0;
  const onRoad = ad <= ROAD_HALF;
  return {
    h: Math.max(0.1, base + f), surf: onRoad ? surfaceFor(n.s) : 'grass', s: n.s, d: n.d, ad, onRoad, feature: Math.abs(f) > 0.05, featKind: featureKind(x, z), nearest: n,
  };
}

export const heightAt = (x, z) => sample(x, z).h;
export const surfaceAt = (x, z) => sample(x, z).surf;

// Barrier on both sides of the track. Returns a push-back (position + outward normal) or null.
export function constrain(x, z, radius = 1.3) {
  const n = nearest(x, z);
  const limit = BARRIER - radius - 0.3;
  if (Math.abs(n.d) <= limit) return null;
  const out = n.d >= 0 ? 1 : -1;
  // right-hand normal of travel direction (tx,tz) is (tz,-tx)
  const nx = n.tz * out;
  const nz = -n.tx * out;
  return { x: n.px + nx * limit, z: n.pz + nz * limit, nx, nz };
}

// ---- roadside obstacles (rocks on the shoulders you can hit) and scenery
function buildObstacles() {
  const rand = rng(21);
  const out = [];
  for (let i = 0; i < 46; i++) {
    const s = rand();
    const side = rand() < 0.5 ? -1 : 1;
    const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
    const p = sampleAt(s);
    // skip the start/finish area
    if (s < 0.02 || s > 0.98) continue;
    const x = p.x + p.tz * side * off;
    const z = p.z - p.tx * side * off;
    const type = rand() < 0.6 ? 'boulder' : 'stack';
    out.push(type === 'boulder' ? { type, x, z, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 } : { type, x, z, r: 0.9, h: 0.9 });
  }
  // crushed-car piles on the shoulders and a tyre chicane you have to weave through
  for (const [s, side] of [[0.12, 1], [0.25, -1], [0.37, 1], [0.52, -1], [0.62, 1], [0.7, -1], [0.88, 1], [0.95, -1]]) {
    const p = sampleAt(s);
    const off = ROAD_HALF + 2.6;
    out.push({ type: 'car', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.7, h: 0.9, rot: s * 10 });
  }
  for (const [s, off] of [[0.2, -3.5], [0.2 + 12 / LENGTH, 3.5], [0.2 + 24 / LENGTH, -3.5]]) {
    const p = sampleAt(s);
    for (let k = 0; k < 2; k++) out.push({ type: 'stack', x: p.x + p.tz * (off + k * 1.1 * Math.sign(off)), z: p.z - p.tx * (off + k * 1.1 * Math.sign(off)), r: 0.9, h: 0.9 });
  }
  return out;
}
export const OBSTACLES = buildObstacles();

export function sceneryLayout() {
  const rand = rng(77);
  const out = [];
  for (let i = 0; i < 520; i++) {
    const s = rand();
    const side = rand() < 0.5 ? -1 : 1;
    const off = BARRIER + 3 + rand() * 40;
    const p = sampleAt(s);
    const x = p.x + p.tz * side * off + (rand() - 0.5) * 6;
    const z = p.z - p.tx * side * off + (rand() - 0.5) * 6;
    const n = nearest(x, z);
    if (Math.abs(n.d) < BARRIER + 2) continue;
    out.push({ x, z, y: heightAt(x, z), type: rand() < 0.65 ? 'pine' : 'round', scale: 0.8 + rand() * 0.9, tint: rand() });
  }
  return out;
}

export function barrierLayout(spacing = 1.6) {
  const out = [];
  const m = Math.round(LENGTH / spacing);
  for (let i = 0; i < m; i++) {
    const p = sampleAt(i / m);
    for (const side of [-1, 1]) {
      const x = p.x + p.tz * side * (BARRIER - 0.4);
      const z = p.z - p.tx * side * (BARRIER - 0.4);
      out.push({ x, z, y: heightAt(x, z), rot: Math.atan2(p.tx, p.tz), c: Math.floor(i / 2) % 2 });
    }
  }
  return out;
}

export const START_S = 0.985;
export function startPose() {
  const p = sampleAt(START_S);
  return { x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz), y: p.y };
}

// starting grid: 2 columns, rows 8 units apart behind the line
export function gridPose(slot) {
  const row = Math.floor(slot / 2);
  const lane = slot % 2 === 0 ? -3 : 3;
  const p = sampleAt(START_S - (row * 9) / LENGTH);
  return { x: p.x + p.tz * lane, z: p.z - p.tx * lane, heading: Math.atan2(p.tx, p.tz), s: START_S - (row * 9) / LENGTH };
}

export const TRACK = {
  name: 'Greenridge Run', length: LENGTH, halfWidth: ROAD_HALF, barrier: BARRIER,
  samples: SAMPLES, checkpoints: CHECKPOINTS,
};

export const terrain = { heightAt, surfaceAt, constrain, obstacles: OBSTACLES, radius: 1e9 };
export { LENGTH, DS, featureHeight as featureHeightAt };
