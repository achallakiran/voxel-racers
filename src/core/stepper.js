// Fixed-timestep accumulator. Physics will run at a constant rate regardless of
// display frame rate, which keeps both physics backends deterministic and testable.

export class FixedStepper {
  constructor(stepSeconds = 1 / 60, maxSteps = 5) {
    this.step = stepSeconds;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }

  // Returns how many fixed steps to run for this frame; alpha is the leftover fraction.
  advance(dt) {
    if (!(dt > 0)) return { steps: 0, alpha: this.acc / this.step };
    this.acc += Math.min(dt, this.step * this.maxSteps);
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.acc -= this.step;
      steps++;
    }
    return { steps, alpha: this.acc / this.step };
  }
}
