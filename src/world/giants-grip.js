// Giant's Grip: a sea-of-clouds mountain sprint. The road climbs a mountain face in hairpins (legs along z, each hairpin
// moves it up the slope), reaches a ridge, then crosses a chasm on a long golden deck held in giant stone hands (16.2) to a
// far ridge and the finish plaza. The deck has no shoulder and its rails have gaps: go over the side and you are put back
// at the last checkpoint (see core/fall.js). The road never crosses over itself in plan (the engine is 2-D), so the bridge
// leaves the hairpins sideways, away from every leg.
export const H = 64;                                    // deck / ridge height
const R_HP = 27.5;                               // hairpin radius (leg spacing 55)
const LEGS = { n: 6, x0: -330, dx: 55, zN: -80, zS: 80, run: 80 };
export const SPAN = { a0: 40, a1: 280, end: 345 };      // metres along the final straight: deck start, deck end, road end

// ---- the path, as a dense polyline (3 m spacing), shared by the road and by the height / bridge maths
function buildPath() {
  const pts = [];
  const line = (a, b) => { const l = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.max(1, Math.round(l / 3)); for (let i = 0; i < n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n }); };
  const arc = (c, r, a0, a1, sgn) => { const n = Math.max(4, Math.round(Math.abs(a1 - a0) * r / 3)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push({ x: c.x + r * Math.cos(a) * sgn.x, z: c.z + r * Math.sin(a) * sgn.z }); } };
  let cur = { x: LEGS.x0, z: LEGS.zS + LEGS.run };
  for (let k = 0; k < LEGS.n; k++) {
    const x = LEGS.x0 + LEGS.dx * k; const north = k % 2 === 0;           // even legs run north (-z), odd legs run south (+z)
    const end = { x, z: north ? LEGS.zN : LEGS.zS };
    line(cur, end);
    if (k < LEGS.n - 1) {
      // a half circle of radius R_HP round to the next leg: bulges beyond the leg end, in the direction of travel
      const c = { x: x + R_HP, z: end.z };
      const dir = north ? -1 : 1;
      for (let i = 0; i < Math.round(Math.PI * R_HP / 3); i++) { const a = Math.PI * i / Math.round(Math.PI * R_HP / 3); pts.push({ x: c.x - R_HP * Math.cos(a), z: c.z + dir * R_HP * Math.sin(a) }); }
      cur = { x: x + 2 * R_HP, z: end.z };
    } else cur = end;
  }
  // last leg runs south; a quarter turn eastwards on to the straight
  const c = { x: cur.x + 30, z: cur.z };
  const nq = Math.round(Math.PI / 2 * 30 / 3);
  for (let i = 0; i < nq; i++) { const a = (Math.PI / 2) * i / nq; pts.push({ x: c.x - 30 * Math.cos(a), z: c.z + 30 * Math.sin(a) }); }
  const P0 = { x: c.x, z: c.z + 30 };
  for (let t = 0; t <= SPAN.end; t += 3) pts.push({ x: P0.x + t, z: P0.z });
  return { pts, P0 };
}
const { pts: PATH, P0: P } = buildPath();
let PLEN = 0; const CUM = [0];
for (let i = 1; i < PATH.length; i++) { PLEN += Math.hypot(PATH[i].x - PATH[i - 1].x, PATH[i].z - PATH[i - 1].z); CUM.push(PLEN); }
export const S_STRAIGHT = CUM[PATH.findIndex((q) => Math.abs(q.z - P.z) < 1e-6 && q.x >= P.x - 1e-6)] / PLEN;   // lap fraction where the final straight begins
export const GRIP_P = P;
export const GRIP_DIR = { x: 1, z: 0 };
const alongOf = (x) => x - P.x;

// the road climbs evenly all the way to the straight, then holds the deck height, with a slight arch over the span
const roadH = (s, p) => {
  if (s < S_STRAIGHT) { const k = s / S_STRAIGHT; return 1 + (H - 1) * k; }
  const t = alongOf(p.x); const k = Math.max(0, Math.min(1, (t - SPAN.a0) / (SPAN.a1 - SPAN.a0)));
  return H + 1.4 * Math.sin(Math.PI * k);
};

// gusts across the deck: every 6.5 s a push builds from one side, then the other
export const GUST = { amp: 13, period: 6.5, from: SPAN.a0 + 12, to: SPAN.a1 - 12 };
export function gustAt(x, z, time) {
  const t = alongOf(x);
  if (t < GUST.from || t > GUST.to || Math.abs(z - P.z) > 30) return null;
  const k = Math.floor(time / GUST.period); const ph = (time / GUST.period) - k;
  const amp = GUST.amp * Math.pow(Math.sin(Math.PI * ph), 2) * (k % 2 ? -1 : 1);
  return { x: 0, z: amp };                                        // across the deck (the deck runs along +x)
}

