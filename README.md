# Race Rush

Jeu de course **arcade 3D** jouable dans le navigateur — **mobile d'abord** (paysage), desktop ensuite — avec course solo contre bots, **multijoueur 2–5 joueurs** par code de partie, garage 3D, progression et monnaie virtuelle **v-MRU** calculées **exclusivement côté serveur**.

> Author: Ing. Mohamed Lemine Khlil

## Stack

| Couche | Technologies |
|---|---|
| Client / jeu | TypeScript, React 18, Tailwind 4, Vite 8, **Babylon.js 9** (WebGL2), **Havok** (props physiques), Web Audio API (synthèse), Pointer Events, Gamepad API, Vibration API, PWA |
| Domaine partagé | `shared/` — TypeScript pur : géométrie de circuit, simulation de véhicule arcade, règles de tours/checkpoints, bots, protocole réseau, anti-triche |
| Temps réel | Node 22 + `ws` (`realtime/`) — lobbies, salles de course, validation serveur |
| API / autorité | **Laravel 13**, PHP 8.3, Sanctum, **MySQL/MariaDB** (`backend/`) |

## Démarrage rapide (dev)

Prérequis : Node ≥ 22, PHP ≥ 8.3 + Composer, MySQL/MariaDB.

```bash
npm install                      # client + realtime + shared (workspaces)

# Base de données
mysql -uroot -e "CREATE DATABASE race_rush; CREATE USER 'race_rush'@'localhost' IDENTIFIED BY '<mdp>'; GRANT ALL ON race_rush.* TO 'race_rush'@'localhost';"
cd backend && composer install && cp .env.example .env && php artisan key:generate
#   → renseigner DB_PASSWORD et RACERUSH_REALTIME_SECRET (php -r 'echo bin2hex(random_bytes(32));')
php artisan migrate --seed && php artisan serve --port=8000     # API  :8000
cd ../realtime && npm start                                     # WS   :8090 (lit le secret dans backend/.env)
cd ../client && npm run dev                                     # Jeu  :5173 (proxy /api et /ws)
```

Ouvrir `http://<ip-de-la-machine>:5173` depuis un téléphone sur le même réseau Wi-Fi.

**Sans backend**, le jeu reste jouable : course d'entraînement hors ligne contre 4 bots (sans récompense).

### Mode développement

`/?dev=1&track=city&vehicle=sport&bots=4&laps=3&fps=1&quality=eco&autopilot=1&touch=1` lance directement une course locale (choix circuit/véhicule, compteur FPS, contrôles tactiles forcés, pilote automatique). `R` = se replacer.

## Commandes

| Action | Commande |
|---|---|
| Tests domaine (sim 3 tours × 4 véhicules × 2 circuits, tours, anti-triche) | `npm test -w shared` |
| Tests temps réel (lobby + vraie course réseau + tricheur) | `npm test -w realtime` |
| Tests API (récompenses, double récompense, ledger, HMAC, auth) | `cd backend && php artisan test` |
| Typecheck | `npm run typecheck` |
| Build production | `npm run build` → `client/dist` |
| E2E boucle MVP complète (UI, mobile émulé) | `node e2e/mvp-loop.mjs` |
| E2E multijoueur (2 navigateurs) | `node e2e/multiplayer-ui.mjs` |
| E2E Havok / responsive / clavier | `node e2e/havok-check.mjs`, `node e2e/ui-shots.mjs`, `node e2e/drive.mjs` |

Les scripts E2E utilisent Chromium (Playwright) et le hook `?autopilot=1`, actif uniquement en dev ou avec `VITE_TEST_HOOKS=1`.

## Commandes de jeu

| Mobile (paysage) | Clavier | Manette |
|---|---|---|
| ◀ ▶ direction · BOOST · FREIN/DRIFT · accélération auto (désactivable) | ↑/W accélérer · ←→/A D tourner · ↓/S frein-drift · Espace/Shift boost · R replacer · Échap pause | Stick G, RT/LT, A boost, B drift, Y replacer |

Frein + direction à vitesse = **drift** (recharge le boost, mini-turbo à la sortie). Sauts sur rampes et vol plané rechargent aussi le boost.

## Documentation

- [docs/architecture.md](docs/architecture.md) — couches, modules, flux
- [docs/gameplay.md](docs/gameplay.md) — conduite arcade, caméra, boost, drift, véhicules
- [docs/multiplayer.md](docs/multiplayer.md) — protocole, autorité, anti-triche
- [docs/database.md](docs/database.md) — schéma, ledger v-MRU, idempotence
- [docs/deployment.md](docs/deployment.md) — mise en production
- [deploy/hostinger/DEPLOY_HOSTINGER.md](deploy/hostinger/DEPLOY_HOSTINGER.md) — paquet Hostinger (public_html + API Laravel), généré par `scripts/build-hostinger.sh`
- [deploy/realtime/README.md](deploy/realtime/README.md) — serveur temps réel sur VPS (multijoueur, récompenses, voice chat)
- [docs/performance.md](docs/performance.md) — budgets, profils, mesures
- [docs/adr/](docs/adr) — décisions d'architecture

v-MRU est une **monnaie virtuelle de jeu** : aucune conversion monétaire, aucun retrait, aucun achat réel.
