// Sumo Plate: the rules. Pure (no three.js, no DOM).
// A round raised disc: a centre plate and RINGS rings round it. Every DROP_EVERY seconds the outermost ring cracks (CRACK_TIME
// of warning) and then falls away, so the disc shrinks. Last truck on the disc wins the round; five rounds make a match.
// Once every ring is gone the plate itself shrinks (sudden death). A truck is "out" when it is below the plate.
import { COUNTDOWN } from './race.js';

export const RING_COUNT = 4;
export const PLATE_R = 8;
export const DISC_R = 30;
export const PLATE_Y = 3;              // the top of the disc above the ground
export const DROP_EVERY = 15;
export const CRACK_TIME = 2;
export const SHRINK_AFTER = 8;         // seconds after the last ring before the plate starts to shrink
export const SHRINK_RATE = 0.45;       // metres per second
export const MIN_R = 3;
export const MATCH_ROUNDS = 5;
export const STUN_TIME = 1;            // a dash hit spins the victim for this long
export const OUT_Y = PLATE_Y - 1.2;    // below this a truck is off the disc

export function ringEdges(plate = PLATE_R, disc = DISC_R, n = RING_COUNT) {
  const e = [plate];
  for (let k = 1; k <= n; k++) e.push(plate + (disc - plate) * k / n);
  return e;                             // e[0] = plate edge ... e[n] = outer edge
}

export function createSumoRound({ players = 6 } = {}) {
  const edges = ringEdges();
  const s = {
    players, edges, phase: 'countdown', clock: COUNTDOWN, time: 0, gone: 0, sinceGone: 0, toDrop: DROP_EVERY,
    alive: new Array(players).fill(true), stunUntil: new Float32Array(players), winner: -1, events: [],
    // radius of the disc right now (outer edge of what is still standing)
    radius() {
      if (s.gone < RING_COUNT) return edges[RING_COUNT - s.gone];
      return Math.max(MIN_R, PLATE_R - Math.max(0, s.sinceGone - SHRINK_AFTER) * SHRINK_RATE);
    },
    // the ring that is about to fall (1 = innermost ring, RING_COUNT = outermost) or 0
    cracking() { return s.phase === 'play' && s.gone < RING_COUNT && s.toDrop <= CRACK_TIME ? RING_COUNT - s.gone : 0; },
    // radius that will still be standing after the next drop (what a rival should retreat inside)
    safeRadius() { return s.gone < RING_COUNT ? edges[RING_COUNT - s.gone - 1] : s.radius(); },
    heightAt(x, z) { return Math.hypot(x, z) <= s.radius() ? PLATE_Y : 0; },
    tick(dt) {
      if (s.phase === 'countdown') { s.clock -= dt; if (s.clock <= 0) { s.phase = 'play'; s.events.push('go'); } return; }
      if (s.phase !== 'play') return;
      s.time += dt;
      if (s.gone < RING_COUNT) {
        const before = s.toDrop;
        s.toDrop -= dt;
        if (before > CRACK_TIME && s.toDrop <= CRACK_TIME) s.events.push({ type: 'crack', ring: RING_COUNT - s.gone });
        if (s.toDrop <= 0) { s.events.push({ type: 'drop', ring: RING_COUNT - s.gone }); s.gone++; s.toDrop = DROP_EVERY; s.sinceGone = 0; }
      } else s.sinceGone += dt;
    },
    countdownDigit() { return s.phase === 'countdown' ? Math.max(1, Math.ceil(s.clock - (COUNTDOWN - 3))) : 0; },
    // call every frame with the trucks [{x,y,z}] by slot; marks the ones that have gone off the disc and ends the round
    check(trucks) {
      if (s.phase !== 'play') return;
      trucks.forEach((t, i) => {
        if (s.alive[i] && t && t.y < OUT_Y && Math.hypot(t.x, t.z) > 0.01 && (Math.hypot(t.x, t.z) > s.radius() - 0.5 || t.y < OUT_Y - 0.6)) { s.alive[i] = false; s.events.push({ type: 'out', who: i }); }
      });
      if (!s.alive[0]) return s.end(-1);                           // you are out: the round is over (and lost)
      const left = s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      if (left.length <= 1) s.end(left.length ? left[0] : -1);
    },
    end(who) { if (s.phase === 'over') return; s.phase = 'over'; s.winner = who; s.events.push({ type: 'over', winner: who }); },
    stun(who) { s.stunUntil[who] = Math.max(s.stunUntil[who], s.time + STUN_TIME); },
    isStunned(who) { return s.stunUntil[who] > s.time; },
    aliveCount() { return s.alive.filter(Boolean).length; },
    drainEvents() { const e = s.events; s.events = []; return e; },
  };
  return s;
}

// five rounds; wins counts only the player (slot 0): the point is yours or nobody's
export function createSumoMatch({ rounds = MATCH_ROUNDS } = {}) {
  const m = {
    rounds, round: 0, wins: 0, results: [],           // results[i] = true when you won round i
    record(roundState) { const won = roundState.winner === 0; m.results.push(won); if (won) m.wins++; m.round++; },
    get done() { return m.round >= m.rounds; },
    get won() { return m.wins * 2 > m.rounds; },
  };
  return m;
}
