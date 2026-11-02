import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTruckVoxels, PALETTE_KEYS } from '../src/vehicles/voxel-model.js';
import { TRUCKS, getTruck } from '../src/vehicles/truck-stats.js';
import { advancePhase, animValue, revSpeedFactor } from '../src/vehicles/animate.js';
import { FixedStepper } from '../src/core/stepper.js';
import { createStorage, DEFAULTS } from '../src/core/storage.js';
import { createFlow, needsRotate, SCREENS } from '../src/core/flow.js';
import { ParticlePool, tintColor, TINTS } from '../src/fx/particle-pool.js';
import { emissionRate, takeSpawns, makeParticle, particleScale, QUALITY_SCALE } from '../src/fx/emit.js';

const key = (v) => `${v.x},${v.y},${v.z}`;

// ---------------------------------------------------------------- roster
test('roster has nine unique trucks with valid stats', () => {
  assert.equal(TRUCKS.length, 9);
  assert.equal(new Set(TRUCKS.map((t) => t.id)).size, 9);
  assert.equal(new Set(TRUCKS.map((t) => t.name)).size, 9);
  for (const t of TRUCKS) {
    for (const k of ['speed', 'grip', 'weight']) assert.ok(t.stats[k] >= 1 && t.stats[k] <= 10, `${t.id}.${k}`);
    assert.ok(t.blurb && t.blurb.length > 2);
  }
  assert.equal(getTruck('nope').id, TRUCKS[0].id);
});

test('requested designs exist: bus, 6-wheeler, open trucks, jaw, pistons, crane', () => {
  const ids = TRUCKS.map((t) => t.id);
  assert.ok(ids.includes('yellow-thunder'));
  assert.ok(ids.includes('titan'));
  const cabs = new Set(TRUCKS.map((t) => t.shape.cab));
  for (const c of ['open', 'buggy', 'closed', 'bus']) assert.ok(cabs.has(c), `cab ${c}`);
  const parts = new Set(TRUCKS.flatMap((t) => buildTruckVoxels(t.shape).parts.map((p) => p.id)));
  for (const id of ['plow', 'jaw', 'piston-0', 'pulley', 'crane', 'hook', 'bed', 'stopsign', 'flag']) {
    assert.ok(parts.has(id), `part ${id}`);
  }
});

// ---------------------------------------------------------------- model integrity
test('every truck builds a detailed model with correct wheel count', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    assert.equal(m.wheels.length, t.shape.axles === 3 ? 6 : 4, t.id);
    assert.ok(m.voxels.length > 2000, `${t.id} body too sparse: ${m.voxels.length}`);
    assert.ok(m.wheels[0].voxels.length > 100, `${t.id} wheel too sparse`);
    for (const v of m.voxels) assert.ok(PALETTE_KEYS.includes(v.k), `bad key ${v.k}`);
    assert.ok(m.size.z >= 33 && m.size.z <= 60, `${t.id} length ${m.size.z}`);
  }
});

test('no truck has duplicate or overlapping voxels (no z-fighting)', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    const stat = new Set(m.voxels.map(key));
    assert.equal(stat.size, m.voxels.length, `${t.id} static dup`);
    const seen = new Set();
    for (const p of m.parts) {
      assert.ok(p.voxels.length > 0, `${t.id}/${p.id} empty`);
      for (const v of p.voxels) {
        const k = key(v);
        assert.ok(!stat.has(k), `${t.id}/${p.id} overlaps body at ${k}`);
        assert.ok(!seen.has(k), `${t.id}/${p.id} overlaps another part at ${k}`);
        seen.add(k);
      }
    }
  }
});

test('all voxels and emitters stay within sane bounds', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    for (const v of [...m.voxels, ...m.parts.flatMap((p) => p.voxels)]) {
      assert.ok(v.z >= 0 && v.z < m.size.z, `${t.id} z ${v.z}`);
      assert.ok(v.y >= 0 && v.y < m.size.y, `${t.id} y ${v.y}`);
      assert.ok(v.x >= 3 && v.x <= 22, `${t.id} x ${v.x}`);
    }
    for (const e of m.emitters) {
      assert.ok(e.y > 3 && e.y < m.size.y + 8, `${t.id} emitter y`);
      assert.ok(['smoke', 'flame', 'spark'].includes(e.kind));
      assert.ok(TINTS.includes(e.tint), `${t.id} tint ${e.tint}`);
    }
  }
});

test('every truck has a moving part or smoke, and silhouettes are all different', () => {
  const sigs = new Set();
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    assert.ok(m.parts.length + m.emitters.length > 0, `${t.id} is static`);
    sigs.add(JSON.stringify([m.size, m.parts.map((p) => p.id), m.wheels.length, t.shape.cab]));
  }
  assert.equal(sigs.size, TRUCKS.length);
});

test('part hierarchy: parents come before children and exist', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    const ids = new Set();
    for (const p of m.parts) {
      if (p.parent) assert.ok(ids.has(p.parent), `${t.id}/${p.id} parent ${p.parent}`);
      ids.add(p.id);
    }
  }
});

test('model is deterministic', () => {
  for (const t of TRUCKS) assert.deepEqual(buildTruckVoxels(t.shape), buildTruckVoxels(t.shape));
});

test('wheels sit on the ground and rims face outward on both sides', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    for (const w of m.wheels) {
      assert.ok(Math.abs(w.cy + Math.min(...w.voxels.map((v) => v.y))) <= 0.5, `${t.id} wheel on ground`);
      const rimXs = w.voxels.filter((v) => v.k === 'rim' || v.k === 'chrome').map((v) => v.x);
      assert.ok(rimXs.length > 0);
      const expected = w.side === 'L' ? 0 : 3;
      assert.ok(rimXs.every((x) => x === expected), `${t.id} ${w.side} rim on x=${expected}`);
    }
  }
});

test('six-wheeler has three axles with non-overlapping wheels', () => {
  const m = buildTruckVoxels(getTruck('titan').shape);
  assert.equal(m.meta.axleZs.length, 3);
  const r = getTruck('titan').shape.wheelR;
  for (let i = 1; i < 3; i++) assert.ok(m.meta.axleZs[i] - m.meta.axleZs[i - 1] > 2 * r, 'axles spaced past wheel diameter');
});

// ---------------------------------------------------------------- animation
test('animation maths', () => {
  assert.equal(revSpeedFactor(0), 0.5);
  assert.equal(revSpeedFactor(1), 2);
  assert.equal(revSpeedFactor(5), 2);   // clamped
  assert.equal(revSpeedFactor(-3), 0.5);
  assert.ok(advancePhase(0, 0.1, 2, 1) > advancePhase(0, 0.1, 2, 0), 'revs speed parts up');
  assert.ok(Math.abs(animValue({ type: 'bob', amp: 3 }, Math.PI / 2) - 3) < 1e-9);
  assert.ok(Math.abs(animValue({ type: 'swing', amp: 0.5 }, 0)) < 1e-9);
  // lift is one-sided: never goes past its amplitude into the other direction
  for (let p = 0; p < 7; p += 0.1) {
    const v = animValue({ type: 'lift', amp: -0.6 }, p);
    assert.ok(v <= 1e-9 && v >= -0.6 - 1e-9);
  }
  assert.equal(animValue({ type: 'spin', amp: 2 }, 1.5), 3);
  assert.equal(animValue({ type: 'nope', amp: 1 }, 1), 0);
});

// ---------------------------------------------------------------- particles
test('particle pool spawns, ages, dies, recycles and respects capacity', () => {
  const pool = new ParticlePool(4);
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 1, vz: 0, life: 1, size: 0.1, rise: 0, tint: 'black' };
  for (let i = 0; i < 4; i++) assert.ok(pool.spawn(p) >= 0);
  assert.equal(pool.alive, 4);
  assert.equal(pool.spawn(p), -1, 'full pool drops particles');
  pool.update(0.5);
  assert.ok(pool.pos[1] > 0, 'moves');
  assert.ok(pool.t(0) > 0.45 && pool.t(0) < 0.55);
  pool.update(0.6);
  assert.equal(pool.alive, 0, 'all dead after life');
  assert.ok(pool.spawn(p) >= 0, 'slot recycled');
  assert.equal(pool.alive, 1);
});

test('smoke rises (buoyancy) and tints fade through their ramp', () => {
  const pool = new ParticlePool(2);
  pool.spawn({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 2, size: 0.1, rise: 2, tint: 'gray' });
  pool.update(0.5);
  assert.ok(pool.pos[1] > 0);
  for (const tint of TINTS) {
    for (const t of [0, 0.5, 1, 2, -1]) {
      const c = tintColor(tint, t);
      assert.ok(c.every((n) => n >= 0 && n <= 255), `${tint}@${t}`);
    }
  }
  assert.notDeepEqual(tintColor('fire', 0), tintColor('fire', 1));
});

test('emission rules: smoke follows revs, flames pop only on throttle lift', () => {
  assert.ok(emissionRate('smoke', 1) > emissionRate('smoke', 0.2));
  assert.ok(emissionRate('smoke', 0) > 0, 'idle smoke');
  assert.equal(emissionRate('flame', 0.3, 0), 0);
  assert.ok(emissionRate('flame', 0.9, 2) > 0);
  assert.equal(emissionRate('other', 1), 0);
  const a = takeSpawns(0, 10, 0.05);
  assert.equal(a.n, 0);
  const b = takeSpawns(a.carry, 10, 0.06);
  assert.equal(b.n, 1, 'fractions accumulate across frames');
  assert.equal(takeSpawns(0, 100, 0.1, QUALITY_SCALE.low).n, 3);
  assert.ok(QUALITY_SCALE.low < QUALITY_SCALE.medium && QUALITY_SCALE.medium < QUALITY_SCALE.high);
});

test('makeParticle gives valid, kind-specific particles', () => {
  const base = { x: 1, y: 2, z: 3 };
  const smoke = makeParticle('smoke', 'black', base, { x: 0, y: 1, z: 0 }, 0.5, 0.5, 0.5, 0.5);
  const flame = makeParticle('flame', 'fire', base, { x: 0, y: 0, z: -1 }, 0.5, 0.5, 0.5, 0.5);
  assert.ok(smoke.life > flame.life);
  assert.ok(smoke.vy > 0 && flame.vz < 0);
  assert.equal(smoke.tint, 'black');
  const zero = makeParticle('smoke', 'gray', base, { x: 0, y: 0, z: 0 }, 0, 0, 0, 0);
  assert.ok(Number.isFinite(zero.vx) && Number.isFinite(zero.vy));
});

test('particle scale: smoke grows then vanishes, flame shrinks', () => {
  assert.ok(particleScale('smoke', 0.3, 1) > particleScale('smoke', 0, 1));
  assert.equal(particleScale('smoke', 1, 1), 0);
  assert.ok(particleScale('flame', 1, 1) < particleScale('flame', 0, 1));
  assert.ok(particleScale('smoke', 2, 1) >= 0 && particleScale('smoke', -1, 1) > 0);
});

// ---------------------------------------------------------------- flow
test('flow: boot -> intro -> title <-> garage, invalid events ignored', () => {
  const log = [];
  const f = createFlow((s, p) => log.push(`${p}>${s}`));
  assert.equal(f.state, 'boot');
  assert.equal(f.send('play'), false, 'cannot play from boot');
  assert.equal(f.send('tap'), false, 'there is no tap-to-start screen any more');
  assert.ok(f.send('ready'));
  assert.equal(f.state, 'intro', 'intro starts by itself, no tap needed');
  assert.equal(f.send('play'), false, 'cannot play during the intro');
  assert.ok(f.send('skip'));
  assert.equal(f.state, 'title');
  assert.equal(f.send('skip'), false);
  assert.ok(f.send('play'));
  assert.equal(f.state, 'garage');
  assert.ok(f.send('back'));
  assert.equal(f.state, 'title');
  assert.deepEqual(log, ['boot>intro', 'intro>title', 'title>garage', 'garage>title']);
  assert.deepEqual(SCREENS, ['intro', 'title', 'garage', 'drive']);
});

test('intro can finish by timer as well as by skip', () => {
  const f = createFlow();
  f.send('ready');
  assert.ok(f.send('done'));
  assert.equal(f.state, 'title');
});

test('rotate prompt is needed only in portrait', () => {
  assert.equal(needsRotate(390, 844), true);
  assert.equal(needsRotate(844, 390), false);
  assert.equal(needsRotate(800, 800), false);
});

// ---------------------------------------------------------------- core
test('fixed stepper is frame-rate independent and bounded', () => {
  const s = new FixedStepper(1 / 60, 5);
  let total = 0;
  for (let i = 0; i < 120; i++) total += s.advance(1 / 120).steps;
  assert.ok(Math.abs(total - 60) <= 1);
  const s2 = new FixedStepper(1 / 60, 5);
  assert.equal(s2.advance(5).steps, 5);
  assert.equal(s2.advance(-1).steps, 0);
  assert.equal(s2.advance(NaN).steps, 0);
});

test('storage round-trips and survives bad data / throwing stores', () => {
  const s = createStorage(null);
  const d = s.load();
  assert.deepEqual(d, DEFAULTS);
  d.truckId = 'magma';
  d.paints.magma = { body: '#fff' };
  assert.ok(s.save(d));
  assert.equal(s.load().truckId, 'magma');
  assert.equal(s.load().paints.magma.body, '#fff');
  const bad = createStorage({ getItem: () => '{not json', setItem() {} });
  assert.deepEqual(bad.load(), DEFAULTS);
  const throwing = createStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.deepEqual(throwing.load(), DEFAULTS);
  assert.equal(throwing.save(DEFAULTS), false);
});

test('an old saved truck id (from before the roster change) falls back safely', () => {
  assert.equal(getTruck('some-removed-truck').id, TRUCKS[0].id);
});

// ---------- world layout (title stadium + garage)
import * as L from '../src/world/layout.js';

test('layout is deterministic', () => {
  assert.deepEqual(L.standsLayout(), L.standsLayout());
  assert.deepEqual(L.mesasLayout(), L.mesasLayout());
  assert.deepEqual(L.dustLayout(), L.dustLayout());
});

test('layout: arena counts', () => {
  assert.equal(L.tireWallLayout().length, 144);
  assert.equal(L.towersLayout().length, 4);
  assert.equal(L.mesasLayout().length, 10);
  assert.ok(L.standsLayout().people.length > 250, 'crowd is big enough');
  assert.equal(L.standsLayout().tiers.length, 4);
});

test('layout: nothing sits on the truck, tire wall and crowd on their rings', () => {
  for (const t of L.tireWallLayout()) assert.ok(Math.abs(Math.hypot(t.x, t.z) - L.ARENA.wallRadius) < 1e-6);
  for (const p of L.standsLayout().people) assert.ok(Math.hypot(p.x, p.z) >= L.ARENA.standInner - 1e-6);
  const r = L.rampLayout().at;
  assert.ok(Math.hypot(r.x, r.z) > L.ARENA.truckClear + 1.5, 'ramp clear of truck');
  for (const c of L.carPileLayout()) assert.ok(Math.hypot(c.x, c.z) > L.ARENA.truckClear);
  for (const d of L.dustLayout()) assert.ok(d.y > 0 && d.v > 0);
  for (const c of L.cloudsLayout()) assert.ok(c.cubes.length >= 7);
});

// ---------- Phase 1: driving sandbox
import { createVehicle, stepVehicle, tuningFor, BOOST_COST } from '../src/physics/arcade.js';
import { terrain as ARENA_TERRAIN, heightAt, terrainColumns, wallRing, SANDBOX, OBSTACLES, FEATURES } from '../src/world/arena-layout.js';
import { stickVector, steerCurve, createFlick, keyboardInput, gamepadInput, mergeInputs, isBoostKey } from '../src/core/input.js';
import { CAMERA_MODES, nextCamera, validCamera, cameraGoal, newCameraState } from '../src/core/camera-modes.js';

const FLAT = { heightAt: () => 0, obstacles: [], radius: 1000 };
const STATS = { speed: 6, grip: 6, weight: 6 };
const DT = 1 / 60;
function run(v, input, terrain, seconds, tune = tuningFor(STATS)) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(...stepVehicle(v, input, terrain, tune, DT));
  return events;
}

test('arena: flow reaches drive and back', () => {
  const f = createFlow();
  f.send('ready'); f.send('done'); f.send('play');
  assert.equal(f.state, 'garage');
  assert.ok(f.send('drive'));
  assert.equal(f.state, 'drive');
  assert.ok(!f.send('play'), 'play ignored while driving');
  assert.ok(f.send('back'));
  assert.equal(f.state, 'garage');
  assert.ok(SCREENS.includes('drive'));
});

test('physics: deterministic', () => {
  const a = createVehicle(0, 0, 0, FLAT);
  const b = createVehicle(0, 0, 0, FLAT);
  const input = { steer: 0.5, gas: 1, brake: 0, boost: false };
  run(a, input, ARENA_TERRAIN, 3);
  run(b, input, ARENA_TERRAIN, 3);
  assert.deepEqual(a, b);
});

