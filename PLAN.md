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

**Phase 4a — Race pace + competitive rivals** (DONE)
Problem: normal top speed ~23 u/s versus ~45 with nitro, so normal feels slow and nitro feels like cheating; rivals cruise at ~22 and rarely boost, so the pack never fights back.
- Faster normal speed: base top speed up about 35% (roughly 30+ u/s for the fast trucks, 24+ for the heavy ones) with more acceleration; nitro shrinks to about 1.3x top speed (still a strong surge, drained by the single tap) so normal driving is the main game.
- Rivals: each gets a personality (aggressive, steady, risky-lines, defensive), a real nitro budget (meter, pickups and pads like the player), tighter catch-up in both directions (player ahead: rivals push harder; behind: they ease, never cheat), and lane choice through forks.
- Tests: per-truck lap-time targets (every truck laps each track inside a time window), nitro/normal speed ratio assertions, rivals use the nitro budget but never exceed it, pack stays within a set gap of the player over a lap, AI still completes all tracks.

**Phase 4b — Hot Wheels style track elements** (DONE; forks are parallel split-road lanes with a median wall)
- Accelerator pads (chevron strips) on risky lines; slow zones (oil, goo, mud, sand patches you can avoid); nitro pickups (refill part of the meter, so the meter becomes a route resource); visible checkpoint gates with a small bonus; shortcuts behind breakable walls (reuse the wall tier); gaps with a real failure path (miss the jump and you drop into a slow recovery lane).
- Forks on every track: the road splits into a short risky route and a long safe one and rejoins. Needs branch-aware lap progress, checkpoints, minimap, AI route choice, wrong-way logic and respawn. Each existing track gets one fork; loops become a choice where it makes sense.
- Tests: pad/zone/pickup effects, both fork routes completable by every truck, no checkpoint skipping via a branch, AI picks routes and never gets stuck, minimap draws both branches.

**Phase 4c — Ninth truck: Volt (electric)** (DONE; chain lightning)
- Voxel model with roof coils and glowing cyan/white body; flowing sparks and arcs along the body, wheels and coils (always on, stronger with speed and nitro); nitro is lightning arcs with a blue-white flash; electric whine and crackle sound instead of an engine roar.
- Handling: fast, light, strong acceleration and steering, weak off-road. Ability (confirmed): visible chain lightning. Bolts jump from Volt to nearby trucks and props (and between them), drawn as bright forking voxel arcs with a flash and crackle; in Arena it damages and chains between rivals on ram, in races it briefly slows rivals it arcs to. Charge pads refill it.
- Added to the garage roster (nine trucks), paint customisation, per-truck feel entry.
- Tests: model integrity, roster count and unique ids, feel/nitro entries valid, spark emitter present and pooled within the particle budget.

**Phase 4d — Loop camera fix** (DONE; side view, no fade)
When riding a loop the ring, the blocks and the pylons sit between the camera and the truck, so the way down is hidden. Cause: all four camera views ignore loops.
- While on a loop the camera moves to the side of the ring plane (profile view, wider field of view) so the whole ring is visible, and parts of the ring and blocks that sit in front of the truck fade out; it eases back to the normal view on exit.
- Tests: camera goal while looping stays off the ring plane, loop camera ends cleanly, no regression in the four views.

Order: 4d (small bug) -> 4a (pace) -> 4b (track elements and forks) -> 4c (Volt). Each ends with tests, a push to main and your test.

**Phase 6 — Challenge pass (races)** (DONE, awaiting your test; note: Fortress has one fork, its corridors leave no room for a second)
Your feedback: more challenging, rivals should use boosts, meter filled only by powers, more speed and acceleration, suspension modes, real obstacle penalty, more routes and gaps.
Order: 6a -> 6b -> 6c -> 6d -> 6e. Each step ends with tests, a push to main and your test.

**6a — Nitro economy + rivals chase powers**
- Remove the passive nitro refill (NITRO_REGEN) for everyone. The meter fills only from canisters (+0.4), pads (small top-up), checkpoints (+0.12) and a skill bonus for clean landings.
- Rivals steer toward canisters within reach and pads on their route; they share the same canisters, so you can take them first. Rivals use the same meter and no free refill. Start tank: half.
- More canisters per track (placed on risky lines and after hazards) so the meter is a route decision.
- Tests: no regen in a stationary truck, meter only rises through the listed sources, rival takes a canister placed near its line, rival never exceeds its meter, every truck still finishes every track.

