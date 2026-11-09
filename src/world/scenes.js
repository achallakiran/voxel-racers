// Backdrops for the menus.
//   outdoor: "stadium at sunset" - used by the title screen
//   garage : workshop with a spotlit turntable - used by the truck picker
// Everything is built from boxes (instanced where there are many) to match the voxel look.

import * as THREE from '../../lib/three.module.js';
import {
  SANDBOX, OBSTACLES, terrainColumns, wallRing, heightAt as ARENA_H,
} from './arena-layout.js';
import { loopWorld } from '../physics/loop.js';
import { buildColumns, hash2 } from './terrain-mesh.js';
import { createHazardView } from './hazard-view.js';
import { gripHands } from './grip-hands.js';
import { GRIP_P, H as GRIP_H, SPAN as GRIP_SPAN } from './giants-grip.js';
import { PLANET_U, MOON_SUN, MOON_EARTH } from './planet.js';
import { skullCave } from './structures.js';
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
    e.set(it.rx || 0, it.ry ?? it.rot ?? 0, 0, 'YXZ');
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
const SUNSET = [[-1, '#ffb35a'], [0.0, '#ffb35a'], [0.07, '#ff8a4c'], [0.2, '#e25a6a'], [0.45, '#7a4c9c'], [1, '#1c2a5e']];
const DAY = [[-1, '#d9eefb'], [0.0, '#d9eefb'], [0.08, '#bfe3fb'], [0.3, '#7dbcf0'], [0.65, '#4a95e0'], [1, '#2b69c8']];

function buildSky(stopsDef = SUNSET) {
  const geo = new THREE.SphereGeometry(150, 24, 16);
  const stops = stopsDef.map(([t, c]) => [t, new THREE.Color(c)]);
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

// default stage look (Greenridge): sky stops, fog [colour, near, far], hemisphere [sky, ground, intensity], sun [colour, intensity, x, y, z]
export const LOOK_DEFAULT = { sky: 'day', fog: ['#cfe6f5', 40, 170], hemi: ['#e3f0ff', '#6a8f4e', 1.25], sun: ['#fff2d8', 2.4, 8, 12, 5] };
const ALPINE = [[-1, '#e9f1fa'], [0.0, '#e9f1fa'], [0.1, '#cfdcec'], [0.35, '#9db6d4'], [0.7, '#6e8fb8'], [1, '#4a6c9a']];
const GOLDEN = [[-1, '#ffd9a0'], [0.0, '#ffd9a0'], [0.08, '#ffb870'], [0.28, '#f08a5a'], [0.6, '#b8607a'], [1, '#5a3c6e']];
const STORM = [[-1, '#8f98a6'], [0.0, '#8f98a6'], [0.12, '#7a8494'], [0.4, '#5c6678'], [0.75, '#434b5c'], [1, '#2c3242']];
const VOLCANO = [[-1, '#ff7a30'], [0.0, '#ff7a30'], [0.1, '#d6401c'], [0.35, '#7a1f18'], [0.7, '#3a1114'], [1, '#1a0809']];
const CAVE = [[-1, '#1c2230'], [0.0, '#1c2230'], [0.5, '#10141e'], [1, '#080a10']];
const SPACE = [[-1, '#07091a'], [0.0, '#07091a'], [0.25, '#03040d'], [1, '#010208']];
const SKY_STOPS = { space: SPACE, day: DAY, alpine: ALPINE, golden: GOLDEN, storm: STORM, volcano: VOLCANO, cave: CAVE };

// weather particles: a box of specks that follows the truck and wraps, so it is cheap and always around the camera
const WEATHER = {
  snow: { color: '#ffffff', size: 0.16, fall: [3, 6], drift: 1.2, count: 380 },
  rain: { color: '#a9c4e8', size: 0.07, fall: [26, 34], drift: 0.6, count: 420, tall: 0.9 },
  dust: { color: '#e8c48a', size: 0.14, fall: [-0.3, 0.6], drift: 6, count: 320 },
  embers: { color: '#ff9a3c', size: 0.13, fall: [-4, -1.5], drift: 0.8, count: 320, glow: true },
  ash: { color: '#8a8a92', size: 0.13, fall: [0.8, 2], drift: 1.5, count: 300 },
  spores: { color: '#7dffb0', size: 0.12, fall: [-0.8, -0.2], drift: 0.8, count: 260 },
  stars: { color: '#ffffff', size: 0.09, fall: [0, 0.2], drift: 0.2, count: 260 },
};
function buildWeather(parent) {
  const MAXN = 440; const BOX = 46; const H = 26;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAXN);
  mesh.frustumCulled = false;
  const fl = [];
  for (let i = 0; i < MAXN; i++) fl.push({ x: (hash2(i, 1) - 0.5) * BOX, y: hash2(i, 2) * H, z: (hash2(i, 3) - 0.5) * BOX, r: hash2(i, 4), ph: hash2(i, 5) * 6 });
  mesh.visible = false;
  parent.add(mesh);
  const mm = new THREE.Matrix4();
  let kind = WEATHER.snow;
  return {
    mesh, flakes: fl, BOX, H,
    set(name) {
      kind = WEATHER[name] || null;
      mesh.visible = !!kind;
      if (kind) { mat.color.set(kind.color); mesh.count = kind.count; }
    },
    update(dt, t, cx, cy, cz, wind) {
      if (!kind) return;
      const sx = kind.size; const sy = kind.size * (kind.tall ? 9 : 1);
      for (let i = 0; i < kind.count; i++) {
        const f = fl[i];
        const v = kind.fall[0] + (kind.fall[1] - kind.fall[0]) * f.r;
        f.y -= v * dt; f.x += ((wind ? wind.x : 0) * kind.drift + Math.sin(t + f.ph) * 0.6) * dt;
        if (f.y < 0) f.y += H; else if (f.y > H) f.y -= H;
        if (f.x > BOX / 2) f.x -= BOX; else if (f.x < -BOX / 2) f.x += BOX;
        mm.makeScale(sx, sy, sx);
        mm.setPosition(cx + f.x, cy - 4 + f.y, cz + f.z);
        mesh.setMatrixAt(i, mm);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// the night sky of the Moon stage: coloured stars, a Milky Way band, and the Earth hanging in it (all follow the truck, so they stay at infinity)
function buildSpace() {
  const g = new THREE.Group();
  const R = 120;
  const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const pts = []; const cols = [];
  const tint = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.8], [1, 0.8, 0.75], [0.75, 0.82, 1]];
  const dir = (u, v) => { const y = u * 2 - 1; const r = Math.sqrt(1 - y * y); const a = v * Math.PI * 2; return [r * Math.cos(a), y, r * Math.sin(a)]; };
  for (let i = 0; i < 2600; i++) {                       // the field of stars (the whole sphere: on a little planet the sky turns as you go round)
    const [x, y, z] = dir(rnd(), rnd());
    const t = tint[Math.floor(rnd() * tint.length)]; const b = 0.35 + rnd() * 0.65;
    pts.push(x * R, y * R, z * R); cols.push(t[0] * b, t[1] * b, t[2] * b);
  }
  // Milky Way: a dense, glowing band along an inclined great circle, brightest at its core
  const tilt = 0.9; const ct = Math.cos(tilt); const st = Math.sin(tilt);
  for (let i = 0; i < 4200; i++) {
    const a = rnd() * Math.PI * 2;
    const w = (rnd() + rnd() + rnd() - 1.5) * 0.28;           // soft spread across the band
    let x = Math.cos(a) * Math.cos(w); let y = Math.sin(w); let z = Math.sin(a) * Math.cos(w);
    const y2 = y * ct - z * st; const z2 = y * st + z * ct; y = y2; z = z2;
    const core = Math.exp(-((w / 0.12) ** 2));
    const warm = 0.5 + 0.5 * Math.sin(a * 3 + 1);
    const b = (0.12 + 0.55 * core) * (0.5 + rnd() * 0.7);
    pts.push(x * R, y * R, z * R); cols.push(b * (0.7 + 0.5 * warm), b * 0.8, b * (1.15 - 0.4 * warm));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true }));
  stars.renderOrder = -1; stars.frustumCulled = false;
  g.add(stars);
  // the Earth: a chunky voxel-feel globe with oceans, land, cloud swirls and a night side
  const eg = new THREE.SphereGeometry(15, 28, 18);
  const pos = eg.attributes.position; const ec = new Float32Array(pos.count * 3);
  const sunDir = new THREE.Vector3(-0.35, 0.25, -0.9).normalize();
  const n3 = (x, y, z) => { const v = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / 15; const ny = pos.getY(i) / 15; const nz = pos.getZ(i) / 15;
    const q = (k) => Math.round(k * 5) / 5;
    const land = Math.sin(q(nx) * 5.1 + 1) * Math.cos(q(ny) * 4.3 + q(nz) * 3) + 0.6 * Math.sin(q(nz) * 7 + q(nx) * 2);
    let c = land > 0.55 ? [0.2 + 0.25 * n3(q(nx), q(ny), q(nz)), 0.5, 0.2] : [0.08, 0.26, 0.62];
    if (Math.abs(ny) > 0.86) c = [0.92, 0.95, 1];                                  // ice caps
    const cl = Math.sin(q(nx) * 9 + q(ny) * 3) * Math.sin(q(nz) * 8 - q(ny) * 5);
    if (cl > 0.45) c = [0.96, 0.97, 1];                                           // clouds
    const light = Math.max(0.12, Math.min(1, 0.25 + 0.95 * (nx * -sunDir.x + ny * -sunDir.y + nz * -sunDir.z)));
    ec[i * 3] = c[0] * light; ec[i * 3 + 1] = c[1] * light; ec[i * 3 + 2] = c[2] * light;
  }
  eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
  const earth = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  // hangs over the right-hand end of the little Moon's lap and sets below the horizon on the other side of the planet
  earth.position.set(MOON_EARTH[0] * 100, MOON_EARTH[1] * 100, MOON_EARTH[2] * 100); earth.rotation.set(0.3, 1.0, 0.2);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(16.6, 24, 14), new THREE.MeshBasicMaterial({ color: '#5aa8ff', transparent: true, opacity: 0.22, side: THREE.BackSide, fog: false, depthWrite: false }));
  halo.position.copy(earth.position);
  g.add(earth, halo);
  g.userData.earth = earth; g.userData.earthSet = [earth, halo];
  // the Sun: a bright voxel disc with soft glow rings, facing the middle of the sky
  const sunG = new THREE.Group();
  const sunCubes = [];
  for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) {
    const d = Math.hypot(x, y); if (d > 5.1) continue;
    sunCubes.push({ x: x * 1.5, y: y * 1.5, z: 0, sx: 1.5, sy: 1.5, sz: 1.5, color: d < 3.2 ? '#fffbe8' : (d < 4.4 ? '#ffe9a8' : '#ffc860') });
  }
  instanced(sunG, sunCubes, new THREE.MeshBasicMaterial({ fog: false }), { receive: false });
  for (const [r, o] of [[13, 0.2], [19, 0.1], [28, 0.05]]) {
    const halo = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color: '#ffd890', transparent: true, opacity: o, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.position.z = -0.5; sunG.add(halo);
  }
  sunG.position.set(MOON_SUN[0] * 108, MOON_SUN[1] * 108, MOON_SUN[2] * 108);
  sunG.lookAt(0, 0, 0);
  g.add(sunG);
  g.userData.sunG = sunG;
  // meteors: thin additive streaks that cross the sky (a small pool, recycled)
  const mGeo = new THREE.BoxGeometry(0.4, 0.4, 1, 1, 1, 6);
  {
    const p = mGeo.attributes.position; const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 1 - (p.getZ(i) + 0.5); const b = Math.pow(1 - k, 2.2); c.set([1.0 * b, 0.82 * b, 0.55 * b], i * 3); }   // z = +0.5 is the head
    mGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const meteors = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, fog: false, depthWrite: false }));
    m.visible = false; m.frustumCulled = false; m.userData = { life: 0, max: 1, dir: new THREE.Vector3(), tan: new THREE.Vector3(), len: 14 };
    g.add(m); meteors.push(m);
  }
  g.userData.meteors = meteors;
  return g;
}

