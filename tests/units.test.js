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
test('roster has eight unique trucks with valid stats', () => {
  assert.equal(TRUCKS.length, 8);
  assert.equal(new Set(TRUCKS.map((t) => t.id)).size, 8);
  assert.equal(new Set(TRUCKS.map((t) => t.name)).size, 8);
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
      assert.ok(['smoke', 'flame'].includes(e.kind));
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
  assert.ok(Math.abs(v.nitro - (1 - BOOST_COST)) < 0.02);
  run(v, { steer: 0, gas: 1, brake: 0 }, FLAT, 1.2);
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

const TRACK_API = { nearest: TRK.nearest, sampleAt: TRK.sampleAt, length: TRK.LENGTH, roadHalf: TRK.ROAD_HALF };

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
  assert.ok(rubberBand(1, 0.9) > 1 && rubberBand(1, 0.9) <= 1.08);
  assert.ok(rubberBand(0.9, 1) < 1 && rubberBand(0.9, 1) >= 0.9);
  assert.equal(rubberBand(0.5, 0.5), 1);
  assert.equal(rubberBand(9, 0), 1.08);
});

test('ai: every rival truck can lap the track by itself, stays on the road and does not get stuck', () => {
  for (const t of TRUCKS) {
    const feel = getFeel(t.id);
    const tune = tuningFor(t.stats, feel.handling, feel.sus);
    const sp = TRK.gridPose(1);
    const v = createVehicle(sp.x, sp.z, sp.heading, TRK.terrain, tune.ride);
    const d = createDriver({ skill: 0.95, lane: 2 });
    let acc = 0; let prev = TRK.nearest(v.x, v.z).s; let time = 0; let offRoad = 0; let stuck = 0;
    for (let i = 0; i < 60 * 240 && acc < 1; i++) {
      const input = driverInput(d, v, tune, TRACK_API, { phase: 'racing', playerAcc: 0, myAcc: acc }, DT);
      stepVehicle(v, input, TRK.terrain, tune, DT);
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
  assert.equal(input.brake, 1);
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

test('physics: nitro is strong - top speed 1.5x+, big kick, and it plows through mud', () => {
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
  assert.ok(boosted > normal * 1.5, `boost ${boosted} vs ${normal}`);
  assert.ok(run2('mud', true) > run2('mud', false) * 1.8, 'nitro through mud');
});
