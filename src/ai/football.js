// Football AI. Roles: striker (gets behind the ball and drives it at goal, dashes when lined up), defender (stays between the ball
// and its own goal, clears when the ball is close), keeper-lite (guards the goal line, rushes a ball that comes close). Pure.
import { HX, HZ, teamOf, ROLES } from '../core/football.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export function createFootballBot({ phase = 0 } = {}) {
  return { phase, stuckT: 0, reverseT: 0, reverseSteer: 1, dashCd: 2 + (phase % 3) };
}

// me: slot. trucks: [{x,z,vx,vz}] by slot. ball: the ball. match: the football match (for stun / phase)
export function footballInput(b, match, me, v, trucks, ball, dt) {
  if (match.phase !== 'play') return { steer: 0, gas: 0, brake: 0, boost: false, hold: true };
  if (match.isStunned(me)) return { steer: 1, gas: 0, brake: 0.3, boost: false };
  const speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  if (b.reverseT > 0) { b.reverseT -= dt; return { steer: b.reverseSteer, gas: 0, brake: 1, boost: false }; }
  const team = teamOf(me); const dir = team === 0 ? 1 : -1;            // the way this team attacks along x
  const ownGoalX = -dir * HX; const oppGoalX = dir * HX;
  let role = ROLES[me];
  const dBall = Math.hypot(ball.x - v.x, ball.z - v.z);
  // is a team-mate closer to the ball? then a defender keeps its post, a striker still goes (someone has to)
  let closest = true;
  for (let i = 0; i < 6; i++) if (i !== me && teamOf(i) === team && Math.hypot(ball.x - trucks[i].x, ball.z - trucks[i].z) < dBall - 2) closest = false;
  let tx; let tz; let chase = false;
  if (role === 'keeper') {
    if (dBall < 8 && Math.abs(ball.x - ownGoalX) < 14) { tx = ball.x; tz = ball.z; chase = true; }
    else { tx = ownGoalX + dir * 3.5; tz = clamp(ball.z, -4.2, 4.2); }
  } else if (role === 'defender' && !(dBall < 12 && closest) && !(Math.abs(ball.x - ownGoalX) < 16)) {
    tx = ownGoalX + dir * (HX * 0.55); tz = clamp(ball.z * 0.6, -HZ + 5, HZ - 5);
  } else {
    // striker (or a defender clearing): get behind the ball on the line to the opposing goal, then drive through it
    const gx = oppGoalX - ball.x; const gz = -ball.z; const gl = Math.hypot(gx, gz) || 1;
    const bx = ball.x - (gx / gl) * 3.2; const bz = ball.z - (gz / gl) * 3.2;
    const behind = ((v.x - ball.x) * (gx / gl) + (v.z - ball.z) * (gz / gl)) < -1.5;      // already on the goal-ball line, behind the ball
    const lined = Math.abs(wrap(Math.atan2(ball.x - v.x, ball.z - v.z) - Math.atan2(gx, gz))) < 0.55;
    if (behind && lined) { tx = ball.x; tz = ball.z; chase = true; } else { tx = clamp(bx, -HX + 3, HX - 3); tz = clamp(bz, -HZ + 3, HZ - 3); }
  }
  const diff = wrap(Math.atan2(tx - v.x, tz - v.z) - v.heading);
  const steer = clamp(-diff * 2.6, -1, 1);
  const dist = Math.hypot(tx - v.x, tz - v.z);
  let gas = 1; let brake = 0; let boost = false;
  if (!chase && dist < 3) gas = 0.15;                                           // hold a post
  if (Math.abs(diff) > 1.3 && speed > 8) { gas = 0.3; brake = 1; }
  b.dashCd -= dt;
  if (chase && role !== 'keeper' && b.dashCd <= 0 && Math.abs(diff) < 0.2 && dist > 4 && dist < 14 && v.nitro >= 0.4) { boost = true; b.dashCd = 4 + (b.phase % 3); }
  if (v.grounded && Math.abs(speed) < 1.0 && gas > 0.5) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt * 2);
  if (b.stuckT > 1.2) { b.stuckT = 0; b.reverseT = 1.0; b.reverseSteer = -steer || 1; }
  return { steer, gas, brake, boost };
}