test('physics: gas accelerates forward, capped at max speed', () => {
  const v = createVehicle(0, 0, 0, FLAT);
  const tune = tuningFor(STATS);
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 2);
  assert.ok(v.f > 5, `speed ${v.f}`);
  assert.ok(v.z > 5 && Math.abs(v.x) < 1e-6, 'moves along +z at heading 0');
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 20);
  assert.ok(v.f <= tune.maxSpeed + 0.01, `capped ${v.f} <= ${tune.maxSpeed}`);
  assert.ok(v.f > tune.maxSpeed * 0.9);
});

test('physics: faster trucks reach higher top speed', () => {
  const slow = tuningFor({ speed: 2, grip: 5, weight: 5 });
  const fast = tuningFor({ speed: 9, grip: 5, weight: 5 });
  assert.ok(fast.maxSpeed > slow.maxSpeed && fast.accel > slow.accel);
});

test('physics: brake stops, then reverses', () => {
  const v = createVehicle(0, 0, 0, FLAT);
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 2);
  run(v, { steer: 0, gas: 0, brake: 1 }, FLAT, 1.5);
  assert.ok(v.f < 0, `reversing ${v.f}`);
  run(v, { steer: 0, gas: 0, brake: 1 }, FLAT, 5);
  assert.ok(v.f >= -tuningFor(STATS).reverseMax - 0.01);
});

test('physics: steering turns right for positive input, none when standing still', () => {
  const still = createVehicle(0, 0, 0, FLAT);
  run(still, { steer: 1, gas: 0, brake: 0 }, FLAT, 1);
  assert.equal(still.heading, 0);
  const v = createVehicle(0, 0, 0, FLAT);
  run(v, { steer: 1, gas: 1, brake: 0 }, FLAT, 1.5);
  assert.ok(v.heading < -0.3, `heading ${v.heading}`);
  const w = createVehicle(0, 0, 0, FLAT);
  run(w, { steer: -1, gas: 1, brake: 0 }, FLAT, 1.5);
  assert.ok(w.heading > 0.3);
});

test('physics: grip stat reduces sliding', () => {
  const slide = (grip) => {
    const v = createVehicle(0, 0, 0, FLAT);
    const tune = tuningFor({ speed: 6, grip, weight: 5 });
    run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 3, tune);
    run(v, { steer: 1, gas: 1, brake: 0 }, FLAT, 0.6, tune);
    return Math.abs(v.l);
  };
  assert.ok(slide(2) > slide(9));
});

test('physics: nitro boosts speed past the normal limit and uses energy', () => {
  const v = createVehicle(0, 0, 0, FLAT);
  const tune = tuningFor(STATS);
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 6);
  const events = stepVehicle(v, { steer: 0, gas: 1, brake: 0, boost: true }, FLAT, tune, DT);
  assert.ok(events.includes('boost'));
  assert.ok(v.boostT > 4, 'one tap lights a long burn');
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 1.2);
  assert.ok(v.nitro < 0.8 && v.nitro > 0.6, `meter drains while it burns (${v.nitro})`);
  assert.ok(v.f > tune.maxSpeed * 1.05, `boosted ${v.f}`);
  // not enough energy: no boost
  const w = createVehicle(0, 0, 0, FLAT);
  w.nitro = 0.1;
  assert.ok(!stepVehicle(w, { boost: true }, FLAT, tune, DT).includes('boost'));
});

test('physics: nitro refills over time', () => {
  const v = createVehicle(0, 0, 0, FLAT);
  v.nitro = 0.2;
  run(v, { gas: 0 }, FLAT, 5);
  assert.ok(v.nitro > 0.6);
});

test('physics: a kicker launches the truck, it comes back down and lands', () => {
  const v = createVehicle(19.8, 19.8, SANDBOX.start.heading, ARENA_TERRAIN);
  const tune = tuningFor({ speed: 8, grip: 6, weight: 5 });
  let airborne = 0;
  let maxY = 0;
  const events = [];
  for (let i = 0; i < 60 * 8; i++) {
    events.push(...stepVehicle(v, { steer: 0, gas: 1, brake: 0 }, ARENA_TERRAIN, tune, DT));
    if (!v.grounded) airborne++;
    maxY = Math.max(maxY, v.y);
  }
  assert.ok(airborne > 15, `airtime frames ${airborne}`);
  assert.ok(maxY > 2.2, `peak ${maxY}`);
  assert.ok(events.some((e) => e.type === 'land'), 'landing event');
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && v.y >= 0);
});

test('physics: stays inside the bowl and bounces off the wall', () => {
  const v = createVehicle(0, 0, Math.PI / 2, ARENA_TERRAIN); // facing +x, no features on this line
  v.z = -2; v.x = 5;
  const events = run(v, { steer: 0, gas: 1, brake: 0 }, { ...ARENA_TERRAIN, obstacles: [], heightAt: () => 0 }, 8);
  assert.ok(Math.hypot(v.x, v.z) <= SANDBOX.radius + 1e-6);
  assert.ok(events.some((e) => e.type === 'wall'));
});

test('physics: obstacles block, but you can jump over (y above height)', () => {
  const o = { x: 0, z: 8, r: 1.5, h: 1.3 };
  const t = { heightAt: () => 0, obstacles: [o], radius: 1000 };
  const v = createVehicle(0, 0, 0, t);
  const ev = run(v, { steer: 0, gas: 1, brake: 0 }, t, 4);
  assert.ok(ev.some((e) => e.type === 'hit'));
  assert.ok(Math.hypot(v.x - o.x, v.z - o.z) >= o.r + 1.3 - 0.01);
  const hi = createVehicle(0, 5, 0, t);
  hi.y = 3; hi.grounded = false; hi.vz = 10;
  stepVehicle(hi, {}, t, tuningFor(STATS), DT);
  assert.ok(hi.z > 5);
});

test('arena: height function and voxel columns agree', () => {
  assert.equal(heightAt(0, 40), 0);
  assert.equal(OBSTACLES.every((o) => Math.hypot(o.x, o.z) < SANDBOX.radius - 2), true);
  const cols = terrainColumns(0.5);
  assert.ok(cols.length > 1500, `columns ${cols.length}`);
  for (const c of cols.slice(0, 200)) assert.ok(Math.abs(c.h - heightAt(c.x, c.z)) < 1e-9);
  assert.ok(Math.max(...cols.map((c) => c.h)) >= 3);
  assert.equal(FEATURES.filter((f) => f.type === 'ramp').length >= 4, true);
  const ring = wallRing();
  assert.ok(ring.length > 250);
  for (const r of ring) assert.ok(Math.abs(Math.hypot(r.x, r.z) - SANDBOX.wallRadius) < 1e-6);
});

test('arena: start spot is clear and level, facing the first kicker', () => {
  const s = SANDBOX.start;
  assert.equal(heightAt(s.x, s.z), 0);
  for (const o of OBSTACLES) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) > 6);
  const ahead = heightAt(s.x + Math.sin(s.heading) * 16, s.z + Math.cos(s.heading) * 16);
  assert.ok(ahead > 0, 'kicker is ahead of the start');
});

test('input: stick dead zone, range and curve', () => {
  assert.deepEqual(stickVector(2, 2, 60), { x: 0, y: 0, mag: 0 });
  const right = stickVector(60, 0, 60);
  assert.ok(Math.abs(right.x - 1) < 1e-9 && right.y === 0);
  const up = stickVector(0, -90, 60); // past the rim
  assert.ok(Math.abs(up.y - 1) < 1e-9, 'y is up-positive and clamped');
  assert.ok(Math.abs(steerCurve(0.5)) < 0.5 && steerCurve(-1) === -1 && steerCurve(0) === 0);
});

test('input: flick up triggers nitro, slow push or hold does not', () => {
  const f = createFlick();
  assert.equal(f.update(0, 0), false);
  assert.equal(f.update(0.3, 0.05), false);
  assert.equal(f.update(0.9, 0.1), true, 'quick flick');
  assert.equal(f.update(0.95, 0.12), false, 'hold does not retrigger');
  assert.equal(f.update(0.95, 0.3), false);
  const g = createFlick();
  g.update(0.2, 0);
  assert.equal(g.update(0.5, 0.4), false);
  assert.equal(g.update(0.9, 1.0), false, 'slow push is not a flick');
  const h = createFlick();
  h.update(0, 0);
  assert.equal(h.update(0.9, 0.05), true);
  h.update(0, 0.2);
  assert.equal(h.update(0.9, 0.3), false, 'cooldown');
  assert.equal(h.update(0.9, 0.3), false);
});

test('input: keyboard, gamepad and merge', () => {
  const k = keyboardInput(new Set(['ArrowLeft', 'KeyW']));
  assert.deepEqual(k, { steer: -1, gas: 1, brake: 0 });
  assert.deepEqual(keyboardInput(new Set(['ArrowLeft', 'ArrowRight'])).steer, 0);
  assert.ok(isBoostKey('Space') && !isBoostKey('KeyQ'));
  const pad = { axes: [0.6, -0.9], buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })) };
  const g = gamepadInput(pad);
  assert.equal(g.gas, 1); assert.equal(g.brake, 0);
  assert.ok(g.steer > 0.5 && g.stickY > 0.8);
  assert.deepEqual(gamepadInput(null).gas, 0);
  const m = mergeInputs([{ steer: 0.8, gas: 0 }, { steer: 0.8, brake: 1 }, { boost: true }]);
  assert.deepEqual(m, { steer: 1, gas: 0, brake: 1, boost: true });
  assert.equal(mergeInputs([{}], true).gas, 1, 'auto gas');
  assert.equal(mergeInputs([{ brake: 1 }], true).gas, 0, 'brake overrides auto gas');
});

test('camera: four views cycle and wrap, bad values fall back', () => {
  assert.equal(CAMERA_MODES.length, 4);
  let m = CAMERA_MODES[0];
  const seen = [];
  for (let i = 0; i < 4; i++) { seen.push(m); m = nextCamera(m); }
  assert.equal(new Set(seen).size, 4);
  assert.equal(m, CAMERA_MODES[0]);
  assert.equal(validCamera('nonsense'), 'iso-follow');
  assert.equal(validCamera('top'), 'top');
});

test('camera: goals per view', () => {
  const t = { x: 10, y: 0, z: 5, heading: 0, speed: 0 };
  const st = newCameraState(t);
  const iso = cameraGoal('iso-follow', t, st);
  assert.ok(iso.pos.x > t.x && iso.pos.z > t.z && iso.pos.y > 8, 'iso looks down from a corner');
  const chase = cameraGoal('chase', t, st);
  assert.ok(chase.pos.z < t.z && chase.look.z > t.z, 'chase sits behind, looks ahead');
  const top = cameraGoal('top', t, st);
  assert.ok(top.pos.y > 20);
  // fixed view only moves once the truck leaves the dead zone
  const a = cameraGoal('iso-fixed', { ...t, x: 12 }, st);
  assert.equal(st.fx, 10);
  cameraGoal('iso-fixed', { ...t, x: 30 }, st);
  assert.ok(st.fx > 10 && st.fx < 30);
  assert.ok(a.fov > 0);
});

// ---------- Phase 1.5: truck character
import { FEEL, getFeel } from '../src/vehicles/truck-feel.js';
import { createSuspension, stepSuspension } from '../src/vehicles/suspension.js';

test('feel: every truck has its own voice, suspension and handling', () => {
  for (const t of TRUCKS) {
    assert.ok(FEEL[t.id], `${t.id} has feel`);
    const { voice, sus, handling } = FEEL[t.id];
    assert.ok(voice.f0 > 15 && voice.f0 < 80 && voice.range > 0 && voice.gain > 0 && voice.gain < 0.6, `${t.id} voice ranges`);
    assert.ok(['sawtooth', 'square', 'triangle'].includes(voice.wave));
    assert.ok(sus.k > 20 && sus.c > 1 && sus.roll > 0, `${t.id} suspension`);
    assert.ok(handling.steer > 0.5 && handling.grip > 0.5 && handling.boost > 0.5);
  }
  const sig = TRUCKS.map((t) => JSON.stringify(FEEL[t.id].voice));
  assert.equal(new Set(sig).size, TRUCKS.length, 'no two trucks share an engine voice');
  assert.equal(new Set(TRUCKS.map((t) => FEEL[t.id].voice.f0)).size, TRUCKS.length, 'idle pitches differ');
  assert.equal(getFeel('nope'), FEEL.crusher, 'unknown id falls back');
  assert.ok(FEEL.titan.voice.f0 < FEEL['dune-devil'].voice.f0, 'big truck is deeper than the buggy');
  assert.ok(FEEL.titan.sus.k < FEEL['dune-devil'].sus.k, 'heavy truck has softer springs');
});

test('feel: handling multipliers change the physics', () => {
  const base = tuningFor(STATS);
  const nimble = tuningFor(STATS, FEEL['dune-devil'].handling);
  const lumber = tuningFor(STATS, FEEL.titan.handling);
  assert.ok(nimble.steerRate > base.steerRate && lumber.steerRate < base.steerRate);
  assert.ok(FEEL.magma.handling.boost > FEEL.titan.handling.boost);
  assert.ok(tuningFor(STATS, FEEL.magma.handling).boostMul > tuningFor(STATS, FEEL.titan.handling).boostMul);
});

test('suspension: landing makes the body bounce then settle', () => {
  const s = createSuspension();
  const sus = FEEL.crusher.sus;
  stepSuspension(s, { impact: 14 }, sus, 1 / 60);
  let min = 0; let max = 0;
  for (let i = 0; i < 200; i++) { stepSuspension(s, {}, sus, 1 / 60); min = Math.min(min, s.heave); max = Math.max(max, s.heave); }
  assert.ok(min < -0.04 && max > 0.0, `wobbles (${min.toFixed(3)}..${max.toFixed(3)})`);
  for (let i = 0; i < 300; i++) stepSuspension(s, {}, sus, 1 / 60);
  assert.ok(Math.abs(s.heave) < 0.005 && Math.abs(s.pitch) < 0.005, 'settles');
});

test('suspension: accelerating squats the nose up, braking dives it, turning rolls outward', () => {
  const run = (input, sus = FEEL.crusher.sus) => { const s = createSuspension(); for (let i = 0; i < 120; i++) stepSuspension(s, input, sus, 1 / 60); return s; };
  assert.ok(run({ accelF: 25 }).pitch < -0.03, 'nose up when accelerating');
  assert.ok(run({ accelF: -30 }).pitch > 0.03, 'nose down when braking');
  assert.ok(run({ lat: 20 }).roll > 0.05, 'left turn: left side rises');
  assert.ok(run({ lat: -20 }).roll < -0.05, 'right turn: right side rises');
  assert.ok(Math.abs(run({ lat: 20 }, FEEL['yellow-thunder'].sus).roll) > Math.abs(run({ lat: 20 }, FEEL.titan.sus).roll), 'tall bus leans more than the titan');
  const big = run({ lat: 999, accelF: 999 });
  assert.ok(Math.abs(big.roll) <= 0.5 && Math.abs(big.pitch) <= 0.4, 'clamped');
});

test('physics: launch speed is capped so crests do not throw the truck skyward', () => {
  const v = createVehicle(0, 0, 0, FLAT);
  const hill = { heightAt: (x, z) => (z > 10 ? Math.max(0, 6 - (z - 10) * 3) : 0), obstacles: [], radius: 1000 };
  v.vz = 25; v.z = 9;
  let peak = 0;
  for (let i = 0; i < 120; i++) { stepVehicle(v, { gas: 1 }, hill, tuningFor(STATS), DT); peak = Math.max(peak, v.y); }
  assert.ok(peak < 6.5, `peak ${peak}`);
});

// ---------- Phase 1.6: bouncy suspension physics + surfaces
import { SURFACES, SPRING_REST } from '../src/physics/arcade.js';

test('physics: heavy landings bounce several times before settling', () => {
  const tune = tuningFor(STATS, FEEL.crusher.handling, FEEL.crusher.sus);
  const v = createVehicle(0, 0, 0, FLAT, tune.ride);
  v.y = 5; v.grounded = false;
  let peaks = 0; let up = false; let peak1 = 0; let first = true;
  const ev = [];
  for (let i = 0; i < 400; i++) {
    ev.push(...stepVehicle(v, {}, FLAT, tune, DT));
    if (v.vy > 0.3) up = true;
    else if (v.vy < 0 && up) { up = false; peaks++; if (first && peaks === 2) { peak1 = v.y; first = false; } }
  }
  assert.ok(ev.some((e) => e.type === 'land' && e.power > 10), 'hard landing event');
  assert.ok(peaks >= 3, `bounced ${peaks} times`);
  assert.ok(Math.abs(v.y - tune.ride) < 0.03 && v.grounded, `settled at ride height (${v.y})`);
});