// a giant banded gas planet standing in the world (Saturn, in the middle of the ring road), lit by the stage's sun
function buildGasGiant(st) {
  const R = st.r;
  const sg = new THREE.SphereGeometry(R, 120, 80);
  const pos = sg.attributes.position; const col = new Float32Array(pos.count * 3);
  // a banded palette (cream, rust, tan, umber, gold) with wavy band edges, a few storm ovals and a dark polar hexagon, quantised
  // into blocky patches so it reads as voxel art from far away
  const pal = [[0.98, 0.93, 0.78], [0.76, 0.46, 0.25], [0.9, 0.72, 0.46], [0.99, 0.96, 0.86], [0.56, 0.34, 0.2], [0.92, 0.76, 0.42], [0.82, 0.58, 0.34], [0.97, 0.9, 0.7], [0.66, 0.4, 0.24], [0.94, 0.82, 0.58]];
  const NB = pal.length * 2;
  const storms = [[-0.28, 0.9, 0.28, 0.14, [0.7, 0.3, 0.16]], [0.34, -1.6, 0.2, 0.09, [1, 0.97, 0.9]], [0.1, 2.5, 0.16, 0.07, [0.62, 0.34, 0.2]], [-0.55, -0.3, 0.18, 0.08, [1, 0.95, 0.85]], [0.55, 1.4, 0.14, 0.06, [0.85, 0.5, 0.28]]];
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / R; const ny = pos.getY(i) / R; const nz = pos.getZ(i) / R;
    const lon = Math.atan2(nx, nz);
    const qLon = Math.round(lon * 22) / 22; const qLat = Math.round(ny * 36) / 36;     // blocky patches
    const wob = 0.045 * Math.sin(qLon * 5 + qLat * 9) + 0.025 * Math.sin(qLon * 13 - qLat * 21) + 0.012 * Math.sin(qLon * 31);
    const f = Math.max(0, Math.min(0.9999, (qLat + wob + 1) / 2));
    const bi = Math.floor(f * NB);
    let c = pal[(bi * 7) % pal.length].slice();                 // adjacent bands are different colours, not a smooth ramp
    if (bi % 3 === 0) { const t = 0.88 + 0.12 * Math.sin(qLon * 40 + bi); c = c.map((v) => v * t); }   // fine streaks inside some bands
    for (const [la, lo, rw, rh, sc] of storms) {              // storm ovals
      let dl = qLon - lo; if (dl > Math.PI) dl -= 2 * Math.PI; if (dl < -Math.PI) dl += 2 * Math.PI;
      const e = (dl / rw) ** 2 + ((qLat - la) / rh) ** 2;
      if (e < 1) c = e < 0.45 ? sc : c.map((v, k) => v * 0.5 + sc[k] * 0.5);
    }
    if (ny > 0.86) c = (Math.floor((qLon * 6) / Math.PI * 3 + 0.5) % 2 === 0) ? [0.4, 0.34, 0.5] : [0.52, 0.44, 0.6];   // polar hexagon, in violet
    if (ny < -0.88) c = [0.5, 0.36, 0.3];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const globe = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#4a3720' }));
  globe.position.set(st.x, st.y, st.z);
  globe.rotation.z = -0.3;
  globe.frustumCulled = false;
  globe.userData.noShadow = true;
  return globe;
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
      mesh.userData.mesa = true;
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
    ground, groundMat, cloudMat, clouds, dust, motes, dm, arms, tires: tiles.length, people: people.length, stands: stands.length, towers: towerPos.length, scatter,
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



// ------------------------------------------------------------------ Paint the Town arena
function buildPaintArena(group, map) {
  const tile = map.tile;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const geo = UNIT;
  const floor = new THREE.InstancedMesh(geo, mat, map.cells.length);
  const m4 = new THREE.Matrix4(); const col = new THREE.Color();
  map.cells.forEach((c, k) => { m4.compose(new THREE.Vector3(c.x, 0.1, c.z), new THREE.Quaternion(), new THREE.Vector3(tile * 0.95, 0.2, tile * 0.95)); floor.setMatrixAt(k, m4); floor.setColorAt(k, col.set('#40434c')); });
  floor.receiveShadow = true; floor.frustumCulled = false;
  group.add(floor);
  // a round kerb of red and white blocks just outside the playable disc, and a dark skirt under everything
  const kerb = [];
  const R = map.radius + 1.3; const nK = Math.round((2 * Math.PI * R) / 2.2);
  for (let i = 0; i < nK; i++) { const a = (i / nK) * Math.PI * 2; kerb.push({ x: Math.cos(a) * R, y: 0.7, z: Math.sin(a) * R, sx: 2.4, sy: 1.4, sz: 1.8, ry: -a + Math.PI / 2, color: i % 2 ? '#e63946' : '#f1f1f1' }); }
  instanced(group, kerb, new THREE.MeshLambertMaterial(), { cast: true });
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(map.radius + 2.6, map.radius + 2.6, 0.2, 48), new THREE.MeshLambertMaterial({ color: 0x23252b }));
  skirt.position.y = -0.02; group.add(skirt);
  // paint buckets (a spinning tin with a coloured lid): positions come from the rules
  const buckets = new THREE.InstancedMesh(UNIT, mat, 9 * 2);
  buckets.frustumCulled = false; buckets.castShadow = true;
  group.add(buckets);
  const API = {
    group,
    // restyle every tile: owners come from the map, colours from the player palette
    sync(m, palette, full) {
      const slots = full ? m.cells.map((_, k) => k) : Array.from(m.dirty);
      for (const k of slots) {
        const c = m.cells[k]; const o = m.owner[k];
        const shade = ((c.i + c.j) & 1) ? 1 : 0.93;
        if (o < 0) col.set('#40434c').multiplyScalar(shade); else col.set(palette[o]).multiplyScalar(shade);
        floor.setColorAt(k, col);
        const sealed = o >= 0 && m.sealUntil[k] > m.time;
        m4.compose(new THREE.Vector3(c.x, sealed ? 0.17 : 0.1, c.z), new THREE.Quaternion(), new THREE.Vector3(tile * 0.95, sealed ? 0.34 : 0.2, tile * 0.95));
        floor.setMatrixAt(k, m4);
      }
      if (slots.length) { floor.instanceColor.needsUpdate = true; floor.instanceMatrix.needsUpdate = true; }
    },
    // the buckets: [{x,z,back}] spin and bob; a taken one is hidden
    buckets(list, time) {
      let n = 0;
      const q = new THREE.Quaternion(); const e = new THREE.Euler();
      for (const b of list) {
        if (b.back > 0) continue;
        const y = 0.9 + Math.sin(time * 3 + b.x) * 0.15;
        e.set(0, time * 2, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(b.x, y, b.z), q, new THREE.Vector3(1.0, 1.0, 1.0)); buckets.setMatrixAt(n, m4); buckets.setColorAt(n, col.set('#cfd6e0')); n++;
        m4.compose(new THREE.Vector3(b.x, y + 0.65, b.z), q, new THREE.Vector3(1.1, 0.3, 1.1)); buckets.setMatrixAt(n, m4); buckets.setColorAt(n, col.setHSL((time * 0.4 + b.x * 0.02) % 1, 0.9, 0.55)); n++;
      }
      buckets.count = n; buckets.instanceMatrix.needsUpdate = true; if (buckets.instanceColor) buckets.instanceColor.needsUpdate = true;
    },
  };
  return API;
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

// ------------------------------------------------------------------ race track
function makeTrackColor(T) {
  const th = T.theme;
  return function trackColor(x, z, h) {
  const smp = T.sample(x, z);
  const j = 0.94 + hash2(Math.round(x * 0.8), Math.round(z * 0.8)) * 0.1;
  let c;
  if (smp.onRoad) {
    const sAlong = smp.s * T.LENGTH;
    if (smp.feature) {
      const k = smp.featKind;
      if (k === 'log') c = [0.48, 0.32, 0.19];
      else if (k === 'rock') c = [0.5, 0.52, 0.56];
      else if (k === 'pit') c = th.pit || [0.2, 0.13, 0.08];
      else if (k === 'whoops') c = [0.86, 0.7, 0.4];
      else c = [0.89, 0.69, 0.29];
    } else if (smp.surf === 'asphalt') {
      c = [0.27, 0.28, 0.31];
      if (Math.abs(smp.d) < 0.8 && Math.floor(sAlong / 5) % 2 === 0) c = [0.94, 0.9, 0.66];
      else if (Math.abs(smp.ad - (T.ROAD_HALF - 0.8)) < 0.7) c = [0.95, 0.95, 0.95];
    } else if (smp.surf === 'pad') {
      c = Math.floor(sAlong / 1.5) % 2 ? [1, 0.86, 0.12] : [0.98, 0.52, 0.05];
    } else if (smp.surf === 'goo') {
      c = Math.floor(sAlong / 2 + smp.d) % 2 ? [0.4, 0.78, 0.2] : [0.3, 0.64, 0.16];
    } else if (smp.surf === 'oil') {
      c = (Math.floor(sAlong / 2) + Math.floor(smp.d / 2)) & 1 ? [0.06, 0.05, 0.09] : [0.14, 0.11, 0.2];
    } else if (smp.surf === 'lava') {
      c = (Math.floor(sAlong / 1.4) + Math.floor(smp.d / 1.4)) & 1 ? [1, 0.45, 0.08] : [0.95, 0.25, 0.04];
    } else if (smp.surf === 'snow') {
      c = [0.92, 0.95, 0.99];
      if (Math.abs(Math.abs(smp.d) - 2.2) < 0.6) c = [0.8, 0.86, 0.94];
    } else if (smp.surf === 'ice') {
      c = (Math.floor(sAlong / 3 + smp.d / 2) & 1) ? [0.62, 0.84, 0.97] : [0.7, 0.9, 1.0];
    } else if (smp.surf === 'planks') {
      c = Math.floor(sAlong / 1.2) % 2 ? [0.5, 0.34, 0.2] : [0.44, 0.29, 0.17];
    } else if (smp.surf === 'mud') {
      c = [0.33, 0.22, 0.13];
    } else if (smp.surf === 'sand') {
      c = th.sand;
      if (Math.abs(Math.abs(smp.d) - 2.2) < 0.6) c = th.sand.map((v) => v * 0.9);
    } else {
      c = th.dirt;
      if (Math.abs(Math.abs(smp.d) - 2.2) < 0.7) c = th.rut;   // tyre ruts
    }
    // start / finish line
    const onLine = T.OPEN
      ? (smp.s > T.LINE_S - 2.6 / T.LENGTH && smp.s < T.LINE_S + 1.2 / T.LENGTH) || (smp.s > T.FINISH_S - 2.6 / T.LENGTH && smp.s < T.FINISH_S + 1.2 / T.LENGTH)
      : (smp.s > 1 - 2.6 / T.LENGTH || smp.s < 1.2 / T.LENGTH);
    if (onLine) {
      c = (Math.floor((x + z) * 0.8) & 1) ? [0.95, 0.95, 0.95] : [0.08, 0.08, 0.1];
    }
  } else {
    const nearRoad = smp.ad < T.ROAD_HALF + 2.5;
    c = (Math.floor(x / 2.5) + Math.floor(z / 2.5)) & 1 ? th.a : th.b;
    if (nearRoad) c = th.edge;                    // dusty road edge
    if (smp.ad > T.BARRIER + 4) c = th.far;
  }
  if (T.paint) { const pc = T.paint(x, z, h, smp, c); if (pc) c = pc; }           // a stage can recolour its ground (lava veins, a glowing crater)
  const k = j * (0.9 + Math.min(1, h * 0.012)) * (T.shade ? T.shade(x, z) : 1);   // a stage can shade its ground (Moon craters)
  return [c[0] * k, c[1] * k, c[2] * k];
  };
}

function meshFrom(data, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}


// Giant's Grip deck: gold slabs with ribs underneath, rails with gaps (T.railGap), lamp posts. Voxel-chunky, all instanced.
function buildDeck(group, T) {
  const B = T.BRIDGE; const half = T.ROAD_HALF; const step = 2;
  const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const slabs = []; const ribs = []; const posts = []; const bars = []; const lamps = [];
  const gold = (k, m = 1) => new THREE.Color().setHSL(0.12 + (k - 0.5) * 0.02, 0.78, (0.46 + k * 0.08) * m);
  const s0 = B.s0; const s1 = B.s1;
  const n = Math.round((s1 - s0) * T.LENGTH / step);
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n; const p = T.sampleAt(s); const ry = Math.atan2(p.tx, p.tz);
    const k = hash(i, 1);
    slabs.push({ x: p.x, z: p.z, y: p.y - 0.36, sx: half * 2, sy: 0.7, sz: step * 1.06, ry, color: gold(k, 0.9 + (i % 2) * 0.06) });
    if (i % 3 === 0) ribs.push({ x: p.x, z: p.z, y: p.y - 1.1, sx: half * 2 - 1.2, sy: 0.9, sz: 0.6, ry, color: gold(k, 0.62) });
    for (const side of [-1, 1]) {
      const off = side * (half - 0.35);
      const x = p.x + p.tz * off; const z = p.z - p.tx * off;
      if (T.railGap(s, side)) continue;                                      // a broken rail
      bars.push({ x, z, y: p.y + 1.05, sx: 0.32, sy: 0.3, sz: step * 1.06, ry, color: gold(0.7, 1.15) });
      if (i % 2 === 0) posts.push({ x, z, y: p.y + 0.55, sx: 0.4, sy: 1.1, sz: 0.4, ry, color: gold(0.4, 0.95) });
    }
    if (i % 12 === 0) for (const side of [-1, 1]) {
      const off = side * (half - 0.35); const x = p.x + p.tz * off; const z = p.z - p.tx * off;
      if (!T.railGap(s, side)) lamps.push({ x, z, y: p.y + 2.9, sx: 0.7, sy: 0.7, sz: 0.7, ry, color: new THREE.Color('#fff2b8') });
    }
  }
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  instanced(group, slabs, mat, { cast: true });
  instanced(group, ribs, mat, { cast: true });
  instanced(group, posts, mat, { cast: true });
  instanced(group, bars, mat, { cast: false });
  instanced(group, lamps, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0.9 }), { cast: false });

  // the two giant stone hands under the deck
  const g = gripHands({ P: GRIP_P, H: GRIP_H, a0: GRIP_SPAN.a0, a1: GRIP_SPAN.a1 });
  instanced(group, g.cubes.map((c) => ({ x: c.x, y: c.y, z: c.z, sx: c.s, sy: c.s, sz: c.s, color: new THREE.Color(c.color[0], c.color[1], c.color[2]) })), new THREE.MeshLambertMaterial({ color: 0xffffff }), { cast: true });

  // gold pylons at both ends of the span with main cables swagged between them, and hangers down to the deck
  const towers = []; const cab = []; const hang = [];
  const tz = (side) => GRIP_P.z + side * (half + 1.2);
  const hgt = 15;
  for (const t of [GRIP_SPAN.a0 + 3, GRIP_SPAN.a1 - 3]) for (const side of [-1, 1]) {
    towers.push({ x: GRIP_P.x + t, y: GRIP_H + hgt / 2 - 1, z: tz(side), sx: 1.4, sy: hgt, sz: 1.4, color: gold(0.5, 1.0) });
    towers.push({ x: GRIP_P.x + t, y: GRIP_H + hgt - 0.6, z: tz(side), sx: 2.0, sy: 1.2, sz: 2.0, color: gold(0.9, 1.1) });
  }
  const tA = GRIP_SPAN.a0 + 3; const tB = GRIP_SPAN.a1 - 3;
  const cableY = (t) => { const k = (t - tA) / (tB - tA); return GRIP_H + hgt - 0.6 - (hgt - 4) * 4 * k * (1 - k); };
  for (const side of [-1, 1]) for (let t = tA; t < tB; t += 2) {
    const y0 = cableY(t); const y1 = cableY(t + 2);
    cab.push({ x: GRIP_P.x + t + 1, y: (y0 + y1) / 2, z: tz(side), sx: 2.2, sy: 0.35, sz: 0.35, rx: 0, color: gold(0.8, 1.0) });
    if (Math.round(t) % 8 === 0) hang.push({ x: GRIP_P.x + t, y: (y0 + GRIP_H + 1.1) / 2, z: tz(side), sx: 0.16, sy: Math.max(0.1, y0 - GRIP_H - 1.1), sz: 0.16, color: gold(0.6, 0.9) });
  }
  const gm = new THREE.MeshLambertMaterial({ color: 0xffffff });
  instanced(group, towers, gm, { cast: true }); instanced(group, cab, gm, { cast: false }); instanced(group, hang, gm, { cast: false });
}

