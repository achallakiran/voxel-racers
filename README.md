# Voxel Monsters
Voxel based monster truck racing. Plain HTML + Three.js (bundled in `lib/`, no CDN), served by GitHub Pages from the root of `main`.

Play: https://achallakiran.github.io/voxel-racers/

## Status
Phase 0.5: rotate-phone prompt, tap to start, ADA Studios intro, title screen, and a garage with 8 animated voxel monster trucks (smoke, pistons, jaw, plow, crane, dump bed...). Hold the screen to rev the engine; drag to rotate.
See [PLAN.md](PLAN.md) for the roadmap.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests
```
npm test            # Node unit tests
npm run test:smoke  # headless Chrome smoke test (needs: pip install playwright, Chrome)
npm run test:all
```