**6b — Pace**
- Top speed and acceleration up about 15% for all trucks (formula in arcade.js tuningFor); nitro ratio stays near 1.3x.
- Re-check loop entry speed, jump distances, landings and corner braking for every track and truck; adjust ramps or the scripted loop entry if needed.
- Tests: lap-time window per truck and track, loop clears at the lowest speed truck, jump distances land on the intended ramp, rival lap times stay within the window.

**6c — Obstacle and wall penalties** (same rules for rivals)
- Solid obstacle head-on: lose about 45% speed (was 25%), graze about 10%; walls about 35% (was 20%); smash props cost speed that falls as your speed rises (plough through at speed or nitro for little loss).
- Heavy hits give a short stall (about 0.4 s of reduced throttle), spark and shake feedback, and dent hit points (races show it as a sputter, no HUD text).
- Tests: head-on versus graze loss, smash prop cost versus speed, stall ends, rivals get the same penalty, nothing makes a truck unrecoverable.

**6d — Suspension modes (garage only)**
- Soft, Normal, Stiff, chosen on the garage screen with an icon button next to paint; saved per truck.
- Soft: better on mud, sand and bumps, more bounce on landings. Stiff: sharper steering, higher top speed on tarmac, slower on rough ground. Maps onto the existing sus params (k, bounce) plus grip and soft-ground multipliers.
- Tests: three modes give different tuning, saved and restored per truck, surface effects differ as stated, rivals pick a mode at random, all trucks finish all tracks in every mode.

**6e — More routes and gaps**
- Each track gets 2 to 3 forks (fast risky or safe), plus at least one real jump gap (trench) with a slow detour lane around it; missing the gap drops you in, then respawns you at the lip with a few seconds lost.
- Rivals choose gap or detour by style and speed; one shortcut per track that needs nitro.
- Tests: forks rejoin with correct progress and checkpoints, trench jump clears at normal speed and nitro, a miss respawns correctly, detour lane completable by every truck, AI never stuck, minimap draws both routes.

**Phase 7 — Fix pass, difficulty, football, and very different stages** (7a, 7b, 7c DONE, rest planned; goes before 5d)
Your feedback: still overpowered, loop pillars and side view, easy to drive round obstacles, arena hits, football missing, stages too alike.

**7a — Race fixes + difficulty setting**
- Difficulty (Easy / Normal / Hard, a settings icon, saved): Easy = today. Normal = rival skill 100-104%, catch-up up to +20% when trailing, a free nitro top-up when far behind. Hard = skill 104-110%, catch-up +30%, rivals dodge walls cleanly and no pit mistakes.
- Method first: a bot that drives like a good player is raced against the pack in tests; each level must keep the pack within a set gap of that bot over three laps.
- Loops: remove the grey support pylons (keep the solid stone blocks under the ring). Camera: replace the side view with a chase view that rolls with the ring so the road curves up and over you, ring made see-through.
- Obstacles: every wall run (corridors, islands, slaloms, forks) is extended to the track barrier, so there is no way round the side; crates, barrels and rocks stop you unless you hit them fast or on nitro.
- Tests: no gap between wall ends and the barrier, pylons gone, loop camera stays behind the truck, bot-versus-pack gap per level, breakAt rules.

**7b — Arena damage rule**
- You only take damage from a hit that comes at you. If you ram a rival, they take it and you do not (unless they were driving at you too). Your own explosions and Volt's bolts never hurt you. Rivals hurt each other only when one attacks.
- Tests: attacker versus victim for each pairing, blast owner is immune, damage still ends matches.

**7c — Stage engine + Himalaya Pass** (DONE: per-stage gravity, wind, snow/ice/plank surfaces, timed avalanche hazard, snowfall, alpine sky/fog, snow-capped peaks and pines; Himalaya Pass is the 4th stage. Slalom left out of this stage: AI jams on it at snow-stage speeds)
- Stage engine: every stage defines its own sky and light, fog, weather particles (snow, rain, ash, embers, spray), ground and wall palette, backdrop (mountains, ocean, city, cave walls), gravity, wind, surface set (adds ice, snow, wet planks, lava), hazards and its own prop set. Each stage gets a different music and engine-ambience mix.
- Himalaya Pass: snow, thin blizzard fog, ice patches (very low grip), prayer-flag gates, yak herds crossing, stone chortens, a rope bridge with loose planks, cliff edges with no barrier on the outer side, a timed avalanche wave from the slope.
- Tests: stage defs valid, every stage laps with every truck, hazards fire and respawn correctly, new surfaces change grip as stated.

