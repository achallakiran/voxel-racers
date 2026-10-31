// Race rules: countdown, ordered checkpoints, lap counting and timing. Pure and deterministic.
// Progress is the track fraction s in [0, 1). Crossing the checkpoints in order (and then the line) counts a lap;
// cutting across or driving backwards counts nothing.

export const COUNTDOWN = 3.2;   // seconds of "3, 2, 1" before GO

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

export function createRace({ laps = 3, checkpoints = [0, 0.25, 0.5, 0.75], startS = 0.985 } = {}) {
  const r = {
    laps, checkpoints,
    phase: 'countdown',          // countdown | racing | finished
    countdown: COUNTDOWN,
    time: 0,                     // racing clock
    lap: 1,                      // current lap (1-based)
    next: 1,                     // index of the next checkpoint to hit (0 = the finish line)
    lapStart: 0,
    lapTimes: [],
    best: Infinity,
    prevS: startS,
    finishTime: 0,
    events: [],                  // 'go' | 'checkpoint' | 'lap' | 'finish' | 'newbest'
  };

  r.tick = (dt) => {
    if (r.phase === 'countdown') {
      r.countdown -= dt;
      if (r.countdown <= 0) { r.phase = 'racing'; r.countdown = 0; r.events.push('go'); }
    } else if (r.phase === 'racing') {
      r.time += dt;
    }
  };

  // number to show during the countdown (3, 2, 1) or 0 for GO
  r.countdownDigit = () => (r.phase === 'countdown' ? Math.ceil(r.countdown - (COUNTDOWN - 3)) : 0);

  r.update = (s) => {
    const from = r.prevS;
    r.prevS = s;
    if (r.phase !== 'racing') return;
    const target = checkpoints[r.next % checkpoints.length];
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
