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
    // voice comes from vehicles/truck-feel.js, so every truck sounds different
    engineStart(voice) {
      if (!ctx) return;
      if (eng) this.engineStop();
      const v = voice || { f0: 36, range: 72, wave: 'sawtooth', detune: 1, cutoff: 260, cutoffRange: 700, sub: 0.3, whine: 0, grit: 0.1, gain: 0.3, pulse: 12 };
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const wh = ctx.createOscillator();
      const lfo = ctx.createOscillator();       // cylinder chop
      const chop = ctx.createGain();
      const lfoDepth = ctx.createGain();
      const subG = ctx.createGain();
      const whG = ctx.createGain();
      const f = ctx.createBiquadFilter();
      const shaper = ctx.createWaveShaper();
      const g = ctx.createGain();
      o1.type = v.wave; o2.type = v.wave; sub.type = 'sine'; wh.type = 'sine'; lfo.type = 'sine';
      f.type = 'lowpass';
      f.Q.value = 2;
      const amt = v.grit * 30;
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = amt ? ((1 + amt) * x) / (1 + amt * Math.abs(x)) : x; }
      shaper.curve = curve;
      subG.gain.value = v.sub;
      whG.gain.value = v.whine * 0.25;
      chop.gain.value = 0.8;
      lfoDepth.gain.value = 0.2;
      lfo.connect(lfoDepth); lfoDepth.connect(chop.gain);
      g.gain.value = 0.0001;
      o1.connect(chop); o2.connect(chop); sub.connect(subG); subG.connect(chop);
      chop.connect(shaper); shaper.connect(f);
      wh.connect(whG); whG.connect(f);
      f.connect(g); g.connect(master);
      [o1, o2, sub, wh, lfo].forEach((o) => o.start());
      eng = { o1, o2, sub, wh, lfo, f, g, v };
    },
    engineSet(rev, load = 0) {
      if (!ctx || !eng) return;
      const { v } = eng;
      const t = ctx.currentTime;
      const r = Math.min(1, Math.max(0, rev));
      const f0 = v.f0 + r * v.range;
      eng.o1.frequency.setTargetAtTime(f0, t, 0.05);
      eng.o2.frequency.setTargetAtTime(f0 + v.detune, t, 0.05);
      eng.sub.frequency.setTargetAtTime(f0 * 0.5, t, 0.05);
      eng.wh.frequency.setTargetAtTime(380 + r * 1500, t, 0.08);
      eng.lfo.frequency.setTargetAtTime(v.pulse * (0.6 + r * 1.6), t, 0.08);
      eng.f.frequency.setTargetAtTime(v.cutoff + (r + load * 0.3) * v.cutoffRange, t, 0.05);
      eng.g.gain.setTargetAtTime(v.gain * (0.55 + r * 0.45 + load * 0.15), t, 0.08);
    },
    engineStop() {
      if (!ctx || !eng) return;
      const e = eng;
      eng = null;
      e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      setTimeout(() => { for (const o of [e.o1, e.o2, e.sub, e.wh, e.lfo]) { try { o.stop(); } catch { /* already stopped */ } } }, 300);
    },
    thump(power = 10) { const p = Math.min(1, power / 20); tone(70 - p * 20, 0, 0.18, 'sine', 0.35 + p * 0.3); noiseBurst(0.18 + p * 0.15, 500 + p * 700, 0.3 + p * 0.3); },
    smash() { noiseBurst(0.22, 1400, 0.35); tone(150, 0, 0.12, 'square', 0.18); },
    explode() { noiseBurst(0.9, 380, 0.7); tone(55, 0, 0.6, 'sine', 0.6); tone(38, 0.05, 0.8, 'sawtooth', 0.25); },
    zap() { noiseBurst(0.28, 3400, 0.4); tone(1900, 0, 0.1, 'sawtooth', 0.12); tone(950, 0.04, 0.16, 'square', 0.1); tone(2600, 0.1, 0.08, 'sawtooth', 0.08); },
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
