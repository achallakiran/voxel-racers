// Chain lightning for Volt: pure maths (no three.js) so it is unit tested.
export const ZAP_COST = 0.25;       // charge per zap
export const ZAP_REGEN = 0.07;      // charge per second
export const ZAP_RANGE = 15;        // first target must be within this of Volt
export const ZAP_HOP = 11;          // each further hop within this of the last target
export const ZAP_HOPS = 3;
export const ZAP_DAMAGE = 12;       // arena damage per hit
export const ZAP_SLOW = 0.6;        // race: speed multiplier on a zapped rival

// A jagged bolt from a to b: `segments` points with sideways jitter that is zero at both ends. u() returns 0..1.
export function boltPath(a, b, u, segments = 9, jitter = 0.8) {
  const pts = [];
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  // two perpendicular axes to the bolt
  let px = -dz; let pz = dx; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
  const qx = (dy * pz) / len; const qy = (dz * px - dx * pz) / len; const qz = (-dy * px) / len;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = Math.sin(Math.PI * t) * jitter * Math.min(2, len * 0.12);
    const j1 = (u() - 0.5) * 2 * w; const j2 = (u() - 0.5) * 2 * w;
    pts.push({ x: a.x + dx * t + px * j1 + qx * j2, y: a.y + dy * t + qy * j2, z: a.z + dz * t + pz * j1 + qz * j2 });
  }
  pts[0] = { x: a.x, y: a.y, z: a.z }; pts[segments] = { x: b.x, y: b.y, z: b.z };
  return pts;
}

// Which trucks does a zap from `origin` jump to? candidates: [{ id, x, y, z }]. Returns an ordered chain.
export function chainTargets(origin, candidates, { range = ZAP_RANGE, hop = ZAP_HOP, hops = ZAP_HOPS } = {}) {
  const used = new Set(); const chain = [];
  let from = origin; let reach = range;
  for (let k = 0; k < hops; k++) {
    let best = null; let bd = reach;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const d = Math.hypot(c.x - from.x, c.z - from.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) break;
    used.add(best.id); chain.push(best); from = best; reach = hop;
  }
  return chain;
}

// zap charge bookkeeping
export const chargeTick = (c, dt) => Math.min(1, c + ZAP_REGEN * dt);
export const canZap = (c) => c >= ZAP_COST;
