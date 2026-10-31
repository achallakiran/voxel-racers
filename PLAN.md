# Voxel Monsters — Implementation Plan

Monster truck racing in voxels. Plain HTML + Three.js (bundled, no CDN), served from the root of `main` via GitHub Pages.

## Locked decisions
- Title: **Voxel Monsters**. Studio line: **ADA STUDIOS PRESENTS**.
- Start flow: rotate-phone prompt (portrait only) -> logo fades in/out -> ADA STUDIOS PRESENTS fades in/out (automatic, no tap) -> title -> garage. Sound, fullscreen and landscape lock unlock on the first tap (skip or Play).
- Roster: 8 trucks with distinct bodies and moving parts: open pickup, buggy, snow-plow, gator-jaw, exposed-engine, crane tow truck, monster school bus, 6-wheel dump truck.
- Renderer: Three.js, vendored in `lib/`.
- Camera: 4 views cycled by an icon (Iso-follow default, Fixed iso, Chase, High top-down), saved.
- Controls: joystick + 2 buttons. B1 = gas (hold), B2 = brake/reverse, joystick flick up = nitro. Optional Auto-gas in Settings. Keyboard and gamepad fallback.
- Physics: two backends behind one interface, Settings switch Arcade / Realistic (Rapier, bundled WASM). Decide after playing both.
- Race: 3 laps, 6 trucks (player + 5 rivals).
- Sound: all synthesized with WebAudio, no asset files.
- Customisation: body / accent / wheel colour + finish, saved in localStorage.
- HUD: icons only, text non-selectable, touch selection and long-press blocked.
- Landscape is the main orientation (touch + desktop).

## Repo layout
```
index.html
assets/logo.jpeg
lib/            three.module.js, rapier (wasm)
src/
  core/         loop, input, storage, events
  physics/      physics-iface, arcade, rapier
  world/        track-spline, terrain, props, loops
  vehicles/     truck-models, truck-stats, paint
  ai/           rival drivers
  fx/           particles, tire marks, debris
  audio/        engine, sfx, music
  ui/           splash, title, menus, hud, joystick
  tracks/       dust-canyon.js (then others)
tests/          unit (node) + smoke (headless browser)
```

## Phases
Each phase ends with: tests pass, push to `main`, you test, feedback, next phase.

**Phase 0 — Foundation** (this push: logo + plan)
Repo skeleton, bundled Three.js, game loop, Pages-ready `index.html`, test runner, CI smoke test.

**Phase 0.5 — Start flow + truck variety** 
Rotate prompt, tap-to-start, ADA Studios intro, title screen, 8 animated trucks (pistons, crank pulley, plow, jaw, crane, dump bed, stop sign, flag), pooled smoke/flame particles that follow the revs.
Title backdrop: voxel stadium at sunset (tire wall, crowd stands, floodlights, ramp, crushed cars, mesas, sun, drifting clouds/dust). Garage: its own brick workshop with roller door, shelves, workbench, lamps and a hazard-striped turntable.
Tests: world layout, flow state machine, animation maths, particle pool, emission rules, model integrity (no overlapping voxels, parts present).

**Phase 1 — Truck + physics sandbox** (DONE)
Sandbox bowl, arcade physics, joystick + B1 gas + B2 brake, 4-camera icon, keyboard/gamepad.

**Phase 1.5 — Feel pass** (from your first test)
Visible nitro button (tap, above gas). Per-truck engine voice, handling and suspension. Soft monster-truck body suspension (squat, dive, roll, landing bounce). Calmer jumps (launch speed cap, lower kicker). Camera icon stays for experimenting.

**Game modes** (decided: both, as separate modes; race first is not required, arena is the quicker win)
- **Arena** (Phase 2): bounded stadium, smash crushable car piles, collect stars, stunt score for air time/flips, timed rounds, rewards.
- **Race** (Phases 3-4): bounded track with a real road (asphalt + dirt sections), grass/mud/rock off-road, barriers, checkpoints, 3 laps, rivals.

**Phase 1.6 — Monster physics + wheels** (DONE)
Giant tyres (wheels taller than the body), spring-suspension physics: bouncy landings, hops over bumps, speed scrubbed by rough ground, surface grip/drag (asphalt, dirt, grass, mud).

**Phase 2 — Race track** (DONE, first track: Greenridge Run)
750 m bounded loop with a road (asphalt, dirt, mud strip), grass shoulders, hills, 2 big jumps, whoops, rumble logs, barriers, trees, checkpoints, 3 laps, countdown, minimap, results. Race and Arena are separate garage buttons.
Tests: track geometry (closed, curvature, clearance, grade), barrier containment, a bot drives a full lap, race rules (order, skipping, backwards), terrain mesh.

**Phase 3 — More tracks + loop** (next)
Loop-the-loop (with a stick-to-surface rule), then Pine Mud Run, Frozen Loop, Volcano Rim. Pick via a track icon.
Spline track with banking, hills, jumps, a loop, rocks and cacti, bounded by cliffs and tire walls. Surface-stick rule for the loop. Lap and checkpoint logic, mini-map.
Tests: spline sampling, lap counting, no-skip checkpoints, loop stick speed.

**Phase 4 — Rivals + race flow** (positions, rubber-banding, pickups)
5 rivals with distinct personalities and colours, racing line with variance, light rubber-banding, pickups (nitro, cash). Countdown, positions (1st/2nd tags), results.
Tests: AI follows line, position sorting, race state machine.

**Phase 4 — Rapier backend**
Same truck and track on the Rapier backend, Settings switch, loop assist. Side-by-side feel comparison for you.
Tests: both backends pass the same interface contract tests.

**Phase 5 — FX + Sound**
Dust, mud, sparks, exhaust, nitro flames, tire marks, crash debris. Engine (RPM-pitched V8 with turbo and pops), landings, crunches, crowd, chiptune menu loop. Particle quality setting.
Tests: particle pool limits, audio graph builds without errors.

**Phase 6 — Menus + Garage**
Splash (logo), title screen, Race / Garage / Settings. 6 trucks with stats, colour customisation, volume, controls size, left-handed layout, physics mode, auto-gas.
Tests: storage round-trip, menu navigation, saved settings applied.

**Phase 7 — More tracks**
Pine Mud Run, Frozen Loop, Volcano Rim, Junkyard Arena, each with its own props and hazards.
Tests: each track loads, closes, has valid checkpoints.

**Phase 8 — Polish + performance**
Mobile frame-rate tuning, LOD, final balance.

## Test strategy
- Unit tests in Node for pure logic (spline, laps, AI, physics step, storage).
- Headless browser smoke test: page loads, no console errors, canvas renders.
- Every new feature adds tests; all tests must pass before each push.

## Risks
- Loops under Rapier are fiddly; expect extra assist code.
- Mobile performance with heavy particles; mitigated by the quality setting.
