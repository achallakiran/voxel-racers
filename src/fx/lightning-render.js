// Draws bolts as short-lived strings of glowing voxels (instanced cubes).
import * as THREE from '../../lib/three.module.js';

export class LightningRenderer {
  constructor(scene, max = 700) {
    this.max = max;
    this.bolts = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.mesh.setColorAt(0, this._c.setRGB(1, 1, 1));
    for (let i = 0; i < max; i++) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); }
    scene.add(this.mesh);
  }

  // points: [{x,y,z}]; life seconds; width = cube size
  add(points, life = 0.3, width = 0.2) {
    const cubes = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]; const b = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / (width * 1.6)));
      for (let k = 0; k < n; k++) { const t = k / n; cubes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }); }
    }
    this.bolts.push({ cubes, life, age: 0, width });
    if (this.bolts.length > 24) this.bolts.shift();
  }

  update(dt) {
    let i = 0;
    for (const b of this.bolts) b.age += dt;
    this.bolts = this.bolts.filter((b) => b.age < b.life);
    for (const b of this.bolts) {
      const t = b.age / b.life;
      for (const c of b.cubes) {
        if (i >= this.max) break;
        const flick = 0.55 + Math.random() * 0.7;
        const sc = b.width * (1 - t * 0.7) * flick;
        this._p.set(c.x, c.y, c.z); this._s.set(sc, sc, sc);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(i, this._m);
        this.mesh.setColorAt(i, t < 0.4 ? this._c.setRGB(0.85, 1, 1) : this._c.setRGB(0.25, 0.9, 1));
        i++;
      }
    }
    for (; i < this.max; i++) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.bolts = []; this.update(0); }
}