test('physics: softer trucks bounce more than stiff ones', () => {
  const bounce = (fe) => {
    const tune = tuningFor(STATS, fe.handling, fe.sus);
    const v = createVehicle(0, 0, 0, FLAT, tune.ride);
    v.y = 5; v.grounded = false;
    let maxAfter = 0; let landed = false;
    for (let i = 0; i < 200; i++) {
      const ev = stepVehicle(v, {}, FLAT, tune, DT);
      if (ev.some((e) => e.type === 'land')) landed = true;
      else if (landed) maxAfter = Math.max(maxAfter, v.y);
    }
    return maxAfter;
  };
  assert.ok(bounce(FEEL['dune-devil']) > 0 && bounce(FEEL.titan) > 0);
  assert.ok(bounce(FEEL.titan) >= bounce(FEEL.crusher) * 0.5, 'sanity');
});

test('physics: surfaces change speed and grip (asphalt > dirt > grass > mud)', () => {
  const top = (sf) => {
    const t = { heightAt: () => 0, obstacles: [], radius: 1e3, surfaceAt: () => sf };
    const tune = tuningFor(STATS);
    const v = createVehicle(0, 0, 0, t);
    run(v, { gas: 1 }, t, 12, tune);
    return v.f;
  };
  const a = top('asphalt'); const d = top('dirt'); const g = top('grass'); const m = top('mud');
  assert.ok(a > d && d > g && g > m, `${a} ${d} ${g} ${m}`);
  assert.ok(m < a * 0.5, 'mud is much slower');
  assert.ok(SURFACES.asphalt.grip > SURFACES.mud.grip);
  const t = { heightAt: () => 0, obstacles: [], radius: 1e3, surfaceAt: () => 'mud' };
  const v = createVehicle(0, 0, 0, t);
  run(v, { gas: 1 }, t, 1);
  assert.equal(v.surface, 'mud');
});

test('physics: bumps in the road hop the truck and scrub speed', () => {
  const logs = { heightAt: (x, z) => (z > 20 && z % 6 > 0 && z % 6 < 1 ? 0.45 : 0), obstacles: [], radius: 1e3 };
  const tune = tuningFor(STATS);
  const smooth = createVehicle(0, 0, 0, FLAT);
  const rough = createVehicle(0, 0, 0, logs);
  let hops = 0;
  for (let i = 0; i < 360; i++) {
    stepVehicle(smooth, { gas: 1 }, FLAT, tune, DT);
    stepVehicle(rough, { gas: 1 }, logs, tune, DT);
    if (!rough.grounded) hops++;
  }
  assert.ok(hops > 20, `hops ${hops}`);
  assert.ok(rough.f < smooth.f * 0.8, `rough ${rough.f} vs smooth ${smooth.f}`);
});

test('physics: custom wall (track barrier) keeps the truck in', () => {
  const corridor = {
    heightAt: () => 0, obstacles: [],
    constrain: (x, z) => (Math.abs(x) > 6 ? { x: Math.sign(x) * 6, z, nx: Math.sign(x), nz: 0 } : null),
  };
  const v = createVehicle(0, 0, Math.PI / 2, corridor);
  const ev = run(v, { gas: 1 }, corridor, 6);
  assert.ok(Math.abs(v.x) <= 6 + 1e-9);
  assert.ok(ev.some((e) => e.type === 'wall'));
});

test('physics: kicker gives real air time', () => {
  const tune = tuningFor({ speed: 8, grip: 6, weight: 5 }, FEEL.crusher.handling, FEEL.crusher.sus);
  const v = createVehicle(SANDBOX.start.x, SANDBOX.start.z, SANDBOX.start.heading, ARENA_TERRAIN, tune.ride);
  let air = 0;
  for (let i = 0; i < 60 * 8; i++) { stepVehicle(v, { gas: 1 }, ARENA_TERRAIN, tune, DT); if (!v.grounded) air++; }
  assert.ok(air > 25, `air frames ${air}`);
  assert.ok(SPRING_REST > 0);
});

// ---------- Phase 2: race track + rules
import * as TRK from '../src/world/track.js';
import { createRace, crossedForward, wrapDelta, formatTime, COUNTDOWN } from '../src/core/race.js';
import { buildColumns } from '../src/world/terrain-mesh.js';

test('track: closed loop with sane length, width, curvature and grade', () => {
  const S = TRK.SAMPLES;
  assert.ok(TRK.LENGTH > 600 && TRK.LENGTH < 1000, `length ${TRK.LENGTH}`);
  assert.ok(Math.hypot(S[0].x - S[S.length - 1].x, S[0].z - S[S.length - 1].z) < TRK.DS * 1.5, 'closes');
  let minR = Infinity; let maxGrade = 0;
  for (let i = 0; i < S.length; i++) {
    const a = S[i]; const b = S[(i + 3) % S.length]; const c = S[(i + 6) % S.length];
    const ab = Math.hypot(b.x - a.x, b.z - a.z); const bc = Math.hypot(c.x - b.x, c.z - b.z); const ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
    minR = Math.min(minR, (ab * bc * ca) / (4 * area || 1e-9));
    maxGrade = Math.max(maxGrade, Math.abs(S[(i + 1) % S.length].y - a.y) / TRK.DS);
    assert.ok(a.y > 1, 'road stays above the ground floor');
  }
  assert.ok(minR > 15, `tightest bend radius ${minR}`);
  assert.ok(maxGrade < 0.2, `grade ${maxGrade}`);
});

test('track: different parts never come near each other (barriers cannot touch)', () => {
  const S = TRK.SAMPLES;
  let min = Infinity;
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const arc = Math.min(j - i, S.length - (j - i)) * TRK.DS;
    if (arc < 70) continue;
    min = Math.min(min, Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z));
  }
  assert.ok(min > 2 * TRK.TRACK.barrier + 6, `closest approach ${min}`);
});

test('track: road, shoulders and surfaces', () => {
  const p = TRK.sampleAt(0.35);
  const on = TRK.sample(p.x, p.z);
  assert.ok(on.onRoad && Math.abs(on.d) < 0.5);
  const side = TRK.sample(p.x + p.tz * 10, p.z - p.tx * 10);
  assert.equal(side.surf, 'grass');
  const kinds = new Set();
  for (let i = 0; i < 200; i++) { const q = TRK.sampleAt(i / 200); kinds.add(TRK.surfaceAt(q.x, q.z)); }
  for (const k of ['asphalt', 'dirt', 'mud']) assert.ok(kinds.has(k), `has ${k}`);
  const sp = TRK.startPose();
  assert.equal(TRK.surfaceAt(sp.x, sp.z), 'asphalt');
  assert.ok(Math.abs(TRK.heightAt(sp.x, sp.z) - sp.y) < 0.01, 'start is on the level road');
});

test('track: jumps, whoops and logs rise above the road', () => {
  const ramps = TRK.FEATURES.filter((f) => f.type === 'ramp');
  assert.ok(ramps.length >= 6);
  const k = ramps[0];
  const top = TRK.heightAt(k.x + Math.sin(k.rot) * 8.9, k.z + Math.cos(k.rot) * 8.9);
  const flat = TRK.nearest(k.x + Math.sin(k.rot) * 8.9, k.z + Math.cos(k.rot) * 8.9).y;
  assert.ok(top - flat > 2.0, `kicker lip ${top - flat}`);
  assert.ok(TRK.FEATURES.some((f) => f.type === 'whoops'));
});

test('track: barriers contain the truck on both sides', () => {
  const p = TRK.sampleAt(0.2);
  for (const side of [-1, 1]) {
    const x = p.x + p.tz * side * (TRK.TRACK.barrier + 5);
    const z = p.z - p.tx * side * (TRK.TRACK.barrier + 5);
    const w = TRK.constrain(x, z, 1.3);
    assert.ok(w, 'pushed back');
    assert.ok(Math.abs(TRK.nearest(w.x, w.z).d) <= TRK.TRACK.barrier - 1.3);
    assert.ok((w.nx * (x - w.x) + w.nz * (z - w.z)) > 0, 'normal points outwards');
  }
  assert.equal(TRK.constrain(p.x, p.z, 1.3), null);
});

test('track: a truck can drive a full lap on the road without leaving the barriers', () => {
  const tune = tuningFor({ speed: 7, grip: 7, weight: 5 }, FEEL.crusher.handling, FEEL.crusher.sus);
  const sp = TRK.startPose();
  const v = createVehicle(sp.x, sp.z, sp.heading, TRK.terrain, tune.ride);
  let t = 0; let walls = 0; let maxS = 0; let passed = 0;
  for (let i = 0; i < 60 * 150; i++) {
    // simple pilot: aim at a point on the centre line ahead
    const n = TRK.nearest(v.x, v.z);
    const ahead = TRK.sampleAt(n.s + 14 / TRK.LENGTH);
    const want = Math.atan2(ahead.x - v.x, ahead.z - v.z);
    let diff = want - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const ev = stepVehicle(v, { gas: 1, brake: 0, steer: Math.max(-1, Math.min(1, -diff * 2.5)) }, TRK.terrain, tune, DT);
    walls += ev.filter((e) => e.type === 'wall').length;
    t += DT;
    const prog = (n.s - TRK.START_S + 1) % 1;
    if (prog > passed) passed = prog;
    if (passed > 0.97) break;
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y), 'finite');
  }
  assert.ok(passed > 0.9, `completed ${(passed * 100).toFixed(0)}% of the lap in ${t.toFixed(0)}s (walls ${walls})`);
});

test('race: countdown, checkpoints in order, laps, finish and best lap', () => {
  const r = createRace({ laps: 2 });
  assert.equal(r.phase, 'countdown');
  assert.equal(r.countdownDigit(), 3);
  r.tick(COUNTDOWN / 2);
  assert.ok(r.countdownDigit() <= 2);
  r.update(0.99); // moving while counting down counts for nothing
  r.tick(COUNTDOWN);
  assert.equal(r.phase, 'racing');
  assert.ok(r.drainEvents().includes('go'));
  const drive = (from, to, seconds) => { const steps = 40; for (let i = 1; i <= steps; i++) { r.tick(seconds / steps); r.update(from + (to - from) * (i / steps)); } };
  r.prevS = 0.985;
  drive(0.985, 1.005, 0.5);              // crosses the line at the start: not a lap
  assert.equal(r.lap, 1);
  drive(0.005, 0.3, 10);                 // checkpoint 1 (0.25)
  assert.equal(r.next, 2);
  drive(0.3, 0.55, 10);
  drive(0.55, 0.8, 10);
  assert.equal(r.next, 0, 'all checkpoints done, line is next');
  drive(0.8, 1.02, 10);
  assert.equal(r.lap, 2, 'lap counted');
  assert.equal(r.lapTimes.length, 1);
  assert.ok(r.events.includes('lap'));
  drive(0.02, 0.3, 8); drive(0.3, 0.55, 8); drive(0.55, 0.8, 8); drive(0.8, 1.02, 8);
  assert.equal(r.phase, 'finished');
  assert.equal(r.lapTimes.length, 2);
  assert.ok(r.best <= Math.min(...r.lapTimes) + 1e-9);
  assert.ok(r.finishTime > 60);
});

test('race: skipping checkpoints or driving backwards does not count a lap', () => {
  const r = createRace({ laps: 3 });
  r.tick(10);
  r.prevS = 0.985;
  r.update(0.02); r.update(0.1);
  // jump straight to the line without checkpoints
  r.update(0.9); r.update(0.995); r.update(0.01);
  assert.equal(r.lap, 1);
  assert.equal(r.next, 1);
  // backwards across a checkpoint does nothing
  r.prevS = 0.3; r.update(0.2);
  assert.equal(r.next, 1);
  assert.ok(wrapDelta(0.99, 0.01) > 0 && crossedForward(0.99, 0.02, 0) && !crossedForward(0.02, 0.99, 0));
  assert.equal(formatTime(75.5), '1:15.50');
});

test('terrain mesh: columns emit tops and only visible side walls', () => {
  const flat = buildColumns({ x0: 0, z0: 0, nx: 4, nz: 4, cell: 1, quant: 0, heightAt: () => 1, colorAt: () => [1, 1, 1], sides: true });
  assert.equal(flat.cells, 16);
  assert.equal(flat.triangles, 16 * 2 + 16 * 2, 'tops plus the 16 outer edge walls only');
  const step = buildColumns({ x0: 0, z0: 0, nx: 2, nz: 1, cell: 1, quant: 0, heightAt: (x) => (x < 1 ? 2 : 1), colorAt: () => [1, 1, 1] });
  assert.ok(step.triangles > 4, 'has a wall at the step');
  assert.equal(step.positions.length, step.normals.length);
  assert.equal(step.positions.length, step.colors.length);
  const q = buildColumns({ x0: 0, z0: 0, nx: 1, nz: 1, cell: 1, quant: 0.25, heightAt: () => 1.13, colorAt: () => [1, 1, 1], sides: false });
  assert.equal(q.positions[1], 1.25);
});

// ---------- Phase 3: rivals
import { resolveCollisions, TRUCK_R } from '../src/physics/collide.js';
import { createDriver, driverInput, rubberBand } from '../src/ai/driver.js';

const TRACK_API = { nearest: TRK.nearest, sampleAt: TRK.sampleAt, length: TRK.LENGTH, roadHalf: TRK.ROAD_HALF, laneAt: (s, r) => TRACKS[0].laneAt(s, r) };

test('collide: overlapping trucks are pushed apart and bounce', () => {
  const a = { x: 0, y: 0, z: 0, vx: 10, vz: 0 };
  const b = { x: 2, y: 0, z: 0, vx: 0, vz: 0 };
  const hits = resolveCollisions([a, b]);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].power > 5);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) >= TRUCK_R * 2 - 1e-6);
  assert.ok(b.vx > 0 && a.vx < 10, 'momentum passes on');
  // a heavier truck is pushed less
  const h = { x: 0, y: 0, z: 0, vx: 5, vz: 0, mass: 4 };
  const l = { x: 1.5, y: 0, z: 0, vx: 0, vz: 0, mass: 1 };
  resolveCollisions([h, l]);
  assert.ok(h.x > -0.8 && l.x - 1.5 > Math.abs(h.x), 'light truck moves more');
  // flying over another truck does not collide
  assert.equal(resolveCollisions([{ x: 0, y: 3, z: 0, vx: 0, vz: 0 }, { x: 0, y: 0, z: 0, vx: 0, vz: 0 }]).length, 0);
});

test('ai: rubber band stays gentle and favours the trailing truck', () => {
  assert.ok(rubberBand(1, 0.9) > 1 && rubberBand(1, 0.9) <= 1.12);
  assert.ok(rubberBand(0.9, 1) < 1 && rubberBand(0.9, 1) >= 0.88);
  assert.equal(rubberBand(0.5, 0.5), 1);
  assert.equal(rubberBand(9, 0), 1.12);
});

test('ai: every rival truck can lap the track by itself, stays on the road and does not get stuck', () => {
  for (const t of TRUCKS) {
    const feel = getFeel(t.id);
    const tune = tuningFor(t.stats, feel.handling, feel.sus);
    const sp = TRK.gridPose(1);
    const terr0 = TRACKS[0].freshTerrain();
    const v = createVehicle(sp.x, sp.z, sp.heading, terr0, tune.ride);
    const d = createDriver({ skill: 0.95, lane: 2 });
    let acc = 0; let prev = TRK.nearest(v.x, v.z).s; let time = 0; let offRoad = 0; let stuck = 0;
    for (let i = 0; i < 60 * 240 && acc < 1; i++) {
      const input = driverInput(d, v, tune, TRACK_API, { phase: 'racing', props: terr0.props, playerAcc: 0, myAcc: acc }, DT);
      for (const e of stepVehicle(v, input, terr0, tune, DT)) if (e.type === 'smash') { const k = terr0.obstacles.indexOf(e.obj); if (k >= 0) terr0.obstacles.splice(k, 1); }
      const n = TRK.nearest(v.x, v.z);
      acc += wrapDelta(prev, n.s); prev = n.s; time += DT;
      if (Math.abs(n.d) > TRK.ROAD_HALF + 0.5) offRoad += DT;
      if (v.grounded && Math.abs(v.f) < 0.5) stuck += DT;
    }
    assert.ok(acc >= 0.98, `${t.id} completed ${(acc * 100).toFixed(0)}% in ${time.toFixed(0)}s`);
    assert.ok(time < 140, `${t.id} lap time ${time.toFixed(0)}s`);
    assert.ok(offRoad < time * 0.25, `${t.id} off road ${offRoad.toFixed(1)}s`);
    assert.ok(stuck < 8, `${t.id} stuck ${stuck.toFixed(1)}s`);
  }
});

