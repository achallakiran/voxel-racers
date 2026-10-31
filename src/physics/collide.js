// Truck-vs-truck collisions: circles with a little bounce. Pure; mutates the vehicles it is given.
export const TRUCK_R = 1.6;

// vehicles: array of vehicle states ({x,y,z,vx,vz,mass?}). Returns [{a, b, power}] for each contact.
export function resolveCollisions(vehicles, restitution = 0.4) {
  const hits = [];
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i]; const b = vehicles[j];
      if (Math.abs(a.y - b.y) > 1.6) continue;          // one is flying over the other
      let dx = b.x - a.x; let dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = TRUCK_R * 2;
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      const ma = a.mass || 1; const mb = b.mass || 1;
      const push = (min - d);
      a.x -= dx * push * (mb / (ma + mb)); a.z -= dz * push * (mb / (ma + mb));
      b.x += dx * push * (ma / (ma + mb)); b.z += dz * push * (ma / (ma + mb));
      const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;   // closing speed along the normal (negative = approaching)
      if (rv < 0) {
        const j2 = (-(1 + restitution) * rv) / (1 / ma + 1 / mb);
        a.vx -= (j2 / ma) * dx; a.vz -= (j2 / ma) * dz;
        b.vx += (j2 / mb) * dx; b.vz += (j2 / mb) * dz;
        hits.push({ a: i, b: j, power: -rv });
      }
    }
  }
  return hits;
}
