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
import * as TR from './world/track.js';
import { createRace, formatTime, wrapDelta } from './core/race.js';
import { resolveCollisions } from './physics/collide.js';
import { createDriver, driverInput } from './ai/driver.js';
import { createBrawler, brawlerInput } from './ai/brawler.js';
import { ramDamage, applyDamage, blastTrucks } from './physics/damage.js';
import { createArenaTerrain, hitProp, detonate, removeProp, DEFS as PROP_DEFS } from './world/props.js';
import { createMatch, formatClock, comboMultiplier } from './core/arena-match.js';
import { DebrisPool, burst } from './fx/debris.js';
import { DebrisRenderer } from './fx/debris-render.js';
import { steerCurve, createFlick, keyboardInput, gamepadInput, mergeInputs, isBoostKey } from './core/input.js';
import { getFeel } from './vehicles/truck-feel.js';
import { createSuspension, stepSuspension } from './vehicles/suspension.js';
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
  const debris = new DebrisPool(500);
  const debrisR = new DebrisRenderer(scene, debris);
  let boomT = 0;          // explosion flash: briefly brightens the sun (no extra light, so no extra shader cost)
  let flashApplied = 0;
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
    zone: $('joy-zone'), base: $('joy-base'), knob: $('joy-knob'), gas: $('btn-gas'), brake: $('btn-brake'), nitro: $('btn-nitro'),
  });
  const flick = createFlick();
  const keys = new Set();
  let keyBoost = false;
  let prevPadBoost = false;
  let prevTouchNitro = 0;
  let feel = getFeel('crusher');
  const susp = createSuspension();
  let prevVy = 0;
  let prevF = 0;
  let vehicle = null;
  let tune = null;
  let driveMode = 'arena';      // 'arena' | 'race'
  let courseTerrain = ARENA_TERRAIN;
  let race = null;
  let match = null;
  let arenaFoes = 5;
  let arenaT = null;
  let endTimer = 0;
  let rivals = [];
  let playerAcc = 0;
  let playerPrevS = 0;
  let stuckT = 0;
  let place = 1;
  const TRACK_API = { nearest: TR.nearest, sampleAt: TR.sampleAt, length: TR.LENGTH, roadHalf: TR.ROAD_HALF };
  let goTimer = 0;
  let wrongWay = 0;
  let miniBase = null;
  const mini = $('minimap').getContext('2d');
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
    feel = getFeel(truck.id);
    tune = tuningFor(truck.stats, feel.handling, feel.sus);
    Object.assign(susp, createSuspension());
    prevVy = 0; prevF = 0;
    const racing = driveMode === 'race';
    courseTerrain = racing ? TR.terrain : ARENA_TERRAIN;
    clearRivals();
    debris.life.fill(0); debris.alive = 0;
    match = null; endTimer = 0; truckMesh.visible = true; boomT = 0;
    if (!racing) { arenaT = createArenaTerrain(); courseTerrain = arenaT; world.props.set(arenaT.props); }
    const s = racing ? TR.gridPose(4) : SANDBOX.start;
    vehicle = createVehicle(s.x, s.z, s.heading, courseTerrain, tune.ride);
    if (racing) spawnRivals(); else { spawnBrawlers(); match = createMatch({ foes: rivals.length }); }
    $('drive').classList.toggle('arena', !racing);
    playerAcc = racing ? wrapDelta(TR.START_S, TR.nearest(s.x, s.z).s) : 0;
    playerPrevS = racing ? TR.nearest(s.x, s.z).s : 0;
    stuckT = 0; place = rivals.length + 1;
    $('drive').classList.toggle('lefty', !!save.leftHanded);
    $('drive').classList.toggle('race', racing);
    $('combo').classList.remove('show');
    $('drive').classList.remove('go');
    $('results').classList.remove('show');
    $('countdown').classList.remove('show');
    $('wrongway').classList.remove('show');
    race = racing ? createRace({ laps: 3, checkpoints: TR.CHECKPOINTS, startS: TR.START_S }) : null;
    goTimer = 0; wrongWay = 0;
    if (racing) buildMinimap();
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    snapCamera();
    truckMesh.rotation.order = 'YXZ';
    shake = 0; dustCarry = 0; flameCarry = 0;
    requestAnimationFrame(() => touch.layout());
    audio.engineStart(feel.voice);
  }

  function exitDrive() {
    touch.reset();
    keys.clear();
    audio.engineStop();
    vehicle = null;
    race = null;
    clearRivals();
    match = null;
    truckMesh.visible = true;
    boomT = 0; sun.intensity -= flashApplied; flashApplied = 0;
    world.props.clear();
    debris.life.fill(0); debris.alive = 0;
    $('drive').classList.remove('race', 'go', 'arena');
    $('results').classList.remove('show');
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, far: 30 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(0, 0, 0);
    for (const w of truckMesh.userData.wheels) w.group.rotation.y = 0;
    truckMesh.rotation.set(0, spin, 0);
    truckMesh.userData.body.rotation.set(0, 0, 0);
    camera.fov = 40;
    frameCamera();
  }

  function startMode(mode) {
    audio.unlock(); audio.click();
    driveMode = mode;
    world.setCourse(mode);
    flow.send('drive');
  }
  $('btn-race').addEventListener('click', () => startMode('race'));
  $('btn-arena').addEventListener('click', () => startMode('arena'));
  $('btn-retry').addEventListener('click', () => { audio.click(); enterDrive(); });
  $('btn-results-exit').addEventListener('click', () => { audio.click(); flow.send('back'); });

  // ---- rivals
  function clearRivals() {
    for (const r of rivals) { scene.remove(r.mesh); disposeTruck(r.mesh); if (r.bar) { scene.remove(r.bar.group); } }
    rivals = [];
  }
  function spawnRivals() {
    const others = TRUCKS.filter((_, i) => i !== truckIdx);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const slots = [0, 1, 2, 3, 5];
    rivals = others.slice(0, 5).map((t, i) => {
      const f = getFeel(t.id);
      const rt = tuningFor(t.stats, f.handling, f.sus);
      const sp = TR.gridPose(slots[i]);
      const v = createVehicle(sp.x, sp.z, sp.heading, TR.terrain, rt.ride);
      const mesh = createTruckMesh(t);
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      const n = TR.nearest(sp.x, sp.z);
      return {
        truck: t, mesh, v, tune: rt,
        driver: createDriver({ skill: 0.9 + rand() * 0.08, lane: (rand() - 0.5) * 6, phase: rand() * 6, boostEvery: 7 + rand() * 6 }),
        acc: wrapDelta(TR.START_S, n.s), prevS: n.s, color: t.paint.body,
      };
    });
  }
  function rivalStep(dt) {
    const phase = race ? race.phase : 'countdown';
    for (const r of rivals) {
      const input = driverInput(r.driver, r.v, r.tune, TRACK_API, { phase, playerAcc, myAcc: r.acc }, dt);
      stepVehicle(r.v, input, TR.terrain, r.tune, dt);
    }
    const all = [vehicle, ...rivals.map((r) => r.v)];
    for (const h of resolveCollisions(all)) {
      if (h.a === 0 || h.b === 0) {
        shake = Math.max(shake, Math.min(0.7, h.power / 14));
        audio.thump(h.power * 0.9);
      }
    }
  }
  function rivalPose(dt) {
    for (const r of rivals) {
      const v = r.v;
      const n = TR.nearest(v.x, v.z);
      r.acc += wrapDelta(r.prevS, n.s); r.prevS = n.s;
      const m = r.mesh;
      m.position.set(v.x, v.y - r.tune.ride, v.z);
      m.rotation.set(-v.pitch, v.heading, v.roll);
      for (const w of m.userData.wheels) if (w.group.position.z > 0.3) w.group.rotation.y = -v.steerVis * 0.45;
      const sn = Math.min(1, Math.abs(v.f) / r.tune.maxSpeed);
      animateTruck(m, dt, 0.3 + sn * 0.6, clock, v.f / 0.6);
      const near = Math.hypot(v.x - vehicle.x, v.z - vehicle.z) < 55;
      if (near && v.grounded && v.surface !== 'asphalt' && sn > 0.25 && rand() < 0.35 * sn * (QUALITY_SCALE[save.particles] ?? 1)) spawnDust(1, 1.2, 0.5, 'dust', m, v);
      if (near && v.boostT > 0 && rand() < 0.7) {
        m.updateMatrixWorld(true);
        tmp.set((rand() - 0.5) * 0.5, 0.55, -m.userData.length / 2);
        m.localToWorld(tmp);
        pool.spawn(makeParticle('flame', 'fire', tmp, { x: -Math.sin(v.heading), y: 0.1, z: -Math.cos(v.heading) }, 1, rand(), rand(), rand()));
      }
    }
    // standings
    const me = playerAcc;
    place = 1 + rivals.filter((r) => r.acc > me).length;
    $('pos').textContent = `${place}/${rivals.length + 1}`;
  }

  // ---- arena: brawlers, destruction, explosions
  const barGeo = new THREE.PlaneGeometry(1, 1);
  function makeBar() {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true }));
    const fg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x57e36b, depthTest: false, transparent: true }));
    bg.scale.set(2.2, 0.28, 1); fg.scale.set(2.1, 0.2, 1); fg.position.z = 0.01;
    bg.renderOrder = 998; fg.renderOrder = 999;
    group.add(bg, fg);
    scene.add(group);
    return { group, fg };
  }
  function spawnBrawlers() {
    const others = TRUCKS.filter((_, i) => i !== truckIdx);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const a0 = Math.atan2(SANDBOX.start.z, SANDBOX.start.x);
    rivals = others.slice(0, arenaFoes).map((t, i) => {
      const f = getFeel(t.id);
      const rt = tuningFor(t.stats, f.handling, f.sus);
      const ang = a0 + (i + 1) * (Math.PI * 2 / (arenaFoes + 1));
      let rad = 26; let x = Math.cos(ang) * rad; let z = Math.sin(ang) * rad;
      for (let k = 0; k < 24 && courseTerrain.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3); k++) { rad -= 1.2; x = Math.cos(ang) * rad; z = Math.sin(ang) * rad; }
      const v = createVehicle(x, z, Math.atan2(-x, -z), courseTerrain, rt.ride);
      const mesh = createTruckMesh(t);
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      return { truck: t, mesh, v, tune: rt, brain: createBrawler({ aggression: 0.55 + rand() * 0.35, phase: i }), color: t.paint.body, bar: makeBar(), acc: 0, prevS: 0 };
    });
  }

  function fire(x, y, z, n, big) {
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    const count = Math.round(n * scale);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2; const sp = (0.4 + rand()) * big;
      const p = makeParticle('flame', 'fire', { x, y, z }, { x: Math.cos(a) * sp, y: 1.2 + rand() * 1.4, z: Math.sin(a) * sp }, 1.4, rand(), rand(), rand());
      p.size *= 3.2; p.life *= 2.6; p.rise = 2.2;
      pool.spawn(p);
      if (i % 2 === 0) {
        const q = makeParticle('smoke', 'black', { x, y: y + 0.4, z }, { x: Math.cos(a) * sp * 0.4, y: 1.5, z: Math.sin(a) * sp * 0.4 }, 1, rand(), rand(), rand());
        q.size *= 3.4; q.life *= 2.4; q.rise = 1.4;
        pool.spawn(q);
      }
    }
  }
  const hexNum = (c) => new THREE.Color(c).getHex();
  function shatter(prop, fromX, fromZ) {
    const def = PROP_DEFS[prop.type];
    const y = (courseTerrain.heightAt(prop.x, prop.z)) + prop.h * 0.5;
    const dx = prop.x - fromX; const dz = prop.z - fromZ; const dl = Math.hypot(dx, dz) || 1;
    const n = Math.round(def.debris * (QUALITY_SCALE[save.particles] ?? 1) + 2);
    burst(debris, { x: prop.x, y, z: prop.z, colors: def.colors.map(hexNum), count: n, speed: 6, up: 6, u: rand });
    // shove debris away from whatever hit it
    for (let i = 0; i < debris.max; i++) if (debris.life[i] > 0 && debris.age[i] === 0) { debris.vel[i * 3] += (dx / dl) * 4; debris.vel[i * 3 + 2] += (dz / dl) * 4; }
    world.props.remove(prop.id);
  }
  function allTrucks() { return [vehicle, ...rivals.map((r) => r.v)]; }

  function explode(ex) {
    const y = courseTerrain.heightAt(ex.x, ex.z) + 0.6;
    fire(ex.x, y, ex.z, ex.type === 'fuel' ? 70 : 46, ex.type === 'fuel' ? 7 : 4.5);
    boomT = 0.5;
    audio.explode();
    const d = Math.hypot(ex.x - vehicle.x, ex.z - vehicle.z);
    shake = Math.max(shake, Math.max(0.2, 1.2 - d / 45));
    const trucks = allTrucks();
    for (const h of blastTrucks(trucks, ex.x, ex.z, ex.radius, ex.power)) { if (h.wrecked) wreck(h.index); }
  }
  function destroyProp(prop, byX, byZ, byPlayer) {
    if (!courseTerrain.props || !courseTerrain.props.includes(prop)) return;
    if (prop.tier === 'blast') {
      const res = detonate(courseTerrain, prop);
      for (const q of res.destroyed) shatter(q, prop.x, prop.z);
      for (const ex of res.explosions) explode(ex);
      if (byPlayer && match) { const g = match.award(res.score); if (g) audio.chime(); }
      return;
    }
    removeProp(courseTerrain, prop);
    shatter(prop, byX, byZ);
    audio.smash();
    if (byPlayer && match) match.award(PROP_DEFS[prop.type].score);
  }
  function handleEvents(events, v, byPlayer) {
    for (const e of events) {
      if (!e || !e.obj) continue;
      if (e.type === 'smash') destroyProp(e.obj, v.x, v.z, byPlayer);
      else if (e.type === 'hit' && e.obj.tier === 'break') {
        const res = hitProp(e.obj, e.power);
        if (res === 'destroyed') destroyProp(e.obj, v.x, v.z, byPlayer);
        else if (res === 'cracked') {
          world.props.shake(e.obj.id); audio.smash();
          burst(debris, { x: e.obj.x, y: 1.2, z: e.obj.z, colors: PROP_DEFS.wall.colors.map(hexNum), count: 5, speed: 4, up: 3, u: rand });
        }
      }
    }
  }
  // index 0 = player, 1.. = rivals
  function wreck(index) {
    const isPlayer = index === 0;
    const v = isPlayer ? vehicle : rivals[index - 1].v;
    const mesh = isPlayer ? truckMesh : rivals[index - 1].mesh;
    const paint = isPlayer ? currentPaint(TRUCKS[truckIdx]) : rivals[index - 1].truck.paint;
    v.wrecked = true; v.hp = 0;
    fire(v.x, v.y + 0.5, v.z, 40, 4);
    boomT = 0.6;
    burst(debris, { x: v.x, y: v.y + 0.6, z: v.z, colors: [hexNum(paint.body), hexNum(paint.accent), 0x1c1c20, 0x1c1c20], count: Math.round(34 * (QUALITY_SCALE[save.particles] ?? 1)) + 6, speed: 9, up: 9, size: 0.42, u: rand });
    audio.explode();
    shake = Math.max(shake, isPlayer ? 1.2 : 0.8);
    mesh.visible = false;
    if (!isPlayer) { rivals[index - 1].bar.group.visible = false; if (match) match.foeWrecked(); }
    else { if (match) match.playerWrecked(); }
  }
  function arenaStep(dt) {
    const phase = match.phase;
    const trucks = allTrucks();
    rivals.forEach((r) => {
      if (r.v.wrecked) return;
      const input = brawlerInput(r.brain, r.v, trucks, SANDBOX.radius, phase, dt);
      handleEvents(stepVehicle(r.v, input, courseTerrain, r.tune, dt), r.v, false);
    });
    const live = trucks.map((v, i) => ({ v, i })).filter((q) => !q.v.wrecked);
    for (const h of resolveCollisions(live.map((q) => q.v))) {
      const ia = live[h.a].i; const ib = live[h.b].i;
      const a = trucks[ia]; const b = trucks[ib];
      const dmg = ramDamage(a, b, h.power);
      if (applyDamage(a, dmg.a)) wreck(ia);
      if (applyDamage(b, dmg.b)) wreck(ib);
      if (ia === 0 || ib === 0) { shake = Math.max(shake, Math.min(0.8, h.power / 14)); audio.thump(h.power * 0.9); }
      if (h.power > 6) { burst(debris, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.8, z: (a.z + b.z) / 2, colors: [0x9aa0aa, 0xffd60a, 0x1c1c20], count: 4, speed: 5, up: 4, size: 0.2, u: rand }); }
    }
  }
  function arenaPose(dt) {
    rivals.forEach((r) => {
      const v = r.v; const m = r.mesh;
      if (v.wrecked) return;
      m.position.set(v.x, v.y - r.tune.ride, v.z);
      m.rotation.set(-v.pitch, v.heading, v.roll);
      for (const w of m.userData.wheels) if (w.group.position.z > 0.3) w.group.rotation.y = -v.steerVis * 0.45;
      const sn = Math.min(1, Math.abs(v.f) / r.tune.maxSpeed);
      animateTruck(m, dt, 0.3 + sn * 0.6, clock, v.f / 0.6);
      const near = Math.hypot(v.x - vehicle.x, v.z - vehicle.z) < 50;
      if (near && v.grounded && sn > 0.25 && rand() < 0.4 * sn * (QUALITY_SCALE[save.particles] ?? 1)) spawnDust(1, 1.2, 0.5, 'dust', m, v);
      if (near && v.boostT > 0 && rand() < 0.7) {
        m.updateMatrixWorld(true);
        tmp.set((rand() - 0.5) * 0.5, 0.55, -m.userData.length / 2);
        m.localToWorld(tmp);
        pool.spawn(makeParticle('flame', 'fire', tmp, { x: -Math.sin(v.heading), y: 0.1, z: -Math.cos(v.heading) }, 1, rand(), rand(), rand()));
      }
      // health bar floats above the truck and faces the camera
      const frac = v.hp / v.maxHp;
      r.bar.group.position.set(v.x, v.y + 3.4, v.z);
      r.bar.group.quaternion.copy(camera.quaternion);
      r.bar.fg.scale.x = Math.max(0.001, 2.1 * frac);
      r.bar.fg.position.x = -(2.1 - r.bar.fg.scale.x) / 2;
      r.bar.fg.material.color.set(frac > 0.5 ? 0x57e36b : (frac > 0.25 ? 0xffc83a : 0xff4d4d));
    });
  }

  function respawn() {
    if (!race || !vehicle || race.phase !== 'racing') return;
    const n = TR.nearest(vehicle.x, vehicle.z);
    const p = TR.sampleAt(n.s);
    const nv = createVehicle(p.x, p.z, Math.atan2(p.tx, p.tz), TR.terrain, tune.ride);
    nv.nitro = vehicle.nitro;
    Object.assign(vehicle, nv);
    stuckT = 0;
    Object.assign(susp, createSuspension());
    snapCamera();
    audio.click();
  }
  $('btn-respawn').addEventListener('click', respawn);

  // ---- minimap (track outline drawn once, then the truck dot each frame)
  const MW = 160; const MH = 110;
  function buildMinimap() {
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    const S = TR.SAMPLES;
    const minX = Math.min(...S.map((p) => p.x)); const maxX = Math.max(...S.map((p) => p.x));
    const minZ = Math.min(...S.map((p) => p.z)); const maxZ = Math.max(...S.map((p) => p.z));
    const sc = Math.min((MW - 16) / (maxX - minX), (MH - 16) / (maxZ - minZ));
    const ox = (MW - (maxX - minX) * sc) / 2 - minX * sc;
    const oz = (MH - (maxZ - minZ) * sc) / 2 - minZ * sc;
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); S.forEach((p, i) => (i ? g.lineTo(p.x * sc + ox, MH - (p.z * sc + oz)) : g.moveTo(p.x * sc + ox, MH - (p.z * sc + oz)))); g.closePath(); };
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7; path(); g.stroke();
    g.strokeStyle = '#3b3d44'; g.lineWidth = 4.5; path(); g.stroke();
    const sp = TR.startPose();
    g.fillStyle = '#ffd60a'; g.fillRect(sp.x * sc + ox - 4, MH - (sp.z * sc + oz) - 1.5, 8, 3);
    miniBase = { canvas: c, sc, ox, oz };
  }
  function drawMinimap() {
    if (!miniBase || !vehicle) return;
    mini.clearRect(0, 0, MW, MH);
    mini.drawImage(miniBase.canvas, 0, 0);
    const px = vehicle.x * miniBase.sc + miniBase.ox;
    const pz = MH - (vehicle.z * miniBase.sc + miniBase.oz);
    for (const r of rivals) {
      mini.fillStyle = r.color; mini.strokeStyle = '#000'; mini.lineWidth = 1;
      mini.beginPath(); mini.arc(r.v.x * miniBase.sc + miniBase.ox, MH - (r.v.z * miniBase.sc + miniBase.oz), 3.2, 0, 7); mini.fill(); mini.stroke();
    }
    mini.save();
    mini.translate(px, pz);
    mini.rotate(Math.PI - vehicle.heading + Math.PI);
    mini.fillStyle = '#ff3b30'; mini.strokeStyle = '#fff'; mini.lineWidth = 1.5;
    mini.beginPath(); mini.moveTo(0, -6); mini.lineTo(4.5, 5); mini.lineTo(-4.5, 5); mini.closePath(); mini.fill(); mini.stroke();
    mini.restore();
  }
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
    const flicked = flick.update(pad.stickY, clock);
    const tapNitro = touch.state.nitroTaps !== prevTouchNitro;
    prevTouchNitro = touch.state.nitroTaps;
    const padBoost = pad.boostBtn && !prevPadBoost;
    prevPadBoost = pad.boostBtn;
    const boost = flicked || tapNitro || keyBoost || padBoost;
    keyBoost = false;
    return mergeInputs([
      { steer: steerCurve(touch.state.x), gas: touch.state.gas ? 1 : 0, brake: touch.state.brake ? 1 : 0 },
      keyboardInput(keys),
      { steer: pad.steer, gas: pad.gas, brake: pad.brake },
      { boost },
    ], save.autoGas);
  }

  function spawnDust(n, spread, up, tint = 'dust', mesh = truckMesh, veh = vehicle) {
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    const count = Math.round(n * scale);
    for (const w of mesh.userData.wheels) {
      w.group.getWorldPosition(tmp);
      for (let i = 0; i < count; i++) {
        const dir = { x: (rand() - 0.5) * spread - veh.vx * 0.1, y: up, z: (rand() - 0.5) * spread - veh.vz * 0.1 };
        const p = makeParticle('smoke', tint, { x: tmp.x, y: veh.y + 0.12, z: tmp.z }, dir, 0.5, rand(), rand(), rand());
        p.rise = 0.25; p.size *= 1.6; p.life *= 0.7;
        pool.spawn(p);
      }
    }
  }

  function showCountdown(text) {
    const el = $('countdown');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function driveFrame(dt, steps) {
    const input = readInput();
    if (race) {
      race.tick(dt);
      if (race.phase === 'countdown') { input.gas = 0; input.boost = false; input.brake = 1; }
      if (race.phase === 'finished') { input.gas = 0; input.boost = false; input.brake = 1; }
    }
    if (match) {
      match.tick(dt);
      if (match.phase !== 'fight' || vehicle.wrecked) { input.gas = 0; input.boost = false; input.brake = vehicle.wrecked ? 0 : 1; input.steer = 0; }
    }
    let first = true;
    const landings = [];
    for (let i = 0; i < steps; i++) {
      const events = stepVehicle(vehicle, first ? input : { ...input, boost: false }, courseTerrain, tune, 1 / 60);
      first = false;
      if (match) handleEvents(events, vehicle, true);
      for (const e of events) {
        if (e === 'boost') { shake = Math.max(shake, 0.35); audio.boost(); }
        else if (e.type === 'land') { landings.push(e); shake = Math.max(shake, Math.min(1, e.power / 18)); spawnDust(5, 3, 1.2); audio.thump(e.power); }
        else if (e.type === 'hit' || e.type === 'wall') { shake = Math.max(shake, Math.min(0.8, e.power / 20)); audio.thump(e.power * 0.6); }
      }
      if (rivals.length && race) rivalStep(1 / 60);
      else if (match) arenaStep(1 / 60);
    }
    const v = vehicle;
    const speedNorm = Math.min(1, Math.abs(v.f) / tune.maxSpeed);
    const boosting = v.boostT > 0;

    // engine revs follow throttle and speed
    const target = boosting ? 1 : Math.min(1, 0.22 + speedNorm * 0.55 + (input.gas ? 0.25 : 0));
    prevRev = rev;
    rev += (target - rev) * (1 - Math.exp(-dt * 6));
    decel = dt > 0 ? Math.max(0, (prevRev - rev) / dt) : 0;
    audio.engineSet(rev, input.gas);

    // pose
    truckMesh.position.set(v.x, v.y - tune.ride, v.z);
    truckMesh.rotation.set(-v.pitch, v.heading, v.roll);
    for (const w of truckMesh.userData.wheels) {
      if (w.group.position.z > 0.3) w.group.rotation.y = -v.steerVis * 0.45;
    }
    animateTruck(truckMesh, dt, rev, clock, v.f / 0.6);

    // soft monster-truck suspension: the body wallows on its wheels
    let impact = 0;
    for (const e of landings) impact = Math.max(impact, e.power);
    const accelF = dt > 0 ? (v.f - prevF) / dt : 0;
    const vyDelta = v.grounded && dt > 0 ? (v.vy - prevVy) : 0;
    stepSuspension(susp, { accelF, lat: v.f * v.yawRate, vyDelta: Math.abs(vyDelta) > 6 ? 0 : vyDelta, impact }, feel.sus, dt);
    prevF = v.f; prevVy = v.vy;
    const body = truckMesh.userData.body;
    body.position.y += susp.heave;
    body.rotation.set(susp.pitch, 0, susp.roll);

    // dust behind the wheels, flames while boosting
    const scale = QUALITY_SCALE[save.particles] ?? 1;
    if (v.grounded) {
      const asphalt = v.surface === 'asphalt';
      const rate = (Math.abs(v.f) > 2 ? (16 * speedNorm + 10 * Math.min(1, Math.abs(v.l) / 4)) * (asphalt ? 0.12 : (v.surface === 'mud' ? 1.5 : 1)) : 0);
      const tk = takeSpawns(dustCarry, rate, dt, 1);
      dustCarry = tk.carry;
      if (tk.n > 0) spawnDust(Math.max(1, Math.round(tk.n / 2)), 1.2, 0.5, asphalt ? 'gray' : 'dust');
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

    // race rules + HUD
    if (race) {
      const n = TR.nearest(v.x, v.z);
      race.update(n.s);
      playerAcc += wrapDelta(playerPrevS, n.s); playerPrevS = n.s;
      rivalPose(dt);
      if (race.phase === 'racing') {
        const wedged = input.gas > 0.5 && v.grounded && Math.abs(v.f) < 1.0;
        stuckT = wedged ? stuckT + dt : Math.max(0, stuckT - dt * 2);
        if (stuckT > 4 || v.y < TR.heightAt(v.x, v.z) - 6 || n.ad > TR.BARRIER + 2) respawn();
      }
      for (const e of race.drainEvents()) {
        if (e === 'go') { goTimer = 1.0; $('drive').classList.add('go'); showCountdown('GO'); audio.boost(); }
        else if (e === 'checkpoint') audio.click();
        else if (e === 'lap') audio.chime();
        else if (e === 'finish') {
          audio.chime();
          $('res-total').textContent = formatTime(race.finishTime);
          $('res-best').textContent = formatTime(race.best);
          $('res-pos').textContent = `${place}/${rivals.length + 1}`;
          $('results').classList.add('show');
        }
      }
      const digit = race.countdownDigit();
      if (race.phase === 'countdown' && digit > 0 && $('countdown').textContent !== String(digit)) showCountdown(String(digit));
      if (goTimer > 0) { goTimer -= dt; if (goTimer <= 0) { $('countdown').classList.remove('show'); } }
      $('lap').textContent = `${Math.min(race.lap, race.laps)}/${race.laps}`;
      $('timer').textContent = formatTime(race.phase === 'finished' ? race.finishTime : race.time);
      const along = Math.sin(v.heading) * n.tx + Math.cos(v.heading) * n.tz;
      wrongWay = (v.f > 3 && along < -0.3 && race.phase === 'racing') ? Math.min(1, wrongWay + dt) : Math.max(0, wrongWay - dt * 2);
      $('wrongway').classList.toggle('show', wrongWay > 0.5);
      drawMinimap();
    }

    // arena match rules + HUD
    if (match) {
      arenaPose(dt);
      for (const e of match.drainEvents()) {
        if (e === 'go') { goTimer = 1.0; $('drive').classList.add('go'); showCountdown('GO'); audio.boost(); }
        else if (e === 'won' || e === 'lost') endTimer = e === 'won' ? 1.2 : 1.6;
      }
      const digit = match.countdownDigit();
      if (match.phase === 'countdown' && digit > 0 && $('countdown').textContent !== String(digit)) showCountdown(String(digit));
      if (goTimer > 0) { goTimer -= dt; if (goTimer <= 0) $('countdown').classList.remove('show'); }
      if (endTimer > 0) {
        endTimer -= dt;
        if (endTimer <= 0) {
          audio.chime();
          $('results').classList.toggle('lost', !match.won);
          $('res-score').textContent = String(match.score);
          $('res-wrecked').textContent = `${match.wrecked}/${match.foes}`;
          $('res-total').textContent = formatClock(180 - match.timeLeft);
          $('results').classList.add('show');
        }
      }
      $('score').textContent = String(match.score);
      $('foes').textContent = String(match.foes - match.wrecked);
      $('atimer').textContent = formatClock(match.timeLeft);
      $('hp-fill').style.width = `${Math.round(100 * v.hp / v.maxHp)}%`;
      $('hp').classList.toggle('low', v.hp < 30);
      const mult = comboMultiplier(match.chain);
      $('combo').textContent = `x${mult}`;
      $('combo').classList.toggle('show', mult > 1 && match.chain > 0);
    }
    debris.update(dt, courseTerrain.heightAt);
    debrisR.update();
    if (boomT > 0) boomT -= dt;
    const flash = Math.max(0, boomT) * 3;
    sun.intensity += flash - flashApplied; flashApplied = flash;

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
    $('btn-nitro').classList.toggle('low', v.nitro < BOOST_COST);
    $('btn-nitro').classList.toggle('ready', v.nitro >= BOOST_COST && v.boostT <= 0);
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
    get race() { return race; },
    get rivals() { return rivals; },
    get match() { return match; },
    get arenaTerrain() { return arenaT; },
    get arenaFoes() { return arenaFoes; },
    set arenaFoes(n) { arenaFoes = n; },
    get debris() { return debris; },
    wreckAll() { rivals.forEach((r, i) => { if (!r.v.wrecked) wreck(i + 1); }); },
    destroyProp: (p) => destroyProp(p, vehicle.x, vehicle.z, true),
    get place() { return place; },
    respawn,
    get driveMode() { return driveMode; },
    get trackStats() { return world.trackStats; },
    get susp() { return susp; },
    get voice() { return feel.voice; },
    get fov() { return camera.fov; },
    getTruck,
  };
}

window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.message);
});

start();
