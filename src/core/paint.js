// Paint the Town: the tile map and the rules. Pure (no three.js, no DOM) so everything is tested without the game.
// A round arena is cut into square tiles. Each tile is owned by one truck or nobody. Driving over tiles paints them.
//   - a truck in the air does not paint
//   - nitro paints a wide swath AND seals it for SEAL_TIME: nobody can repaint sealed tiles in that time
//   - a hard ram spins the victim out: no painting for SPIN_TIME
//   - a bucket pickup paints wide for BUCKET_TIME
//   - after ROUND_TIME the biggest share of tiles wins
import { COUNTDOWN } from './race.js';

export const ROUND_TIME = 90;
export const SEAL_TIME = 4;
export const SPIN_TIME = 2;
export const BUCKET_TIME = 8;
export const WIDTH = { normal: 1.7, nitro: 3.4, bucket: 4.8 };   // painted radius (metres) around the truck centre
export const RAM_POWER = 5;                                        // collision power that counts as a ram

export function createPaintMap({ radius = 38, tile = 2, players = 6 } = {}) {
  const n = Math.ceil((radius * 2) / tile);
  const x0 = -n * tile / 2;
  const idx = new Int32Array(n * n).fill(-1);          // tile index -> compact slot, or -1 when outside the round arena
  const cells = [];                                    // compact slot -> { i, j, x, z }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * tile; const z = x0 + (j + 0.5) * tile;
    if (Math.hypot(x, z) <= radius) { idx[j * n + i] = cells.length; cells.push({ i, j, x, z }); }
  }
  const m = {
    radius, tile, n, x0, players, cells, idx,
    owner: new Int8Array(cells.length).fill(-1),
    sealUntil: new Float32Array(cells.length),
    counts: new Int32Array(players),
    dirty: new Set(),
    spinUntil: new Float32Array(players),
    bucketUntil: new Float32Array(players),
    time: 0,
    get total() { return cells.length; },
  };
  return m;
}

export function slotAt(m, x, z) {
  const i = Math.floor((x - m.x0) / m.tile); const j = Math.floor((z - m.x0) / m.tile);
  if (i < 0 || j < 0 || i >= m.n || j >= m.n) return -1;
  return m.idx[j * m.n + i];
}

// try to give one tile to `who`; sealed tiles of someone else refuse. Returns true when it changed.
export function claim(m, slot, who, seal = false) {
  if (slot < 0) return false;
  const cur = m.owner[slot];
  if (cur === who) { if (seal) m.sealUntil[slot] = Math.max(m.sealUntil[slot], m.time + SEAL_TIME); return false; }
  if (cur >= 0 && m.sealUntil[slot] > m.time) return false;
  if (cur >= 0) m.counts[cur]--;
  m.owner[slot] = who; m.counts[who]++;
  m.sealUntil[slot] = seal ? m.time + SEAL_TIME : 0;
  m.dirty.add(slot);
  return true;
}

// paint a disc of radius r round (x, z); returns how many tiles changed
export function stamp(m, x, z, who, r, seal = false) {
  let changed = 0;
  const reach = Math.ceil(r / m.tile) + 1;
  const ci = Math.floor((x - m.x0) / m.tile); const cj = Math.floor((z - m.x0) / m.tile);
  for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) {
    if (i < 0 || j < 0 || i >= m.n || j >= m.n) continue;
    const slot = m.idx[j * m.n + i]; if (slot < 0) continue;
    const c = m.cells[slot];
    if (Math.hypot(c.x - x, c.z - z) <= r + m.tile * 0.35 && claim(m, slot, who, seal)) changed++;
  }
  return changed;
}

// one truck for one frame. v needs { x, z, grounded }; boosting = nitro burning. Returns tiles changed.
export function paintTruck(m, who, v, boosting) {
  if (m.spinUntil[who] > m.time) return 0;           // spun out: no paint
  if (!v.grounded) return 0;                          // airborne: no paint
  const wide = m.bucketUntil[who] > m.time;
  const r = wide ? WIDTH.bucket : (boosting ? WIDTH.nitro : WIDTH.normal);
  return stamp(m, v.x, v.z, who, r, boosting || wide);
}

