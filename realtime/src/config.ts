import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dev convenience: read the shared secret from backend/.env when not provided via the environment. */
const readBackendEnv = (key: string): string | undefined => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const env = readFileSync(resolve(here, '../../backend/.env'), 'utf8');
    const line = env.split('\n').find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim().replace(/^"|"$/g, '') || undefined;
  } catch {
    return undefined;
  }
};

export const config = {
  port: Number(process.env.PORT ?? 8090),
  host: process.env.HOST ?? '0.0.0.0',
  apiUrl: (process.env.API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  secret: process.env.RACERUSH_REALTIME_SECRET ?? readBackendEnv('RACERUSH_REALTIME_SECRET') ?? '',
  /** Allows ticket-less connections (no rewards). Useful for local dev without the API. */
  allowAnonymous: (process.env.ALLOW_ANONYMOUS ?? 'true') === 'true',
  tickHz: 20,
  simSubsteps: 3,
};

if (!config.secret) {
  console.warn('[realtime] RACERUSH_REALTIME_SECRET missing: tickets cannot be verified, API settlement disabled.');
}
