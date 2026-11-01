// Loop-the-loop: while a truck is "on the loop" it rides a scripted curve through the vertical plane of the track
// (a circle of radius R drifting forward by k per radian, so the exit is ahead of the entry). Pure maths.
//
// Loop definition (built by the track): { x, z, tx, tz, y0, R, k, halfW, vmin, gl }
//   (x,z) entry point on the centre line, (tx,tz) track direction, y0 road height, halfW half width of the ring,
//   vmin minimum entry speed (the boost pad at the entry guarantees it), gl effective gravity on the ring.
export const TWO_PI = Math.PI * 2;

export function loopPoint(L, th) {
  const fwd = L.R * Math.sin(th) + L.k * th;
  const y = L.R * (1 - Math.cos(th));
  const dfwd = L.R * Math.cos(th) + L.k;
  const dy = L.R * Math.sin(th);
  let phi = Math.atan2(dy, dfwd);
  if (th > Math.PI / 2 && phi < 0) phi += TWO_PI;       // keep turning past upside-down instead of wrapping
  return { fwd, y, phi, ds: Math.hypot(dfwd, dy) };
}

export const loopLength = (L) => TWO_PI * L.k;

// world position for a point on the ring at angle th and lateral offset lat (+ = right of travel)
export function loopWorld(L, th, lat) {
  const p = loopPoint(L, th);
  return { x: L.x + L.tx * p.fwd + L.tz * lat, z: L.z + L.tz * p.fwd - L.tx * lat, y: L.y0 + p.y, phi: p.phi, ds: p.ds };
}

// is this truck at the mouth of loop L, heading into it?
export function atEntry(L, v) {
  const dx = v.x - L.x; const dz = v.z - L.z;
  const along = dx * L.tx + dz * L.tz;
  const lat = dx * L.tz - dz * L.tx;
  if (along < -0.5 || along > 3.2 || Math.abs(lat) > L.halfW) return false;
  const align = Math.sin(v.heading) * L.tx + Math.cos(v.heading) * L.tz;
  const f = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  return align > 0.55 && f > 3;
}

export function startLoop(v, L) {
  const dx = v.x - L.x; const dz = v.z - L.z;
  const lat = dx * L.tz - dz * L.tx;
  const f = Math.max(0, v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading));
  v.loop = { L, th: 0, lat, entryV: Math.max(f, L.vmin), sp: Math.max(f, L.vmin) };
}

// advance one step; returns 'exit' when the truck leaves the ring
export function stepLoop(v, input, dt) {
  const lp = v.loop; const L = lp.L;
  const pt = loopPoint(L, lp.th);
  // energy: slower at the top, but the ring never stalls a truck
  lp.sp = Math.sqrt(Math.max(lp.entryV * lp.entryV - 2 * L.gl * pt.y, (0.55 * lp.entryV) ** 2));
  if (input.boost) lp.sp *= 1.1;
  lp.th += (lp.sp * dt) / pt.ds;
  lp.lat = Math.max(-(L.halfW - 1.8), Math.min(L.halfW - 1.8, lp.lat + (input.steer || 0) * 7 * dt));
  if (lp.th >= TWO_PI) return 'exit';
  const w = loopWorld(L, lp.th, lp.lat);
  const p = loopPoint(L, lp.th);
  const h = Math.atan2(L.tx, L.tz);
  v.x = w.x; v.z = w.z; v.y = w.y; v.heading = h;
  v.pitch = p.phi; v.roll = 0;
  const hs = lp.sp * Math.cos(p.phi);
  v.vx = L.tx * hs; v.vz = L.tz * hs; v.vy = lp.sp * Math.sin(p.phi);
  v.f = lp.sp; v.l = 0; v.grounded = false; v.yawRate = 0;
  return null;
}

export function exitLoop(v, ride = 0.3) {
  const lp = v.loop; const L = lp.L;
  const w = loopWorld(L, TWO_PI, lp.lat);
  v.x = w.x; v.z = w.z; v.y = w.y + ride;
  v.vx = L.tx * lp.sp; v.vz = L.tz * lp.sp; v.vy = 0;
  v.pitch = 0; v.roll = 0; v.grounded = true;
  v.loop = null;
}
