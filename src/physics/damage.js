// Truck damage model. Pure functions that mutate the vehicles they are given.
// Health is 0..maxHp. A truck pointing at what it hits takes less than one that is hit side-on or from behind.

export const RAM_MIN_POWER = 5;      // closing speed below this is a bump, not damage

// how squarely truck v faces point (px, pz): 1 = nose on, -1 = tail on
export function facing(v, px, pz) {
  const dx = px - v.x; const dz = pz - v.z;
  const d = Math.hypot(dx, dz) || 1;
  return (Math.sin(v.heading) * dx + Math.cos(v.heading) * dz) / d;
}

// Who attacked? The truck driving harder AT the other (its speed along the line between them, measured before the
// collision pushed them apart). If one is clearly the attacker, only the victim takes damage; if both drive at each
// other (head-on) both do. Without velocities both take damage as before.
export const ATTACK_RATIO = 1.3;
export function attacker(a, b, pre) {
  if (!pre) return 'both';
  const dx = b.x - a.x; const dz = b.z - a.z; const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d; const uz = dz / d;
  const ap = Math.max(0, pre.a.vx * ux + pre.a.vz * uz);          // a closing on b
  const bp = Math.max(0, -(pre.b.vx * ux + pre.b.vz * uz));       // b closing on a
  if (ap > bp * ATTACK_RATIO) return 'a';
  if (bp > ap * ATTACK_RATIO) return 'b';
  return 'both';
}

// damage each of two colliding trucks takes for a closing speed `power`
export function ramDamage(a, b, power, pre) {
  if (power < RAM_MIN_POWER) return { a: 0, b: 0 };
  const base = (power - RAM_MIN_POWER) * 1.4 + 2;
  const exposure = (v, other) => 1 - 0.4 * facing(v, other.x, other.z);   // 0.6 head-on .. 1.4 from behind
  const out = { a: base * exposure(a, b), b: base * exposure(b, a) };
  const who = attacker(a, b, pre);
  if (who === 'a') out.a = 0;           // a rammed b: only b is hurt
  else if (who === 'b') out.b = 0;
  return out;
}

export function applyDamage(v, dmg) {
  if (v.wrecked || dmg <= 0) return false;
  v.hp = Math.max(0, v.hp - dmg);
  if (v.hp <= 0) { v.wrecked = true; return true; }   // true = this hit wrecked it
  return false;
}

// Blast: damages and launches trucks within `radius` (falls off with distance).
export function blastTrucks(trucks, x, z, radius, power, ownerIndex = -1) {
  const out = [];
  trucks.forEach((v, index) => {
    if (v.wrecked) return;
    const dx = v.x - x; const dz = v.z - z;
    const d = Math.hypot(dx, dz);
    if (d > radius) return;
    const f = 1 - d / radius;
    const nx = d < 1e-4 ? 0 : dx / d; const nz = d < 1e-4 ? 1 : dz / d;
    const dmg = power * f * f + power * 0.15 * f;
    v.vx += nx * 16 * f; v.vz += nz * 16 * f; v.vy += 9 * f; v.grounded = false;
    const wrecked = index === ownerIndex ? false : applyDamage(v, dmg);       // your own blast shoves you but never hurts you
    out.push({ index, dmg, wrecked });
  });
  return out;
}
