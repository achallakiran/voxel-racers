// Procedural voxel monster truck generator (v2: eight archetypes).
// Pure data (no three.js) so it can be tested in Node.
// Axes: x = width, y = up, z = length (front is +z). One unit = one voxel.
//
// Returns { voxels, wheels, parts, emitters, size, meta }
//   voxels:   static body voxels [{x,y,z,k}], k = palette key
//   wheels:   [{cx,cy,cz,side,voxels}]  voxels relative to wheel origin
//   parts:    animated pieces [{id,parent,pivot,anim,voxels}] voxels in ABSOLUTE coords
//   emitters: smoke/flame sources [{x,y,z,dx,dy,dz,kind,tint}]
//   size:     bounding size in voxels

export const PALETTE_KEYS = [
  'body', 'accent', 'rim', 'tire', 'tread', 'dark', 'glass', 'light', 'chrome', 'flame', 'skin', 'tooth',
];

const X0 = 5;
const X1 = 20; // body is 16 wide (inclusive)

function box(set, x0, x1, y0, y1, z0, z1, k) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) set(x, y, z, k);
}

function buildWheel(r, outerDx) {
  const voxels = [];
  const width = 4;
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dy * dy + dz * dz);
      if (d > r + 0.2) continue;
      for (let dx = 0; dx < width; dx++) {
        let k = 'tire';
        if (d > r - 1.1) {
          const ang = Math.atan2(dy, dz);
          const lug = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 14);
          if ((lug + dx) % 2 === 0) k = 'tread';
        }
        const outerFace = dx === outerDx;
        if (outerFace && d < r * 0.5) k = 'rim';
        if (outerFace && d < 1.2) k = 'chrome';
        voxels.push({ x: dx, y: dy, z: dz, k });
      }
    }
  }
  return voxels;
}

const DEFAULT_SHAPE = {
  wheelR: 5, axles: 2, cab: 'closed', bed: 'open', slabH: 3,
  cabH: 6, cabLen: 14, bedLen: 10, hoodLen: 8,
  stacks: 0, stackPos: 'bed', stackTint: 'black', features: [],
};

