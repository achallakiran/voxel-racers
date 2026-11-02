// Draws the timed stage hazards from the same pure functions the physics uses (so what you see is what hits you).
import * as THREE from '../../lib/three.module.js';
import { avalanchePhase, avalancheWarning, avalancheBand, geyserState, stalactiteState, STALACTITE_FALL } from '../physics/hazards.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mat = (c, basic = false) => (basic ? new THREE.MeshBasicMaterial({ color: c, fog: false }) : new THREE.MeshLambertMaterial({ color: c }));
const M = { snow: mat('#f4f8ff'), snowShade: mat('#cfdcee'), flag: mat('#ff3b30', true), rock: mat('#4a4650'), ice1: mat('#c9d6e8'), ice2: mat('#8fa4c4'), ice3: mat('#e9eef8'), blob: mat('#0a0d18', true), lava: mat('#ff7a1a', true), lavaHot: mat('#ffd24a', true), shadow: mat('#2a0a0a', true), stone: mat('#6a6470'), dust: mat('#cfc6b8') };

function box(group, m) { const b = new THREE.Mesh(BOX, m); b.visible = false; group.add(b); return b; }
const place = (b, x, y, z, sx, sy, sz) => { b.visible = true; b.position.set(x, y + sy / 2, z); b.scale.set(sx, sy, sz); };

