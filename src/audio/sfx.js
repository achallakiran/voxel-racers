// Minimal WebAudio helper (full engine / SFX arrives in the sound phase).
// Browsers block audio until a user gesture, so unlock() is called from the first tap.
// Every method is a safe no-op when audio is unavailable.

export function createAudio() {
  let ctx = null;
  let master = null;
  let volume = 0.8;

  function unlock() {
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = volume * 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, start, dur, type = 'square', gain = 0.25) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g); g.connect(master);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }

  // continuous engine for driving: two detuned saws through a lowpass, pitched by revs (0..1)
  let eng = null;
  function noiseBurst(dur, freq, gain) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  return {
    unlock,
    engineStart() {
      if (!ctx || eng) return;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'sawtooth';
      f.type = 'lowpass';
      g.gain.value = 0.0001;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
      o1.start(); o2.start();
      eng = { o1, o2, f, g };
    },
    engineSet(rev) {
      if (!ctx || !eng) return;
      const t = ctx.currentTime;
      const r = Math.min(1, Math.max(0, rev));
      eng.o1.frequency.setTargetAtTime(38 + r * 70, t, 0.05);
      eng.o2.frequency.setTargetAtTime(38.8 + r * 71, t, 0.05);
      eng.f.frequency.setTargetAtTime(240 + r * 800, t, 0.05);
      eng.g.gain.setTargetAtTime(0.16 + r * 0.22, t, 0.08);
    },
    engineStop() {
      if (!ctx || !eng) return;
      const e = eng;
      eng = null;
      e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch { /* already stopped */ } }, 300);
    },
    thump(power = 10) { const p = Math.min(1, power / 20); tone(70 - p * 20, 0, 0.18, 'sine', 0.35 + p * 0.3); noiseBurst(0.18 + p * 0.15, 500 + p * 700, 0.3 + p * 0.3); },
    boost() { noiseBurst(0.7, 1800, 0.35); tone(180, 0, 0.5, 'sawtooth', 0.12); },
    get ready() { return !!ctx; },
    setVolume(v) { volume = Math.min(1, Math.max(0, v)); if (master) master.gain.value = volume * 0.5; },
    // studio jingle: rising arpeggio
    chime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.13, 0.35)); },
    click() { tone(660, 0, 0.08, 'square', 0.18); },
    // truck rev: low sawtooth sweeping up then down through a lowpass
    rev() {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      const t = ctx.currentTime;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(42, t);
      o.frequency.exponentialRampToValueAtTime(130, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(55, t + 1.1);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(260, t);
      f.frequency.exponentialRampToValueAtTime(900, t + 0.5);
      f.frequency.exponentialRampToValueAtTime(300, t + 1.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + 1.3);
    },
  };
}