export function buildTruckVoxels(shapeIn) {
  const s = { ...DEFAULT_SHAPE, ...shapeIn };
  const has = (f) => s.features.includes(f);
  const R = s.wheelR;
  // monster wheels are huge: lengthen the truck until neighbouring wheels no longer overlap
  const minLen = 4 * R + 7 + (s.axles === 3 ? 2 * R + 2 : 0);
  const baseLen = s.bedLen + s.cabLen + s.hoodLen + 4;
  if (baseLen < minLen) {
    const pad = minLen - baseLen;
    if (s.bed === 'none' || s.bedLen === 0) s.hoodLen += pad;
    else { s.hoodLen += Math.ceil(pad / 2); s.bedLen += Math.floor(pad / 2); }
  }

  const map = new Map();
  const set = (x, y, z, k) => map.set(`${x},${y},${z}`, { x, y, z, k });
  const parts = [];
  const emitters = [];

  function addPart(id, pivot, anim, parent = null) {
    const p = { id, parent, pivot, anim, voxels: [] };
    const pm = new Map();
    p.map = pm;
    parts.push(p);
    return {
      p,
      set: (x, y, z, k) => pm.set(`${x},${y},${z}`, { x, y, z, k }),
      box(x0, x1, y0, y1, z0, z1, k) { box(this.set, x0, x1, y0, y1, z0, z1, k); },
    };
  }

  // ---- layout along z: [0,1] rear bumper | bed | cab | hood | [len-2,len-1] front bumper
  const length = s.bedLen + s.cabLen + s.hoodLen + 4;
  const bedZ0 = 2;
  const bedZ1 = bedZ0 + s.bedLen - 1;
  const cabZ0 = bedZ1 + 1;
  const cabZ1 = cabZ0 + s.cabLen - 1;
  const hoodZ0 = cabZ1 + 1;
  const hoodZ1 = length - 3;

  const axleY = R;
  const rearAxleZ = R + 2;
  const frontAxleZ = length - R - 2;
  const axleZs = s.axles === 3
    ? [rearAxleZ, rearAxleZ + 2 * R + 2, frontAxleZ]
    : [rearAxleZ, frontAxleZ];
  const baseY = Math.max(Math.round(R * 0.85), 6);   // body perches low between giant tyres
  const bodyTop = baseY + s.slabH;
  const cabTop = bodyTop + s.cabH;

  // ---- chassis
  box(set, X0 + 2, X0 + 3, baseY - 1, baseY - 1, 2, length - 3, 'dark');
  box(set, X1 - 3, X1 - 2, baseY - 1, baseY - 1, 2, length - 3, 'dark');
  for (const az of axleZs) box(set, 4, 21, axleY - 1, axleY, az - 1, az, 'dark');
  box(set, X0, X1, baseY, bodyTop, 2, length - 3, 'body');

  // ---- bumpers and lights
  const jaw = has('jaw');
  if (!jaw) box(set, X0 - 1, X1 + 1, baseY, baseY + 1, length - 2, length - 1, 'chrome');
  if (!jaw) box(set, X0 + 3, X1 - 3, baseY + 2, bodyTop + 1, length - 2, length - 2, 'dark');
  box(set, X0, X0 + 1, bodyTop, bodyTop + 1, length - 2, length - 2, 'light');
  box(set, X1 - 1, X1, bodyTop, bodyTop + 1, length - 2, length - 2, 'light');
  box(set, X0 - 1, X1 + 1, baseY, baseY + 1, 0, 1, 'chrome');
  box(set, X0, X0 + 1, bodyTop, bodyTop + 1, 1, 1, 'flame');
  box(set, X1 - 1, X1, bodyTop, bodyTop + 1, 1, 1, 'flame');

  // ---- bed
  if (s.bed === 'open' && s.bedLen > 0) {
    box(set, X0, X0 + 1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ1, 'body');
    box(set, X1 - 1, X1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ1, 'body');
    box(set, X0, X1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ0 + 1, 'accent');
  } else if (s.bed === 'flat') {
    box(set, X0, X0, bodyTop + 1, bodyTop + 1, bedZ0, bedZ1, 'dark');
    box(set, X1, X1, bodyTop + 1, bodyTop + 1, bedZ0, bedZ1, 'dark');
    box(set, X0, X1, bodyTop + 1, bodyTop + 1, bedZ0, bedZ0, 'accent');
  }

  // ---- cab variants
  const midX = 12;
  if (s.cab === 'closed') {
    box(set, X0 + 1, X1 - 1, bodyTop + 1, cabTop, cabZ0, cabZ1, 'body');
    box(set, X0, X0, bodyTop + 2, cabTop - 1, cabZ0 + 2, cabZ1 - 3, 'glass');
    box(set, X1, X1, bodyTop + 2, cabTop - 1, cabZ0 + 2, cabZ1 - 3, 'glass');
    box(set, X0 + 2, X1 - 2, bodyTop + 2, cabTop - 1, cabZ1, cabZ1, 'glass');
    box(set, X0 + 2, X1 - 2, bodyTop + 2, cabTop - 1, cabZ0, cabZ0, 'glass');
    box(set, 11, 14, cabTop, cabTop, cabZ0, cabZ1, 'accent');
    // roof light bar
    box(set, X0 + 2, X1 - 2, cabTop + 1, cabTop + 1, cabZ1 - 3, cabZ1 - 3, 'dark');
    for (let x = X0 + 3; x <= X1 - 3; x += 2) set(x, cabTop + 2, cabZ1 - 3, 'light');
  } else if (s.cab === 'open' || s.cab === 'buggy') {
    // tub walls, cowl and seat
    box(set, X0 + 1, X0 + 1, bodyTop + 1, bodyTop + 2, cabZ0, cabZ1, 'body');
    box(set, X1 - 1, X1 - 1, bodyTop + 1, bodyTop + 2, cabZ0, cabZ1, 'body');
    box(set, X0 + 1, X1 - 1, bodyTop + 1, bodyTop + 3, cabZ1, cabZ1, 'body');
    box(set, X0 + 2, X1 - 2, bodyTop + 1, bodyTop + 4, cabZ1 - 1, cabZ1 - 1, 'dark'); // dash
    box(set, 8, 13, bodyTop + 1, bodyTop + 1, cabZ0 + 2, cabZ0 + 6, 'dark');         // seat base
    box(set, 8, 13, bodyTop + 2, bodyTop + 4, cabZ0 + 2, cabZ0 + 3, 'dark');          // seat back
    // driver: torso, head, helmet, visor
    box(set, 9, 12, bodyTop + 2, bodyTop + 4, cabZ0 + 4, cabZ0 + 5, 'accent');
    box(set, 9, 12, bodyTop + 5, bodyTop + 6, cabZ0 + 4, cabZ0 + 6, 'skin');
    box(set, 9, 12, bodyTop + 7, bodyTop + 7, cabZ0 + 4, cabZ0 + 6, 'accent');
    box(set, 9, 12, bodyTop + 6, bodyTop + 6, cabZ0 + 7, cabZ0 + 7, 'dark');
    box(set, 9, 12, bodyTop + 5, bodyTop + 5, cabZ0 + 7, cabZ0 + 7, 'skin');
    // steering wheel
    box(set, 9, 12, bodyTop + 4, bodyTop + 4, cabZ1 - 3, cabZ1 - 3, 'chrome');
    // windshield
    box(set, X0 + 2, X1 - 2, bodyTop + 4, bodyTop + 6, cabZ1 - 2, cabZ1 - 2, 'glass');
    // roll cage
    for (const x of [X0 + 1, X1 - 1]) {
      for (const z of [cabZ0 + 1, cabZ1 - 2]) box(set, x, x, bodyTop + 3, cabTop, z, z, 'chrome');
      box(set, x, x, cabTop, cabTop, cabZ0 + 1, cabZ1 - 2, 'chrome');
    }
    box(set, X0 + 1, X1 - 1, cabTop, cabTop, cabZ0 + 1, cabZ0 + 1, 'chrome');
    box(set, X0 + 1, X1 - 1, cabTop, cabTop, cabZ1 - 2, cabZ1 - 2, 'chrome');
    // diagonal braces on both sides
    for (const x of [X0 + 1, X1 - 1]) {
      const span = cabZ1 - 2 - (cabZ0 + 1);
      for (let i = 0; i <= span; i++) {
        const y = bodyTop + 3 + Math.round((i / span) * (cabTop - bodyTop - 3));
        set(x, y, cabZ0 + 1 + i, 'chrome');
      }
    }
    box(set, 11, 14, cabTop, cabTop, cabZ0 + 1, cabZ1 - 2, 'accent');
    // roof light bar
    for (let x = X0 + 3; x <= X1 - 3; x += 2) set(x, cabTop + 1, cabZ1 - 2, 'light');
  } else if (s.cab === 'bus') {
    box(set, X0, X1, bodyTop + 1, cabTop, cabZ0, cabZ1, 'body');
    box(set, X0, X1, bodyTop + 2, bodyTop + 2, cabZ0, cabZ1, 'accent'); // belt line
    for (let z = cabZ0 + 1; z + 2 <= cabZ1 - 1; z += 4) {
      box(set, X0, X0, bodyTop + 4, bodyTop + 8, z, z + 2, 'glass');
      box(set, X1, X1, bodyTop + 4, bodyTop + 8, z, z + 2, 'glass');
    }
    box(set, X0 + 1, X1 - 1, bodyTop + 4, bodyTop + 8, cabZ1, cabZ1, 'glass');
    box(set, X0 + 1, X1 - 1, bodyTop + 4, bodyTop + 8, cabZ0, cabZ0, 'glass');
    box(set, 9, 16, cabTop, cabTop, cabZ0, cabZ1, 'accent');
    // roof beacons
    for (const x of [X0 + 1, X1 - 1]) for (const z of [cabZ0 + 1, cabZ1 - 1]) set(x, cabTop + 1, z, 'light');
  }

  // ---- hood
  if (hoodZ1 >= hoodZ0) {
    box(set, X0, X1, bodyTop + 1, bodyTop + 2, hoodZ0, hoodZ1, 'body');
    if (s.cab !== 'bus') box(set, 11, 14, bodyTop + 3, bodyTop + 3, hoodZ0 + 1, hoodZ1 - 1, 'accent');
  }

  // ---- smoke stacks
  if (s.stacks > 0) {
    const sx = s.stackPos === 'side'
      ? (s.stacks >= 2 ? [X0 - 1, X1 + 1] : [X1 + 1])
      : (s.stacks >= 2 ? [X0 + 2, X1 - 2] : [X1 - 2]);
    const sz = s.stackPos === 'side' ? cabZ0 + 3 : bedZ1 - 3;
    const y0 = s.stackPos === 'side' ? bodyTop + 1 : bodyTop + 3;
    for (const x of sx) {
      for (let y = y0; y <= cabTop + 3; y++) set(x, y, sz, 'chrome');
      set(x, cabTop + 4, sz, 'dark');
      emitters.push({ x, y: cabTop + 5, z: sz, dx: 0, dy: 1, dz: -0.15, kind: 'smoke', tint: s.stackTint });
    }
  }

  // ---- features
  if (has('plow')) {
    const pl = addPart('plow', { x: 12.5, y: baseY + 1, z: length }, { type: 'bob', axis: 'y', amp: 3, speed: 1.3 });
    pl.box(X0 - 1, X1 + 1, baseY - 2, baseY + 6, length + 2, length + 3, 'accent');
    pl.box(X0 - 1, X1 + 1, baseY + 6, baseY + 6, length + 2, length + 3, 'chrome');
    pl.box(X0 - 2, X0 - 2, baseY - 2, baseY + 6, length + 1, length + 3, 'dark');
    pl.box(X1 + 2, X1 + 2, baseY - 2, baseY + 6, length + 1, length + 3, 'dark');
    pl.box(7, 8, baseY, baseY + 2, length, length + 1, 'dark');
    pl.box(17, 18, baseY, baseY + 2, length, length + 1, 'dark');
  }

  if (jaw) {
    // upper teeth hang from the grille; lower jaw is the animated part
    box(set, X0, X1, baseY + 2, bodyTop + 1, length - 2, length - 2, 'dark');
    for (let x = X0; x <= X1; x++) {
      if (x % 2 === 0) set(x, baseY + 1, length - 2, 'tooth');
      if (x % 4 === 1) set(x, baseY, length - 2, 'tooth');
    }
    const jp = addPart('jaw', { x: 12.5, y: baseY, z: length - 2 }, { type: 'swing', axis: 'x', amp: 0.3, speed: 2.4 });
    jp.box(X0, X1, baseY - 2, baseY - 1, length - 2, length + 1, 'dark');
    for (let x = X0; x <= X1; x++) {
      if (x % 2 === 1) jp.set(x, baseY, length + 1, 'tooth');
      if (x % 4 === 0) jp.set(x, baseY + 1, length + 1, 'tooth');
    }
    box(set, X0 + 1, X0 + 3, bodyTop + 3, bodyTop + 4, hoodZ1 - 1, hoodZ1, 'light');  // eyes
    box(set, X1 - 3, X1 - 1, bodyTop + 3, bodyTop + 4, hoodZ1 - 1, hoodZ1, 'light');
    box(set, X0 + 1, X0 + 3, bodyTop + 5, bodyTop + 5, hoodZ1 - 1, hoodZ1, 'dark');   // brow
    box(set, X1 - 3, X1 - 1, bodyTop + 5, bodyTop + 5, hoodZ1 - 1, hoodZ1, 'dark');
  }
  if (has('spikes')) {
    for (let z = hoodZ0 + 1; z <= hoodZ1 - 3; z += 3) {
      for (const x of [X0, X1]) { set(x, bodyTop + 3, z, 'chrome'); set(x, bodyTop + 4, z, 'chrome'); }
    }
  }

  if (has('engine')) {
    // exposed V8 with pumping pistons, spinning pulley and fire-breathing headers
    const ez0 = hoodZ0 + 1;
    const ez1 = hoodZ1 - 3;
    box(set, 8, 17, bodyTop + 3, bodyTop + 5, ez0, ez1, 'dark');
    box(set, 10, 15, bodyTop + 6, bodyTop + 7, ez0 + 1, ez1 - 1, 'chrome'); // blower
    box(set, 11, 14, bodyTop + 8, bodyTop + 8, ez0 + 2, ez1 - 2, 'accent');
    const pz = [ez0 + 1, ez1 - 3];
    let i = 0;
    for (const x of [8, 16]) {
      for (const z of pz) {
        const pp = addPart(`piston-${i}`, { x: x + 0.5, y: bodyTop + 7, z: z + 0.5 },
          { type: 'bob', axis: 'y', amp: 2, speed: 5.2, offset: (i * Math.PI) / 2 });
        pp.box(x, x + 1, bodyTop + 6, bodyTop + 8, z, z + 1, 'chrome');
        i++;
      }
    }
    // crank pulley at the front of the engine (spins about z)
    const cp = addPart('pulley', { x: 12.5, y: bodyTop + 7, z: ez1 + 1 }, { type: 'spin', axis: 'z', amp: 1.6, speed: 4 });
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const d = Math.hypot(dx, dy);
        if (d > 3.2) continue;
        const spoke = Math.abs(dx) <= 0.5 || Math.abs(dy) <= 0.5 || Math.abs(Math.abs(dx) - Math.abs(dy)) <= 0.5;
        cp.set(12 + dx, bodyTop + 7 + dy, ez1 + 1, d > 2.4 ? 'chrome' : (spoke ? 'accent' : 'dark'));
      }
    }
    // side headers -> fire + smoke
    for (const x of [6, 19]) {
      box(set, x, x, bodyTop + 3, bodyTop + 10, ez0 + 3, ez0 + 3, 'chrome');
      set(x, bodyTop + 11, ez0 + 3, 'dark');
      emitters.push({ x, y: bodyTop + 12, z: ez0 + 3, dx: 0, dy: 1, dz: -0.1, kind: 'smoke', tint: 'black' });
      emitters.push({ x, y: bodyTop + 12, z: ez0 + 3, dx: 0, dy: 1, dz: -0.1, kind: 'flame', tint: 'fire' });
    }
  }

  if (s.bed === 'engine') {
    // buggy: rear engine, side pipes with flame pops, antenna flag
    box(set, 8, 17, bodyTop + 1, bodyTop + 4, bedZ0 + 2, bedZ1, 'dark');
    box(set, 14, 16, bodyTop + 5, bodyTop + 5, bedZ0 + 4, bedZ0 + 7, 'chrome');
    box(set, 9, 11, bodyTop + 5, bodyTop + 6, bedZ0 + 4, bedZ0 + 7, 'accent');
    for (const x of [7, 18]) {
      box(set, x, x, bodyTop + 2, bodyTop + 2, 0, bedZ0 + 3, 'chrome');
      emitters.push({ x, y: bodyTop + 2, z: -1, dx: 0, dy: 0.12, dz: -1, kind: 'flame', tint: 'fire' });
    }
    box(set, 7, 7, bodyTop + 1, bodyTop + 16, bedZ0 + 5, bedZ0 + 5, 'chrome');
    const fp = addPart('flag', { x: 7, y: bodyTop + 14, z: bedZ0 + 5 }, { type: 'swing', axis: 'y', amp: 0.45, speed: 5.5 });
    fp.box(7, 7, bodyTop + 12, bodyTop + 15, bedZ0, bedZ0 + 4, 'accent');
    fp.box(7, 7, bodyTop + 13, bodyTop + 14, bedZ0 + 1, bedZ0 + 3, 'light');
  }

  if (has('crane')) {
    const cz = bedZ1 - 1;
    box(set, 11, 13, bodyTop + 2, bodyTop + 4, cz - 1, cz + 1, 'dark');
    const yaw = addPart('crane', { x: 12.5, y: bodyTop + 5, z: cz }, { type: 'swing', axis: 'y', amp: 0.65, speed: 0.9 });
    yaw.box(11, 14, bodyTop + 5, bodyTop + 6, cz - 1, cz + 1, 'accent');
    const boomLen = 11;
    let tipY = bodyTop + 6;
    let tipZ = cz - 1;
    for (let i = 0; i <= boomLen; i++) {
      tipY = bodyTop + 7 + Math.floor(i * 0.75);
      tipZ = cz - 1 - i;
      yaw.box(12, 13, tipY, tipY, tipZ, tipZ, i % 3 === 0 ? 'chrome' : 'accent');
    }
    const hook = addPart('hook', { x: 12.5, y: tipY, z: tipZ }, { type: 'swing', axis: 'x', amp: 0.28, speed: 1.9, offset: 0.8 }, 'crane');
    for (let y = tipY - 6; y < tipY; y++) hook.set(12, y, tipZ, 'dark');
    hook.box(12, 13, tipY - 8, tipY - 7, tipZ, tipZ, 'chrome');
    hook.set(12, tipY - 8, tipZ - 1, 'chrome');
    hook.set(12, tipY - 9, tipZ - 1, 'flame');
  }

  if (has('dump')) {
    const bp = addPart('bed', { x: 12.5, y: bodyTop + 1, z: bedZ0 }, { type: 'lift', axis: 'x', amp: -0.6, speed: 0.8 });
    bp.box(X0, X1, bodyTop + 1, bodyTop + 1, bedZ0, bedZ1, 'dark');
    bp.box(X0, X0 + 1, bodyTop + 2, bodyTop + 6, bedZ0, bedZ1, 'accent');
    bp.box(X1 - 1, X1, bodyTop + 2, bodyTop + 6, bedZ0, bedZ1, 'accent');
    bp.box(X0, X1, bodyTop + 2, bodyTop + 8, bedZ1 - 1, bedZ1, 'accent');
    bp.box(X0, X1, bodyTop + 7, bodyTop + 7, bedZ0, bedZ1 - 2, 'chrome'); // rim rail on top edge region
  }

  if (has('stopsign')) {
    const sp = addPart('stopsign', { x: X1 + 1, y: bodyTop + 7, z: cabZ1 - 3 }, { type: 'lift', axis: 'y', amp: -1.4, speed: 0.7 });
    sp.box(X1 + 1, X1 + 1, bodyTop + 7, bodyTop + 7, cabZ1 - 6, cabZ1 - 3, 'chrome');
    sp.box(X1 + 1, X1 + 1, bodyTop + 5, bodyTop + 9, cabZ1 - 11, cabZ1 - 7, 'flame');
    sp.box(X1 + 1, X1 + 1, bodyTop + 6, bodyTop + 8, cabZ1 - 10, cabZ1 - 8, 'light');
  }
  if (has('tailpipe')) {
    box(set, 18, 18, baseY + 2, baseY + 2, 0, 1, 'chrome');
    emitters.push({ x: 18, y: baseY + 2, z: -1, dx: 0, dy: 0.25, dz: -1, kind: 'smoke', tint: 'gray' });
  }

  // ---- wheels
  const wheelL = buildWheel(R, 0);
  const wheelR = buildWheel(R, 3);
  const wheels = [];
  for (const az of axleZs) {
    wheels.push({ cx: 0, cy: axleY, cz: az, side: 'L', voxels: wheelL });
    wheels.push({ cx: 22, cy: axleY, cz: az, side: 'R', voxels: wheelR });
  }

  for (const p of parts) { p.voxels = [...p.map.values()]; delete p.map; }
  const voxels = [...map.values()];
  let maxY = 0;
  let maxZ = 0;
  for (const v of voxels) { if (v.y > maxY) maxY = v.y; if (v.z > maxZ) maxZ = v.z; }
  for (const p of parts) for (const v of p.voxels) { if (v.y > maxY) maxY = v.y; if (v.z > maxZ) maxZ = v.z; }
  return {
    voxels, wheels, parts, emitters,
    size: { x: 26, y: Math.max(maxY + 1, R * 2 + 1), z: maxZ + 1 },
    meta: { length, axleZs, baseY, bodyTop, cabTop, wheelCount: wheels.length },
  };
}
