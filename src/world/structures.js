// Big set pieces built around the road from plain boxes (pure data, so tests can check clearances without three.js).
// A box is { x, y, z, sx, sy, sz, rot, color } with y at the CENTRE, like everything fed to instanced().

const lat = (p, o) => ({ x: p.x + p.tz * o, z: p.z - p.tx * o });

// SKULL CAVE: the road runs through the open mouth of a giant skull and out the back.
// spec: { s0, s1 } lap fractions. Inside, the tunnel is 31 wide and ROOF high; the road (14 wide) and its barriers (+-14) stay clear.
export const SKULL = { halfInner: 15.2, roof: 10.5, teeth: 6.6 };

export function skullCave(T, spec) {
  const bone = []; const rock = []; const glow = []; const dark = [];
  const { halfInner: HI, roof: ROOF, teeth: TEETH } = SKULL;
  const len = (spec.s1 - spec.s0) * T.LENGTH;
  const n = Math.max(2, Math.round(len / 1.7));
  const tone = (i, k) => 0.82 + (((i * 7 + k * 13) % 9) / 9) * 0.28;
  for (let i = 0; i <= n; i++) {
    const s = spec.s0 + ((spec.s1 - spec.s0) * i) / n;
    const p = T.sampleAt(s);
    const rot = Math.atan2(p.tx, p.tz);
    const y0 = p.y;
    // roof: a shallow arch of slabs across the whole width, thick enough to read as rock
    for (let o = -HI; o <= HI + 0.01; o += 2.6) {
      const arch = 2.2 * (1 - (o / HI) ** 2);
      const q = lat(p, o);
      rock.push({ x: q.x, y: y0 + ROOF + arch + 1.1, z: q.z, sx: 2.8, sy: 2.4, sz: 1.9, rot, tone: tone(i, o) });
    }
    // walls: from below ground up to the roof (both sides)
    for (const side of [-1, 1]) for (let h = -3; h < ROOF; h += 2.4) {
      const q = lat(p, side * (HI + 1.2));
      bone.push({ x: q.x, y: y0 + h + 1.2, z: q.z, sx: 2.6, sy: 2.5, sz: 1.9, rot, tone: tone(i, h + side) });
    }
    // the dome of the skull over the roof: three stepped layers, narrowing
    for (const [w, h, y] of [[HI * 1.7, 2.6, ROOF + 3.4], [HI * 1.25, 2.6, ROOF + 6], [HI * 0.8, 2.4, ROOF + 8.4]]) {
      const q = lat(p, 0);
      bone.push({ x: q.x, y: y0 + y, z: q.z, sx: w * 2, sy: h, sz: 1.9, rot, tone: tone(i, y) });
    }
    // glow: crystals along the foot of both walls, a lantern hanging down the middle
    if (i % 4 === 1) for (const side of [-1, 1]) {
      const q = lat(p, side * (HI - 0.9));
      glow.push({ x: q.x, y: y0 + 1.3, z: q.z, sx: 0.8, sy: 2.6 + (i % 3), sz: 0.8, rot, color: i % 8 < 4 ? '#4be3ff' : '#c05cff' });
    }
    if (i % 6 === 3) { const q = lat(p, ((i % 12) - 6) * 0.9); glow.push({ x: q.x, y: y0 + ROOF - 1.1, z: q.z, sx: 0.7, sy: 1.1, sz: 0.7, rot, color: '#8dff6a' }); }
  }
  // the two faces (front and back): brow, eye sockets, nose hole and a fringe of teeth over the mouth
  for (const [s, dir] of [[spec.s0, -1], [spec.s1, 1]]) {
    const p = T.sampleAt(s); const rot = Math.atan2(p.tx, p.tz); const y0 = p.y;
    const f = (o, h, ahead = 0) => { const q = lat({ x: p.x + p.tx * ahead * dir, z: p.z + p.tz * ahead * dir, tx: p.tx, tz: p.tz }, o); return { x: q.x, z: q.z, y: y0 + h }; };
    const put = (arr, o, h, sx, sy, sz, extra = {}, ahead = 0) => arr.push({ ...f(o, h, ahead), sx, sy, sz, rot, ...extra });
    // brow plate above the opening
    for (let o = -HI - 3; o <= HI + 3.01; o += 2.8) put(bone, o, ROOF + 1.4 + 2.2 * (1 - (o / (HI + 3)) ** 2), 2.9, 3.4, 2.2, { tone: tone(o, 3) });
    // cheek bones either side of the opening
    for (const side of [-1, 1]) for (let h = -3; h < ROOF; h += 2.6) put(bone, side * (HI + 3.2), h + 1.3, 3.2, 2.7, 2.6, { tone: tone(h, side) });
    // upper face: forehead, eye sockets (dark, with a glowing eye) and nose
    for (let o = -HI - 3; o <= HI + 3.01; o += 2.8) for (const h of [ROOF + 5.0, ROOF + 7.4]) put(bone, o, h, 2.9, 2.5, 2.4, { tone: tone(o, h) }, 0.2);
    for (const side of [-1, 1]) {
      put(dark, side * 8.6, ROOF + 5.9, 7.4, 4.4, 0.7, {}, 1.5);
      put(glow, side * 8.6, ROOF + 5.9, 2.6, 2.6, 0.5, { color: '#7dff5a' }, 1.9);
    }
    put(dark, 0, ROOF + 5.2, 2.8, 3.2, 0.7, {}, 1.5);
    // teeth: a fringe hanging from the top of the mouth, well above the trucks
    for (let o = -HI + 1; o <= HI - 0.9; o += 2.5) put(bone, o, ROOF - 0.6 - (((o * 7) | 0) % 2) * 0.5, 1.5, TEETH * 0.0 + 3.2, 1.6, { tone: 1.1 }, 0.4);
    // jaw stumps at the foot of the cheek bones, outside the barrier line
    for (const side of [-1, 1]) for (const [o, h] of [[HI + 0.6, 0.9], [HI - 0.4, 0.7]]) put(bone, side * o, h, 1.7, 1.8, 1.7, { tone: 1.15 }, 0.9);
  }
  return { bone, rock, glow, dark };
}
