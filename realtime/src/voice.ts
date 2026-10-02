import { createHmac } from 'node:crypto';
import { VOICE_MAX_CANDIDATE, VOICE_MAX_SDP, type IceServerDTO, type VoiceSignal } from '@race-rush/shared';
import { config } from './config';

/**
 * ICE servers for one client. TURN uses short-lived credentials (coturn REST API / `use-auth-secret`):
 * username = "<expiry>:<clientId>", credential = base64(HMAC-SHA1(secret, username)). The static secret never
 * leaves the server, so nothing permanent ships in the public frontend.
 */
export const iceServersFor = (clientId: string, now = Date.now()): { iceServers: IceServerDTO[]; ttl: number } => {
  const servers: IceServerDTO[] = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length && config.turnSecret) {
    const username = `${Math.floor(now / 1000) + config.turnTtl}:${clientId}`;
    const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
    servers.push({ urls: config.turnUrls, username, credential });
  }
  return { iceServers: servers, ttl: config.turnTtl };
};

/** Shape / size validation of a relayed signalling payload. Returns a sanitised copy or null. */
export const sanitizeSignal = (raw: unknown): VoiceSignal | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  switch (s.kind) {
    case 'offer':
    case 'answer':
      if (typeof s.sdp !== 'string' || !s.sdp.startsWith('v=0') || s.sdp.length > VOICE_MAX_SDP) return null;
      return { kind: s.kind, sdp: s.sdp };
    case 'ice': {
      if (typeof s.candidate !== 'string' || s.candidate.length > VOICE_MAX_CANDIDATE) return null;
      const sdpMid = typeof s.sdpMid === 'string' && s.sdpMid.length <= 32 ? s.sdpMid : null;
      const sdpMLineIndex = Number.isInteger(s.sdpMLineIndex) && (s.sdpMLineIndex as number) >= 0 && (s.sdpMLineIndex as number) < 8 ? (s.sdpMLineIndex as number) : null;
      return { kind: 'ice', candidate: s.candidate, sdpMid, sdpMLineIndex };
    }
    case 'restart':
      return { kind: 'restart' };
    default:
      return null;
  }
};
