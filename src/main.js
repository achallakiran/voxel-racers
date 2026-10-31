// Voxel Monsters - Phase 0.5.
// Flow: rotate prompt (portrait) -> logo, then ADA Studios presents (automatic) -> title -> garage.
// The 3D scene runs behind every screen. Gameplay, physics and tracks arrive later (PLAN.md).

import * as THREE from '../lib/three.module.js';
import { TRUCKS, getTruck } from './vehicles/truck-stats.js';
import { createTruckMesh, repaintTruck, animateTruck, disposeTruck } from './vehicles/truck-mesh.js';
import { createStorage, browserBacking } from './core/storage.js';
import { FixedStepper } from './core/stepper.js';
import { createFlow, SCREENS, needsRotate } from './core/flow.js';
import { createAudio } from './audio/sfx.js';
import { ParticlePool } from './fx/particle-pool.js';
import { ParticleRenderer } from './fx/particle-render.js';
import { createWorld } from './world/scenes.js';
import { emissionRate, takeSpawns, makeParticle, QUALITY_SCALE } from './fx/emit.js';

const $ = (id) => document.getElementById(id);

const PAINT_PRESETS = [
  { body: '#d62828', accent: '#ffd60a', rim: '#cfd8dc' },
  { body: '#f77f00', accent: '#1d1d1d', rim: '#ffd60a' },
  { body: '#4cc9f0', accent: '#f8f9fa', rim: '#1d3557' },
  { body: '#80ed99', accent: '#7209b7', rim: '#1d1d1d' },
  { body: '#ff4d9d', accent: '#ffffff', rim: '#ffd1e8' },
  { body: '#2b2d42', accent: '#ff6b00', rim: '#ffb703' },
  { body: '#7b2cbf', accent: '#00f5d4', rim: '#e0aaff' },
  { body: '#f8f9fa', accent: '#d62828', rim: '#6c757d' },
  { body: '#ffd60a', accent: '#1d1d1d', rim: '#cfd8dc' },
];

const ICONS = {
  speed: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
  weight: '<svg viewBox="0 0 24 24"><path d="M5 20h14l-2-9H7z"/><path d="M9 11a3 3 0 1 1 6 0"/></svg>',
};

