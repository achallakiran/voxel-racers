// The track roster. Each is a definition for makeTrack(); see track-factory.js.
import { makeTrack } from './track-factory.js';

const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

// ---------------------------------------------------------------- 1. Greenridge Run (grass, jumps, mud, potholes)
const GREENRIDGE_DEF = {
  id: 'greenridge', name: 'Greenridge Run',
  theme: { a: [0.33, 0.64, 0.26], b: [0.29, 0.58, 0.24], edge: [0.55, 0.48, 0.3], far: [0.26, 0.5, 0.23], dirt: [0.72, 0.54, 0.33], rut: [0.62, 0.45, 0.27], sand: [0.9, 0.78, 0.47], sky: 'day' },
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 18; k++) {
      const th = (2 * Math.PI * k) / 18;
      const r = 1 + 0.13 * Math.sin(3 * th + 0.6) + 0.05 * Math.sin(5 * th + 1.3);
      ctrl.push({ x: 135 * Math.cos(th) * r, z: 88 * Math.sin(th) * r });
    }
    return ctrl;
  },
  elevation: (s) => 3.4 + 1.1 * Math.sin(2 * Math.PI * 2 * s + 0.7) + 0.6 * Math.sin(2 * Math.PI * 5 * s + 0.3),
  sections: [
    { from: 0.0, to: 0.14, surf: 'asphalt' }, { from: 0.14, to: 0.29, surf: 'dirt' }, { from: 0.29, to: 0.43, surf: 'sand' },
    { from: 0.43, to: 0.56, surf: 'asphalt' }, { from: 0.56, to: 0.67, surf: 'dirt' }, { from: 0.67, to: 0.73, surf: 'mud' },
    { from: 0.73, to: 0.83, surf: 'asphalt' }, { from: 0.83, to: 0.93, surf: 'dirt' }, { from: 0.93, to: 1.0, surf: 'asphalt' },
  ],
  features(T) {
    const { feat, lateral, JUMP, rng, LENGTH } = T;
    const log = [[0, 0], [0.3, 0.5], [0.9, 0.5], [1.2, 0]];
    const rockRand = rng(5);
    const rocks = [];
    for (let i = 0; i < 26; i++) {
      const s = 0.57 + rockRand() * 0.095;
      rocks.push(lateral(s, (rockRand() - 0.5) * 11, { type: 'bump', kind: 'rock', r: 1.2 + rockRand() * 1.3, h: 0.35 + rockRand() * 0.65 }));
    }
    const pits = [
      lateral(0.745, -2.5, { type: 'pit', kind: 'pit', r: 4.6, depth: 1.5 }),
      lateral(0.765, 3.0, { type: 'pit', kind: 'pit', r: 3.0, depth: 1.1 }),
      lateral(0.785, -3.5, { type: 'pit', kind: 'pit', r: 3.4, depth: 1.2 }),
      lateral(0.8, 2.5, { type: 'pit', kind: 'pit', r: 2.4, depth: 0.9 }),
      lateral(0.815, -1.0, { type: 'pit', kind: 'pit', r: 2.8, depth: 1.0 }),
    ];
    return [
      ...JUMP(0.07, 2.4, 9),
      feat(0.31, 'whoops', { kind: 'whoops', len: 34, w: 11, amp: 0.7, wave: 4.5 }),
      ...JUMP(0.49, 3.0, 10),
      ...rocks, ...pits,
      feat(0.865, 'ramp', { kind: 'log', w: 12, profile: log }),
      feat(0.865 + 7 / LENGTH, 'ramp', { kind: 'log', w: 12, profile: log }),
      feat(0.865 + 14 / LENGTH, 'ramp', { kind: 'log', w: 12, profile: log }),
    ];
  },
  walls({ W }) {
    W.fork(0.368, 52, 1, 'brick');                         // split road: risky pads + gap, or sticky goo
    W.fork(0.66, 52, 1, 'brick');
    for (const [a, o, l] of [[0.03, 0, 8], [0.455, 0, 8], [0.945, -2, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.2, 3, 10, 5); W.oil(0.16, -3, 10, 5);
    for (const [a, o] of [[0.02, 0], [0.12, 3], [0.25, -3], [0.45, 0], [0.7, 2], [0.84, 0], [0.95, 3]]) W.pickup(a, o);
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER, LENGTH } = T;
    const rand = rng(21);
    const out = [];
    for (let i = 0; i < 46; i++) {
      const s = rand();
      const side = rand() < 0.5 ? -1 : 1;
      const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s);
      if (s < 0.02 || s > 0.98) continue;
      const x = p.x + p.tz * side * off;
      const z = p.z - p.tx * side * off;
      const type = rand() < 0.6 ? 'boulder' : 'stack';
      out.push(type === 'boulder' ? { type, x, z, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 } : { type, x, z, r: 0.9, h: 0.9 });
    }
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
  },
};

