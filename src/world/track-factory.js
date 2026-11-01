// Track factory: builds a closed race track from a definition. Pure data + functions (no three.js), so the physics,
// race logic, AI, renderer and tests all share exactly the same track.
//
// A track has: a closed centre line (Catmull-Rom, resampled evenly), elevation, surface sections, jumps/whoops/bumps/pits,
// solid roadside obstacles, WALL PASSAGES (corridors, islands, slaloms, with smashable gates), LOOPS (vertical rings) and
// breakable props. Heading convention (whole game): forward = (sin h, cos h).
import { featureHeight } from './arena-layout.js';
import { rng } from './layout.js';
import { DEFS as PROP_DEFS } from './props.js';

export const ROAD_HALF = 7;       // road is 14 wide
export const SHOULDER = 7;        // strip between road edge and barrier
export const BARRIER = ROAD_HALF + SHOULDER;
const SPACING = 2;
const CELL = 30;
const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

function buildCenterline(ctrl) {
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

export function makeTrack(def) {
  const { pts, length: LENGTH, ds: DS } = buildCenterline(def.ctrl());
  const N = pts.length;
  const START_S = def.startS ?? 0.985;
  const CHECKPOINTS = def.checkpoints ?? [0, 0.25, 0.5, 0.75];

  // raw centre line lookup (before elevation exists), used to place loops and find straights
  const rawAt = (s) => {
    const f = (((s % 1) + 1) % 1) * N; const i = Math.floor(f); const t = f - i;
    const a = pts[i % N]; const b = pts[(i + 1) % N];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  // the straightest stretch of `len` units whose start is within +-win of lap fraction s
  function straightNear(s, len, win = 0.05) {
    let best = s; let bestDev = 1e9;
    const span = len / LENGTH;
    for (let c = s - win; c <= s + win; c += 0.002) {
      const a = rawAt(c); const b = rawAt(c + span);
      const dx = b.x - a.x; const dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1;
      let dev = 0;
      for (let k = 1; k < 10; k++) { const p = rawAt(c + span * k / 10); dev = Math.max(dev, Math.abs((p.x - a.x) * dz / l - (p.z - a.z) * dx / l)); }
      if (dev < bestDev) { bestDev = dev; best = c; }
    }
    return ((best % 1) + 1) % 1;
  }

  // ---- loops (vertical rings on straight stretches)
  const LOOPS = [];
  for (const spec of (def.loops ? def.loops({ straightNear, LENGTH }) : [])) {
    const R = spec.R ?? 9; const k = spec.k ?? 1.7;
    const len = 2 * Math.PI * k;
    const s0 = spec.s;
    const a = rawAt(s0); const b = rawAt(s0 + len / LENGTH);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // side-to-side loop: enter on one lane (default left), ride the ring, exit on the other lane
    const rw = (ROAD_HALF - 0.8) / 2;
    const c0 = (spec.side ?? -1) * (rw + 0.1);
    LOOPS.push({
      s: s0, endS: s0 + len / LENGTH, len, R, k, x: a.x, z: a.z, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l,
      y0: def.elevation(s0), halfW: rw, c0, c1: -c0, vmin: spec.vmin ?? 22, gl: 9,
    });
  }
  // the road is level under and around each loop so the ring and the road agree
  function elevation(s) {
    let y = def.elevation(s);
    for (const L of LOOPS) {
      const m = 0.012;
      const w = Math.min(smooth((s - (L.s - m * 2)) / m), 1 - smooth((s - L.endS) / m));
      if (w > 0) y += (L.y0 - y) * w;
    }
    return y;
  }

  const SAMPLES = pts.map((p, i) => {
    const q = pts[(i + 1) % N];
    const o = pts[(i + N - 1) % N];
    let tx = q.x - o.x; let tz = q.z - o.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const s = i / N;
    return { x: p.x, z: p.z, y: elevation(s), tx, tz, s, i };
  });

  const SECTIONS = def.sections;

  // ---- spatial grid for nearest-sample queries
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
    const tx = a.tx + (b.tx - a.tx) * t; const tz = a.tz + (b.tz - a.tz) * t;
    const side = (x - px) * tz - (z - pz) * tx;          // + = right-hand side when facing (tx,tz)
    return { dist, t, px, pz, tx, tz, side };
  }

  // Nearest point on the centreline: { i, t, dist, d (signed lateral, + right), s (0..1), px, pz, tx, tz, y }
  function nearest(x, z) {
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
    const sA = a.s; let sB = b.s;
    if (sB < sA) sB += 1;
    best.s = (sA + (sB - sA) * best.t) % 1;
    best.y = a.y + (b.y - a.y) * best.t;
    best.d = best.side >= 0 ? best.dist : -best.dist;
    return best;
  }

  function sampleAt(s) {
    const f = (((s % 1) + 1) % 1) * N;
    const i = Math.floor(f);
    const t = f - i;
    const a = SAMPLES[i % N];
    const b = SAMPLES[(i + 1) % N];
    const tx = a.tx + (b.tx - a.tx) * t; const tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, tz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx: tx / l, tz: tz / l, s };
  }
  const headingAt = (s) => { const p = sampleAt(s); return Math.atan2(p.tx, p.tz); };

  const natural = def.natural || ((x, z) => Math.max(0.2, 2.4 + 1.3 * Math.sin(x * 0.045) * Math.cos(z * 0.05) + 1.0 * Math.sin((x + z) * 0.03 + 1) + 0.5 * Math.sin(x * 0.11 + z * 0.07)));

  // ---- helpers handed to the definition so tracks are written in track terms (lap fraction + lateral offset)
  const feat = (s, type, extra) => { const p = sampleAt(s); return { type, x: p.x, z: p.z, rot: Math.atan2(p.tx, p.tz), ...extra }; };
  const kicker = (len, h) => [[0, 0], [len, h], [len + 0.4, 0]];
  const landing = (len, h) => [[0, h], [len, 0]];
  const lateral = (s, off, extra) => { const p = sampleAt(s); return { x: p.x + p.tz * off, z: p.z - p.tx * off, ...extra }; };
  const JUMP = (s, h, len) => [
    feat(s, 'ramp', { kind: 'ramp', w: 11, profile: kicker(len, h) }),
    feat(s + (len + 7) / LENGTH, 'ramp', { kind: 'ramp', w: 12, profile: landing(18, 1.0) }),
  ];
  const T = { LENGTH, sampleAt, feat, kicker, landing, lateral, JUMP, rng, straightNear, loops: LOOPS, ROAD_HALF };

  const FEATURES = def.features(T);

  function bumpHeight(f, x, z) { const d = Math.hypot(x - f.x, z - f.z); return d >= f.r ? 0 : f.h * 0.5 * (1 + Math.cos(Math.PI * d / f.r)); }
  function pitDepth(f, x, z) { const d = Math.hypot(x - f.x, z - f.z); return d >= f.r ? 0 : f.depth * 0.5 * (1 + Math.cos(Math.PI * d / f.r)); }
  function featureSum(x, z) {
    let up = 0; let down = 0;
    for (const f of FEATURES) {
      if (f.type === 'pit') { const d = pitDepth(f, x, z); if (d > down) down = d; }
      else if (f.type === 'bump') { const v = bumpHeight(f, x, z); if (v > up) up = v; }
      else { const v = featureHeight(f, x, z); if (v > up) up = v; }
    }
    return up - down;
  }
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
  function sample(x, z) {
    const n = nearest(x, z);
    const ad = Math.abs(n.d);
    const nat = natural(x, z);
    const blend = smooth((ad - ROAD_HALF) / 10);
    const base = Math.max(0.1, n.y + (nat - 2.6) * blend);
    const f = ad < ROAD_HALF + 4 ? featureSum(x, z) : 0;
    const onRoad = ad <= ROAD_HALF;
    return {
      h: Math.max(0.1, base + f), surf: onRoad ? surfaceFor(n.s) : 'grass', s: n.s, d: n.d, ad, onRoad, feature: Math.abs(f) > 0.05, featKind: featureKind(x, z), nearest: n,
    };
  }
  const heightAt = (x, z) => sample(x, z).h;
  const surfaceAt = (x, z) => sample(x, z).surf;

  // Barrier on both sides of the track. Returns a push-back (position + outward normal) or null.
  function constrain(x, z, radius = 1.3) {
    const n = nearest(x, z);
    const limit = BARRIER - radius - 0.3;
    if (Math.abs(n.d) <= limit) return null;
    const out = n.d >= 0 ? 1 : -1;
    const nx = n.tz * out;
    const nz = -n.tx * out;
    return { x: n.px + nx * limit, z: n.pz + nz * limit, nx, nz };
  }

  // ---- wall passages: solid brick/stone circles in lines, plus smashable gates. They also tell the AI where it may drive.
  const WALLS = [];
  const PROPS = [];
  const LANES = [];     // { from, to (lap fractions), limit (max |offset| for AI), off (forced offset or null) }
  let propId = 0;
  const wallAt = (x, z, rot, kind, h = 3.0) => WALLS.push({ type: 'wall', kind, x, z, r: 1.05, h, rot });
  const wallLine = (s, len, off, kind) => {          // a straight wall along the road at lateral offset `off`
    for (let d = 0; d <= len; d += 1.5) { const p = sampleAt(s + d / LENGTH); wallAt(p.x + p.tz * off, p.z - p.tx * off, Math.atan2(p.tx, p.tz), kind); }
  };
  const W = {
    // two walls squeezing the road to `gap` wide for `len` units
    corridor(s, len, gap, kind = 'brick') {
      wallLine(s, len, gap / 2 + 1, kind); wallLine(s, len, -(gap / 2 + 1), kind);
      LANES.push({ from: s - 6 / LENGTH, to: s + (len + 4) / LENGTH, limit: Math.max(0.6, gap / 2 - 1.9), off: null });
    },
    // a wall down the middle splitting the road into two lanes (one lane can be shut by a smashable gate)
    island(s, len, kind = 'brick', gateSide = 0) {
      wallLine(s, len, 0, kind);
      LANES.push({ from: s - 6 / LENGTH, to: s + (len + 4) / LENGTH, limit: 2.2, off: gateSide ? -gateSide * 3.6 : 3.6 });
      if (gateSide) {                                    // gate across the lane on `gateSide` (+ right)
        const p = sampleAt(s - 3 / LENGTH);
        for (const o of [gateSide * 2.4, gateSide * 5.2]) PROPS.push({ id: propId++, type: 'wall', tier: 'break', ...lateral(s - 3 / LENGTH, o, {}), r: PROP_DEFS.wall.r, h: PROP_DEFS.wall.h, hp: PROP_DEFS.wall.hp, rot: Math.atan2(p.tx, p.tz) + Math.PI / 2, color: '#a9553a' });
      }
    },
    // alternating blocks you have to weave around
    slalom(s, count, spacing, kind = 'brick') {
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const sp = s + (i * spacing) / LENGTH;
        const p = sampleAt(sp);
        for (const o of [4.2, 5.8, 7.4]) wallAt(p.x + p.tz * side * o - 0, p.z - p.tx * side * o, Math.atan2(p.tx, p.tz), kind, 2.6);
        LANES.push({ from: sp - 7 / LENGTH, to: sp + 7 / LENGTH, limit: 3.2, off: -side * 2.6 });
      }
    },
    // loose smashables on the road
    crates(s, off, n = 3) { for (let i = 0; i < n; i++) PROPS.push({ id: propId++, type: 'crate', tier: 'smash', ...lateral(s + (i * 2.4) / LENGTH, off + (i % 2 ? 1.1 : -1.1), {}), r: 0.8, h: 0.8, hp: 1, breakAt: PROP_DEFS.crate.breakAt, rot: i, color: PROP_DEFS.crate.colors[i % 3] }); },
    barrels(s, off, n = 3) { for (let i = 0; i < n; i++) PROPS.push({ id: propId++, type: 'barrel', tier: 'smash', ...lateral(s + (i * 2.2) / LENGTH, off + (i % 2 ? 0.9 : -0.9), {}), r: 0.6, h: 1.0, hp: 1, breakAt: PROP_DEFS.barrel.breakAt, rot: i, color: PROP_DEFS.barrel.colors[i % 3] }); },
    tnt(s, off) { PROPS.push({ id: propId++, type: 'tnt', tier: 'blast', ...lateral(s, off, {}), r: 0.8, h: 0.9, hp: 1, breakAt: PROP_DEFS.tnt.breakAt, rot: 0, color: '#d62828' }); },
  };
  if (def.walls) def.walls({ ...T, W });

  // the ground under each ring is filled with solid stone blocks that follow the underside of the ring, so the only way
  // through is to ride the loop: in on the entry lane, out on the other one
  const BLOCKS = [];
  for (const L of LOOPS) {
    const ringFwd = (th) => L.R * Math.sin(th) + L.k * th;
    const ringAt = (target) => { let lo = 0; let hi = 1.76; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ringFwd(mid) < target) lo = mid; else hi = mid; } return L.R * (1 - Math.cos(lo)); };
    const hd = Math.atan2(L.tx, L.tz);
    for (let f = 1.6; f <= L.len - 1.0; f += 1.5) {
      for (const lane of [0, 1]) {
        const c = lane ? L.c1 : L.c0;
        const ry = lane ? ringAt(L.len - f) : ringAt(f);      // exit lane sits under the descending arc
        const h = Math.min(4.2, ry - 1.2);
        if (h < 0.8) { if (!lane) for (const lat of [-0.95, 0.95]) BLOCKS.push({ type: 'wall', kind: 'plinth', x: L.x + L.tx * f + L.tz * lat, z: L.z + L.tz * f - L.tx * lat, r: 1.05, h: 2.2, rot: hd }); continue; }
        for (let i = 0; i < 4; i++) {
          const lat = c - L.halfW + 0.85 + (i * (L.halfW * 2 - 1.7)) / 3;
          BLOCKS.push({ type: 'wall', kind: 'plinth', x: L.x + L.tx * f + L.tz * lat, z: L.z + L.tz * f - L.tx * lat, r: 1.05, h, rot: hd });
        }
      }
    }
  }

  for (const L of LOOPS) {
    LANES.push({ from: L.s - 22 / LENGTH, to: L.endS - 1 / LENGTH, limit: 1.4, off: L.c0 });
    LANES.push({ from: L.endS - 1 / LENGTH, to: L.endS + 10 / LENGTH, limit: 3.2, off: L.c1 });
  }

  const OBSTACLES = def.obstacles ? def.obstacles({ ...T, ROAD_HALF, SHOULDER }) : [];
  // obstacle heights are measured from the ground they stand on
  for (const o of [...OBSTACLES, ...WALLS, ...BLOCKS, ...PROPS]) o.y0 = heightAt(o.x, o.z);

  // AI lane guidance: the allowed lateral offset (and a forced offset in slaloms / islands) at a lap fraction
  function laneAt(s) {
    const q = ((s % 1) + 1) % 1;
    let limit = ROAD_HALF - 2; let off = null;
    for (const z of LANES) {
      if ((q >= z.from && q <= z.to) || (q + 1 >= z.from && q + 1 <= z.to)) { limit = Math.min(limit, z.limit); if (z.off !== null) off = z.off; }
    }
    return { limit, off };
  }

  function sceneryLayout() {
    const rand = rng(77);
    const out = [];
    const kinds = def.scenery || ['pine', 'round'];
    for (let i = 0; i < (def.sceneryCount ?? 520); i++) {
      const s = rand();
      const side = rand() < 0.5 ? -1 : 1;
      const off = BARRIER + 3 + rand() * 40;
      const p = sampleAt(s);
      const x = p.x + p.tz * side * off + (rand() - 0.5) * 6;
      const z = p.z - p.tx * side * off + (rand() - 0.5) * 6;
      const n = nearest(x, z);
      if (Math.abs(n.d) < BARRIER + 2) continue;
      out.push({ x, z, y: heightAt(x, z), type: rand() < 0.65 ? kinds[0] : kinds[1], scale: 0.8 + rand() * 0.9, tint: rand() });
    }
    return out;
  }

  function barrierLayout(spacing = 1.6) {
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

  const startPose = () => { const p = sampleAt(START_S); return { x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz), y: p.y }; };
  // starting grid: 2 columns, rows 9 units apart behind the line
  const gridPose = (slot) => {
    const row = Math.floor(slot / 2);
    const lane = slot % 2 === 0 ? -3 : 3;
    const p = sampleAt(START_S - (row * 9) / LENGTH);
    return { x: p.x + p.tz * lane, z: p.z - p.tx * lane, heading: Math.atan2(p.tx, p.tz), s: START_S - (row * 9) / LENGTH };
  };

  const terrain = { heightAt, surfaceAt, constrain, obstacles: [...OBSTACLES, ...WALLS, ...BLOCKS, ...PROPS], props: PROPS, loops: LOOPS, radius: 1e9 };
  // a fresh playable copy for one race (smashed props come back next time)
  function freshTerrain() {
    const props = PROPS.map((p) => ({ ...p }));
    return { ...terrain, obstacles: [...OBSTACLES, ...WALLS, ...BLOCKS, ...props], props };
  }

  return {
    id: def.id, name: def.name, theme: def.theme, ROAD_HALF, SHOULDER, BARRIER,
    LENGTH, DS, SAMPLES, SECTIONS, CHECKPOINTS, START_S, FEATURES, OBSTACLES, WALLS, BLOCKS, PROPS, LOOPS, LANES,
    nearest, sampleAt, headingAt, sample, heightAt, surfaceAt, constrain, laneAt, straightNear,
    sceneryLayout, barrierLayout, startPose, gridPose, terrain, freshTerrain, featureHeightAt: featureHeight,
    TRACK: { name: def.name, length: LENGTH, halfWidth: ROAD_HALF, barrier: BARRIER, samples: SAMPLES, checkpoints: CHECKPOINTS },
  };
}