export function createHazardView(parent) {
  const root = new THREE.Group();
  parent.add(root);
  let items = [];
  function clear() { for (const it of items) root.remove(it.group); items = []; }

  function set(hazards) {
    clear();
    for (const h of hazards || []) {
      const group = new THREE.Group(); root.add(group);
      const it = { h, group };
      if (h.kind === 'avalanche') {
        it.blocks = Array.from({ length: 22 }, (_, i) => ({ b: box(group, i % 3 ? M.snow : M.snowShade), r: ((i * 37) % 17) / 17, r2: ((i * 53) % 19) / 19 }));
        it.flag = box(group, M.flag); it.flag2 = box(group, M.flag);
      } else if (h.kind === 'geyser') {
        it.ring = Array.from({ length: 8 }, () => box(group, M.rock));
        it.col = Array.from({ length: 12 }, (_, i) => box(group, i % 2 ? M.lava : M.lavaHot));
        it.puff = Array.from({ length: 6 }, () => box(group, M.lava));
      } else if (h.kind === 'drifter') {
        it.shadow = box(group, M.blob);
        it.chunks = [box(group, M.ice1), box(group, M.ice2), box(group, M.ice3), box(group, M.ice2), box(group, M.ice1)];
      } else if (h.kind === 'stalactite') {
        it.shadow = box(group, M.shadow);
        it.spike = [box(group, M.stone), box(group, M.stone), box(group, M.rock)];
        it.rubble = Array.from({ length: 6 }, () => box(group, M.stone));
        it.dust = Array.from({ length: 5 }, () => box(group, M.dust));
      }
      items.push(it);
    }
  }

  function update(terrain, t) {
    const time = terrain.time || 0;
    for (const it of items) {
      const h = it.h;
      for (const b of [...(it.blocks || []).map((o) => o.b), it.flag, it.flag2, ...(it.ring || []), ...(it.chunks || []), ...(it.col || []), ...(it.puff || []), it.shadow, ...(it.spike || []), ...(it.rubble || []), ...(it.dust || [])]) if (b) b.visible = false;
      if (h.kind === 'avalanche') {
        const k = avalanchePhase(h, time);
        const warn = avalancheWarning(h, time);
        const at = (along, lat) => [h.x + h.tx * along + h.tz * lat, h.z + h.tz * along - h.tx * lat];
        if (warn && k < 0) {   // flags flap at the edge the wave will come from
          const pulse = 0.6 + 0.4 * Math.sin(time * 12);
          const [fx, fz] = at(-h.len / 2, h.side * (h.w / 2 + 0.8)); const [gx, gz] = at(h.len / 2, h.side * (h.w / 2 + 0.8));
          place(it.flag, fx, h.y0, fz, 0.5, 3.2 * pulse + 1, 0.5); place(it.flag2, gx, h.y0, gz, 0.5, 3.2 * pulse + 1, 0.5);
        }
        if (k >= 0) {
          const [a, b] = avalancheBand(h, k);
          for (const o of it.blocks) {
            const lat = a + (b - a) * o.r; const along = (o.r2 - 0.5) * h.len;
            const [x, z] = at(along, lat);
            const hh = 1.4 + o.r2 * 2.2 + Math.sin(time * 9 + o.r * 20) * 0.4;
            place(o.b, x, h.y0, z, 2.6, hh, 2.6);
          }
        }
      } else if (h.kind === 'drifter') {
        const bob = 0.7 + 0.3 * Math.sin(time * 1.9 + h.phase * 2); const spin = time * 0.5 + h.phase;
        place(it.shadow, h.x, h.y0 + 0.04, h.z, h.r * 2.1, 0.04, h.r * 2.1);          // the shadow on the ice marks where it is
        const r = h.r;
        const parts = [[0, 0, 0, 1.7, 1.3, 1.5], [0.55, 0.9, 0.1, 1.1, 1.0, 1.0], [-0.65, 0.2, 0.5, 0.8, 0.8, 0.8], [0.1, -0.1, -0.7, 0.7, 0.7, 0.8], [-0.3, 1.2, -0.2, 0.6, 0.6, 0.6]];
        for (let i = 0; i < parts.length; i++) {
          const [px, py, pz, sx, sy, sz] = parts[i];
          const c = Math.cos(spin); const sn = Math.sin(spin);
          place(it.chunks[i], h.x + (px * c - pz * sn) * r * 0.75, h.y0 + bob + 0.55 + py * r * 0.7, h.z + (px * sn + pz * c) * r * 0.75, sx * r * 0.95, sy * r * 0.95, sz * r * 0.95);
          it.chunks[i].rotation.y = spin * (1 + i * 0.15);
        }
      } else if (h.kind === 'geyser') {
        const g = geyserState(h, time);
        for (let i = 0; i < it.ring.length; i++) { const a = (i / it.ring.length) * Math.PI * 2; place(it.ring[i], h.x + Math.cos(a) * h.r * 0.8, h.y0, h.z + Math.sin(a) * h.r * 0.8, 1.1, 0.7 + (i & 1) * 0.3, 1.1); }
        if (g.state === 'warn') {
          for (let i = 0; i < it.puff.length; i++) place(it.puff[i], h.x + Math.sin(time * 7 + i * 2) * h.r * 0.5, h.y0 + 0.2 + ((time * 3 + i / 6) % 1) * 1.6, h.z + Math.cos(time * 6 + i * 3) * h.r * 0.5, 0.45, 0.45, 0.45);
        } else if (g.state === 'erupt') {
          const hgt = 12 * Math.sin(Math.min(1, g.k * 1.4) * Math.PI * 0.5);
          for (let i = 0; i < it.col.length; i++) { const f = i / it.col.length; place(it.col[i], h.x + Math.sin(time * 14 + i) * 0.4 * f, h.y0 + f * hgt, h.z + Math.cos(time * 11 + i) * 0.4 * f, h.r * 1.4 * (1 - f * 0.5), hgt / it.col.length + 0.2, h.r * 1.4 * (1 - f * 0.5)); }
        }
      } else if (h.kind === 'stalactite') {
        const s = stalactiteState(h, time);
        if (s.state === 'falling') {
          const d = h.r * 2 * (0.25 + 0.75 * s.k);
          place(it.shadow, h.x, h.y0 + 0.05, h.z, d, 0.05, d);
          const y = h.y0 + (h.drop ?? 16) * (1 - s.k) * (1 - s.k) + 0.2;
          place(it.spike[0], h.x, y + 2.4, h.z, 2.2, 1.6, 2.2); place(it.spike[1], h.x, y + 1.2, h.z, 1.5, 1.4, 1.5); place(it.spike[2], h.x, y, h.z, 0.7, 1.3, 0.7);
        } else if (s.state === 'impact' || s.state === 'rubble') {
          for (let i = 0; i < it.rubble.length; i++) { const a = i * 1.1; place(it.rubble[i], h.x + Math.cos(a) * 1.0, h.y0, h.z + Math.sin(a) * 1.0, 0.7 + (i % 3) * 0.3, 0.5 + (i % 2) * 0.4, 0.7); }
          if (s.state === 'impact') for (let i = 0; i < it.dust.length; i++) place(it.dust[i], h.x + Math.cos(i * 1.3) * 2, h.y0 + 0.4 + i * 0.3, h.z + Math.sin(i * 1.3) * 2, 1.2, 1.2, 1.2);
        }
      }
    }
  }
  return { set, update, get count() { return items.length; } };
}
