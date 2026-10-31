// Procedural voxel monster truck generator.
// Pure data (no three.js) so it can be tested in Node.
// Axes: x = width, y = up, z = length (front is +z). One unit = one voxel.
//
// Returns { voxels, wheels, size } where
//   voxels: [{x,y,z,k}]            chassis/body voxels, k = palette key
//   wheels: [{cx,cy,cz,voxels}]    each wheel, voxels relative to wheel centre
//   size:   {x,y,z}                bounding size in voxels

export const PALETTE_KEYS = [
  'body', 'accent', 'rim', 'tire', 'tread', 'dark', 'glass', 'light', 'chrome', 'flame',
];

const BODY_X0 = 5;
const BODY_X1 = 20; // inclusive, 16 wide

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
        const outer = d > r - 1.1;
        if (outer) {
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

export function buildTruckVoxels(shape) {
  const { wheelR, cabH, bedLen, hoodLen, stacks } = shape;
  const map = new Map();
  const set = (x, y, z, k) => map.set(`${x},${y},${z}`, { x, y, z, k });

  const axleY = wheelR;                 // wheel centre height
  const rearAxleZ = wheelR + 2;
  const length = bedLen + 14 + hoodLen + 4; // bed + cab + hood + bumpers
  const frontAxleZ = length - wheelR - 2;
  const baseY = Math.max(wheelR + 1, 6);    // underside of the body

  // chassis rails and axles
  box(set, BODY_X0 + 2, BODY_X0 + 3, baseY - 1, baseY - 1, 2, length - 3, 'dark');
  box(set, BODY_X1 - 3, BODY_X1 - 2, baseY - 1, baseY - 1, 2, length - 3, 'dark');
  box(set, 4, 21, axleY - 1, axleY, rearAxleZ - 1, rearAxleZ, 'dark');
  box(set, 4, 21, axleY - 1, axleY, frontAxleZ - 1, frontAxleZ, 'dark');

  // main body slab
  const bodyTop = baseY + 3;
  box(set, BODY_X0, BODY_X1, baseY, bodyTop, 2, length - 3, 'body');

  // bed (rear): side walls + tailgate, open top
  const bedZ0 = 2;
  const bedZ1 = bedLen + 1;
  box(set, BODY_X0, BODY_X0 + 1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ1, 'body');
  box(set, BODY_X1 - 1, BODY_X1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ1, 'body');
  box(set, BODY_X0, BODY_X1, bodyTop + 1, bodyTop + 2, bedZ0, bedZ0 + 1, 'accent');

  // cab
  const cabZ0 = bedZ1 + 1;
  const cabZ1 = cabZ0 + 13;
  const cabTop = bodyTop + cabH;
  box(set, BODY_X0 + 1, BODY_X1 - 1, bodyTop + 1, cabTop, cabZ0, cabZ1, 'body');
  // windows: side + windshield + rear
  box(set, BODY_X0, BODY_X0, bodyTop + 2, cabTop - 1, cabZ0 + 2, cabZ1 - 3, 'glass');
  box(set, BODY_X1, BODY_X1, bodyTop + 2, cabTop - 1, cabZ0 + 2, cabZ1 - 3, 'glass');
  box(set, BODY_X0 + 2, BODY_X1 - 2, bodyTop + 2, cabTop - 1, cabZ1, cabZ1, 'glass');
  box(set, BODY_X0 + 2, BODY_X1 - 2, bodyTop + 2, cabTop - 1, cabZ0, cabZ0, 'glass');
  // roof stripe
  box(set, 11, 14, cabTop, cabTop, cabZ0, cabZ1, 'accent');

  // hood
  const hoodZ0 = cabZ1 + 1;
  const hoodZ1 = length - 3;
  box(set, BODY_X0, BODY_X1, bodyTop + 1, bodyTop + 2, hoodZ0, hoodZ1, 'body');
  box(set, 11, 14, bodyTop + 3, bodyTop + 3, hoodZ0 + 1, hoodZ1 - 1, 'accent'); // stripe
  // engine blower scoop
  box(set, 10, 15, bodyTop + 3, bodyTop + 4, hoodZ0 + 2, hoodZ0 + 5, 'chrome');

  // front bumper + grille + headlights
  box(set, BODY_X0 - 1, BODY_X1 + 1, baseY, baseY + 1, length - 2, length - 1, 'chrome');
  box(set, BODY_X0 + 3, BODY_X1 - 3, baseY + 2, bodyTop + 1, length - 2, length - 2, 'dark');
  box(set, BODY_X0, BODY_X0 + 1, bodyTop, bodyTop + 1, length - 2, length - 2, 'light');
  box(set, BODY_X1 - 1, BODY_X1, bodyTop, bodyTop + 1, length - 2, length - 2, 'light');
  // rear bumper + tail lights
  box(set, BODY_X0 - 1, BODY_X1 + 1, baseY, baseY + 1, 0, 1, 'chrome');
  box(set, BODY_X0, BODY_X0 + 1, bodyTop, bodyTop + 1, 1, 1, 'flame');
  box(set, BODY_X1 - 1, BODY_X1, bodyTop, bodyTop + 1, 1, 1, 'flame');

  // light bar on the roof
  box(set, BODY_X0 + 2, BODY_X1 - 2, cabTop + 1, cabTop + 1, cabZ1 - 3, cabZ1 - 3, 'dark');
  for (let x = BODY_X0 + 3; x <= BODY_X1 - 3; x += 2) set(x, cabTop + 2, cabZ1 - 3, 'light');

  // roll cage over the bed
  const cageTop = cabTop;
  for (const x of [BODY_X0 + 1, BODY_X1 - 1]) {
    for (let y = bodyTop + 3; y <= cageTop; y++) set(x, y, bedZ0 + 2, 'chrome');
    for (let y = bodyTop + 3; y <= cageTop; y++) set(x, y, bedZ1 - 1, 'chrome');
  }
  box(set, BODY_X0 + 1, BODY_X1 - 1, cageTop, cageTop, bedZ0 + 2, bedZ0 + 2, 'chrome');
  box(set, BODY_X0 + 1, BODY_X1 - 1, cageTop, cageTop, bedZ1 - 1, bedZ1 - 1, 'chrome');
  box(set, BODY_X0 + 1, BODY_X0 + 1, cageTop, cageTop, bedZ0 + 2, bedZ1 - 1, 'chrome');
  box(set, BODY_X1 - 1, BODY_X1 - 1, cageTop, cageTop, bedZ0 + 2, bedZ1 - 1, 'chrome');

  // exhaust stacks behind the cab
  const stackXs = stacks >= 2 ? [BODY_X0 + 2, BODY_X1 - 2] : [BODY_X1 - 2];
  for (const x of stackXs) {
    for (let y = bodyTop + 3; y <= cabTop + 3; y++) set(x, y, bedZ1 - 3, 'chrome');
    set(x, cabTop + 4, bedZ1 - 3, 'dark');
  }

  // wheels
  const wheelL = buildWheel(wheelR, 0); // outer face is the low-x side
  const wheelR_ = buildWheel(wheelR, 3); // outer face is the high-x side
  const wheels = [];
  const wheelXs = [{ x: 0, side: 'L', v: wheelL }, { x: 22, side: 'R', v: wheelR_ }];
  for (const wz of [rearAxleZ, frontAxleZ]) {
    for (const w of wheelXs) {
      wheels.push({ cx: w.x, cy: axleY, cz: wz, side: w.side, voxels: w.v });
    }
  }

  const voxels = [...map.values()];
  let maxY = 0;
  for (const v of voxels) if (v.y > maxY) maxY = v.y;
  return { voxels, wheels, size: { x: 26, y: Math.max(maxY + 1, wheelR * 2 + 1), z: length } };
}