**7d — Skull Cavern + Magma Peak**
- Skull Cavern: underground, almost dark with a headlight cone, glowing mushrooms and crystals, bone bridges, a skull-mouth tunnel entrance, dripping stalactites that drop on a timer, bats, a tight twisting road with low ceiling look.
- Magma Peak: a volcano climb round the crater rim, lava rivers beside and across the road (touch = respawn and a time penalty), cooling rock plates that sink, geyser launchers, falling ash and embers, red heat sky.
- Tests as 7c plus lava respawn, geyser launch height, stalactite hit.

**7e — Football mode** (arena variant, replaces the football part of 5f)
- A walled pitch with two goals and a big ball, two teams of trucks (you plus rivals), ram the ball with the nose, kickers and ramps for lobs, nitro to chase, short matches (3 minutes or first to 5), team colours, goal replays with a camera cut. Joystick and the same two buttons; no new controls.
- Tests: ball physics, goal scoring, team assignment, match end.

**7f — Sea Bridge + Dragon's Spine (very steep)**
- Sea Bridge: a road on piers and boardwalk over the ocean, side wind gusts, wet planks (low grip), waves splashing the deck, a drawbridge gap to jump, ships and gulls, no side barriers in places (fall = respawn).
- Dragon's Spine: a very steep stage with switchback hairpins, climbs up to about 35 degrees and long drops; strong gravity along the slope, downhill speed to manage, uphill needs nitro; ramps off the crest. Track tools get a higher grade limit for this stage only.
- Tests: grade limits per stage, wind force, drop respawn, every truck can finish the climb.

**7g — Moon Crater (astronomical)**
- Black sky full of stars with a faint Milky Way band, the Sun as a hard white light with long sharp shadows (no haze, no fog), a big Earth hanging in the sky (blue oceans, white clouds, brown land, a lit and a dark side).
- Grey regolith ground in voxels with footprints and tyre tracks left behind, crater bowls of all sizes with raised rims and ejecta rays, boulder fields, a lander and a flag as landmarks, dust that flies in clean arcs and falls slowly (no air).
- Physics: gravity about one sixth (huge floaty jumps, long landings, slower fall), less grip, wheels spin in the air; crater bowls are big dips you can use for speed, boost craters.
- Engine and sound: muffled thumps and a low hum instead of roar (no air outside), radio crackle; nitro flames are short and bright.

**7h — Saturn's Rings**
- You race ON the rings: the track is a broad band of ice and rock chunks in a flat ring plane, Saturn filling the sky with its banded gold-cream-brown globe, its shadow cutting across the rings, and the ring plane stretching off like a disc. Dark space and stars all round, moons in the distance.
- Ring bands as track zones: bright icy A ring, dark gap (the Cassini Division) crossed by a jump, denser B ring with chunky boulder fields to weave through, the faint C ring with loose dusty sections; the road is formed by drifting ice slabs you ride from one to the next.
- Physics: very low gravity, slick ice (low grip), chunks that you can bounce off and big floating boulders as obstacles; sunlight low and warm from one side with a deep blue shadow on the other.
- Look target: from the garage you should recognise Saturn at once - banded globe with soft stripes, a thin bright ring set at the right tilt, a shadow of the globe on the rings - in the voxel style of the rest of the game.

**7i — Neon Night City** (after the space stages)
- Rain, wet asphalt, neon signs, crossing traffic cars as moving obstacles, a drift section, headlights on.

Order: 7a -> 7b -> 7c -> 7d -> 7e -> 7f -> 7g -> 7h -> 7i. Each ends with tests, a push to main and your test.

**Phase 7 - implementation plan (7c onward, technical)**
What exists today: a stage is a track definition (`theme` = colours + `sky: 'day'`, wall/prop lists, features) built by `makeTrack`; `scenes.js` paints it with one shared day sky, one fog, one set of lights, and `arcade.js` has one global gravity (30) and a fixed surface table. Everything below adds a stage layer on top without changing how the three existing stages play.