function buildTrack(group, T) {
  const trackColor = makeTrackColor(T);
  const S = T.SAMPLES;
  const minX = Math.min(...S.map((p) => p.x)); const maxX = Math.max(...S.map((p) => p.x));
  const minZ = Math.min(...S.map((p) => p.z)); const maxZ = Math.max(...S.map((p) => p.z));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // a stage that is a finite ring of ground in empty space (Saturn's rings): the ground exists only between two radii
  const disc = T.env && T.env.ringDisc;
  const inDisc = disc ? (x, z) => { const r = Math.hypot(x - disc.x, z - disc.z); return r >= disc.r0 && r <= disc.r1; } : () => true;
  // a bridge: no ground columns under the deck (it is drawn on its own, with the drop beneath it)
  const hollow = T.BRIDGE ? (x, z) => { const n = T.nearest(x, z); return T.onSpan(n.s) && Math.abs(n.d) <= T.ROAD_HALF + 1.0; } : () => false;
  const FN = (T.env && T.env.fine) || {};                        // a very long stage can ask for a tighter, coarser detail mesh
  const R = FN.R || 40;
  const fineCell = FN.cell || 1.25;
  const fx0 = Math.floor((minX - R) / fineCell) * fineCell; const fz0 = Math.floor((minZ - R) / fineCell) * fineCell;
  const fine = buildColumns({
    x0: fx0, z0: fz0, nx: Math.ceil((maxX + R - fx0) / fineCell), nz: Math.ceil((maxZ + R - fz0) / fineCell), cell: fineCell, quant: 0.25,
    heightAt: T.heightAt, colorAt: trackColor, include: (x, z) => T.nearest(x, z).dist < R && inDisc(x, z) && !hollow(x, z), edge: disc ? inDisc : null, edgeDrop: 10,
  });
  group.add(meshFrom(fine, mat));
  const far = 150;
  const PL = T.env && T.env.planet;
  const cc = PL ? 4 : 6;
  // on a little planet the flat map wraps all the way round the ball (x = +-pi R) and is squashed away from the equator,
  // so the distant ground only covers that one wrap and a band of latitudes; the smooth ball underneath fills the rest
  const cx0 = PL ? -Math.PI * PL.R : Math.floor((minX - far) / cc) * cc; const cz0 = PL ? -80 : Math.floor((minZ - far) / cc) * cc;
  const coarse = buildColumns({
    x0: cx0, z0: cz0, nx: PL ? Math.floor((2 * Math.PI * PL.R) / cc) : Math.ceil((maxX + far - cx0) / cc), nz: PL ? 40 : Math.ceil((maxZ + far - cz0) / cc), cell: cc, quant: 0.5, sides: false, yOffset: -0.4,
    heightAt: T.heightAt, colorAt: (x, z, h) => trackColor(x, z, h).map((v) => v * 0.92), include: (x, z) => T.nearest(x, z).dist >= R - 4 && inDisc(x, z),
    sides: !!disc, edge: disc ? inDisc : null, edgeDrop: 10,
  });
  group.add(meshFrom(coarse, mat));

  if (T.BRIDGE) buildDeck(group, T);

  // barriers
  const bar = T.env.hideBarriers ? [] : T.barrierLayout();   // a stage can keep the invisible wall but draw no fence (the ring road)
  instanced(group, bar.map((b) => ({ x: b.x, y: b.y + 0.45, z: b.z, sx: 0.6, sy: 0.9, sz: 1.62, rot: b.rot, color: b.c ? '#e63946' : '#f1f1f1' })),
    new THREE.MeshLambertMaterial(), { cast: false });

  // trees beyond the barriers
  const trees = T.sceneryLayout();
  const trunks = []; const leaves = [];
  for (const t of trees) {
    const sc = t.scale;
    const g = 0.75 + t.tint * 0.3;
    if (t.type === 'cactus') {
      const green = new THREE.Color('#4f9a45').multiplyScalar(g);
      trunks.push({ x: t.x, y: t.y + 1.7 * sc, z: t.z, sx: 0.8 * sc, sy: 3.4 * sc, sz: 0.8 * sc, color: green });
      trunks.push({ x: t.x + 0.9 * sc, y: t.y + 2.0 * sc, z: t.z, sx: 1.0 * sc, sy: 0.6 * sc, sz: 0.6 * sc, color: green });
      trunks.push({ x: t.x + 1.3 * sc, y: t.y + 2.8 * sc, z: t.z, sx: 0.6 * sc, sy: 1.6 * sc, sz: 0.6 * sc, color: green });
      trunks.push({ x: t.x - 0.9 * sc, y: t.y + 1.5 * sc, z: t.z, sx: 1.0 * sc, sy: 0.6 * sc, sz: 0.6 * sc, color: green });
      trunks.push({ x: t.x - 1.3 * sc, y: t.y + 2.2 * sc, z: t.z, sx: 0.6 * sc, sy: 1.4 * sc, sz: 0.6 * sc, color: green });
      continue;
    }
    if (t.type === 'mesa') {
      const rock = new THREE.Color('#b8643a').multiplyScalar(g);
      trunks.push({ x: t.x, y: t.y + 1.4 * sc, z: t.z, sx: 8 * sc, sy: 2.8 * sc, sz: 6 * sc, color: rock });
      trunks.push({ x: t.x, y: t.y + 3.6 * sc, z: t.z, sx: 6 * sc, sy: 1.8 * sc, sz: 4.6 * sc, color: rock.clone().multiplyScalar(1.1) });
      trunks.push({ x: t.x, y: t.y + 5.0 * sc, z: t.z, sx: 4 * sc, sy: 1.2 * sc, sz: 3.2 * sc, color: rock.clone().multiplyScalar(1.2) });
      continue;
    }
    if (t.type === 'moonrock') {
      const g2 = new THREE.Color('#8a8a94').multiplyScalar(0.7 + t.tint * 0.4);
      trunks.push({ x: t.x, y: t.y + 0.7 * sc, z: t.z, sx: 2.6 * sc, sy: 1.4 * sc, sz: 2.2 * sc, color: g2, rot: t.tint * 3 });
      trunks.push({ x: t.x + 0.5 * sc, y: t.y + 1.6 * sc, z: t.z - 0.2 * sc, sx: 1.7 * sc, sy: 1.2 * sc, sz: 1.5 * sc, color: g2.clone().multiplyScalar(1.1), rot: t.tint * 3 });
      trunks.push({ x: t.x - 1.7 * sc, y: t.y + 0.35 * sc, z: t.z + 0.9 * sc, sx: 1.1 * sc, sy: 0.7 * sc, sz: 1.0 * sc, color: g2.clone().multiplyScalar(0.9) });
      continue;
    }
    if (t.type === 'icechunk') {
      const ice = new THREE.Color('#cfdcf0').multiplyScalar(0.8 + t.tint * 0.3);
      trunks.push({ x: t.x, y: t.y + 0.9 * sc, z: t.z, sx: 2.8 * sc, sy: 1.8 * sc, sz: 2.4 * sc, color: ice, rot: t.tint * 3 });
      trunks.push({ x: t.x + 0.6 * sc, y: t.y + 2.1 * sc, z: t.z - 0.2 * sc, sx: 1.7 * sc, sy: 1.5 * sc, sz: 1.6 * sc, color: ice.clone().multiplyScalar(1.12), rot: t.tint * 3 });
      trunks.push({ x: t.x - 1.8 * sc, y: t.y + 0.5 * sc, z: t.z + 0.8 * sc, sx: 1.2 * sc, sy: 1.0 * sc, sz: 1.1 * sc, color: ice.clone().multiplyScalar(0.85) });
      continue;
    }
    if (t.type === 'iceshard') {
      const c = new THREE.Color(['#9fd6ff', '#cfe6ff', '#a4b6ff'][Math.floor(t.tint * 3) % 3]);
      for (const [ox, oz, h, w] of [[0, 0, 6.0, 1.3], [1.1, 0.5, 3.6, 0.9], [-1.0, 0.6, 4.4, 1.0], [0.3, -1.0, 2.6, 0.8]]) leaves.push({ x: t.x + ox * sc, y: t.y + (h / 2) * sc, z: t.z + oz * sc, sx: w * sc, sy: h * sc, sz: w * sc, color: c });
      continue;
    }
    if (t.type === 'moonmount') {
      let y = t.y - 2;
      for (const [w, h, c] of [[20, 5, '#4a4a54'], [15, 5.5, '#5a5a66'], [10.5, 5, '#6e6e7a'], [6.5, 4.5, '#84848f'], [3.4, 3.5, '#a0a0aa']]) {
        trunks.push({ x: t.x, y: y + (h * t.scale) / 2, z: t.z, sx: w * t.scale, sy: h * t.scale, sz: w * t.scale * 0.8, color: new THREE.Color(c), rot: t.tint });
        y += h * t.scale;
      }
      continue;
    }
    if (t.type === 'stalagmite') {
      const rock = new THREE.Color('#5a5470').multiplyScalar(0.85 + t.tint * 0.3);
      for (const [w, h, y] of [[2.6, 2.2, 1.1], [1.9, 2.2, 3.3], [1.2, 2.2, 5.5], [0.6, 1.6, 7.4]]) trunks.push({ x: t.x, y: t.y + y * sc, z: t.z, sx: w * sc, sy: h * sc, sz: w * sc, color: rock });
      continue;
    }
    if (t.type === 'crystal') {
      const cols = ['#4be3ff', '#c05cff', '#5cff9a'];
      const col = new THREE.Color(cols[Math.floor(t.tint * 3) % 3]);
      for (const [ox, oz, h, w] of [[0, 0, 3.4, 0.9], [0.9, 0.4, 2.2, 0.7], [-0.8, 0.5, 2.6, 0.7], [0.2, -0.9, 1.8, 0.6]]) leaves.push({ x: t.x + ox * sc, y: t.y + (h / 2) * sc, z: t.z + oz * sc, sx: w * sc, sy: h * sc, sz: w * sc, color: col });
      continue;
    }
    if (t.type === 'skullrock') {
      const bone = new THREE.Color('#d8d2bf').multiplyScalar(0.9 + t.tint * 0.15); const dark = new THREE.Color('#0b0912');
      const c = Math.cos(t.face); const sn = Math.sin(t.face);
      const at = (lx, ly, lz) => ({ x: t.x + (lx * c - lz * sn) * sc, z: t.z + (lx * sn + lz * c) * sc, y: t.y + ly * sc });
      const put = (lx, ly, lz, sx, sy, sz, color, arr = trunks) => { const q = at(lx, ly, lz); arr.push({ x: q.x, y: q.y, z: q.z, sx: sx * sc, sy: sy * sc, sz: sz * sc, color, rot: t.face }); };
      put(0, 6.2, 0, 9, 7, 8, bone); put(0, 10, 0, 7, 1.6, 6.4, bone);          // cranium
      put(0, 2.2, 0.6, 6.6, 3.4, 6, bone);                                       // jaw
      put(-2.2, 6.4, 4.1, 2.3, 2.3, 0.6, dark); put(2.2, 6.4, 4.1, 2.3, 2.3, 0.6, dark);   // eye sockets
      put(0, 4.4, 4.2, 1.1, 1.5, 0.6, dark);                                     // nose
      for (const x of [-2.2, -0.7, 0.7, 2.2]) put(x, 1.6, 3.7, 1.0, 1.6, 0.5, dark);   // teeth gaps
      continue;
    }
    if (t.type === 'lander') {
      // a little moon lander: gold-foil body, four splayed legs, a dish and a flag
      const foil = new THREE.Color('#d9a441').multiplyScalar(0.85 + t.tint * 0.25); const metal = new THREE.Color('#b9bfcc'); const c = Math.cos(t.tint * 6); const sn = Math.sin(t.tint * 6);
      const at = (lx, ly, lz) => ({ x: t.x + (lx * c - lz * sn) * sc, z: t.z + (lx * sn + lz * c) * sc, y: t.y + ly * sc });
      const put = (lx, ly, lz, sx, sy, sz, color) => { const q = at(lx, ly, lz); trunks.push({ x: q.x, y: q.y, z: q.z, sx: sx * sc, sy: sy * sc, sz: sz * sc, color, rot: t.tint * 6 }); };
      put(0, 2.6, 0, 3.4, 2.2, 3.4, foil); put(0, 4.1, 0, 2.2, 1.0, 2.2, metal);
      for (const [lx, lz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) { put(lx * 0.8, 1.3, lz * 0.8, 0.35, 2.6, 0.35, metal); put(lx * 1.25, 0.12, lz * 1.25, 1.1, 0.24, 1.1, metal); }
      put(0, 5.7, 0, 0.18, 2.2, 0.18, metal); put(0.6, 6.6, 0, 1.2, 0.8, 0.1, new THREE.Color('#e63946'));
      continue;
    }
    if (t.type === 'dish') {
      // a radio dish on a mast
      const metal = new THREE.Color('#cfd5e2').multiplyScalar(0.9 + t.tint * 0.15); const dark = new THREE.Color('#5d6577');
      const put = (lx, ly, lz, sx, sy, sz, color) => trunks.push({ x: t.x + lx * sc, y: t.y + ly * sc, z: t.z + lz * sc, sx: sx * sc, sy: sy * sc, sz: sz * sc, color });
      put(0, 0.5, 0, 2.4, 1.0, 2.4, dark); put(0, 3.0, 0, 0.7, 4.0, 0.7, metal);
      for (const [lx, ly, w] of [[0, 5.6, 5.4], [0.7, 6.2, 4.4], [1.3, 6.8, 3.2]]) put(lx, ly, 0, 1.0, w, w * 0.9, metal);
      put(2.1, 7.2, 0, 0.3, 0.3, 0.3, new THREE.Color('#e63946'));
      continue;
    }
    if (t.type === 'cone') {
      // volcano: dark basalt cone, glowing crater
      let y = t.y - 1;
      for (const [w, h, c] of [[22, 6, '#2c2326'], [17, 6, '#372a2a'], [12, 5, '#463230'], [8, 4, '#5a3a32'], [5.2, 2.4, '#ff6a1c'], [3.4, 2, '#ffc23c']]) {
        trunks.push({ x: t.x, y: y + (h * t.scale) / 2, z: t.z, sx: w * t.scale, sy: h * t.scale, sz: w * t.scale, color: new THREE.Color(c) });
        y += h * t.scale;
      }
      continue;
    }
    if (t.type === 'peak') {
      // stepped voxel mountain: dark rock base, grey scree, snow cap
      const layers = [[16, 5, '#5b5f6e'], [13, 5, '#6d7284'], [10, 5, '#8a90a2'], [7, 4, '#dfe6f0'], [4.2, 4, '#ffffff'], [2, 3, '#ffffff']];
      let y = t.y - 1;
      for (const [w, h, c] of layers) {
        const col = new THREE.Color(c).multiplyScalar(0.92 + t.tint * 0.12);
        trunks.push({ x: t.x, y: y + (h * sc) / 2, z: t.z, sx: w * sc, sy: h * sc, sz: w * sc * 0.85, color: col });
        y += h * sc;
      }
      continue;
    }
    if (t.type === 'tower') {
      const stone = new THREE.Color('#8e8f96').multiplyScalar(g);
      trunks.push({ x: t.x, y: t.y + 4.5 * sc, z: t.z, sx: 2.6 * sc, sy: 9 * sc, sz: 2.6 * sc, color: stone });
      trunks.push({ x: t.x, y: t.y + 9.4 * sc, z: t.z, sx: 3.4 * sc, sy: 1.0 * sc, sz: 3.4 * sc, color: stone.clone().multiplyScalar(0.85) });
      for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) trunks.push({ x: t.x + ox * sc, y: t.y + 10.2 * sc, z: t.z + oz * sc, sx: 0.8 * sc, sy: 0.8 * sc, sz: 0.8 * sc, color: stone });
      leaves.push({ x: t.x, y: t.y + 11.4 * sc, z: t.z, sx: 0.2 * sc, sy: 1.8 * sc, sz: 0.2 * sc, color: '#222' });
      leaves.push({ x: t.x + 0.6 * sc, y: t.y + 12 * sc, z: t.z, sx: 1.2 * sc, sy: 0.8 * sc, sz: 0.1 * sc, color: '#d62828' });
      continue;
    }
    trunks.push({ x: t.x, y: t.y + 0.7 * sc, z: t.z, sx: 0.55 * sc, sy: 1.4 * sc, sz: 0.55 * sc, color: '#6b4a2b' });
    const snowy = !!T.theme.snow;
    const green = new THREE.Color(snowy ? '#1f5a3a' : '#2f7d32').multiplyScalar(g);
    if (t.type === 'pine') {
      if (snowy) {
        leaves.push({ x: t.x, y: t.y + 1.9 * sc, z: t.z, sx: 3.0 * sc, sy: 1.1 * sc, sz: 3.0 * sc, color: green });
        leaves.push({ x: t.x, y: t.y + 2.55 * sc, z: t.z, sx: 3.0 * sc, sy: 0.25 * sc, sz: 3.0 * sc, color: '#f4f8ff' });
        leaves.push({ x: t.x, y: t.y + 2.9 * sc, z: t.z, sx: 2.2 * sc, sy: 1.1 * sc, sz: 2.2 * sc, color: green });
        leaves.push({ x: t.x, y: t.y + 3.55 * sc, z: t.z, sx: 2.2 * sc, sy: 0.25 * sc, sz: 2.2 * sc, color: '#f4f8ff' });
        leaves.push({ x: t.x, y: t.y + 3.9 * sc, z: t.z, sx: 1.3 * sc, sy: 1.1 * sc, sz: 1.3 * sc, color: '#f4f8ff' });
        continue;
      }
      leaves.push({ x: t.x, y: t.y + 1.9 * sc, z: t.z, sx: 3.0 * sc, sy: 1.1 * sc, sz: 3.0 * sc, color: green });
      leaves.push({ x: t.x, y: t.y + 2.9 * sc, z: t.z, sx: 2.2 * sc, sy: 1.1 * sc, sz: 2.2 * sc, color: green });
      leaves.push({ x: t.x, y: t.y + 3.9 * sc, z: t.z, sx: 1.3 * sc, sy: 1.1 * sc, sz: 1.3 * sc, color: green });
    } else {
      leaves.push({ x: t.x, y: t.y + 2.6 * sc, z: t.z, sx: 3.2 * sc, sy: 2.6 * sc, sz: 3.2 * sc, color: new THREE.Color('#5aa83c').multiplyScalar(g) });
    }
  }
  instanced(group, trunks, new THREE.MeshLambertMaterial(), { cast: true });
  instanced(group, leaves, new THREE.MeshLambertMaterial(), { cast: true });

  // set pieces (the skull cave): bone and rock lit by the stage, glow parts self-lit
  for (const st of T.STRUCTURES || []) {
    if (st.type === 'planet') { group.add(buildGasGiant(st)); continue; }
    if (st.type === 'gate') {
      // the great gate at the end of a sprint: two stone pillars, a heavy lintel with a glowing seam, and battlements
      const p = T.sampleAt((T.OPEN ? T.FINISH_S : 0) + (st.ahead ?? 9) / T.LENGTH);
      const hd = Math.atan2(p.tx, p.tz); const fx = Math.sin(hd); const fz = Math.cos(hd); const lx = Math.cos(hd); const lz = -Math.sin(hd);
      const at = (lat, up, ahead = 0) => ({ x: p.x + lx * lat + fx * ahead, y: p.y + up, z: p.z + lz * lat + fz * ahead, rot: hd });
      const stone = []; const glow = [];
      const W2 = T.ROAD_HALF + 2.6;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) stone.push({ ...at(side * W2, 1.1 + k * 2.2), sx: 3.4 - k * 0.12, sy: 2.3, sz: 3.4 - k * 0.12, color: k % 2 ? '#4a4048' : '#3c343c' });
        glow.push({ ...at(side * (W2 - 1.8), 4.5, 1.8), sx: 0.5, sy: 8, sz: 0.4, color: '#ff6a10' });
      }
      stone.push({ ...at(0, 14.2), sx: W2 * 2 + 4.4, sy: 3.0, sz: 4.2, color: '#403840' });
      glow.push({ ...at(0, 12.55, 2.2), sx: W2 * 2 + 1, sy: 0.5, sz: 0.4, color: '#ff8a20' });
      for (let k = -4; k <= 4; k += 2) stone.push({ ...at(k * (W2 / 4.4), 16.4), sx: 2.2, sy: 1.8, sz: 3.0, color: '#4a424a' });
      instanced(group, stone, new THREE.MeshLambertMaterial({ emissive: '#1c1212' }), { cast: true });
      instanced(group, glow, new THREE.MeshBasicMaterial({ fog: false }), { cast: false });
      continue;
    }
    if (st.type === 'lava') {
      // a pool of glowing lava made of flat voxel tiles: bright molten cells, darker crust cells in a patchy pattern
      const tiles = []; const cell = 2;
      for (let gx = -st.r; gx <= st.r; gx += cell) for (let gz = -st.r; gz <= st.r; gz += cell) {
        if (Math.hypot(gx, gz) > st.r) continue;
        const h = hash2(Math.round(gx * 0.7), Math.round(gz * 0.7));
        const crust = h > 0.72;
        tiles.push({ x: st.x + gx, y: st.y + (crust ? 0.18 : 0), z: st.z + gz, sx: cell, sy: 0.5, sz: cell, color: crust ? '#5a1a08' : (h > 0.4 ? '#ff7a12' : '#ff4a06') });
      }
      instanced(group, tiles, new THREE.MeshBasicMaterial({ fog: false }), { cast: false });
      continue;
    }
    if (st.type !== 'skullcave') continue;
    const sc = skullCave(T, st);
    const shade = (list, base) => list.map((b) => ({ ...b, color: new THREE.Color(base).multiplyScalar(b.tone || 1) }));
    instanced(group, shade(sc.bone, '#e2dcc8'), new THREE.MeshLambertMaterial({ emissive: '#34303e' }), { cast: true });
    instanced(group, shade(sc.rock, '#6c6678'), new THREE.MeshLambertMaterial({ emissive: '#1a1622' }), { cast: true });
    instanced(group, sc.dark.map((b) => ({ ...b, color: '#07050b' })), new THREE.MeshBasicMaterial(), { cast: false });
    instanced(group, sc.glow, new THREE.MeshBasicMaterial({ fog: false }), { cast: false });
  }

  // roadside rocks and tyre stacks (solid)
  const rocks = []; const stacks = []; const cars = [];
  for (const o of T.OBSTACLES) {
    const y0 = T.heightAt(o.x, o.z);
    if (o.type === 'boulder') {
      const cell = 0.42;
      const n = Math.ceil(o.r / cell);
      for (let i = -n; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = -n; k <= n; k++) {
        if (i * i + j * j * 1.4 + k * k > (o.r / cell) ** 2) continue;
        const shade = 0.82 + ((i * 7 + j * 13 + k * 5) & 7) * 0.025;
        rocks.push({ x: o.x + i * cell, y: y0 + cell / 2 + j * cell, z: o.z + k * cell, sx: cell, sy: cell, sz: cell, color: new THREE.Color('#8b8e94').multiplyScalar(shade) });
      }
    } else if (o.type === 'car') {
      const cols = ['#d62828', '#4cc9f0', '#ffd60a', '#80ed99', '#b185db'];
      const col = cols[Math.abs(Math.round(o.x * 7 + o.z * 3)) % cols.length];
      cars.push({ x: o.x, y: y0 + 0.3, z: o.z, sx: 3.4, sy: 0.6, sz: 1.7, rot: o.rot || 0, color: col });
      cars.push({ x: o.x, y: y0 + 0.75, z: o.z, sx: 1.6, sy: 0.3, sz: 1.3, rot: o.rot || 0, color: '#2b2d42' });
    } else {
      for (let h = 0; h < 3; h++) stacks.push({ x: o.x, y: y0 + 0.15 + h * 0.3, z: o.z, sx: 1.5, sy: 0.28, sz: 1.5, rot: h * 0.5, color: h === 1 ? '#e63946' : '#1c1c20' });
    }
  }
  instanced(group, rocks, new THREE.MeshLambertMaterial(), { cast: true });
  instanced(group, stacks, new THREE.MeshLambertMaterial(), { cast: true });
  instanced(group, cars, new THREE.MeshLambertMaterial(), { cast: true });

  // wall passages: solid brick / stone blocks in lines
  const wallBoxes = [];
  const wallBase = { brick: [0.66, 0.33, 0.24], stone: [0.55, 0.55, 0.58], plinth: [0.4, 0.4, 0.45] };
  for (const w of [...T.WALLS, ...(T.BLOCKS || [])]) {
    if (w.kind === 'snowrock') {                                    // a slate boulder: offset chunks, thick snow caps, a glint of ice
      const hs = (((Math.round(w.x * 3) * 7 + Math.round(w.z * 5) * 13) & 15) / 15);
      const r = w.r || 1.5; const rot = (w.rot || 0) + (hs - 0.5) * 0.9; const cs = Math.cos(rot); const sn = Math.sin(rot);
      const slate = new THREE.Color('#5a6272').multiplyScalar(0.85 + hs * 0.3);
      const at = (ox, oz) => [w.x + ox * cs + oz * sn, w.z - ox * sn + oz * cs];
      const [ax, az] = at(0.45 * r, -0.3 * r); const [bx, bz] = at(-0.5 * r, 0.35 * r); const [ix, iz] = at(0.1 * r, 0.82 * r);
      wallBoxes.push({ x: w.x, y: w.y0 + w.h * 0.5 - 0.1, z: w.z, sx: 1.6 * r, sy: w.h, sz: 1.45 * r, rot, color: slate });
      wallBoxes.push({ x: ax, y: w.y0 + w.h * 0.3, z: az, sx: 1.2 * r, sy: w.h * 0.62, sz: 1.05 * r, rot: rot + 0.5, color: slate.clone().multiplyScalar(1.12) });
      wallBoxes.push({ x: bx, y: w.y0 + w.h * 0.36, z: bz, sx: 1.0 * r, sy: w.h * 0.72, sz: 1.0 * r, rot: rot - 0.4, color: slate.clone().multiplyScalar(0.9) });
      wallBoxes.push({ x: w.x, y: w.y0 + w.h + 0.2, z: w.z, sx: 1.85 * r, sy: 0.5, sz: 1.7 * r, rot, color: new THREE.Color('#f6f9ff') });
      wallBoxes.push({ x: bx, y: w.y0 + w.h * 0.72 + 0.12, z: bz, sx: 1.25 * r, sy: 0.36, sz: 1.25 * r, rot: rot - 0.4, color: new THREE.Color('#e9f0fb') });
      wallBoxes.push({ x: ix, y: w.y0 + 0.55, z: iz, sx: 0.32 * r, sy: 1.1, sz: 0.32 * r, rot: rot + 0.3, color: new THREE.Color('#8fdcff') });
      continue;
    }
    const base = wallBase[w.kind] || wallBase.brick;
    const shade = 0.86 + ((Math.round(w.x * 3) + Math.round(w.z * 5)) & 7) * 0.03;
    const col = new THREE.Color(base[0] * shade, base[1] * shade, base[2] * shade);
    wallBoxes.push({ x: w.x, y: w.y0 + w.h / 2 - 0.1, z: w.z, sx: 1.62 * (w.r || 1.05), sy: w.h, sz: 1.52 * (w.r || 1.05), rot: w.rot, color: col });
    wallBoxes.push({ x: w.x, y: w.y0 + w.h + 0.12, z: w.z, sx: 1.81 * (w.r || 1.05), sy: 0.28, sz: 1.71 * (w.r || 1.05), rot: w.rot, color: col.clone().multiplyScalar(1.18) });
  }
  instanced(group, wallBoxes, new THREE.MeshLambertMaterial(), { cast: true });

  // loops: a ribbon ring with striped rails and a boost pad on the approach
  const ring = []; const rails = []; const pads = [];
  const RL = T.env && T.env.ring;   // a stage can restyle its loop (the Moon: a pale lunar-base ring with cyan lights)
  T.LOOPS.forEach((L) => {
    const hd = Math.atan2(L.tx, L.tz);
    const seg = 64;
    for (let i = 0; i < seg; i++) {
      const th = ((i + 0.5) / seg) * Math.PI * 2;
      const pt = loopWorld(L, th, 0);
      const ph = pt.phi;
      const nIn = { f: -Math.sin(ph), y: Math.cos(ph) };           // inward normal in the (forward, up) plane
      const len = (pt.ds * Math.PI * 2 / seg) * 1.15;
      const at = (off, lat) => ({ x: pt.x + L.tx * nIn.f * off + L.tz * lat, y: pt.y + nIn.y * off, z: pt.z + L.tz * nIn.f * off - L.tx * lat });
      const c = at(-0.3, 0);
      ring.push({ x: c.x, y: c.y, z: c.z, sx: L.halfW * 2 + 1.0, sy: 0.6, sz: len, rx: -ph, ry: hd, color: RL ? (i % 2 ? RL.a : RL.b) : (i % 2 ? '#2d2f36' : '#34363e') });
      for (const side of [-1, 1]) {
        const r = at(0.55, side * (L.halfW + 0.35));
        rails.push({ x: r.x, y: r.y, z: r.z, sx: 0.5, sy: 1.3, sz: len, rx: -ph, ry: hd, color: RL ? ((i >> 1) & 1 ? RL.rail1 : RL.rail2) : ((i >> 1) & 1 ? '#ffd60a' : '#1d1d22') });
      }
    }
    for (let k = 0; k < 4; k++) pads.push({ x: L.x - L.tx * (3 + k * 2.2) + L.tz * L.c0, y: L.y0 + 0.06, z: L.z - L.tz * (3 + k * 2.2) - L.tx * L.c0, sx: L.halfW * 2 - 1, sy: 0.12, sz: 1.1, rot: hd, color: k % 2 ? '#ffd60a' : '#ff8a00' });
  });
  const ringMat = new THREE.MeshLambertMaterial();
  instanced(group, ring, ringMat, { cast: true, receive: true });
  instanced(group, rails, new THREE.MeshLambertMaterial(RL ? { emissive: new THREE.Color(RL.glow) } : {}), { cast: true });
  instanced(group, pads, new THREE.MeshLambertMaterial({ emissive: new THREE.Color('#553300') }), { receive: true });

  // gates: start/finish arch + three checkpoint arches
  const gateMat = (c) => lambert(c);
  const gates = T.CHECKPOINTS.map((cs, idx) => ({ cs: T.OPEN && idx === 0 ? T.LINE_S : cs, idx }));
  if (T.OPEN) gates.push({ cs: T.FINISH_S, idx: 0 });        // a sprint track also has a finish arch
  gates.forEach(({ cs, idx }) => {
    const p = T.sampleAt(cs);
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = Math.atan2(p.tx, p.tz);
    const w = T.ROAD_HALF + 0.9;
    const col = idx === 0 ? '#f1f1f1' : '#4cc9f0';
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(UNIT, gateMat(idx === 0 ? '#222' : '#1d3557'));
      post.scale.set(0.7, 7, 0.7); post.position.set(side * w, 3.5, 0); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(UNIT, gateMat(col));
    beam.scale.set(w * 2 + 0.7, 1.2, 0.8); beam.position.set(0, 6.6, 0); beam.castShadow = true; g.add(beam);
    if (idx === 0) {
      for (let i = 0; i < 14; i++) {
        const sq = new THREE.Mesh(UNIT, gateMat(i & 1 ? '#111' : '#fff'));
        sq.scale.set((w * 2) / 14, 0.55, 0.85); sq.position.set(-w + (i + 0.5) * ((w * 2) / 14), 6.6 + 0.3 * (i & 1 ? -1 : 1) * 0.5, 0); g.add(sq);
      }
    }
    group.add(g);
  });
  return { fineTris: fine.triangles, coarseTris: coarse.triangles, barriers: bar.length, trees: trees.length };
}


