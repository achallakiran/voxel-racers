// Football: the pitch, the ball physics, the ball magnet and the match rules. Pure (no three.js, no DOM).
// Pitch: x runs goal to goal (team 0 attacks +x, team 1 attacks -x), z across. Rounded corners so the ball never sticks.
// Slots 0..2 are team 0 (0 = you, the striker), slots 3..5 team 1.
import { COUNTDOWN } from './race.js';

export const HX = 35; export const HZ = 22; export const CORNER = 9;      // half length, half width, corner radius
export const GOAL_W = 12; export const GOAL_D = 5;                        // goal mouth width and pocket depth
export const BALL_R = 1.5;
export const TRUCK_BALL_R = 1.7;                                          // how close a truck centre must be to touch the ball
export const WIN_GOALS = 5;
export const GOAL_PAUSE = 2.4;
export const STUN_TIME = 1.5;
export const RAM_STUN = 6;                                                // hit power that spins the victim
export const MAX_BALL_SPEED = 40;
export const MAGNET = { range: 4.5, cone: 0.82, pull: 7, slow: 9, maxTurn: 0.45 };
export const teamOf = (slot) => (slot < 3 ? 0 : 1);
export const FORMATION = [
  [-7, 0, 'striker'], [-19, -9, 'defender'], [-31, 0, 'keeper'],
  [7, 0, 'striker'], [19, 9, 'defender'], [31, 0, 'keeper'],
];
export const ROLES = FORMATION.map((f) => f[2]);

// ---- the pitch outline: a rounded rectangle shrunk by r. Returns null when (x, z) is inside, else the nearest point and outward normal.
export function pitchWall(x, z, r = 0, skipMouth = false) {
  const hx = HX - r; const hz = HZ - r; const c = Math.max(0.5, CORNER - r);
  const ax = Math.abs(x); const az = Math.abs(z);
  const sx = Math.sign(x) || 1; const sz = Math.sign(z) || 1;
  const qx = ax - (hx - c); const qz = az - (hz - c);
  if (qx > 0 && qz > 0) {                                  // the corner arc
    const d = Math.hypot(qx, qz);
    if (d <= c) return null;
    const ux = qx / d; const uz = qz / d;
    return { x: sx * (hx - c + ux * c), z: sz * (hz - c + uz * c), nx: sx * ux, nz: sz * uz };
  }
  if (skipMouth && az < GOAL_W / 2 && ax > hx - 1) return null;   // through the goal mouth
  if (ax > hx && ax - hx >= az - hz) return { x: sx * hx, z, nx: sx, nz: 0 };
  if (az > hz) return { x, z: sz * hz, nx: 0, nz: sz };
  if (ax > hx) return { x: sx * hx, z, nx: sx, nz: 0 };
  return null;
}
// the trucks' world: the pitch only (no goal pockets)
export function createFootballTerrain() {
  return { heightAt: () => 0, obstacles: [], props: [], radius: 200, surfaceAt: () => 'grass', hazards: [], constrain: (x, z, r) => pitchWall(x, z, r) };
}

// ---- the ball
export function createBall() { return { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, r: BALL_R }; }
export function resetBall(b) { Object.assign(b, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0 }); }
const inMouth = (b) => Math.abs(b.z) < GOAL_W / 2 && Math.abs(b.x) > HX - b.r;

export function stepBall(b, dt) {
  b.vy -= 22 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.y < b.r) {
    b.y = b.r;
    if (b.vy < 0) b.vy = -b.vy * 0.55 > 1.2 ? -b.vy * 0.55 : 0;
    const f = Math.exp(-0.45 * dt); b.vx *= f; b.vz *= f;         // rolling friction
  }
  if (inMouth(b)) {                                                // inside a goal: the side nets and the back
    const lim = GOAL_W / 2 - b.r;
    if (Math.abs(b.z) > lim) { b.z = Math.sign(b.z) * lim; b.vz *= -0.4; }
    const back = HX + GOAL_D - b.r;
    if (Math.abs(b.x) > back) { b.x = Math.sign(b.x) * back; b.vx *= -0.3; }
  } else {
    const w = pitchWall(b.x, b.z, b.r, true);
    if (w) {
      b.x = w.x; b.z = w.z;
      const vn = b.vx * w.nx + b.vz * w.nz;
      if (vn > 0) { b.vx -= 1.8 * vn * w.nx; b.vz -= 1.8 * vn * w.nz; }   // restitution 0.8
    }
  }
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > MAX_BALL_SPEED) { b.vx *= MAX_BALL_SPEED / sp; b.vz *= MAX_BALL_SPEED / sp; }
}

