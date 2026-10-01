# ADR 0001 — Arcade vehicle physics in a shared, engine-agnostic module; Havok for secondary interactions

**Status:** accepted

**Context.** The mission recommends Babylon.js + Havok. The vehicle model must be arcade, predictable, identical for every player, and must also run on the server (bots in online races, lap validation, future server authority).

**Decision.** The driving model (`shared/src/physics/ArcadeVehicle.ts`) is custom TypeScript with no engine dependency: track-frame barrier resolution, circle car collisions, ballistic jumps from the road profile. Havok (lazy wasm) handles secondary rigid-body interactions (knockable cones/crates) with vehicles as kinematic bodies.

**Consequences.** + Deterministic, testable headlessly (3 laps × 4 vehicles × 2 tracks in CI), runs in Node, ~55 µs/step for 5 cars, no wasm needed on ECO. − Vehicles do not tumble/roll over (acceptable for arcade); a Havok raycast-vehicle could be explored later for stunts.
