// Arcade vehicle physics. Pure and deterministic: same inputs + same dt => same state.
// The vehicle is a rigid "board" that follows the terrain height function, leaves the ground when
// the terrain falls away faster than gravity (kickers, crests) and lands with a thump.
//
import { atEntry, startLoop, stepLoop, exitLoop } from './loop.js';

// Heading convention: forward = (sin h, cos h). Steering input > 0 turns right (heading decreases).

export const GRAVITY = 30;
export const SPRING_REST = 0.3;     // chassis ride height the springs aim for (before sag)
export const MAX_UP = 14;           // launch speed cap

// Surface effects: grip multiplier, extra rolling drag, top-speed multiplier
export const SURFACES = {
  asphalt: { grip: 1.2, drag: 0.0, maxMul: 1.0 },
  dirt: { grip: 0.85, drag: 0.1, maxMul: 0.97 },
  grass: { grip: 0.65, drag: 0.5, maxMul: 0.82 },
  sand: { grip: 0.55, drag: 0.8, maxMul: 0.7 },
  mud: { grip: 0.42, drag: 1.4, maxMul: 0.55 },
  goo: { grip: 0.5, drag: 2.2, maxMul: 0.4 },      // sticky slow patch
  oil: { grip: 0.16, drag: 0.05, maxMul: 1.0 },     // slippery patch
  pad: { grip: 1.2, drag: 0, maxMul: 1.0 },         // accelerator strip (kick handled in stepVehicle)
};
export const PAD_KICK = 9;
export const PAD_TIME = 1.3;
export const PICKUP_NITRO = 0.4;
export const PICKUP_RESPAWN = 12;
export const PAD_NITRO = 0.05;       // a pad tops the tank up a little
export const LAND_NITRO = 0.04;      // a clean landing (not a crash) pays a little nitro
export const RACE_START_NITRO = 0.6;
export const STALL_TIME = 0.4;       // a hard hit cuts the engine for a moment
export const SUS_MODES = ['soft', 'normal', 'stiff'];
// suspension modes: kMul (spring), steer, top speed, roughMul (how much soft ground costs), restMul (bounce)
const SUS_TUNE = {
  soft: { kMul: 0.8, steer: 0.95, speed: 0.98, roughMul: 0.55, restMul: 1.25 },
  normal: { kMul: 1, steer: 1, speed: 1, roughMul: 1, restMul: 1 },
  stiff: { kMul: 1.3, steer: 1.08, speed: 1.04, roughMul: 1.5, restMul: 0.8 },
};
export const PACE = 1.15;

// pickups come back after a while; called once per frame by whoever owns the terrain
export function tickPickups(terrain, dt) {
  if (!terrain.pickups) return;
  for (const p of terrain.pickups) if (p.taken) { p.cool -= dt; if (p.cool <= 0) p.taken = false; }
}
export const BOOST_COST = 0.15;   // least tank needed to start a boost
export const BOOST_TIME = 4.5;    // a full tank burns for 4.5 s; the meter drains as it burns
export const NITRO_REGEN = 0.09;
const TRUCK_RADIUS = 1.3;

// stats are 1..10 (see truck-stats.js)
export function tuningFor(stats, handling = { steer: 1, grip: 1, boost: 1 }, sus = { k: 55, bounce: 1 }, mode = 'normal') {
  const M = SUS_TUNE[mode] || SUS_TUNE.normal;
  const K = 7.5 * sus.k * M.kMul;
  return {
    suspK: K,
    suspC: 0.5 * Math.sqrt(K),
    ride: SPRING_REST - GRAVITY / K,        // resting chassis height above the ground
    restitution: (0.5 + 0.2 * (sus.bounce - 1)) * M.restMul,
    roughMul: M.roughMul,
    maxSpeed: (16 + stats.speed * 2.1) * PACE * M.speed,
    accel: (14 + stats.speed * 1.2 - stats.weight * 0.35) * PACE,
    brake: 34,
    reverseMax: 7,
    rollDrag: 0.9,
    steerRate: 2.2 * handling.steer * M.steer,
    grip: (2.2 + stats.grip * 0.85) * handling.grip,
    boostMul: 1 + 2.4 * handling.boost,
    boostMax: 1.32,
  };
}