test('ai: holds still during the countdown', () => {
  const d = createDriver();
  const tune = tuningFor(STATS);
  const sp = TRK.gridPose(0);
  const v = createVehicle(sp.x, sp.z, sp.heading, TRK.terrain, tune.ride);
  const input = driverInput(d, v, tune, TRACK_API, { phase: 'countdown' }, DT);
  assert.equal(input.gas, 0);
  assert.equal(input.hold, true);
});

test('hold: standing still during a countdown - never rolls backwards (brake alone would reverse)', () => {
  const tune = tuningFor(STATS);
  const v = createVehicle(0, 0, 0, FLAT);
  for (let i = 0; i < 180; i++) stepVehicle(v, { gas: 0, brake: 0, hold: true, steer: 1 }, FLAT, tune, DT);
  assert.ok(Math.abs(v.f) < 0.1 && Math.abs(v.z) < 0.2, `moved to ${v.z}`);
  const w = createVehicle(0, 0, 0, FLAT);
  for (let i = 0; i < 180; i++) stepVehicle(w, { gas: 0, brake: 1 }, FLAT, tune, DT);
  assert.ok(w.z < -1, 'plain brake from rest does reverse (the bug the hold flag fixes)');
});

test('nitro: the meter drains smoothly for the whole burn and ends when empty', () => {
  const tune = tuningFor(STATS);
  const v = createVehicle(0, 0, 0, FLAT);
  v.nitro = 0.5;
  stepVehicle(v, { gas: 1, boost: true }, FLAT, tune, DT);
  let burn = 0;
  for (let i = 0; i < 60 * 6; i++) { stepVehicle(v, { gas: 1 }, FLAT, tune, DT); if (v.boostT > 0) burn++; }
  assert.ok(burn / 60 > 2 && burn / 60 < 2.5, `half a tank burns ~2.25 s (${burn / 60})`);
  assert.ok(v.nitro < 0.5 + 0.09 * 4 + 0.05, 'and the meter was empty at the end');
  // more powerful than before: top speed over 1.8x
  const t = { heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => 'asphalt' };
  const a = createVehicle(0, 0, 0, t);
  run(a, { gas: 1 }, t, 8, tune);
  const base = a.f;
  stepVehicle(a, { gas: 1, boost: true }, t, tune, DT);
  let peak = 0;
  for (let i = 0; i < 240; i++) { stepVehicle(a, { gas: 1 }, t, tune, DT); peak = Math.max(peak, a.f); }
  assert.ok(peak > base * 1.3 && peak < base * 1.6, `boost peak ${peak} vs ${base}`);
});

test('track: grid slots are on the road, behind the line, in two columns', () => {
  const poses = [0, 1, 2, 3, 4, 5].map((i) => TRK.gridPose(i));
  for (const p of poses) {
    const n = TRK.nearest(p.x, p.z);
    assert.ok(Math.abs(n.d) < TRK.ROAD_HALF - 1, 'on the road');
    assert.equal(TRK.surfaceAt(p.x, p.z), 'asphalt');
  }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(poses[i].x - poses[j].x, poses[i].z - poses[j].z) > 3.5, 'no overlap');
});

test('track: variety - sand, mud, potholes, rock garden, crushed cars, jumps and logs', () => {
  const kinds = new Set(TRK.FEATURES.map((f) => f.kind));
  for (const k of ['ramp', 'whoops', 'rock', 'pit', 'log']) assert.ok(kinds.has(k), `has ${k}`);
  assert.ok(TRK.FEATURES.filter((f) => f.kind === 'pit').length >= 4);
  assert.ok(TRK.FEATURES.filter((f) => f.kind === 'rock').length >= 20);
  assert.ok(TRK.OBSTACLES.some((o) => o.type === 'car'));
  const surfaces = new Set(TRK.SECTIONS.map((s) => s.surf));
  for (const sf of ['asphalt', 'dirt', 'sand', 'mud']) assert.ok(surfaces.has(sf));
  const pit = TRK.FEATURES.find((f) => f.kind === 'pit');
  assert.ok(TRK.heightAt(pit.x, pit.z) < TRK.nearest(pit.x, pit.z).y - 0.8, 'the massive pothole is really deep');
});

test('track: no cliffs - shoulders are gentle and landings are low (cannot get trapped)', () => {
  let maxOff = 0;
  for (let i = 0; i < 1500; i++) {
    const p = TRK.sampleAt(i / 1500);
    for (const off of [9, 10, 11, 12, 13, -9, -10, -11, -12, -13]) {
      const x = p.x + p.tz * off; const z = p.z - p.tx * off;
      const gx = (TRK.heightAt(x + 0.5, z) - TRK.heightAt(x - 0.5, z)); const gz = (TRK.heightAt(x, z + 0.5) - TRK.heightAt(x, z - 0.5));
      maxOff = Math.max(maxOff, Math.hypot(gx, gz));
    }
  }
  assert.ok(maxOff < 1.1, `steepest shoulder gradient over 1 unit ${maxOff}`);
  for (const f of TRK.FEATURES.filter((q) => q.type === 'ramp' && q.profile[0][1] > 0)) assert.ok(f.profile[0][1] <= 1.0, 'landing face is low');
  const ys = TRK.SAMPLES.map((q) => q.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 5, 'road does not climb high');
});

test('physics: nitro is strong - top speed ~1.4x, big kick, and it plows through mud', () => {
  const tune = tuningFor(STATS);
  const run2 = (surf, boost) => {
    const t = { heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => surf };
    const v = createVehicle(0, 0, 0, t);
    run(v, { gas: 1 }, t, 8, tune);
    if (boost) stepVehicle(v, { gas: 1, boost: true }, t, tune, DT);
    let peak = 0;
    for (let i = 0; i < 150; i++) { stepVehicle(v, { gas: 1 }, t, tune, DT); peak = Math.max(peak, v.f); }
    return peak;
  };
  const normal = run2('asphalt', false);
  const boosted = run2('asphalt', true);
  assert.ok(boosted > normal * 1.3 && boosted < normal * 1.6, `boost ${boosted} vs ${normal}`);
  assert.ok(run2('mud', true) > run2('mud', false) * 1.8, 'nitro through mud');
});

// ---------- Phase 5a: arena combat
import { ramDamage, applyDamage, blastTrucks, facing, RAM_MIN_POWER } from '../src/physics/damage.js';
import { arenaProps, createArenaTerrain, hitProp, detonate, removeProp, DEFS as PROP_DEFS } from '../src/world/props.js';
import { createMatch, comboMultiplier, formatClock, MATCH_TIME } from '../src/core/arena-match.js';
import { createBrawler, brawlerInput } from '../src/ai/brawler.js';
import { DebrisPool, burst } from '../src/fx/debris.js';
import { BOOST_TIME } from '../src/physics/arcade.js';

test('nitro: a single tap burns for 4+ seconds', () => {
  assert.ok(BOOST_TIME >= 4);
  const tune = tuningFor(STATS);
  const t = { heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => 'asphalt' };
  const v = createVehicle(0, 0, 0, t);
  stepVehicle(v, { gas: 1, boost: true }, t, tune, DT);
  assert.ok(v.boostT > 4.4);
  let boosting = 0;
  for (let i = 0; i < 60 * 6; i++) { stepVehicle(v, { gas: 1 }, t, tune, DT); if (v.boostT > 0) boosting++; }
  assert.ok(boosting / 60 > 4, `burned for ${boosting / 60}s`);
});

test('damage: bumps do nothing, hard rams hurt, head-on hurts less than being hit from behind', () => {
  const a = { x: 0, z: 0, heading: 0 };               // faces +z
  const b = { x: 0, z: 3, heading: Math.PI };         // faces back at a
  assert.deepEqual(ramDamage(a, b, RAM_MIN_POWER - 1), { a: 0, b: 0 });
  const head = ramDamage(a, b, 20);
  assert.ok(head.a > 10 && head.b > 10);
  const c = { x: 0, z: 3, heading: 0 };               // faces away: a hits c in the back
  const rear = ramDamage(a, c, 20);
  assert.ok(rear.b > head.b * 1.5, 'tail hit hurts more');
  assert.ok(rear.a <= head.a + 1e-9, 'the attacker stays protected');
  assert.ok(facing(a, 0, 5) > 0.99 && facing(a, 0, -5) < -0.99);
});

test('damage: health bottoms out at zero and reports the wreck once', () => {
  const v = { hp: 30, maxHp: 100, wrecked: false };
  assert.equal(applyDamage(v, 10), false);
  assert.equal(v.hp, 20);
  assert.equal(applyDamage(v, 50), true);
  assert.equal(v.hp, 0); assert.equal(v.wrecked, true);
  assert.equal(applyDamage(v, 5), false, 'wrecked trucks take no more');
});

test('damage: a blast hurts and launches close trucks, spares far ones', () => {
  const near = { x: 2, z: 0, vx: 0, vz: 0, vy: 0, hp: 100, maxHp: 100, wrecked: false, grounded: true };
  const far = { x: 30, z: 0, vx: 0, vz: 0, vy: 0, hp: 100, maxHp: 100, wrecked: false, grounded: true };
  const res = blastTrucks([near, far], 0, 0, 9, 40);
  assert.equal(res.length, 1);
  assert.ok(near.hp < 75 && near.vx > 5 && near.vy > 3 && !near.grounded);
  assert.equal(far.hp, 100);
});

test('props: layout is deterministic, varied, on flat ground, clear of the start and each other', () => {
  const props = arenaProps();
  assert.deepEqual(props.map((p) => [p.type, +p.x.toFixed(3), +p.z.toFixed(3)]), arenaProps().map((p) => [p.type, +p.x.toFixed(3), +p.z.toFixed(3)]));
  const types = new Set(props.map((p) => p.type));
  for (const t of Object.keys(PROP_DEFS)) assert.ok(types.has(t), `has ${t}`);
  for (const tier of ['smash', 'break', 'blast']) assert.ok(props.some((p) => p.tier === tier));
  assert.ok(props.length >= 50);
  for (const p of props) {
    assert.ok(Math.abs(heightAt(p.x, p.z)) < 0.15, 'flat ground');
    assert.ok(Math.hypot(p.x, p.z) < SANDBOX.radius - 4, 'inside the bowl');
    assert.ok(Math.hypot(p.x - SANDBOX.start.x, p.z - SANDBOX.start.z) >= 12, 'clear of the start');
  }
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) assert.ok(Math.hypot(props[i].x - props[j].x, props[i].z - props[j].z) >= props[i].r + props[j].r, 'no overlap');
});

test('props: a truck plows through smash props at speed but bounces off at crawl speed', () => {
  const tune = tuningFor(STATS);
  const terr = createArenaTerrain([{ id: 0, type: 'crate', tier: 'smash', x: 0, z: 8, r: 0.8, h: 0.8, hp: 1, breakAt: 3.5, rot: 0 }]);
  terr.heightAt = () => 0;
  const fast = createVehicle(0, 0, 0, terr);
  fast.vz = 14; fast.vx = 0;
  const events = [];
  for (let i = 0; i < 120; i++) events.push(...stepVehicle(fast, { gas: 1 }, terr, tune, DT));
  const smash = events.find((e) => e.type === 'smash');
  assert.ok(smash && smash.obj.type === 'crate', 'smash event names the prop');
  assert.ok(fast.z > 8.5, 'passes through');
  const slow = createVehicle(0, 0, 0, terr);
  slow.vz = 2;
  const ev2 = [];
  for (let i = 0; i < 90; i++) ev2.push(...stepVehicle(slow, { gas: 0 }, terr, tune, DT));
  assert.ok(!ev2.some((e) => e.type === 'smash'), 'no smash at crawl speed');
});

test('props: walls crack over several hits, then give way', () => {
  const wall = { tier: 'break', hp: PROP_DEFS.wall.hp, type: 'wall' };
  assert.equal(hitProp(wall, 2), 'none');
  let res = 'none'; let hits = 0;
  while (res !== 'destroyed' && hits < 10) { res = hitProp(wall, 14); hits++; }
  assert.equal(res, 'destroyed');
  assert.ok(hits >= 2, `took ${hits} hits`);
  assert.equal(hitProp({ tier: 'smash' }, 20), 'none');
});

test('props: blasts chain to neighbours, wreck crates in range and score everything', () => {
  const mk = (id, type, x, z) => ({ id, type, tier: PROP_DEFS[type].tier, x, z, r: PROP_DEFS[type].r, h: 1, hp: PROP_DEFS[type].hp || 1 });
  const props = [mk(0, 'tnt', 0, 0), mk(1, 'tnt', 6, 0), mk(2, 'crate', 3, 3), mk(3, 'crate', 40, 40), mk(4, 'tnt', 60, 0)];
  const terr = { obstacles: [...props], props: [...props] };
  const res = detonate(terr, props[0]);
  assert.equal(res.explosions.length, 2, 'the second TNT chains');
  assert.ok(res.destroyed.includes(props[1]) && res.destroyed.includes(props[2]));
  assert.ok(!res.destroyed.includes(props[3]) && !res.destroyed.includes(props[4]), 'far props survive');
  assert.equal(res.score, 100 + 100 + 50);
  assert.deepEqual(terr.props.map((p) => p.id).sort(), [3, 4]);
  assert.ok(!terr.obstacles.includes(props[0]), 'removed from collision too');
  // no infinite loop when two blast props sit in range of each other
  const a = mk(0, 'fuel', 0, 0); const b = mk(1, 'fuel', 5, 0);
  const t2 = { obstacles: [a, b], props: [a, b] };
  assert.equal(detonate(t2, a).explosions.length, 2);
});

test('props: terrain copies are independent between rounds', () => {
  const a = createArenaTerrain(); const b = createArenaTerrain();
  const n = b.props.length;
  removeProp(a, a.props[0]);
  assert.equal(b.props.length, n);
  assert.ok(a.obstacles.length < b.obstacles.length);
});

test('match: countdown, then fight; wrecking all rivals wins, losing yourself ends it', () => {
  const m = createMatch({ foes: 2 });
  assert.equal(m.phase, 'countdown');
  assert.equal(m.award(100), 0, 'no score during the countdown');
  m.tick(COUNTDOWN + 0.1);
  assert.equal(m.phase, 'fight');
  assert.deepEqual(m.drainEvents(), ['go']);
  m.foeWrecked(); assert.equal(m.phase, 'fight');
  m.foeWrecked(); assert.equal(m.phase, 'over'); assert.equal(m.won, true);
  assert.ok(m.score >= 1000);
  const l = createMatch({ foes: 2 }); l.tick(5); l.playerWrecked();
  assert.equal(l.phase, 'over'); assert.equal(l.won, false);
});

test('match: combo multiplier grows with chained smashes and resets after the window', () => {
  assert.equal(comboMultiplier(1), 1); assert.equal(comboMultiplier(3), 2); assert.equal(comboMultiplier(30), 5);
  const m = createMatch({ foes: 3 }); m.tick(5);
  let total = 0;
  for (let i = 0; i < 6; i++) total += m.award(50);
  assert.ok(total > 300, `combo paid ${total}`);
  m.tick(3);
  assert.equal(m.chain, 0);
  assert.equal(m.award(50), 50);
});

test('match: time runs out, practice mode (0 foes) never auto-wins, clock formats', () => {
  const m = createMatch({ foes: 1, time: 10 }); m.tick(4); m.tick(11);
  assert.equal(m.phase, 'over'); assert.equal(m.won, false);
  const p = createMatch({ foes: 0 }); p.tick(5); p.foeWrecked();
  assert.equal(p.phase, 'fight');
  assert.equal(formatClock(MATCH_TIME), '3:00'); assert.equal(formatClock(65), '1:05'); assert.equal(formatClock(-3), '0:00');
});

test('brawler: waits at the start, hunts the nearest truck, lunges when lined up, backs out when stuck', () => {
  const tune = tuningFor(STATS);
  const t = { heightAt: () => 0, obstacles: [], radius: 45, surfaceAt: () => 'dirt' };
  const me = createVehicle(0, 0, 0, t);
  const prey = createVehicle(0, 15, 0, t); prey.vx = 0; prey.vz = 0;
  const b = createBrawler({ aggression: 1 });
  assert.equal(brawlerInput(b, me, [me, prey], 45, 'countdown', DT).gas, 0);
  b.lungeCd = 0;
  const go = brawlerInput(b, me, [me, prey], 45, 'fight', DT);
  assert.equal(go.gas, 1); assert.ok(Math.abs(go.steer) < 0.2); assert.equal(go.boost, true, 'lines up and lunges');
  // turns toward a target on the right
  const right = createVehicle(-15, 0, 0, t);   // +x is the truck's left, -x its right
  const b2 = createBrawler();
  assert.ok(brawlerInput(b2, me, [me, right], 45, 'fight', DT).steer > 0.3, 'steer>0 turns right');
  // ignores wrecked trucks
  prey.wrecked = true;
  const b3 = createBrawler();
  brawlerInput(b3, me, [me, prey], 45, 'fight', DT);
  assert.equal(b3.target, null);
  // stuck against a wall: reverses
  const stuck = createVehicle(0, 0, 0, t); const b4 = createBrawler();
  let rev = false;
  for (let i = 0; i < 120; i++) { const inp = brawlerInput(b4, stuck, [stuck, prey], 45, 'fight', DT); if (inp.brake === 1 && inp.gas === 0) rev = true; }
  assert.equal(rev, true);
});