// ------------------------------------------------------------------ the labyrinth: hedge walls, gravel paths, the exit gate
function buildMaze(group, T) {
  const M = T.maze;
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const leaf = (k) => new THREE.Color().setHSL(0.27 + (k - 0.5) * 0.05, 0.5, 0.25 + k * 0.1);
  // pixel-speckle textures (nearest filtering, so they read as voxels): the meadow and the gravel
  const speckle = (base, spread, dots, seed, size = 64) => {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const cx = cv.getContext('2d');
    cx.fillStyle = base; cx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size * 0.55; i++) {
      const k = hash(i + seed, seed * 3.1); const x = Math.floor(hash(i, seed) * size); const y = Math.floor(hash(seed, i * 1.7) * size);
      const v = Math.round((k - 0.5) * 2 * spread);
      const col = new THREE.Color(base); col.offsetHSL(0, 0, v / 255);
      cx.fillStyle = `#${col.getHexString()}`; cx.fillRect(x, y, 2, 2);
    }
    for (const [colr, n] of dots) for (let i = 0; i < n; i++) { cx.fillStyle = colr; cx.fillRect(Math.floor(hash(i, seed + 9) * size), Math.floor(hash(seed + 5, i * 2.3) * size), 2, 2); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const meadowTex = speckle('#5f9a45', 26, [['#e8d34a', 5], ['#f4f4f4', 4]], 11);
  if (meadowTex) meadowTex.repeat.set(70, 70);
  const meadow = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: meadowTex ? 0xffffff : 0x6fa850, map: meadowTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  meadow.scale.set(1400, 0.1, 1400); meadow.position.set(0, -0.03, 0); meadow.receiveShadow = true; group.add(meadow);
  // ONE gravel slab under the whole maze (no tile seams to shimmer); the walls simply stand on it
  const gravelTex = speckle('#bda56f', 20, [['#8c7a52', 40], ['#e3d3a4', 30]], 23);
  const bx = M.bounds.x; const bz = M.bounds.z;
  if (gravelTex) gravelTex.repeat.set(bx * 2 / 9, bz * 2 / 9);
  const slab = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: gravelTex ? 0xffffff : 0xb8a572, map: gravelTex }));
  slab.scale.set(bx * 2, 0.3, bz * 2); slab.position.set(0, 0.05, 0); slab.receiveShadow = true; group.add(slab);

  // hedges built from leaf voxels: three layers of chunky cubes with their own colour, the top layer uneven, a few flowers on top.
  const hv = []; const flowers = [];
  const LAYER = WALL_H_VIEW / 3;
  for (const r of M.wallRuns()) {
    const w = r.x1 - r.x0; const d = r.z1 - r.z0; const cx = (r.x0 + r.x1) / 2; const cz = (r.z0 + r.z1) / 2;
    const horiz = w >= d; const len = horiz ? w : d; const th = horiz ? d : w;
    const n = Math.max(1, Math.round(len / 1.7)); const step = len / n;
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + step * (i + 0.5);
      const px = horiz ? cx + u : cx; const pz = horiz ? cz : cz + u;
      for (let L = 0; L < 3; L++) {
        const k = hash(px * 1.31 + L * 7.7, pz * 0.97 - L * 3.3);
        const k2 = hash(pz + L, px - L * 5.1);
        const top = L === 2;
        const hgt = LAYER * (top ? 0.86 + k * 0.42 : 1.04);
        const lift = top ? (k2 - 0.5) * 0.12 : 0;
        const inset = top ? 0.05 + k2 * 0.25 : 0.04 + k * 0.1;       // the sides are scalloped, never one flat plane
        const lit = [0.2, 0.26, 0.33][L] + k * 0.085;
        const accent = k2 > 0.93;
        hv.push({
          x: px, z: pz, y: LAYER * L + hgt / 2 + lift,
          sx: horiz ? step * 1.06 : th - inset, sy: hgt, sz: horiz ? th - inset : step * 1.06,
          color: new THREE.Color().setHSL(accent ? 0.2 : 0.27 + (k2 - 0.5) * 0.04, accent ? 0.55 : 0.5, lit),
        });
        if (top && hash(px * 3.1, pz * 2.7) > 0.9) {
          const kk = hash(px, pz * 5.3);
          flowers.push({ x: px + (k2 - 0.5) * 0.6, z: pz + (k - 0.5) * 0.6, y: LAYER * 2 + hgt + lift + 0.12, sx: 0.34, sy: 0.3, sz: 0.34, color: kk < 0.34 ? '#ff7aa8' : kk < 0.67 ? '#fff6d6' : '#ffd23f' });
        }
      }
    }
  }
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  instanced(group, hv, mat, { cast: true });
  instanced(group, flowers, mat, { cast: false });
  // grass fringe along the foot of the hedges and a scatter of pebbles and tufts on the gravel, all tiny voxels
  const tufts = [];
  for (let i = 0; i < M.H; i++) for (let j = 0; j < M.W; j++) {
    if (M.lines[i][j] === '#') continue;
    const [x0, x1] = M.xs[j]; const [z0, z1] = M.zs[i];
    const n = (x1 - x0) * (z1 - z0) > 100 ? 7 : 1;
    for (let q = 0; q < n; q++) {
      const k = hash(i * 13.1 + q, j * 7.7 - q); const k2 = hash(j * 3.3 + q * 1.9, i * 5.1);
      const px = x0 + 0.8 + k * (x1 - x0 - 1.6); const pz = z0 + 0.8 + k2 * (z1 - z0 - 1.6);
      const grass = k2 > 0.55;
      tufts.push({ x: px, z: pz, y: 0.2 + (grass ? 0.18 : 0.08), sx: grass ? 0.5 : 0.6 + k * 0.5, sy: grass ? 0.36 : 0.16, sz: grass ? 0.5 : 0.5 + k2 * 0.5, color: grass ? new THREE.Color().setHSL(0.27, 0.5, 0.3 + k * 0.1) : new THREE.Color().setHSL(0.11, 0.2, 0.45 + k * 0.2) });
    }
  }
  instanced(group, tufts, mat, { cast: false });
  const floor = tufts;
  const body = hv; const blobs = flowers;
  // the exit: a low arch (no taller than the hedges, so it is found by driving, not by looking over the walls) and a chequered pad
  const e = T.exitPose;
  const g = new THREE.Group(); g.position.set(e.x, 0, e.z);
  const post = (x, z) => { const p = new THREE.Mesh(UNIT, lambert('#f1f1f1')); p.scale.set(0.8, 3.2, 0.8); p.position.set(x, 1.6, z); p.castShadow = true; g.add(p); };
  post(-4.5, 0); post(4.5, 0);
  const beam = new THREE.Mesh(UNIT, lambert('#4cc9f0')); beam.scale.set(10, 0.9, 0.9); beam.position.set(0, 3.2, 0); g.add(beam);
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
    const sq = new THREE.Mesh(UNIT, lambert((a + b) & 1 ? '#111' : '#fff')); sq.scale.set(1.6, 0.05, 1.6); sq.position.set(-4 + a * 1.6 + 0.8 - 0.8 + 0.0, 0.1, -4 + b * 1.6); g.add(sq);
  }
  group.add(g);
  // preview-only beacons: tall light columns over the start (yellow) and the exit (cyan), so the map reads from high above
  const beacons = new THREE.Group(); beacons.visible = false;
  const col = (x, z, c, h) => {
    const m = new THREE.Mesh(UNIT, basic(c, { transparent: true, opacity: 0.5, depthWrite: false }));
    m.scale.set(2.2, h, 2.2); m.position.set(x, h / 2, z); beacons.add(m);
    const cap = new THREE.Mesh(UNIT, basic(c)); cap.scale.set(5, 1.4, 5); cap.position.set(x, h + 0.7, z); beacons.add(cap);
  };
  const s0 = M.cellCenter(M.start.r, M.start.c);
  col(s0.x, s0.z, '#ffd60a', 22); col(e.x, e.z, '#4cc9f0', 40);
  group.add(beacons);
  // overview-map extras: a red "you are here" column and a breadcrumb trail of the cells driven through
  const you = new THREE.Group(); you.visible = false;
  const ycol = new THREE.Mesh(UNIT, basic('#ff3b30', { transparent: true, opacity: 0.6, depthWrite: false })); ycol.scale.set(2.2, 26, 2.2); ycol.position.y = 13; you.add(ycol);
  const ycap = new THREE.Mesh(UNIT, basic('#ff3b30')); ycap.scale.set(5, 1.4, 5); ycap.position.y = 26.7; you.add(ycap);
  group.add(you);
  const TRAIL_MAX = 800;
  const trailMesh = new THREE.InstancedMesh(UNIT, basic('#ffd60a'), TRAIL_MAX); trailMesh.count = 0; trailMesh.frustumCulled = false; trailMesh.visible = false; group.add(trailMesh);
  return { walls: body.length, blobs: blobs.length, floorTiles: floor.length, beacons, you, trailMesh, trailMax: TRAIL_MAX };
}
const WALL_H_VIEW = 3.4;

