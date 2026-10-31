// Arena match rules: countdown, fight, win/lose, score with a combo multiplier. Pure.
import { COUNTDOWN } from './race.js';

export const MATCH_TIME = 180;
export const COMBO_WINDOW = 2.5;
export const POINTS = { wreck: 500 };

export function comboMultiplier(chain) { return Math.min(5, 1 + Math.floor(chain / 3)); }

export function createMatch({ foes = 5, time = MATCH_TIME } = {}) {
  const m = {
    phase: 'countdown', clock: COUNTDOWN, timeLeft: time, foes, wrecked: 0, score: 0, chain: 0, chainT: 0,
    won: false, events: [],
    tick(dt) {
      if (m.phase === 'countdown') {
        m.clock -= dt;
        if (m.clock <= 0) { m.phase = 'fight'; m.events.push('go'); }
      } else if (m.phase === 'fight') {
        m.timeLeft = Math.max(0, m.timeLeft - dt);
        if (m.chain > 0) { m.chainT -= dt; if (m.chainT <= 0) m.chain = 0; }
        if (m.timeLeft <= 0) m.end(false);
      }
    },
    countdownDigit() { return m.phase === 'countdown' ? Math.max(1, Math.ceil(m.clock - (COUNTDOWN - 3))) : 0; },
    // points for smashing things; chained hits within the window raise the multiplier
    award(points) {
      if (m.phase !== 'fight') return 0;
      m.chain++; m.chainT = COMBO_WINDOW;
      const gained = points * comboMultiplier(m.chain);
      m.score += gained;
      return gained;
    },
    foeWrecked() {
      if (m.phase !== 'fight') return;
      m.wrecked++;
      m.award(POINTS.wreck);
      if (m.foes > 0 && m.wrecked >= m.foes) m.end(true);
    },
    playerWrecked() { if (m.phase === 'fight') m.end(false); },
    end(won) { m.phase = 'over'; m.won = won; m.events.push(won ? 'won' : 'lost'); },
    drainEvents() { const e = m.events; m.events = []; return e; },
  };
  return m;
}

export function formatClock(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