export const GRIP_DEF = {
  id: 'grip', name: "Giant's Grip", open: true, startS: 0.02, finishS: 0.985,
  theme: { a: [0.5, 0.52, 0.5], b: [0.46, 0.48, 0.46], edge: [0.78, 0.74, 0.62], far: [0.8, 0.88, 1.0], dirt: [0.62, 0.55, 0.45], rut: [0.5, 0.44, 0.36], sand: [0.9, 0.82, 0.62], sky: 'alpine', wall: [0.5, 0.48, 0.45] },
  checkpoints: [0, 0.22, 0.45, 0.68, 0.8, 0.9],
  scenery: ['pine', 'pine'], sceneryCount: 0,
  // the mountain is made relative to the road: the slope side (towards the ridge, +x) rises as a wall from the road's own height,
  // the other side drops away into the clouds; on the ridge and the deck the ground falls away on both sides
  ground: (x, z, n) => {
    if (n.s >= S_STRAIGHT - 0.01) {
      const t = alongOf(x); const ad = Math.abs(n.d);
      if (t >= SPAN.a0 && t <= SPAN.a1) return Math.max(0.1, n.y - 10 - 14 * Math.max(0, ad - 7));   // the chasm: a sheer drop at the deck edge
      return Math.max(0.1, n.y - 1.6 * Math.max(0, ad - 11));
    }
    const up = x - n.px;                                         // + = towards the mountain
    return up >= 0 ? n.y + Math.min(34, 0.85 * up) : Math.max(0.1, n.y + 1.5 * up);
  },
  paint(x, z, h, smp) {
    if (smp.onRoad) return null;
    if (smp.s >= S_STRAIGHT - 0.01 && Math.abs(smp.d) > 7) {              // the chasm: pale rock walls dropping into the clouds
      if (h < 14) { const k = Math.max(0, h) / 14; return [0.8 + 0.1 * k, 0.88 - 0.1 * k, 1.0 - 0.28 * k]; }
      if (h > H - 4) return [0.38, 0.55, 0.32];
      return Math.sin(h * 0.9 + x * 0.05) > 0.4 ? [0.6, 0.55, 0.48] : [0.5, 0.47, 0.43];
    }
    if (h < 5) return [0.8, 0.88, 1.0];                                   // the cloud sea
    if (h < 11) { const k = (h - 5) / 6; return [0.8 - 0.35 * k, 0.88 - 0.22 * k, 1.0 - 0.6 * k]; }   // clouds thinning into green
    return Math.sin(x * 0.07 + z * 0.05) * Math.sin(z * 0.11 - x * 0.04) > 0.55 ? [0.5, 0.48, 0.44] : [0.36, 0.55, 0.34];   // green slopes with rock streaks
  },
  env: {
    openRoad: true, fine: { R: 30, cell: 1.6 }, camAim: { yaw: 0, lift: 3 }, weather: 'none',
    look: { sky: 'alpine', fog: ['#e4ecfa', 140, 900], hemi: ['#f4f6ff', '#a9bde6', 1.3], sun: ['#fff4e2', 1.9, -8, 9, 5] },
  },
  windAt: gustAt,
  ctrl: () => PATH.filter((_, i) => i % 3 === 0 || i === PATH.length - 1),
  elevation: (s, p) => roadH(s, p),
  sections: [
    { from: 0.0, to: 0.06, surf: 'asphalt' }, { from: 0.06, to: 0.26, surf: 'dirt' }, { from: 0.26, to: 0.34, surf: 'asphalt' },
    { from: 0.34, to: 0.56, surf: 'dirt' }, { from: 0.56, to: 0.66, surf: 'asphalt' }, { from: 0.66, to: 0.74, surf: 'dirt' }, { from: 0.74, to: 1.01, surf: 'asphalt' },
  ],
  // the span: where the deck starts and ends, and the rails' gaps (alternating sides, 12 m each), found by distance along the straight
  bridge(T) {
    const sOf = (m) => {
      let lo = 0.3; let hi = 1;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const p = T.sampleAt(mid); if (alongOf(p.x) < m) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    };
    const gaps = [[84, 1], [130, -1], [176, 1], [220, -1], [252, 1]].map(([m, side]) => ({ from: sOf(m), to: sOf(m + 12), side }));
    return { s0: sOf(SPAN.a0), s1: sOf(SPAN.a1), rail: T.ROAD_HALF - 0.1, gaps, a0: SPAN.a0, a1: SPAN.a1 };
  },
  features(T) {
    const { JUMP } = T;
    return [...JUMP(0.1, 1.4, 8)];
  },
  walls({ W }) {
    W.barrels(0.17, 4, 3); W.crates(0.4, -4, 3); W.tnt(0.3, 4.5);
    for (const [a, o, l] of [[0.05, 0, 8], [0.2, 0, 8], [0.42, 0, 8], [0.6, 0, 8], [0.88, 0, 8]]) W.pad(a, o, l, 5.5);
    for (const [a, o] of [[0.04, 0], [0.1, 0], [0.18, 0], [0.27, 0], [0.36, 0], [0.46, 0], [0.54, 0], [0.62, 0], [0.7, 0], [0.84, 0], [0.92, 0]]) W.pickup(a, o);
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(97); const out = [];
    for (let i = 0; i < 26; i++) {
      const s = 0.05 + rand() * 0.6; const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s);
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};