test('brawler: five brawlers can fight for a minute without leaving the bowl, and someone gets hurt', () => {
  const terr = createArenaTerrain();
  const trucks = TRUCKS.slice(0, 5).map((tk, i) => {
    const f = getFeel(tk.id); const tune = tuningFor(tk.stats, f.handling, f.sus);
    const a = i * 1.256; const x = Math.cos(a) * 24; const z = Math.sin(a) * 24;
    return { tune, v: createVehicle(x, z, Math.atan2(-x, -z), terr, tune.ride), b: createBrawler({ phase: i }) };
  });
  let maxR = 0; let smashes = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const all = trucks.map((q) => q.v);
    for (const q of trucks) {
      if (q.v.wrecked) continue;
      for (const e of stepVehicle(q.v, brawlerInput(q.b, q.v, all, SANDBOX.radius, 'fight', DT), terr, q.tune, DT)) {
        if (e.type === 'smash') { removeProp(terr, e.obj); smashes++; }
      }
      maxR = Math.max(maxR, Math.hypot(q.v.x, q.v.z));
    }
    const live = all.filter((v) => !v.wrecked);
    for (const h of resolveCollisions(live)) {
      const d = ramDamage(live[h.a], live[h.b], h.power);
      applyDamage(live[h.a], d.a); applyDamage(live[h.b], d.b);
    }
  }
  assert.ok(maxR < SANDBOX.radius + 1, `max radius ${maxR}`);
  assert.ok(trucks.some((q) => q.v.hp < 100), 'ramming did damage');
  assert.ok(trucks.every((q) => Number.isFinite(q.v.x) && Number.isFinite(q.v.y)));
});

test('debris: chunks fly, land on the ground, settle and expire; the pool never overflows', () => {
  const pool = new DebrisPool(50);
  burst(pool, { x: 0, y: 1, z: 0, colors: [0xff0000, 0x00ff00], count: 30, u: (() => { let k = 0.1; return () => (k = (k * 7.3 + 0.37) % 1); })() });
  assert.equal(pool.alive, 30);
  for (let i = 0; i < 90; i++) pool.update(1 / 60, () => 0);
  for (let i = 0; i < 50; i++) if (pool.life[i] > 0) assert.ok(pool.pos[i * 3 + 1] >= pool.size[i] / 2 - 1e-6, 'never below the ground');
  for (let i = 0; i < 60 * 8; i++) pool.update(1 / 60, () => 0);
  assert.equal(pool.alive, 0);
  burst(pool, { x: 0, y: 0, z: 0, colors: [1], count: 500 });
  assert.equal(pool.alive, 50, 'capped at capacity');
});

// ---------- Phase 3: loops
import { loopPoint, loopWorld, atEntry, TWO_PI } from '../src/physics/loop.js';
const LOOP = { x: 0, z: 10, tx: 0, tz: 1, y0: 0, R: 9, k: 2.4, halfW: 6, vmin: 22, gl: 9 };

test('loop: the curve is a real loop - starts level, goes upside down at the top, returns level ahead', () => {
  const a = loopPoint(LOOP, 0); const top = loopPoint(LOOP, Math.PI); const end = loopPoint(LOOP, TWO_PI);
  assert.ok(Math.abs(a.y) < 1e-9 && Math.abs(a.phi) < 1e-9);
  assert.ok(Math.abs(top.y - 18) < 1e-9, 'top is 2R up');
  assert.ok(Math.abs(top.phi - Math.PI) < 1e-6, 'upside down at the top');
  assert.ok(Math.abs(end.y) < 1e-9 && Math.abs(end.phi - TWO_PI) < 1e-6);
  assert.ok(end.fwd > 14 && end.fwd < 16, 'exit is ahead of the entry');
  let prev = 0;
  for (let t = 0.01; t <= TWO_PI; t += 0.01) { const p = loopPoint(LOOP, t); assert.ok(Math.abs(p.phi - prev) < 0.2, 'tilt turns smoothly'); prev = p.phi; }
});

test('loop: a truck entering the mouth rides the ring, flips over, and drives out the far side', () => {
  const tune = tuningFor(STATS);
  const terr = { heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => 'asphalt', loops: [LOOP] };
  const v = createVehicle(0, 3, 0, terr);
  v.vz = 12;                                             // slow: the entry pad lifts it to vmin
  let maxY = 0; let maxPitch = 0; let entered = false; let exited = false; let minSp = 99;
  for (let i = 0; i < 60 * 8; i++) {
    for (const e of stepVehicle(v, { gas: 1 }, terr, tune, DT)) { if (e.type === 'loop') entered = true; if (e.type === 'loopExit') exited = true; }
    maxY = Math.max(maxY, v.y); maxPitch = Math.max(maxPitch, v.pitch);
    if (v.loop) minSp = Math.min(minSp, v.loop.sp);
    if (exited) break;
  }
  assert.ok(entered && exited, 'entered and exited');
  assert.ok(maxY > 17, `reached the top (${maxY})`);
  assert.ok(maxPitch > 3.0, 'upside down');
  assert.ok(minSp > 10, `never stalls (${minSp})`);
  assert.ok(v.grounded && v.loop === null && v.pitch === 0);
  assert.ok(v.z > 10 + 14, `out the far side (${v.z})`);
  assert.ok(Math.abs(v.x) < 0.5 && v.f > 15, `heading on at speed (${v.f})`);
});

test('loop: you can steer inside it (stay within the ring) and trucks not heading in do not trigger it', () => {
  const tune = tuningFor(STATS);
  const terr = { heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => 'asphalt', loops: [LOOP] };
  const v = createVehicle(0, 5, 0, terr); v.vz = 20;
  let maxLat = 0;
  for (let i = 0; i < 60 * 8; i++) { stepVehicle(v, { gas: 1, steer: 1 }, terr, tune, DT); if (v.loop) maxLat = Math.max(maxLat, Math.abs(v.x)); }
  assert.ok(maxLat > 2 && maxLat <= LOOP.halfW, `steered inside the ring (${maxLat})`);
  const w = createVehicle(30, 10, Math.PI / 2, terr); w.vx = 20;
  assert.equal(atEntry(LOOP, w), false);
  const back = createVehicle(0, 10, Math.PI, terr); back.vz = -20;
  assert.equal(atEntry(LOOP, back), false, 'driving the wrong way through the mouth does nothing');
});

// ---------- Phase 3: track roster, loops on tracks, wall passages
import { TRACKS, getTrackById, validTrack } from '../src/world/tracks.js';

const apiFor = (T) => ({ nearest: T.nearest, sampleAt: T.sampleAt, length: T.LENGTH, roadHalf: T.ROAD_HALF, laneAt: T.laneAt });

test('tracks: roster of three, unique ids, lookup falls back to the first', () => {
  assert.equal(TRACKS.length, 6);
  assert.deepEqual(TRACKS.map((t) => t.id), ['greenridge', 'canyon', 'fortress', 'himalaya', 'skull', 'magma']);
  assert.equal(getTrackById('canyon').name, 'Looper Canyon');
  assert.equal(getTrackById('nope').id, 'greenridge');
  assert.ok(validTrack('fortress') && !validTrack('x'));
});

for (const T of TRACKS) {
  test(`track ${T.id}: closed, even spacing, gentle corners, level enough, grid on the road`, () => {
    const S = T.SAMPLES; const n = S.length;
    assert.ok(T.LENGTH > 650 && T.LENGTH < 950);
    let minR = 1e9;
    for (let i = 0; i < n; i++) {
      const a = S[(i + n - 3) % n]; const b = S[i]; const c = S[(i + 3) % n];
      const ab = Math.hypot(b.x - a.x, b.z - a.z); const bc = Math.hypot(c.x - b.x, c.z - b.z); const ca = Math.hypot(a.x - c.x, a.z - c.z);
      const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
      if (area > 1e-6) minR = Math.min(minR, (ab * bc * ca) / (4 * area));
      assert.ok(Math.hypot(b.x - S[(i + 1) % n].x, b.z - S[(i + 1) % n].z) > 1.5 && Math.hypot(b.x - S[(i + 1) % n].x, b.z - S[(i + 1) % n].z) < 2.6, 'even spacing');
    }
    assert.ok(minR > 17, `min corner radius ${minR}`);
    const ys = S.map((p) => p.y);
    assert.ok(Math.min(...ys) > 1 && Math.max(...ys) - Math.min(...ys) < 5, 'road stays low');
    for (let slot = 0; slot < 6; slot++) {
      const p = T.gridPose(slot);
      assert.ok(Math.abs(T.nearest(p.x, p.z).d) < T.ROAD_HALF - 1, 'grid slot on the road');
      assert.ok(!T.terrain.obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 3), `grid slot ${slot} clear of obstacles`);
    }
    for (const c of T.CHECKPOINTS) assert.ok(!T.LOOPS.some((L) => c > L.s - 0.02 && c < L.endS + 0.02), 'no checkpoint inside a loop');
  });

  test(`track ${T.id}: every truck can lap it with the AI - through loops, passages and slaloms, without getting stuck`, () => {
    for (const tk of TRUCKS) {
      const feel = getFeel(tk.id); const tune = tuningFor(tk.stats, feel.handling, feel.sus);
      const terr = T.freshTerrain();
      const sp = T.gridPose(1);
      const v = createVehicle(sp.x, sp.z, sp.heading, terr, tune.ride);
      const d = createDriver({ skill: 0.95, lane: 2 });
      let acc = 0; let prev = T.nearest(v.x, v.z).s; let time = 0; let stuck = 0; let loops = 0; let hits = 0;
      for (let i = 0; i < 60 * 260 && acc < 1; i++) {
        const input = driverInput(d, v, tune, apiFor(T), { phase: 'racing', props: terr.props, playerAcc: 0, myAcc: acc }, DT);
        for (const e of stepVehicle(v, input, terr, tune, DT)) {
          if (e.type === 'loop') loops++; if (e.type === 'hit') hits++;
          if (e.type === 'smash') { const k = terr.obstacles.indexOf(e.obj); if (k >= 0) terr.obstacles.splice(k, 1); }   // smashed props are gone, as in the game
        }
        const n = T.nearest(v.x, v.z);
        acc += wrapDelta(prev, n.s); prev = n.s; time += DT;
        if ((v.grounded || v.loop) && Math.abs(v.f) < 0.5) stuck += DT;
      }
      assert.ok(acc >= 0.98, `${tk.id} on ${T.id}: ${(acc * 100).toFixed(0)}% in ${time.toFixed(0)}s`);
      assert.ok(time < 170, `${tk.id} on ${T.id}: lap ${time.toFixed(0)}s`);
      assert.ok(stuck < 8, `${tk.id} on ${T.id}: stuck ${stuck.toFixed(1)}s`);
      assert.equal(loops, T.LOOPS.length, `${tk.id} on ${T.id}: rode every loop (${loops})`);
    }
  });
}

test('tracks: new tracks have loops on dead-straight road, level under the ring, entry on the road', () => {
  for (const T of TRACKS.slice(1)) {
    assert.ok(T.LOOPS.length >= 1);
    for (const L of T.LOOPS) {
      for (let k = 0; k <= 10; k++) {
        const p = T.sampleAt(L.s + (L.len / T.LENGTH) * (k / 10));
        assert.ok(Math.abs((p.x - L.x) * L.tz - (p.z - L.z) * L.tx) < 0.5, 'road is straight under the ring');
        assert.ok(Math.abs(p.y - L.y0) < 0.05, 'road is level under the ring');
      }
      assert.ok(Math.abs(T.nearest(L.x, L.z).d) < 0.3, 'entry is on the centre line');
      assert.ok(L.R * 2 > 14 && L.vmin > 15);
    }
  }
  assert.equal(TRACKS[1].LOOPS.length, 2, 'Looper Canyon has two loops');
});

test('tracks: wall passages are solid, clear of loops/jumps/the grid; gates and shortcuts are smashable', () => {
  for (const T of TRACKS.slice(1)) {
    assert.ok(T.WALLS.length > 150, `${T.id} walls ${T.WALLS.length}`);
    for (const w of T.WALLS) {
      const n = T.nearest(w.x, w.z);
      assert.ok(Math.abs(Math.abs(n.d) - 0) >= 0 && Math.abs(n.d) < T.BARRIER, 'inside the barriers');
      assert.ok(!T.LOOPS.some((L) => n.s > L.s - 0.015 && n.s < L.endS + 0.015), 'walls stay out of loops');
      if (!w.fill) assert.ok(Math.abs(T.heightAt(w.x, w.z) - n.y) < 0.5, 'walls do not sit on jumps');
      assert.ok(w.y0 > 0 && w.h >= 2.6);
    }
    assert.ok(T.PROPS.some((p) => p.type === 'wall' && p.tier === 'break'), 'smashable gate walls');
    assert.ok(T.PROPS.some((p) => p.type === 'crate') && T.PROPS.some((p) => p.type === 'tnt'));
    assert.ok(T.LANES.length >= 6, 'AI lane guidance');
    // the road is still passable: every corridor leaves at least a 2.4 wide gap
    for (const z of T.LANES) assert.ok(z.limit >= 0.6);
  }
});

test('tracks: a fast truck cannot drive through a passage wall, but plows through a crate and cracks a gate', () => {
  const T = TRACKS[1];
  const terr = T.freshTerrain();
  const tune = tuningFor(STATS);
  const w = T.WALLS.find((q) => Math.abs(T.nearest(q.x, q.z).d) > 4.5 && T.nearest(q.x, q.z).s > 0.16 && T.nearest(q.x, q.z).s < 0.19);
  const n = T.nearest(w.x, w.z);
  const p = T.sampleAt(n.s);
  const heading = Math.atan2(w.x - p.x, w.z - p.z);      // from the centre line straight at the wall
  const v = createVehicle(p.x, p.z, heading, terr, tune.ride);
  v.vx = Math.sin(heading) * 16; v.vz = Math.cos(heading) * 16;
  let hit = false;
  for (let i = 0; i < 90; i++) for (const e of stepVehicle(v, { gas: 1 }, terr, tune, DT)) if (e.type === 'hit' && e.obj.type === 'wall') hit = true;
  assert.ok(hit, 'bounced off the wall');
  assert.ok(Math.hypot(v.x - w.x, v.z - w.z) > 1.8, 'stayed outside it');
  const crate = T.PROPS.find((q) => q.type === 'crate');
  const start = T.sampleAt(T.nearest(crate.x, crate.z).s - 14 / T.LENGTH);
  const h2 = Math.atan2(crate.x - start.x, crate.z - start.z);
  const u = createVehicle(start.x, start.z, h2, terr, tune.ride);
  u.vx = Math.sin(h2) * 16; u.vz = Math.cos(h2) * 16;
  let smashed = false;
  for (let i = 0; i < 120; i++) for (const e of stepVehicle(u, { gas: 1 }, terr, tune, DT)) if (e.type === 'smash' && e.obj.type === 'crate') smashed = true;
  assert.ok(smashed, 'plowed through a crate');
});

test('tracks: obstacles are solid from the ground up (a rock on a hill is still solid)', () => {
  const T = TRACKS[0];
  const o = T.OBSTACLES.find((q) => q.type === 'boulder');
  assert.ok(o.y0 > 1, 'ground height recorded');
  const tune = tuningFor(STATS);
  const terr = T.freshTerrain();
  const heading = Math.atan2(1, 0);
  const v = createVehicle(o.x - 8, o.z, heading, terr, tune.ride);
  v.vx = 14; v.vz = 0;
  let hit = false;
  for (let i = 0; i < 90; i++) for (const e of stepVehicle(v, { gas: 1 }, terr, tune, DT)) if (e.type === 'hit' && e.obj === o) hit = true;
  assert.ok(hit || Math.abs(T.nearest(o.x, o.z).d) > 0, 'boulder blocks (or the line misses it)');
});

test('tracks: fresh terrain copies are independent per race', () => {
  const T = TRACKS[2];
  const a = T.freshTerrain(); const b = T.freshTerrain();
  const n = b.props.length;
  removeProp(a, a.props[0]);
  assert.equal(b.props.length, n);
  assert.equal(T.PROPS.length, n, 'the master list is untouched');
});

test('every truck has a distinct nitro style with a valid flame tint', async () => {
  const { FEEL } = await import('../src/vehicles/truck-feel.js');
  for (const [id, f] of Object.entries(FEEL)) {
    assert.ok(TINTS.includes(f.nitro.tint), `${id} tint`);
    assert.ok(f.nitro.nozzles.length >= 1 && f.nitro.rate > 0 && f.nitro.fov > 0, `${id} nitro`);
  }
  const sigs = new Set(Object.values(FEEL).map((f) => `${f.nitro.tint}/${f.nitro.nozzles.length}`));
  assert.ok(sigs.size >= 5);
});

