// Turns the pure voxel data into three.js meshes + an animation rig.
// One InstancedMesh per palette key keeps draw calls low and makes repainting cheap
// (change the material colour; per-voxel shading jitter lives in instance colours).

import * as THREE from '../../lib/three.module.js';
import { buildTruckVoxels, PALETTE_KEYS } from './voxel-model.js';
import { advancePhase, animValue } from './animate.js';

export const VOXEL_SIZE = 0.1;

const FIXED = {
  tire: '#1b1b1f', tread: '#3d3d46', dark: '#26262b', glass: '#7fd8ff',
  light: '#fff6b0', chrome: '#d9dee3', flame: '#ff3b30', skin: '#f1c27d', tooth: '#f6f3e8',
};

let sharedGeometry = null;
function voxelGeometry() {
  if (!sharedGeometry) sharedGeometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
  return sharedGeometry;
}

// deterministic jitter so the same voxel always has the same shade
function jitter(x, y, z) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return 0.9 + (n - Math.floor(n)) * 0.1;
}

function colorFor(key, paint) {
  if (key === 'body') return paint.body;
  if (key === 'accent') return paint.accent;
  if (key === 'rim') return paint.rim;
  return FIXED[key];
}

function makeMeshes(voxels, offset, materials, parent) {
  const byKey = new Map();
  for (const v of voxels) {
    if (!byKey.has(v.k)) byKey.set(v.k, []);
    byKey.get(v.k).push(v);
  }
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const [key, list] of byKey) {
    const mesh = new THREE.InstancedMesh(voxelGeometry(), materials[key], list.length);
    list.forEach((v, i) => {
      m.setPosition((v.x - offset.x) * VOXEL_SIZE, (v.y - offset.y) * VOXEL_SIZE, (v.z - offset.z) * VOXEL_SIZE);
      mesh.setMatrixAt(i, m);
      const j = jitter(v.x, v.y, v.z);
      mesh.setColorAt(i, c.setRGB(j, j, j));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

export function createTruckMesh(truck, paintOverride) {
  const paint = { ...truck.paint, ...(paintOverride || {}) };
  const data = buildTruckVoxels(truck.shape);

  const materials = {};
  for (const key of PALETTE_KEYS) {
    materials[key] = new THREE.MeshLambertMaterial({ color: colorFor(key, paint) });
    if (key === 'light' || key === 'flame') {
      materials[key].emissive = new THREE.Color(colorFor(key, paint)).multiplyScalar(0.35);
    }
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // centre on x/z, sit on the ground (y=0 voxel bottom face at world 0)
  const centre = { x: 12.5, y: -0.5, z: data.size.z / 2 };
  makeMeshes(data.voxels, centre, materials, body);

  const wheelGroups = [];
  for (const w of data.wheels) {
    const g = new THREE.Group();
    g.position.set((w.cx + 1.5 - centre.x) * VOXEL_SIZE, (w.cy - centre.y) * VOXEL_SIZE, (w.cz - centre.z) * VOXEL_SIZE);
    const spin = new THREE.Group();
    g.add(spin);
    makeMeshes(w.voxels, { x: 1.5, y: 0, z: 0 }, materials, spin);
    root.add(g);
    wheelGroups.push({ group: g, spin, side: w.side });
  }

  // animated parts (parents are always listed before their children)
  const groups = new Map();
  const defs = new Map();
  const rig = [];
  for (const p of data.parts) {
    const g = new THREE.Group();
    const parentDef = p.parent ? defs.get(p.parent) : null;
    const origin = parentDef ? parentDef.pivot : centre;
    g.position.set((p.pivot.x - origin.x) * VOXEL_SIZE, (p.pivot.y - origin.y) * VOXEL_SIZE, (p.pivot.z - origin.z) * VOXEL_SIZE);
    makeMeshes(p.voxels, p.pivot, materials, g);
    (p.parent ? groups.get(p.parent) : body).add(g);
    groups.set(p.id, g);
    defs.set(p.id, p);
    rig.push({ id: p.id, group: g, anim: p.anim, phase: 0, base: g.position.clone() });
  }

  const emitters = data.emitters.map((e) => ({
    local: new THREE.Vector3((e.x - centre.x) * VOXEL_SIZE, (e.y - centre.y) * VOXEL_SIZE, (e.z - centre.z) * VOXEL_SIZE),
    dir: { x: e.dx, y: e.dy, z: e.dz },
    kind: e.kind, tint: e.tint, carry: 0,
  }));

  root.userData = {
    truckId: truck.id, materials, body, wheels: wheelGroups, rig, emitters,
    size: data.size, height: data.size.y * VOXEL_SIZE, length: data.size.z * VOXEL_SIZE,
    voxelCount: data.voxels.length
      + data.parts.reduce((n, p) => n + p.voxels.length, 0)
      + data.wheels.reduce((n, w) => n + w.voxels.length, 0),
  };
  return root;
}

// Advance part animations. rev is 0..1 engine revs; time is seconds (for idle shake).
export function animateTruck(root, dt, rev, time, wheelRate) {
  const u = root.userData;
  for (const w of u.wheels) w.spin.rotation.x += dt * (wheelRate ?? (1 + rev * 9));
  for (const r of u.rig) {
    r.phase = advancePhase(r.phase, dt, r.anim.speed, rev);
    const v = animValue(r.anim, r.phase);
    if (r.anim.type === 'bob') r.group.position[r.anim.axis] = r.base[r.anim.axis] + v * VOXEL_SIZE;
    else r.group.rotation[r.anim.axis] = v;
  }
  // engine shake + gentle suspension sway
  u.body.position.y = Math.sin(time * 41) * 0.006 * (0.25 + rev) + Math.sin(time * 2.6) * 0.004;
}

export function repaintTruck(root, paint) {
  const mats = root.userData.materials;
  for (const key of ['body', 'accent', 'rim']) {
    if (paint[key]) mats[key].color.set(paint[key]);
  }
}

export function disposeTruck(root) {
  root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  for (const m of Object.values(root.userData.materials)) m.dispose();
}
