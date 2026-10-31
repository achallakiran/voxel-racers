// Per-truck character: engine voice, suspension softness and handling multipliers.
// Pure data so it is unit tested; the audio, physics and body-spring code read from here.
//
// voice: f0 = idle pitch (Hz), range = extra Hz at full revs, wave = oscillator shape, detune = spread between the
//        two main oscillators (Hz, gives growl), cutoff/cutoffRange = lowpass opening, sub = sub-oscillator level,
//        whine = turbo/blower whine level, grit = distortion 0..1, gain = loudness, pulse = cylinder "chop" rate (Hz) 
// sus:   k = spring stiffness, c = damping, roll/pitch = how far the body leans, bounce = landing kick
// handling: steer / grip / boost multipliers

export const FEEL = {
  crusher: {
    voice: { f0: 36, range: 72, wave: 'sawtooth', detune: 1.2, cutoff: 260, cutoffRange: 700, sub: 0.35, whine: 0, grit: 0.15, gain: 0.34, pulse: 14 },
    sus: { k: 55, c: 4.2, roll: 1.0, pitch: 1.0, bounce: 1.0 },
    handling: { steer: 1.0, grip: 1.0, boost: 1.0 },
  },
  'dune-devil': {
    voice: { f0: 62, range: 110, wave: 'sawtooth', detune: 2.5, cutoff: 500, cutoffRange: 1500, sub: 0.05, whine: 0.18, grit: 0.05, gain: 0.26, pulse: 30 },
    sus: { k: 80, c: 5.5, roll: 1.25, pitch: 1.1, bounce: 1.35 },
    handling: { steer: 1.2, grip: 0.9, boost: 1.0 },
  },
  frostbite: {
    voice: { f0: 30, range: 46, wave: 'square', detune: 0.6, cutoff: 200, cutoffRange: 420, sub: 0.45, whine: 0, grit: 0.2, gain: 0.34, pulse: 9 },
    sus: { k: 42, c: 4.6, roll: 0.7, pitch: 0.8, bounce: 0.8 },
    handling: { steer: 0.85, grip: 1.25, boost: 0.9 },
  },
  toxic: {
    voice: { f0: 44, range: 90, wave: 'sawtooth', detune: 3.2, cutoff: 360, cutoffRange: 1100, sub: 0.2, whine: 0.05, grit: 0.55, gain: 0.3, pulse: 18 },
    sus: { k: 58, c: 3.6, roll: 1.2, pitch: 1.2, bounce: 1.2 },
    handling: { steer: 1.05, grip: 0.95, boost: 1.1 },
  },
  magma: {
    voice: { f0: 50, range: 120, wave: 'sawtooth', detune: 1.8, cutoff: 420, cutoffRange: 1400, sub: 0.25, whine: 0, grit: 0.8, gain: 0.3, pulse: 22 },
    sus: { k: 62, c: 4.4, roll: 1.0, pitch: 1.15, bounce: 1.0 },
    handling: { steer: 1.0, grip: 0.95, boost: 1.25 },
  },
  'night-rider': {
    voice: { f0: 40, range: 80, wave: 'triangle', detune: 0.8, cutoff: 320, cutoffRange: 900, sub: 0.2, whine: 0.28, grit: 0.05, gain: 0.3, pulse: 12 },
    sus: { k: 50, c: 5.2, roll: 0.85, pitch: 0.9, bounce: 0.9 },
    handling: { steer: 0.95, grip: 1.1, boost: 1.0 },
  },
  'yellow-thunder': {
    voice: { f0: 27, range: 40, wave: 'square', detune: 0.4, cutoff: 180, cutoffRange: 360, sub: 0.5, whine: 0, grit: 0.1, gain: 0.36, pulse: 7 },
    sus: { k: 36, c: 3.4, roll: 1.5, pitch: 1.3, bounce: 1.3 },
    handling: { steer: 0.8, grip: 0.9, boost: 0.85 },
  },
  titan: {
    voice: { f0: 22, range: 36, wave: 'sawtooth', detune: 0.5, cutoff: 150, cutoffRange: 330, sub: 0.7, whine: 0, grit: 0.3, gain: 0.4, pulse: 6 },
    sus: { k: 30, c: 3.0, roll: 0.9, pitch: 1.1, bounce: 1.5 },
    handling: { steer: 0.75, grip: 1.15, boost: 0.8 },
  },
};

const DEFAULT = FEEL.crusher;
export function getFeel(id) {
  return FEEL[id] || DEFAULT;
}