// a truck meets the ball. truck: { x, y, z, vx, vz, heading, boostT }. Returns the kick power (0 = no contact).
export function kickBall(b, t) {
  if (Math.abs(b.y - t.y) > 3.2) return 0;
  let dx = b.x - t.x; let dz = b.z - t.z; const d = Math.hypot(dx, dz);
  if (d >= TRUCK_BALL_R + b.r - 0.4) return 0;
  if (d < 1e-6) { dx = Math.sin(t.heading); dz = Math.cos(t.heading); } else { dx /= d; dz /= d; }
  const reach = TRUCK_BALL_R + b.r - 0.4;
  b.x = t.x + dx * reach; b.z = t.z + dz * reach;                   // pushed out of the truck
  const rel = (b.vx - t.vx) * dx + (b.vz - t.vz) * dz;
  if (rel >= 0) return 0;
  const boost = t.boostT > 0 ? 1.35 : 1;
  b.vx -= (1 + 0.85) * rel * dx * boost; b.vz -= (1 + 0.85) * rel * dz * boost;
  b.vy += Math.min(4, -rel * 0.12);
  // the magnet: a hard hit is bent a little toward where the truck is pointing (never more than maxTurn)
  const sp = Math.hypot(b.vx, b.vz); const ts = Math.hypot(t.vx, t.vz);
  if (sp > 1 && ts > 3) {
    const a0 = Math.atan2(b.vx, b.vz); const af = t.heading;
    let da = af - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < 0.9) { const turn = Math.sign(da) * Math.min(Math.abs(da), MAGNET.maxTurn, 0.3 * Math.abs(da) + 0.08); b.vx = Math.sin(a0 + turn) * sp; b.vz = Math.cos(a0 + turn) * sp; }
  }
  return -rel;
}
// the dribble nudge: a slow ball just in front of a moving truck is drawn a little toward a point ahead of its bumper
export function magnetPull(b, t, dt) {
  const fx = Math.sin(t.heading); const fz = Math.cos(t.heading);
  const dx = b.x - t.x; const dz = b.z - t.z; const d = Math.hypot(dx, dz);
  if (d < 2.2 || d > MAGNET.range || b.y > b.r + 0.8) return false;
  if ((dx * fx + dz * fz) / d < MAGNET.cone) return false;
  if (Math.hypot(b.vx, b.vz) > MAGNET.slow || Math.hypot(t.vx, t.vz) < 2) return false;
  const px = t.x + fx * 3.2 - b.x; const pz = t.z + fz * 3.2 - b.z; const pl = Math.hypot(px, pz) || 1;
  b.vx += (px / pl) * MAGNET.pull * dt; b.vz += (pz / pl) * MAGNET.pull * dt;
  return true;
}

// ---- the match
export function createFootballMatch({ goals = WIN_GOALS } = {}) {
  const m = {
    goals, score: [0, 0], phase: 'countdown', clock: COUNTDOWN, pause: 0, last: -1, events: [], winner: -1, time: 0,
    stunUntil: new Float32Array(6),
    tick(dt) {
      if (m.phase === 'countdown') { m.clock -= dt; if (m.clock <= 0) { m.phase = 'play'; m.events.push('go'); } }
      else if (m.phase === 'play') m.time += dt;
      else if (m.phase === 'goal') { m.pause -= dt; if (m.pause <= 0) { m.phase = 'countdown'; m.clock = COUNTDOWN - 1; m.events.push('reset'); } }
    },
    countdownDigit() { return m.phase === 'countdown' ? Math.max(1, Math.ceil(m.clock - (COUNTDOWN - 3))) : 0; },
    // ball: call each step during play. Returns the scoring team or -1.
    check(b) {
      if (m.phase !== 'play') return -1;
      if (Math.abs(b.z) < GOAL_W / 2 && Math.abs(b.x) > HX + 0.2) return m.goal(b.x > 0 ? 0 : 1);
      return -1;
    },
    goal(team) {
      m.score[team]++; m.last = team; m.events.push({ type: 'goal', team });
      if (m.score[team] >= m.goals) { m.phase = 'over'; m.winner = team; m.events.push({ type: 'over', winner: team }); }
      else { m.phase = 'goal'; m.pause = GOAL_PAUSE; }
      return team;
    },
    stun(who) { m.stunUntil[who] = Math.max(m.stunUntil[who], m.time + STUN_TIME); },
    isStunned(who) { return m.stunUntil[who] > m.time; },
    get won() { return m.winner === 0; },
    drainEvents() { const e = m.events; m.events = []; return e; },
  };
  return m;
}
