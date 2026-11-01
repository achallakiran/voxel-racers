// Fixed-capacity particle pool (structure-of-arrays). Pure logic, no three.js,
// so it is unit tested in Node and reused by the renderer adapter.

export const TINTS = ['black', 'white', 'green', 'gray', 'fire', 'dust', 'ice', 'acid', 'plasma', 'gold'];

// colour ramps over particle life (t = 0..1), as [r,g,b] 0..255
const RAMPS = {
  black: [[70, 70, 76], [20, 20, 24], [90, 90, 96]],
  white: [[255, 255, 255], [225, 238, 250], [160, 190, 215]],
  green: [[190, 255, 120], [90, 200, 70], [40, 90, 50]],
  gray: [[190, 190, 195], [130, 130, 136], [80, 80, 86]],
  fire: [[255, 240, 130], [255, 140, 20], [150, 30, 10]],
  ice: [[235, 255, 255], [90, 200, 255], [30, 70, 190]],
  acid: [[230, 255, 150], [120, 255, 40], [20, 110, 40]],
  plasma: [[255, 220, 255], [200, 80, 255], [70, 20, 160]],
  gold: [[255, 250, 190], [255, 205, 40], [190, 90, 10]],
  dust: [[236, 204, 156], [205, 165, 112], [160, 124, 86]],
};

export function tintColor(tint, t) {
  const ramp = RAMPS[tint] || RAMPS.gray;
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i];
  const b = ramp[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export class ParticlePool {
  constructor(max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);   // 0 = dead
    this.size = new Float32Array(max);
    this.rise = new Float32Array(max);   // upward acceleration (smoke rises, fire flickers)
    this.tint = new Uint8Array(max);
    this.cursor = 0;
    this.alive = 0;
  }

  // Returns the slot used, or -1 if the pool is full (callers just drop the particle).
  spawn(p) {
    for (let n = 0; n < this.max; n++) {
      const i = (this.cursor + n) % this.max;
      if (this.life[i] > 0) continue;
      this.cursor = (i + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = p.vx; this.vel[i * 3 + 1] = p.vy; this.vel[i * 3 + 2] = p.vz;
      this.age[i] = 0;
      this.life[i] = p.life;
      this.size[i] = p.size;
      this.rise[i] = p.rise ?? 0;
      this.tint[i] = Math.max(0, TINTS.indexOf(p.tint));
      this.alive++;
      return i;
    }
    return -1;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        this.alive--;
        continue;
      }
      this.vel[i * 3 + 1] += this.rise[i] * dt;
      const drag = Math.max(0, 1 - 1.4 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
  }

  // 0..1 progress through life; for rendering.
  t(i) {
    return this.life[i] > 0 ? this.age[i] / this.life[i] : 1;
  }
}