**7c-1 Stage environment layer** (the foundation; every later stage uses it)
- New `env` block on each track definition, all optional with today's values as defaults: sky gradient stops, star density, sky bodies (sun disc, Earth, Saturn), fog colour/near/far, hemisphere + sun light colours and strength, ground colour, backdrop kind (mountains, ocean, cave wall ring, skyline, none), weather kind and rate, gravity, wind (x,z), `dark` (headlight mode), ambience and engine-filter names.
- `scenes.js`: `setCourse` reads `env` and swaps sky, fog, lights and background per stage instead of the single day set; per-stage sky/backdrop groups are built once and cached like the track groups. Existing three stages get an explicit `env` equal to today's look, so nothing changes visually.
- Backdrop builders in a new `src/world/backdrops.js` (voxel ridges of mountains, ocean plane with scrolling wave colour bands, cave wall ring, city skyline, star field with a Milky Way band, planet builders for Earth and Saturn made from banded voxel spheres and a thin ring disc).
- Tests: `env` validates (colours in range, kinds known), the three old stages keep their default env, backdrop builders return the expected counts.

**7c-2 Physics hooks**
- `arcade.js`: gravity read from `terrain.gravity ?? 30` (jump, fall, spring sag, slope pull all use it, ride height recomputed from the stage's gravity at vehicle creation); wind adds a sideways acceleration `terrain.wind` while grounded (scaled down) and in the air (full); new surfaces `ice`, `snow`, `planks`, `regolith`, `ringIce`, `lava` in `SURFACES` with grip/drag/maxMul; `lava` is a hazard surface, not a grip surface.
- Hazard layer in a new `src/physics/hazards.js` (pure, deterministic from stage time): `lava` zones (touch = event `lava`, respawn plus 3 s penalty), `geyser` pads (periodic launch impulse), `stalactite` drops (a falling solid with warning shadow on a timer), `avalanche` (a moving snow wave across a road section: push plus slow, safe lane marked by timing), `wave` (periodic spray slowdown), `traffic` (moving cars along a lane as obstacles), `platform` (drifting ice slabs on Saturn's rings, move on a path, truck rides them). `tickHazards(terrain, t, dt)` is called next to `tickPickups`.
- Respawn rule reused from the trench: a `respawnAt(s)` that puts the truck on the safe lane before the hazard.
- Tests: gravity changes jump apex as v^2/2g, wind shifts a coasting truck, every surface changes grip/top speed as stated, lava respawns, geyser launches to the expected height, stalactite and avalanche timing are exact functions of time, platform carries a truck.

**7c-3 Weather and ambience**
- `src/fx/weather.js`: a camera-following box of instanced particles that wrap around the viewer (snow, rain, ash, embers, spray, dust, star-twinkle); count scales with the particle-quality setting; none when quality is low except a light version.
- `sfx.js`: per-stage ambience beds (howling wind, cave drips with echo, lava rumble, waves and gulls, space hum, rain) built from the existing noise/oscillator code, plus an engine filter for space stages (muffled).
- Tests: weather spawns the right count per quality, particles stay inside the box, ambience names map to builders.

**7c-4 Garage and menu**
- Track picker handles ten stages: thumbnail canvas gets a colour strip from the stage palette and an icon tag (snow, flame, wave, skull, moon, ring), prev/next wrap.
- Save: `track` accepts the new ids; unknown ids fall back.
- Tests: picker cycles all stages, thumbnail draws without error, save round-trip.

**7c-5 Himalaya Pass** (first stage on the new layer)
- Track: long climbing road along a ridge, tight hairpins, gentle grade 0.12, outer edge with no barrier at two cliff sections (fall = respawn via hazards), narrow rope bridge section (planks, low walls).
- Env: pale blue to white sky, big snow peaks backdrop in layers, thin fog and blizzard whiteout bursts, snow weather, bright cold sun.
- Surfaces and hazards: packed snow road, ice patches, one avalanche section with a marked safe side, yak herds crossing as slow movable obstacles, prayer-flag gates (decor), stone chortens, wooden bridge.
- Tests: every truck laps with the AI, avalanche safe side exists, cliff respawn works, ice grip lower than road.

**7d Skull Cavern + Magma Peak**
- Skull Cavern: `dark` env (headlight cone from the truck: a spotlight following it), glow props (crystals, mushrooms) as emissive voxels, skull-mouth entrance arch, bone bridges as plank sections, stalactite drops on a timer, bats as ambient particles, twisting road with ceiling-look rock ring.
- Magma Peak: climb around a crater rim, lava rivers beside and across the road (hazard), sinking rock plates (platform that drops after a touch), geysers, ash and ember weather, red sky and glow light.
- Tests as 7c plus lava respawn, stalactite warning then hit, platform sink timing, headlight cone follows the truck.

**7e Football** (new files, arena unchanged)
- `src/world/pitch-layout.js`: walled pitch with two goals, centre circle, ramps, boost pads, pure data plus height function.
- `src/physics/ball.js`: big ball (radius about 2.2) with gravity, bounce, friction, wall bounces, truck collision (impulse from truck velocity and nose direction, extra kick when boosting), goal detection.
- `src/match/football.js`: teams of 3 versus 3 (you plus 2 rivals), score, 3 minutes or first to 5, kickoff reset, team colours.
- AI roles: striker drives behind the ball and pushes it toward the goal, support covers the middle, keeper stays near the goal line and clears; reuses the arena brawler steering.
- HUD: team score and timer as icons and numbers; goal replay: a position ring buffer of the last 4 s replayed with a cut camera.
- Garage: football icon beside arena. Same joystick and two buttons.
- Tests: ball bounces and loses energy, truck kicks scale with speed, goal counted once, kickoff reset, AI striker scores on an empty goal, match ends correctly.

**7f Sea Bridge + Dragon's Spine**
- Sea Bridge: road on piers over ocean (ocean backdrop plane with animated bands, ships and gulls), wet planks, side gusts from `wind`, periodic wave spray slows, drawbridge gap jump with a nitro or ramp line, sections with no side barrier (fall = respawn).
- Dragon's Spine: grade limit raised for this stage (up to 0.7 in places), switchback hairpins with banked turns, long descents where `slope pull` matters, crest ramps; the track definition gets a `maxGrade` field and the existing grade test reads it per stage.
- Tests: wind pushes, spray slow, steep stage grade within its own limit, every truck can climb (nitro allowed), downhill stays controllable.

**7g Moon Crater**
- Env: black sky, thousands of stars with a Milky Way band, hard white sun with long shadows (shadow camera widened), Earth body in the sky, no fog, gravity 5 (one sixth), low grip regolith.
- Decor: crater bowls and ejecta, boulder fields, lander and flag, footprints/tyre-track decals that fade, dust arcs (particles use the stage gravity).
- Tests: gravity value respected end to end, regolith grip, stars/Earth builders, laps by all trucks.

**7h Saturn's Rings**
- Env: dark sky, giant banded Saturn globe, thin bright ring at the right tilt, its shadow across the track band, warm low sun, gravity about 4, very slick ice.
- Track: ring bands as sections (icy A ring, a dark gap crossed by a jump, dense B ring boulder fields, dusty C ring); drifting ice slabs (platform hazard) carry you over short voids; falling off = respawn.
- Tests: platform path and carry, gap jump clearable at pace, slick grip, laps by all trucks.

**7i Neon Night City**
- Env: night sky, wet asphalt colours, neon sign props as emissive voxels, rain weather, headlights on; traffic hazard (crossing cars on timers), a drift section with low grip.
- Tests: traffic collisions and respawn, rain count, laps.

**Cross-cutting**
- Smoke test: one new check per stage (loads, renders, nothing in the console, env applied, weather alive) and the garage picker cycles through all ten.
- Performance: instanced everywhere; weather and backdrops obey the particle-quality setting; hazard ticking is O(number of hazards) per frame.
- Rollout: each of 7c-1..7c-5 ships as its own commit; 7c-1/2 go out behind the three existing stages so nothing visible changes until Himalaya Pass appears.
- Risks: low gravity changes ride height and spring feel (retune per stage), steep grades stress the terrain mesh and AI braking, a dark cave needs a readable headlight cone, the Saturn and Earth looks must be checked by eye on a screenshot before shipping.

**Phase 5d — Big arena + squash**
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
