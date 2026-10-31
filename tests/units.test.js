import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTruckVoxels, PALETTE_KEYS } from '../src/vehicles/voxel-model.js';
import { TRUCKS, getTruck } from '../src/vehicles/truck-stats.js';
import { FixedStepper } from '../src/core/stepper.js';
import { createStorage, DEFAULTS } from '../src/core/storage.js';

test('roster has six unique trucks with valid stats', () => {
  assert.equal(TRUCKS.length, 6);
  assert.equal(new Set(TRUCKS.map((t) => t.id)).size, 6);
  for (const t of TRUCKS) {
    for (const k of ['speed', 'grip', 'weight']) {
      assert.ok(t.stats[k] >= 1 && t.stats[k] <= 10, `${t.id}.${k}`);
    }
  }
  assert.equal(getTruck('nope').id, TRUCKS[0].id);
});

test('every truck builds a detailed voxel model with 4 wheels', () => {
  for (const t of TRUCKS) {
    const m = buildTruckVoxels(t.shape);
    assert.equal(m.wheels.length, 4, t.id);
    assert.ok(m.voxels.length > 800, `${t.id} body too sparse: ${m.voxels.length}`);
    assert.ok(m.wheels[0].voxels.length > 100, `${t.id} wheel too sparse`);
    for (const v of m.voxels) assert.ok(PALETTE_KEYS.includes(v.k), `bad key ${v.k}`);
    assert.ok(m.size.z >= 30 && m.size.z <= 50, `${t.id} length ${m.size.z}`);
  }
});

test('voxel model has no duplicate positions and is deterministic', () => {
  const t = TRUCKS[0];
  const a = buildTruckVoxels(t.shape);
  const b = buildTruckVoxels(t.shape);
  assert.deepEqual(a.voxels, b.voxels);
  const keys = new Set(a.voxels.map((v) => `${v.x},${v.y},${v.z}`));
  assert.equal(keys.size, a.voxels.length);
});

test('wheels are symmetric left/right and sit on the ground', () => {
  const m = buildTruckVoxels(TRUCKS[1].shape);
  const left = m.wheels.filter((w) => w.side === 'L');
  const right = m.wheels.filter((w) => w.side === 'R');
  assert.equal(left.length, 2);
  assert.equal(right.length, 2);
  for (const w of m.wheels) {
    const minY = Math.min(...w.voxels.map((v) => v.y));
    assert.ok(Math.abs(w.cy + minY) <= 0.5, 'wheel bottom touches y=0');
  }
});

test('fixed stepper is frame-rate independent and bounded', () => {
  const s = new FixedStepper(1 / 60, 5);
  let total = 0;
  for (let i = 0; i < 120; i++) total += s.advance(1 / 120).steps; // 120fps for 1s
  assert.ok(Math.abs(total - 60) <= 1);
  const s2 = new FixedStepper(1 / 60, 5);
  assert.equal(s2.advance(5).steps, 5); // huge hitch is clamped
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

test('wheel rims face outward on both sides', () => {
  const m = buildTruckVoxels(TRUCKS[0].shape);
  for (const w of m.wheels) {
    const rimXs = w.voxels.filter((v) => v.k === 'rim' || v.k === 'chrome').map((v) => v.x);
    assert.ok(rimXs.length > 0);
    const expected = w.side === 'L' ? 0 : 3;
    assert.ok(rimXs.every((x) => x === expected), `${w.side} rim on x=${expected}`);
  }
});
