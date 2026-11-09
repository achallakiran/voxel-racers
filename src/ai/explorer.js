// Labyrinth rival: an explorer that has to FIND the way, like the player. It never reads the maze solution, the distance to
// the exit or the full map. All it ever sees is the cell it is in (its coordinates) and which of that cell's four sides are open.
// It remembers marks on the passages it has used (Tremaux's algorithm), which is how a person with chalk solves a hedge maze.
// The only hint is a weak "compass": which way the exit lies in a straight line (the exit arch is lit and visible above the hedges);
// it nudges which unmarked passage is tried first and can never make a wall disappear or reveal a route.
import { rng } from '../world/layout.js';
import { PITCH, HEADING, DIRS } from '../world/maze.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIR = Object.fromEntries(DIRS.map((d) => [d.k, d]));

export const EXPLORER_STYLES = {
  steady: { fast: false, bias: 1.8, cruise: 15, skill: 1 },
  aggressive: { fast: true, bias: 3.2, cruise: 18, skill: 1 },
};

export function createExplorer({ seed = 1, style = 'steady', compass = null } = {}) {
  return {
    rand: rng(seed), style: EXPLORER_STYLES[style] ? style : 'steady', compass,   // compass: { r, c } of the exit arch (a direction only)
    marks: new Map(),            // 'r,c' -> { N, E, S, W } how often this cell's passage has been walked
    visited: new Set(),
    cell: null,                  // the cell we are in
    target: null,                // { r, c, k } neighbour we are heading for
    centred: false,              // reached the middle of the current cell
    stuckT: 0, reverseT: 0, reverseSteer: 1, nextBoost: 3, steps: 0,
  };
}

const key = (r, c) => `${r},${c}`;
const markOf = (ex, r, c) => { const k = key(r, c); let m = ex.marks.get(k); if (!m) { m = { N: 0, E: 0, S: 0, W: 0 }; ex.marks.set(k, m); } return m; };

// Choose the next side at cell (r, c). `open` is the list of open side letters (the whole local view). `from` is the side we
// came in by, or null if we were bumped into this cell. Returns a side letter.
export function chooseSide(ex, r, c, open, from) {
  const m = markOf(ex, r, c);
  const seenBefore = ex.visited.has(key(r, c));
  ex.visited.add(key(r, c));
  if (from && open.includes(from)) {
    const arrivedFresh = m[from] === 0;          // this end of the passage had no mark: we came by a passage new to this cell
    m[from] += 1;
    if (seenBefore && arrivedFresh) { m[from] += 1; return from; }   // a loop back onto a place already visited: turn round
  }
  const pool = open.filter((k) => k !== from);
  if (!pool.length) { const b = from || open[0]; m[b] += 1; return b; }       // dead end
  const unmarked = pool.filter((k) => m[k] === 0);
  const st = EXPLORER_STYLES[ex.style];
  if (unmarked.length) {
    const weights = unmarked.map((k) => {
      let w = 1;
      if (ex.compass) {
        const dr = ex.compass.r - r; const dc = ex.compass.c - c; const l = Math.hypot(dr, dc) || 1;
        w += st.bias * Math.max(0, (DIR[k].dr * dr + DIR[k].dc * dc) / l);
      }
      return w;
    });
    let t = ex.rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < unmarked.length; i++) { t -= weights[i]; if (t <= 0) { m[unmarked[i]] += 1; return unmarked[i]; } }
    m[unmarked[0]] += 1; return unmarked[0];
  }
  // everything beyond is walked: go back the way we came if that is still allowed, else the least-walked passage
  if (from && m[from] < 2) { m[from] += 1; return from; }
  const best = [...pool].sort((a, b) => m[a] - m[b])[0];
  m[best] += 1; return best;
}

