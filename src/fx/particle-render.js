// three.js adapter for ParticlePool: one InstancedMesh of cubes, unlit, per-instance colour.
import * as THREE from '../../lib/three.module.js';
import { TINTS, tintColor } from './particle-pool.js';

// tints that behave like fire (shrink away) rather than smoke (puff and fade)
const FLAME_TINTS = new Set(['fire', 'ice', 'acid', 'plasma', 'gold']);
import { particleScale } from './emit.js';

export class ParticleRenderer {
  constructor(scene, pool) {
    this.pool = pool;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      pool.max
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.mesh.setColorAt(0, this._c.setRGB(1, 1, 1));
    // start with everything hidden
    for (let i = 0; i < pool.max; i++) {
      this._m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this._m);
    }
    scene.add(this.mesh);
  }

  update(flameTintIndex = TINTS.indexOf('fire')) {
    const pool = this.pool;
    for (let i = 0; i < pool.max; i++) {
      if (pool.life[i] <= 0) {
        this._m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._m);
        continue;
      }
      const t = pool.t(i);
      const kind = FLAME_TINTS.has(TINTS[pool.tint[i]]) ? 'flame' : 'smoke';
      const sc = particleScale(kind, t, pool.size[i]);
      this._p.set(pool.pos[i * 3], pool.pos[i * 3 + 1], pool.pos[i * 3 + 2]);
      this._s.set(sc, sc, sc);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      const [r, g, b] = tintColor(TINTS[pool.tint[i]], t);
      this.mesh.setColorAt(i, this._c.setRGB(r / 255, g / 255, b / 255));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