// ------------------------------------------------------------------ destructible props
function propMesh(p) {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(UNIT, lambert(color));
    m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const dark = (c, k = 0.78) => new THREE.Color(c).multiplyScalar(k);
  switch (p.type) {
    case 'crate':
      box(1.4, 1.4, 1.4, 0, 0.7, 0, p.color);
      box(1.46, 0.18, 1.46, 0, 0.25, 0, dark(p.color)); box(1.46, 0.18, 1.46, 0, 1.15, 0, dark(p.color));
      break;
    case 'barrel':
      box(1.1, 1.0, 1.1, 0, 0.5, 0, p.color);
      box(1.16, 0.12, 1.16, 0, 0.25, 0, '#e8edf5'); box(1.16, 0.12, 1.16, 0, 0.75, 0, '#e8edf5');
      break;
    case 'fence':
      for (const x of [-0.8, 0, 0.8]) box(0.18, 1.1, 0.18, x, 0.55, 0, '#8a6a42');
      box(1.8, 0.2, 0.1, 0, 0.9, 0, p.color); box(1.8, 0.2, 0.1, 0, 0.5, 0, '#f1f1f1');
      break;
    case 'car':
      box(3.4, 0.55, 1.7, 0, 0.45, 0, p.color);
      box(1.7, 0.4, 1.4, -0.2, 0.9, 0, dark(p.color, 0.9)); box(1.5, 0.28, 1.46, -0.2, 0.92, 0, '#1b2a3a');
      for (const [x, z] of [[-1.2, -0.85], [-1.2, 0.85], [1.2, -0.85], [1.2, 0.85]]) box(0.6, 0.6, 0.3, x, 0.3, z, '#1c1c20');
      break;
    case 'wall':
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const off = (r & 1) * 0.4;
        box(0.76, 0.52, 1.1, -1.2 + c * 0.8 + off - 0.2, 0.28 + r * 0.55, 0, dark(p.color, 0.86 + ((r * 5 + c * 3) % 5) * 0.04));
      }
      break;
    case 'tnt':
      box(1.5, 1.2, 1.5, 0, 0.6, 0, p.color); box(1.56, 0.22, 1.56, 0, 0.6, 0, '#f4f1ea'); box(0.5, 0.25, 0.5, 0, 1.3, 0, '#ffd60a');
      break;
    case 'fuel':
      box(4.4, 1.7, 2.1, 0.4, 1.1, 0, p.color); box(4.46, 0.3, 2.16, 0.4, 1.1, 0, '#d62828');
      box(1.4, 1.5, 2.0, -2.5, 0.95, 0, '#d62828');
      for (const [x, z] of [[-2.6, -1.05], [-2.6, 1.05], [0.6, -1.05], [0.6, 1.05], [2.2, -1.05], [2.2, 1.05]]) box(0.8, 0.8, 0.3, x, 0.4, z, '#1c1c20');
      break;
    default: box(1, 1, 1, 0, 0.5, 0, p.color);
  }
  return g;
}

