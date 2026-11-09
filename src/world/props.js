// Destructible arena props, in three tiers:
//   smash  - crates, barrels, cars, fences: a truck at speed plows straight through them
//   break  - brick walls: they bounce you and crack until they give way
//   blast  - TNT and fuel trucks: smashing them explodes, hurting trucks and chaining to neighbours
// Pure data and rules (no three.js).
import { rng } from './layout.js';
import { heightAt, SANDBOX, OBSTACLES, terrain as BASE } from './arena-layout.js';

export const DEFS = {
  crate:  { tier: 'smash', r: 0.8, h: 0.8, breakAt: 3.5, score: 50,  debris: 8,  colors: ['#b98a4e', '#a37540', '#d3a669'] },
  barrel: { tier: 'smash', r: 0.6, h: 1.0, breakAt: 3.0, score: 50,  debris: 8,  colors: ['#3a7bd5', '#2c5fa8', '#c9d4e8'] },
  fence:  { tier: 'smash', r: 0.9, h: 1.1, breakAt: 2.5, score: 40,  debris: 6,  colors: ['#f1f1f1', '#d6d6d6', '#c43a3a'] },
  car:    { tier: 'smash', r: 1.7, h: 0.9, breakAt: 6.5, score: 120, debris: 20, colors: ['#d62828', '#4cc9f0', '#ffd60a', '#80ed99', '#2b2d42'] },
  wall:   { tier: 'break', r: 1.6, h: 2.2, hp: 3, score: 150, debris: 26, colors: ['#a9553a', '#8c4630', '#c9b8a4'] },
  tnt:    { tier: 'blast', r: 0.8, h: 0.9, breakAt: 3.0, score: 100, debris: 6, blast: { radius: 9, power: 38 },  colors: ['#d62828', '#f4f1ea', '#8a1c1c'] },
  fuel:   { tier: 'blast', r: 2.2, h: 1.8, breakAt: 5.0, score: 200, debris: 22, blast: { radius: 14, power: 60 }, colors: ['#e8e8ea', '#d62828', '#6b6b72'] },
};

// Candidate groups: [type, count, ring min, ring max]. Positions come from a seeded rng and are only
// accepted on flat ground clear of the start, the static obstacles and each other.
const GROUPS = [
  ['crate', 14, 8, 40], ['barrel', 12, 8, 40], ['car', 8, 10, 40], ['fence', 10, 10, 40],
  ['wall', 6, 12, 38], ['tnt', 6, 8, 38], ['fuel', 2, 14, 36],
];

export function arenaProps(seed = 21) {
  const rand = rng(seed);
  const placed = [];
  let id = 0;
  const flat = (x, z, r) => {
    for (let a = 0; a < 6; a++) {
      const hx = x + Math.cos(a * 1.047) * r; const hz = z + Math.sin(a * 1.047) * r;
      if (Math.abs(heightAt(hx, hz)) > 0.12) return false;
    }
    return Math.abs(heightAt(x, z)) < 0.12;
  };
  for (const [type, count, r0, r1] of GROUPS) {
    const def = DEFS[type];
    let made = 0; let guard = 0;
    while (made < count && guard++ < 4000) {
      const ang = rand() * Math.PI * 2;
      const rad = r0 + rand() * (r1 - r0);
      const x = Math.cos(ang) * rad; const z = Math.sin(ang) * rad;
      if (Math.hypot(x - SANDBOX.start.x, z - SANDBOX.start.z) < 12) continue;
      if (Math.hypot(x, z) > SANDBOX.radius - 5) continue;
      if (!flat(x, z, def.r + 0.6)) continue;
      if (OBSTACLES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + def.r + 1.5)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + def.r + 1.2)) continue;
      placed.push({
        id: id++, type, tier: def.tier, x, z, r: def.r, h: def.h, rot: rand() * Math.PI, hp: def.hp || 1,
        breakAt: def.breakAt, color: def.colors[Math.floor(rand() * def.colors.length)],
      });
      made++;
    }
  }
  return placed;
}

// A fresh playable terrain for one round: the static scenery plus live props (each as a collision obstacle).
export function createArenaTerrain(props = arenaProps()) {
  const live = props.map((p) => ({ ...p }));
  return { ...BASE, obstacles: [...OBSTACLES, ...live], props: live };
}

export function removeProp(terrain, prop) {
  const i = terrain.obstacles.indexOf(prop);
  if (i >= 0) terrain.obstacles.splice(i, 1);
  const j = terrain.props.indexOf(prop);
  if (j >= 0) terrain.props.splice(j, 1);
}

// A truck hit a break-tier prop. Returns 'cracked' or 'destroyed'.
export function hitProp(prop, power) {
  if (prop.tier !== 'break') return 'none';
  if (power < 4) return 'none';
  prop.hp -= 1 + Math.floor(power / 9);
  return prop.hp <= 0 ? 'destroyed' : 'cracked';
}

// Blow up `origin` (a blast prop) and everything it chains into. Mutates the terrain.
// Returns the explosions (in order), the props destroyed, and the score they are worth.
export function detonate(terrain, origin) {
  const explosions = []; const destroyed = []; let score = 0;
  const queue = [origin];
  const done = new Set();
  while (queue.length) {
    const b = queue.shift();
    if (done.has(b.id)) continue;
    done.add(b.id);
    const def = DEFS[b.type];
    explosions.push({ x: b.x, z: b.z, radius: def.blast.radius, power: def.blast.power, type: b.type });
    destroyed.push(b); score += def.score;
    removeProp(terrain, b);
    for (const q of [...terrain.props]) {
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d > def.blast.radius) continue;
      if (q.tier === 'blast') { queue.push(q); continue; }
      const f = 1 - d / def.blast.radius;
      if (q.tier === 'smash' || (q.tier === 'break' && (q.hp -= Math.ceil(def.blast.power * f / 12)) <= 0)) {
        destroyed.push(q); score += DEFS[q.type].score; removeProp(terrain, q);
      }
    }
  }
  return { explosions, destroyed, score };
}

// Paint the Town: a flat round asphalt arena, nothing to hit but the wall
export function createPaintTerrain(radius = 38) {
  return { heightAt: () => 0, obstacles: [], props: [], radius, surfaceAt: () => 'asphalt', hazards: [] };
}

// Sumo Plate: the raised disc; its height comes from the live round (rings that have fallen are holes down to the ground)
export function createSumoTerrain(ref) {          // ref.round is the live round (it is replaced each round)
  return { heightAt: (x, z) => ref.round.heightAt(x, z), obstacles: [], props: [], radius: 60, surfaceAt: () => 'asphalt', hazards: [] };
}
