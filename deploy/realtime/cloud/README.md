# Portable realtime service

Keep Babylon/WebGL in the browser and Laravel/MySQL on Hostinger. The Node service uses native HTTP plus ws (not Socket.IO); it talks to Laravel through signed HTTPS POSTs, never to MySQL. No database firewall or remote-MySQL change is needed.

Build from repository root: npm ci --include=dev, then npm run build:realtime. Start: npm run start:realtime. Node 22; bind HOST=0.0.0.0 and the platform-provided PORT. Set production environment variables from .env.example in the cloud dashboard, with the existing shared secret only in its private variable store. Never upload the actual .env or secret to GitHub.

Render configuration: Web Service, Free compute, Frankfurt region, repository leminekhlil/race-rush, branch migration/render-realtime. Build command: npm ci --include=dev && npm run build:realtime. Start command: npm run start:realtime. Health check: /health. Keep a single instance: lobbies/races live in memory and are not coordinated between multiple instances. Production startup rejects missing authentication secret, anonymous mode, non-HTTPS API and missing browser origin allowlist.

The frontend origin is https://racerush.pro.mr. Health permits that exact origin for player-initiated wake-up, and monitors without Origin. WebSocket requests reject other browser origins; Laravel-issued tickets still authenticate every player, including non-browser clients. HTTP has no other Node API endpoints. WebRTC voice media flows peer-to-peer; Node only relays lobby-scoped voice signals. TURN is optional and not newly provisioned here.

Migration: test /health, authentication, lobby create/join, reconnect and rejoin a waiting lobby, voice signalling, race snapshots and signed Laravel persistence/rewards before changing URLs. Cross-check the deployed branch and successful health checks in Render. Update Hostinger public/config.js and its legacy duplicate: realtimeUrl becomes the new wss://.../ws and realtimeWarmup=true. Update only RACERUSH_REALTIME_URL in Laravel .env; preserve its shared secret and database configuration. Reload only Laravel configuration caches if they existed. The PHP frontend shell already versions config.js by file modification time. No existing CSP was present in the public response; any future connect-src must allow the new HTTPS/WSS host.

Render Free sleeps after 15 idle minutes and may take roughly a minute to restart. Actual inbound WebSocket messages keep active services awake. The frontend now waits for /health only when starting an online session, up to 120 seconds; it is not a scheduled keep-alive. Both evaluated free plans have 512MB RAM and 0.1 CPU. Render provides 750 free service hours/workspace/month, shared across free services. Check bandwidth/build quotas in the account dashboard before public traffic growth. These limits do not provide a production availability guarantee.

Transient state: reconnect authenticates a new connection; players can rejoin a waiting lobby by code while it still exists. Running races cannot resume after a server restart, and the current server removes disconnected racers. This migration does not claim durable race recovery. Redeploy outside active races when possible. Graceful shutdown stops sockets and room timers and lets pending Laravel requests finish, with a 20-second maximum shutdown window.

Rollback: preserve backups of config.js and Laravel .env. Restore the original wss://mistyrose-butterfly-256661.hostingersite.com/ws in both runtime config copies and RACERUSH_REALTIME_URL, remove realtimeWarmup or set false, clear/rebuild Laravel configuration cache only if needed, then reload the frontend. Existing cloud and Hostinger lobbies are separate, so drain old rooms before any URL change. Keep the Hostinger Node app intact and running until the user explicitly authorizes disabling it after validation. New Render deployments are automatic on the configured branch; a deployment can interrupt active rooms.

Sources (checked 2026-10-04):
- https://render.com/docs/free
- https://render.com/docs/websocket
- https://render.com/docs/compute-plans
- https://www.koyeb.com/docs/reference/instances
- https://www.koyeb.com/docs/run-and-scale/scale-to-zero
- https://www.koyeb.com/docs/faqs/pricing
