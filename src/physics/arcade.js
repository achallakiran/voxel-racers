// Arcade vehicle physics. Pure and deterministic: same inputs + same dt => same state.
// The vehicle is a rigid "board" that follows the terrain height function, leaves the ground when
// the terrain falls away faster than gravity (kickers, crests) and lands with a thump.
//
// Heading convention: forward = (sin h, cos h). Steering input > 0 turns right (heading decreases).

export const GRAVITY = 26;
export const BOOST_COST = 0.34;
export const BOOST_TIME = 1.4;
export const NITRO_REGEN = 0.09;
const TRUCK_RADIUS = 1.3;

// stats are 1..10 (see truck-stats.js)
export function tuningFor(stats) {
  return {
    maxSpeed: 12 + stats.speed * 1.6,
    accel: 10 + stats.speed * 1.1 - stats.weight * 0.35,
    brake: 34,
    reverseMax: 7,
    rollDrag: 0.9,
    steerRate: 2.2,
    grip: 2.2 + stats.grip * 0.85,
    boostMul: 1.9,
    boostMax: 1.35,
  };
}

export function createVehicle(x, z, heading, terrain) {
  return {
    x, z, y: terrain.heightAt(x, z), heading,
    vx: 0, vz: 0, vy: 0,
    yawRate: 0, grounded: true,
    pitch: 0, roll: 0,
    f: 0, l: 0,               // forward / lateral speed (for HUD, wheels, dust)
    nitro: 1, boostT: 0,
    steerVis: 0,
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function slope(terrain, x, z) {
  const e = 0.4;
  const gx = clamp((terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z)) / (2 * e), -0.8, 0.8);
  const gz = clamp((terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e), -0.8, 0.8);
  return { gx, gz };
}

// input: { steer -1..1, gas 0..1, brake 0..1, boost bool }
// returns a list of events: 'boost' | {type:'land'|'hit'|'wall', power}
export function stepVehicle(v, input, terrain, tune, dt) {
  const events = [];
  // steering first: the heading turns but the velocity does not, so the tyres have to catch up (slide)
  const f0 = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  const maxS = tune.maxSpeed;
  if (v.grounded) {
    const sp = Math.abs(f0);
    const eff = Math.min(1, sp / 4) * (1 - 0.45 * Math.min(1, sp / maxS));
    const yaw = -(input.steer || 0) * tune.steerRate * eff * (f0 < 0 ? -1 : 1);
    v.yawRate += (yaw - v.yawRate) * (1 - Math.exp(-12 * dt));
  } else {
    v.yawRate *= Math.exp(-2 * dt);
  }
  v.steerVis += ((input.steer || 0) - v.steerVis) * (1 - Math.exp(-14 * dt));
  v.heading += v.yawRate * dt;
  const sinH = Math.sin(v.heading);
  const cosH = Math.cos(v.heading);
  let f = v.vx * sinH + v.vz * cosH;
  let l = v.vx * cosH - v.vz * sinH;

  // nitro
  if (input.boost && v.boostT <= 0 && v.nitro >= BOOST_COST) {
    v.nitro -= BOOST_COST;
    v.boostT = BOOST_TIME;
    if (v.grounded) f += 3;
    events.push('boost');
  }
  if (v.boostT > 0) v.boostT = Math.max(0, v.boostT - dt);
  else v.nitro = Math.min(1, v.nitro + NITRO_REGEN * dt);
  const boosting = v.boostT > 0;
  const maxF = tune.maxSpeed * (boosting ? tune.boostMax : 1);

  if (v.grounded) {
    const gas = input.gas || 0;
    const brake = input.brake || 0;
    if (gas > 0) {
      if (f < 0) f += tune.brake * dt;
      else f += tune.accel * (boosting ? tune.boostMul : 1) * clamp(1 - f / maxF, 0, 1) * gas * dt;
    } else if (brake > 0) {
      if (f > 0.4) f -= tune.brake * dt;
      else f = Math.max(-tune.reverseMax, f - tune.accel * 0.7 * dt);
    } else {
      f *= Math.exp(-tune.rollDrag * dt);
      if (Math.abs(f) < 0.05) f = 0;
    }
    if (f > maxF) f -= (f - maxF) * 1.5 * dt;

    // sideways grip; braking while turning at speed lets the back end slide
    const sliding = (input.brake || 0) > 0 && f > 6;
    l *= Math.exp(-tune.grip * (sliding ? 0.35 : 1) * dt);
  }
  v.vx = f * sinH + l * cosH;
  v.vz = f * cosH - l * sinH;

  if (v.grounded) {
    // gravity along the slope: climbing slows, descending speeds up
    const s = slope(terrain, v.x, v.z);
    v.vx -= GRAVITY * s.gx * 0.45 * dt;
    v.vz -= GRAVITY * s.gz * 0.45 * dt;
  } else {
    const air = Math.exp(-0.05 * dt);
    v.vx *= air;
    v.vz *= air;
  }

  let nx = v.x + v.vx * dt;
  let nz = v.z + v.vz * dt;

  // solid obstacles (fly over them if you are high enough)
  for (const o of terrain.obstacles || []) {
    if (v.y > o.h - 0.1) continue;
    const dx = nx - o.x;
    const dz = nz - o.z;
    const d = Math.hypot(dx, dz);
    const minD = o.r + TRUCK_RADIUS;
    if (d < minD && d > 1e-6) {
      const ux = dx / d;
      const uz = dz / d;
      nx = o.x + ux * minD;
      nz = o.z + uz * minD;
      const vn = v.vx * ux + v.vz * uz;
      if (vn < 0) {
        v.vx -= 1.25 * vn * ux; v.vz -= 1.25 * vn * uz;
        v.vx *= 0.75; v.vz *= 0.75;
        events.push({ type: 'hit', power: -vn });
      }
    }
  }
  // bounded world
  const R = terrain.radius - TRUCK_RADIUS;
  const dist = Math.hypot(nx, nz);
  if (dist > R) {
    const ux = nx / dist;
    const uz = nz / dist;
    nx = ux * R; nz = uz * R;
    const vn = v.vx * ux + v.vz * uz;
    if (vn > 0) {
      v.vx -= 1.4 * vn * ux; v.vz -= 1.4 * vn * uz;
      v.vx *= 0.8; v.vz *= 0.8;
      events.push({ type: 'wall', power: vn });
    }
  }

  // vertical
  let g1 = terrain.heightAt(nx, nz);
  if (g1 - v.y > 0.7) {                       // the face of a ramp or landing: a wall
    const vn = Math.hypot(v.vx, v.vz);
    nx = v.x; nz = v.z;
    v.vx *= -0.2; v.vz *= -0.2;
    g1 = terrain.heightAt(nx, nz);
    if (vn > 3) events.push({ type: 'hit', power: vn });
  }
  if (v.grounded) {
    const free = v.y + v.vy * dt - 0.5 * GRAVITY * dt * dt;
    if (free > g1 + 0.03) {
      v.grounded = false;
      v.vy -= GRAVITY * dt;
      v.y += v.vy * dt;
    } else {
      v.vy = clamp((g1 - v.y) / dt, -30, 30);
      v.y = g1;
    }
  } else {
    v.vy -= GRAVITY * dt;
    v.y += v.vy * dt;
    if (v.y <= g1) {
      const impact = -v.vy;
      v.y = g1;
      if (impact > 9) {                        // heavy truck: one bounce
        v.vy = impact * 0.18;
        v.y = g1 + 0.001;
        v.vx *= 0.9; v.vz *= 0.9;
      } else {
        v.grounded = true;
        v.vy = 0;
      }
      if (impact > 4) events.push({ type: 'land', power: impact });
    }
  }
  v.x = nx;
  v.z = nz;

  // visual pose
  const sH = Math.sin(v.heading);
  const cH = Math.cos(v.heading);
  if (v.grounded) {
    const hf = terrain.heightAt(v.x + sH * 1.6, v.z + cH * 1.6);
    const hr = terrain.heightAt(v.x - sH * 1.6, v.z - cH * 1.6);
    const hp = terrain.heightAt(v.x + cH * 1.2, v.z - sH * 1.2);
    const hn = terrain.heightAt(v.x - cH * 1.2, v.z + sH * 1.2);
    const tp = clamp(Math.atan2(hf - hr, 3.2), -0.7, 0.7);
    const tr = clamp(Math.atan2(hp - hn, 2.4), -0.7, 0.7);
    const k = 1 - Math.exp(-14 * dt);
    v.pitch += (tp - v.pitch) * k;
    v.roll += (tr - v.roll) * k;
  } else {
    const hs = Math.hypot(v.vx, v.vz);
    const tp = clamp(Math.atan2(v.vy, Math.max(hs, 1)), -0.8, 0.8);
    const k = 1 - Math.exp(-2.5 * dt);
    v.pitch += (tp - v.pitch) * k;
    v.roll += (0 - v.roll) * k;
  }

  v.f = v.vx * sH + v.vz * cH;
  v.l = v.vx * cH - v.vz * sH;
  return events;
}
