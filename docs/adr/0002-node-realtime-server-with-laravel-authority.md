# ADR 0002 — Node WebSocket race server + Laravel as economic authority

**Status:** accepted

**Context.** The mission asks for Laravel + WebSocket. A race room needs a 20 Hz tick, in-memory state and the same lap/physics code as the client. PHP request/response workers are a poor fit for a game loop; Laravel Reverb (Pusher protocol) is built for broadcasting, not simulation.

**Decision.** `realtime/` is a small Node + `ws` server reusing `shared/` (track, LapTracker, bots, anti-cheat). Laravel remains the single authority for accounts, XP, v-MRU, ownership, upgrades, results and rewards. The two communicate through HMAC-signed tickets (Laravel → client → realtime) and HMAC-signed internal calls (realtime → Laravel), with a shared secret.

**Consequences.** + One source of truth for race rules, cheap ticks, rewards never computed client-side, realtime can be restarted without data loss. − Two server runtimes to deploy; lobbies are in memory (single instance) until Redis is introduced for presence/Pub/Sub.
