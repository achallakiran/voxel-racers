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
import { installPlanetWarp, PLANET_U, planetPoint, planetFrame, planetDir } from './world/planet.js';
installPlanetWarp(THREE);
import { tickHazards } from './physics/hazards.js';
import { createVehicle, stepVehicle, tuningFor, tickPickups, BOOST_COST, RACE_START_NITRO, SUS_MODES } from './physics/arcade.js';
import { terrain as ARENA_TERRAIN, SANDBOX } from './world/arena-layout.js';
import { HEADING as HEADING_OF, tileSeen } from './world/maze.js';
import { STAGES as TRACKS, getTrackById, validTrack } from './world/tracks.js';
import { createRace, formatTime, wrapDelta, PREVIEW_TIME, MAP_PEEK } from './core/race.js';
import { resolveCollisions } from './physics/collide.js';
import { createDriver, driverInput, DIFFICULTIES } from './ai/driver.js';
import { createIntro } from './ui/intro.js';
import { createBrawler, brawlerInput } from './ai/brawler.js';
import { ramDamage, applyDamage, blastTrucks } from './physics/damage.js';
import { createArenaTerrain, hitProp, detonate, removeProp, DEFS as PROP_DEFS } from './world/props.js';
import { createMatch, formatClock, comboMultiplier } from './core/arena-match.js';
import { DebrisPool, burst } from './fx/debris.js';
import { DebrisRenderer } from './fx/debris-render.js';
import { steerCurve, createFlick, keyboardInput, gamepadInput, mergeInputs, isBoostKey } from './core/input.js';
import { getFeel } from './vehicles/truck-feel.js';
import { createSuspension, stepSuspension } from './vehicles/suspension.js';
import { fellOff, lastCheckpointS, FALL_PENALTY } from './core/fall.js';
import { createExplorer, explorerInput } from './ai/explorer.js';
import { nextCamera, validCamera, cameraGoal, newCameraState, mazeCameraGoal, mazePreviewGoal } from './core/camera-modes.js';
import { createTouchControls } from './ui/touch-controls.js';
import { installNoZoom } from './ui/no-zoom.js';
installNoZoom();
import { boltPath, chainTargets, chargeTick, canZap, ZAP_COST, ZAP_DAMAGE, ZAP_SLOW } from './fx/lightning.js';
import { LightningRenderer } from './fx/lightning-render.js';
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
  const planetTmp = [0, 0, 0]; const planetLook = [0, 0, 0];
  const camBase = { x: 0, y: 0, z: 0, ly: 0 };

  // particles (smoke / flame)
  const pool = new ParticlePool(1400);
  const lightning = new LightningRenderer(scene);
  let zapCharge = 1;
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
      intro.start();
    } else {
      intro.stop();
    }
    // title bed: a grungy drone while the title is up (needs sound unlocked by a tap)
    if (state === 'title') audio.titleBed(true); else audio.titleBed(false);
  });
  const intro = createIntro({ el: $('intro'), canvas: $('zap'), audio, onDone: () => flow.send('done') });

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
  // First tap on the intro only unlocks sound (and starts it from the current moment); a tap after that skips.
  $('intro').addEventListener('pointerdown', () => {
    const was = audio.ready; audio.unlock();
    if (!was && audio.ready) intro.resumeAudio(); else { intro.skip(); flow.send('skip'); }
  });
  // any tap on the title unlocks sound and starts the title bed
  document.addEventListener('pointerdown', () => { audio.unlock(); if (flow.state === 'title') audio.titleBed(true); }, { passive: true });
  $('btn-play').addEventListener('click', () => { audio.unlock(); tryLandscape(); audio.grungeHit(); audio.rev(); flow.send('play'); });
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
    showSus();
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
  // suspension mode is a garage choice, saved per truck (soft / normal / stiff)
  function susMode(truck) { const m = save.sus && save.sus[truck.id]; return SUS_MODES.includes(m) ? m : 'normal'; }
  function showSus() { $('btn-sus').dataset.mode = susMode(TRUCKS[truckIdx]); }
  function cycleSus() {
    const truck = TRUCKS[truckIdx];
    const next = SUS_MODES[(SUS_MODES.indexOf(susMode(truck)) + 1) % SUS_MODES.length];
    save.sus = { ...(save.sus || {}), [truck.id]: next };
    storage.save(save);
    showSus();
    audio.click();
  }
  $('btn-sus').addEventListener('click', cycleSus);
  // rival difficulty (easy / normal / hard), shown as 1-3 dots on a gauge icon
  const diffNow = () => (DIFFICULTIES.includes(save.difficulty) ? save.difficulty : 'normal');
  function showDiff() { $('btn-diff').dataset.mode = diffNow(); }
  $('btn-diff').addEventListener('click', () => {
    save.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(diffNow()) + 1) % DIFFICULTIES.length];
    storage.save(save); showDiff(); audio.click();
  });
  showDiff();

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
  const viewPos = new THREE.Vector3(); const viewLook = new THREE.Vector3();
  let howtoOpen = false;
  function setHowto(on) { howtoOpen = on; $('howto').classList.toggle('show', on); if (!on && !save.seenMazeHowto) { save.seenMazeHowto = true; storage.save(save); } }
  let ovK = 0;                       // labyrinth overview blend 0..1
  let playerAcc = 0;
  let playerPrevS = 0;
  let stuckT = 0;
  let place = 1;
  let TR = getTrackById(save.track);
  let TRACK_API = null;
  const apiFor = (T) => ({ nearest: T.nearest, sampleAt: T.sampleAt, length: T.LENGTH, roadHalf: T.ROAD_HALF, laneAt: T.laneAt, finishS: T.FINISH_S });
  TRACK_API = apiFor(TR);
  function selectTrack(id) {
    TR = getTrackById(id);
    TRACK_API = apiFor(TR);
    save.track = TR.id;
    storage.save(save);
    drawTrackThumb();
    showTrackName();
  }
  function showTrackName() {
    const el = $('trk-name');
    el.querySelector('b').textContent = TR.name;
    el.querySelector('span').textContent = `${TRACKS.indexOf(TR) + 1} / ${TRACKS.length}`;
  }
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
  let nitroPunch = 0; let pitT = 0;
  const scaleNow = () => QUALITY_SCALE[save.particles] ?? 1;
  const tmp = new THREE.Vector3();

  let peekOn = false; let peekSync = 0;       // labyrinth overview map on screen?
  let mazeZoom = 0;                      // labyrinth camera: 0 = close, 1 = wide (the camera icon toggles it)
  let explored = new Set(); let trail = [];   // labyrinth fog-of-war: cells driven through, and a breadcrumb trail
  function snapCamera() {
    const t = { x: vehicle.x, y: vehicle.y, z: vehicle.z, heading: vehicle.heading, speed: 0 };
    camState = newCameraState(t);
    const g = TR.maze && driveMode === 'race' ? mazeCameraGoal(t, mazeZoom) : cameraGoal(camMode, t, camState);
    camPos.set(g.pos.x, g.pos.y, g.pos.z);
    camLook.set(g.look.x, g.look.y, g.look.z);
    camFov = g.fov;
  }

  function enterDrive() {
    const truck = TRUCKS[truckIdx];
    feel = getFeel(truck.id);
    tune = tuningFor(truck.stats, feel.handling, feel.sus, susMode(truck));
    Object.assign(susp, createSuspension());
    prevVy = 0; prevF = 0;
    const racing = driveMode === 'race';
    courseTerrain = racing ? TR.freshTerrain() : ARENA_TERRAIN;
    world.hazards.set(racing ? courseTerrain.hazards : []);
    if (racing) { world.props.set(courseTerrain.props); world.pickups.set(courseTerrain.pickups || []); } else world.pickups.clear();
    clearRivals();
    debris.life.fill(0); debris.alive = 0;
    match = null; endTimer = 0; truckMesh.visible = true; boomT = 0;
    if (!racing) { arenaT = createArenaTerrain(); courseTerrain = arenaT; world.props.set(arenaT.props); }
    const s = racing ? TR.gridPose(4) : SANDBOX.start;
    vehicle = createVehicle(s.x, s.z, s.heading, courseTerrain, tune.ride);
    if (racing) vehicle.nitro = RACE_START_NITRO;
    if (racing) spawnRivals(); else { spawnBrawlers(); match = createMatch({ foes: rivals.length }); }
    $('drive').classList.toggle('arena', !racing);
    playerAcc = racing ? wrapDelta(TR.START_S, TR.nearest(s.x, s.z).s) : 0;
    playerPrevS = racing ? TR.nearest(s.x, s.z).s : 0;
    stuckT = 0; place = rivals.length + 1;
    zapCharge = 1; lightning.clear();
    $('drive').classList.toggle('lefty', !!save.leftHanded);
    $('drive').classList.toggle('race', racing);
    $('combo').classList.remove('show');
    $('drive').classList.remove('go');
    $('results').classList.remove('show');
    $('countdown').classList.remove('show');
    $('wrongway').classList.remove('show');
    race = racing ? createRace({ laps: TR.OPEN ? 1 : 3, checkpoints: TR.CHECKPOINTS, startS: TR.START_S, finishS: TR.FINISH_S, preview: TR.maze ? PREVIEW_TIME : 0, map: TR.maze ? MAP_PEEK : null }) : null;
    const maze = racing && !!TR.maze;
    $('drive').classList.toggle('maze', maze);
    $('drive').classList.toggle('preview', maze);
    world.setMazePreview(maze); peekOn = false;
    explored = new Set(); trail = []; mazeZoom = 0;
    howtoOpen = maze && !save.seenMazeHowto; $('howto').classList.toggle('show', howtoOpen); $('drive').classList.remove('peek'); ovK = 0;
    camera.far = maze ? 700 : 220; camera.near = 0.1; camera.updateProjectionMatrix();
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
    lightning.clear();
    world.pickups.clear();
    vehicle = null;
    race = null;
    clearRivals();
    match = null;
    truckMesh.visible = true;
    boomT = 0; sun.intensity -= flashApplied; flashApplied = 0;
    world.props.clear();
    debris.life.fill(0); debris.alive = 0;
    $('drive').classList.remove('race', 'go', 'arena', 'maze', 'preview', 'peek', 'fell'); fellT = 0;
    world.setMazePreview(false); peekOn = false; camera.far = 220; camera.near = 0.1; ovK = 0; howtoOpen = false; $('howto').classList.remove('show'); camera.updateProjectionMatrix();
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
    world.setCourse(mode, TR);
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
  const RIVAL_STYLES = ['aggressive', 'steady', 'risky', 'defensive', 'steady'];
  let playerLat = 0;
  function spawnRivals() {
    const others = TRUCKS.filter((_, i) => i !== truckIdx);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const slots = [0, 1, 2, 3, 5];
    rivals = others.slice(0, 5).map((t, i) => {
      const f = getFeel(t.id);
      const rt = tuningFor(t.stats, f.handling, f.sus, SUS_MODES[Math.floor(rand() * 3)]);
      const sp = TR.gridPose(slots[i]);
      const v = createVehicle(sp.x, sp.z, sp.heading, courseTerrain, rt.ride);
      v.nitro = RACE_START_NITRO;
      const mesh = createTruckMesh(t);
      mesh.rotation.order = 'YXZ';
      scene.add(mesh);
      const n = TR.nearest(sp.x, sp.z);
      return {
        truck: t, mesh, v, tune: rt,
        driver: TR.maze ? createExplorer({ seed: 101 + i * 37 + t.id.length, style: i % 2 ? 'aggressive' : 'steady', compass: TR.maze.exit })
          : createDriver({ skill: 0.9 + rand() * 0.08, lane: (rand() - 0.5) * 6, phase: rand() * 6, boostEvery: 4 + rand() * 3, style: RIVAL_STYLES[i % RIVAL_STYLES.length] }),
        acc: wrapDelta(TR.START_S, n.s), prevS: n.s, color: t.paint.body,
      };
    });
  }
  function rivalStep(dt) {
    playerLat = TR.nearest(vehicle.x, vehicle.z).d;
    const phase = race ? race.phase : 'countdown';
    for (const r of rivals) {
      const input = TR.maze
        ? explorerInput(r.driver, r.v, r.tune, TR.maze.cellAt, TR.maze.cellCenter, (a, b) => TR.maze.sides(a, b).map((s) => s.k), dt, { phase, finished: r.finished })
        : driverInput(r.driver, r.v, r.tune, TRACK_API, { phase, difficulty: save.difficulty, props: courseTerrain.props, pickups: courseTerrain.pickups, playerAcc, myAcc: r.acc, gapAhead: (r.acc - playerAcc) * TR.LENGTH, playerLat: playerLat }, dt);
      handleEvents(stepVehicle(r.v, input, courseTerrain, r.tune, dt), r.v, false);
      r.pitT = inPit(r.v) ? (r.pitT || 0) + dt : 0;
      if (fellOff(TR, r.v, TR.nearest(r.v.x, r.v.z))) {            // a rival over the edge loses the same: back on the deck, no nitro
        const p = safePose(Math.max(0, TR.nearest(r.v.x, r.v.z).s - 0.05), 0);
        const nv = createVehicle(p.x, p.z, p.heading, courseTerrain, r.tune.ride); nv.nitro = 0; Object.assign(r.v, nv); r.pitT = 0;
      }
      if (r.pitT > 1.2) {
        const p = safePose(TR.nearest(r.v.x, r.v.z).s, inLava(r.v) ? 22 : 10);
        const nv = createVehicle(p.x, p.z, p.heading, courseTerrain, r.tune.ride);
        nv.nitro = r.v.nitro; Object.assign(r.v, nv); r.pitT = 0;
      }
    }
    const all = [vehicle, ...rivals.map((r) => r.v)];
    for (const h of resolveCollisions(all)) {
      if (h.a === 0 || h.b === 0) {
        shake = Math.max(shake, Math.min(0.7, h.power / 14));
        audio.thump(h.power * 0.9);
        if (h.power > 4) zap(vehicle);
      }
    }
  }
  function rivalPose(dt) {
    for (const r of rivals) {
      const v = r.v;
      const n = TR.nearest(v.x, v.z);
      if (TR.OPEN) {
        // sprint: crossing the finish line freezes progress just past the player's finishing value, so earlier finishers stay ahead
        if (!r.finished) { r.acc += wrapDelta(r.prevS, n.s); if (n.s >= TR.FINISH_S) { r.finished = true; r.acc = TR.FINISH_S - TR.START_S + 1e-4; } }
        r.prevS = n.s;
      } else { r.acc += wrapDelta(r.prevS, n.s); r.prevS = n.s; }
      const m = r.mesh;
      m.position.set(v.x, v.y - (v.loop ? 0 : r.tune.ride), v.z);
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

  function explode(ex, ownerIdx = -1) {
    const y = courseTerrain.heightAt(ex.x, ex.z) + 0.6;
    fire(ex.x, y, ex.z, ex.type === 'fuel' ? 70 : 46, ex.type === 'fuel' ? 7 : 4.5);
    boomT = 0.5;
    audio.explode();
    const d = Math.hypot(ex.x - vehicle.x, ex.z - vehicle.z);
    shake = Math.max(shake, Math.max(0.2, 1.2 - d / 45));
    const trucks = allTrucks();
    for (const h of blastTrucks(trucks, ex.x, ex.z, ex.radius, ex.power, ownerIdx)) { if (h.wrecked) wreck(h.index); }
  }
  function destroyProp(prop, byX, byZ, byPlayer) {
    if (!courseTerrain.props || !courseTerrain.props.includes(prop)) return;
    if (prop.tier === 'blast') {
      const res = detonate(courseTerrain, prop);
      for (const q of res.destroyed) shatter(q, prop.x, prop.z);
      for (const ex of res.explosions) explode(ex, byPlayer ? 0 : -1);
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
      if (byPlayer && e && e.type === 'pad') { audio.boost(); shake = Math.max(shake, 0.3); zapCharge = Math.min(1, zapCharge + 0.12); }
      if (byPlayer && e && e.type === 'pickup') { audio.click(); shake = Math.max(shake, 0.15); zapCharge = Math.min(1, zapCharge + 0.3); }
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
  // Volt's chain lightning: arcs from the truck to the nearest rivals and on to the next (arena: damage; race: slows them)
  const isVolt = () => !!vehicle && TRUCKS[truckIdx].id === 'volt';
  function zap(fromV) {
    if (!isVolt() || !canZap(zapCharge)) return false;
    const cand = rivals.map((r, i) => ({ id: i, x: r.v.x, y: r.v.y, z: r.v.z, r })).filter((c) => !c.r.v.wrecked);
    const chain = chainTargets(fromV, cand);
    if (!chain.length) return false;
    zapCharge -= ZAP_COST;
    let prev = { x: fromV.x, y: fromV.y + 1.4, z: fromV.z };
    for (const c of chain) {
      const to = { x: c.x, y: c.y + 1.0, z: c.z };
      lightning.add(boltPath(prev, to, rand), 0.34, 0.22);
      prev = to;
      const v = c.r.v;
      if (match) { if (applyDamage(v, ZAP_DAMAGE)) wreck(c.id + 1); }
      else { v.vx *= ZAP_SLOW; v.vz *= ZAP_SLOW; }
      burst(debris, { x: c.x, y: c.y + 1, z: c.z, colors: [0x7df9ff, 0xffffff, 0x2cf0ff], count: Math.round(8 * (QUALITY_SCALE[save.particles] ?? 1)) + 2, speed: 6, up: 4, size: 0.16, u: rand });
    }
    audio.zap(); shake = Math.max(shake, 0.55);
    return true;
  }
  // decorative arcs crackling off the truck (no target needed)
  function crackle(v, n = 2, reach = 3.6) {
    for (let i = 0; i < n; i++) {
      const a = { x: v.x, y: v.y + 1.4, z: v.z };
      const b = { x: v.x + (rand() - 0.5) * 2 * reach, y: v.y + 0.3 + rand() * 2.2, z: v.z + (rand() - 0.5) * 2 * reach };
      lightning.add(boltPath(a, b, rand, 6, 0.7), 0.2, 0.12);
    }
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
    const pre = live.map((q) => ({ vx: q.v.vx, vz: q.v.vz }));
    for (const h of resolveCollisions(live.map((q) => q.v))) {
      const ia = live[h.a].i; const ib = live[h.b].i;
      const a = trucks[ia]; const b = trucks[ib];
      const dmg = ramDamage(a, b, h.power, { a: pre[h.a], b: pre[h.b] });
      if (applyDamage(a, dmg.a)) wreck(ia);
      if (applyDamage(b, dmg.b)) wreck(ib);
      if (ia === 0 || ib === 0) { shake = Math.max(shake, Math.min(0.8, h.power / 14)); audio.thump(h.power * 0.9); if (h.power > 4) zap(vehicle); }
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

  // dropped into a trench: the truck is put back on the safe lane a few metres before the lip
  const inLava = (v) => !v.loop && v.grounded && v.surface === 'lava';
  const inPit = (v) => !v.loop && v.grounded && (inLava(v) || courseTerrain.heightAt(v.x, v.z) < TR.sampleAt(TR.nearest(v.x, v.z).s).y - 2);
  function safePose(s, back) {
    const q = s - back / TR.LENGTH;
    const p = TR.sampleAt(q);
    const lane = TR.laneAt ? TR.laneAt(q, 'safe') : { off: null };
    const off = lane.off === null ? 0 : lane.off;
    return { x: p.x + p.tz * off, z: p.z - p.tx * off, heading: Math.atan2(p.tx, p.tz) };
  }
  // labyrinth: wedged -> back to the middle of the cell you are in, facing the way out that is closest to where you were pointing.
  // It never moves you along the route, so it gives nothing away.
  function mazeUnstick(v) {
    const M = TR.maze; const c = M.cellAt(v.x, v.z); const ctr = M.cellCenter(c.r, c.c);
    let best = null; let bd = 9;
    for (const s of M.sides(c.r, c.c)) {
      const h = HEADING_OF[s.k]; const d = Math.abs(Math.atan2(Math.sin(h - v.heading), Math.cos(h - v.heading)));
      if (d < bd) { bd = d; best = h; }
    }
    return { x: ctr.x, z: ctr.z, heading: best === null ? v.heading : best };
  }
  function respawn() {
    if (!race || !vehicle || race.phase !== 'racing') return;
    const n = TR.nearest(vehicle.x, vehicle.z);
    const p = TR.maze ? mazeUnstick(vehicle) : safePose(n.s, inLava(vehicle) ? 22 : inPit(vehicle) ? 10 : 0);
    const nv = createVehicle(p.x, p.z, p.heading, courseTerrain, tune.ride);
    nv.nitro = vehicle.nitro;
    Object.assign(vehicle, nv);
    stuckT = 0;
    Object.assign(susp, createSuspension());
    snapCamera();
    audio.click();
  }
  // over the edge of a bridge: back on the deck at the last checkpoint, nitro gone, three seconds on the clock
  let fellT = 0;
  function fallRespawn() {
    if (!race || !vehicle || race.phase !== 'racing') return;
    const p = safePose(lastCheckpointS(race), 0);
    const nv = createVehicle(p.x, p.z, p.heading, courseTerrain, tune.ride);
    nv.nitro = 0;
    Object.assign(vehicle, nv);
    stuckT = 0; pitT = 0;
    Object.assign(susp, createSuspension());
    race.penalty(FALL_PENALTY);
    fellT = 1.4; $('drive').classList.add('fell');
    snapCamera(); audio.thump(8);
  }
  $('btn-respawn').addEventListener('click', respawn);

  // ---- track picker thumbnail: the outline, loops (yellow rings) and wall passages (red)
  const thumb = $('trk-thumb');
  function drawTrackThumb() {
    const g = thumb.getContext('2d');
    const W = thumb.width; const H = thumb.height;
    g.clearRect(0, 0, W, H);
    if (TR.maze) {                       // a labyrinth glyph (not the real map: that is for the preview)
      g.strokeStyle = '#6fbf6a'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = W / 2; const cy = H / 2;
      for (let k = 0; k < 4; k++) {
        const r = 10 + k * 11; const gap = k % 2 ? 0 : 1; g.beginPath();
        const a0 = 0.5 + k * 1.6; g.arc(cx, cy, r, a0, a0 + Math.PI * 2 - 0.9 - gap * 0.3); g.stroke();
      }
      g.fillStyle = '#4cc9f0'; g.beginPath(); g.arc(cx, cy, 3.6, 0, 7); g.fill();
      return;
    }
    const S = TR.SAMPLES;
    const minX = Math.min(...S.map((p) => p.x)); const maxX = Math.max(...S.map((p) => p.x));
    const minZ = Math.min(...S.map((p) => p.z)); const maxZ = Math.max(...S.map((p) => p.z));
    const sc = Math.min((W - 22) / (maxX - minX), (H - 22) / (maxZ - minZ));
    const ox = (W - (maxX - minX) * sc) / 2 - minX * sc; const oz = (H - (maxZ - minZ) * sc) / 2 - minZ * sc;
    const pt = (p) => [p.x * sc + ox, H - (p.z * sc + oz)];
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = (from, to) => { g.beginPath(); for (let i = 0; i <= 80; i++) { const [x, y] = pt(TR.sampleAt(from + (to - from) * i / 80)); if (i) g.lineTo(x, y); else g.moveTo(x, y); } };
    g.strokeStyle = '#fff'; g.lineWidth = 7; path(0, 1); g.stroke();
    g.strokeStyle = '#3b3d44'; g.lineWidth = 4.5; path(0, 1); g.stroke();
    g.strokeStyle = '#ff6b5e'; g.lineWidth = 4.5;
    for (const z of TR.LANES) { if (z.limit < 4 && z.to > z.from) { path(z.from, Math.min(z.to, z.from + 0.08)); g.stroke(); } }
    for (const L of TR.LOOPS) { const [x, y] = pt(TR.sampleAt(L.s)); g.strokeStyle = '#ffd60a'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 6, 0, 7); g.stroke(); }
    const [sx, sy] = pt(TR.startPose());
    g.fillStyle = '#fff'; g.fillRect(sx - 4, sy - 1.5, 8, 3);
  }
  $('trk-prev').addEventListener('click', () => { audio.click(); selectTrack(TRACKS[(TRACKS.indexOf(TR) + TRACKS.length - 1) % TRACKS.length].id); });
  $('trk-next').addEventListener('click', () => { audio.click(); selectTrack(TRACKS[(TRACKS.indexOf(TR) + 1) % TRACKS.length].id); });
  drawTrackThumb(); showTrackName();

  // ---- minimap (track outline drawn once, then the truck dot each frame)
  let MW = 160; let MH = 110;
  // labyrinth: reveal the cell the truck is in (and leave a breadcrumb every few metres)
  function exploreCell(v) {
    const c = TR.maze.cellAt(v.x, v.z);
    explored.add(c.r * 64 + c.c);
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(v.x - last[0], v.z - last[1]) > 4) { trail.push([v.x, v.z]); if (trail.length > 700) trail.shift(); }
  }
  function drawMazeMinimap() {
    const M = TR.maze; const sc = Math.min((MW - 10) / (M.bounds.x * 2), (MH - 10) / (M.bounds.z * 2));
    const X = (x) => MW / 2 + x * sc; const Z = (z) => MH / 2 + z * sc;
    mini.fillStyle = 'rgba(8, 12, 28, 0.55)'; mini.fillRect(0, 0, MW, MH);
    for (let i = 0; i < M.H; i++) for (let j = 0; j < M.W; j++) {
      const vis = tileSeen(M, explored, i, j);
      if (!vis) continue;
      const [x0, x1] = M.xs[j]; const [z0, z1] = M.zs[i];
      mini.fillStyle = M.lines[i][j] === '#' ? '#6fbf6a' : '#d8c898';
      mini.fillRect(X(x0), Z(z0), (x1 - x0) * sc + 0.6, (z1 - z0) * sc + 0.6);
    }
    mini.fillStyle = 'rgba(255, 214, 10, 0.8)';
    for (const [x, z] of trail) mini.fillRect(X(x) - 0.8, Z(z) - 0.8, 1.6, 1.6);
    // the exit flag is always shown (it was on the preview map)
    const e = TR.exitPose; mini.fillStyle = '#4cc9f0'; mini.strokeStyle = '#fff'; mini.lineWidth = 1;
    mini.beginPath(); mini.arc(X(e.x), Z(e.z), 3.4, 0, 7); mini.fill(); mini.stroke();
    mini.save(); mini.translate(X(vehicle.x), Z(vehicle.z)); mini.rotate(Math.PI - vehicle.heading);
    mini.fillStyle = '#ff3b30'; mini.strokeStyle = '#fff'; mini.lineWidth = 1.5;
    mini.beginPath(); mini.moveTo(0, -5); mini.lineTo(3.6, 4); mini.lineTo(-3.6, 4); mini.closePath(); mini.fill(); mini.stroke();
    mini.restore();
  }
  function buildMinimap() {
    const cv = $('minimap');
    MW = TR.maze ? 160 : 160; MH = TR.maze ? 160 : 110;
    if (cv.width !== MW || cv.height !== MH) { cv.width = MW; cv.height = MH; }
    if (TR.maze) { miniBase = { maze: true }; return; }
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
    const path = () => { g.beginPath(); S.forEach((p, i) => (i ? g.lineTo(p.x * sc + ox, MH - (p.z * sc + oz)) : g.moveTo(p.x * sc + ox, MH - (p.z * sc + oz)))); if (!TR.OPEN) g.closePath(); };
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7; path(); g.stroke();
    g.strokeStyle = '#3b3d44'; g.lineWidth = 4.5; path(); g.stroke();
    const sp = TR.startPose();
    g.fillStyle = '#ffd60a'; g.fillRect(sp.x * sc + ox - 4, MH - (sp.z * sc + oz) - 1.5, 8, 3);
    miniBase = { canvas: c, sc, ox, oz };
  }
  function drawMinimap() {
    if (!miniBase || !vehicle) return;
    if (miniBase.maze) { drawMazeMinimap(); return; }
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
  $('btn-map').addEventListener('click', () => { if (!race) return; if (race.mapT > 0) race.endMap(); else race.startMap(); });
  $('btn-howto').addEventListener('click', () => { if (race && race.phase === 'preview') { setHowto(true); audio.click(); } });
  $('btn-howto-ok').addEventListener('click', () => { setHowto(false); audio.click(); });
  $('btn-skip').addEventListener('click', () => { if (race && race.phase === 'preview') { race.skipPreview(); audio.click(); } });
  $('btn-cam').addEventListener('click', () => {
    if (TR.maze && driveMode === 'race') { mazeZoom = mazeZoom ? 0 : 1; audio.click(); return; }
    camMode = nextCamera(camMode);
    save.camera = camMode;
    storage.save(save);
    if (vehicle) camState = newCameraState(vehicle);
    audio.click();
  });
  window.addEventListener('keydown', (e) => {
    if (flow.state !== 'drive') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyM' && !e.repeat && race && TR.maze) { if (race.mapT > 0) race.endMap(); else race.startMap(); }
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
      if (!howtoOpen) race.tick(dt);                     // the labyrinth how-to card holds the preview clock
      if (race.phase === 'countdown' || race.phase === 'preview' || race.mapT > 0) { input.gas = 0; input.boost = false; input.brake = 0; input.steer = 0; input.hold = true; }
      if (race.phase === 'finished') { input.gas = 0; input.boost = false; input.brake = 0; input.hold = true; }
    }
    if (match) {
      match.tick(dt);
      if (match.phase !== 'fight' || vehicle.wrecked) { input.gas = 0; input.boost = false; input.brake = 0; input.steer = 0; input.hold = !vehicle.wrecked; }
    }
    let first = true;
    const landings = [];
    for (let i = 0; i < steps; i++) {
      const events = stepVehicle(vehicle, first ? input : { ...input, boost: false }, courseTerrain, tune, 1 / 60);
      first = false;
      if (courseTerrain.props) handleEvents(events, vehicle, true);
      for (const e of events) if (e && e.type === 'loop') { shake = Math.max(shake, 0.4); audio.boost(); }
      for (const e of events) {
        if (e === 'boost') {
          if (isVolt()) { crackle(vehicle, 4, 4.5); zap(vehicle); }
          const nz = feel.nitro;
          shake = Math.max(shake, nz.kick); audio.boost(); nitroPunch = 1;
          truckMesh.updateMatrixWorld(true);
          for (let i = 0; i < nz.burst * scaleNow(); i++) {
            tmp.set(nz.nozzles[i % nz.nozzles.length], 0.55, -truckMesh.userData.length / 2);
            truckMesh.localToWorld(tmp);
            const sp = 4 + rand() * 6, a = (rand() - 0.5) * 0.9;
            pool.spawn(makeParticle('flame', nz.tint, tmp, { x: -Math.sin(vehicle.heading + a) * sp, y: 0.5 + rand(), z: -Math.cos(vehicle.heading + a) * sp }, 1.6, rand(), rand(), rand()));
          }
        }
        else if (e.type === 'land') { landings.push(e); shake = Math.max(shake, Math.min(1, e.power / 18)); spawnDust(5, 3, 1.2); audio.thump(e.power); }
        else if (e.type === 'hit' || e.type === 'wall') { shake = Math.max(shake, Math.min(0.8, e.power / 20)); audio.thump(e.power * 0.6); }
        else if (e.type === 'avalanche') { shake = Math.max(shake, 0.7); audio.thump(14); }
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
    truckMesh.position.set(v.x, v.y - (v.loop ? 0 : tune.ride), v.z);
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
      const nz = feel.nitro;
      const tk = takeSpawns(flameCarry, nz.rate, dt, scale);
      flameCarry = tk.carry;
      truckMesh.updateMatrixWorld(true);
      for (let i = 0; i < tk.n; i++) {
        tmp.set(nz.nozzles[i % nz.nozzles.length] + (rand() - 0.5) * 0.2, 0.55, -truckMesh.userData.length / 2);
        truckMesh.localToWorld(tmp);
        const dir = { x: -Math.sin(v.heading), y: 0.1, z: -Math.cos(v.heading) };
        pool.spawn(makeParticle('flame', nz.tint, tmp, dir, 1.2, rand(), rand(), rand()));
      }
      shake = Math.max(shake, nz.kick * 0.25);
    }
    emitExhaust(dt);
    zapCharge = chargeTick(zapCharge, dt);
    if (isVolt() && boosting && rand() < 0.3) crackle(v, 1, 3);
    lightning.update(dt);

    // race rules + HUD
    if (race) {
      const n = TR.nearest(v.x, v.z);
      race.update(n.s);
      playerAcc += wrapDelta(playerPrevS, n.s); playerPrevS = n.s;
      if (TR.OPEN && race.phase === 'finished') playerAcc = TR.FINISH_S - TR.START_S;
      rivalPose(dt);
      tickPickups(courseTerrain, dt); tickHazards(courseTerrain, dt); world.hazards.update(courseTerrain, clock); world.follow(v.x, v.y, v.z); world.pickups.sync(courseTerrain.pickups || [], clock);
      if (race.phase === 'racing') {
        const wedged = input.gas > 0.5 && v.grounded && !v.loop && Math.abs(v.f) < 1.0;
        stuckT = wedged ? stuckT + dt : Math.max(0, stuckT - dt * 2);
        pitT = inPit(v) ? pitT + dt : 0;
        if (!v.loop && fellOff(TR, v, n)) fallRespawn();
        else if (!v.loop && (pitT > 1.2 || stuckT > 4 || v.y < TR.heightAt(v.x, v.z) - 6 || n.ad > TR.BARRIER + 2)) respawn();
      }
      for (const e of race.drainEvents()) {
        if (e === 'mapStart') { $('drive').classList.add('peek'); peekOn = true; peekSync = 0; world.setMazePeek(true, vehicle, trail); audio.click(); }
        else if (e === 'mapEnd') { $('drive').classList.remove('peek'); peekOn = false; world.setMazePeek(false); audio.click(); }
        else if (e === 'previewEnd') { $('drive').classList.remove('preview'); world.setMazePreview(false); audio.click(); }
        else if (e === 'go') { goTimer = 1.0; $('drive').classList.add('go'); showCountdown('GO'); audio.boost(); }
        else if (e === 'checkpoint') { audio.click(); vehicle.nitro = Math.min(1, vehicle.nitro + 0.12); }
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
      if (fellT > 0) { fellT -= dt; if (fellT <= 0) $('drive').classList.remove('fell'); }
      $('lap').textContent = `${Math.min(race.lap, race.laps)}/${race.laps}`;
      $('timer').textContent = formatTime(race.phase === 'finished' ? race.finishTime : race.time);
      const along = Math.sin(v.heading) * n.tx + Math.cos(v.heading) * n.tz;
      wrongWay = (v.f > 3 && along < -0.3 && race.phase === 'racing' && !v.loop && !TR.maze) ? Math.min(1, wrongWay + dt) : Math.max(0, wrongWay - dt * 2);
      $('wrongway').classList.toggle('show', wrongWay > 0.5);
      if (race.phase === 'preview') $('skip-ring').style.strokeDashoffset = String(66 * (1 - race.preview / PREVIEW_TIME));
      if (TR.maze) {
        exploreCell(v);
        if (peekOn && race.mapT <= 0) { peekOn = false; $('drive').classList.remove('peek'); world.setMazePeek(false); }           // the race ended while the map was open
        if (peekOn) { peekSync -= dt; world.setMazePeek(true, v, peekSync <= 0 ? trail : null); if (peekSync <= 0) peekSync = 0.5; }
        const bm = $('btn-map'); const mp = MAP_PEEK;
        const cooling = race.mapCool > 0; const peeking = race.mapT > 0;
        bm.classList.toggle('cooling', cooling && !peeking); bm.classList.toggle('ready', !cooling && !peeking);
        $('map-ring').style.strokeDashoffset = String(66 * (peeking ? 1 - race.mapT / mp.time : cooling ? race.mapCool / mp.cool : 0));
      }
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
    let g;
    if (TR.maze && driveMode === 'race') {
      g = mazeCameraGoal({ x: v.x, y: 0, z: v.z, heading: v.heading, speed: v.f }, mazeZoom);
    } else g = cameraGoal(camMode, { x: v.x, y: v.y, z: v.z, heading: v.heading, speed: v.f, loop: v.loop ? v.loop.L : null, loopTh: v.loop ? v.loop.th : 0, loopLat: v.loop ? v.loop.lat : 0, aim: driveMode === 'race' && TR.env.camAim ? TR.env.camAim.yaw : null, aimLift: driveMode === 'race' && TR.env.camAim ? TR.env.camAim.lift : 0 }, camState);
    const kp = v.loop ? 6 : camMode === 'iso-fixed' ? 7 : (camMode === 'chase' ? 6 : 5);
    camPos.lerp(tmp.set(g.pos.x, g.pos.y, g.pos.z), 1 - Math.exp(-kp * dt));
    camLook.lerp(tmp.set(g.look.x, g.look.y, g.look.z), 1 - Math.exp(-(kp + 2) * dt));
    // labyrinth overview: blended in AFTER the normal smoothing and eased on its own clock, so it arrives exactly and then holds still
    // (the old way chased the overview with the chase-camera smoothing and was still moving 3 s later: that was the jitter)
    viewPos.copy(camPos); viewLook.copy(camLook);
    if (TR.maze && driveMode === 'race' && race) {
      const want = race.phase === 'preview' ? Math.min(1, race.preview / 1.5) : race.mapT > 0 ? 1 : 0;
      if (race.phase === 'preview') ovK = want; else ovK += Math.sign(want - ovK) * Math.min(Math.abs(want - ovK), dt / 0.6);
      if (ovK > 0.001) {
        const ov = mazePreviewGoal(TR.maze.bounds, window.innerWidth / Math.max(1, window.innerHeight));
        const e = ovK * ovK * (3 - 2 * ovK);
        viewPos.set(camPos.x + (ov.pos.x - camPos.x) * e, camPos.y + (ov.pos.y - camPos.y) * e, camPos.z + (ov.pos.z - camPos.z) * e);
        viewLook.set(camLook.x + (ov.look.x - camLook.x) * e, camLook.y + (ov.look.y - camLook.y) * e, camLook.z + (ov.look.z - camLook.z) * e);
        g.fov = g.fov * (1 - e) + ov.fov * e; camFov = g.fov;
      }
      const near = ovK > 0.3 ? 4 : 0.1;
      if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    }
    nitroPunch = v.boostT > 0 ? Math.min(1, nitroPunch + dt * 3) * 1 : nitroPunch * Math.exp(-3 * dt);
    camFov += (g.fov + nitroPunch * feel.nitro.fov - camFov) * (1 - Math.exp(-4 * dt));
    shake *= Math.exp(-6 * dt);
    camera.position.copy(viewPos);
    if (window.__voxelRacers && window.__voxelRacers.camOverride) { const o = window.__voxelRacers.camOverride; camera.position.set(o.pos[0], o.pos[1], o.pos[2]); viewLook.set(o.look[0], o.look[1], o.look[2]); }   // debug/screenshot aid
    if (shake > 0.01) camera.position.add(tmp.set((rand() - 0.5) * shake * 0.6, (rand() - 0.5) * shake * 0.6, (rand() - 0.5) * shake * 0.6));
    const PR = PLANET_U.value;
    if (PR > 0) {
      // planet stage: the camera lives on the sphere. Position and look-at go through the same warp as the world, and
      // "up" is the surface normal under the camera, so the horizon curves and tilts as the truck goes round the ball
      const cp = camera.position;
      const fr = planetFrame(PR, cp.x, cp.y, cp.z);
      planetPoint(PR, cp.x, cp.y, cp.z, planetTmp);
      const lp = planetPoint(PR, viewLook.x, viewLook.y, viewLook.z, planetLook);
      camera.position.set(planetTmp[0], planetTmp[1], planetTmp[2]);
      camera.up.set(fr.up[0], fr.up[1], fr.up[2]);
      camera.lookAt(lp[0], lp[1], lp[2]);
      const fw = [lp[0] - planetTmp[0], lp[1] - planetTmp[1], lp[2] - planetTmp[2]]; const fl = Math.hypot(fw[0], fw[1], fw[2]) || 1;
      world.skyTo({ x: planetTmp[0], y: planetTmp[1], z: planetTmp[2], f: [fw[0] / fl, fw[1] / fl, fw[2] / fl], u: fr.up });
    } else {
      camera.up.set(0, 1, 0);
      world.skyTo(null);
      camera.lookAt(viewLook);
    }
    if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }

    // light + shadow follow the truck
    if (PR > 0) {
      // the sun and the sky light keep the same angle to the ground under the truck, so every side of the planet is lit
      const ps = planetPoint(PR, v.x, 0, v.z, planetTmp);
      // a stage with a fixed sun (the Moon) is lit like the real thing: one sun in the sky, day on one side and night on the other,
      // with earthshine on the dark side. Otherwise the sun keeps the same angle to the ground under the truck.
      const sw = world.sunWorld;
      const sd = sw ? [sw[0] * 60, sw[1] * 60, sw[2] * 60] : planetDir(PR, v.x, 0, v.z, world.sunDir);
      sun.target.position.set(ps[0], ps[1], ps[2]);
      sun.position.set(ps[0] + sd[0], ps[1] + sd[1], ps[2] + sd[2]);
      const ew = world.earthWorld;
      if (ew) { world.earthLight.target.position.set(ps[0], ps[1], ps[2]); world.earthLight.position.set(ps[0] + ew[0] * 60, ps[1] + ew[1] * 60, ps[2] + ew[2] * 60); }
      const up = planetFrame(PR, v.x, 0, v.z).up;
      hemi.position.set(up[0], up[1], up[2]);
      sun.castShadow = false;
    } else {
      hemi.position.set(0, 1, 0);
      sun.castShadow = true;
      sun.target.position.set(v.x, 0, v.z);
      sun.position.set(v.x + 8, 12, v.z + 5);
    }

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
      // a planet stage leaves the camera's "up" tilted to the ball's surface: put the showroom view back upright
      camera.up.set(0, 1, 0);
      camera.position.y = camBase.y; camera.position.z = camBase.z;
      world.skyTo(null);
      hemi.position.set(0, 1, 0);
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
    get scene() { return scene; },   // debug/screenshot aid
    get camera() { return camera; },
    get explored() { return explored.size; },
    get touch() { return touch; },
    get mazeZoom() { return mazeZoom; },
    get vehicle() { return vehicle; },
    get camMode() { return camMode; },
    get race() { return race; },
    get track() { return TR; },
    selectTrack,
    get rivals() { return rivals; },
    get renderer() { return renderer; }, get scene() { return scene; }, get sun() { return sun; },
    get howtoOpen() { return howtoOpen; },
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
    get shown() { return world.shown; },
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