export function createVehicle(x, z, heading, terrain, ride = 0.25) {
  return {
    x, z, y: terrain.heightAt(x, z) + ride, heading,
    vx: 0, vz: 0, vy: 0,
    yawRate: 0, grounded: true,
    pitch: 0, roll: 0,
    f: 0, l: 0,               // forward / lateral speed (for HUD, wheels, dust)
    nitro: 1, stallT: 0, boostT: 0, loop: null, hp: 100, maxHp: 100, wrecked: false,
    fallV: 0, surface: 'dirt', rise: 0, padT: 0,
    steerVis: 0,
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function circleWall(x, z, R) {
  const d = Math.hypot(x, z);
  if (d <= R || d === 0) return null;
  return { x: (x / d) * R, z: (z / d) * R, nx: x / d, nz: z / d };
}

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
  if (input.hold) input = { steer: 0, gas: 0, brake: 0, boost: false, hold: true };   // countdown / finished: stand still, never reverse
  // loops: ride the ring while on it, or hop on at the mouth
  if (terrain.loops && !v.loop && v.grounded) {
    for (const L of terrain.loops) {
      if (atEntry(L, v)) { startLoop(v, L); events.push({ type: 'loop' }); break; }
    }
  }
  if (v.loop) {
    if (input.boost && v.boostT <= 0 && v.nitro >= BOOST_COST) { v.boostT = BOOST_TIME; events.push('boost'); }
    if (v.boostT > 0) { v.boostT = Math.max(0, v.boostT - dt); v.nitro = Math.max(0, v.nitro - dt / BOOST_TIME); if (v.nitro <= 0) v.boostT = 0; }
    if (stepLoop(v, { ...input, boost: v.boostT > 0 }, dt) === 'exit') { exitLoop(v, SPRING_REST); events.push({ type: 'loopExit' }); }
    return events;
  }
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

  // nitro: one tap lights it, then it burns (draining the meter) until the tank is empty or 4.5 s are up
  if (input.boost && v.boostT <= 0 && v.nitro >= BOOST_COST) {
    v.boostT = BOOST_TIME;
    if (v.grounded) f += 12;
    events.push('boost');
  }
  if (v.boostT > 0) {
    v.boostT = Math.max(0, v.boostT - dt);
    v.nitro = Math.max(0, v.nitro - dt / BOOST_TIME);
    if (v.nitro <= 0) v.boostT = 0;
  } else if (!terrain.noRegen) v.nitro = Math.min(1, v.nitro + NITRO_REGEN * dt);
  v.surface = (terrain.surfaceAt && terrain.surfaceAt(v.x, v.z)) || 'dirt';
  if (v.surface === 'pad' && v.grounded) {
    if (v.padT < 0.3) { f += PAD_KICK; v.nitro = Math.min(1, v.nitro + PAD_NITRO); events.push({ type: 'pad' }); }
    v.padT = PAD_TIME;
  }
  if (v.padT > 0) v.padT = Math.max(0, v.padT - dt);
  const boosting = v.boostT > 0 || v.padT > 0;
  const surf = SURFACES[(terrain.surfaceAt && terrain.surfaceAt(v.x, v.z)) || 'dirt'] || SURFACES.dirt;
  v.surface = (terrain.surfaceAt && terrain.surfaceAt(v.x, v.z)) || 'dirt';
  // nitro punches through soft ground: mud and sand slow you far less while it burns
  const rough = (m) => 1 - (1 - m) * (tune.roughMul || 1);
  const maxF = tune.maxSpeed * (boosting ? tune.boostMax : 1) * (boosting ? Math.max(rough(surf.maxMul), 0.92) : rough(surf.maxMul));

  if (v.grounded) {
    if (v.stallT > 0) v.stallT = Math.max(0, v.stallT - dt);
    const gas = (input.gas || 0) * (v.stallT > 0 ? 0.25 : 1);
    const brake = input.brake || 0;
    if (gas > 0) {
      if (f < 0) f += tune.brake * dt;
      else f += tune.accel * (boosting ? tune.boostMul : 1) * clamp(1 - f / maxF, 0, 1) * gas * dt;
    } else if (brake > 0) {
      if (f > 0.4) f -= tune.brake * dt;
      else f = Math.max(-tune.reverseMax, f - tune.accel * 0.7 * dt);
    } else {
      f *= Math.exp(-(tune.rollDrag + surf.drag * (boosting ? 0.3 : 1)) * dt);
      if (Math.abs(f) < 0.05) f = 0;
    }
    if (input.hold) { f *= Math.exp(-10 * dt); l *= Math.exp(-10 * dt); if (Math.abs(f) < 0.05) f = 0; }
    if (gas > 0 && surf.drag > 0) f *= Math.exp(-surf.drag * 0.5 * dt);   // soft ground drags even under power
    if (f > maxF) f -= (f - maxF) * 1.5 * dt;

    // sideways grip; braking while turning at speed lets the back end slide
    const sliding = (input.brake || 0) > 0 && f > 6;
    l *= Math.exp(-tune.grip * surf.grip * (sliding ? 0.35 : 1) * dt);
  }
  v.vx = f * sinH + l * cosH;
  v.vz = f * cosH - l * sinH;

  if (v.grounded) {
    // gravity along the slope: climbing slows, descending speeds up
    const s = slope(terrain, v.x, v.z);
    const sg = boosting ? 0.35 : 0.8;
    v.vx -= GRAVITY * s.gx * sg * dt;
    v.vz -= GRAVITY * s.gz * sg * dt;
  } else {
    const air = Math.exp(-0.05 * dt);
    v.vx *= air;
    v.vz *= air;
  }

  let nx = v.x + v.vx * dt;
  let nz = v.z + v.vz * dt;

  // pickups: drive through a canister to top up the nitro
  if (terrain.pickups) for (const k of terrain.pickups) {
    if (k.taken || Math.abs(v.x - k.x) > 2.6 || Math.abs(v.z - k.z) > 2.6 || v.y > (k.y0 || 0) + 4) continue;
    k.taken = true; k.cool = PICKUP_RESPAWN;
    v.nitro = Math.min(1, v.nitro + PICKUP_NITRO);
    events.push({ type: 'pickup', obj: k });
  }

  // solid obstacles (fly over them if you are high enough)
  for (const o of terrain.obstacles || []) {
    if (v.y > (o.y0 || 0) + o.h - 0.1) continue;    // high enough: fly over it (heights are measured from the ground it stands on)
    const dx = nx - o.x;
    const dz = nz - o.z;
    const minD = o.r + TRUCK_RADIUS;
    if (dx > minD || dx < -minD || dz > minD || dz < -minD) continue;
    const d = Math.hypot(dx, dz);
    if (d < minD && d > 1e-6) {
      const ux = dx / d;
      const uz = dz / d;
      const vn0 = v.vx * ux + v.vz * uz;
      const spd = Math.hypot(v.vx, v.vz);
      if (o.breakAt && spd >= o.breakAt && -vn0 > 0.25 * spd) {
        // fragile prop: plow straight through it, losing a little speed
        events.push({ type: 'smash', obj: o, power: spd });
        const sm = 0.78 + 0.17 * Math.min(1, (spd - o.breakAt) / 12) + (v.boostT > 0 ? 0.03 : 0);
        v.vx *= sm; v.vz *= sm;
        continue;
      }
      nx = o.x + ux * minD;
      nz = o.z + uz * minD;
      const vn = vn0;
      if (vn < 0) {
        v.vx -= 1.25 * vn * ux; v.vz -= 1.25 * vn * uz;
        const keep = 1 - (0.06 + 0.40 * Math.min(1, -vn / 6));   // a graze loses a little, a head-on about 45%
        if (-vn > 4) { v.stallT = STALL_TIME; events.push({ type: 'stall', power: -vn }); }
        v.vx *= keep; v.vz *= keep;
        events.push({ type: 'hit', power: -vn, obj: o });
      }
    }
  }
  // bounded world: tracks supply their own barrier shape, the arena is a circle
  const wall = terrain.constrain ? terrain.constrain(nx, nz, TRUCK_RADIUS) : circleWall(nx, nz, (terrain.radius || 1e9) - TRUCK_RADIUS);
  if (wall) {
    nx = wall.x; nz = wall.z;
    const vn = v.vx * wall.nx + v.vz * wall.nz;     // wall.n points out of the playable area
    if (vn > 0) {
      v.vx -= 1.4 * vn * wall.nx; v.vz -= 1.4 * vn * wall.nz;
      const wk = 0.8 - 0.15 * Math.min(1, vn / 6);
      v.vx *= wk; v.vz *= wk;
      if (vn > 5) v.stallT = STALL_TIME;
      events.push({ type: 'wall', power: vn });
    }
  }

  // vertical: the chassis rides on springs over the terrain. Compression pushes it up, so it
  // bounces over bumps, takes off from kickers and crests, and slams down on hard landings.
  let g1 = terrain.heightAt(nx, nz);
  if (g1 - v.y > 0.9) {                       // the face of a ramp or landing: a wall
    const vn = Math.hypot(v.vx, v.vz);
    nx = v.x; nz = v.z;
    v.vx *= -0.2; v.vz *= -0.2;
    g1 = terrain.heightAt(nx, nz);
    if (vn > 3) events.push({ type: 'hit', power: vn });
  }
  const wasGrounded = v.grounded;
  const gPrev = terrain.heightAt(v.x, v.z);
  let h = v.y - g1;
  if (!wasGrounded) v.fallV = Math.min(v.fallV, v.vy);
  let ay = -GRAVITY;
  if (h < SPRING_REST) ay += tune.suspK * (SPRING_REST - h) - tune.suspC * v.vy;
  v.vy = clamp(v.vy + ay * dt, -45, MAX_UP);
  v.y += v.vy * dt;
  h = v.y - g1;
  let slam = 0;
  if (h < 0) {                                // bottomed out
    v.y = g1;
    if (v.vy < 0) {
      slam = -v.vy;
      v.vy = slam > 3 ? slam * tune.restitution : 0;
      if (slam > 5) { v.vx *= 0.93; v.vz *= 0.93; }
    }
    h = 0;
  }
  v.grounded = h < SPRING_REST + 0.12;
  if (v.grounded && !wasGrounded) {
    const impact = Math.max(-v.fallV, slam);
    if (impact > 4) {
      events.push({ type: 'land', power: impact });
      if (terrain.noRegen && impact < 14) v.nitro = Math.min(1, v.nitro + LAND_NITRO);
    }
    v.fallV = 0;
  } else if (v.grounded) {
    v.fallV = 0;
    if (slam > 6) events.push({ type: 'land', power: slam });
  }
  // hitting rising ground (logs, steps, rocks) scrubs speed; ramps do not, because the chassis follows them
  const upRate = (g1 - gPrev) / dt;
  v.rise = upRate;
  if (v.grounded && upRate > 3) {
    const hitV = Math.max(0, upRate - Math.max(v.vy, 0));
    if (hitV > 0.5) {
      const k = Math.exp(-0.09 * hitV * dt * 6);
      v.vx *= k; v.vz *= k;
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
