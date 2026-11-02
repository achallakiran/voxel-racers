// Timed stage hazards. Everything is a pure function of the stage clock `terrain.time`, so physics, AI, the renderer
// and the tests all agree. Hazard kinds:
//   avalanche  a wall of snow sweeping across a stretch of road from one side, once per `period` seconds
//   drifter  a floating rock that slides across the road on a fixed path (a moving solid obstacle)
//   yak        a slow animal walking back and forth across the road (a moving solid obstacle, see tickHazards)
// A hazard sits on the road frame of its stage: (x,z) centre, (tx,tz) direction of travel, `len` along, `w` across.

export const AVALANCHE_PUSH = 40;        // sideways acceleration inside the wave
export const AVALANCHE_SLOW = 0.55;      // top-speed squeeze inside the wave (per second factor)

// phase of a periodic hazard: 0..1 through its active window, or -1 when idle. A warning (negative) leads the window.
export function avalanchePhase(h, time) {
  const t = ((time - h.offset) % h.period + h.period) % h.period;
  if (t < h.warn) return -1 - (1 - t / h.warn) * 0;       // warning window (flags flap, snow shakes); not yet moving
  const k = (t - h.warn) / h.dur;
  return k <= 1 ? k : -1;
}
export const avalancheWarning = (h, time) => {
  const t = ((time - h.offset) % h.period + h.period) % h.period;
  return t >= h.period - h.warnLead || t < h.warn;
};

// lateral extent [a,b] of the wave (+ = right of travel) at phase k. side +1: the wave comes from the right edge
export function avalancheBand(h, k) {
  const half = h.w / 2;
  const front = half - k * h.w;                   // from +half down to -half (for side +1)
  return h.side > 0 ? [front, half] : [-half, -front];
}

export function inRect(h, x, z) {
  const dx = x - h.x; const dz = z - h.z;
  const along = dx * h.tx + dz * h.tz;
  const lat = dx * h.tz - dz * h.tx;
  return { along, lat, inside: Math.abs(along) <= h.len / 2 && Math.abs(lat) <= h.w / 2 };
}

export const GEYSER_LAUNCH = 15;
export const STALACTITE_FALL = 0.9;       // seconds the rock takes to fall (its shadow grows over this time)
const cyc = (h, time) => ((time - h.offset) % h.period + h.period) % h.period;

// geyser: erupts for `dur` seconds after `warn` seconds of bubbling; launches anything above it
export function geyserState(h, time) {
  const t = cyc(h, time);
  if (t < h.warn) return { state: 'warn', k: t / h.warn };
  if (t < h.warn + h.dur) return { state: 'erupt', k: (t - h.warn) / h.dur };
  return { state: 'idle', k: 0 };
}
// stalactite: shadow grows for the last STALACTITE_FALL seconds before `warn`, then it crashes down at t = warn
export function stalactiteState(h, time) {
  const t = cyc(h, time);
  if (t >= h.warn - STALACTITE_FALL && t < h.warn) return { state: 'falling', k: (t - (h.warn - STALACTITE_FALL)) / STALACTITE_FALL };
  if (t >= h.warn && t < h.warn + 0.12) return { state: 'impact', k: 0 };
  if (t >= h.warn + 0.12 && t < h.warn + 2.5) return { state: 'rubble', k: 0 };
  return { state: 'idle', k: 0 };
}

export function hazardEffects(v, terrain, dt, events) {
  const time = terrain.time || 0;
  if (v.hazCool > 0) v.hazCool -= dt;
  for (const h of terrain.hazards) {
    if (h.kind === 'geyser') {
      if (geyserState(h, time).state !== 'erupt') continue;
      if (Math.hypot(v.x - h.x, v.z - h.z) > h.r || v.y > (h.y0 || 0) + 8) continue;
      v.vy = Math.max(v.vy, GEYSER_LAUNCH); v.grounded = false;
      if (!(v.hazCool > 0)) { v.hazCool = 1; events.push({ type: 'geyser', hazard: h }); }
      continue;
    }
    if (h.kind === 'stalactite') {
      if (stalactiteState(h, time).state !== 'impact' || v.y > (h.y0 || 0) + 3) continue;
      if (Math.hypot(v.x - h.x, v.z - h.z) > h.r || v.hazCool > 0) continue;
      v.vx *= 0.3; v.vz *= 0.3; v.hazCool = 1; events.push({ type: 'stalactite', hazard: h });
      continue;
    }
    if (h.kind !== 'avalanche') continue;
    const k = avalanchePhase(h, time);
    if (k < 0) continue;
    const r = inRect(h, v.x, v.z);
    if (!r.inside) continue;
    const [a, b] = avalancheBand(h, k);
    if (r.lat < a - 0.5 || r.lat > b + 0.5) continue;
    const dir = -h.side;                            // swept toward the far side
    v.vx += h.tz * dir * AVALANCHE_PUSH * dt; v.vz += -h.tx * dir * AVALANCHE_PUSH * dt;
    const sq = Math.exp(-(1 - AVALANCHE_SLOW) * 2.2 * dt);
    v.vx *= sq; v.vz *= sq;
    if (!v.inAvalanche) { v.inAvalanche = true; events.push({ type: 'avalanche', hazard: h }); }
    v.avalancheT = 0.2;
  }
  if (v.avalancheT > 0) { v.avalancheT -= dt; if (v.avalancheT <= 0) v.inAvalanche = false; }
}

// move the moving obstacles (yaks) and advance the stage clock; call once per frame beside tickPickups
export function tickHazards(terrain, dt) {
  if (!terrain.hazards) return;
  terrain.time = (terrain.time || 0) + dt;
  for (const h of terrain.hazards) {
    if (h.kind === 'drifter') {
      // a floating rock sliding across the road on a fixed sine path; its solid body is an obstacle that moves with it
      const u = Math.sin((terrain.time / h.period) * Math.PI * 2 + h.phase);
      h.x = h.cx + h.tz * h.range * u; h.z = h.cz - h.tx * h.range * u;
      h.u = u; h.y0 = terrain.heightAt ? terrain.heightAt(h.x, h.z) : (h.y0 || 0);
      if (!h.obstacle || h.obstacle.owner !== terrain) {
        h.obstacle = { type: 'drifter', owner: terrain, x: h.x, z: h.z, r: h.r, h: h.top, y0: h.y0 };
        terrain.obstacles.push(h.obstacle);
      } else { h.obstacle.x = h.x; h.obstacle.z = h.z; h.obstacle.y0 = h.y0; }
      continue;
    }
    if (h.kind !== 'yak') continue;
    const u = Math.sin((terrain.time / h.period) * Math.PI * 2 + h.phase);     // -1..1 across the road
    h.x = h.cx + h.tz * h.range * u; h.z = h.cz - h.tx * h.range * u;
    h.face = Math.cos((terrain.time / h.period) * Math.PI * 2 + h.phase) >= 0 ? 1 : -1;
    if (h.obstacle) { h.obstacle.x = h.x; h.obstacle.z = h.z; }
  }
}
