// Settings/save data. The backing store is injectable so this runs in Node tests,
// and every access is guarded because localStorage can throw (private mode, blocked data).

export const DEFAULTS = {
  version: 1,
  truckId: 'crusher',
  difficulty: 'normal',  // rival strength: 'easy' | 'normal' | 'hard'
  sus: {},               // per-truck suspension mode: { [truckId]: 'soft' | 'normal' | 'stiff' }
  paints: {},            // per-truck colour overrides: { [truckId]: {body, accent, rim} }
  camera: 'iso-follow',
  track: 'greenridge',
  physics: 'arcade',     // 'arcade' | 'realistic'
  autoGas: false,
  volume: 0.8,
  particles: 'high',     // 'low' | 'medium' | 'high'
  controlSize: 1,
  leftHanded: false,
};

const KEY = 'voxel-racers:save';

export function createStorage(backing) {
  const mem = new Map();
  const store = backing || {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, v); },
  };

  function load() {
    try {
      const raw = store.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
      return { ...DEFAULTS, ...parsed, paints: { ...(parsed.paints || {}) }, sus: { ...(parsed.sus || {}) } };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save(data) {
    try {
      store.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  return { load, save };
}

export function browserBacking() {
  try {
    const ls = globalThis.localStorage;
    ls.setItem('voxel-racers:probe', '1');
    ls.removeItem('voxel-racers:probe');
    return ls;
  } catch {
    return null;
  }
}