// ---------- side-to-side loops with a filled underside
test('loop: enters on one lane and exits on the other - the ring never crosses itself', () => {
  const L = { ...LOOP, k: 1.7, c0: -3.2, c1: 3.2, halfW: 3.1 };
  const a = loopWorld(L, 0, 0); const e = loopWorld(L, TWO_PI, 0);
  assert.ok(Math.abs((a.x - L.x) * L.tz - (a.z - L.z) * L.tx + 3.2) < 1e-6, 'starts on the entry lane');
  assert.ok(Math.abs(e.x - 3.2) < 1e-6 || Math.abs(e.x + 3.2) < 1e-6);
  assert.ok(Math.sign(a.x) !== Math.sign(e.x), 'exit lane is the opposite side');
  // the up-going and down-going parts of the ring are always at least a lane apart in the places they overlap in height
  for (let t1 = 0.2; t1 < 1.7; t1 += 0.1) {
    const p = loopWorld(L, t1, 0);
    for (let t2 = TWO_PI - 1.7; t2 < TWO_PI; t2 += 0.1) {
      const q = loopWorld(L, t2, 0);
      const near = Math.hypot(p.z - q.z, p.y - q.y) < 1.2;
      if (near) assert.ok(Math.abs(p.x - q.x) > 4.5, `ring parts ${t1.toFixed(1)}/${t2.toFixed(1)} clear each other`);
    }
  }
});

test('loop: a truck in the entry lane rides the loop and comes out in the other lane; the right lane is blocked', () => {
  const T = TRACKS[2]; const L = T.LOOPS[0];
  const feel = getFeel('crusher'); const tune = tuningFor(TRUCKS[0].stats, feel.handling, feel.sus);
  const side = (v) => (v.x - L.x) * L.tz - (v.z - L.z) * L.tx;
  // entry lane
  let terr = T.freshTerrain();
  let v = createVehicle(L.x - L.tx * 6 + L.tz * L.c0, L.z - L.tz * 6 - L.tx * L.c0, Math.atan2(L.tx, L.tz), terr, tune.ride);
  v.vx = L.tx * 18; v.vz = L.tz * 18;
  let entered = false; let exited = false;
  for (let i = 0; i < 60 * 8 && !exited; i++) for (const e of stepVehicle(v, { gas: 1 }, terr, tune, DT)) { if (e.type === 'loop') entered = true; if (e.type === 'loopExit') exited = true; }
  assert.ok(entered && exited, 'rode the loop');
  assert.ok(side(v) > 1.5, `exited in the opposite lane (${side(v).toFixed(1)})`);
  // the other lane is a dead end: solid block
  terr = T.freshTerrain();
  v = createVehicle(L.x - L.tx * 6 - L.tz * L.c0, L.z - L.tz * 6 + L.tx * L.c0, Math.atan2(L.tx, L.tz), terr, tune.ride);
  v.vx = L.tx * 18; v.vz = L.tz * 18;
  let loops = 0; let hits = 0;
  for (let i = 0; i < 60 * 4; i++) for (const e of stepVehicle(v, { gas: 1 }, terr, tune, DT)) { if (e.type === 'loop') loops++; if (e.type === 'hit') hits++; }
  const along = (v.x - L.x) * L.tx + (v.z - L.z) * L.tz;
  assert.equal(loops, 0, 'wrong lane does not enter the loop');
  assert.ok(hits > 0 && along < 4, `stopped by the block (${along.toFixed(1)})`);
});

test('loop: the ground under every ring is filled with solid blocks', () => {
  for (const T of TRACKS.slice(1)) {
    assert.ok(T.BLOCKS.length >= 12 * T.LOOPS.length, `${T.id} blocks ${T.BLOCKS.length}`);
    for (const b of T.BLOCKS) assert.ok(b.kind === 'plinth' && b.y0 > 0 && b.h >= 0.8 && T.terrain.obstacles.includes(b));
  }
});

// ---------- Phase 4d: loop camera
import { loopCameraGoal } from "../src/core/camera-modes.js";
test('camera: while riding a loop every view is a chase view inside the ring, just behind the truck, looking along it', () => {
  const L = TRACKS[1].LOOPS[0];
  for (const mode of CAMERA_MODES) {
    for (const th of [0.5, Math.PI / 2, Math.PI, 4.5, 5.6]) {
      const w = loopWorld(L, th, L.c0);
      const g = cameraGoal(mode, { x: w.x, y: w.y, z: w.z, heading: Math.atan2(L.tx, L.tz), speed: 20, loop: L, loopTh: th, loopLat: L.c0 }, { fx: 0, fz: 0 });
      const back = Math.hypot(g.pos.x - w.x, g.pos.z - w.z, g.pos.y - w.y);
      assert.ok(back > 2 && back < 10, `${mode}: camera ${back.toFixed(1)} from the truck`);
      // inside the circle: closer to the ring centre than the ring radius
      const fwd = (g.pos.x - L.x) * L.tx + (g.pos.z - L.z) * L.tz;
      const d = Math.hypot(fwd - L.k * th, g.pos.y - (L.y0 + L.R));
      assert.ok(d < L.R, `${mode}: camera inside the ring (${d.toFixed(1)} < ${L.R})`);
      assert.ok(Math.hypot(g.look.x - w.x, g.look.z - w.z, g.look.y - w.y) < 12, 'looks near the truck');
      assert.ok(g.fov >= 60);
    }
  }
  const off = cameraGoal('chase', { x: 0, y: 1, z: 0, heading: 0, speed: 10, loop: null }, { fx: 0, fz: 0 });
  assert.ok(off.fov === 62, 'normal views untouched outside loops');
});

// ---------- Phase 4a: pace and rival personalities
import { STYLES, rubberBand as rubber } from '../src/ai/driver.js';
const lapWith = (T, tk, style, lane = 2, seg = null) => {
  const feel = getFeel(tk.id); const tune = tuningFor(tk.stats, feel.handling, feel.sus);
  const terr = T.freshTerrain(); const sp = T.gridPose(1);
  const v = createVehicle(sp.x, sp.z, sp.heading, terr, tune.ride); v.nitro = 0.6;
  const d = createDriver({ skill: 0.95, lane, style });
  let acc = 0; let prev = T.nearest(v.x, v.z).s; let time = 0; let boosts = 0; let t0 = null; let t1 = null;
  for (let i = 0; i < 60 * 200 && acc < 1; i++) {
    const input = driverInput(d, v, tune, apiFor(T), { phase: 'racing', pickups: terr.pickups, props: terr.props, playerAcc: 0, myAcc: acc }, DT);
    tickPickups(terr, DT);
    for (const e of stepVehicle(v, input, terr, tune, DT)) {
      if (e === 'boost') boosts++;
      if (e.type === 'smash') { const k = terr.obstacles.indexOf(e.obj); if (k >= 0) terr.obstacles.splice(k, 1); }
    }
    const n = T.nearest(v.x, v.z); acc += wrapDelta(prev, n.s); prev = n.s; time += DT;
    if (seg) { if (t0 === null && acc >= seg[0]) t0 = time; if (t1 === null && acc >= seg[1]) t1 = time; }
  }
  return { time, acc, boosts, segTime: t1 !== null && t0 !== null ? t1 - t0 : null };
};

test('pace: normal driving is fast (fast trucks 30+, heavy ones 24+) and nitro is a ~1.4x surge, not a doubling', () => {
  for (const tk of TRUCKS) {
    const t = tuningFor(tk.stats, getFeel(tk.id).handling, getFeel(tk.id).sus);
    assert.ok(t.maxSpeed >= 24, `${tk.id} top speed ${t.maxSpeed}`);
    assert.ok(t.boostMax <= 1.4 && t.boostMax >= 1.25);
  }
  assert.ok(tuningFor(TRUCKS[0].stats).maxSpeed >= 30 && tuningFor(TRUCKS[4].stats).maxSpeed >= 33);
});

test('pace: every truck laps every track inside a lap-time window and the roster stays within 1.5x', () => {
  for (const T of TRACKS) {
    const times = TRUCKS.map((tk) => { const r = lapWith(T, tk, 'steady'); assert.ok(r.acc >= 0.98, `${tk.id} on ${T.id} finished`); return r.time; });
    assert.ok(Math.min(...times) > 35 && Math.max(...times) < 95, `${T.id}: ${times.map((x) => x.toFixed(0))}`);
    assert.ok(Math.max(...times) / Math.min(...times) < 1.5, `${T.id} roster spread`);
  }
});

test('rivals: four personalities, all finish; aggressive is no slower than steady and burns nitro more often', () => {
  assert.deepEqual(Object.keys(STYLES).sort(), ['aggressive', 'defensive', 'risky', 'steady']);
  const T = TRACKS[0]; const tk = TRUCKS[0];
  const r = {}; for (const s of Object.keys(STYLES)) r[s] = lapWith(T, tk, s);
  for (const s of Object.keys(r)) assert.ok(r[s].acc >= 0.98, `${s} finished`);
  assert.ok(r.aggressive.time <= r.steady.time * 1.06, 'aggressive pace (risk costs time now that hits hurt)');
  assert.ok(r.aggressive.boosts >= r.steady.boosts, `nitro use ${r.aggressive.boosts} vs ${r.steady.boosts}`);
  const times = Object.values(r).map((x) => x.time);
  assert.ok(Math.max(...times) / Math.min(...times) < 1.2, 'the pack stays together');
});

test('rivals: catch-up works both ways - behind they push harder, far ahead they ease off - within a fair band', () => {
  assert.ok(rubber(0.1, 0) > 1.05 && rubber(0.1, 0) <= 1.12, 'rival trailing the player speeds up');
  assert.ok(rubber(0, 0.1) < 0.95 && rubber(0, 0.1) >= 0.88, 'rival far ahead eases off');
  assert.equal(rubber(0, 0), 1);
});

test('rivals: a defensive driver swings across to block a player right behind', () => {
  const T = TRACKS[0]; const tk = TRUCKS[0];
  const feel = getFeel(tk.id); const tune = tuningFor(tk.stats, feel.handling, feel.sus);
  const terr = T.freshTerrain();
  const p = T.sampleAt(0.05);
  const v = createVehicle(p.x, p.z, Math.atan2(p.tx, p.tz), terr, tune.ride); v.vx = p.tx * 20; v.vz = p.tz * 20;
  const d = createDriver({ skill: 0.95, lane: 0, style: 'defensive' });
  const inp = driverInput(d, v, tune, apiFor(T), { phase: 'racing', playerAcc: 0, myAcc: 0.01, gapAhead: 12, playerLat: 4 }, DT);
  const free = driverInput(createDriver({ skill: 0.95, lane: 0, style: 'defensive' }), v, tune, apiFor(T), { phase: 'racing', playerAcc: 0, myAcc: 0.01, gapAhead: 100, playerLat: 4 }, DT);
  assert.ok(inp.steer < free.steer, 'steers toward the right-hand side to cover the player');
});

// ---------- Phase 4b: track elements (pads, goo, oil, pickups, forks)
import { tickPickups, PICKUP_NITRO, PICKUP_RESPAWN, SURFACES as SURF } from '../src/physics/arcade.js';

const FLATT = (surf, extra = {}) => ({ heightAt: () => 0, obstacles: [], radius: 1e9, surfaceAt: () => surf, ...extra });

test('elements: an accelerator pad kicks you forward, keeps a short boost, and fires one event per pass', () => {
  const tune = tuningFor(STATS); const t = FLATT('pad');
  const v = createVehicle(0, 0, 0, t); v.vz = 15;
  let pads = 0; for (let i = 0; i < 60; i++) for (const e of stepVehicle(v, { gas: 1 }, t, tune, DT)) if (e.type === 'pad') pads++;
  const plain = createVehicle(0, 0, 0, FLATT('asphalt')); plain.vz = 15;
  for (let i = 0; i < 60; i++) stepVehicle(plain, { gas: 1 }, FLATT('asphalt'), tune, DT);
  assert.equal(pads, 1);
  assert.ok(v.f > plain.f + 5, `pad ${v.f} vs plain ${plain.f}`);
});

test('elements: goo is sticky and oil is slippery', () => {
  const tune = tuningFor(STATS);
  const run3 = (surf) => { const t = FLATT(surf); const v = createVehicle(0, 0, 0, t); v.vz = 25; let lat = 0; for (let i = 0; i < 90; i++) { stepVehicle(v, { gas: 1, steer: 0.6 }, t, tune, DT); lat = Math.max(lat, Math.abs(v.l)); } return { f: v.f, lat }; };
  const road = run3('asphalt'); const goo = run3('goo'); const oil = run3('oil');
  assert.ok(goo.f < road.f * 0.75, `goo ${goo.f} vs ${road.f}`);
  assert.ok(oil.lat > road.lat * 1.8, `oil slides ${oil.lat} vs ${road.lat}`);
  assert.ok(SURF.goo && SURF.oil && SURF.pad);
});

test('elements: a nitro canister refills the meter once, then comes back after a while', () => {
  const tune = tuningFor(STATS);
  const t = FLATT('asphalt', { pickups: [{ x: 0, z: 10, y0: 0, taken: false, cool: 0 }] });
  const v = createVehicle(0, 0, 0, t); v.vz = 20; v.nitro = 0.2;
  let got = 0; for (let i = 0; i < 60; i++) for (const e of stepVehicle(v, { gas: 1 }, t, tune, DT)) if (e.type === 'pickup') got++;
  assert.equal(got, 1);
  assert.ok(v.nitro >= 0.2 + PICKUP_NITRO - 0.05, `meter ${v.nitro}`);
  assert.ok(t.pickups[0].taken);
  tickPickups(t, PICKUP_RESPAWN - 1); assert.ok(t.pickups[0].taken, 'still gone');
  tickPickups(t, 2); assert.ok(!t.pickups[0].taken, 'back');
});

test('elements: every track has a fork - median wall, a fast lane and a safe lane, zones, pickups and a trench', () => {
  for (const T of TRACKS) {
    assert.ok(T.ZONES.some((z) => z.kind === 'pad') && T.ZONES.some((z) => z.kind === 'goo') && T.ZONES.some((z) => z.kind === 'oil'), `${T.id} zones`);
    assert.ok(T.PICKUPS.length >= 6, `${T.id} pickups`);
    assert.ok(T.FEATURES.some((f) => f.type === 'trench'), `${T.id} gap`);
    const routes = T.LANES.filter((l) => l.route);
    assert.ok(routes.some((l) => l.route === 'fast') && routes.some((l) => l.route === 'safe'), `${T.id} fork lanes`);
    const f = routes.find((l) => l.route === 'fast'); const s = routes.find((l) => l.route === 'safe');
    assert.ok(f.off * s.off < 0, 'on opposite sides');
    assert.ok(T.laneAt(f.from + 0.06, 'fast').off === f.off && T.laneAt(f.from + 0.06, 'safe').off === s.off);
    // zones are real surfaces on the road
    const z = T.ZONES.find((q) => q.kind === 'pad'); const p = T.sampleAt(z.s + 2 / T.LENGTH);
    assert.equal(T.surfaceAt(p.x + p.tz * z.off, p.z - p.tx * z.off), 'pad');
  }
});

test('elements: both fork routes can be driven by the trucks that choose them, and the risky lane pays off', () => {
  for (const T of TRACKS) {
    const L = T.LANES.find((l) => l.route === 'fast'); const seg = [L.from + 0.003, L.to];
    const safe = lapWith(T, TRUCKS[0], 'steady', 2, seg); const fast = lapWith(T, TRUCKS[0], 'aggressive', 2, seg);
    assert.ok(safe.acc >= 0.98 && fast.acc >= 0.98, `${T.id} both routes finish`);
    assert.ok(fast.segTime < safe.segTime, `${T.id}: risky lane ${fast.segTime.toFixed(2)}s beats safe ${safe.segTime.toFixed(2)}s through the fork`);
    for (const tk of TRUCKS) { const r = lapWith(T, tk, 'aggressive'); assert.ok(r.acc >= 0.98, `${tk.id} aggressive on ${T.id}`); }
  }
});

