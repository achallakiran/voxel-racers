// Builds a blocky heightfield mesh as plain typed arrays (so it is testable without three.js).
// Every cell is a column: a flat top at a quantised height plus side walls wherever the neighbour is lower.
// That keeps the voxel look while drawing only the visible faces.

// `edge(x, z)` (optional) says whether a cell belongs to the island; a drawn cell next to one that does not gets a cliff `edgeDrop` deep.
export function buildColumns({ x0, z0, nx, nz, cell, quant, heightAt, colorAt, include, yOffset = 0, sides = true, edge = null, edgeDrop = 0 }) {
  const H = new Float32Array(nx * nz);
  const at = (ix, iz) => H[ix * nz + iz];
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const h = heightAt(x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell);
      H[ix * nz + iz] = (quant ? Math.round(h / quant) * quant : h) + yOffset;
    }
  }
  const pos = [];
  const nor = [];
  const col = [];
  let cells = 0;
  const quad = (a, b, c, d, n, color) => {
    for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(color[0], color[1], color[2]); }
  };
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const cx = x0 + (ix + 0.5) * cell;
      const cz = z0 + (iz + 0.5) * cell;
      if (include && !include(cx, cz)) continue;
      cells++;
      const h = at(ix, iz);
      const xa = cx - cell / 2; const xb = cx + cell / 2;
      const za = cz - cell / 2; const zb = cz + cell / 2;
      const c = colorAt(cx, cz, h);
      quad([xa, h, za], [xa, h, zb], [xb, h, zb], [xb, h, za], [0, 1, 0], c);
      if (!sides) continue;
      const shade = (k) => [c[0] * k, c[1] * k, c[2] * k];
      const lower = (jx, jz) => (jx < 0 || jz < 0 || jx >= nx || jz >= nz ? h - 0.5 : (edge && !edge(x0 + (jx + 0.5) * cell, z0 + (jz + 0.5) * cell) ? h - edgeDrop : at(jx, jz)));
      let hn = lower(ix + 1, iz);   // +x
      if (hn < h - 1e-4) quad([xb, h, zb], [xb, hn, zb], [xb, hn, za], [xb, h, za], [1, 0, 0], shade(0.82));
      hn = lower(ix - 1, iz);       // -x
      if (hn < h - 1e-4) quad([xa, h, za], [xa, hn, za], [xa, hn, zb], [xa, h, zb], [-1, 0, 0], shade(0.82));
      hn = lower(ix, iz + 1);       // +z
      if (hn < h - 1e-4) quad([xa, h, zb], [xa, hn, zb], [xb, hn, zb], [xb, h, zb], [0, 0, 1], shade(0.9));
      hn = lower(ix, iz - 1);       // -z
      if (hn < h - 1e-4) quad([xb, h, za], [xb, hn, za], [xa, hn, za], [xa, h, za], [0, 0, -1], shade(0.9));
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), cells, triangles: pos.length / 9 };
}

// cheap deterministic 0..1 hash for per-cell colour jitter
export function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
