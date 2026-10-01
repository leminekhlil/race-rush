# Database (MySQL / MariaDB)

Migrations: `backend/database/migrations`. Reference data seeded from `config/racerush.php` (`CatalogSeeder`, idempotent).

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Accounts (guest or email/password) | `email` unique nullable |
| `player_profiles` | Display name, level, XP, cached v-MRU balance, selected vehicle, stats | `user_id` unique |
| `vehicles` | Catalog (sport, moto, buggy, monster) | `code` unique |
| `player_vehicles` | Ownership + paint per vehicle | unique (`player_id`, `vehicle_id`) |
| `vehicle_upgrades` | Level per stat (engine/handling/boost) | unique (`player_vehicle_id`, `stat`) |
| `cosmetics` | Paints (free/premium) + prepared stickers/patterns/wheels/boost FX (`available=false`) | `code` unique |
| `player_cosmetics` | Unlocked cosmetics | unique (`player_id`, `cosmetic_id`) |
| `lobbies`, `lobby_players` | Lobby history (code, host, status, players) | unique (`lobby_id`, `player_id`) |
| `races` | Race (uuid from realtime), track, laps, status | `uuid` unique |
| `race_players` | Grid (human or bot) | unique (`race_id`, `grid_slot`), unique (`race_id`, `player_id`) |
| `race_results` | Position, time, best lap, flagged, XP/v-MRU awarded | unique (`race_player_id`), **unique (`race_id`, `player_id`)** |
| `player_progression` | XP history (delta, level before/after) | unique (`player_id`, `race_id`, `reason`) |
| `wallet_transactions` | **v-MRU ledger** (credit/debit, amount, balance_after, source, reference, meta) | **unique (`player_id`, `source`, `reference`)** |
| `race_anomalies` | Anti-cheat log | — |

## v-MRU ledger

- Every balance change = one `wallet_transactions` row written **in the same DB transaction** as the cached `player_profiles.vmru_balance` update, with the profile row locked (`SELECT … FOR UPDATE`).
- `(player, source, reference)` is unique: `starter_bonus/welcome`, `race_reward/<race uuid>`, `cosmetic/<code>`, `upgrade:<Idempotency-Key>` → a business event can never be booked twice (retries are safe).
- Integrity: `WalletService::ledgerBalance()` recomputes credits − debits; tests assert it equals the cached balance.

## Rewards

Computed only in `RaceService::finish` (server): finish/DNF base + position table, +10 % per human opponent beaten, 0 when flagged. Levels from a server-side curve (`200 + (level−1)×120` XP per level). Values in `config/racerush.php`.
