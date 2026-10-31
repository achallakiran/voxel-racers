// Backdrops for the menus.
//   outdoor: "stadium at sunset" - used by the title screen
//   garage : workshop with a spotlit turntable - used by the truck picker
// Everything is built from boxes (instanced where there are many) to match the voxel look.

import * as THREE from '../../lib/three.module.js';
import {
  SANDBOX, OBSTACLES, terrainColumns, wallRing,
} from './arena-layout.js';
import {
  ARENA, CROWD_COLORS, SKIN_COLORS, tireWallLayout, standsLayout, towersLayout,
  mesasLayout, cloudsLayout, dustLayout, rampLayout, carPileLayout,
} from './layout.js';

const matCache = new Map();
function lambert(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
  return matCache.get(key);
}
function basic(color, extra) {
  const key = 'b' + color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color, ...(extra || {}) }));
  return matCache.get(key);
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);

function box(parent, w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(UNIT, opts.basic ? basic(color, opts.mat) : lambert(color, opts.mat));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  parent.add(m);
  return m;
}

// One InstancedMesh from a list of {x,y,z,sx,sy,sz,rot,color}.
function instanced(parent, list, material, opts = {}) {
  const mesh = new THREE.InstancedMesh(UNIT, material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  list.forEach((it, i) => {
    e.set(0, it.rot || 0, 0);
    q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    s.set(it.sx, it.sy, it.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.color) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.cast ?? false;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function pixelTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dirtTexture(repeat) {
  return pixelTexture(16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const base = ((x >> 2) + (y >> 2)) & 1 ? [214, 160, 96] : [204, 150, 88];
      const n = ((x * 7 + y * 13) % 5) * 3;
      g.fillStyle = `rgb(${base[0] + n},${base[1] + n},${base[2] + n})`;
      g.fillRect(x, y, 1, 1);
    }
  }, repeat);
}

// ------------------------------------------------------------------ outdoor
function buildSky() {
  const geo = new THREE.SphereGeometry(150, 24, 16);
  const stops = [
    [-1, '#ffb35a'], [0.0, '#ffb35a'], [0.07, '#ff8a4c'], [0.2, '#e25a6a'], [0.45, '#7a4c9c'], [1, '#1c2a5e'],
  ].map(([t, c]) => [t, new THREE.Color(c)]);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 150;
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    col.copy(c0).lerp(c1, Math.min(1, Math.max(0, (y - t0) / (t1 - t0))));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2;
  return sky;
}

function buildSun() {
  const g = new THREE.Group();
  const cubes = [];
  for (let x = -9; x <= 9; x++) for (let y = -9; y <= 9; y++) {
    const d = Math.hypot(x, y);
    if (d > 8.6) continue;
    cubes.push({ x: x * 1.4, y: y * 1.4, z: 0, sx: 1.4, sy: 1.4, sz: 1.4, color: d < 5.4 ? '#fff3b8' : (d < 7.2 ? '#ffcf6a' : '#ff9d4a') });
  }
  const mat = new THREE.MeshBasicMaterial({ fog: false });
  const sun = instanced(g, cubes, mat, { receive: false });
  sun.renderOrder = -1;
  g.position.set(-22, 16, -135);
  return g;
}

function buildArena(group) {
  // ground (big, dirt) with a darker ring where the stands start
  const groundMat = new THREE.MeshLambertMaterial({ map: dirtTexture([80, 80]), color: '#ffd9b3' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.backdrop = true;
  group.add(ground);

  // tire wall
  const tiles = tireWallLayout();
  const colorOf = ['#1c1c20', '#e9e9e9', '#d62828'];
  instanced(group, tiles.map((t) => ({ x: t.x, y: t.y, z: t.z, sx: 0.46, sy: 0.19, sz: 0.46, rot: t.rot, color: colorOf[t.c] })),
    new THREE.MeshLambertMaterial(), { cast: true });

  // stands + crowd
  const { stands, people } = standsLayout();
  instanced(group, stands.map((s) => ({ x: s.x, y: s.y, z: s.z, sx: 0.6, sy: s.h, sz: 0.62, rot: s.rot, color: '#8d8d95' })),
    new THREE.MeshLambertMaterial());
  instanced(group, people.map((p) => ({ x: p.x, y: p.y, z: p.z, sx: 0.26, sy: 0.3, sz: 0.2, rot: p.rot, color: CROWD_COLORS[p.shirt] })),
    new THREE.MeshLambertMaterial());
  instanced(group, people.map((p) => ({ x: p.x, y: p.y + 0.24, z: p.z, sx: 0.17, sy: 0.17, sz: 0.17, rot: p.rot, color: SKIN_COLORS[p.skin] })),
    new THREE.MeshLambertMaterial());
  const cheering = people.filter((p) => p.arms);
  const arms = instanced(group, cheering.map((p) => ({ x: p.x, y: p.y + 0.42, z: p.z, sx: 0.08, sy: 0.3, sz: 0.08, rot: p.rot, color: SKIN_COLORS[p.skin] })),
    new THREE.MeshLambertMaterial());

  // floodlight towers
  const towerPos = towersLayout();
  for (const t of towerPos) {
    box(group, 0.28, t.h, 0.28, '#4a4a52', t.x, t.h / 2, t.z);
    box(group, 1.8, 0.9, 0.3, '#2d2d33', t.x, t.h + 0.2, t.z);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      box(group, 0.5, 0.34, 0.12, '#fff3b8', t.x - 0.6 + i * 0.6, t.h + 0.02 + j * 0.4, t.z + 0.2, { basic: true, mat: { fog: false }, cast: false });
    }
  }

  // jump ramp + dirt mound
  const ramp = rampLayout();
  const rg = new THREE.Group();
  rg.position.set(ramp.at.x, 0, ramp.at.z);
  rg.rotation.y = ramp.at.rot;
  for (const s of ramp.steps) box(rg, s.w, s.h, s.d, '#b5651d', 0, s.h / 2, s.z, { receive: true });
  box(rg, ramp.mound.w, ramp.mound.h * 1.0, ramp.mound.d, '#a8571a', 0, ramp.mound.h / 2 + 0.4, ramp.mound.z);
  box(rg, 2.7, 0.06, 0.08, '#ffd60a', 0, ramp.steps[ramp.steps.length - 1].h + 0.03, ramp.steps[ramp.steps.length - 1].z + 0.1, { cast: false });
  group.add(rg);

  // crushed cars
  for (const c of carPileLayout()) {
    const g = new THREE.Group();
    g.position.set(c.x, c.y, c.z);
    g.rotation.y = c.rot;
    box(g, c.body.w, c.body.h, c.body.d, c.c, 0, 0, 0);
    box(g, c.cabin.w, c.cabin.h, c.cabin.d, '#2b2d42', c.cabin.dx, c.body.h / 2 + c.cabin.h / 2, 0);
    box(g, 0.24, 0.14, c.body.d + 0.06, '#222', c.body.w / 2 - 0.2, -0.12, 0);
    box(g, 0.24, 0.14, c.body.d + 0.06, '#222', -c.body.w / 2 + 0.2, -0.12, 0);
    group.add(g);
  }

  // distant mesas (stepped)
  const mesaMat = new THREE.MeshLambertMaterial({ color: '#c0603a' });
  for (const m of mesasLayout()) {
    for (let i = 0; i < m.steps; i++) {
      const k = 1 - i * 0.22;
      const h = (m.h / m.steps) * (i + 1);
      const mesh = new THREE.Mesh(UNIT, mesaMat);
      mesh.scale.set(m.w * k, h, m.d * k);
      mesh.position.set(m.x, h / 2, m.z);
      mesh.userData.backdrop = true;
      group.add(mesh);
    }
  }

  // clouds
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffd9e0', fog: false });
  for (const c of cloudsLayout()) {
    const cg = new THREE.Group();
    cg.position.set(c.x, c.y, c.z);
    for (const q of c.cubes) {
      const m = new THREE.Mesh(UNIT, cloudMat);
      m.scale.set(q.s, q.s * 0.6, q.s);
      m.position.set(q.x, q.y, q.z);
      cg.add(m);
    }
    clouds.add(cg);
  }
  clouds.userData.backdrop = true;
  group.add(clouds);

  // dust motes
  const motes = dustLayout();
  const dust = instanced(group, motes.map((d) => ({ x: d.x, y: d.y, z: d.z, sx: d.s, sy: d.s, sz: d.s, color: '#ffe9c4' })),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }), { receive: false });
  const dm = new THREE.Matrix4();

  // desert scatter just outside the arena fence line is hidden by the stands; keep a few rocks/cacti inside
  const scatter = scatterRocks(group);

  return {
    groundMat, clouds, dust, motes, dm, arms, tires: tiles.length, people: people.length, stands: stands.length, towers: towerPos.length, scatter,
  };
}

function scatterRocks(group) {
  const rocks = [];
  const cacti = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 4.8 + rnd() * 4;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (z > 3.5) continue; // keep the foreground (camera side) clear
    if (rnd() < 0.55) {
      const w = 3 + Math.floor(rnd() * 3);
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < w; dz++) {
        const h = Math.max(1, Math.round(w - Math.abs(dx - w / 2) - Math.abs(dz - w / 2)));
        for (let dy = 0; dy < h; dy++) rocks.push({ x: x + dx * 0.1, y: 0.05 + dy * 0.1, z: z + dz * 0.1, sx: 0.1, sy: 0.1, sz: 0.1 });
      }
    } else {
      const h = 8 + Math.floor(rnd() * 8);
      for (let dy = 0; dy < h; dy++) cacti.push({ x, y: 0.05 + dy * 0.1, z, sx: 0.1, sy: 0.1, sz: 0.1 });
      const ay = 0.05 + (3 + Math.floor(rnd() * 3)) * 0.1;
      for (let k = 1; k <= 3; k++) cacti.push({ x: x + k * 0.1, y: ay, z, sx: 0.1, sy: 0.1, sz: 0.1 });
      for (let k = 0; k < 3; k++) cacti.push({ x: x + 0.3, y: ay + (k + 1) * 0.1, z, sx: 0.1, sy: 0.1, sz: 0.1 });
    }
  }
  instanced(group, rocks, new THREE.MeshLambertMaterial({ color: '#b5651d' }), { cast: true });
  instanced(group, cacti, new THREE.MeshLambertMaterial({ color: '#3a9d4a' }), { cast: true });
  return { rocks: rocks.length, cacti: cacti.length };
}

