// Part animation maths. Pure functions, no three.js.
// Each animated part carries anim = {type, axis, amp, speed, offset}.
//   bob   : translate along axis by amp * sin(phase)           (amp in voxels)
//   swing : rotate about axis by amp * sin(phase)              (amp in radians)
//   lift  : rotate about axis by amp * (0.5 + 0.5 sin(phase))  (one-sided, e.g. dump bed)
//   spin  : rotate about axis by amp * phase                   (continuous)
// Speed scales with engine revs (0..1) so pistons, jaws and pulleys race when you rev.

export function revSpeedFactor(rev) {
  const r = Math.min(1, Math.max(0, rev));
  return 0.5 + 1.5 * r;
}

export function advancePhase(phase, dt, speed, rev) {
  return phase + dt * speed * revSpeedFactor(rev);
}

export function animValue(anim, phase) {
  const p = phase + (anim.offset || 0);
  switch (anim.type) {
    case 'bob':
    case 'swing':
      return anim.amp * Math.sin(p);
    case 'lift':
      return anim.amp * (0.5 + 0.5 * Math.sin(p));
    case 'spin':
      return (anim.amp ?? 1) * p;
    default:
      return 0;
  }
}
