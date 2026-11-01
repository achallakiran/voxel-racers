// Intro sequence: "ADA STUDIO PRESENTS" in a code font fades in and out, the ADA logo fades in, then an electric
// effect (crackling bolts, flicker, white flash) fades it out to reveal the title screen.
// Timings and the bolt generator are pure so they can be unit tested; the DOM/canvas/audio parts are thin.

export const INTRO_TIMES = {
  textIn: 0.3,       // code text fades in
  textOut: 3.2,      // ... and out
  logoIn: 3.7,       // logo fades in
  zap: 6.7,          // electric effect starts
  done: 7.8,         // hand over to the title screen
};

// a jagged lightning path between two points: n segments, each pushed sideways by up to `jitter` px
export function bolt2d(x0, y0, x1, y1, rand, segments = 12, jitter = 26) {
  const pts = [{ x: x0, y: y0 }];
  const dx = x1 - x0; const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; const ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const k = (rand() * 2 - 1) * jitter * Math.sin(Math.PI * t) ** 0.6;     // no jitter at the ends
    pts.push({ x: x0 + dx * t + nx * k, y: y0 + dy * t + ny * k });
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

// the bolts for one frame of the zap: from random screen-edge points toward the logo, a few with a fork
export function zapFrame(w, h, strength, rand) {
  const out = [];
  const cx = w / 2; const cy = h / 2;
  const n = Math.max(1, Math.round(2 + strength * 6));
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.hypot(w, h) * 0.6;
    const sx = cx + Math.cos(a) * r; const sy = cy + Math.sin(a) * r;
    const tx = cx + (rand() - 0.5) * w * 0.28; const ty = cy + (rand() - 0.5) * h * 0.4;
    const main = bolt2d(sx, sy, tx, ty, rand, 14, 40 + strength * 30);
    out.push({ pts: main, width: 1.5 + rand() * 2.5, alpha: 0.5 + 0.5 * rand() });
    if (rand() < 0.5) {
      const j = main[4 + Math.floor(rand() * 5)];
      const fx = j.x + (rand() - 0.5) * w * 0.3; const fy = j.y + (rand() - 0.5) * h * 0.3;
      out.push({ pts: bolt2d(j.x, j.y, fx, fy, rand, 7, 20), width: 1, alpha: 0.5 });
    }
  }
  return out;
}

export function createIntro({ el, canvas, audio, onDone, rand = Math.random, now = () => performance.now() }) {
  const timers = [];
  let raf = 0; let running = false; let t0 = 0; let phase = 'idle'; let finished = false;
  const T = INTRO_TIMES;
  const at = (sec, fn) => timers.push(setTimeout(fn, sec * 1000));
  const cls = (c, on = true) => el.classList.toggle(c, on);

  function drawZap() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 800; const h = canvas.height = canvas.clientHeight || 400;
    const dur = (T.done - T.zap) * 1000;
    const k = Math.min(1, (now() - t0 - T.zap * 1000) / dur);
    ctx.clearRect(0, 0, w, h);
    if (k >= 0 && k <= 1) {
      const strength = Math.sin(Math.PI * Math.min(1, k * 1.15));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const b of zapFrame(w, h, strength, rand)) {
        for (const [col, mul, blur] of [['rgba(80,200,255,0.5)', 3, 18], ['rgba(255,255,255,1)', 1, 6]]) {
          ctx.strokeStyle = col; ctx.lineWidth = b.width * mul; ctx.globalAlpha = b.alpha * (0.4 + 0.6 * strength);
          ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = blur;
          ctx.beginPath(); b.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    if (running && k < 1) raf = requestAnimationFrame(drawZap);
  }

  function stopTimers() { while (timers.length) clearTimeout(timers.pop()); cancelAnimationFrame(raf); }

  function finish() {
    if (finished) return;
    finished = true; running = false; phase = 'done';
    stopTimers();
    cls('zap', false);
    if (audio.introStop) audio.introStop();
    onDone();
  }

  return {
    get phase() { return phase; },
    start() {
      stopTimers(); finished = false; running = true; t0 = now(); phase = 'text';
      el.className = el.className.replace(/\b(t-text|t-logo|zap|t-flash)\b/g, '').trim();
      at(T.textIn, () => { cls('t-text'); if (audio.introText) audio.introText(); });
      at(T.textOut, () => { cls('t-text', false); phase = 'gap'; });
      at(T.logoIn, () => { cls('t-logo'); phase = 'logo'; if (audio.introLogo) audio.introLogo(); });
      at(T.zap, () => { cls('zap'); phase = 'zap'; if (audio.introZap) audio.introZap(); raf = requestAnimationFrame(drawZap); });
      at(T.zap + 0.55, () => cls('t-flash'));
      at(T.done, finish);
    },
    // sound was just unlocked mid-intro: start the sound for the part that is on screen now
    resumeAudio() {
      if (phase === 'text' || phase === 'gap') { if (audio.introText) audio.introText(); } else if (phase === 'logo') { if (audio.introLogo) audio.introLogo(); } else if (phase === 'zap') { if (audio.introZap) audio.introZap(); }
    },
    // a tap: if sound was just unlocked mid-intro, let the show go on (the sound starts from here); otherwise skip
    skip() { finish(); },
    stop() { stopTimers(); running = false; },
  };
}
