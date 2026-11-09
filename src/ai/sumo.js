// Sumo rival. Stay on the disc, go for whoever is nearest the edge, dash when lined up, retreat when the next ring is about to fall. Pure.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export function createSumoBot({ aggression = 0.7, phase = 0 } = {}) {
  return { aggression, phase, targetT: 0, target: null, stuckT: 0, reverseT: 0, reverseSteer: 1, dashCd: 3 + phase % 3 };
}

// round: the sumo round state; others: [{x,z,vx,vz,alive}] by slot; me: slot
export function sumoInput(b, round, me, v, others, dt) {
  if (round.phase !== 'play') return { steer: 0, gas: 0, brake: 0, boost: false, hold: true };
  if (!round.alive[me]) return { steer: 0, gas: 0, brake: 1, boost: false, hold: true };
  if (round.isStunned(me)) return { steer: 1, gas: 0, brake: 0.3, boost: false };
  const speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  if (b.reverseT > 0) { b.reverseT -= dt; return { steer: b.reverseSteer, gas: 0, brake: 1, boost: false }; }
  const rr = Math.hypot(v.x, v.z);
  const safe = round.cracking() || round.gone < 4 ? Math.min(round.safeRadius(), round.radius()) : round.radius();
  const margin = safe - rr;
  let tx; let tz; let retreat = false;
  if (margin < 4 || (round.cracking() && rr > round.safeRadius() - 3)) { retreat = true; tx = 0; tz = 0; }
  else {
    b.targetT -= dt;
    if (!b.target || !round.alive[b.target.slot] || b.targetT <= 0) {
      b.targetT = 1.0; let best = null; let bs = -1e9;
      others.forEach((o, i) => {
        if (i === me || !o || !round.alive[i]) return;
        const d = Math.hypot(o.x - v.x, o.z - v.z);
        const s = Math.hypot(o.x, o.z) * 1.4 - d * 0.6;      // near the edge and near me
        if (s > bs) { bs = s; best = { slot: i }; }
      });
      b.target = best;
    }
    const t = b.target ? others[b.target.slot] : null;
    if (t) { const lead = Math.min(0.5, Math.hypot(t.x - v.x, t.z - v.z) / 40); tx = t.x + t.vx * lead; tz = t.z + t.vz * lead; } else { tx = 0; tz = 0; }
  }
  const diff = wrap(Math.atan2(tx - v.x, tz - v.z) - v.heading);
  const steer = clamp(-diff * 2.6, -1, 1);
  const dist = Math.hypot(tx - v.x, tz - v.z);
  let gas = 1; let brake = 0; let boost = false;
  if (retreat && dist < 3) gas = 0.2;
  if (Math.abs(diff) > 1.3 && speed > 8) { gas = 0.3; brake = 1; }
  if (margin < 7 && !retreat) gas = 0.6;                                    // careful near the edge
  b.dashCd -= dt;
  if (!retreat && b.dashCd <= 0 && Math.abs(diff) < 0.2 && dist > 6 && dist < 20 && v.nitro >= 0.4 && margin > 8 && Math.random() < b.aggression) { boost = true; b.dashCd = 4 + Math.random() * 3; }
  if (v.grounded && Math.abs(speed) < 1.0) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt * 2);
  if (b.stuckT > 1.2) { b.stuckT = 0; b.reverseT = 1.0; b.reverseSteer = -steer || 1; }
  return { steer, gas, brake, boost };
}
