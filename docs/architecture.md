# Architecture

```
Presentation / UI      client/src/app        React screens, HUD, touch controls (no game rules)
        ↓
Game Application       client/src/game       RaceSession, GarageScene, EngineHost, input, camera, audio, effects
        ↓
Game Domain            shared/src            TrackPath, ArcadeVehicle, LapTracker, AutoPilot, protocol, anti-cheat (pure TS)
        ↓
Infrastructure         client/src/net, realtime/, backend/   REST, WebSocket, Laravel + MySQL
```

The domain package has **no dependency** on Babylon, React, the DOM or Node: the exact same simulation runs in the browser (player + offline bots), in the realtime server (server bots, lap validation) and in tests.

## Modules

| Domain (mission) | Location |
|---|---|
| Game / Race | `client/src/game/race/RaceSession.ts` (lifecycle, fixed 60 Hz step, countdown, finish), `shared/src/race/LapTracker.ts` |
| Vehicle / Physics | `shared/src/physics/ArcadeVehicle.ts`, `shared/src/vehicles.ts` (tuning per vehicle), `client/src/game/physics/PhysicsProps.ts` (Havok) |
| Track | `shared/src/track/*` (definition + arc-length spline), `client/src/game/scene/TrackBuilder.ts` (procedural meshes/decor) |
| Camera | `client/src/game/camera/DynamicRaceCamera.ts` |
| Audio | `client/src/game/audio/AudioEngine.ts` (engine/tires/wind/impacts/UI, spatial remotes) |
| Effects | `client/src/game/effects/Effects.ts` (pooled particle systems) |
| Input | `client/src/game/input/InputManager.ts` (keyboard, touch, gamepad) |
| Lobby / Multiplayer / Networking | `realtime/src/*`, `client/src/net/*`, `shared/src/protocol.ts` |
| Player / Progression / Garage / Customization | `backend/app/Services/*`, `backend/app/Http/Controllers/*`, `client/src/app/screens/GarageScreen.tsx`, `client/src/game/garage/GarageScene.ts` + `workshop.ts` (showroom), `Thumbnails.ts` (off-screen 3D thumbnails) |
| Results | `client/src/game/results/PodiumScene.ts` (3D podium, confetti), `client/src/app/screens/ResultsScreen.tsx` |
| Performance | `client/src/game/quality/QualityManager.ts`, `client/src/game/engine/EngineHost.ts` |

## Runtime flow (online race)

```
Client ──REST──> Laravel  : guest auth (Sanctum), garage, signed realtime ticket (HMAC, 15 min)
Client ──WS────> Realtime : hello(ticket) → lobby.create/join → select → ready → start
Realtime ─HMAC─> Laravel  : POST /internal/races (grid)
Realtime ──WS──> Clients  : race.load → (all loaded) race.countdown(startAt server clock)
Clients  ──WS──> Realtime : race.state 15 Hz (local sim at 60 Hz)
Realtime ──WS──> Clients  : race.snapshot 15 Hz (interpolated 120 ms behind), standings 4 Hz
Realtime                  : validates movement, tracks checkpoints/laps itself, simulates bots
Realtime ─HMAC─> Laravel  : POST /internal/races/{uuid}/finish → rewards (idempotent)
Realtime ──WS──> Clients  : race.results (+ XP / v-MRU granted by the server)
```

## Loading

`BOOT → fonts + core bundle → Home (showroom scene) → Garage (same scene) → Race (showroom released, circuit built procedurally, Havok wasm lazy-loaded except on ECO) → Results (podium scene, released on exit)`. City and Desert are never in memory at the same time; only one 3D scene is mounted at once (`client/src/app/backdrop.ts`).

## Client state

Tiny observable stores (`client/src/state/store.ts`) instead of a state library: `appStore` (screens, profile, lobby, results), `settingsStore` (persisted in localStorage, try/catch), `hudStore` (published at 20 Hz by the race session — React never re-renders per frame).