// ------------------------------------------------------------------ garage
function brickTexture(repeat) {
  return pixelTexture(32, (g, s) => {
    g.fillStyle = '#2a1a16';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 3; col++) {
        const shade = ((row * 3 + col * 5) % 4) * 6;
        g.fillStyle = `rgb(${120 + shade},${62 + shade / 2},${48 + shade / 2})`;
        g.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
      }
    }
  }, repeat);
}

function tileTexture(repeat) {
  return pixelTexture(16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dark = ((x >> 3) + (y >> 3)) & 1;
      const n = ((x * 5 + y * 11) % 4) * 3;
      const v = dark ? 52 + n : 66 + n;
      g.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(8, 0, 1, 16);
  }, repeat);
}

function buildGarage(group) {
  const W = 26;
  const D = 22;
  const wallZ = -9;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tileTexture([W / 1.6, D / 1.6]) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1);
  floor.receiveShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 7.5), new THREE.MeshLambertMaterial({ map: brickTexture([W / 2.4, 3.4]) }));
  back.position.set(0, 3.75, wallZ);
  back.receiveShadow = true;
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, 7.5), new THREE.MeshLambertMaterial({ map: brickTexture([D / 2.4, 3.4]) }));
    side.rotation.y = -sx * Math.PI / 2;
    side.position.set(sx * (W / 2), 3.75, 1);
    side.receiveShadow = true;
    group.add(side);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: '#15151c' }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 7.5, 1);
  group.add(ceil);
  for (let i = -2; i <= 2; i++) box(group, 0.4, 0.5, D, '#22222c', i * 5, 7.2, 1, { cast: false });

  // roller door, rolled up part-way to show the sunset outside
  box(group, 7.6, 5.2, 0.1, '#c9602f', 0, 2.8, wallZ + 0.04, { basic: true, mat: { fog: false }, cast: false, receive: false });
  box(group, 7.6, 0.2, 0.3, '#2d2d33', 0, 5.5, wallZ + 0.2);
  box(group, 0.3, 5.4, 0.3, '#2d2d33', -3.95, 2.7, wallZ + 0.2);
  box(group, 0.3, 5.4, 0.3, '#2d2d33', 3.95, 2.7, wallZ + 0.2);
  for (let i = 0; i < 4; i++) box(group, 7.4, 0.3, 0.12, i % 2 ? '#8e8e99' : '#a5a5b0', 0, 5.2 - i * 0.32, wallZ + 0.3);
  // sun disc outside
  box(group, 1.4, 1.4, 0.05, '#ffd27a', -2.4, 1.0, wallZ + 0.07, { basic: true, mat: { fog: false }, cast: false, receive: false });
  // hazard stripe along the bottom of the back wall
  for (let i = 0; i < 26; i++) box(group, 1, 0.3, 0.1, i % 2 ? '#ffd60a' : '#1d1d22', -12.5 + i + 0.5, 0.15, wallZ + 0.08, { cast: false });

  // left: shelving with crates, tires, paint cans
  const sx = -10.9;
  for (let l = 0; l < 3; l++) box(group, 1.5, 0.12, 6, '#555560', sx, 0.9 + l * 1.3, -4.5);
  for (const z of [-7.4, -1.6]) box(group, 0.14, 4.2, 0.14, '#555560', sx + 0.65, 2.1, z);
  const crate = ['#c9852a', '#2a9d8f', '#e63946', '#4cc9f0'];
  for (let l = 0; l < 3; l++) for (let i = 0; i < 4; i++) {
    box(group, 0.9, 0.7, 1.0, crate[(l + i) % 4], sx, 1.31 + l * 1.3, -7 + i * 1.3 + (l % 2) * 0.2);
  }
  for (let i = 0; i < 4; i++) {
    box(group, 1.3, 0.28, 1.3, '#1c1c20', -9.2, 0.14 + i * 0.28, 0.2);
    box(group, 0.7, 0.3, 0.7, '#8e8e99', -9.2, 0.14 + i * 0.28, 0.2, { cast: false });
  }

  // right: workbench with tools, tool chest, oil drums
  box(group, 1.6, 0.14, 5, '#7a5230', 10.4, 1.15, -4.5);
  for (const z of [-6.8, -2.2]) box(group, 1.4, 1.1, 0.16, '#4a4a52', 10.4, 0.55, z);
  box(group, 1.2, 1.0, 1.6, '#d62828', 10.2, 0.5, -0.4);
  box(group, 1.22, 0.1, 1.62, '#9a1c1c', 10.2, 1.05, -0.4);
  box(group, 1.2, 0.5, 1.6, '#e63946', 10.2, 1.4, -0.4);
  for (let i = 0; i < 6; i++) box(group, 0.2, 0.2, 0.7, ['#ffd60a', '#4cc9f0', '#80ed99', '#ff9f1c', '#e63946', '#b185db'][i], 10.4, 1.32, -6.5 + i * 0.75, { cast: false });
  box(group, 0.7, 0.9, 0.7, '#3a86ff', 9.0, 0.45, -8.2);
  box(group, 0.7, 0.9, 0.7, '#ff7b00', 9.9, 0.45, -8.4);
  box(group, 0.7, 0.9, 0.7, '#3a86ff', 9.3, 0.45, 1.6);

  // hanging lamps with soft beams
  const lampX = [-6, 0, 6];
  for (const x of lampX) {
    box(group, 0.06, 1.4, 0.06, '#333', x, 6.7, -1);
    box(group, 1.1, 0.35, 1.1, '#2d2d33', x, 5.95, -1);
    box(group, 0.7, 0.12, 0.7, '#fff0c8', x, 5.74, -1, { basic: true, mat: { fog: false }, cast: false });
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe6b0', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const x of lampX) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 2.4, 5.6, 6, 1, true), beamMat);
    beam.position.set(x, 2.9, -1);
    group.add(beam);
  }

  // turntable platform (rotates with the truck): disc with hazard-stripe rim
  const platform = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.1, 16), lambert('#3a3a45'));
  disc.position.y = 0.05;
  disc.receiveShadow = true;
  platform.add(disc);
  const segs = 32;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    box(platform, 0.62, 0.12, 0.2, i % 2 ? '#ffd60a' : '#1d1d22', Math.cos(a) * 3.18, 0.06, Math.sin(a) * 3.18, { rotY: -a + Math.PI / 2, cast: false });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(platform, 1.4, 0.115, 0.1, '#5b5b6a', Math.cos(a) * 1.6, 0.055, Math.sin(a) * 1.6, { rotY: -a, cast: false });
  }
  group.add(platform);

  return { platform, lamps: lampX.length };
}


