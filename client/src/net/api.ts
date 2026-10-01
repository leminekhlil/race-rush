import type { Catalog, Profile } from '../state/appStore';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? './api';
const TOKEN_KEY = 'raceRush.token.v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

export const hasToken = () => !!token;

const setToken = (t: string | null) => {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token kept in memory for this session */
  }
};

const MESSAGES: Record<string, string> = {
  insufficient_funds: 'Solde v-MRU insuffisant.',
  paint_locked: 'Peinture non débloquée.',
  already_owned: 'Déjà possédé.',
  max_level: 'Niveau maximum atteint.',
  not_available: 'Bientôt disponible.',
};

const request = async <T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(0, 'network', 'Serveur injoignable.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    if (res.status === 401) setToken(null);
    const code = d.error ?? (res.status === 422 ? 'validation' : res.status === 429 ? 'rate_limited' : 'http_error');
    throw new ApiError(res.status, code, MESSAGES[code] ?? d.message ?? `Erreur ${res.status}`);
  }
  return data as T;
};

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health'),
  catalog: () => request<Catalog>('GET', '/catalog'),
  async guest(name: string): Promise<Profile> {
    const r = await request<{ token: string; profile: Profile }>('POST', '/auth/guest', { name });
    setToken(r.token);
    return r.profile;
  },
  me: () => request<{ profile: Profile }>('GET', '/me').then((r) => r.profile),
  rename: (name: string) => request<{ profile: Profile }>('PATCH', '/me', { name }).then((r) => r.profile),
  select: (vehicle: string) => request<{ profile: Profile }>('POST', '/garage/select', { vehicle }).then((r) => r.profile),
  paint: (vehicle: string, color: string) => request<{ profile: Profile }>('POST', '/garage/paint', { vehicle, color }).then((r) => r.profile),
  purchase: (code: string) => request<{ profile: Profile }>('POST', `/garage/cosmetics/${encodeURIComponent(code)}/purchase`).then((r) => r.profile),
  upgrade: (vehicle: string, stat: string) =>
    request<{ profile: Profile }>('POST', '/garage/upgrade', { vehicle, stat }, { 'Idempotency-Key': crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }).then(
      (r) => r.profile,
    ),
  ticket: () => request<{ ticket: string; expires_at: number; url: string }>('POST', '/realtime/ticket'),
  logout: () => setToken(null),
};