function buildPropMeshes(group) {
  const byId = new Map();
  return {
    set(props) {
      this.clear();
      for (const p of props) {
        const m = propMesh(p);
        m.position.set(p.x, p.y0 !== undefined ? p.y0 : ARENA_H(p.x, p.z), p.z);
        m.rotation.y = p.rot || 0;
        group.add(m); byId.set(p.id, m);
      }
    },
    remove(id) { const m = byId.get(id); if (m) { group.remove(m); byId.delete(id); } },
    // quick visual feedback when a wall cracks
    shake(id) { const m = byId.get(id); if (m) m.rotation.z = (Math.random() - 0.5) * 0.08; },
    clear() { for (const m of byId.values()) group.remove(m); byId.clear(); },
    get count() { return byId.size; },
  };
}

// nitro canisters on the track: bright yellow, spinning, hidden while taken
function buildPickupMeshes(group) {
  let list = []; let baseY = [];
  const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(e) });
  return {
    set(pickups) {
      this.clear();
      for (const p of pickups) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(UNIT, mat('#ffd60a', '#775500')); body.scale.set(0.85, 1.1, 0.85); g.add(body);
        const cap = new THREE.Mesh(UNIT, mat('#4cc9f0', '#145a70')); cap.scale.set(0.5, 0.35, 0.5); cap.position.y = 0.72; g.add(cap);
        const bolt = new THREE.Mesh(UNIT, mat('#ffffff', '#888888')); bolt.scale.set(0.2, 0.7, 0.9); bolt.rotation.z = 0.5; g.add(bolt);
        const y = (p.y0 || 0) + 1.5;
        g.position.set(p.x, y, p.z); baseY.push(y);
        group.add(g); list.push(g);
      }
    },
    sync(pickups, t) {
      for (let i = 0; i < list.length && i < pickups.length; i++) {
        list[i].visible = !pickups[i].taken;
        list[i].rotation.y = t * 2.2 + i;
        list[i].position.y = baseY[i] + Math.sin(t * 3 + i) * 0.22;
      }
    },
    clear() { for (const g of list) group.remove(g); list = []; baseY = []; },
    get count() { return list.length; },
  };
}

