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
import { createVehicle, stepVehicle, tuningFor, BOOST_COST } from './physics/arcade.js';
import { terrain as ARENA_TERRAIN, SANDBOX } from './world/arena-layout.js';
import { steerCurve, createFlick, keyboardInput, gamepadInput, mergeInputs, isBoostKey } from './core/input.js';
import { nextCamera, validCamera, cameraGoal, newCameraState } from './core/camera-modes.js';
import { createTouchControls } from './ui/touch-controls.js';
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
  scene.add(sun, sun.target);
  const spot = new THREE.SpotLight('#fff1d0', 2.6, 0, 0.7, 0.6, 0);
  spot.position.set(0, 6, 1.5);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);

  const world = createWorld(scene, { hemi, sun, spot });
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
  const camBase = { x: 0, y: 0, z: 0, ly: 0 };

  // particles (smoke / flame)
  const pool = new ParticlePool(1400);
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
  const flow = createFlow((state, prev) => {
    for (const id of SCREENS) $(id).classList.toggle('on', id === state);
    world.setMode(state);
    if (state === 'drive') enterDrive();
    else if (prev === 'drive') exitDrive();
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

  canvas.addEventListener('pointerdown', (e) => { if (flow.state === 'drive') return; dragging = true; held = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
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


  // ---- driving (Phase 1)
  const touch = createTouchControls({
    zone: $('joy-zone'), base: $('joy-base'), knob: $('joy-knob'), gas: $('btn-gas'), brake: $('btn-brake'),
  });
  const flick = createFlick();
  const keys = new Set();
  let keyBoost = false;
  let prevPadBoost = false;
  let vehicle = null;
  let tune = null;
  let camMode = validCamera(save.camera);
  let camState = null;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camFov = 40;
  let shake = 0;
  let dustCarry = 0;
  let flameCarry = 0;
  const tmp = new THREE.Vector3();

  function snapCamera() {
    const t = { x: vehicle.x, y: vehicle.y, z: vehicle.z, heading: vehicle.heading, speed: 0 };
    camState = newCameraState(t);
    const g = cameraGoal(camMode, t, camState);
    camPos.set(g.pos.x, g.pos.y, g.pos.z);
    camLook.set(g.look.x, g.look.y, g.look.z);
    camFov = g.fov;
  }

  function enterDrive() {
    const truck = TRUCKS[truckIdx];
    tune = tuningFor(truck.stats);
    const s = SANDBOX.start;
    vehicle = createVehicle(s.x, s.z, s.heading, ARENA_TERRAIN);
    $('drive').classList.toggle('lefty', !!save.leftHanded);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    snapCamera();
    truckMesh.rotation.order = 'YXZ';
    shake = 0; dustCarry = 0; flameCarry = 0;
    requestAnimationFrame(() => touch.layout());
    audio.engineStart();
  }

  function exitDrive() {
    touch.reset();
    keys.clear();
    audio.engineStop();
    vehicle = null;
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, far: 30 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(0, 0, 0);
    for (const w of truckMesh.userData.wheels) w.group.rotation.y = 0;
    truckMesh.rotation.set(0, spin, 0);
    camera.fov = 40;
    frameCamera();
  }

  $('btn-drive').addEventListener('click', () => { audio.unlock(); audio.click(); flow.send('drive'); });
  $('btn-exit').addEventListener('click', () => { audio.click(); flow.send('back'); });
  $('btn-cam').addEventListener('click', () => {
    camMode = nextCamera(camMode);
    save.camera = camMode;
    storage.save(save);
    if (vehicle) camState = newCameraState(vehicle);
    audio.click();
  });
  window.addEventListener('keydown', (e) => {
    if (flow.state !== 'drive') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat && isBoostKey(e.code)) keyBoost = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); touch.reset(); });

  function readInput() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const pad = gamepadInput(pads[0]);
    const flicked = flick.update(Math.max(touch.state.y, pad.stickY), clock);
    const padBoost = pad.boostBtn && !prevPadBoost;
    prevPadBoost = pad.boostBtn;
    const boost = flicked || keyBoost || padBoost;
    keyBoost = false;
    return mergeInputs([
      { steer: steerCurve(touch.state.x), gas: touch.state.gas ? 1 : 0, brake: touch.state.brake ? 1 : 0 },
      keyboardInput(keys),
      { steer: pad.steer, gas: pad.gas, brake: pad.brake },
      { boost },
    ], save.autoGas);
  }

  function spawnDust(n, spread, up) {
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    const count = Math.round(n * scale);
    for (const w of truckMesh.userData.wheels) {
      w.group.getWorldPosition(tmp);
      for (let i = 0; i < count; i++) {
        const dir = { x: (rand() - 0.5) * spread - vehicle.vx * 0.1, y: up, z: (rand() - 0.5) * spread - vehicle.vz * 0.1 };
        const p = makeParticle('smoke', 'dust', { x: tmp.x, y: vehicle.y + 0.12, z: tmp.z }, dir, 0.5, rand(), rand(), rand());
        p.rise = 0.25; p.size *= 1.6; p.life *= 0.7;
        pool.spawn(p);
      }
    }
  }

  function driveFrame(dt, steps) {
    const input = readInput();
    let first = true;
    for (let i = 0; i < steps; i++) {
      const events = stepVehicle(vehicle, first ? input : { ...input, boost: false }, ARENA_TERRAIN, tune, 1 / 60);
      first = false;
      for (const e of events) {
        if (e === 'boost') { shake = Math.max(shake, 0.35); audio.boost(); }
        else if (e.type === 'land') { shake = Math.max(shake, Math.min(1, e.power / 18)); spawnDust(5, 3, 1.2); audio.thump(e.power); }
        else if (e.type === 'hit' || e.type === 'wall') { shake = Math.max(shake, Math.min(0.8, e.power / 20)); audio.thump(e.power * 0.6); }
      }
    }
    const v = vehicle;
    const speedNorm = Math.min(1, Math.abs(v.f) / tune.maxSpeed);
    const boosting = v.boostT > 0;

    // engine revs follow throttle and speed
    const target = boosting ? 1 : Math.min(1, 0.22 + speedNorm * 0.55 + (input.gas ? 0.25 : 0));
    prevRev = rev;
    rev += (target - rev) * (1 - Math.exp(-dt * 6));
    decel = dt > 0 ? Math.max(0, (prevRev - rev) / dt) : 0;
    audio.engineSet(rev);

    // pose
    truckMesh.position.set(v.x, v.y, v.z);
    truckMesh.rotation.set(-v.pitch, v.heading, v.roll);
    for (const w of truckMesh.userData.wheels) {
      if (w.group.position.z > 0.3) w.group.rotation.y = -v.steerVis * 0.45;
    }
    animateTruck(truckMesh, dt, rev, clock, v.f / 0.6);

    // dust behind the wheels, flames while boosting
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    if (v.grounded) {
      const rate = (Math.abs(v.f) > 2 ? 16 * speedNorm + 10 * Math.min(1, Math.abs(v.l) / 4) : 0);
      const tk = takeSpawns(dustCarry, rate, dt, 1);
      dustCarry = tk.carry;
      if (tk.n > 0) spawnDust(Math.max(1, Math.round(tk.n / 2)), 1.2, 0.5);
    }
    if (boosting) {
      const tk = takeSpawns(flameCarry, 90, dt, scale);
      flameCarry = tk.carry;
      truckMesh.updateMatrixWorld(true);
      for (let i = 0; i < tk.n; i++) {
        tmp.set((rand() - 0.5) * 0.5, 0.55, -truckMesh.userData.length / 2);
        truckMesh.localToWorld(tmp);
        const dir = { x: -Math.sin(v.heading), y: 0.1, z: -Math.cos(v.heading) };
        pool.spawn(makeParticle('flame', 'fire', tmp, dir, 1, rand(), rand(), rand()));
      }
    }
    emitExhaust(dt);

    // camera
    const g = cameraGoal(camMode, { x: v.x, y: v.y, z: v.z, heading: v.heading, speed: v.f }, camState);
    const kp = camMode === 'iso-fixed' ? 7 : (camMode === 'chase' ? 6 : 5);
    camPos.lerp(tmp.set(g.pos.x, g.pos.y, g.pos.z), 1 - Math.exp(-kp * dt));
    camLook.lerp(tmp.set(g.look.x, g.look.y, g.look.z), 1 - Math.exp(-(kp + 2) * dt));
    camFov += (g.fov - camFov) * (1 - Math.exp(-4 * dt));
    shake *= Math.exp(-6 * dt);
    camera.position.copy(camPos);
    if (shake > 0.01) camera.position.add(tmp.set((rand() - 0.5) * shake * 0.6, (rand() - 0.5) * shake * 0.6, (rand() - 0.5) * shake * 0.6));
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }

    // light + shadow follow the truck
    sun.target.position.set(v.x, 0, v.z);
    sun.position.set(v.x + 8, 12, v.z + 5);

    // HUD
    $('nitro-fill').style.width = `${Math.round(v.nitro * 100)}%`;
    $('nitro').classList.toggle('low', v.nitro < BOOST_COST);
  }

  showTruck(truckIdx);

  const stepper = new FixedStepper(1 / 60);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;

    const { steps } = stepper.advance(dt);
    if (flow.state === 'drive' && vehicle) {
      driveFrame(dt, steps);
      world.update(dt, clock, spin);
      pool.update(dt);
      particles.update();
    } else {
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
    }

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
    get vehicle() { return vehicle; },
    get camMode() { return camMode; },
    get fov() { return camera.fov; },
    getTruck,
  };
}

window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.message);
});

start();
