// Truck roster: stats (1-10) and shape parameters for the voxel generator.
// Pure data, no rendering dependencies, so it can be unit tested in Node.

export const TRUCKS = [
  {
    id: 'crusher', name: 'Crusher', blurb: 'open pickup',
    stats: { speed: 7, grip: 6, weight: 8 },
    shape: { wheelR: 9, cab: 'open', bed: 'open', cabH: 9, bedLen: 11, hoodLen: 8, stacks: 2, stackTint: 'black' },
    paint: { body: '#d62828', accent: '#ffd60a', rim: '#cfd8dc' },
  },
  {
    id: 'dune-devil', name: 'Dune Devil', blurb: 'buggy',
    stats: { speed: 8, grip: 5, weight: 4 },
    shape: { wheelR: 8, cab: 'buggy', bed: 'engine', slabH: 1, cabH: 9, bedLen: 9, hoodLen: 8 },
    paint: { body: '#f77f00', accent: '#1d1d1d', rim: '#ffd60a' },
  },
  {
    id: 'frostbite', name: 'Frostbite', blurb: 'snow plow',
    stats: { speed: 6, grip: 9, weight: 7 },
    shape: { wheelR: 8, cab: 'closed', bed: 'open', cabH: 7, bedLen: 12, hoodLen: 7, stacks: 1, stackTint: 'white', features: ['plow'] },
    paint: { body: '#4cc9f0', accent: '#f8f9fa', rim: '#1d3557' },
  },
  {
    id: 'toxic', name: 'Toxic', blurb: 'gator jaw',
    stats: { speed: 7, grip: 7, weight: 6 },
    shape: { wheelR: 9, cab: 'closed', bed: 'open', cabH: 5, bedLen: 10, hoodLen: 10, stacks: 2, stackTint: 'green', features: ['jaw', 'spikes'] },
    paint: { body: '#80ed99', accent: '#7209b7', rim: '#1d1d1d' },
  },
  {
    id: 'magma', name: 'Magma', blurb: 'hot-rod engine',
    stats: { speed: 9, grip: 4, weight: 7 },
    shape: { wheelR: 9, cab: 'closed', bed: 'open', cabH: 5, bedLen: 5, hoodLen: 14, features: ['engine'] },
    paint: { body: '#2b2d42', accent: '#ff6b00', rim: '#ffb703' },
  },
  {
    id: 'night-rider', name: 'Night Rider', blurb: 'crane tow truck',
    stats: { speed: 7, grip: 8, weight: 5 },
    shape: { wheelR: 8, cab: 'closed', bed: 'flat', cabH: 6, bedLen: 15, hoodLen: 8, stacks: 1, stackTint: 'gray', features: ['crane'] },
    paint: { body: '#7b2cbf', accent: '#00f5d4', rim: '#e0aaff' },
  },
  {
    id: 'yellow-thunder', name: 'Yellow Thunder', blurb: 'monster bus',
    stats: { speed: 4, grip: 5, weight: 10 },
    shape: { wheelR: 10, cab: 'bus', bed: 'none', cabH: 11, cabLen: 28, bedLen: 0, hoodLen: 5, features: ['stopsign', 'tailpipe'] },
    paint: { body: '#ffd60a', accent: '#1d1d1d', rim: '#cfd8dc' },
  },
  {
    id: 'titan', name: 'Titan', blurb: '6-wheel dumper',
    stats: { speed: 5, grip: 6, weight: 10 },
    shape: {
      wheelR: 8, axles: 3, cab: 'closed', bed: 'dump', cabH: 7, bedLen: 18, hoodLen: 8,
      stacks: 2, stackPos: 'side', stackTint: 'black', features: ['dump'],
    },
    paint: { body: '#e0e0e0', accent: '#ff9f1c', rim: '#495057' },
  },
  {
    id: 'volt', name: 'Volt', blurb: 'electric coil truck',
    stats: { speed: 8, grip: 6, weight: 4 },
    shape: { wheelR: 9, cab: 'closed', bed: 'flat', cabH: 5, bedLen: 12, hoodLen: 10, features: ['coils'] },
    paint: { body: '#16286b', accent: '#00e5ff', rim: '#e0f7ff' },
  },
];

export function getTruck(id) {
  const t = TRUCKS.find((x) => x.id === id);
  return t || TRUCKS[0];
}
