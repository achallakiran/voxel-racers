// Arena rival: picks the nearest living truck, drives at it, lunges with nitro when lined up, keeps off the wall,
// and backs out when stuck. Pure.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export function createBrawler({ aggression = 0.8, phase = 0 } = {}) {
  return { aggression, phase, targetT: 0, target: null, stuckT: 0, reverseT: 0, reverseSteer: 1, lungeCd: 3 + phase % 3 };
}

// others: array of {x,z,vx,vz,wrecked}. radius: arena radius.
export function brawlerInput(b, v, others, radius, phase, dt) {
  if (phase !== 'fight') return { steer: 0, gas: 0, brake: 1, boost: false };
  const speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);

  if (b.reverseT > 0) {
    b.reverseT -= dt;
    return { steer: b.reverseSteer, gas: 0, brake: 1, boost: false };
  }
  b.targetT -= dt;
  if (!b.target || b.target.wrecked || b.targetT <= 0) {
    b.targetT = 1.2;
    let best = null; let bd = 1e9;
    for (const o of others) {
      if (o === v || o.wrecked) continue;
      const d = Math.hypot(o.x - v.x, o.z - v.z);
      if (d < bd) { bd = d; best = o; }
    }
    b.target = best;
  }
  let tx = 0; let tz = 0;
  const t = b.target;
  if (t) {
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    const lead = Math.min(0.6, d / 40);
    tx = t.x + t.vx * lead; tz = t.z + t.vz * lead;
  }
  // stay inside the bowl: near the wall, aim for the middle
  const fromC = Math.hypot(v.x, v.z);
  if (fromC > radius - 7) { tx = 0; tz = 0; }
  const diff = wrap(Math.atan2(tx - v.x, tz - v.z) - v.heading);
  const steer = clamp(-diff * 2.6, -1, 1);
  const dist = Math.hypot(tx - v.x, tz - v.z);

  let gas = 1; let brake = 0; let boost = false;
  if (Math.abs(diff) > 1.3 && speed > 8) { gas = 0.3; brake = 1; }          // turn around instead of orbiting
  b.lungeCd -= dt;
  if (t && b.lungeCd <= 0 && Math.abs(diff) < 0.22 && dist > 7 && dist < 24 && v.nitro >= 0.4 && Math.random() < b.aggression) {
    boost = true; b.lungeCd = 4 + Math.random() * 3;
  }
  if (v.grounded && Math.abs(speed) < 1.0) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt * 2);
  if (b.stuckT > 1.2) { b.stuckT = 0; b.reverseT = 1.0; b.reverseSteer = -steer || 1; }
  return { steer, gas, brake, boost };
}