// ---------------------------------------------------------------- 2. Looper Canyon (desert, two loops, wall passages)
const CANYON_DEF = {
  id: 'canyon', name: 'Looper Canyon',
  theme: { a: [0.86, 0.58, 0.34], b: [0.8, 0.52, 0.3], edge: [0.78, 0.6, 0.38], far: [0.7, 0.44, 0.27], dirt: [0.82, 0.55, 0.32], rut: [0.7, 0.44, 0.25], sand: [0.93, 0.8, 0.5], sky: 'day', wall: [0.7, 0.36, 0.25] },
  scenery: ['cactus', 'mesa'], sceneryCount: 380,
  env: { weather: 'dust', breeze: { x: 5, z: 0 }, look: { sky: 'golden', fog: ['#f0b48a', 28, 150], hemi: ['#ffd6b0', '#a55a3a', 1.2], sun: ['#ffb070', 2.7, -10, 6, 8] } },
  checkpoints: [0, 0.2, 0.5, 0.8],
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 24; k++) {
      const th = (2 * Math.PI * k) / 24;
      const r = 1 + 0.05 * Math.sin(3 * th + 1.0);
      ctrl.push({ x: 150 * sgnPow(Math.cos(th), 0.68) * r, z: 98 * sgnPow(Math.sin(th), 0.68) * r });
    }
    return ctrl;
  },
  elevation: (s) => 3.2 + 0.9 * Math.sin(2 * Math.PI * 3 * s + 0.4) + 0.5 * Math.sin(2 * Math.PI * 7 * s + 1.2),
  sections: [
    { from: 0.0, to: 0.12, surf: 'asphalt' }, { from: 0.12, to: 0.3, surf: 'dirt' }, { from: 0.3, to: 0.4, surf: 'asphalt' },
    { from: 0.4, to: 0.52, surf: 'sand' }, { from: 0.52, to: 0.64, surf: 'dirt' }, { from: 0.64, to: 0.74, surf: 'asphalt' },
    { from: 0.74, to: 0.84, surf: 'mud' }, { from: 0.84, to: 0.93, surf: 'dirt' }, { from: 0.93, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.345, 16, 0.03) }, { s: straightNear(0.69, 16, 0.03) }],
  features(T) {
    const { feat, lateral, JUMP, rng } = T;
    const rand = rng(8);
    const rocks = [];
    for (let i = 0; i < 20; i++) rocks.push(lateral(0.6 + rand() * 0.03, (rand() - 0.5) * 11, { type: 'bump', kind: 'rock', r: 1.2 + rand() * 1.2, h: 0.35 + rand() * 0.6 }));
    const pits = [lateral(0.865, -2.5, { type: 'pit', kind: 'pit', r: 4, depth: 1.3 }), lateral(0.88, 3, { type: 'pit', kind: 'pit', r: 3, depth: 1.0 })];
    return [...JUMP(0.07, 2.5, 9), feat(0.44, 'whoops', { kind: 'whoops', len: 30, w: 11, amp: 0.65, wave: 4.2 }), ...JUMP(0.56, 2.9, 10), ...rocks, ...pits];
  },
  walls({ W }) {
    W.corridor(0.15, 44, 8.5);                   // first squeeze
    W.crates(0.215, 0, 3);
    W.island(0.24, 40, 'brick', 1);              // split road, right lane shut by a smashable gate
    W.corridor(0.46 + 0.03, 34, 7.2);            // narrow dune canyon
    W.slalom(0.78, 5, 13);                       // weave through blocks
    W.corridor(0.905, 30, 9, 'brick');
    W.barrels(0.135, 3, 3);
    W.tnt(0.95, 0);
    W.fork(0.352, 52, 1, 'brick');
    W.fork(0.63, 52, 1, 'brick');
    for (const [a, o, l] of [[0.03, 0, 8], [0.54, 0, 8], [0.97, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.53, 3, 10, 5); W.oil(0.965, 2, 9, 5);
    for (const [a, o] of [[0.04, 0], [0.12, 2], [0.5, 0], [0.51, 0], [0.76, 0], [0.84, 3], [0.96, -3]]) W.pickup(a, o);
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(31); const out = [];
    for (let i = 0; i < 40; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 1.1, h: 1.0 + rand() * 0.9 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 3. Brick Fortress (stone, passages everywhere, one loop)
const FORTRESS_DEF = {
  id: 'fortress', name: 'Brick Fortress',
  theme: { a: [0.5, 0.56, 0.5], b: [0.45, 0.5, 0.45], edge: [0.6, 0.57, 0.5], far: [0.4, 0.46, 0.4], dirt: [0.62, 0.55, 0.45], rut: [0.52, 0.45, 0.36], sand: [0.88, 0.78, 0.55], sky: 'day', wall: [0.52, 0.5, 0.52] },
  scenery: ['tower', 'round'], sceneryCount: 300,
  env: { weather: 'rain', breeze: { x: 3, z: 0 }, look: { sky: 'storm', fog: ['#8a929e', 20, 105], hemi: ['#9fb0c8', '#4a4f58', 1.0], sun: ['#c8d4e8', 1.6, 4, 10, 3] } },
  checkpoints: [0, 0.22, 0.52, 0.76],
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 20; k++) {
      const th = (2 * Math.PI * k) / 20;
      const r = 1 + 0.12 * Math.sin(2 * th + 0.5) + 0.07 * Math.sin(5 * th + 2.0);
      ctrl.push({ x: 128 * Math.cos(th) * r, z: 90 * Math.sin(th) * r });
    }
    return ctrl;
  },
  elevation: (s) => 3.0 + 0.8 * Math.sin(2 * Math.PI * 2 * s + 1.1) + 0.5 * Math.sin(2 * Math.PI * 6 * s),
  sections: [
    { from: 0.0, to: 0.2, surf: 'asphalt' }, { from: 0.2, to: 0.32, surf: 'dirt' }, { from: 0.32, to: 0.5, surf: 'asphalt' },
    { from: 0.5, to: 0.6, surf: 'mud' }, { from: 0.6, to: 0.8, surf: 'asphalt' }, { from: 0.8, to: 0.9, surf: 'dirt' }, { from: 0.9, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.38, 16, 0.04) }],
  features(T) {
    const { feat, lateral, JUMP, rng } = T;
    const rand = rng(12);
    const rocks = [];
    for (let i = 0; i < 16; i++) rocks.push(lateral(0.597 + rand() * 0.028, (rand() - 0.5) * 10, { type: 'bump', kind: 'rock', r: 1.1 + rand() * 1.0, h: 0.35 + rand() * 0.5 }));
    return [...JUMP(0.1, 2.4, 9), ...rocks, ...JUMP(0.68, 2.8, 10), feat(0.825, 'whoops', { kind: 'whoops', len: 26, w: 11, amp: 0.55, wave: 4 })];
  },
  walls({ W }) {
    W.corridor(0.04, 34, 8.2, 'stone');
    W.slalom(0.165, 4, 12, 'stone');
    W.island(0.24, 36, 'stone', -1);             // gate shuts the left lane
    W.corridor(0.30, 26, 7.4, 'stone');
    W.corridor(0.405, 38, 8.2, 'stone');
    W.island(0.63, 34, 'stone', 1);
    W.slalom(0.735, 5, 12, 'stone');
    W.corridor(0.88, 36, 7.6, 'stone');
    W.crates(0.43, 1, 3); W.barrels(0.275, -1, 3); W.tnt(0.935, 2);
    W.fork(0.52, 52, 1, 'stone');
    for (const [a, o, l] of [[0.12, 0, 8], [0.415, 0, 8], [0.855, 0, 8], [0.96, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.11, 3, 10, 5); W.oil(0.70, -3, 10, 5);
    for (const [a, o] of [[0.1, 0], [0.27, 0], [0.40, 0], [0.628, 0], [0.7, 0], [0.86, 0], [0.97, 0]]) W.pickup(a, o);
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(41); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 4. Himalaya Pass (snow, ice, wind, avalanches)
const HIMALAYA_DEF = {
  id: 'himalaya', name: 'Himalaya Pass',
  theme: { a: [0.93, 0.96, 1.0], b: [0.86, 0.9, 0.97], edge: [0.74, 0.78, 0.86], far: [0.72, 0.78, 0.9], dirt: [0.55, 0.5, 0.47], rut: [0.45, 0.4, 0.38], sand: [0.8, 0.82, 0.88], sky: 'alpine', snow: true },
  peaks: 30, scenery: ['pine', 'pine'], sceneryCount: 380,
  env: { weather: 'snow', wind: { x: 9, z: 0 }, look: { sky: 'alpine', fog: ['#dfe9f5', 30, 135], hemi: ['#e8f0ff', '#9aa8c0', 1.3], sun: ['#fff6e8', 2.2, 6, 12, 4] } },
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 20; k++) {
      const th = (2 * Math.PI * k) / 20;
      const r = 1 + 0.07 * Math.sin(2 * th + 0.9) + 0.04 * Math.sin(4 * th + 0.2) + 0.02 * Math.sin(7 * th);
      ctrl.push({ x: 128 * Math.cos(th) * r, z: 92 * Math.sin(th) * r });
    }
    return ctrl;
  },
  elevation: (s) => 4.2 + 1.5 * Math.sin(2 * Math.PI * s + 0.4) + 0.8 * Math.sin(2 * Math.PI * 3 * s + 1.2) + 0.4 * Math.sin(2 * Math.PI * 7 * s),
  sections: [
    { from: 0.0, to: 0.12, surf: 'asphalt' }, { from: 0.12, to: 0.34, surf: 'snow' }, { from: 0.34, to: 0.42, surf: 'asphalt' }, { from: 0.42, to: 0.5, surf: 'planks' },
    { from: 0.5, to: 0.6, surf: 'snow' }, { from: 0.6, to: 0.72, surf: 'asphalt' }, { from: 0.72, to: 0.79, surf: 'snow' },
    { from: 0.79, to: 0.85, surf: 'ice' }, { from: 0.85, to: 0.9, surf: 'snow' }, { from: 0.9, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.615, 16, 0.02) }],
  features(T) {
    const { JUMP, feat } = T;
    return [...JUMP(0.915, 2.4, 9), feat(0.875, 'whoops', { kind: 'whoops', len: 28, w: 11, amp: 0.55, wave: 4.2 })];
  },
  walls({ W }) {
    W.fork(0.135, 52, 1, 'stone', 0.55);
    W.corridor(0.245, 30, 8.2, 'stone');
    W.island(0.70, 32, 'stone', 1);
    W.barrels(0.375, -1, 3); W.crates(0.945, 1, 3); W.tnt(0.778, 2);
    for (const [a, o, l] of [[0.04, 0, 8], [0.30, 0, 8], [0.965, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.41, 3, 9, 5); W.oil(0.52, -3, 10, 5);
    for (const [a, o] of [[0.03, 0], [0.10, 0], [0.22, 0], [0.31, 0], [0.43, 0], [0.52, 0], [0.60, 0], [0.69, 0], [0.76, 0], [0.91, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, LENGTH, add }) {
    // avalanche waves sweep a stretch of road from alternating sides; a warning leads each one
    for (const [s, side, off] of [[0.215, 1, 0], [0.762, -1, 4], [0.81, 1, 8]]) {
      const p = sampleAt(s);
      add({ kind: 'avalanche', x: p.x, z: p.z, tx: p.tx, tz: p.tz, len: 18, w: 13, side, period: 16, warn: 2.0, warnLead: 2.5, dur: 3.0, offset: off, s });
    }
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(88); const out = [];
    for (let i = 0; i < 34; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// lateral placement helper for hazards: a point `off` to the right of the road centre at lap fraction s
const roadPoint = (sampleAt, s, off) => { const p = sampleAt(s); return { x: p.x + p.tz * off, z: p.z - p.tx * off, tx: p.tx, tz: p.tz }; };

// ---------------------------------------------------------------- 5. Skull Cavern (dark cave, stalactites, glowing crystals)
const SKULL_DEF = {
  id: 'skull', name: 'Skull Cavern',
  theme: { a: [0.2, 0.17, 0.26], b: [0.17, 0.14, 0.22], edge: [0.32, 0.27, 0.38], far: [0.1, 0.08, 0.14], dirt: [0.34, 0.3, 0.36], rut: [0.26, 0.22, 0.3], sand: [0.74, 0.72, 0.66], sky: 'cave', wall: [0.42, 0.38, 0.48] },
  scenery: ['stalagmite', 'crystal'], sceneryCount: 420, skulls: 7,
  structures: [{ type: 'skullcave', s0: 0.355, s1: 0.445 }],
  env: { weather: 'spores', breeze: { x: 1.5, z: 0 }, look: { sky: 'cave', fog: ['#0d1020', 12, 78], hemi: ['#7a68d8', '#1c1630', 0.95], sun: ['#9fb8ff', 0.9, 6, 12, 4] } },
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 20; k++) {
      const th = (2 * Math.PI * k) / 20;
      const r = 1 + 0.10 * Math.sin(3 * th + 0.4) + 0.05 * Math.sin(2 * th + 1.1);
      ctrl.push({ x: 118 * Math.cos(th) * r, z: 96 * Math.sin(th) * r });
    }
    return ctrl;
  },
  elevation: (s) => 4.4 + 1.4 * Math.sin(2 * Math.PI * 2 * s + 0.2) + 0.7 * Math.sin(2 * Math.PI * 5 * s + 1.0),
  sections: [
    { from: 0.0, to: 0.12, surf: 'asphalt' }, { from: 0.12, to: 0.3, surf: 'dirt' }, { from: 0.3, to: 0.45, surf: 'sand' },
    { from: 0.45, to: 0.6, surf: 'dirt' }, { from: 0.6, to: 0.66, surf: 'mud' }, { from: 0.66, to: 0.82, surf: 'dirt' }, { from: 0.82, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.855, 16, 0.02) }],
  features(T) {
    const { JUMP, feat } = T;
    return [...JUMP(0.285, 2.4, 9), feat(0.66, 'whoops', { kind: 'whoops', len: 24, w: 11, amp: 0.55, wave: 4 })];
  },
  walls({ W }) {
    W.fork(0.165, 52, -1, 'stone', 0.6);
    W.island(0.50, 32, 'stone', -1);
    W.corridor(0.565, 28, 7.8, 'stone');
    W.barrels(0.13, 1, 3); W.tnt(0.46, 2); W.crates(0.89, -1, 3);
    for (const [a, o, l] of [[0.03, 0, 8], [0.34, 0, 8], [0.77, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.40, 3, 9, 5); W.oil(0.31, -3, 10, 5);
    for (const [a, o] of [[0.02, 0], [0.12, 0], [0.26, 0], [0.37, 0], [0.47, 0], [0.62, 0], [0.74, 0], [0.80, 0], [0.95, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, add }) {
    // rocks drop from the ceiling on a fixed rhythm; a growing shadow shows where
    const spec = [[0.09, 3, 0], [0.375, -3, 2], [0.40, 2.5, 4], [0.425, -2, 1], [0.69, -2, 3], [0.745, 3, 3.5], [0.915, -2.5, 5]];
    // the ones inside the skull fall from the cave roof (shorter drop)
    for (const [s, off, o] of spec) add({ kind: 'stalactite', ...roadPoint(sampleAt, s, off), r: 2.8, period: 7, warn: 4, offset: o, drop: s > 0.36 && s < 0.45 ? 10.5 : 16 });
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(51); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 6. Magma Peak (lava, geysers, embers)
const MAGMA_DEF = {
  id: 'magma', name: 'Magma Peak',
  theme: { a: [0.2, 0.17, 0.17], b: [0.16, 0.13, 0.13], edge: [0.38, 0.2, 0.14], far: [0.12, 0.08, 0.08], dirt: [0.32, 0.22, 0.18], rut: [0.24, 0.16, 0.13], sand: [0.45, 0.42, 0.42], sky: 'volcano', wall: [0.3, 0.2, 0.2] },
  checkpoints: [0, 0.26, 0.55, 0.78],
  peaks: 16, peakType: 'cone', scenery: ['stalagmite', 'stalagmite'], sceneryCount: 220,
  env: { weather: 'embers', breeze: { x: 3, z: 0 }, look: { sky: 'volcano', fog: ['#4a1a12', 25, 125], hemi: ['#ff8a50', '#3a0e08', 1.1], sun: ['#ff9a60', 2.0, -6, 8, 6] } },
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 20; k++) {
      const th = (2 * Math.PI * k) / 20;
      const r = 1 + 0.08 * Math.sin(3 * th + 2.0) + 0.05 * Math.sin(5 * th + 0.3);
      ctrl.push({ x: 112 * Math.cos(th) * r, z: 100 * Math.sin(th) * r });
    }
    return ctrl;
  },
  elevation: (s) => 4.8 + 1.5 * Math.sin(2 * Math.PI * s + 1.4) + 0.8 * Math.sin(2 * Math.PI * 4 * s + 0.3),
  sections: [
    { from: 0.0, to: 0.14, surf: 'asphalt' }, { from: 0.14, to: 0.44, surf: 'dirt' }, { from: 0.44, to: 0.54, surf: 'asphalt' },
    { from: 0.54, to: 0.68, surf: 'sand' }, { from: 0.68, to: 0.9, surf: 'dirt' }, { from: 0.9, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.475, 16, 0.02) }],
  features(T) {
    const { JUMP, feat } = T;
    return [...JUMP(0.20, 2.4, 9), feat(0.775, 'whoops', { kind: 'whoops', len: 26, w: 11, amp: 0.55, wave: 4.2 })];
  },
  walls({ W }) {
    W.fork(0.075, 52, 1, 'stone', 0.6);
    W.island(0.70, 32, 'stone', 1);
    W.corridor(0.915, 26, 7.8, 'stone');
    W.lava(0.30, 3, 12, 5); W.lava(0.865, 3, 12, 5); W.lava(0.89, -3, 12, 5);
    W.barrels(0.755, -1, 3); W.tnt(0.65, 2); W.crates(0.51, 1, 3);
    for (const [a, o, l] of [[0.03, 0, 8], [0.39, 0, 8], [0.96, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.58, 3, 9, 5); W.oil(0.36, -3, 10, 5);
    for (const [a, o] of [[0.02, 0], [0.065, 0], [0.18, 0], [0.26, 0], [0.34, 0], [0.45, 0], [0.62, 0], [0.665, 0], [0.76, 0], [0.80, 0], [0.915, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, add }) {
    // geysers beside the racing line: erupt, then rest; the bubbling is the warning
    const spec = [[0.22, 4, 0], [0.34, -4, 3], [0.62, 4, 5], [0.79, -4, 2], [0.865, 4, 6]];
    for (const [s, off, o] of spec) add({ kind: 'geyser', ...roadPoint(sampleAt, s, off), r: 3.0, period: 8, warn: 3, dur: 1.6, offset: o });
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(61); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

export const TRACKS = [makeTrack(GREENRIDGE_DEF), makeTrack(CANYON_DEF), makeTrack(FORTRESS_DEF), makeTrack(HIMALAYA_DEF), makeTrack(SKULL_DEF), makeTrack(MAGMA_DEF)];
export const getTrackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
export const validTrack = (id) => TRACKS.some((t) => t.id === id);
