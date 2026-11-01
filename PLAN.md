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

**Phase 3 — More tracks, loops, wall passages, nitro rework** (DONE, awaiting your test)
- 3 tracks via a track factory: Greenridge Run (unchanged), Canyon Loop (desert, 2 loops, corridors, slalom, island with gate, TNT) and Fortress Run (stone, 1 loop, walled passages). Pick with the track icon on the garage screen.
- Loop-the-loop: side-to-side ring (enter on the left lane, loop over the top, exit on the right lane, so it never crosses itself) with the ground underneath filled by solid stone blocks so you have to ride it; scripted ring that guarantees entry speed; AI bots complete every track with all 8 trucks (unit tested).
- Wall passages: narrow corridors, islands with gates, slaloms of crates/barrels; walls are solid and the tougher ones break at speed.
- Nitro: ONE tap, drains the meter for the length it burns (4.5 s, costs 15% to start), much stronger boost, each truck has its own flame colour, nozzle count, ignition burst, shake and FOV punch.
- Bug fix: cars no longer roll backwards during the 1-2-3 countdown (hold input).

**Phase 5d — Big arena + squash** (NEXT)
Bigger multi-level stadium, rows of parked cars on the ground that FLATTEN (squash height, tyres pop) when driven over, ramps, a crusher pit; squash score.
**Phase 5e — Ram + Block** (block shares the brake button; parry window, Batman-style counter cinematic, finisher).
**Phase 5f — Match formats**: last man standing, group (teams) match, and football group match (big ball, goals, truck teams).

**Phase 2.5 — Rivals + richer track** (DONE)
Flatter road with gentle shoulders (no cliffs to get trapped), sand section, rock garden, 5 potholes (one massive), crushed cars, tyre chicane, gentler jump landings, stronger nitro, closer cameras. 5 AI rivals with collisions, rubber-banding, stuck recovery; position HUD; respawn icon + auto-respawn.

**Phase 5a — Arena rivals, health, destruction** (DONE)
5 AI brawlers hunt the nearest truck and lunge with nitro; ram damage by speed and angle (head-on hurts less than a rear hit); 100 HP, wreck = explosion; 58 destructible props (smash: crates/barrels/cars/fences plowed through at speed; break: brick walls that crack; blast: TNT and fuel trucks with chain explosions that hurt and launch trucks); voxel debris pool; score with combo multiplier; last-truck-standing match, 3:00 timer, results with trophy or skull. Nitro now burns 4.5 s per tap (cost 0.4).

**Phase 5b/5c — Attack, block, parry, cinematics** (PROPOSED, awaiting decisions: combat model, block button, match format)
Arena gets rivals as opponents (free-for-all). Build order, each step tested before the next:
- (5a, done below) Arena rivals + health bars (icons only) + ram damage (speed/angle, rear hits count more) + destructibles in three tiers: smash (cars, crates, fences, barrels), break (walls, tower stacks, tyre walls, rocks; chunk by chunk), blast (red barrels, TNT, fuel trucks; chain explosions, shockwave launches trucks). Voxel debris pool with a budget that scales with particle quality. Combo score.
- 5b. Combat: Attack button (lunge, brief recovery; per-truck signature move using existing rig parts: Toxic jaw, Frostbite plow, Titan bed, Night Rider crane, Yellow Thunder stop sign, Magma flame burst, Crusher stomp, Dune Devil flag whip) and Block (guard cuts damage; ~0.25 s parry window stuns the attacker). Rivals telegraph attacks (rev, flash, red ring) and fight each other; AI states: roam, pick target, approach, telegraph, lunge, recover, retreat when low.
- 5c. Cinematics: parry counter (~1 s slow-mo, low camera snap), finisher (~2.5 s orbit camera, slow-mo, voxel explosion, wheels fly, crowd roar), player wreck (camera pulls back). All skippable by tap, rate-limited, no text.
Controls: arena buttons gas, brake, nitro plus attack and block (block may share the brake button; to be decided). Race stays weapon-free.
Tests: damage model, destructible tiers and chain blasts, parry window timing, AI target selection, cinematic skip and rate limit, performance budget on debris.

**Phase 4 — Race flow polish** (pickups, per-rival engine sound, podium)
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
