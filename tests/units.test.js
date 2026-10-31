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
    assert.ok(m.size.z >= 33 && m.size.z <= 50, `${t.id} length ${m.size.z}`);
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
test('flow: boot -> start -> intro -> title <-> garage, invalid events ignored', () => {
  const log = [];
  const f = createFlow((s, p) => log.push(`${p}>${s}`));
  assert.equal(f.state, 'boot');
  assert.equal(f.send('play'), false, 'cannot play from boot');
  assert.ok(f.send('ready'));
  assert.equal(f.send('skip'), false, 'cannot skip before intro');
  assert.ok(f.send('tap'));
  assert.equal(f.state, 'intro');
  assert.ok(f.send('skip'));
  assert.equal(f.state, 'title');
  assert.equal(f.send('tap'), false);
  assert.ok(f.send('play'));
  assert.equal(f.state, 'garage');
  assert.ok(f.send('back'));
  assert.equal(f.state, 'title');
  assert.deepEqual(log, ['boot>start', 'start>intro', 'intro>title', 'title>garage', 'garage>title']);
  for (const s of ['start', 'intro', 'title', 'garage']) assert.ok(SCREENS.includes(s));
});

test('intro can finish by timer as well as by skip', () => {
  const f = createFlow();
  f.send('ready'); f.send('tap');
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
