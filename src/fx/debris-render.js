import * as THREE from '../../lib/three.module.js';

export class DebrisRenderer {
  constructor(scene, pool) {
    this.pool = pool;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), pool.max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this.mesh.setColorAt(0, this._c.setRGB(1, 1, 1));
    for (let i = 0; i < pool.max; i++) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); }
    scene.add(this.mesh);
  }

  update() {
    const p = this.pool;
    for (let i = 0; i < p.max; i++) {
      if (p.life[i] <= 0) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); continue; }
      const sc = p.size[i] * p.scale(i);
      this._e.set(p.age[i] * 3 + i, p.age[i] * 2, i * 0.7);
      this._q.setFromEuler(this._e);
      this._p.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      this._s.set(sc, sc, sc);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, this._c.setHex(p.color[i]));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
