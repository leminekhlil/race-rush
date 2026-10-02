# Race Rush realtime on Hostinger managed Node

On 2026-10-02, incoming WSS and the actual authenticated Race Rush server were verified on the user's existing Business Web Hosting managed Node app. The PHP SSH environment's lack of Node does not prevent running a separate managed Node app on that plan. Leave Laravel and the frontend on their existing PHP site; no database or domain migration is required.

## Build and deploy

1. At the repository root, install dependencies with `npm ci`, then run `node scripts/build-hostinger-realtime.mjs`.
2. ZIP the **contents** of `dist-hostinger-realtime`: `server.js`, `realtime.cjs`, `package.json`. Never include `.env`, keys, local tests or `node_modules`.
3. In the managed Node app, upload that ZIP. Use Express preset, Node 20.x, npm, root `./`, entry `server.js`; no build command is needed. Hostinger installs `ws` from package.json.
4. Generate a strong shared technical secret. Store the same `RACERUSH_REALTIME_SECRET` only in Laravel's private `.env` and the managed app's environment variables. The launcher requires it and forces `ALLOW_ANONYMOUS=false`. Never put it in the client, ZIP, Git or documentation.
5. The launcher defaults `API_URL` to `https://racerush.pro.mr`; adapt it before building if deploying another environment. It listens on all interfaces and requires the CommonJS bundle synchronously. Hostinger's launcher cannot require an ESM graph containing top-level await.
6. Save and redeploy. Verify `GET /health` returns `{"ok":true,...}` and incoming `/ws` connections accept Laravel-issued tickets. **Keep `ws` external** in the bundle: bundling it broke the managed launcher's WebSocket integration while HTTP health remained healthy.
7. Configure Laravel `RACERUSH_REALTIME_URL=wss://<managed-app-host>/ws`. If Laravel configuration is cached, refresh that cache. Change the frontend's public `config.js` `realtimeUrl` to that WSS URL. The PHP entry versions this script with its modification time to avoid Hostinger's one-year static cache.

## Validation performed

- Managed app: `mistyrose-butterfly-256661.hostingersite.com`.
- Laravel-issued tickets accepted for two distinct test guests, both marked authenticated.
- Create/join one lobby, both ready, load grid, countdown, snapshots with both players: passed over public WSS.
- In the live frontend: create a lobby, second test player joins, both ready, launch a rendered race with both humans and three bots: passed.
- HTTP `/api/health`, `/api/catalog`, guest creation and ticket issuance remain functional.
- Full race completion, reward settlement and cross-network microphone audio were not validated by these smoke checks.

## Operation and rollback

Keep exactly one runtime instance: lobbies are in memory, so restarting/redeploying interrupts current races. This is a functional smoke test, not a capacity or long-duration guarantee. Monitor Hostinger runtime logs and resource limits. For rollback, set public `config.js` `realtimeUrl` to `''`; its automatic version changes on the next page load. Preserve the private backend backup outside the document root. No database reset or new APP_KEY is required.