// ------------------------------------------------------------------ sandbox (drive mode)
const TERRAIN_COLORS = { ramp: '#e2b04a', table: '#e2b04a', hill: '#9c7048', whoops: '#8a5530' };

function buildSandbox(group) {
  // dirt columns (one stretched box per cell, so ramps read as voxel stairs)
  const cols = terrainColumns(0.5);
  const list = cols.map((c) => {
    const col = new THREE.Color(TERRAIN_COLORS[c.kind] || '#b98550');
    col.multiplyScalar(c.shade ? 1 : 0.93);
    return { x: c.x, y: c.h / 2, z: c.z, sx: c.step, sy: c.h, sz: c.step, color: col };
  });
  instanced(group, list, new THREE.MeshLambertMaterial(), { cast: true, receive: true });

  // yellow lip markers on the kicker edges
  const lips = [];
  for (const c of cols) if (c.kind === 'ramp' && c.h > 1.2) lips.push(c);

  // tire wall ring (3 high)
  const colorOf = ['#1c1c20', '#e9e9e9', '#d62828'];
  const ring = wallRing();
  const tires = [];
  for (const r of ring) for (let h = 0; h < 3; h++) tires.push({ x: r.x, y: 0.2 + h * 0.4, z: r.z, sx: 0.95, sy: 0.38, sz: 0.95, rot: r.rot, color: colorOf[r.c] });
  instanced(group, tires, new THREE.MeshLambertMaterial(), { cast: false });

  // boulders (voxel half-spheres) and tire stacks
  const rocks = [];
  const stackTires = [];
  for (const o of OBSTACLES) {
    if (o.type === 'boulder') {
      const cell = 0.42;
      const n = Math.ceil(o.r / cell);
      for (let i = -n; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = -n; k <= n; k++) {
        if (i * i + j * j * 1.4 + k * k > (o.r / cell) ** 2) continue;
        const shade = 0.82 + ((i * 7 + j * 13 + k * 5) & 7) * 0.025;
        rocks.push({ x: o.x + i * cell, y: cell / 2 + j * cell, z: o.z + k * cell, sx: cell, sy: cell, sz: cell, color: new THREE.Color('#9a6a42').multiplyScalar(shade) });
      }
    } else {
      for (let h = 0; h < 3; h++) stackTires.push({ x: o.x, y: 0.15 + h * 0.3, z: o.z, sx: 1.4, sy: 0.28, sz: 1.4, rot: h * 0.5, color: h === 1 ? '#e9e9e9' : '#1c1c20' });
    }
  }
  instanced(group, rocks, new THREE.MeshLambertMaterial(), { cast: true });
  instanced(group, stackTires, new THREE.MeshLambertMaterial(), { cast: true });

  // start pad marker (checker strip)
  const pad = [];
  for (let i = -3; i <= 3; i++) for (let j = 0; j < 2; j++) pad.push({ x: SANDBOX.start.x + i * 0.7 * Math.SQRT1_2 - j * 0.7 * Math.SQRT1_2, y: 0.02, z: SANDBOX.start.z - i * 0.7 * Math.SQRT1_2 - j * 0.7 * Math.SQRT1_2, sx: 0.7, sy: 0.04, sz: 0.7, rot: Math.PI / 4, color: (i + j) & 1 ? '#f4f1ea' : '#1d1d22' });
  instanced(group, pad, new THREE.MeshLambertMaterial(), { receive: true });
  return { columns: cols.length, lips: lips.length, wall: tires.length, rocks: rocks.length };
}

