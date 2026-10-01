# Multiplayer

## Model (MVP)

| Client | Server (realtime) | Server (Laravel) |
|---|---|---|
| Local simulation 60 Hz, input, rendering, interpolation of others (120 ms) | Identity (signed ticket), lobbies, race state, **checkpoints & laps recomputed from positions**, bots, standings, anti-cheat, result ranking | Accounts, XP/levels, v-MRU ledger, ownership, upgrades, results, **rewards** (idempotent) |

The client never reports laps, positions or rewards — only its position stream. The architecture allows moving to input-based server authority later: the vehicle simulation already runs in Node (`shared/`).

## Lobby states

`WAITING → READY (all humans ready) → COUNTDOWN → RACING → FINISHED → WAITING (rematch) / CLOSED (empty)`

Codes: 4 characters without ambiguous glyphs (`7X9K`). Host migration when the host leaves. Auto start when the lobby is full and everyone is READY; otherwise the host launches. `botFill` completes the grid to 5. Quick race = solo lobby started immediately.

## Protocol (`shared/src/protocol.ts`, JSON over WebSocket `/ws`)

Client → server: `hello{ticket}`, `ping`, `lobby.create|join|leave|select|ready|config|start`, `race.loaded`, `race.state{x,y,z,h,v,f}` (15 Hz), `race.respawn`, `race.quit`.

Server → client: `welcome`, `pong` (clock sync, best-RTT sample), `lobby.state`, `race.load{grid}`, `race.countdown{startAt}` (server clock), `race.snapshot` (15 Hz), `race.standings` (4 Hz), `race.finish`, `race.results{results, rewards}`, `error`.

Bandwidth: ~60 bytes × 5 racers × 15 Hz ≈ 4.5 KB/s down per client.

## Anti-cheat (`shared/src/anticheat.ts`, `realtime/src/RaceRoom.ts`, `backend/app/Services/RaceService.php`)

| Check | Where | Effect |
|---|---|---|
| Payload validation (finite, bounded), 4 KB max frame, flood limit | realtime | dropped + logged |
| Impossible speed (vs fully upgraded max × 1.25 + slack) | realtime | logged; flagged after 5 strikes |
| Teleport (> 45 m jump) | realtime | flagged |
| Declared respawn far from the last validated checkpoint | realtime | flagged |
| Checkpoint skipped / out of order | realtime (server-side LapTracker) | flagged |
| Lap faster than physically possible | realtime + Laravel | flagged |
| Too few state updates for a finish | realtime | flagged |
| Total time / best lap below track minimum | Laravel (second line) | flagged, 0 reward |
| Inconsistent ranking / unknown slots | Laravel | 422 |
| Replay of a finish | Laravel | same answer, no second booking |

Flagged racers are classified last (DSQ) and receive nothing. All anomalies are logged (`race_anomalies` table + structured logs).

## Testing multiplayer

1. Start API, realtime and client (see README). On a phone on the same Wi-Fi open `http://<lan-ip>:5173`.
2. Player A: JOUER → CRÉER → share the code (⤴ share/copy). Player B: JOUER → REJOINDRE → code.
3. Both choose a vehicle/colour, READY; host taps LANCER.
4. Automated: `node e2e/multiplayer-ui.mjs` (two browsers), `npm test -w realtime` (protocol-level race with a cheater).

## Redis (later)

The realtime server keeps lobbies in memory (single instance). For horizontal scaling: lobby directory + presence in Redis, Pub/Sub for cross-node lobby events, sticky routing per lobby code. Not needed for the MVP.
