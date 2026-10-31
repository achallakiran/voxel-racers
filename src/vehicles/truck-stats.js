// Truck roster: stats (1-10) and shape parameters for the voxel generator.
// Pure data, no rendering dependencies, so it can be unit tested in Node.

export const TRUCKS = [
  {
    id: 'crusher', name: 'Crusher',
    stats: { speed: 7, grip: 6, weight: 8 },
    shape: { wheelR: 6, cabH: 6, bedLen: 11, hoodLen: 8, stacks: 2 },
    paint: { body: '#d62828', accent: '#ffd60a', rim: '#cfd8dc' },
  },
  {
    id: 'dune-devil', name: 'Dune Devil',
    stats: { speed: 8, grip: 5, weight: 5 },
    shape: { wheelR: 5, cabH: 5, bedLen: 9, hoodLen: 10, stacks: 2 },
    paint: { body: '#f77f00', accent: '#1d1d1d', rim: '#ffd60a' },
  },
  {
    id: 'frostbite', name: 'Frostbite',
    stats: { speed: 6, grip: 9, weight: 6 },
    shape: { wheelR: 5, cabH: 6, bedLen: 12, hoodLen: 7, stacks: 1 },
    paint: { body: '#4cc9f0', accent: '#f8f9fa', rim: '#1d3557' },
  },
  {
    id: 'toxic', name: 'Toxic',
    stats: { speed: 7, grip: 7, weight: 5 },
    shape: { wheelR: 6, cabH: 5, bedLen: 10, hoodLen: 9, stacks: 2 },
    paint: { body: '#80ed99', accent: '#7209b7', rim: '#1d1d1d' },
  },
  {
    id: 'magma', name: 'Magma',
    stats: { speed: 9, grip: 4, weight: 7 },
    shape: { wheelR: 6, cabH: 5, bedLen: 8, hoodLen: 11, stacks: 2 },
    paint: { body: '#2b2d42', accent: '#ff6b00', rim: '#ffb703' },
  },
  {
    id: 'night-rider', name: 'Night Rider',
    stats: { speed: 8, grip: 8, weight: 4 },
    shape: { wheelR: 5, cabH: 6, bedLen: 10, hoodLen: 9, stacks: 1 },
    paint: { body: '#7b2cbf', accent: '#00f5d4', rim: '#e0aaff' },
  },
];

export function getTruck(id) {
  const t = TRUCKS.find((x) => x.id === id);
  return t || TRUCKS[0];
}