// One control step. `view` is { r, c, open: ['N', ...] } for the cell at the truck: the local view and nothing else.
export function explorerInput(ex, v, tune, cellAt, cellCenter, localOpen, dt, ctx = {}) {
  if (ctx.phase !== 'racing') return { steer: 0, gas: 0, brake: 0, boost: false, hold: true };
  if (ctx.finished) return { steer: 0, gas: 0, brake: 1, boost: false, hold: true };
  const st = EXPLORER_STYLES[ex.style];
  const here = cellAt(v.x, v.z);
  const speed = Math.max(0, v.f);

  // entered a new cell (or first call): decide where to go next
  if (!ex.cell || ex.cell.r !== here.r || ex.cell.c !== here.c) {
    const prev = ex.cell;
    let from = null;
    if (prev) for (const d of DIRS) if (prev.r + d.dr === here.r && prev.c + d.dc === here.c) from = OPP[d.k];
    // leaving the previous cell along a passage walks it once (the mark is the chalk on the floor)
    ex.cell = { r: here.r, c: here.c }; ex.centred = false; ex.steps++;
    const side = chooseSide(ex, here.r, here.c, localOpen(here.r, here.c), from);
    ex.target = { r: here.r + DIR[side].dr, c: here.c + DIR[side].dc, k: side };
    ex.turn = null;
  }
  const mid = cellCenter(here.r, here.c);
  const nxt = cellCenter(ex.target.r, ex.target.c);
  if (!ex.centred && Math.hypot(mid.x - v.x, mid.z - v.z) < 4.5) ex.centred = true;
  const aim = ex.centred ? nxt : mid;
  const want = Math.atan2(aim.x - v.x, aim.z - v.z);
  const diff = wrap(want - v.heading);
  let steer = clamp(-diff * 2.8, -1, 1);

  // slow for the turn this cell asks of us
  const out = HEADING[ex.target.k];
  const turnNeeded = Math.abs(wrap(out - v.heading));
  const dMid = Math.hypot(mid.x - v.x, mid.z - v.z);
  let target = st.cruise * st.skill;
  if (!ex.centred && turnNeeded > 0.5 && dMid < 22) target = turnNeeded > 2.2 ? 6 : 8.5;
  if (ex.centred && Math.abs(diff) > 0.5) target = Math.min(target, 8.5);
  target = Math.min(target, tune.maxSpeed * 0.9);

  let gas = 0; let brake = 0; let boost = false;
  if (speed < target) gas = 1; else if (speed > target + 2.5) brake = 1;
  if (Math.abs(diff) > 1.2 && speed > 7) { gas = 0; brake = 1; }

  // stuck against a wall? back out and turn
  if (v.grounded && Math.abs(v.f) < 1.0) ex.stuckT += dt; else ex.stuckT = Math.max(0, ex.stuckT - dt * 2);
  if (ex.reverseT > 0) {
    ex.reverseT -= dt;
    return ex.recoverFwd ? { steer: ex.reverseSteer, gas: 1, brake: 0, boost: false } : { steer: ex.reverseSteer, gas: 0, brake: 1, boost: false };
  }
  if (ex.stuckT > 1.0) {
    // wedged: back out, and if that does not free it (a wall behind too) the next try drives forward with the wheel the other way
    ex.stuckT = 0; ex.reverseT = 1.0; ex.stuckCount = (ex.stuckCount || 0) + 1;
    ex.recoverFwd = ex.stuckCount % 2 === 0; ex.reverseSteer = ex.recoverFwd ? (steer || 1) : -(steer || 1);
    return ex.recoverFwd ? { steer: ex.reverseSteer, gas: 1, brake: 0, boost: false } : { steer: ex.reverseSteer, gas: 0, brake: 1, boost: false };
  }
  if (speed > 4) ex.stuckCount = 0;

  ex.nextBoost -= dt;
  if (st.fast && ex.nextBoost <= 0 && v.nitro > 0.6 && ex.centred && Math.abs(diff) < 0.1 && turnNeeded < 0.2 && speed > 8) { boost = true; ex.nextBoost = 7 + ex.rand() * 4; }
  return { steer, gas, brake, boost };
}
