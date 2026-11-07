// Labyrinth engine: a maze is an ASCII map ('#' wall, ' ' floor, 'S' start cell, 'E' exit cell) of (2R+1) x (2C+1) tiles.
// Odd tiles are cells, even tiles are the wall lines between them. Pure (no three.js): physics, AI, renderer and tests share it.
// World layout: cell pitch 16 m, walls 2.4 m thick, so a corridor is 13.6 m clear. Seen from above (camera south of the truck,
// looking toward -z) x runs right and z runs DOWN the screen, exactly like the ASCII map: row 0 is the top (-z), column 0 the left (-x).
import { rng } from './layout.js';

export const PITCH = 16;
export const WALL_T = 2.4;
export const WALL_H = 3.4;
export const DIRS = [
  { k: 'N', dr: -1, dc: 0 },
  { k: 'E', dr: 0, dc: 1 },
  { k: 'S', dr: 1, dc: 0 },
  { k: 'W', dr: 0, dc: -1 },
];
// heading for each side (forward = (sin h, cos h)): north (up the map) is -z, east is +x
export const HEADING = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };

// ---- generation (used offline to freeze the stage, and by tests to try the AI on many mazes) -------------------------------
// Recursive backtracker (long winding corridors), then a little "braiding" (knocking out some dead ends) so there are loops.
export function generateMaze(seed, R, C, braid = 0.12) {
  const r = rng(seed);
  const open = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ N: false, E: false, S: false, W: false })));
  const seen = Array.from({ length: R }, () => Array(C).fill(false));
  const opp = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const stack = [[R - 1, 0]]; seen[R - 1][0] = true;
  while (stack.length) {
    const [cr, cc] = stack[stack.length - 1];
    const nb = DIRS.map((d) => ({ ...d, r: cr + d.dr, c: cc + d.dc })).filter((n) => n.r >= 0 && n.r < R && n.c >= 0 && n.c < C && !seen[n.r][n.c]);
    if (!nb.length) { stack.pop(); continue; }
    const n = nb[Math.floor(r() * nb.length)];
    open[cr][cc][n.k] = true; open[n.r][n.c][opp[n.k]] = true; seen[n.r][n.c] = true;
    stack.push([n.r, n.c]);
  }
  const count = (cr, cc) => Object.values(open[cr][cc]).filter(Boolean).length;
  for (let cr = 0; cr < R; cr++) for (let cc = 0; cc < C; cc++) {
    if (count(cr, cc) !== 1 || r() > braid || (cr === R - 1 && cc === 0)) continue;
    const nb = DIRS.map((d) => ({ ...d, r: cr + d.dr, c: cc + d.dc })).filter((n) => n.r >= 0 && n.r < R && n.c >= 0 && n.c < C && !open[cr][cc][n.k]);
    if (!nb.length) continue;
    const n = nb[Math.floor(r() * nb.length)];
    open[cr][cc][n.k] = true; open[n.r][n.c][opp[n.k]] = true;
  }
  // the exit is the dead end furthest from the start
  const d0 = Array.from({ length: R }, () => Array(C).fill(-1));
  const q = [[R - 1, 0]]; d0[R - 1][0] = 0;
  for (let h = 0; h < q.length; h++) {
    const [cr, cc] = q[h];
    for (const d of DIRS) if (open[cr][cc][d.k] && d0[cr + d.dr][cc + d.dc] < 0) { d0[cr + d.dr][cc + d.dc] = d0[cr][cc] + 1; q.push([cr + d.dr, cc + d.dc]); }
  }
  let exit = null; let far = -1;
  for (let cr = 0; cr < R; cr++) for (let cc = 0; cc < C; cc++) if (count(cr, cc) === 1 && !(cr === R - 1 && cc === 0) && d0[cr][cc] > far) { far = d0[cr][cc]; exit = { r: cr, c: cc }; }
  return toAscii(open, R, C, { r: R - 1, c: 0 }, exit);
}

function toAscii(open, R, C, start, exit) {
  const g = Array.from({ length: 2 * R + 1 }, () => Array(2 * C + 1).fill('#'));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    g[2 * r + 1][2 * c + 1] = ' ';
    if (open[r][c].E) g[2 * r + 1][2 * c + 2] = ' ';
    if (open[r][c].S) g[2 * r + 2][2 * c + 1] = ' ';
  }
  if (start) g[2 * start.r + 1][2 * start.c + 1] = 'S';
  if (exit) g[2 * exit.r + 1][2 * exit.c + 1] = 'E';
  return g.map((row) => row.join(''));
}

