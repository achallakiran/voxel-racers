// Falling off a bridge: the rule, pure so it is tested without the game.
// Going over the edge costs: back to the last checkpoint you passed, nitro emptied, and a time penalty on the clock.
export const FALL_PENALTY = 3;     // seconds added to the clock
export const FALL_DROP = 3;        // metres below the road surface that counts as "over the edge"

// n = TR.nearest(x, z) for the truck; v = { y }
export function fellOff(track, v, n) {
  return !!track.BRIDGE && Math.abs(n.d) > track.ROAD_HALF + 0.3 && v.y < n.y - FALL_DROP;
}

// lap fraction of the last checkpoint passed (race.next is the index of the NEXT one; 0 = the finish line)
export function lastCheckpointS(race) {
  const c = race.checkpoints; const k = c.length;
  return c[(((race.next - 1) % k) + k) % k];
}
