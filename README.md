# Voxel Racers
Voxel based monster truck racing. Plain HTML + Three.js (bundled in `lib/`, no CDN), served by GitHub Pages from the root of `main`.

Play: https://achallakiran.github.io/voxel-racers/

## Status
Phase 0 (foundation): logo splash, six voxel monster trucks in a garage preview, icon-only controls, repaint, saved choice.
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