// ---- the maze model ------------------------------------------------------------------------------------------------------
export function createMaze(lines) {
  const H = lines.length; const W = lines[0].length;
  const R = (H - 1) / 2; const C = (W - 1) / 2;
  const tile = (i, j) => (i < 0 || j < 0 || i >= H || j >= W ? '#' : lines[i][j]);
  let start = null; let exit = null;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const ch = tile(2 * r + 1, 2 * c + 1);
    if (ch === 'S') start = { r, c };
    if (ch === 'E') exit = { r, c };
  }
  if (!start || !exit) throw new Error('maze needs S and E');
  const isOpen = (r, c, d) => tile(2 * r + 1 + d.dr, 2 * c + 1 + d.dc) !== '#';
  const sides = (r, c) => DIRS.filter((d) => isOpen(r, c, d)).map((d) => ({ k: d.k, r: r + d.dr, c: c + d.dc }));

  // x runs with columns, z runs with rows. Tile extents (even index = wall line, odd = cell)
  const ext = (k, n) => {
    const half = n / 2;                                           // n cells, n+1 wall lines
    if (k % 2 === 0) { const mid = (k / 2 - half) * PITCH; return [mid - WALL_T / 2, mid + WALL_T / 2]; }
    const mid = ((k - 1) / 2 - (n - 1) / 2) * PITCH;
    return [mid - (PITCH - WALL_T) / 2, mid + (PITCH - WALL_T) / 2];
  };
  const xs = Array.from({ length: W }, (_, j) => ext(j, C));
  const zs = Array.from({ length: H }, (_, i) => ext(i, R));
  const cellCenter = (r, c) => ({ x: (c - (C - 1) / 2) * PITCH, z: (r - (R - 1) / 2) * PITCH });
  const cellAt = (x, z) => ({
    r: Math.max(0, Math.min(R - 1, Math.round(z / PITCH + (R - 1) / 2))),
    c: Math.max(0, Math.min(C - 1, Math.round(x / PITCH + (C - 1) / 2))),
  });

  // distance to the exit from every cell (BFS) -- game-side only (standings, respawn); the rivals never see it
  const dist = Array.from({ length: R }, () => Array(C).fill(-1));
  const q = [[exit.r, exit.c]]; dist[exit.r][exit.c] = 0;
  for (let h = 0; h < q.length; h++) {
    const [r, c] = q[h];
    for (const n of sides(r, c)) if (dist[n.r][n.c] < 0) { dist[n.r][n.c] = dist[r][c] + 1; q.push([n.r, n.c]); }
  }
  // the shortest route start -> exit
  const path = [{ r: start.r, c: start.c }];
  while (dist[path[path.length - 1].r][path[path.length - 1].c] > 0) {
    const cur = path[path.length - 1];
    const nxt = sides(cur.r, cur.c).find((n) => dist[n.r][n.c] === dist[cur.r][cur.c] - 1);
    path.push({ r: nxt.r, c: nxt.c });
  }
  // every cell is tied to the route cell it branches off from (multi-source BFS from the route)
  const anchor = Array.from({ length: R }, () => Array(C).fill(-1));
  const aq = [];
  path.forEach((p, i) => { anchor[p.r][p.c] = i; aq.push([p.r, p.c]); });
  for (let h = 0; h < aq.length; h++) {
    const [r, c] = aq[h];
    for (const n of sides(r, c)) if (anchor[n.r][n.c] < 0) { anchor[n.r][n.c] = anchor[r][c]; aq.push([n.r, n.c]); }
  }
  const deadEnds = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (sides(r, c).length === 1 && !(r === start.r && c === start.c) && !(r === exit.r && c === exit.c)) deadEnds.push({ r, c });
  let edges = 0; let cells = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { cells++; edges += sides(r, c).length; }
  edges /= 2;

  // circle vs the wall tiles around it. Returns { x, z, nx, nz } (corrected position; n points into the wall) or null.
  function collide(x, z, rad) {
    let jc = 0; let ic = 0;
    for (let j = 0; j < W; j++) if (x >= xs[j][0]) jc = j;
    for (let i = 0; i < H; i++) if (z >= zs[i][0]) ic = i;
    let hit = null; let px = x; let pz = z;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = Math.max(0, ic - 2); i <= Math.min(H - 1, ic + 2); i++) {
        for (let j = Math.max(0, jc - 2); j <= Math.min(W - 1, jc + 2); j++) {
          if (lines[i][j] !== '#') continue;
          const [x0, x1] = xs[j]; const [z0, z1] = zs[i];
          const cx = Math.max(x0, Math.min(x1, px)); const cz = Math.max(z0, Math.min(z1, pz));
          let dx = px - cx; let dz = pz - cz; let d = Math.hypot(dx, dz);
          if (d >= rad) continue;
          if (d < 1e-6) {                                         // centre inside the wall: leave by the nearest face
            const l = px - x0; const r2 = x1 - px; const b = pz - z0; const t = z1 - pz;
            const m = Math.min(l, r2, b, t);
            if (m === l) { dx = -1; dz = 0; d = -l; } else if (m === r2) { dx = 1; dz = 0; d = -r2; } else if (m === b) { dx = 0; dz = -1; d = -b; } else { dx = 0; dz = 1; d = -t; }
          } else { dx /= d; dz /= d; }
          px += dx * (rad - d); pz += dz * (rad - d);
          hit = { nx: -dx, nz: -dz }; moved = true;
        }
      }
      if (!moved) break;
    }
    return hit ? { x: px, z: pz, nx: hit.nx, nz: hit.nz } : null;
  }

  return {
    lines, R, C, W, H, start, exit, tile, sides, isOpen, cellCenter, cellAt, dist, path, anchor, deadEnds, edges, cells, xs, zs, collide,
    loops: edges - (cells - 1),
    bounds: { x: C * PITCH / 2 + WALL_T / 2, z: R * PITCH / 2 + WALL_T / 2 },
    // wall runs for drawing: merged horizontal / vertical rectangles { x0, x1, z0, z1 }
    wallRuns() {
      const runs = [];
      const used = lines.map((row) => Array.from(row, () => false));
      for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
        if (lines[i][j] !== '#' || used[i][j]) continue;
        let j2 = j; while (j2 + 1 < W && lines[i][j2 + 1] === '#' && !used[i][j2 + 1]) j2++;
        let i2 = i; while (i2 + 1 < H && lines[i2 + 1][j] === '#' && !used[i2 + 1][j]) i2++;
        const horiz = j2 - j >= i2 - i;
        if (horiz) { for (let k = j; k <= j2; k++) used[i][k] = true; runs.push({ x0: xs[j][0], x1: xs[j2][1], z0: zs[i][0], z1: zs[i][1] }); }
        else { for (let k = i; k <= i2; k++) used[k][j] = true; runs.push({ x0: xs[j][0], x1: xs[j][1], z0: zs[i][0], z1: zs[i2][1] }); }
      }
      return runs;
    },
  };
}

