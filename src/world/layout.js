// Pure layout data for the title arena ("stadium at sunset"). No three.js, so it is
// deterministic and unit tested in Node. The truck sits at the origin; everything
// here keeps clear of it (ARENA.truckClear) and the camera looks toward -z.

export const ARENA = {
  truckClear: 3.2,     // nothing may sit within this radius of the truck
  wallRadius: 10.5,    // tire wall
  standInner: 14,      // first crowd tier
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arc = (r, a) => ({ x: Math.cos(a) * r, z: -Math.sin(a) * r });

// Tire wall: stacks of 3 tires around the back half of the arena. c: 0 black, 1 white, 2 red.
export function tireWallLayout() {
  const out = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.03 + 0.94 * (i / (n - 1)));
    const { x, z } = arc(ARENA.wallRadius, a);
    for (let h = 0; h < 3; h++) {
      out.push({ x, y: 0.1 + h * 0.2, z, rot: -a + Math.PI / 2, c: i % 8 === 3 ? 1 : (i % 12 === 7 ? 2 : 0) });
    }
  }
  return out;
}

// Concrete stand blocks and the crowd on them.
export const CROWD_COLORS = ['#e63946', '#ffd60a', '#4cc9f0', '#80ed99', '#f8f9fa', '#ff9f1c', '#b185db', '#2a9d8f'];
export const SKIN_COLORS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];

export function standsLayout(seed = 11) {
  const rand = rng(seed);
  const tiers = [
    { r: ARENA.standInner, h: 0.8 },
    { r: ARENA.standInner + 2.3, h: 1.7 },
    { r: ARENA.standInner + 4.6, h: 2.6 },
    { r: ARENA.standInner + 6.9, h: 3.5 },
  ];
  const stands = [];
  const people = [];
  for (const t of tiers) {
    const step = 0.55 / t.r;
    for (let a = 0.02 * Math.PI; a <= 0.98 * Math.PI; a += step) {
      const { x, z } = arc(t.r, a);
      stands.push({ x, y: t.h / 2, z, h: t.h, rot: -a + Math.PI / 2 });
      if (rand() < 0.9) {
        people.push({
          x, y: t.h + 0.22, z, rot: -a + Math.PI / 2,
          shirt: Math.floor(rand() * CROWD_COLORS.length),
          skin: Math.floor(rand() * SKIN_COLORS.length),
          arms: rand() < 0.2, // cheering
        });
      }
    }
  }
  return { stands, people, tiers };
}

// Floodlight towers between the tire wall and the stands.
export function towersLayout() {
  return [0.14, 0.4, 0.6, 0.86].map((f) => ({ ...arc(12.3, Math.PI * f), h: 7.2 }));
}

// Distant stepped mesas.
export function mesasLayout(seed = 5) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (0.02 + 0.96 * (i / 9)) + (rand() - 0.5) * 0.1;
    const r = 50 + rand() * 14;
    const { x, z } = arc(r, a);
    out.push({ x, z, w: 9 + rand() * 12, d: 7 + rand() * 8, h: 6 + rand() * 9, steps: 2 + Math.floor(rand() * 3) });
  }
  return out;
}

export function cloudsLayout(seed = 3) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const cubes = [];
    const n = 7 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      cubes.push({ x: (k - n / 2) * 1.6 + (rand() - 0.5), y: (rand() - 0.5) * 0.9, z: (rand() - 0.5) * 2, s: 1.6 + rand() * 1.4 });
    }
    out.push({ x: -70 + rand() * 140, y: 20 + rand() * 12, z: -85 + rand() * 20, cubes });
  }
  return out;
}

export function dustLayout(seed = 9) {
  const rand = rng(seed);
  return Array.from({ length: 70 }, () => ({
    x: (rand() - 0.5) * 16, y: 0.2 + rand() * 3, z: -8 + rand() * 12, s: 0.025 + rand() * 0.03, v: 0.1 + rand() * 0.25,
  }));
}

// Dirt jump ramp (stepped wedge). Local coords along +z, placed at `at` and rotated.
export function rampLayout() {
  const steps = [];
  const n = 9;
  for (let i = 0; i < n; i++) steps.push({ y: 0.06 * (i + 1) * 2, z: i * 0.34, w: 2.6, h: 0.07 * (i + 1), d: 0.34 });
  return { at: { x: -4.4, z: -3.6, rot: 0.55 }, steps, mound: { w: 3.4, h: 0.5, d: 1.8, z: n * 0.34 + 0.9 } };
}

// Crushed-car pile (flattened boxes).
export function carPileLayout() {
  const cars = [
    { x: 3.8, y: 0.18, z: -8.6, rot: 0.3, c: '#d62828' },
    { x: 4.2, y: 0.52, z: -8.3, rot: -0.4, c: '#4cc9f0' },
    { x: 3.6, y: 0.86, z: -8.5, rot: 0.9, c: '#ffd60a' },
    { x: 6.5, y: 0.18, z: -7.2, rot: 1.2, c: '#80ed99' },
  ];
  return cars.map((c) => ({ ...c, body: { w: 1.7, h: 0.32, d: 0.8 }, cabin: { w: 0.8, h: 0.24, d: 0.6, dx: -0.1 } }));
}
