import { createHash, createHmac } from 'node:crypto';
import { config } from './config';
import { log } from './logger';

/** Signed server-to-server call to the Laravel API (see VerifyInternalSignature). */
export const internalCall = async <T>(method: 'POST', path: string, body: unknown, attempts = 3): Promise<T> => {
  const json = JSON.stringify(body);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ts = Math.floor(Date.now() / 1000);
    const base = `${ts}.${method}.${path}.${createHash('sha256').update(json).digest('hex')}`;
    const sig = createHmac('sha256', config.secret).update(base).digest('hex');
    try {
      const res = await fetch(`${config.apiUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-RR-Timestamp': String(ts), 'X-RR-Signature': sig },
        body: json,
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      if (!res.ok) {
        // 4xx are definitive (validation / business rule): do not retry.
        if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(`API ${res.status}: ${text.slice(0, 300)}`), { final: true });
        throw new Error(`API ${res.status}`);
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      if ((err as { final?: boolean }).final) break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  log('error', 'api.call_failed', { path, error: String(lastErr) });
  throw lastErr;
};
