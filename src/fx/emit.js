// Emission rules for exhaust emitters. Pure functions.

export const QUALITY_SCALE = { low: 0.35, medium: 0.65, high: 1 };

// Particles per second for one emitter.
//   smoke: idles lightly and thickens with the revs
//   flame: only pops when the revs drop quickly (throttle lift)
export function emissionRate(kind, rev, decel = 0) {
  const r = Math.min(1, Math.max(0, rev));
  if (kind === 'smoke') return 6 + 40 * r * r;
  if (kind === 'flame') return decel > 0.6 ? 70 : (r > 0.85 ? 8 : 0);
  if (kind === 'spark') return 9 + 26 * r;          // electric crackle: always on, busier with speed
  return 0;
}

// Turns a fractional per-frame budget into a whole number of spawns, carrying the remainder.
export function takeSpawns(carry, rate, dt, scale = 1) {
  const total = carry + rate * dt * scale;
  const n = Math.floor(total);
  return { n, carry: total - n };
}

// Initial particle parameters for an emitter kind (jitter values u in 0..1 are passed in
// so the function stays deterministic and testable).
export function makeParticle(kind, tint, base, dir, rev, u1, u2, u3) {
  if (kind === 'spark') {
    const len2 = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const sp = 1.4 + rev * 2.2;
    return {
      x: base.x, y: base.y, z: base.z,
      vx: (dir.x / len2) * sp + (u1 - 0.5) * 2.2, vy: (dir.y / len2) * sp + (u3 - 0.2) * 1.8, vz: (dir.z / len2) * sp + (u2 - 0.5) * 2.2,
      life: 0.25 + u3 * 0.35, size: 0.06 + u1 * 0.06, rise: -2.5, tint,
    };
  }
  const speed = kind === 'flame' ? 1.6 + rev : 0.5 + rev * 1.1;
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const spread = kind === 'flame' ? 0.35 : 0.22;
  return {
    x: base.x + (u1 - 0.5) * 0.04, y: base.y, z: base.z + (u2 - 0.5) * 0.04,
    vx: (dir.x / len) * speed + (u1 - 0.5) * spread,
    vy: (dir.y / len) * speed + (u3 - 0.5) * spread * 0.5,
    vz: (dir.z / len) * speed + (u2 - 0.5) * spread,
    life: kind === 'flame' ? 0.22 + u3 * 0.18 : 1.1 + u3 * 0.9 + rev * 0.5,
    size: kind === 'flame' ? 0.07 + u1 * 0.05 : 0.08 + u2 * 0.06,
    rise: kind === 'flame' ? 0.4 : 0.9,
    tint,
  };
}

// Visual size of a particle over its life. Smoke puffs grow then shrink away
// (voxel-style fade), flames shrink steadily.
export function particleScale(kind, t, size) {
  const x = Math.min(1, Math.max(0, t));
  if (kind === 'flame' || kind === 'spark') return size * (1 - x * 0.75);
  const grow = 0.7 + 1.2 * Math.min(1, x * 2);
  const fade = Math.max(0, 1 - Math.max(0, (x - 0.7) / 0.3));
  return size * grow * fade;
}
