// Truck damage model. Pure functions that mutate the vehicles they are given.
// Health is 0..maxHp. A truck pointing at what it hits takes less than one that is hit side-on or from behind.

export const RAM_MIN_POWER = 5;      // closing speed below this is a bump, not damage

// how squarely truck v faces point (px, pz): 1 = nose on, -1 = tail on
export function facing(v, px, pz) {
  const dx = px - v.x; const dz = pz - v.z;
  const d = Math.hypot(dx, dz) || 1;
  return (Math.sin(v.heading) * dx + Math.cos(v.heading) * dz) / d;
}

// damage each of two colliding trucks takes for a closing speed `power`
export function ramDamage(a, b, power) {
  if (power < RAM_MIN_POWER) return { a: 0, b: 0 };
  const base = (power - RAM_MIN_POWER) * 1.4 + 2;
  const exposure = (v, other) => 1 - 0.4 * facing(v, other.x, other.z);   // 0.6 head-on .. 1.4 from behind
  return { a: base * exposure(a, b), b: base * exposure(b, a) };
}

export function applyDamage(v, dmg) {
  if (v.wrecked || dmg <= 0) return false;
  v.hp = Math.max(0, v.hp - dmg);
  if (v.hp <= 0) { v.wrecked = true; return true; }   // true = this hit wrecked it
  return false;
}

// Blast: damages and launches trucks within `radius` (falls off with distance).
export function blastTrucks(trucks, x, z, radius, power) {
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
    const wrecked = applyDamage(v, dmg);
    out.push({ index, dmg, wrecked });
  });
  return out;
}
