import { RealtimeServer } from './Server';
import { config } from './config';
import { log } from './logger';

const server = new RealtimeServer();
// LiteSpeed requires its entry synchronously; avoid an ESM top-level await.
server.listen()
  .then(() => log('info', 'realtime.started', {
    port: config.port, api: config.apiUrl, anonymous: config.allowAnonymous,
    secret: config.secret ? 'set' : 'missing',
  }))
  .catch(() => {
    console.error('Realtime startup failed');
    process.exit(1);
  });

const shutdown = () => {
  log('info', 'realtime.stopping');
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