export function spinOut(m, who) { m.spinUntil[who] = Math.max(m.spinUntil[who], m.time + SPIN_TIME); }
export function giveBucket(m, who) { m.bucketUntil[who] = Math.max(m.bucketUntil[who], m.time + BUCKET_TIME); }
export const isSpinning = (m, who) => m.spinUntil[who] > m.time;
export const hasBucket = (m, who) => m.bucketUntil[who] > m.time;

export function shares(m) { return Array.from(m.counts, (c) => c / m.total); }
export function leader(m, except = -1) {
  let best = -1; let bc = -1;
  for (let i = 0; i < m.players; i++) if (i !== except && m.counts[i] > bc) { bc = m.counts[i]; best = i; }
  return best;
}
export function ranking(m) { return Array.from({ length: m.players }, (_, i) => i).sort((a, b) => m.counts[b] - m.counts[a] || a - b); }

export function drainDirty(m) { const d = Array.from(m.dirty); m.dirty.clear(); return d; }

// the round: countdown, play, over. Player is slot 0.
export function createPaintMatch({ time = ROUND_TIME } = {}) {
  const r = {
    phase: 'countdown', clock: COUNTDOWN, timeLeft: time, events: [], won: false,
    tick(dt, m) {
      if (r.phase === 'countdown') { r.clock -= dt; if (r.clock <= 0) { r.phase = 'play'; r.events.push('go'); } }
      else if (r.phase === 'play') {
        r.timeLeft = Math.max(0, r.timeLeft - dt);
        if (m) m.time += dt;
        if (r.timeLeft <= 0) { r.phase = 'over'; r.won = !!m && ranking(m)[0] === 0; r.events.push(r.won ? 'won' : 'lost'); }
      }
    },
    countdownDigit() { return r.phase === 'countdown' ? Math.max(1, Math.ceil(r.clock - (COUNTDOWN - 3))) : 0; },
    drainEvents() { const e = r.events; r.events = []; return e; },
  };
  return r;
}

// ---- paint buckets: pickups that turn the swath wide for BUCKET_TIME. They respawn after a while.
export const BUCKET_RESPAWN = 12;
export const BUCKET_REACH = 2.4;
export function createBuckets(radius = 38) {
  const spots = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; spots.push({ x: Math.cos(a) * radius * 0.62, z: Math.sin(a) * radius * 0.62 }); }
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 1.1; spots.push({ x: Math.cos(a) * radius * 0.22, z: Math.sin(a) * radius * 0.22 }); }
  return spots.map((s) => ({ ...s, back: 0 }));
}
// trucks: [{ x, z, grounded }] indexed by player slot. Returns [{ who, bucket }] pickups this frame.
export function tickBuckets(buckets, m, trucks, dt) {
  const got = [];
  for (const b of buckets) {
    if (b.back > 0) { b.back -= dt; continue; }
    for (let who = 0; who < trucks.length; who++) {
      const t = trucks[who]; if (!t) continue;
      if (Math.hypot(t.x - b.x, t.z - b.z) <= BUCKET_REACH) { giveBucket(m, who); b.back = BUCKET_RESPAWN; got.push({ who, bucket: b }); break; }
    }
  }
  return got;
}

// sealed tiles whose time is up go back to normal (and are marked dirty so the view can lower them)
export function expireSeals(m) {
  for (let k = 0; k < m.sealUntil.length; k++) if (m.sealUntil[k] > 0 && m.sealUntil[k] <= m.time) { m.sealUntil[k] = 0; m.dirty.add(k); }
}
// distinct tile colours for the rivals, skipping any too close to the player's
export const RIVAL_COLORS = ['#4cc9f0', '#ffd60a', '#80ed99', '#c77dff', '#ff9f1c', '#ff4d6d', '#2ec4b6', '#f72585'];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function paintPalette(playerColor, n = 5) {
  const p = rgb(playerColor);
  const free = RIVAL_COLORS.filter((c) => { const q = rgb(c); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 110; });
  return [playerColor, ...free.slice(0, n)];
}
