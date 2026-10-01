# Deployment

Three processes behind one HTTPS origin (recommended, avoids CORS and mixed content):

```
https://race.example.com/        → client/dist (static, long cache on /assets/*)
https://race.example.com/api/*   → Laravel (php-fpm)
wss://race.example.com/ws        → realtime server (Node, port 8090, WebSocket upgrade)
```

## Steps

1. `npm ci && npm run build` → upload `client/dist` (contains `sw.js`, manifest, icons). Serve `index.html` and `sw.js` with `Cache-Control: no-cache`; `/assets/*` immutable.
2. Backend: `composer install --no-dev -o`, `.env` from `.env.example` (`APP_ENV=production`, `APP_DEBUG=false`, DB credentials, `RACERUSH_REALTIME_SECRET` = 64 random hex chars), `php artisan key:generate`, `php artisan migrate --force --seed`, `php artisan config:cache route:cache`.
3. Realtime: `RACERUSH_REALTIME_SECRET=… API_URL=http://127.0.0.1:8000 ALLOW_ANONYMOUS=false PORT=8090 node --import tsx realtime/src/main.ts` under systemd/pm2 (single instance for the MVP).
4. Reverse proxy (nginx): `location /ws { proxy_pass http://127.0.0.1:8090; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 120s; }`.
5. HTTPS is required for PWA install, service worker, `navigator.share`, and vibration on most mobile browsers.

## Configuration

| Variable | Where | Notes |
|---|---|---|
| `RACERUSH_REALTIME_SECRET` | backend `.env` + realtime env | Same value on both. Signs tickets and internal calls. Never commit. |
| `RACERUSH_TICKET_TTL` | backend | Ticket lifetime (s), default 900 |
| `API_URL`, `PORT`, `ALLOW_ANONYMOUS` | realtime | Disable anonymous play in production |
| `VITE_API_URL`, `VITE_WS_URL` | client build | Only if API/WS are on other origins |
| `VITE_TEST_HOOKS=1` | client build | Enables `?autopilot=1` for E2E only — never in production |

## Local network test (phone)

`npm run dev -w client` binds `0.0.0.0:5173` and proxies `/api` + `/ws`. Open `http://<lan-ip>:5173` on the phone. Note: without HTTPS, the PWA install prompt and service worker are unavailable on the phone (the game itself works).
