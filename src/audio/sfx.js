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

  return {
    unlock,
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
