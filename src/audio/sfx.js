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


  // ---- grunge toolkit: distortion, crackle and drones for the intro and title screen
  const drive = (amount) => { const c = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c[i] = Math.tanh(x * amount); } return c; };
  let introNodes = [];
  let bed = null; let bedTimer = 0;
  const stopNodes = (nodes, fade = 0.15) => {
    for (const n of nodes) {
      try { if (n.gain && n.gain.setTargetAtTime) n.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3); } catch { /* ignore */ }
      setTimeout(() => { try { if (n.stop) n.stop(); n.disconnect && n.disconnect(); } catch { /* already stopped */ } }, fade * 1000 + 400);
    }
  };
  // a dirty detuned drone: saws through hard distortion and a lowpass; returns nodes to stop later
  function drone(f0, gain, cutoff, dur, sweepTo) {
    const t = ctx.currentTime;
    const sh = ctx.createWaveShaper(); sh.curve = drive(6); sh.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff, t);
    if (sweepTo) lp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.8);
    g.gain.setValueAtTime(gain, t + Math.max(0.9, dur - 0.8)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const os = [f0, f0 * 1.005, f0 * 1.5].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth'; o.frequency.value = f; o.connect(sh); o.start(t); o.stop(t + dur + 0.1); return o; });
    sh.connect(lp); lp.connect(g); g.connect(master);
    return [g, ...os];
  }
  // sparse vinyl-style pops and hiss bursts over `dur` seconds
  function crackle(dur, density = 14, gain = 0.2) {
    const t = ctx.currentTime;
    for (let i = 0; i < density * dur; i++) {
      const at = t + Math.random() * dur;
      const n = Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.02));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 4500; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = gain * (0.3 + Math.random() * 0.7);
      src.connect(f); f.connect(g); g.connect(master); src.start(at);
    }
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
    // ---- intro: code text (terminal blips over a dirty drone), logo (distorted swell), electric zap
    introText() {
      if (!ctx) return;
      introNodes.push(...drone(41, 0.16, 180, 3.4, 420));
      crackle(3.4, 16, 0.16);
      [0.15, 0.32, 0.5, 0.78, 1.1].forEach((d, i) => tone(i % 2 ? 880 : 1320, d, 0.05, 'square', 0.06));
    },
    introLogo() {
      if (!ctx) return;
      introNodes.push(...drone(55, 0.22, 200, 3.4, 1400));
      noiseBurst(1.2, 700, 0.12);
      tone(110, 0.1, 1.4, 'sawtooth', 0.12);
      crackle(3.2, 12, 0.13);
    },
    introZap() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 14; i++) {
        const at = i * 0.07 + Math.random() * 0.04;
        setTimeout(() => { noiseBurst(0.06 + Math.random() * 0.1, 2400 + Math.random() * 5000, 0.28); tone(900 + Math.random() * 2400, 0, 0.05, 'sawtooth', 0.09); }, at * 1000);
      }
      tone(52, 0.55, 0.7, 'sine', 0.5);
      setTimeout(() => noiseBurst(0.7, 900, 0.5), 560);
      crackle(1.2, 40, 0.25);
      void t;
    },
    introStop() { if (!ctx) return; stopNodes(introNodes); introNodes = []; },
    // ---- title screen bed: a slow grungy drone with hiss, pops and the odd metal scrape (call with false to stop)
    titleBed(on) {
      if (!ctx) return false;
      if (!on) { if (bed) { stopNodes(bed.nodes, 0.6); clearInterval(bedTimer); bed = null; } return false; }
      if (bed) return true;
      const nodes = [];
      const sh = ctx.createWaveShaper(); sh.curve = drive(8); sh.oversample = '2x';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.11;
      const lfoG = ctx.createGain(); lfoG.gain.value = 170;
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 2);
      const oscs = [[55, 'sawtooth'], [55.4, 'sawtooth'], [82.4, 'square'], [27.5, 'sine']].map(([f, w]) => { const o = ctx.createOscillator(); o.type = w; o.frequency.value = f; o.connect(sh); o.start(); return o; });
      sh.connect(lp); lp.connect(g); g.connect(master); lfo.start();
      nodes.push(g, lfo, ...oscs);
      // hiss floor
      const n = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const hiss = ctx.createBufferSource(); hiss.buffer = buf; hiss.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
      const hg = ctx.createGain(); hg.gain.value = 0.012;
      hiss.connect(hp); hp.connect(hg); hg.connect(master); hiss.start();
      nodes.push(hiss, hg);
      bed = { nodes };
      bedTimer = setInterval(() => {
        if (!ctx) return;
        crackle(1.2, 8, 0.12);
        if (Math.random() < 0.18) {          // a low metal scrape
          const t = ctx.currentTime; const src = ctx.createBufferSource(); const m = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const md = m.getChannelData(0);
          for (let i = 0; i < md.length; i++) md[i] = Math.random() * 2 - 1; src.buffer = m;
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
          const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.05, t + 0.2); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
          src.connect(bp); bp.connect(sg); sg.connect(master); src.start(t);
        }
      }, 1200);
      return true;
    },
    // pressing PLAY: a heavy distorted clunk
    grungeHit() { if (!ctx) return; tone(48, 0, 0.5, 'sawtooth', 0.35); noiseBurst(0.35, 900, 0.5); crackle(0.5, 30, 0.2); tone(1700, 0, 0.04, 'square', 0.1); },
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
