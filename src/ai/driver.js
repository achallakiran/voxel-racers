// Rival driver: follows the racing line (the centre line plus a personal lane that drifts), brakes for bends,
// uses nitro on straights, recovers when stuck, and gets gentle rubber-banding against the player.
// Pure: `track` is injected ({nearest, sampleAt, length, roadHalf}) so it is unit tested without three.js.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Rival personalities. skillAdd: raw pace; nitroAt: meter level that tempts it to burn nitro; boostMul: how often it
// tries (smaller = more often); corner: how hard it brakes for bends (smaller = later braking, riskier); wobble: lane
// weaving; block: swings across to shut the door on a player right behind it.
export const STYLES = {
  steady: { fast: false, skillAdd: 0, nitroAt: 0.7, boostMul: 1, corner: 1, wobble: 1, block: false },
  aggressive: { fast: true, skillAdd: 0.04, nitroAt: 0.45, boostMul: 0.6, corner: 0.8, wobble: 1.3, block: false },
  risky: { fast: true, skillAdd: 0.02, nitroAt: 0.55, boostMul: 0.75, corner: 0.7, wobble: 2, block: false },
  defensive: { fast: false, skillAdd: 0.01, nitroAt: 0.6, boostMul: 0.9, corner: 1, wobble: 0.5, block: true },
};

export function createDriver({ skill = 0.95, lane = 0, phase = 0, boostEvery = 9, style = 'steady' } = {}) {
  return { skill, lane, phase, boostEvery, style: STYLES[style] ? style : 'steady', stuckT: 0, reverseT: 0, reverseSteer: 1, nextBoost: boostEvery * 0.6 };
}

// Rubber band: trailing the player speeds you up a little, leading slows you a little.
export function rubberBand(playerAcc, myAcc) {
  return clamp(1 + (playerAcc - myAcc) * 3, 0.88, 1.12);
}

export function driverInput(d, v, tune, track, ctx, dt) {
  const n = track.nearest(v.x, v.z);
  const speed = Math.max(0, v.f);
  // personal lane drifts a little so the pack does not move in a line
  const st = STYLES[d.style] || STYLES.steady;
  const wobble = Math.sin(n.s * Math.PI * 2 * 7 + d.phase) * 1.6 * st.wobble;
  const look = 9 + speed * 0.55;
  // wall passages narrow the lane the AI may use; slaloms and islands tell it which side to take
  const lane = track.laneAt ? track.laneAt(n.s + (look * 0.8) / track.length, st.fast && tune.maxSpeed >= 28 ? 'fast' : 'safe') : { limit: track.roadHalf - 2, off: null };
  const narrow = clamp(lane.limit / Math.max(1, track.roadHalf - 2), 0.15, 1);   // squeezed lanes: no weaving, no personal drift
  let off = lane.off !== null ? lane.off : clamp((d.lane + wobble) * narrow, -lane.limit, lane.limit);
  // defensive drivers close the door on a player right behind them
  if (st.block && lane.off === null && ctx.gapAhead > 4 && ctx.gapAhead < 30 && ctx.playerLat !== undefined) off = clamp(ctx.playerLat, -lane.limit, lane.limit);
  // nitro is a route resource: head for a canister that is close ahead and not yet taken
  if (lane.off === null && ctx.pickups && v.nitro < 0.9) {
    let best = null; let bd = 1e9;
    const fx = Math.sin(v.heading); const fz = Math.cos(v.heading);
    for (const k of ctx.pickups) {
      if (k.taken) continue;
      const dx = k.x - v.x; const dz = k.z - v.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 4 || ahead > 40 + speed) continue;
      if (Math.abs(dx * fz - dz * fx) > 7) continue;
      if (ahead < bd) { bd = ahead; best = k; }
    }
    if (best) off = clamp(track.nearest(best.x, best.z).d, -lane.limit, lane.limit);
  }
  const p = track.sampleAt(n.s + look / track.length);
  const tx = p.x + p.tz * off;
  const tz = p.z - p.tx * off;
  const want = Math.atan2(tx - v.x, tz - v.z);
  const diff = wrap(want - v.heading);
  let steer = clamp(-diff * 2.8, -1, 1);

  // corner severity from how much the road turns over the next stretch
  const a = track.sampleAt(n.s + 8 / track.length);
  const b = track.sampleAt(n.s + (24 + speed) / track.length);
  const sev = Math.abs(wrap(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)));
  const rb = rubberBand(ctx.playerAcc ?? 0, ctx.myAcc ?? 0);
  const target = tune.maxSpeed * (d.skill + st.skillAdd) * rb * (1 - clamp(sev * 1.5 * st.corner, 0, 0.55));

  let gas = 0; let brake = 0; let boost = false;
  if (ctx.phase !== 'racing') return { steer: 0, gas: 0, brake: 0, boost: false, hold: true };

  if (speed < target) gas = 1;
  else if (speed > target + 3.5) brake = 1;
  if (Math.abs(diff) > 1.0 && speed > 7) { gas = 0; brake = 1; }

  // stuck? back up for a moment
  if (v.grounded && speed < 1.2) d.stuckT += dt; else d.stuckT = Math.max(0, d.stuckT - dt * 2);
  if (d.reverseT > 0) {
    d.reverseT -= dt;
    return { steer: d.reverseSteer, gas: 0, brake: 1, boost: false };
  }
  if (d.stuckT > 1.4) {
    d.stuckT = 0; d.reverseT = 1.1; d.reverseSteer = -steer || 1;
    return { steer: d.reverseSteer, gas: 0, brake: 1, boost: false };
  }

  // nitro on a clear straight when the tank is nearly full
  d.nextBoost -= dt;
  const behind = (ctx.playerAcc ?? 0) - (ctx.myAcc ?? 0) > 0.015;          // trailing the player: spend nitro sooner
  if (d.nextBoost <= 0 && sev < 0.12 && v.nitro >= (behind ? st.nitroAt - 0.15 : st.nitroAt) && speed > 8 && Math.abs(diff) < 0.2) {
    boost = true;
    d.nextBoost = d.boostEvery * st.boostMul * (behind ? 0.6 : 1) * (0.8 + 0.4 * ((n.s * 97) % 1));
  }
  return { steer, gas, brake, boost };
}