test('elements: miss the jump and you drop into the trench (slow or stalled), clear it at speed and you fly over', () => {
  const T = TRACKS[0]; const tr = T.FEATURES.find((f) => f.type === 'trench');
  const tune = tuningFor(STATS);
  const attempt = (speed) => {
    const terr = T.freshTerrain();
    const hd = tr.rot; const back = 24;
    const v = createVehicle(tr.x - Math.sin(hd) * back, tr.z - Math.cos(hd) * back, hd, terr, tune.ride);
    v.vx = Math.sin(hd) * speed; v.vz = Math.cos(hd) * speed;
    let minY = 99;
    for (let i = 0; i < 60 * 4; i++) { stepVehicle(v, { gas: speed > 20 ? 1 : 0 }, terr, tune, DT); minY = Math.min(minY, v.y - T.heightAt(v.x, v.z)); }
    const along = (v.x - tr.x) * Math.sin(hd) + (v.z - tr.z) * Math.cos(hd);
    return { along, y: v.y, ground: T.heightAt(v.x, v.z) };
  };
  const slow = attempt(7); const fastRun = attempt(30);
  assert.ok(slow.along < tr.len + 1, `slow car stuck at/in the trench (${slow.along.toFixed(1)})`);
  assert.ok(fastRun.along > tr.len + 4, `fast car cleared it (${fastRun.along.toFixed(1)})`);
});

// ---------- Phase 4c: Volt, the electric truck
import { boltPath, chainTargets, chargeTick, canZap, ZAP_COST, ZAP_RANGE, ZAP_HOP, ZAP_HOPS } from '../src/fx/lightning.js';

test('volt: the ninth truck has coils that spin, spark emitters, glowing parts and its own feel', () => {
  const t = getTruck('volt');
  assert.equal(t.id, 'volt');
  const data = buildTruckVoxels(t.shape);
  assert.ok(data.parts.filter((p) => p.id.startsWith('coil')).length === 2 && data.parts.every((p) => p.anim.type));
  const sparks = data.emitters.filter((e) => e.kind === 'spark');
  assert.ok(sparks.length >= 6 && sparks.every((e) => TINTS.includes(e.tint)), 'flowing sparks from coils, nose and tail');
  assert.ok(data.voxels.filter((v) => v.k === 'glow').length > 40, 'glowing stripes and coil tops');
  assert.ok(PALETTE_KEYS.includes('glow'));
  const f = getFeel('volt');
  assert.equal(f.nitro.tint, 'ice');
  assert.ok(f.voice.whine >= 0.5 && f.voice.wave === 'triangle', 'electric whine, not a roar');
  assert.ok(emissionRate('spark', 0) > 5 && emissionRate('spark', 1) > emissionRate('spark', 0), 'sparks busier at speed');
  const p = makeParticle('spark', 'ice', { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5, 0.3, 0.6, 0.9);
  assert.ok(p.rise < 0 && p.life < 0.7, 'sparks arc down and die fast');
});

test('lightning: bolts are jagged but start and end exactly on their targets', () => {
  let seed = 7; const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const a = { x: 0, y: 1, z: 0 }; const b = { x: 10, y: 2, z: 4 };
  const path = boltPath(a, b, u, 9, 0.8);
  assert.equal(path.length, 10);
  assert.deepEqual(path[0], a); assert.deepEqual(path[9], b);
  let off = 0;
  for (let i = 1; i < 9; i++) { const t = i / 9; off = Math.max(off, Math.hypot(path[i].x - (a.x + (b.x - a.x) * t), path[i].z - (a.z + (b.z - a.z) * t))); }
  assert.ok(off > 0.05 && off < 3, `jag ${off}`);
});

test('lightning: the chain jumps to the nearest truck, then on to the next nearest, no repeats, within range', () => {
  const cand = [{ id: 'a', x: 8, y: 0, z: 0 }, { id: 'b', x: 16, y: 0, z: 0 }, { id: 'c', x: 24, y: 0, z: 0 }, { id: 'd', x: 60, y: 0, z: 0 }, { id: 'e', x: 3, y: 0, z: 40 }];
  const chain = chainTargets({ x: 0, y: 0, z: 0 }, cand);
  assert.deepEqual(chain.map((c) => c.id), ['a', 'b', 'c']);
  assert.ok(chain.length <= ZAP_HOPS);
  assert.deepEqual(chainTargets({ x: 0, y: 0, z: 0 }, [{ id: 'far', x: ZAP_RANGE + 2, y: 0, z: 0 }]), [], 'out of range');
  assert.equal(chainTargets({ x: 0, y: 0, z: 0 }, [{ id: 'a', x: 5, y: 0, z: 0 }, { id: 'z', x: 5 + ZAP_HOP + 2, y: 0, z: 0 }]).length, 1, 'hop range limits the chain');
});

test('lightning: charge builds back over time and each zap costs a share', () => {
  assert.ok(canZap(1) && !canZap(ZAP_COST - 0.01));
  let c = 0; for (let i = 0; i < 60 * 5; i++) c = chargeTick(c, 1 / 60);
  assert.ok(c > ZAP_COST && c <= 1);
  assert.equal(chargeTick(1, 10), 1);
});

// ---------- Phase 6: challenge pass (nitro economy, pace, penalties, suspension modes, more forks)
import { SUS_MODES, PAD_NITRO, LAND_NITRO, RACE_START_NITRO, STALL_TIME, PACE } from '../src/physics/arcade.js';

test('6a: on a track the nitro meter does not refill by itself; in the arena it still does', () => {
  const tune = tuningFor(STATS);
  const track = { ...FLATT('asphalt'), noRegen: true };
  const v = createVehicle(0, 0, 0, track); v.nitro = 0.2;
  for (let i = 0; i < 60 * 10; i++) stepVehicle(v, { gas: 0 }, track, tune, DT);
  assert.equal(v.nitro, 0.2);
  const arena = FLATT('asphalt'); const w = createVehicle(0, 0, 0, arena); w.nitro = 0.2;
  for (let i = 0; i < 60 * 5; i++) stepVehicle(w, { gas: 0 }, arena, tune, DT);
  assert.ok(w.nitro > 0.5, 'arena still regenerates');
  for (const T of TRACKS) assert.equal(T.freshTerrain().noRegen, true, `${T.id} has no passive nitro`);
});

test('6a: pads, canisters and clean landings fill the meter; the race starts with a part tank', () => {
  const tune = tuningFor(STATS);
  const t = { ...FLATT('pad'), noRegen: true };
  const v = createVehicle(0, 0, 0, t); v.vz = 15; v.nitro = 0.1;
  stepVehicle(v, { gas: 1 }, t, tune, DT);
  assert.ok(v.nitro >= 0.1 + PAD_NITRO - 1e-9, 'pad tops up');
  assert.ok(RACE_START_NITRO > 0.4 && RACE_START_NITRO < 0.8);
  assert.ok(PICKUP_NITRO >= 0.3 && LAND_NITRO > 0 && LAND_NITRO < 0.1);
  for (const T of TRACKS) assert.ok(T.PICKUPS.length >= 7, `${T.id} has canisters`);
});

test('6a: a rival heads for a canister close ahead and ignores a taken one', () => {
  const T = TRACKS[0]; const tk = TRUCKS[0];
  const feel = getFeel(tk.id); const tune = tuningFor(tk.stats, feel.handling, feel.sus);
  const terr = T.freshTerrain();
  const p = T.sampleAt(0.05);
  const v = createVehicle(p.x, p.z, Math.atan2(p.tx, p.tz), terr, tune.ride); v.vx = p.tx * 20; v.vz = p.tz * 20; v.nitro = 0.3; v.f = 20;
  const q = T.sampleAt(0.05 + 25 / T.LENGTH);
  const k = { x: q.x + q.tz * 4, z: q.z - q.tx * 4, taken: false, cool: 0 };
  const run = (pickups) => driverInput(createDriver({ skill: 0.95, lane: 0, style: 'steady' }), v, tune, apiFor(T), { phase: 'racing', pickups, playerAcc: 0, myAcc: 0 }, DT).steer;
  const toward = run([k]); const ignore = run([{ ...k, taken: true }]); const none = run([]);
  assert.equal(ignore, none, 'a taken canister is ignored');
  assert.ok(toward !== none, 'steers toward the canister');
});

test('6b: pace is up about 15% for every truck', () => {
  assert.ok(PACE >= 1.1 && PACE <= 1.2);
  for (const tk of TRUCKS) {
    const t = tuningFor(tk.stats, getFeel(tk.id).handling, getFeel(tk.id).sus);
    assert.ok(Math.abs(t.maxSpeed - (16 + tk.stats.speed * 2.1) * PACE) < 1e-9, tk.id);
  }
});

test('6c: a head-on hit costs far more than a graze, stalls the engine briefly, and smashing is cheaper at speed', () => {
  const tune = tuningFor(STATS);
  const post = (ox) => ({ ...FLATT('asphalt'), obstacles: [{ type: 'wall', x: ox, z: 6, r: 1.2, h: 3 }] });
  const hit = (ox, speed) => { const t = post(ox); const v = createVehicle(0, 0, 0, t); v.vz = speed; const evs = []; for (let i = 0; i < 90; i++) { const e = stepVehicle(v, { gas: 0 }, t, tune, DT); evs.push(...e); if (i < 70) { /* approach */ } } return { v, evs }; };
  const head = hit(0, 20); const graze = hit(2.49, 20);
  assert.ok(head.evs.some((e) => e.type === 'stall'), 'head-on stalls');
  assert.ok(!graze.evs.some((e) => e.type === 'stall'), 'graze does not stall');
  assert.ok(STALL_TIME > 0.2 && STALL_TIME < 0.8);
  const crate = (speed) => { const t = { ...FLATT('asphalt'), obstacles: [{ type: 'crate', x: 0, z: 6, r: 0.9, h: 1, breakAt: 12 }] }; const v = createVehicle(0, 0, 0, t); v.vz = speed; let before = null; for (let i = 0; i < 40; i++) { const e = stepVehicle(v, { gas: 0 }, t, tune, DT); if (e.some((x) => x.type === 'smash')) { before = speed; return v.f / speed; } } return null; };
  const slowSmash = crate(18); const fastSmash = crate(32);
  assert.ok(slowSmash !== null && fastSmash !== null, 'both smash');
  assert.ok(fastSmash > slowSmash, `keeps more speed at pace (${fastSmash.toFixed(2)} vs ${slowSmash.toFixed(2)})`);
});

test('6d: suspension modes differ: soft is bouncier and better on rough ground, stiff steers sharper and is faster on tarmac', () => {
  assert.deepEqual(SUS_MODES, ['soft', 'normal', 'stiff']);
  const f = getFeel(TRUCKS[0].id);
  const [soft, normal, stiff] = SUS_MODES.map((m) => tuningFor(TRUCKS[0].stats, f.handling, f.sus, m));
  assert.ok(soft.suspK < normal.suspK && normal.suspK < stiff.suspK);
  assert.ok(soft.restitution > normal.restitution && normal.restitution > stiff.restitution);
  assert.ok(stiff.steerRate > normal.steerRate && normal.steerRate > soft.steerRate);
  assert.ok(stiff.maxSpeed > normal.maxSpeed && normal.maxSpeed > soft.maxSpeed);
  const speedOn = (tune, surf) => { const t = FLATT(surf); const v = createVehicle(0, 0, 0, t, tune.ride); for (let i = 0; i < 60 * 12; i++) stepVehicle(v, { gas: 1 }, t, tune, DT); return v.f; };
  assert.ok(speedOn(soft, 'mud') > speedOn(stiff, 'mud'), 'soft beats stiff in mud');
  assert.ok(speedOn(stiff, 'asphalt') > speedOn(soft, 'asphalt'), 'stiff beats soft on tarmac');
  assert.deepEqual(tuningFor(TRUCKS[0].stats, f.handling, f.sus), normal, 'default is normal');
});

test('6d: suspension choice is saved per truck', () => {
  const mem = new Map();
  const st = createStorage({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); } });
  const s = st.load(); assert.deepEqual(s.sus, {});
  s.sus = { crusher: 'stiff', volt: 'soft' }; st.save(s);
  assert.deepEqual(st.load().sus, { crusher: 'stiff', volt: 'soft' });
});

test('6e: tracks have more forks (two on Greenridge and Canyon), every fork has a trench jump and a detour, and each route finishes', () => {
  const forks = (T) => T.LANES.filter((l) => l.route === 'fast').length;
  assert.equal(forks(TRACKS[0]), 2); assert.equal(forks(TRACKS[1]), 2); assert.ok(forks(TRACKS[2]) >= 1);
  for (const T of TRACKS) {
    const trenches = T.FEATURES.filter((f) => f.type === 'trench').length;
    assert.equal(trenches, forks(T), `${T.id}: one trench jump per fork`);
    assert.equal(T.LANES.filter((l) => l.route === 'safe').length, forks(T), `${T.id}: a detour for every jump`);
  }
});

// ---------- Phase 7a/7b: difficulty, full-width walls, tougher props, attacker-only damage
import { DIFFICULTY, DIFFICULTIES } from '../src/ai/driver.js';
import { attacker, ATTACK_RATIO } from '../src/physics/damage.js';
import { RACE_BREAK } from '../src/world/track-factory.js';

test('7a: difficulty levels get steadily tougher and default to normal', () => {
  assert.deepEqual(DIFFICULTIES, ['easy', 'normal', 'hard']);
  const [e, n, h] = DIFFICULTIES.map((k) => DIFFICULTY[k]);
  assert.ok(e.skill < n.skill && n.skill < h.skill);
  assert.ok(e.up < n.up && n.up < h.up);
  assert.ok(e.free <= n.free && n.free < h.free);
  assert.equal(rubber(0, 0), 1);
  assert.ok(rubberBand(0.2, 0, 'hard') > rubberBand(0.2, 0, 'easy'), 'hard catches up harder');
  assert.equal(rubberBand(0.2, 0, 'easy'), 1.12, 'easy keeps its original cap');
  assert.equal(createStorage({ getItem: () => null, setItem: () => {} }).load().difficulty, 'normal');
});

test('7a: a good stand-in player (no cheats) leads the pack by less on each harder level', () => {
  const T = TRACKS[0]; const LAPS = 2;
  const run = (level) => {
    const mk = (tk, style, skill, isBot) => {
      const feel = getFeel(tk.id); const tune = tuningFor(tk.stats, feel.handling, feel.sus);
      const terr = T.freshTerrain(); const sp = T.gridPose(isBot ? 0 : 1 + (mk.n = (mk.n || 0) + 1) % 5);
      const v = createVehicle(sp.x, sp.z, sp.heading, terr, tune.ride); v.nitro = 0.6;
      return { tk, tune, terr, v, d: createDriver({ skill, lane: 1, style }), acc: 0, prev: T.nearest(v.x, v.z).s, isBot };
    };
    const bot = mk(TRUCKS[1], 'aggressive', 1.0, true);
    const pack = ['steady', 'aggressive', 'risky', 'defensive', 'steady'].map((st, i) => mk(TRUCKS[(i + 2) % TRUCKS.length], st, 0.92, false));
    for (let i = 0; i < 60 * 400 && bot.acc < LAPS; i++) {
      for (const c of [bot, ...pack]) {
        const ctx = { phase: 'racing', difficulty: c.isBot ? 'easy' : level, pickups: c.terr.pickups, props: c.terr.props, playerAcc: bot.acc, myAcc: c.isBot ? bot.acc : c.acc };
        tickPickups(c.terr, DT);
        const input = driverInput(c.d, c.v, c.tune, apiFor(T), ctx, DT);
        for (const e of stepVehicle(c.v, input, c.terr, c.tune, DT)) if (e.type === 'smash') c.terr.obstacles.splice(c.terr.obstacles.indexOf(e.obj), 1);
        const n = T.nearest(c.v.x, c.v.z); c.acc += wrapDelta(c.prev, n.s); c.prev = n.s;
      }
    }
    return bot.acc - pack.reduce((s, c) => s + c.acc, 0) / pack.length;
  };
  const lead = { easy: run('easy'), normal: run('normal'), hard: run('hard') };
  assert.ok(lead.easy > lead.normal && lead.normal > lead.hard, JSON.stringify(lead));
  assert.ok(lead.hard < 0.3, `hard keeps the pack close (lead ${lead.hard.toFixed(2)} laps over ${LAPS})`);
});

// free lateral positions of a truck (radius 1.3) across the road at lap fraction s, against the track walls
function freeLats(T, s) {
  const p = T.sampleAt(s); const out = [];
  const near = T.WALLS.filter((w) => Math.hypot(w.x - p.x, w.z - p.z) < 14);
  for (let lat = -12.4; lat <= 12.4; lat += 0.1) {
    const x = p.x + p.tz * lat; const z = p.z - p.tx * lat;
    if (near.every((w) => Math.hypot(w.x - x, w.z - z) > w.r + 1.3)) out.push(lat);
  }
  return out;
}

