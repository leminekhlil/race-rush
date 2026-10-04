import { RealtimeServer } from './Server';
import { config } from './config';
import { log } from './logger';

if (!config.secret) throw new Error('RACERUSH_REALTIME_SECRET is required');
if (!config.apiUrl.startsWith('https://')) throw new Error('API_URL must use HTTPS');
if (config.allowAnonymous) throw new Error('ALLOW_ANONYMOUS must be false');
if (!config.allowedOrigins.length) throw new Error('ALLOWED_ORIGINS is required');
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid PORT');

const server = new RealtimeServer();
server.listen().then(() => log('info', 'realtime.started', {
  port: config.port, api: config.apiUrl, anonymous: false, secret: 'set',
})).catch(() => { console.error('Realtime startup failed'); process.exit(1); });

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  log('info', 'realtime.stopping');
  server.close();
  // Let outstanding Laravel requests and socket close handshakes finish naturally.
  setTimeout(() => process.exit(0), 20000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
