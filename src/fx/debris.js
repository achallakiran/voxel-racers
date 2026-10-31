// Voxel debris: small cubes thrown out of smashed props and wrecked trucks. They fall, bounce and settle,
// then shrink away. Fixed capacity; spawn() drops chunks when full. Pure (no three.js).
export const GRAVITY = 24;

export class DebrisPool {
  constructor(max = 500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.color = new Uint32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;
  }

  spawn(p) {
    for (let n = 0; n < this.max; n++) {
      const i = (this.cursor + n) % this.max;
      if (this.life[i] > 0) continue;
      this.cursor = (i + 1) % this.max;
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([p.vx, p.vy, p.vz], i * 3);
      this.size[i] = p.size; this.color[i] = p.color; this.life[i] = p.life ?? 4; this.age[i] = 0;
      this.alive++;
      return i;
    }
    return -1;
  }

  update(dt, heightAt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.life[i] = 0; this.alive--; continue; }
      const k = i * 3;
      this.vel[k + 1] -= GRAVITY * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const floor = (heightAt ? heightAt(this.pos[k], this.pos[k + 2]) : 0) + this.size[i] / 2;
      if (this.pos[k + 1] < floor) {
        this.pos[k + 1] = floor;
        if (this.vel[k + 1] < -1.5) this.vel[k + 1] *= -0.38; else this.vel[k + 1] = 0;
        this.vel[k] *= 0.7; this.vel[k + 2] *= 0.7;
      }
    }
  }

  // 1 while healthy, shrinking to 0 over the last second
  scale(i) { return this.life[i] > 0 ? Math.min(1, (this.life[i] - this.age[i]) / 1) : 0; }
}

// Throw `count` chunks outward from (x,y,z). `u` is a rand() source so tests stay deterministic.
export function burst(pool, { x, y, z, colors, count, speed = 7, up = 7, size = 0.28, u = Math.random }) {
  for (let i = 0; i < count; i++) {
    const a = u() * Math.PI * 2;
    const s = speed * (0.35 + u() * 0.9);
    const col = colors[Math.floor(u() * colors.length) % colors.length];
    pool.spawn({
      x: x + (u() - 0.5) * 0.6, y: y + u() * 0.5, z: z + (u() - 0.5) * 0.6,
      vx: Math.cos(a) * s, vy: up * (0.4 + u() * 0.9), vz: Math.sin(a) * s,
      size: size * (0.6 + u() * 0.9), color: col, life: 3 + u() * 2,
    });
  }
}
