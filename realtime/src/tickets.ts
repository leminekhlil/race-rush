import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

export interface TicketPayload {
  uid: number;
  pid: number;
  name: string;
  lvl: number;
  veh: Record<string, { c: string; u: number[] }>;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Verifies a Laravel-issued ticket: base64url(json).base64url(hmac_sha256(secret, "ticket." + body)). */
export const verifyTicket = (ticket: string, secret = config.secret): TicketPayload | null => {
  if (!secret || typeof ticket !== 'string' || ticket.length > 4096) return null;
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(`ticket.${body}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as TicketPayload;
    if (typeof payload.uid !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
};
