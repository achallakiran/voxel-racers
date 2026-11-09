// The two giant stone hands of Giant's Grip (a stylised tribute to the famous hand-held bridge). Pure geometry: returns cubes
// { x, y, z, s, color } so it is testable without WebGL. Each hand is palm up, fingers curled under, a forearm sloping down into the cloud sea.
// Hand frame: u = along the fingers, v = across the palm, w = up from the top of the palm.
export const CELL = 1.6;

const hash = (a, b, c) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return v - Math.floor(v); };

// boxes of one hand [u0,u1,v0,v1,w0,w1]
const SU = 1.5; const SW = 1.25;                          // the hand is bigger than the deck: palm about three deck-widths across
export function handBoxes() {
  const B = [];
  const raw = [];
  raw.push([0, 22, -15, 15, -6, 0]);                       // the palm
  raw.push([-3, 5, -12, 12, -9, 0]);                       // heel of the hand
  raw.push([4, 16, -14, 14, -1.6, 0.4]);                   // the pad the deck rests on
  for (let k = 0; k < 13; k++) raw.push([-5 - 3.4 * k - 3, -3.4 * k + 1, -(11 + 0.5 * k), 11 + 0.5 * k, -9 - 4.4 * k - 4.4, -9 - 4.4 * k + 2]);   // wrist and forearm
  const fingers = [[-11.5, 1.0], [-4, 1.12], [3.5, 1.05], [11, 0.85]];
  fingers.forEach(([v, L], idx) => {
    const half = 2.9;
    const u1 = 22 + 12 * L;
    raw.push([22, u1, v - half, v + half, -5.2, -0.4]);                                  // first section along the palm
    raw.push([u1 - 4, u1 + 1.6, v - half + 0.2, v + half - 0.2, -9.2, -4.4]);            // first knuckle
    raw.push([u1 - 1, u1 + 3, v - half + 0.4, v + half - 0.4, -13.6, -8.8]);              // curling down
    raw.push([u1 - 9, u1 + 1, v - half + 0.6, v + half - 0.6, -18.2, -13.2]);             // the tip turns back under the palm
  });
  for (let k = 0; k < 6; k++) raw.push([4 + 2.2 * k, 8 + 2.2 * k, -15.5 - 1.6 * k - 4, -15.5 - 1.6 * k + 1, -6 + 0.2 * k, -1 + 0.2 * k]);   // thumb pointing out and forward
  for (const [u0, u1, v0, v1, w0, w1] of raw) B.push([u0 * SU, u1 * SU, v0 * SU, v1 * SU, w0 * SW, w1 * SW]);
  return B;
}

// the cells of a hand, each with a colour: weathered stone, darker low down, moss on top where nothing sits above
export function handCells(seed = 0) {
  const cells = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  for (const [u0, u1, v0, v1, w0, w1] of handBoxes()) {
    for (let i = Math.floor(u0 / CELL); i < Math.ceil(u1 / CELL); i++) for (let j = Math.floor(v0 / CELL); j < Math.ceil(v1 / CELL); j++) for (let k = Math.floor(w0 / CELL); k < Math.ceil(w1 / CELL); k++) cells.set(key(i, j, k), [i, j, k]);
  }
  const out = [];
  for (const [i, j, k] of cells.values()) {
    const top = !cells.has(key(i, j, k + 1));
    const n = hash(i + seed * 7, j, k);
    const low = Math.max(0, Math.min(1, (k * CELL + 70) / 70));
    let c = [0.74 + n * 0.1, 0.65 + n * 0.09, 0.5 + n * 0.08].map((x) => x * (0.62 + 0.38 * low));
    if (top && hash(j, i, seed) < 0.3) c = [0.34 + n * 0.1, 0.5 + n * 0.1, 0.28];                  // moss
    if (k < -3 && hash(i, k, j + seed) > 0.86) c = c.map((x) => x * 0.72);                          // darker cracks
    out.push({ u: (i + 0.5) * CELL, v: (j + 0.5) * CELL, w: (k + 0.5) * CELL, color: c });
  }
  return out;
}

// the two hands placed along the deck: A faces +x, B faces -x and is mirrored so they are a pair; the arms come up out of the clouds
export function gripHands({ P, H, a0, a1 }) {
  const top = H - 1.75;
  const hands = [
    { t: a0 + (a1 - a0) * 0.30, f: 1, m: 1, seed: 1 },
    { t: a0 + (a1 - a0) * 0.70, f: -1, m: -1, seed: 2 },
  ];
  const cubes = [];
  for (const h of hands) {
    for (const c of handCells(h.seed)) cubes.push({ x: P.x + h.t + h.f * c.u, y: top + c.w, z: P.z + h.m * c.v, s: CELL * 1.02, color: c.color });
  }
  return { cubes, hands, top };
}
