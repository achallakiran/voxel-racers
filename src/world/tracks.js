// The track roster. Each is a definition for makeTrack(); see track-factory.js.
import { makeTrack } from './track-factory.js';
import { MOON_SUN, MOON_EARTH } from './planet.js';

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

// ---------------------------------------------------------------- 7. Moon Crater (a TINY PLANET: the flat map is bent onto a small ball, see world/planet.js)
// The lap is a long stadium that runs round the little moon: two long straights and two wide turns, so from the start
// you can see the road curve away over the horizon. Flat-map numbers: R = 70 puts each end of the lap ~130 degrees round the ball.
const MOON_R = 70;
const MOON_HALF = 130;       // the straights run x = -130 .. +130
const MOON_Z = 26;           // ... at z = +-26 (latitude ~+-23 degrees, where the map keeps 90% of its scale)
const MOON_LEN = 4 * MOON_HALF + 2 * Math.PI * MOON_Z;
// u in [0,1): bottom straight (heading +x) -> turn at +x -> top straight (heading -x) -> turn at -x, with a gentle weave
const moonP = (u) => {
  let d = (((u % 1) + 1) % 1) * MOON_LEN; let x; let z;
  const A = 2 * MOON_HALF; const C = Math.PI * MOON_Z;
  if (d < A) { x = -MOON_HALF + d; z = -MOON_Z; }
  else if (d < A + C) { const a = (d - A) / MOON_Z; x = MOON_HALF + MOON_Z * Math.sin(a); z = -MOON_Z * Math.cos(a); }
  else if (d < 2 * A + C) { x = MOON_HALF - (d - A - C); z = MOON_Z; }
  else { const a = (d - 2 * A - C) / MOON_Z; x = -MOON_HALF - MOON_Z * Math.sin(a); z = MOON_Z * Math.cos(a); }
  const weave = 4.2 * Math.sin(u * Math.PI * 2 * 5 + 0.6) * (z < 0 ? 1 : -1) * Math.min(1, Math.max(0, (MOON_HALF - Math.abs(x)) / 40 + 0.15));
  return [x, z + weave];
};
const moonDome = () => 10;    // flat base level; the ball itself does the curving
// craters: { x, z, r, d } - a bowl with a raised rim. Big ones sit ON the road (the road dips through them and climbs out),
// huge ones sit beside it, and two more fill the infield.
const MOON_CRATERS = [];
{
  // off > 0 puts the crater on the outside of the lap (away from the middle of the stadium), off < 0 inside
  const at = (u, off, r, d) => {
    const [x, z] = moonP(u); const [x2, z2] = moonP(u + 0.002); const tx = x2 - x; const tz = z2 - z; const l = Math.hypot(tx, tz) || 1;
    const nx = tz / l; const nz = -tx / l; const sgn = (nx * x + nz * z) >= 0 ? 1 : -1;
    MOON_CRATERS.push({ x: x + nx * sgn * off, z: z + nz * sgn * off, r, d });
  };
  for (const [u, r, d] of [[0.075, 22, 7.0], [0.685, 26, 8.0], [0.94, 16, 5.0], [0.43, 13, 3.6]]) at(u, 0, r, d);   // on the road
  // the bowl wall rises just behind the barriers and the rim peak (1.1 r) stays beyond them: centre at 14 + 1.15 r
  for (const [u, r] of [[0.03, 26], [0.12, 32], [0.21, 24], [0.30, 34], [0.37, 28], [0.46, 30], [0.56, 34], [0.65, 26], [0.75, 32], [0.84, 28], [0.92, 34]]) at(u, 14 + 1.15 * r, r, r * 0.2);
  MOON_CRATERS.push({ x: 48, z: 0, r: 11, d: 3.0 }, { x: -48, z: 0, r: 11, d: 3.0 });                     // infield
}
function moonGround(x, z) {
  let h = moonDome();
  for (const c of MOON_CRATERS) {
    const dx = x - c.x; const dz = z - c.z;
    const t = Math.hypot(dx, dz) / c.r;
    if (t < 1) h -= c.d * (1 - t * t);                                          // bowl
    if (t > 0.85 && t < 1.5) h += c.d * 0.28 * Math.exp(-(((t - 1.1) / 0.18) ** 2));   // raised rim
  }
  return Math.max(0.3, h);
}
// ground colour for the craters: dark floors with faint rings, a bright raised rim, so a crater reads from a long way off
function moonShade(x, z) {
  let k = 1;
  for (const c of MOON_CRATERS) {
    const t = Math.hypot(x - c.x, z - c.z) / c.r;
    if (t < 1) { k *= 1 - 0.42 * Math.pow(1 - t * t, 0.7) + 0.05 * Math.sin(t * 16) * (1 - t); }
    else if (t < 1.5) k *= 1 + 0.32 * Math.exp(-(((t - 1.12) / 0.16) ** 2));
  }
  return k;
}
const MOON_DEF = {
  id: 'moon', name: 'Moon Crater',
  theme: { a: [0.56, 0.56, 0.59], b: [0.5, 0.5, 0.54], edge: [0.68, 0.68, 0.7], far: [0.38, 0.38, 0.42], dirt: [0.62, 0.62, 0.65], rut: [0.5, 0.5, 0.54], sand: [0.72, 0.72, 0.74], sky: 'space', pit: [0.3, 0.3, 0.34], wall: [0.45, 0.45, 0.5] },
  scenery: ['moonrock', 'moonrock', 'moonrock', 'moonrock', 'moonrock', 'moonrock', 'lander', 'dish'], sceneryCount: 170,
  env: { openRoad: true, camAim: { yaw: 0, lift: 0 }, ring: { a: '#d5dcec', b: '#a9b4cc', rail1: '#4cf0ff', rail2: '#17323a', glow: '#0c4a58' }, planet: { R: MOON_R }, gravity: 8, elevRange: 14, weather: null, look: { sky: 'space', fog: ['#03040a', 160, 460], hemi: ['#7a88b8', '#2c2c34', 0.75], sun: ['#fff6e0', 3.6, -14, 7, 9], sunWorld: MOON_SUN, earthWorld: MOON_EARTH, earthshine: ['#6f9cff', 0.9] } },
  ctrl() {
    const ctrl = [];
    for (let k = 0; k < 36; k++) { const [x, z] = moonP(k / 36); ctrl.push({ x, z }); }
    return ctrl;
  },
  ground: moonGround,
  shade: moonShade,
  elevation: (s, p) => moonGround(p.x, p.z),
  sections: [
    { from: 0.0, to: 0.1, surf: 'asphalt' }, { from: 0.1, to: 0.45, surf: 'dirt' }, { from: 0.45, to: 0.6, surf: 'sand' },
    { from: 0.6, to: 0.9, surf: 'dirt' }, { from: 0.9, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.57, 16, 0.02), vmin: 14 }],
  features(T) {
    const { JUMP, feat } = T;
    return [...JUMP(0.275, 0.6, 6), feat(0.33, 'whoops', { kind: 'whoops', len: 24, w: 11, amp: 0.5, wave: 4.5 })];
  },
  walls({ W }) {
    W.barrels(0.15, 1, 3); W.tnt(0.615, 2); W.crates(0.565, -1, 3);
    for (const [a, o, l] of [[0.04, 0, 8], [0.40, 0, 8], [0.87, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.63, 3, 9, 5); W.oil(0.46, -3, 10, 5);
    for (const [a, o] of [[0.03, 0], [0.12, 0], [0.20, 0], [0.37, 0], [0.43, 0], [0.57, 0], [0.64, 0], [0.76, 0], [0.82, 0], [0.93, 0]]) W.pickup(a, o);
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(71); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 8. Saturn's Rings (the road IS the ring: a circular lap round a giant Saturn)
const SAT = { Rt: 160, gx: 0, gz: 0, gy: 5, gr: 112, r0: 124, r1: 194 };   // the ring plane runs through Saturn's equator; the ground is a disc r0..r1
// concentric ring bands across the ice (a dark Cassini gap between the road and the planet), so the whole plain reads as Saturn's rings
function saturnShade(x, z) {
  const r = Math.hypot(x - SAT.gx, z - SAT.gz);
  const off = Math.abs(r - SAT.Rt);
  if (off < 17) return 1;                                   // the road and its shoulders keep their own colour
  let k = 0.9 + 0.12 * Math.sin(r * 0.9) * Math.sin(r * 0.23 + 1);
  if (r < SAT.Rt - 20 && r > SAT.Rt - 30) k *= 0.62;           // a dark gap just inside the road
  return k;
}
const SATURN_DEF = {
  id: 'saturn', name: "Saturn's Rings",
  theme: { a: [0.86, 0.82, 0.74], b: [0.8, 0.76, 0.68], edge: [0.97, 0.94, 0.86], far: [0.74, 0.68, 0.58], dirt: [0.7, 0.66, 0.6], rut: [0.58, 0.54, 0.5], sand: [0.9, 0.86, 0.78], sky: 'space', wall: [0.6, 0.64, 0.74] },
  scenery: ['icechunk', 'icechunk', 'iceshard', 'iceshard', 'moonrock'], sceneryCount: 600,
  structures: [{ type: 'planet', x: SAT.gx, y: SAT.gy, z: SAT.gz, r: SAT.gr }],
  shade: saturnShade,
  keepScenery: (x, z) => { const r = Math.hypot(x - SAT.gx, z - SAT.gz); return r > SAT.r0 + 4 && r < SAT.r1 - 4; },
  env: { openRoad: true, hideBarriers: true, ringDisc: { x: SAT.gx, z: SAT.gz, r0: SAT.r0, r1: SAT.r1 }, camAim: { yaw: 0.75, lift: 5 }, ring: { a: '#e8f2ff', b: '#bcd2f0', rail1: '#ffd36a', rail2: '#3a3020', glow: '#5a4410' }, gravity: 9, weather: null,
    look: { sky: 'space', sunDisc: [-0.79, 0.4, 0.51], fog: ['#05060f', 300, 900], hemi: ['#9fb4e8', '#5a4a38', 1.0], sun: ['#fff0d8', 3.2, -14, 7, 9] } },
  ctrl() {
    // a circle round Saturn, driven so the planet is always on your right (on screen: the camera's right is (-tz, tx))
    const ctrl = [];
    for (let k = 0; k < 28; k++) {
      const th = (2 * Math.PI * k) / 28;
      const r = SAT.Rt * (1 + 0.012 * Math.sin(3 * th + 0.6));
      ctrl.push({ x: SAT.gx + r * Math.cos(th), z: SAT.gz + r * Math.sin(th) });
    }
    return ctrl;
  },
  elevation: (s) => 4.6 + 1.5 * Math.sin(2 * Math.PI * 3 * s + 0.5) + 0.8 * Math.sin(2 * Math.PI * 7 * s + 1.4),
  sections: [
    { from: 0.0, to: 0.1, surf: 'asphalt' }, { from: 0.1, to: 0.3, surf: 'dirt' }, { from: 0.3, to: 0.38, surf: 'ice' },
    { from: 0.38, to: 0.6, surf: 'dirt' }, { from: 0.6, to: 0.7, surf: 'sand' }, { from: 0.7, to: 0.78, surf: 'ice' },
    { from: 0.78, to: 0.9, surf: 'dirt' }, { from: 0.9, to: 1.0, surf: 'asphalt' },
  ],
  loops: ({ straightNear }) => [{ s: straightNear(0.68, 16, 0.02), vmin: 10 }],
  features(T) {
    const { JUMP, feat } = T;
    return [...JUMP(0.2, 0.8, 7), feat(0.865, 'whoops', { kind: 'whoops', len: 24, w: 11, amp: 0.5, wave: 4.5 })];
  },
  walls({ W }) {
    W.barrels(0.605, 1, 3); W.tnt(0.33, 2); W.crates(0.42, -1, 3);
    for (const [a, o, l] of [[0.04, 0, 8], [0.3, 0, 8], [0.655, 0, 8], [0.8, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.58, 3, 9, 5); W.oil(0.93, -3, 10, 5);
    for (const [a, o] of [[0.03, 0], [0.13, 0], [0.24, 0], [0.34, 0], [0.47, 0], [0.56, 0], [0.64, 0], [0.74, 0], [0.84, 0], [0.95, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, add }) {
    // floating rocks that slide back and forth across the road; the shadow on the ice shows where each one is
    const spec = [[0.085, 0], [0.15, 1.6], [0.27, 3.1], [0.365, 0.8], [0.455, 2.4], [0.545, 4.0], [0.5, 1.1], [0.575, 2.9], [0.745, 1.7], [0.83, 0.3], [0.915, 1.9]];
    for (const [s, ph] of spec) {
      const p = sampleAt(s);
      add({ kind: 'drifter', cx: p.x, cz: p.z, x: p.x, z: p.z, tx: p.tx, tz: p.tz, range: 4.4, r: 1.7, top: 3.4, period: 5.5, phase: ph });
    }
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(53); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = rand(); const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s); if (s < 0.02 || s > 0.98) continue;
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 9. Volcano Climb (a SPRINT: one run up a spiral road to the summit)
// The road starts on the ash plain and winds round the volcano (always on the driver's right) up to the crater rim,
// where the finish arch stands. The mountain and the road come from ONE function, coneHeight(r), so they can not drift apart.
const VOL = { r0: 172, r1: 54, turns: 1.75, plain: 1.2, rise: 108, bowl: 40, th0: -0.6 };
function coneHeight(r) {
  if (r >= VOL.r0 + 4) return VOL.plain;
  if (r >= VOL.r1) { const t = Math.max(0, (VOL.r0 + 4 - r) / (VOL.r0 + 4 - VOL.r1)); return VOL.plain + VOL.rise * Math.pow(t, 1.25); }
  // inside the rim: the crater bowl falls away to a lava floor
  const rim = VOL.plain + VOL.rise; const u = Math.max(0, Math.min(1, (VOL.r1 - r) / 30));
  return rim - VOL.bowl * u * u * (3 - 2 * u);
}
const volcanoGround = (x, z) => coneHeight(Math.hypot(x, z));
const VOLCANO_DEF = {
  id: 'volcano', name: 'Volcano Climb', open: true, startS: 0.04, finishS: 0.985,
  theme: { a: [0.2, 0.17, 0.17], b: [0.16, 0.13, 0.13], edge: [0.38, 0.2, 0.14], far: [0.12, 0.08, 0.08], dirt: [0.34, 0.24, 0.19], rut: [0.25, 0.17, 0.14], sand: [0.5, 0.44, 0.42], sky: 'volcano', wall: [0.3, 0.2, 0.2] },
  checkpoints: [0, 0.3, 0.55, 0.78],
  scenery: ['stalagmite', 'stalagmite', 'moonrock'], sceneryCount: 160,
  keepScenery: (x, z) => { const r = Math.hypot(x, z); return r > VOL.r1 + 8 && r < 300; },
  ground: volcanoGround,
  structures: [{ type: 'lava', x: 0, z: 0, y: coneHeight(0) + 0.5, r: 26 }],
  paint(x, z, h, smp, c) {
    const r = Math.hypot(x, z);
    if (r < VOL.r1 + 3) {                                   // the crater glows towards the middle
      const g = Math.max(0, Math.min(1, (VOL.r1 + 3 - r) / 30));
      return [0.28 + 0.72 * g, 0.12 + 0.3 * g, 0.08];
    }
    if (smp.onRoad || smp.ad < 12 || r > VOL.r0 + 6) return null;
    const a = Math.atan2(z, x);
    const vein = Math.sin(a * 9 + r * 0.07) * Math.sin(a * 15 - r * 0.045 + 1.3);   // glowing lava veins down the flanks
    return vein > 0.9 ? [0.95, 0.38, 0.08] : null;
  },
  env: {
    openRoad: true, camAim: { yaw: 0.5, lift: 4 }, weather: 'embers', breeze: { x: 3, z: 0 },
    look: { sky: 'volcano', fog: ['#4a1a12', 140, 620], hemi: ['#ff8a50', '#3a0e08', 1.1], sun: ['#ff9a60', 2.2, -6, 8, 6] },
  },
  ctrl() {
    // an inward spiral: th grows, r shrinks, so the centre (the volcano) is on the right of the direction of travel
    const ctrl = []; const n = 52;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const th = VOL.th0 + 2 * Math.PI * VOL.turns * u;
      const r = VOL.r0 + (VOL.r1 - VOL.r0) * u;
      ctrl.push({ x: r * Math.cos(th), z: r * Math.sin(th) });
    }
    return ctrl;
  },
  elevation: (s, p) => coneHeight(Math.hypot(p.x, p.z)) + 0.3 * Math.sin(2 * Math.PI * 9 * s),
  sections: [
    { from: 0.0, to: 0.12, surf: 'asphalt' }, { from: 0.12, to: 0.5, surf: 'dirt' }, { from: 0.5, to: 0.62, surf: 'asphalt' },
    { from: 0.62, to: 0.8, surf: 'sand' }, { from: 0.8, to: 0.9, surf: 'dirt' }, { from: 0.9, to: 1.01, surf: 'asphalt' },
  ],
  features(T) {
    const { JUMP } = T;
    return [...JUMP(0.2, 1.4, 8)];
  },
  walls({ W }) {
    W.barrels(0.535, 1, 3); W.tnt(0.35, 2); W.crates(0.7, -1, 3);
    for (const [a, l] of [[0.19, 40], [0.3, 44], [0.46, 44], [0.58, 44], [0.72, 48], [0.83, 44]]) W.rocks(a, l);
    for (const [a, o, l] of [[0.07, 0, 8], [0.27, 0, 8], [0.52, 0, 8], [0.74, 0, 8], [0.9, 0, 8]]) W.pad(a, o, l, 5.5);
    W.goo(0.6, 3, 9, 5); W.oil(0.4, -3, 10, 5);
    for (const [a, o] of [[0.1, 0], [0.19, 0], [0.31, 0], [0.42, 0], [0.5, 0], [0.62, 0], [0.72, 0], [0.8, 0], [0.88, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, add }) {
    // puddles of floating lava that drift from the mountain side (right) across the road to the cliff side (left)
    const spec = [[0.14, 0], [0.14, 0.5], [0.28, 0.2], [0.42, 0.6], [0.42, 0.1], [0.56, 0.35], [0.66, 0.0], [0.66, 0.5], [0.76, 0.25], [0.88, 0.7]];
    for (const [s, ph] of spec) {
      const p = sampleAt(s);
      add({ kind: 'lavaflow', cx: p.x, cz: p.z, x: p.x, z: p.z, tx: p.tx, tz: p.tz, range: 9.5, r: 3.4, period: 7.5, phase: ph });
    }
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(67); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = 0.05 + rand() * 0.9; const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 1.8 + rand() * (SHOULDER - 3.6);
      const p = sampleAt(s);
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

// ---------------------------------------------------------------- 10. Inside the Volcano (sprint, part 2: the spiral DOWN the inside of the crater)
// An open-top crater: the road starts on the rim, spirals down the inner wall (the wall is on your LEFT, the drop into the
// crater on your right) and ends on a causeway over the lava lake, out through a great gate. Ditches, full-width jumps, lava
// puddles and boulders from the wall make it a hard one. The wall and the road come from ONE function, craterWall(r).
const CRA = { r0: 168, rEnd: 50, turns: 1.7, rFloor: 86, rim: 112, floor: 6, lava: 2.2, th0: 2.2 };
function craterWall(r) {
  if (r <= CRA.rFloor) return CRA.floor;
  const t = Math.min(1, (r - CRA.rFloor) / (CRA.r0 - CRA.rFloor));
  return CRA.floor + (CRA.rim - CRA.floor) * Math.pow(t, 1.2);
}
function craterGround(x, z) {
  const r = Math.hypot(x, z);
  if (r >= CRA.r0) { const lip = 9 * Math.max(0, 1 - Math.abs(r - (CRA.r0 + 14)) / 16); return Math.max(1.2, CRA.rim + lip - 0.9 * Math.max(0, r - (CRA.r0 + 14))); }
  if (r >= CRA.rFloor) return craterWall(r);
  const k = Math.max(0, Math.min(1, (r - (CRA.rFloor - 12)) / 12));
  return CRA.lava + (CRA.floor - CRA.lava) * k * k * (3 - 2 * k);       // the shore of the lava lake falls away from the causeway level
}
const CRATER_DEF = {
  id: 'crater', name: 'Inside the Volcano', open: true, startS: 0.04, finishS: 0.985,
  theme: { a: [0.2, 0.17, 0.17], b: [0.16, 0.13, 0.13], edge: [0.38, 0.2, 0.14], far: [0.12, 0.08, 0.08], dirt: [0.34, 0.24, 0.19], rut: [0.25, 0.17, 0.14], sand: [0.5, 0.44, 0.42], sky: 'volcano', wall: [0.3, 0.2, 0.2] },
  checkpoints: [0, 0.3, 0.55, 0.78],
  scenery: ['stalagmite', 'stalagmite', 'moonrock'], sceneryCount: 170,
  keepScenery: (x, z) => { const r = Math.hypot(x, z); return r > CRA.rFloor + 8 && r < CRA.r0 + 6; },
  ground: craterGround,
  structures: [{ type: 'lava', x: 0, z: 0, y: CRA.lava + 0.35, r: 96 }, { type: 'gate', ahead: 9 }],
  paint(x, z, h, smp, c) {
    const r = Math.hypot(x, z);
    if (!smp.onRoad && r < CRA.rFloor + 4 && smp.ad > 10) {                      // the lava lake and its glowing shore
      const g = Math.max(0, Math.min(1, (CRA.rFloor + 4 - r) / 30));
      return [0.55 + 0.45 * g, 0.2 + 0.25 * g, 0.06];
    }
    if (smp.onRoad || smp.ad < 12) return null;
    const a = Math.atan2(z, x);
    const vein = Math.sin(a * 11 + r * 0.06) * Math.sin(a * 17 - r * 0.05 + 0.7);
    return vein > 0.9 ? [0.95, 0.38, 0.08] : null;
  },
  env: {
    openRoad: true, camAim: { yaw: 0.45, lift: 2 }, weather: 'embers', breeze: { x: 3, z: 0 },
    look: { sky: 'volcano', fog: ['#4a1a12', 150, 700], hemi: ['#ff8a50', '#3a0e08', 1.15], sun: ['#ff9a60', 2.2, -6, 8, 6] },
  },
  ctrl() {
    // an inward spiral again (th grows, r shrinks): the centre of the crater is on the right, the wall on the left
    const ctrl = []; const n = 50;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      ctrl.push({ x: (CRA.r0 + (CRA.rEnd - CRA.r0) * u) * Math.cos(CRA.th0 + 2 * Math.PI * CRA.turns * u), z: (CRA.r0 + (CRA.rEnd - CRA.r0) * u) * Math.sin(CRA.th0 + 2 * Math.PI * CRA.turns * u) });
    }
    return ctrl;
  },
  elevation: (s, p) => craterWall(Math.hypot(p.x, p.z)) + 0.3 * Math.sin(2 * Math.PI * 11 * s),
  sections: [
    { from: 0.0, to: 0.1, surf: 'asphalt' }, { from: 0.1, to: 0.35, surf: 'dirt' }, { from: 0.35, to: 0.45, surf: 'sand' },
    { from: 0.45, to: 0.7, surf: 'dirt' }, { from: 0.7, to: 0.8, surf: 'sand' }, { from: 0.8, to: 1.01, surf: 'asphalt' },
  ],
  features(T) {
    const { feat, lateral, kicker, landing, LENGTH, sampleAt } = T;
    const F = [];
    // a full-width ditch: a ramp, a gap you have to jump, a landing
    const ditch = (s, w = 12.5) => {
      F.push(feat(s, 'ramp', { kind: 'ramp', w, profile: kicker(5, 2.2) }));
      F.push(feat(s + 5.4 / LENGTH, 'trench', { kind: 'pit', len: 4.4, w, depth: 2.8 }));
      F.push(feat(s + 12.4 / LENGTH, 'ramp', { kind: 'ramp', w, profile: landing(10, 1.0) }));
    };
    for (const s of [0.2, 0.43, 0.66, 0.82]) ditch(s);
    // fields of potholes: staggered across the road, so you weave between them
    const pot = (s0, list) => { for (const [d, off, r, depth] of list) F.push(lateral(s0 + d / LENGTH, off, { type: 'pit', kind: 'pit', r, depth })); };
    for (const s0 of [0.115, 0.255, 0.33, 0.49, 0.585, 0.715, 0.885]) {
      pot(s0, [[0, -3.5, 3.4, 1.4], [9, 3.2, 3.0, 1.2], [18, -1.5, 3.6, 1.5], [27, 4.2, 2.6, 1.0], [36, -4.2, 3.0, 1.3], [45, 1.0, 3.2, 1.4]]);
    }
    return F;
  },
  walls({ W }) {
    // blocks of stone on the wall side (left), in many stretches; ditches and puddles push you into them
    for (const [a, l] of [[0.075, 44], [0.15, 40], [0.285, 48], [0.375, 44], [0.52, 48], [0.62, 40], [0.76, 44], [0.855, 44]]) W.rocks(a, l);
    W.barrels(0.545, 1, 3); W.tnt(0.36, 2); W.crates(0.735, -1, 3); W.oil(0.27, -3, 10, 5); W.goo(0.47, 3, 9, 5); W.goo(0.74, -3, 9, 5);
    for (const [a, o, l] of [[0.06, 0, 8], [0.18, 0, 9], [0.405, 0, 9], [0.56, 0, 8], [0.635, 0, 9], [0.8, 0, 9], [0.9, 0, 8]]) W.pad(a, o, l, 5.5);   // a pad just before each ditch carries the heavy trucks over
    for (const [a, o] of [[0.09, 0], [0.18, 0], [0.31, 0], [0.4, 0], [0.5, 0], [0.64, 0], [0.73, 0], [0.8, 0], [0.88, 0]]) W.pickup(a, o);
  },
  hazards({ sampleAt, add }) {
    // lava puddles drift across the road from BOTH sides (dir -1: from the wall on the left; dir 1: from the crater side)
    const pud = [[0.095, 0, -1], [0.135, 0.4, 1], [0.215, 0.2, -1], [0.23, 0.7, 1], [0.305, 0.5, -1], [0.355, 0.1, 1], [0.415, 0.6, -1], [0.465, 0.3, -1], [0.53, 0.9, 1],
      [0.57, 0.2, -1], [0.605, 0.5, 1], [0.645, 0.0, -1], [0.7, 0.7, -1], [0.735, 0.3, 1], [0.8, 0.5, -1], [0.87, 0.1, 1], [0.905, 0.6, -1]];
    for (const [s, ph, dir] of pud) {
      const p = sampleAt(s);
      add({ kind: 'lavaflow', cx: p.x, cz: p.z, x: p.x, z: p.z, tx: p.tx, tz: p.tz, range: 9.5, r: 3.6, period: 6.5, phase: ph, dir });
    }
    // boulders rolling down off the wall: one trip across the road per period, then they drop into the crater
    const rolls = [[0.055, 0], [0.17, 0.3], [0.27, 0.6], [0.345, 0.15], [0.44, 0.45], [0.505, 0.75], [0.595, 0.05], [0.675, 0.5], [0.755, 0.25], [0.84, 0.65], [0.925, 0.35]];
    for (const [s, ph] of rolls) {
      const p = sampleAt(s);
      add({ kind: 'drifter', oneway: true, cx: p.x, cz: p.z, x: p.x, z: p.z, tx: p.tx, tz: p.tz, range: 9, r: 1.5, top: 3.0, period: 5.2, phase: ph });
    }
  },
  obstacles(T) {
    const { rng, sampleAt, ROAD_HALF, SHOULDER } = T;
    const rand = rng(71); const out = [];
    for (let i = 0; i < 30; i++) {
      const s = 0.05 + rand() * 0.9; const side = rand() < 0.5 ? -1 : 1; const off = ROAD_HALF + 6.5 + rand() * 3;
      const p = sampleAt(s);
      out.push({ type: 'boulder', x: p.x + p.tz * side * off, z: p.z - p.tx * side * off, r: 1.1 + rand() * 0.9, h: 1.0 + rand() * 0.8 });
    }
    return out;
  },
};

export const TRACKS = [makeTrack(GREENRIDGE_DEF), makeTrack(CANYON_DEF), makeTrack(FORTRESS_DEF), makeTrack(HIMALAYA_DEF), makeTrack(SKULL_DEF), makeTrack(MAGMA_DEF), makeTrack(MOON_DEF), makeTrack(SATURN_DEF), makeTrack(VOLCANO_DEF), makeTrack(CRATER_DEF)];
export const getTrackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
export const validTrack = (id) => TRACKS.some((t) => t.id === id);