// ------------------------------------------------------------------ world
// meteors: every second or so a streak appears in the part of the sky the camera is looking at, slides across it and fades
const _mv = new THREE.Vector3(); const _mz = new THREE.Vector3(0, 0, 1);
let meteorWait = 0.6;
function animateMeteors(meteors, dt, a) {
  meteorWait -= dt;
  if (meteorWait <= 0) {
    const m = meteors.find((q) => q.userData.life <= 0);
    meteorWait = 0.5 + Math.random() * 1.3;
    if (m) {
      const f = new THREE.Vector3(a.f[0], a.f[1], a.f[2]); const u = new THREE.Vector3(a.u[0], a.u[1], a.u[2]); const r = new THREE.Vector3().crossVectors(f, u).normalize();
      const yaw = (Math.random() - 0.5) * 1.5; const pit = 0.12 + Math.random() * 0.6;
      const d = f.clone().multiplyScalar(Math.cos(yaw) * Math.cos(pit)).addScaledVector(r, Math.sin(yaw) * Math.cos(pit)).addScaledVector(u, Math.sin(pit)).normalize();
      const rnd = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      const t = new THREE.Vector3().crossVectors(rnd, d).normalize();
      Object.assign(m.userData, { life: 1, max: 0.7 + Math.random() * 0.8, len: 10 + Math.random() * 12 });
      m.userData.dir.copy(d); m.userData.tan.copy(t); m.userData.speed = 55 + Math.random() * 60;
      m.scale.set(1, 1, m.userData.len); m.visible = true;
    }
  }
  for (const m of meteors) {
    const q = m.userData;
    if (q.life <= 0) continue;
    q.life -= dt / q.max;
    if (q.life <= 0) { m.visible = false; continue; }
    q.dir.addScaledVector(q.tan, (q.speed * dt) / 95).normalize();
    m.position.copy(q.dir).multiplyScalar(95);
    _mv.copy(q.tan).normalize();
    m.quaternion.setFromUnitVectors(_mz, _mv);
    m.material.opacity = Math.min(1, q.life * 3, (1 - q.life) * 6 + 0.2);
  }
}

