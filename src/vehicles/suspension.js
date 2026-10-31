// Visual body suspension: three damped springs (heave, pitch, roll) that make the body wallow on its
// wheels like a monster truck. Pure maths; main.js applies the result to the body group.
//
// Conventions match three.js rotation of the truck body (forward +z, local +x is the truck's left):
//   rotX > 0  = nose down,   rotZ > 0 = left side up.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createSuspension() {
  return { heave: 0, heaveV: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0 };
}

// in: { accelF (forward accel, u/s^2), lat (centripetal, + = turning left), vyDelta (change in vertical
//       speed this step), impact (landing speed, 0 if none) }
export function stepSuspension(s, input, sus, dt) {
  const { k, c } = sus;
  const lean = (input.lat || 0);
  const targetPitch = clamp(-(input.accelF || 0) * 0.0042 * sus.pitch, -0.22, 0.22);
  const targetRoll = clamp(lean * 0.011 * sus.roll, -0.34, 0.34);

  // terrain bumps and landings kick the heave spring
  if (input.vyDelta) s.heaveV -= input.vyDelta * 0.55;
  if (input.impact) {
    s.heaveV -= input.impact * 0.09 * sus.bounce;
    s.pitchV += input.impact * 0.01 * sus.bounce;
  }

  s.heaveV += (-k * s.heave - c * s.heaveV) * dt;
  s.heave = clamp(s.heave + s.heaveV * dt, -0.32, 0.22);
  s.pitchV += (k * (targetPitch - s.pitch) - c * s.pitchV) * dt;
  s.pitch = clamp(s.pitch + s.pitchV * dt, -0.4, 0.4);
  s.rollV += (k * (targetRoll - s.roll) - c * s.rollV) * dt;
  s.roll = clamp(s.roll + s.rollV * dt, -0.5, 0.5);
  return s;
}