function fatal(msg) {
  const el = $('fatal');
  el.textContent = msg;
  el.hidden = false;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function start() {
  if (!webglAvailable()) {
    fatal('WebGL is not available on this device or browser.');
    return;
  }

  const storage = createStorage(browserBacking());
  const save = storage.load();
  const audio = createAudio();
  audio.setVolume(save.volume);

  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#ffd2a0', '#8a4b2a', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb877', 2.5);
  sun.position.set(8, 6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
  scene.add(sun);
  const spot = new THREE.SpotLight('#fff1d0', 2.6, 0, 0.7, 0.6, 0);
  spot.position.set(0, 6, 1.5);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);

  const world = createWorld(scene, { hemi, sun, spot });
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
  const camBase = { x: 0, y: 0, z: 0, ly: 0 };

  // particles (smoke / flame)
  const pool = new ParticlePool(700);
  const particles = new ParticleRenderer(scene, pool);
  const rand = () => Math.random();

  // ---- state
  let truckIdx = Math.max(0, TRUCKS.findIndex((t) => t.id === save.truckId));
  let truckMesh = null;
  let spin = 0.6;
  let dragging = false;
  let lastX = 0;
  let held = false;       // finger/mouse down = rev the engine
  let rev = 0.25;
  let prevRev = rev;
  let decel = 0;
  let clock = 0;
  let frames = 0;
  let drawn = 0;          // frames actually rendered (the scene is skipped behind opaque screens)
  let truckX = 0;
  let truckY = 0;         // garage lifts the truck onto the turntable         // title shifts the truck right to make room for the logo
  const worldPos = new THREE.Vector3();
  const worldDir = new THREE.Vector3();

  // ---- flow / screens
  const flow = createFlow((state) => {
    for (const id of SCREENS) $(id).classList.toggle('on', id === state);
    world.setMode(state === 'garage' ? 'garage' : 'outdoor');
    if (state === 'intro') {
      const intro = $('intro');
      intro.classList.remove('play');
      void intro.offsetWidth; // restart CSS animation
      intro.classList.add('play');
      introTimer = setTimeout(() => flow.send('done'), 6700);
    } else {
      clearTimeout(introTimer);
    }
  });
  let introTimer = 0;

  function tryLandscape() {
    // fullscreen + orientation lock only on touch devices that support it (Android Chrome etc.)
    try {
      if (!window.matchMedia('(pointer: coarse)').matches) return;
      const el = document.documentElement;
      const p = el.requestFullscreen && !document.fullscreenElement ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      const lock = () => { try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch { /* unsupported */ } };
      if (p && p.then) p.then(lock, () => {}); else lock();
    } catch { /* ignored */ }
  }

  // A tap is the first chance to unlock sound / fullscreen (browsers require a gesture).
  $('intro').addEventListener('pointerdown', () => { audio.unlock(); flow.send('skip'); });
  $('btn-play').addEventListener('click', () => { audio.unlock(); tryLandscape(); audio.rev(); flow.send('play'); });
  $('btn-back').addEventListener('click', () => { audio.click(); flow.send('back'); });

  // ---- trucks
  function currentPaint(truck) {
    return { ...truck.paint, ...(save.paints[truck.id] || {}) };
  }

  function renderStats(truck) {
    const rows = ['speed', 'grip', 'weight'].map((k) => {
      const pips = Array.from({ length: 10 }, (_, i) => `<span class="pip${i < truck.stats[k] ? ' on' : ''}"></span>`).join('');
      return `<div class="stat">${ICONS[k]}<div class="pips">${pips}</div></div>`;
    });
    $('truck-stats').innerHTML = rows.join('');
  }

  function frameCamera() {
    const len = truckMesh ? truckMesh.userData.length : 3.7;
    const h = truckMesh ? truckMesh.userData.height : 2.2;
    const aspect = camera.aspect;
    let dist = Math.max(5.2, len * 1.5, h * 3.0);
    if (aspect < 1) dist = dist / aspect * 0.62;
    Object.assign(camBase, { x: 0, y: dist * 0.42, z: dist, ly: Math.max(0.9, h * 0.52) });
    camera.position.set(0, camBase.y, camBase.z);
    camera.lookAt(0, camBase.ly, 0);
    camera.updateProjectionMatrix();
  }

  function showTruck(idx) {
    truckIdx = (idx + TRUCKS.length) % TRUCKS.length;
    const truck = TRUCKS[truckIdx];
    if (truckMesh) { scene.remove(truckMesh); disposeTruck(truckMesh); }
    truckMesh = createTruckMesh(truck, save.paints[truck.id]);
    truckMesh.position.x = truckX;
    scene.add(truckMesh);
    $('truck-name').textContent = truck.name;
    $('truck-blurb').textContent = truck.blurb;
    renderStats(truck);
    frameCamera();
    save.truckId = truck.id;
    storage.save(save);
  }

  function cyclePaint() {
    const truck = TRUCKS[truckIdx];
    const cur = currentPaint(truck);
    const i = PAINT_PRESETS.findIndex((p) => p.body === cur.body);
    const next = PAINT_PRESETS[(i + 1) % PAINT_PRESETS.length];
    save.paints[truck.id] = { ...next };
    repaintTruck(truckMesh, next);
    storage.save(save);
    audio.click();
  }

  $('btn-prev').addEventListener('click', () => { audio.click(); showTruck(truckIdx - 1); });
  $('btn-next').addEventListener('click', () => { audio.click(); showTruck(truckIdx + 1); });
  $('btn-paint').addEventListener('click', cyclePaint);

  canvas.addEventListener('pointerdown', (e) => { dragging = true; held = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    spin += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
  });
  const endDrag = () => { dragging = false; held = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (flow.state !== 'garage') return;
    if (e.key === 'ArrowLeft') showTruck(truckIdx - 1);
    if (e.key === 'ArrowRight') showTruck(truckIdx + 1);
  });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frameCamera();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // ---- emitters -> particles
  function emitExhaust(dt) {
    if (!truckMesh) return;
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    truckMesh.updateMatrixWorld(true);
    const body = truckMesh.userData.body;
    for (const e of truckMesh.userData.emitters) {
      const rate = emissionRate(e.kind, rev, decel);
      const { n, carry } = takeSpawns(e.carry, rate, dt, scale);
      e.carry = carry;
      if (n === 0) continue;
      worldPos.copy(e.local);
      body.localToWorld(worldPos);
      worldDir.set(e.dir.x, e.dir.y, e.dir.z).applyQuaternion(truckMesh.quaternion);
      const dir = { x: worldDir.x, y: worldDir.y, z: worldDir.z };
      for (let i = 0; i < n; i++) {
        pool.spawn(makeParticle(e.kind, e.tint, worldPos, dir, rev, rand(), rand(), rand()));
      }
    }
  }

  showTruck(truckIdx);

  const stepper = new FixedStepper(1 / 60);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;

    const { steps } = stepper.advance(dt);
    for (let i = 0; i < steps; i++) {
      if (!dragging) spin += 0.35 / 60;
    }

    // engine revs: idle, periodic show-off burst, or held by the player
    const cycle = clock % 6.5;
    const target = held ? 1 : (cycle > 4.2 && cycle < 5.4 ? 1 : 0.28 + 0.12 * Math.sin(clock * 1.7));
    prevRev = rev;
    rev += (target - rev) * (1 - Math.exp(-dt * 5));
    decel = dt > 0 ? Math.max(0, (prevRev - rev) / dt) : 0;

    // title shifts the truck right to make room for the logo (landscape only)
    const wantX = flow.state === 'title' && camera.aspect > 1.2 ? 1.25 : 0;
    truckX += (wantX - truckX) * (1 - Math.exp(-dt * 4));
    const wantY = flow.state === 'garage' ? 0.1 : 0;
    truckY += (wantY - truckY) * (1 - Math.exp(-dt * 6));
    truckMesh.position.set(truckX, truckY, 0);
    truckMesh.rotation.y = spin;

    // gentle camera sway on the title, steady in the garage
    const sway = flow.state === 'garage' ? 0 : Math.sin(clock * 0.35) * 0.9;
    camera.position.x += (sway - camera.position.x) * (1 - Math.exp(-dt * 3));
    camera.lookAt(0, camBase.ly, 0);
    world.update(dt, clock, spin);

    animateTruck(truckMesh, dt, rev, clock);
    emitExhaust(dt);
    pool.update(dt);
    particles.update();

    // the intro is fully opaque: skip drawing the 3D scene behind it
    if (flow.state !== 'boot' && flow.state !== 'intro') { renderer.render(scene, camera); drawn++; }
    frames++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // The intro starts by itself once the phone is in landscape (portrait shows the rotate prompt).
  function maybeStart() {
    if (flow.state === 'boot' && !needsRotate(window.innerWidth, window.innerHeight)) flow.send('ready');
  }
  window.addEventListener('resize', maybeStart);
  window.addEventListener('orientationchange', maybeStart);
  maybeStart();

  // Handle for tests / debugging
  window.__voxelRacers = {
    ready: true,
    trucks: TRUCKS.length,
    world: world.stats,
    get worldMode() { return world.mode; },
    flow,
    get frames() { return frames; },
    get drawn() { return drawn; },
    get voxels() { return truckMesh.userData.voxelCount; },
    get truckId() { return TRUCKS[truckIdx].id; },
    get parts() { return truckMesh.userData.rig.map((r) => r.id); },
    get emitters() { return truckMesh.userData.emitters.length; },
    get wheels() { return truckMesh.userData.wheels.length; },
    get particlesAlive() { return pool.alive; },
    get rev() { return rev; },
    getTruck,
  };
}

window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.message);
});

start();
