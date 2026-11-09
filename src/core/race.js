// Race rules: countdown, ordered checkpoints, lap counting and timing. Pure and deterministic.
// Progress is the track fraction s in [0, 1). Crossing the checkpoints in order (and then the line) counts a lap;
// cutting across or driving backwards counts nothing.

export const COUNTDOWN = 3.2;   // seconds of "3, 2, 1" before GO
export const MAP_PEEK = { time: 6, cool: 40, initial: 30 };   // labyrinth overview map: seconds shown, cooldown after, cooldown at the start
export const PREVIEW_TIME = 10;  // labyrinth: seconds of overhead map before the countdown (skippable)

// signed shortest difference on the circle, in (-0.5, 0.5]
export function wrapDelta(a, b) {
  let d = b - a;
  while (d > 0.5) d -= 1;
  while (d <= -0.5) d += 1;
  return d;
}

// did we pass fraction c going forward from `from` to `to`?
export function crossedForward(from, to, c) {
  const d = wrapDelta(from, to);
  if (d <= 0) return false;
  const rel = wrapDelta(from, c);   // how far ahead the checkpoint is
  return rel > 0 && rel <= d + 1e-9;
}

// finishS (sprint tracks): the finish line is that fraction of the way along an OPEN track, not the lap line at 0.
export function createRace({ laps = 3, checkpoints = [0, 0.25, 0.5, 0.75], startS = 0.985, finishS = null, preview = 0, map = null } = {}) {
  const r = {
    laps, checkpoints,
    phase: preview > 0 ? 'preview' : 'countdown',   // preview (labyrinth map, no driving) | countdown | racing | finished
    preview,                     // seconds of preview left
    mapT: 0,                     // overview map: seconds left on screen (the truck is held, the clock keeps running)
    mapCool: map ? (map.initial ?? map.cool) : 0,   // ... and seconds until it can be opened again
    countdown: COUNTDOWN,
    time: 0,                     // racing clock
    lap: 1,                      // current lap (1-based)
    next: 1,                     // index of the next checkpoint to hit (0 = the finish line)
    lapStart: 0,
    lapTimes: [],
    best: Infinity,
    prevS: startS,
    finishTime: 0,
    events: [],                  // 'previewEnd' | 'mapStart' | 'mapEnd' | 'go' | 'checkpoint' | 'lap' | 'finish' | 'newbest'
  };

  r.startMap = () => {
    if (!map || r.phase !== 'racing' || r.mapT > 0 || r.mapCool > 0) return false;
    r.mapT = map.time; r.events.push('mapStart'); return true;
  };
  r.endMap = () => { if (r.mapT > 0) { r.mapT = 0; r.mapCool = map.cool; r.events.push('mapEnd'); } };
  r.penalty = (sec) => { if (r.phase === 'racing') { r.time += sec; r.events.push('penalty'); } };   // time added for a fall
  r.skipPreview = () => { if (r.phase === 'preview') { r.preview = 0; r.phase = 'countdown'; r.events.push('previewEnd'); } };

  r.tick = (dt) => {
    if (r.phase === 'preview') {
      r.preview -= dt;
      if (r.preview <= 0) { r.preview = 0; r.phase = 'countdown'; r.events.push('previewEnd'); }
    } else if (r.phase === 'countdown') {
      r.countdown -= dt;
      if (r.countdown <= 0) { r.phase = 'racing'; r.countdown = 0; r.events.push('go'); }
    } else if (r.phase === 'racing') {
      r.time += dt;
      if (r.mapT > 0) { r.mapT -= dt; if (r.mapT <= 0) { r.mapT = 0; r.mapCool = map.cool; r.events.push('mapEnd'); } }
      else if (r.mapCool > 0) r.mapCool = Math.max(0, r.mapCool - dt);
    } else if (r.mapT > 0) r.mapT = 0;
  };

  // number to show during the countdown (3, 2, 1) or 0 for GO
  r.countdownDigit = () => (r.phase === 'countdown' ? Math.ceil(r.countdown - (COUNTDOWN - 3)) : 0);

  r.update = (s) => {
    const from = r.prevS;
    r.prevS = s;
    if (r.phase !== 'racing') return;
    const target = r.next === 0 && finishS !== null ? finishS : checkpoints[r.next % checkpoints.length];
    if (!crossedForward(from, s, target)) return;
    if (r.next !== 0) {
      r.next = (r.next + 1) % checkpoints.length;
      r.events.push('checkpoint');
      return;
    }
    // crossed the line with every checkpoint collected
    const lapTime = r.time - r.lapStart;
    r.lapTimes.push(lapTime);
    r.lapStart = r.time;
    if (lapTime < r.best) { r.best = lapTime; r.events.push('newbest'); }
    if (r.lap >= r.laps) {
      r.phase = 'finished';
      r.finishTime = r.time;
      r.events.push('finish');
    } else {
      r.lap += 1;
      r.next = 1;
      r.events.push('lap');
    }
  };

  r.lapTime = () => (r.phase === 'racing' ? r.time - r.lapStart : 0);
  r.drainEvents = () => { const e = r.events; r.events = []; return e; };
  return r;
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
