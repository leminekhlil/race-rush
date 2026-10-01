import { RealtimeServer } from './Server';
import { config } from './config';
import { log } from './logger';

const server = new RealtimeServer();
await server.listen();
log('info', 'realtime.started', { port: config.port, api: config.apiUrl, anonymous: config.allowAnonymous, secret: config.secret ? 'set' : 'missing' });

const shutdown = () => {
  log('info', 'realtime.stopping');
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
