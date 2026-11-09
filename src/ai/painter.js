// Paint the Town rival. Two styles, both reading only the public tile map:
//   sweeper - heads for the nearest patch of tiles that are not its own, sweeping clean lines
//   raider  - heads for the leader's territory (when it is not itself the leader), spoiling it
// Pure.
import { slotAt, hasBucket } from '../core/paint.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export function createPainter({ style = 'sweeper', phase = 0, seed = 1 } = {}) {
  return { style, phase, seed, targetT: 0, tx: 0, tz: 0, stuckT: 0, reverseT: 0, reverseSteer: 1, boostCd: 4 + phase };
}

// how much a tile is worth to `who` right now (1 = not mine and free to take)
function worth(m, slot, who, prey) {
  if (slot < 0) return 0;
  const o = m.owner[slot];
  if (o === who) return 0;
  if (o >= 0 && m.sealUntil[slot] > m.time) return 0;
  if (prey >= 0) return o === prey ? 1.4 : (o < 0 ? 0.5 : 0.8);
  return o < 0 ? 1.1 : 0.9;
}

function pickTarget(p, m, who, v, leaderId) {
  const prey = p.style === 'raider' && leaderId !== who ? leaderId : -1;
  let best = null; let bs = -1e9;
  const rings = [7, 13, 20];
  for (const rr of rings) for (let k = 0; k < 14; k++) {
    const a = ((k + p.phase * 0.37 + rr * 0.1) / 14) * Math.PI * 2;
    const x = v.x + Math.cos(a) * rr; const z = v.z + Math.sin(a) * rr;
    if (Math.hypot(x, z) > m.radius - 3) continue;
    let sum = 0; let cnt = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { sum += worth(m, slotAt(m, x + di * m.tile, z + dj * m.tile), who, prey); cnt++; }
    const turn = Math.abs(wrap(Math.atan2(x - v.x, z - v.z) - v.heading));
    const s = sum / cnt * 10 - rr * 0.18 - turn * 1.1 + ((a * 7.3 + p.phase) % 1) * 0.6;
    if (s > bs) { bs = s; best = { x, z }; }
  }
  return best || { x: 0, z: 0 };
}

// returns { steer, gas, brake, boost, hold }
export function painterInput(p, m, who, v, leaderId, phase, dt, spinning) {
  if (phase !== 'play') return { steer: 0, gas: 0, brake: 0, boost: false, hold: true };
  if (spinning) return { steer: 1, gas: 0, brake: 0.4, boost: false };
  const speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  if (p.reverseT > 0) { p.reverseT -= dt; return { steer: p.reverseSteer, gas: 0, brake: 1, boost: false }; }
  p.targetT -= dt;
  const reached = Math.hypot(p.tx - v.x, p.tz - v.z) < 4;
  if (p.targetT <= 0 || reached) { p.targetT = 1.1; const t = pickTarget(p, m, who, v, leaderId); p.tx = t.x; p.tz = t.z; }
  let tx = p.tx; let tz = p.tz;
  if (Math.hypot(v.x, v.z) > m.radius - 5) { tx = 0; tz = 0; }                  // never ride the wall
  const diff = wrap(Math.atan2(tx - v.x, tz - v.z) - v.heading);
  const steer = clamp(-diff * 2.4, -1, 1);
  let gas = 1; let brake = 0; let boost = false;
  if (Math.abs(diff) > 1.4 && speed > 8) { gas = 0.3; brake = 1; }
  p.boostCd -= dt;
  const far = Math.hypot(tx - v.x, tz - v.z);
  if (p.boostCd <= 0 && v.nitro >= 0.55 && Math.abs(diff) < 0.3 && far > 9) { boost = true; p.boostCd = 3 + (p.phase % 3); }
  if (hasBucket(m, who)) boost = false;
  if (v.grounded && Math.abs(speed) < 1.0) p.stuckT += dt; else p.stuckT = Math.max(0, p.stuckT - dt * 2);
  if (p.stuckT > 1.2) { p.stuckT = 0; p.reverseT = 1.0; p.reverseSteer = -steer || 1; }
  return { steer, gas, brake, boost };
}
