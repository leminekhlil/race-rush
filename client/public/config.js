/*
 * Race Rush runtime configuration — editable after deployment, no rebuild needed.
 *
 * realtimeUrl: WebSocket URL of the realtime server (multiplayer, server-validated rewards, voice chat signalling).
 *   'auto' → same origin, path /ws (local dev / reverse proxy)
 *   ''     → no realtime server: solo races run offline (no rewards), multiplayer and voice chat are disabled
 *   'wss://rt.example.com/ws' → dedicated server (e.g. a small VPS)
 */
window.RACE_RUSH_CONFIG = {
  realtimeUrl: 'auto',
};
