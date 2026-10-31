// Turns the pure voxel data into three.js meshes.
// One InstancedMesh per palette key keeps draw calls low and makes repainting cheap
// (change the material colour; per-voxel shading jitter lives in instance colours).

import * as THREE from '../../lib/three.module.js';
import { buildTruckVoxels, PALETTE_KEYS } from './voxel-model.js';

export const VOXEL_SIZE = 0.1;

const FIXED = {
  tire: '#1b1b1f', tread: '#3d3d46', dark: '#26262b', glass: '#7fd8ff',
  light: '#fff6b0', chrome: '#d9dee3', flame: '#ff3b30',
};

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

function makeMeshes(voxels, offset, geometry, materials, parent) {
  const byKey = new Map();
  for (const v of voxels) {
    if (!byKey.has(v.k)) byKey.set(v.k, []);
    byKey.get(v.k).push(v);
  }
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const [key, list] of byKey) {
    const mesh = new THREE.InstancedMesh(geometry, materials[key], list.length);
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

  const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
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
  makeMeshes(data.voxels, centre, geometry, materials, body);

  const wheelGroups = [];
  for (const w of data.wheels) {
    const g = new THREE.Group();
    g.position.set((w.cx + 1.5 - centre.x) * VOXEL_SIZE, (w.cy - centre.y) * VOXEL_SIZE, (w.cz - centre.z) * VOXEL_SIZE);
    const spin = new THREE.Group();
    g.add(spin);
    makeMeshes(w.voxels, { x: 1.5, y: 0, z: 0 }, geometry, materials, spin);
    root.add(g);
    wheelGroups.push({ group: g, spin, side: w.side, front: w.cz > data.size.z / 2 });
  }

  root.userData = {
    truckId: truck.id, materials, wheels: wheelGroups, size: data.size,
    voxelCount: data.voxels.length + data.wheels.reduce((n, w) => n + w.voxels.length, 0),
  };
  return root;
}

export function repaintTruck(root, paint) {
  const mats = root.userData.materials;
  for (const key of ['body', 'accent', 'rim']) {
    if (paint[key]) mats[key].color.set(paint[key]);
  }
}