// ---- track-shaped wrapper: gives the maze the same API a road track has, so the race rules, standings, respawn and
// camera keep working. The "centreline" is the shortest route; `s` of a cell off the route is the s of the route cell it branches from.
export function makeMazeTrack(def) {
  const M = createMaze(def.ascii);
  const pts = M.path.map((p) => M.cellCenter(p.r, p.c));
  // resample the route every ~2 m with headings
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const LENGTH = cum[cum.length - 1];
  const sCell = cum.map((d) => d / LENGTH);
  const SAMPLES = [];
  const N = Math.round(LENGTH / 2);
  for (let k = 0; k <= N; k++) {
    const d = (k / N) * LENGTH;
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++;
    const a = pts[i]; const b = pts[i + 1];
    const f = (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    const sx = b.x - a.x; const sz = b.z - a.z; const l = Math.hypot(sx, sz) || 1;
    SAMPLES.push({ x: a.x + sx * f, z: a.z + sz * f, tx: sx / l, tz: sz / l, y: 0, s: d / LENGTH });
  }
  const sampleAt = (s) => {
    const u = Math.max(0, Math.min(1, s)) * N; const i = Math.min(N - 1, Math.floor(u)); const f = u - i;
    const a = SAMPLES[i]; const b = SAMPLES[i + 1];
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx: a.tx, tz: a.tz, y: 0, s };
  };
  const headingAt = (s) => { const p = sampleAt(s); return Math.atan2(p.tx, p.tz); };

  function nearest(x, z) {
    const c = M.cellAt(x, z);
    const k = M.anchor[c.r][c.c];
    const onRoute = M.path[k].r === c.r && M.path[k].c === c.c;
    let s = sCell[k]; let d = 0; let px = pts[k].x; let pz = pts[k].z; let tx = 0; let tz = 1;
    // project onto the route near this cell
    const lo = Math.max(0, k - 1); const hi = Math.min(pts.length - 1, k + 1);
    let best = Infinity;
    for (let i = lo; i < hi; i++) {
      const a = pts[i]; const b = pts[i + 1];
      const sx = b.x - a.x; const sz = b.z - a.z; const l2 = sx * sx + sz * sz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / l2));
      const qx = a.x + sx * t; const qz = a.z + sz * t;
      const dd = Math.hypot(x - qx, z - qz);
      if (dd < best) {
        best = dd; px = qx; pz = qz;
        const l = Math.sqrt(l2); tx = sx / l; tz = sz / l;
        d = (x - qx) * tz - (z - qz) * tx;
        if (onRoute) s = (cum[i] + t * (cum[i + 1] - cum[i])) / LENGTH;
      }
    }
    if (!Number.isFinite(best)) best = Math.hypot(x - px, z - pz);
    return { i: k, t: 0, dist: best, d, ad: 0, s, px, pz, tx, tz, y: 0, side: d, r: c.r, c: c.c };
  }

  const sd = M.sides(M.start.r, M.start.c)[0].k;
  const sc = M.cellCenter(M.start.r, M.start.c);
  const START_S = 0;
  const FINISH_S = 1 - 5.5 / LENGTH;
  const startPose = () => ({ x: sc.x, z: sc.z, heading: HEADING[sd], y: 0 });
  // the grid: six trucks in the start cell (two columns, three rows), all facing the way out
  const gridPose = (slot) => {
    const row = Math.floor(slot / 2); const col = slot % 2 === 0 ? -3.4 : 3.4;
    const back = 3.8 - row * 4.6;                                  // rows from the front (+3.8) to the back (-5.4)
    const h = HEADING[sd]; const fx = Math.sin(h); const fz = Math.cos(h);
    return { x: sc.x + fx * back + fz * col, z: sc.z + fz * back - fx * col, heading: h, s: 0 };
  };
  const exitC = M.cellCenter(M.exit.r, M.exit.c);

  // pickups: nitro canisters in the dead ends
  const PICKUPS = [];
  M.deadEnds.forEach((c, i) => {
    if (i % 2) return;
    const p = M.cellCenter(c.r, c.c);
    PICKUPS.push({ id: PICKUPS.length, x: p.x, z: p.z, y0: 0, r: 1.5, taken: false, cool: 0 });
  });

  const heightAt = () => 0;
  const surfaceAt = () => 'dirt';
  const constrain = (x, z, rad) => M.collide(x, z, rad);
  const terrain = { heightAt, surfaceAt, constrain, obstacles: [], props: [], pickups: PICKUPS, loops: [], radius: 1e9, noRegen: true, gravity: undefined, wind: null, slopeLanding: false, hazards: [], time: 0 };
  const freshTerrain = () => ({ ...terrain, obstacles: [], props: [], pickups: PICKUPS.map((k) => ({ ...k, taken: false, cool: 0 })), hazards: [], time: 0 });

  return {
    id: def.id, name: def.name, theme: def.theme, env: { weather: 'none', hideBarriers: true, ...(def.env || {}) }, STRUCTURES: [], shade: null, paint: null,
    ROAD_HALF: PITCH / 2 - WALL_T / 2, SHOULDER: 0, BARRIER: PITCH,
    LENGTH, DS: 2, SAMPLES, SECTIONS: [], CHECKPOINTS: [0, 0.5], START_S, OPEN: true, FINISH_S, LINE_S: 0.001, SMAX: 1, FEATURES: [], OBSTACLES: [], WALLS: [], BLOCKS: [], PROPS: [], PICKUPS, ZONES: [], LOOPS: [], LANES: [],
    nearest, sampleAt, headingAt, sample: () => ({}), heightAt, surfaceAt, constrain, laneAt: null, straightNear: () => null,
    sceneryLayout: () => [], barrierLayout: () => [], startPose, gridPose, terrain, freshTerrain, featureHeightAt: () => 0,
    TRACK: { name: def.name, length: LENGTH, halfWidth: PITCH / 2, barrier: PITCH, samples: SAMPLES, checkpoints: [0, 0.5] },
    maze: M, exitPose: { x: exitC.x, z: exitC.z },
  };
}

// ---- fog of war: a tile is shown once a cell touching it has been driven through. `explored` is a Set of r * 64 + c.
export function tileSeen(M, explored, i, j) {
  const seen = (r, c) => r >= 0 && c >= 0 && r < M.R && c < M.C && explored.has(r * 64 + c);
  const cr = i % 2 ? (i - 1) / 2 : null; const cc = j % 2 ? (j - 1) / 2 : null;
  if (cr !== null && cc !== null) return seen(cr, cc);
  if (cr !== null) return seen(cr, (j - 2) / 2) || seen(cr, j / 2);
  if (cc !== null) return seen((i - 2) / 2, cc) || seen(i / 2, cc);
  return seen((i - 2) / 2, (j - 2) / 2) || seen((i - 2) / 2, j / 2) || seen(i / 2, (j - 2) / 2) || seen(i / 2, j / 2);
}
