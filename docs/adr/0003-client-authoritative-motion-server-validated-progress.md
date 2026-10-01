# ADR 0003 — Client-simulated motion, server-computed progress (MVP)

**Status:** accepted

**Decision.** Clients simulate their own car (responsive controls at any latency) and stream positions at 15 Hz. The server never trusts reported laps: it recomputes checkpoints and laps from positions with the shared `LapTracker`, checks speed/teleport/respawn plausibility, minimum lap times, and ranks racers. Flagged racers are disqualified; Laravel re-validates times before booking rewards (idempotent per race).

**Consequences.** + Good feel on mobile networks, trivial cheats (teleport, skip, fake times, fake rewards) are blocked. − A sophisticated client could still drive "perfectly" within physical limits (e.g. scripted inputs). Next step: send inputs and re-simulate server-side (possible because the simulation already runs in Node).