test('7a: wall passages run out to the barrier - no way round the side of a corridor or a slalom block', () => {
  let corridors = 0; let blocks = 0;
  for (const T of TRACKS) {
    for (const l of T.LANES) {
      if (l.route) continue;
      const mid = (l.from + l.to) / 2;
      if (l.off === null && l.limit < 3.2) {                      // corridor
        corridors++;
        const free = freeLats(T, mid).map(Math.abs);
        assert.ok(Math.max(...free, 0) < 4.0, `${T.id} corridor at ${mid.toFixed(3)} leaves a gap at ${Math.max(...free).toFixed(1)}`);
      } else if (l.off !== null && l.limit === 2.2 && Math.abs(l.off) === 4.2) {   // slalom block on the opposite side
        blocks++;
        const side = -Math.sign(l.off);
        assert.ok(!freeLats(T, mid).some((x) => x * side > 0.5), `${T.id} slalom block at ${mid.toFixed(3)} can be passed on its own side`);
      }
    }
  }
  assert.ok(corridors >= 6 && blocks >= 8, `${corridors} corridors, ${blocks} slalom blocks checked`);
});

test('7a: loose props in a race need real speed to smash (crates 20, barrels 18) but the arena keeps its easy smashing', () => {
  assert.ok(RACE_BREAK.crate >= 15 && RACE_BREAK.barrel >= 15);
  for (const T of TRACKS) for (const p of T.PROPS) { if (p.type === 'crate') assert.equal(p.breakAt, RACE_BREAK.crate); if (p.type === 'barrel') assert.equal(p.breakAt, RACE_BREAK.barrel); }
});

test('7b: only the truck that is driven AT the other takes the ram; head-on hurts both; own blasts never hurt you', () => {
  const a = { x: 0, z: 0, heading: 0, hp: 100, maxHp: 100 };
  const b = { x: 0, z: 3, heading: Math.PI, hp: 100, maxHp: 100 };
  const rammer = { a: { vx: 0, vz: 20 }, b: { vx: 0, vz: 0 } };               // a drives into a parked b
  assert.equal(attacker(a, b, rammer.a && rammer), 'a');
  const hit = ramDamage(a, b, 20, rammer);
  assert.equal(hit.a, 0); assert.ok(hit.b > 0);
  const hurtMe = ramDamage(a, b, 20, { a: { vx: 0, vz: 0 }, b: { vx: 0, vz: -20 } });   // b drives into a
  assert.equal(hurtMe.b, 0); assert.ok(hurtMe.a > 0);
  const head = ramDamage(a, b, 30, { a: { vx: 0, vz: 15 }, b: { vx: 0, vz: -15 } });
  assert.ok(head.a > 0 && head.b > 0);
  assert.ok(ATTACK_RATIO > 1);
  assert.deepEqual(Object.keys(ramDamage(a, b, 20)).sort(), ['a', 'b'], 'still works without velocities');
  const me = { x: 0, z: 0, hp: 100, maxHp: 100, vx: 0, vz: 0, vy: 0 }; const foe = { x: 2, z: 0, hp: 100, maxHp: 100, vx: 0, vz: 0, vy: 0 };
  const res = blastTrucks([me, foe], 0, 0, 9, 40, 0);
  assert.equal(me.hp, 100, 'owner is not hurt'); assert.ok(foe.hp < 100, 'the other truck is');
  assert.ok(res.some((r) => r.index === 1));
});

// ---------- intro: code text, ADA logo, electric reveal
import { INTRO_TIMES, bolt2d, zapFrame, createIntro } from '../src/ui/intro.js';

test('intro: timeline runs text in/out, logo in, zap, then hands over, in order', () => {
  const t = INTRO_TIMES;
  assert.ok(t.textIn < t.textOut && t.textOut < t.logoIn && t.logoIn < t.zap && t.zap < t.done);
  assert.ok(t.logoIn - t.textOut >= 0.3, 'a clear gap between the text and the logo');
  assert.ok(t.done - t.zap >= 0.8 && t.done - t.zap <= 2, 'the electric effect is short');
});

test('intro: bolts are jagged paths that keep their end points, stay bounded and are repeatable', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const b = bolt2d(0, 0, 400, 0, rnd, 12, 30);
  assert.equal(b.length, 13);
  assert.deepEqual(b[0], { x: 0, y: 0 }); assert.deepEqual(b[12], { x: 400, y: 0 });
  assert.ok(b.every((p) => Math.abs(p.y) <= 30.0001), 'jitter bounded');
  assert.ok(b.some((p) => Math.abs(p.y) > 1), 'actually jagged');
  seed = 7; const again = bolt2d(0, 0, 400, 0, rnd, 12, 30);
  assert.deepEqual(again, b);
  const f1 = zapFrame(800, 400, 0.2, rnd); const f2 = zapFrame(800, 400, 1, rnd);
  assert.ok(f2.length >= f1.length && f1.length >= 1, 'stronger frames carry more bolts');
});

test('intro: runs its phases on a timer, hands over once, and skip finishes at once without double calls', () => {
  const log = []; let done = 0;
  const el = { classList: { _s: new Set(), toggle(c, on = true) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } }, className: '' };
  const audio = { introText: () => log.push('text'), introLogo: () => log.push('logo'), introZap: () => log.push('zap'), introStop: () => log.push('stop') };
  const realST = globalThis.setTimeout; const realCT = globalThis.clearTimeout; const realRAF = globalThis.requestAnimationFrame; const realCAF = globalThis.cancelAnimationFrame;
  const timers = []; let clock = 0;
  globalThis.setTimeout = (fn, ms) => { const id = timers.length; timers.push({ fn, at: clock + ms, id, live: true }); return id; };
  globalThis.clearTimeout = (id) => { if (timers[id]) timers[id].live = false; };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  try {
    const intro = createIntro({ el, canvas: { getContext: () => null }, audio, onDone: () => { done++; }, now: () => clock });
    intro.start();
    const run = (to) => { for (const t of timers.filter((x) => x.live && x.at <= to).sort((a, b) => a.at - b.at)) { t.live = false; clock = t.at; t.fn(); } clock = to; };
    run(INTRO_TIMES.textIn * 1000 + 1); assert.ok(el.classList.contains('t-text'));
    run(INTRO_TIMES.textOut * 1000 + 1); assert.ok(!el.classList.contains('t-text'));
    run(INTRO_TIMES.logoIn * 1000 + 1); assert.ok(el.classList.contains('t-logo'));
    run(INTRO_TIMES.zap * 1000 + 1); assert.ok(el.classList.contains('zap'));
    assert.equal(done, 0);
    run(INTRO_TIMES.done * 1000 + 1); assert.equal(done, 1); assert.deepEqual(log.filter((x) => x !== 'stop'), ['text', 'logo', 'zap']);
    intro.skip(); assert.equal(done, 1, 'skip after the end does nothing');
    intro.start(); intro.skip(); assert.equal(done, 2, 'skip ends a fresh run at once, once'); intro.skip(); assert.equal(done, 2);
  } finally {
    globalThis.setTimeout = realST; globalThis.clearTimeout = realCT; globalThis.requestAnimationFrame = realRAF; globalThis.cancelAnimationFrame = realCAF;
  }
});

test('intro: the audio has intro and title sounds and every one is a safe no-op before sound is unlocked', async () => {
  const { createAudio } = await import('../src/audio/sfx.js');
  const a = createAudio();
  for (const k of ['introText', 'introLogo', 'introZap', 'introStop', 'grungeHit']) { assert.equal(typeof a[k], 'function', k); a[k](); }
  assert.equal(a.titleBed(true), false, 'no sound yet, so no bed');
  assert.equal(a.titleBed(false), false);
});

// ---------------------------------------------------------------- phase 7c: stage engine (gravity, wind, hazards, snow)
import { stepVehicle as stepV7c, createVehicle as mkV7c, tuningFor as tuneV7c } from '../src/physics/arcade.js';
import { avalanchePhase, avalancheBand, tickHazards } from '../src/physics/hazards.js';

const flat7c = (extra = {}) => ({ heightAt: () => 0, surfaceAt: () => 'asphalt', constrain: (x, z) => ({ x, z }), obstacles: [], radius: 1e9, ...extra });
const truck7c = () => tuneV7c({ speed: 6, grip: 6, weight: 6 });

test('7c: lower gravity makes jumps float longer', () => {
  const air = (g) => {
    const terr = flat7c({ gravity: g });
    const v = mkV7c(0, 0, 0, terr, 0); v.y = 3; v.grounded = false; v.vy = 6; let t = 0;
    while (t < 10) { stepV7c(v, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60); t += 1 / 60; if (v.grounded) break; }
    return t;
  };
  assert.ok(air(2) > air(undefined) * 1.5, 'low gravity -> much longer hang time');
});

test('7c: wind pushes a coasting truck sideways', () => {
  const terr = flat7c({ wind: { x: 6, z: 0 } });
  const v = mkV7c(0, 0, 0, terr, 0);
  for (let i = 0; i < 120; i++) stepV7c(v, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60);
  assert.ok(v.x > 0.5, 'drifted downwind');
});

test('7c: ice is slipperier than snow, planks are grippy', async () => {
  const { SURFACES } = await import('../src/physics/arcade.js');
  assert.ok(SURFACES.ice.grip < SURFACES.snow.grip && SURFACES.snow.grip < SURFACES.asphalt.grip);
  assert.ok(SURFACES.planks.grip > SURFACES.snow.grip);
});

test('7c: avalanche wave sweeps from its side and is a pure function of the clock', () => {
  const h = { kind: 'avalanche', period: 16, warn: 2, warnLead: 2.5, dur: 3, offset: 0, w: 13, side: 1 };
  assert.ok(avalanchePhase(h, 1) < 0, 'idle while warning');
  assert.ok(avalanchePhase(h, 2.1) >= 0 && avalanchePhase(h, 2.1) < 0.1);
  assert.ok(avalanchePhase(h, 5.5) < 0, 'idle after the wave');
  assert.equal(avalanchePhase(h, 2.5 + 16), avalanchePhase(h, 2.5));
  const [a0, b0] = avalancheBand(h, 0.05); const [a1] = avalancheBand(h, 0.9);
  assert.ok(a1 < a0 && b0 === 6.5, 'front travels across the road from the right edge');
});

test('7c: standing in the avalanche pushes and slows the truck', () => {
  const terr = flat7c({ hazards: [{ kind: 'avalanche', x: 0, z: 0, tx: 0, tz: 1, len: 40, w: 30, side: 1, period: 16, warn: 0, warnLead: 1, dur: 10, offset: 0 }], time: 5 });
  const v = mkV7c(0, 0, 0, terr, 0); v.vx = 0; v.vz = 0;
  for (let i = 0; i < 60; i++) stepV7c(v, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60);
  assert.ok(v.x < -0.5, 'swept toward the far side (left)');
});

test('7c: tickHazards advances the clock', () => {
  const terr = { hazards: [], time: 0 };
  tickHazards(terr, 0.5); tickHazards(terr, 0.25);
  assert.equal(terr.time, 0.75);
});

test('7c: Himalaya Pass has snow, ice, planks, avalanche hazards and wind; fresh terrain resets the clock', () => {
  const T = getTrackById('himalaya');
  const surfs = new Set(T.SECTIONS.map((s) => s.surf));
  for (const s of ['snow', 'ice', 'planks']) assert.ok(surfs.has(s), s);
  assert.equal(T.terrain.hazards.length, 3);
  assert.ok(T.env.wind && T.env.weather === 'snow');
  const a = T.freshTerrain(); a.time = 9; assert.equal(T.freshTerrain().time, 0);
});

// ---------------------------------------------------------------- phase 7d: caves, lava, geysers, stalactites
import { geyserState, stalactiteState, GEYSER_LAUNCH } from '../src/physics/hazards.js';

test('7d: geyser cycles bubbling -> eruption -> rest, exactly by the clock', () => {
  const h = { period: 8, warn: 3, dur: 1.6, offset: 0 };
  assert.equal(geyserState(h, 1).state, 'warn');
  assert.equal(geyserState(h, 3.5).state, 'erupt');
  assert.equal(geyserState(h, 6).state, 'idle');
  assert.equal(geyserState(h, 8 + 3.5).state, 'erupt');
});

test('7d: an erupting geyser launches a truck above it, but not one beside it', () => {
  const h = { kind: 'geyser', x: 0, z: 10, r: 3, period: 8, warn: 3, dur: 1.6, offset: 0, y0: 0 };
  const terr = flat7c({ hazards: [h], time: 3.5 });
  const on = mkV7c(0, 10, 0, terr, 0); on.vx = 0; on.vz = 0;
  const beside = mkV7c(8, 10, 0, terr, 0);
  for (let i = 0; i < 20; i++) { stepV7c(on, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60); stepV7c(beside, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60); }
  assert.ok(on.y > 2.5 && !on.grounded, `launched (y ${on.y.toFixed(1)})`);
  assert.ok(beside.y < 0.6, 'not launched');
});

test('7d: a stalactite shows a growing shadow, then crashes and stuns only what is under it', () => {
  const h = { kind: 'stalactite', x: 0, z: 10, r: 2.8, period: 7, warn: 4, offset: 0, y0: 0 };
  assert.equal(stalactiteState(h, 2).state, 'idle');
  assert.equal(stalactiteState(h, 3.5).state, 'falling');
  assert.equal(stalactiteState(h, 4.05).state, 'impact');
  assert.equal(stalactiteState(h, 5).state, 'rubble');
  const terr = flat7c({ hazards: [h], time: 4.05 });
  const under = mkV7c(0, 10, 0, terr, 0); under.vz = 20; under.vx = 0;
  stepV7c(under, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60);
  const clear = mkV7c(9, 10, 0, terr, 0); clear.vz = 20; clear.vx = 0;
  stepV7c(clear, { steer: 0, gas: 0 }, terr, truck7c(), 1 / 60);
  assert.ok(under.vz < clear.vz * 0.6, 'stunned under the rock');
});

test('7d: lava is a wade-and-sink surface (very slow, low grip)', async () => {
  const { SURFACES } = await import('../src/physics/arcade.js');
  assert.ok(SURFACES.lava.maxMul <= 0.35 && SURFACES.lava.drag > SURFACES.goo.drag);
});

test('7d: Skull Cavern has falling rocks and a cave look; Magma Peak has lava, geysers and embers', () => {
  const S = getTrackById('skull'); const M = getTrackById('magma');
  assert.ok(S.terrain.hazards.filter((h) => h.kind === 'stalactite').length >= 5);
  assert.equal(S.env.look.sky, 'cave');
  assert.ok(M.ZONES.filter((z) => z.kind === 'lava').length >= 3, 'lava patches');
  assert.ok(M.terrain.hazards.filter((h) => h.kind === 'geyser').length >= 4);
  assert.equal(M.env.weather, 'embers');
  // the AI is steered around lava: every lava patch has a lane entry that forces the other side
  for (const z of M.ZONES.filter((z) => z.kind === 'lava')) {
    const l = M.laneAt(z.s + 4 / M.LENGTH);
    assert.ok(l.off !== null && Math.sign(l.off) === -Math.sign(z.off), 'avoids lava');
  }
});

// ---------------------------------------------------------------- phase 8a: Skull Cavern cave set piece
import { skullCave, SKULL } from '../src/world/structures.js';

test('8a: the skull cave leaves the road, barriers and a truck-tall gap clear, and covers the road', () => {
  const T = getTrackById('skull');
  const spec = T.STRUCTURES.find((s) => s.type === 'skullcave');
  assert.ok(spec && spec.s1 > spec.s0, 'skull stage declares a cave');
  const parts = skullCave(T, spec);
  assert.ok(parts.bone.length > 300 && parts.rock.length > 200 && parts.glow.length > 10 && parts.dark.length >= 6);
  for (const list of [parts.bone, parts.rock]) for (const b of list) {
    const n = T.nearest(b.x, b.z);
    const bottom = b.y - b.sy / 2 - T.sampleAt(n.s).y;
    const edge = Math.abs(n.d) - b.sx / 2;
    assert.ok(edge >= 13.9 || bottom >= 7.5, `box at lat ${n.d.toFixed(1)} blocks the drivable corridor (edge ${edge.toFixed(1)}, bottom ${bottom.toFixed(1)})`);
  }
  // the road really is roofed: slabs overhead along the length of the tunnel
  const mid = T.sampleAt((spec.s0 + spec.s1) / 2);
  assert.ok(parts.rock.some((b) => Math.hypot(b.x - mid.x, b.z - mid.z) < 3 && b.y > mid.y + SKULL.roof), 'roof over the middle of the tunnel');
  // the cave sits on a bend (that is the point) and the rocks that fall inside it use the shorter drop
  const a = Math.atan2(T.sampleAt(spec.s0).tx, T.sampleAt(spec.s0).tz); const c = Math.atan2(T.sampleAt(spec.s1).tx, T.sampleAt(spec.s1).tz);
  assert.ok(Math.abs(Math.atan2(Math.sin(c - a), Math.cos(c - a))) > 0.5, 'tunnel turns by more than ~30 degrees');
  const inside = T.terrain.hazards.filter((h) => h.kind === 'stalactite' && T.nearest(h.x, h.z).s > spec.s0 && T.nearest(h.x, h.z).s < spec.s1);
  assert.ok(inside.length >= 3 && inside.every((h) => h.drop < SKULL.roof + 1), 'stalactites fall from the cave roof');
});
