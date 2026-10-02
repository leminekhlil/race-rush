# Race Rush — realtime server (optional, VPS)

The Race Rush **PHP/HWS deployment** does not run this persistent Node.js WebSocket server. Multiplayer lobbies, server-validated
rewards (XP / v-MRU) and voice-chat signalling need this server. Until it is deployed, the site works in solo mode
(offline races against bots, no rewards) and disables multiplayer / voice.

Hostinger now offers separate managed Node.js apps on Business and Cloud plans; lack of Node in the PHP SSH
environment does not mean every Hostinger product lacks Node support. However, Node support alone is not enough:
this server needs incoming HTTPS/WebSocket connections and a persistent process. Verify those capabilities for
the exact product before configuring `realtimeUrl`. Hostinger's Web/Cloud connectivity documentation currently
describes outgoing-only WebSockets. A VPS or a managed service explicitly supporting incoming WebSockets is
the deployment option supported by this guide. Keep Laravel and the frontend on Hostinger.

References (checked 2026-10-02):
- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://www.hostinger.com/support/which-web-standards-and-connectivity-features-are-supported-at-hostinger/

## Requirements
- Small VPS (1 vCPU / 1 GB is enough for a few lobbies), Node.js 20+, a sub-domain such as `rt.racerush.pro.mr`
  pointing to it, TLS (browsers on HTTPS only accept `wss://`).

## Install
`server.mjs` is a single self-contained bundle (no `npm install` needed).
```bash
mkdir -p ~/racerush-realtime && cd ~/racerush-realtime
# copy server.mjs + env.example here
cp env.example .env && nano .env          # fill RACERUSH_REALTIME_SECRET (same as racerush-app/.env)
set -a && . ./.env && set +a && node server.mjs   # test, then run it with systemd or pm2
```
TLS reverse proxy (Caddy example, `/etc/caddy/Caddyfile`):
```
rt.racerush.pro.mr {
  reverse_proxy 127.0.0.1:8090
}
```
Health check: `https://rt.racerush.pro.mr/health`.

## Connect the site
1. `public_html/config.js` → `realtimeUrl: 'wss://rt.racerush.pro.mr/ws'`
2. `racerush-app/.env` → `RACERUSH_REALTIME_SECRET=<same secret>`
3. Reload the site: "Créer / Rejoindre une partie", rewards and the voice chat become available.

## Voice chat
Peer-to-peer WebRTC mesh (2–5 players), this server only relays signalling inside a lobby. Most networks connect
with STUN only; strict corporate / mobile carrier NATs need a TURN server (coturn). Configure `VOICE_TURN_URLS` and
`VOICE_TURN_SECRET` (coturn `static-auth-secret`): short-lived credentials are generated per player.