export function createWorld(scene, lights) {
  const outdoor = new THREE.Group();
  const garage = new THREE.Group();
  scene.add(outdoor, garage);

  // backdrops (sky, stars, Earth, sun, flat ground) live in plain world space: they must never be bent onto a planet
  const noWarp = (o) => { o.traverse((c) => { for (const m of [].concat(c.material || [])) m.userData.noWarp = true; }); return o; };
  const sky = noWarp(buildSky());
  sky.userData.backdrop = true;
  outdoor.add(sky);
  const skies = new Map();            // sky key -> mesh (built once, per stage look)
  const skyFor = (stops, key) => {
    if (!skies.has(key)) { const m = noWarp(buildSky(stops)); m.userData.backdrop = true; m.visible = false; outdoor.add(m); skies.set(key, m); }
    return skies.get(key);
  };
  skyFor(DAY, 'day');
  const space = noWarp(buildSpace());
  space.visible = false;
  space.userData.backdrop = true;
  outdoor.add(space);
  const sunMesh = noWarp(buildSun());
  sunMesh.userData.backdrop = true;
  outdoor.add(sunMesh);
  const arena = buildArena(outdoor);
  noWarp(arena.ground); noWarp(arena.clouds);
  // earthshine: a faint blue light from the Earth, only on stages that ask for it (intensity 0 elsewhere)
  const earthLight = new THREE.DirectionalLight('#6f9cff', 0);
  scene.add(earthLight, earthLight.target);
  let sunWorld = null; let earthWorld = null;
  // the little planet: a rough ball just under the flat map's ground, so the world has a floor off the road
  const planets = new Map();
  const planetFor = (R) => {
    if (!planets.has(R)) {
      const geo = new THREE.IcosahedronGeometry(R - 4, 5);
      const pos = geo.attributes.position; const cols = new Float32Array(pos.count * 3); const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) { const j = 0.78 + 0.22 * hash2(pos.getX(i) * 0.9, pos.getZ(i) * 0.9 + pos.getY(i)); c.setRGB(0.5 * j, 0.5 * j, 0.54 * j); cols.set([c.r, c.g, c.b], i * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const m = noWarp(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
      m.userData.backdrop = true; m.visible = false; m.frustumCulled = false; outdoor.add(m); planets.set(R, m);
    }
    return planets.get(R);
  };
  const groundMat = arena.groundMat;
  const gar = buildGarage(garage);
  const sandbox = new THREE.Group();
  sandbox.visible = false;
  scene.add(sandbox);
  const sbStats = buildSandbox(sandbox);
  const paintGroup = new THREE.Group();
  paintGroup.visible = false;
  scene.add(paintGroup);
  let paintView = null;
  const propGroup = new THREE.Group();
  scene.add(propGroup);
  const propMeshes = buildPropMeshes(propGroup);
  const pickupGroup = new THREE.Group();
  scene.add(pickupGroup);
  const pickupMeshes = buildPickupMeshes(pickupGroup);
  const trackGroups = new Map();     // track id -> { group, stats }
  let activeTrack = null;
  let trackStats = null;
  let course = 'arena';

  const { hemi, sun, spot } = lights;
  const fogOut = new THREE.Fog('#f4a96b', 26, 110);
  const fogGar = new THREE.Fog('#16161e', 14, 40);
  const fogDay = new THREE.Fog('#cfe6f5', 40, 170);
  let mode = 'outdoor';
  const snow = buildWeather(scene);
  const hazardView = createHazardView(scene);
  let focus = { x: 0, y: 0, z: 0 };
  let sunDirFlat = [8, 12, 5];
  let skyAnchor = null;   // planet stages: the sky and stars are centred on the camera instead of the flat map
  let weatherWind = null;

  function setMode(next) {
    mode = next === 'garage' || next === 'drive' ? next : 'outdoor';
    const g = mode === 'garage';
    const d = mode === 'drive';
    outdoor.visible = !g;
    // driving keeps the sky, sun, mesas, clouds and ground, but not the stadium props
    const racing = d && course === 'race';
    for (const child of outdoor.children) child.visible = !d || !!child.userData.backdrop;
    for (const child of outdoor.children) if (child.userData.mesa && racing) child.visible = false;
    sky.visible = !racing;
    arena.cloudMat.color.set(racing ? '#ffffff' : '#ffd9e0');
    const env = racing && activeTrack ? activeTrack.env || {} : {};
    const planet = racing && env.planet ? env.planet : null;
    PLANET_U.value = planet ? planet.R : 0;
    for (const [, pm] of planets) pm.visible = false;
    if (planet) planetFor(planet.R).visible = true;
    arena.ground.visible = !planet && !(env.ringDisc);
    const look = racing ? { ...LOOK_DEFAULT, ...(env.look || {}) } : null;
    sunMesh.visible = !planet && !(racing && look.sky === 'space');
    arena.clouds.visible = !(racing && look.sky === 'space');   // no clouds in the vacuum
    sunWorld = racing && look.sunWorld ? look.sunWorld : null; earthWorld = racing && look.earthWorld ? look.earthWorld : null;
    earthLight.intensity = racing && look.earthshine ? look.earthshine[1] : 0;
    if (racing && look.earthshine) earthLight.color.set(look.earthshine[0]);
    for (const [k, m] of skies) m.visible = false;
    if (racing) skyFor(SKY_STOPS[look.sky] || DAY, look.sky).visible = true;
    space.visible = racing && look.sky === 'space';
    if (space.visible) {                         // each space stage shows its own sky furniture: Earth + Sun (Moon), or Saturn + Sun
      for (const o of space.userData.earthSet) o.visible = !!look.earthWorld;
      const sd = look.sunWorld || look.sunDisc;
      space.userData.sunG.visible = !!sd;
      if (sd) { space.userData.sunG.position.set(sd[0] * 108, sd[1] * 108, sd[2] * 108); space.userData.sunG.lookAt(0, 0, 0); }
    }
    snow.set(racing ? env.weather : null);
    weatherWind = env.breeze || env.wind || null;
    sandbox.visible = d && course === 'arena';
    paintGroup.visible = d && course === 'paint';
    for (const [id, tg] of trackGroups) tg.group.visible = d && course === 'race' && activeTrack && activeTrack.id === id;
    groundMat.color.set(d ? (course === 'race' ? groundFor(activeTrack) : '#cfa57e') : '#ffd9b3');
    garage.visible = g;
    scene.background = new THREE.Color(g ? '#16161e' : (racing ? look.fog[0] : '#ffb35a'));
    if (racing) { fogDay.color.set(look.fog[0]); fogDay.near = look.fog[1]; fogDay.far = look.fog[2]; }
    scene.fog = g ? fogGar : (racing ? fogDay : fogOut);
    if (g) {
      hemi.color.set('#8fa0ff'); hemi.groundColor.set('#2a2230'); hemi.intensity = 0.9;
      sun.color.set('#ffe9c8'); sun.intensity = 1.5; sun.position.set(4, 9, 6);
      spot.visible = true;
    } else if (racing) {
      hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2];
      sun.color.set(look.sun[0]); sun.intensity = look.sun[1]; sun.position.set(look.sun[2], look.sun[3], look.sun[4]); sunDirFlat = [look.sun[2], look.sun[3], look.sun[4]];
      spot.visible = false;
    } else {
      hemi.color.set('#ffd2a0'); hemi.groundColor.set('#8a4b2a'); hemi.intensity = 1.35;
      sun.color.set('#ffb877'); sun.intensity = 2.5; sun.position.set(8, 6, 5);
      spot.visible = false;
    }
  }
  function groundFor(track) {
    if (!track || track.id === 'greenridge') return '#8db36a';
    const f = track.theme.far;
    return `#${new THREE.Color(f[0] * 0.95, f[1] * 0.95, f[2] * 0.95).getHexString()}`;
  }
  // labyrinth preview: show / hide the light columns over the start and the exit
  function setMazePreview(on) {
    const tg = activeTrack && trackGroups.get(activeTrack.id);
    if (tg && tg.stats && tg.stats.beacons) tg.stats.beacons.visible = !!on;
    if (tg && tg.stats && tg.stats.you && !on) { tg.stats.you.visible = false; tg.stats.trailMesh.visible = false; }
  }
  // overview map during a race: beams on the start and exit, a red column on the truck, and the breadcrumb trail
  const _tm = new THREE.Matrix4();
  function setMazePeek(on, you, trail) {
    const tg = activeTrack && trackGroups.get(activeTrack.id);
    if (!tg || !tg.stats || !tg.stats.you) return;
    const st = tg.stats;
    st.beacons.visible = !!on; st.you.visible = !!on; st.trailMesh.visible = !!on;
    if (!on) return;
    if (you) st.you.position.set(you.x, 0, you.z);
    if (trail) {
      const n = Math.min(trail.length, st.trailMax);
      for (let i = 0; i < n; i++) { _tm.makeScale(1.1, 0.3, 1.1); _tm.setPosition(trail[i][0], 0.35, trail[i][1]); st.trailMesh.setMatrixAt(i, _tm); }
      st.trailMesh.count = n; st.trailMesh.instanceMatrix.needsUpdate = true;
    }
  }
  function setCourse(next, track) {
    course = next === 'race' ? 'race' : (next === 'paint' ? 'paint' : 'arena');
    if (course === 'race' && track) {
      activeTrack = track;
      if (!trackGroups.has(track.id)) {
        const group = new THREE.Group();
        group.visible = false;
        scene.add(group);
        trackGroups.set(track.id, { group, stats: track.maze ? buildMaze(group, track) : buildTrack(group, track) });
      }
      trackStats = trackGroups.get(track.id).stats;
    }
    if (mode === 'drive') setMode('drive');
  }
  // Paint the Town: (re)build the floor for this tile map
  function setPaint(map) {
    while (paintGroup.children.length) paintGroup.remove(paintGroup.children[0]);
    paintView = buildPaintArena(paintGroup, map);
    return paintView;
  }
  setMode('outdoor');

  const m = new THREE.Matrix4();
  function update(dt, t, spin) {
    if (snow.mesh.visible) snow.update(dt, t, focus.x, focus.y, focus.z, weatherWind);
    if (skyAnchor) for (const [, sk] of skies) sk.position.set(skyAnchor.x, skyAnchor.y, skyAnchor.z);
    if (space.visible) {
      if (skyAnchor) space.position.set(skyAnchor.x, skyAnchor.y, skyAnchor.z); else space.position.set(focus.x, 0, focus.z);
      if (space.userData.earth.visible) space.userData.earth.rotation.y += dt * 0.05;
      if (skyAnchor && skyAnchor.f) animateMeteors(space.userData.meteors, dt, skyAnchor);
    }
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
    setCourse,
    setPaint,
    get paintView() { return paintView; },
    setMazePreview,
    setMazePeek,
    get sunDir() { return sunDirFlat; },
    follow(x, y, z) { focus = { x, y, z }; },
    // planet stages only: where the camera really is, so the sky follows it (pass null to go back to the flat map)
    skyTo(p) { skyAnchor = p; if (!p) for (const [, sk] of skies) sk.position.set(0, 0, 0); },
    get sunWorld() { return sunWorld; },
    get earthWorld() { return earthWorld; },
    earthLight,
    // what is actually switched on right now (guards against a stage whose ground or props never get shown)
    get shown() { return { track: !!(activeTrack && trackGroups.get(activeTrack.id) && trackGroups.get(activeTrack.id).group.visible), arena: sandbox.visible, hazards: hazardView.count }; },
    hazards: hazardView,
    props: propMeshes,
    pickups: pickupMeshes,
    get trackStats() { return trackStats; },
    update,
    get mode() { return mode; },
    stats: {
      tires: arena.tires, crowd: arena.people, stands: arena.stands, towers: arena.towers,
      rocks: arena.scatter.rocks, cacti: arena.scatter.cacti, lamps: gar.lamps, sandbox: sbStats,
    },
  };
}

export { ARENA };