// ------------------------------------------------------------------ world
export function createWorld(scene, lights) {
  const outdoor = new THREE.Group();
  const garage = new THREE.Group();
  scene.add(outdoor, garage);

  const sky = buildSky();
  sky.userData.backdrop = true;
  outdoor.add(sky);
  const sunMesh = buildSun();
  sunMesh.userData.backdrop = true;
  outdoor.add(sunMesh);
  const arena = buildArena(outdoor);
  const groundMat = arena.groundMat;
  const gar = buildGarage(garage);
  const sandbox = new THREE.Group();
  sandbox.visible = false;
  scene.add(sandbox);
  const sbStats = buildSandbox(sandbox);

  const { hemi, sun, spot } = lights;
  const fogOut = new THREE.Fog('#f4a96b', 26, 110);
  const fogGar = new THREE.Fog('#16161e', 14, 40);
  let mode = 'outdoor';

  function setMode(next) {
    mode = next === 'garage' || next === 'drive' ? next : 'outdoor';
    const g = mode === 'garage';
    const d = mode === 'drive';
    outdoor.visible = !g;
    // driving keeps the sky, sun, mesas, clouds and ground, but not the stadium props
    for (const child of outdoor.children) child.visible = !d || !!child.userData.backdrop;
    sandbox.visible = d;
    groundMat.color.set(d ? '#cfa57e' : '#ffd9b3');
    garage.visible = g;
    scene.background = new THREE.Color(g ? '#16161e' : '#ffb35a');
    scene.fog = g ? fogGar : fogOut;
    if (g) {
      hemi.color.set('#8fa0ff'); hemi.groundColor.set('#2a2230'); hemi.intensity = 0.9;
      sun.color.set('#ffe9c8'); sun.intensity = 1.5; sun.position.set(4, 9, 6);
      spot.visible = true;
    } else {
      hemi.color.set('#ffd2a0'); hemi.groundColor.set('#8a4b2a'); hemi.intensity = 1.35;
      sun.color.set('#ffb877'); sun.intensity = 2.5; sun.position.set(8, 6, 5);
      spot.visible = false;
    }
  }
  setMode('outdoor');

  const m = new THREE.Matrix4();
  function update(dt, t, spin) {
    if (mode !== 'garage') {
      arena.clouds.position.x = ((t * 0.6 + 70) % 140) - 70;
      // dust drifts on the wind and wraps (title only)
      if (mode === 'outdoor') for (let i = 0; i < arena.motes.length; i++) {
        const d = arena.motes[i];
        d.x += d.v * dt;
        if (d.x > 8) d.x = -8;
        const y = d.y + Math.sin(t * 0.8 + i) * 0.12;
        m.makeScale(d.s, d.s, d.s);
        m.setPosition(d.x, y, d.z);
        arena.dust.setMatrixAt(i, m);
      }
      if (mode === 'outdoor') arena.dust.instanceMatrix.needsUpdate = true;
    } else {
      gar.platform.rotation.y = spin;
    }
  }

  return {
    setMode,
    update,
    get mode() { return mode; },
    stats: {
      tires: arena.tires, crowd: arena.people, stands: arena.stands, towers: arena.towers,
      rocks: arena.scatter.rocks, cacti: arena.scatter.cacti, lamps: gar.lamps, sandbox: sbStats,
    },
  };
}

export { ARENA };
