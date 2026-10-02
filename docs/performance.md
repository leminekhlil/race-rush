# Performance

Targets: **30 FPS stable on a mid-range phone**, 60 FPS on recent phones / desktop.

## Quality profiles (`client/src/game/quality/QualityManager.ts`)

| | ECO | STANDARD | HIGH |
|---|---|---|---|
| Max DPR × render scale | 1 × 0.7 | 1.5 × 1 | 2 × 1 |
| Shadows | off (blob shadows) | off (blob shadows) | PCF 1024 following the player |
| Glow layer | off | off | on |
| Particles | 35 % | 70 % | 100 % |
| Decor density | 45 % | 80 % | 100 % |
| View distance / fog | 260 m, dense | 480 m | 800 m |
| Havok props | off (no wasm download) | on | on |

**AUTO** picks a profile from the WebGL renderer string, touch/UA and core count (software GL → ECO, recent Apple/Adreno 7xx/Mali-G7xx+ → STANDARD, other phones → ECO, desktops → STANDARD/HIGH), then **adapts the render scale** every 2 s (drops when < 27 FPS, raises after 3 windows > 56 FPS, floor 45 %). Menus (showroom) render at a crisper fixed resolution since they are cheap.

## Measured (this environment)

Headless Chromium with **SwiftShader (CPU rasterization, 4 vCPU)** — absolute FPS here is *not* representative of a phone GPU; draw calls, triangles and memory are.

| Profile | Track | Draw calls | Triangles drawn | JS heap | FPS (SwiftShader) |
|---|---|---|---|---|---|
| ECO | City | 59 | 40 k | 82 MB | 22 |
| ECO | Desert | 77 | 39 k | 63 MB | 19 |
| STANDARD | City | 61 | 47 k | 122 MB | 9 |
| STANDARD | Desert | 79 | 46 k | 111 MB | 12 |
| HIGH | City | 171 | 102 k | 116 MB | 5 |
| HIGH | Desert | 184 | 104 k | 116 MB | 6 |

Measured after the map landmarks (tunnels, bridges, harbour…): they add ≈ 10 draw calls thanks to merged vertex-coloured geometry and thin instances.

- Simulation CPU cost: **55 µs per 60 Hz step for 5 vehicles** (≈ 0.3 % of a frame) — `npx tsx` micro-benchmark.
- Bundle: 2.25 MB JS (≈ 540 KB gzip), Babylon chunk 443 KB gzip; Havok wasm 2 MB lazy-loaded only on STANDARD/HIGH.
- 60 – 80 draw calls and < 50 k triangles on ECO/STANDARD are well within mid-range mobile GPU budgets; HIGH's extra cost is the shadow pass + glow layer (desktop profile).

Reproduce: `node e2e/perf.mjs` (dev server running).

## Techniques in place

- Merged procedural geometry (road, curbs, barriers, embankments, buildings = 1 mesh each), **thin instances** (lamps, trees, cacti, chevrons, dunes, beacons), frozen world matrices, `doNotSyncBoundingInfo`, no picking.
- Vehicles: parts merged per material (≈ 6–9 draw calls each), shared materials, wheel clones.
- Particles: fixed-capacity systems, created once; only emit rates change (no per-frame create/destroy). Burst systems are shared and repositioned.
- Procedural canvas textures (no texture downloads), self-hosted fonts.
- Fixed-step simulation decoupled from rendering, with render interpolation; HUD published at 20 Hz (React never renders per frame); minimap at 15 Hz on its own canvas.
- Showroom scene released before a race; one track in memory at a time.

## Known bottlenecks / next steps

1. Real-device profiling (Safari iOS, Chrome Android) — not possible in this environment.
2. KTX2/Basis textures and GLB models once final art exists.
3. LOD for buildings on long straights; occlusion via sectors for City.
4. WebGPU path (opt-in) after real-device comparison.
