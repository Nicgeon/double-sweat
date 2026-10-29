import createClient from 'openapi-fetch';
import { clearTokens, currentAuth, currentServer, setTokens } from '#lib/native/auth-store.ts';
import { NATIVE } from '#lib/native/flag.ts';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type User = Schemas['User'];
export type Team = Schemas['Team'];
export type PartnerColor = Schemas['PartnerColor'];
export type Checkin = Schemas['Checkin'];
export type Dashboard = paths['/api/v1/dashboard']['get']['responses']['200']['content']['application/json'];
export type DashboardMember = Dashboard['members'][number];
export type History = paths['/api/v1/history']['get']['responses']['200']['content']['application/json'];
export type Health = paths['/api/v1/health']['get']['responses']['200']['content']['application/json'];

/** Fehler der API ({ error: { code, message } }) oder des Netzes (code "network"). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

/** Wird bei 401 einer angemeldeten Sitzung aufgerufen (Sitzung abgelaufen). */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

/** Zusätzlich benötigt in der App: aktuelle Zugangsdaten erneuern (Rotation, ein Aufruf gleichzeitig). */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refresh, refreshExpiresAt } = currentAuth();
  const server = currentServer();
  if (!refresh || !server || refreshExpiresAt < Date.now()) {
    await clearTokens();
    return false;
  }
  let res: Response;
  try {
    res = await fetch(`${server}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      credentials: 'omit',
    });
  } catch {
    // Netzfehler: Tokens behalten, später erneut versuchen
    throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
  }
  if (!res.ok) {
    // Abgelaufen, widerrufen oder wiederverwendet: neu anmelden
    if (res.status === 401 || res.status === 403) await clearTokens();
    return false;
  }
  const body = (await res.json()) as { tokens?: { accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresAt: number } };
  if (!body.tokens) return false;
  await setTokens(body.tokens);
  return true;
}

const refreshOnce = () => (refreshing ??= refreshTokens().finally(() => (refreshing = null)));

/**
 * Sendet eine Anfrage an die API. Web: gleicher Ursprung mit Cookie. App: an die gespeicherte Serveradresse,
 * mit Bearer-Token und einmaligem Erneuern bei Ablauf (der Body wird dafür einmal gepuffert).
 */
export async function send(request: Request): Promise<Response> {
  if (!NATIVE) return fetch(request);
  const server = currentServer();
  if (!server) throw new ApiError(0, 'no_server', 'Es ist noch kein Server eingerichtet.');
  const url = new URL(request.url);
  const target = `${server}${url.pathname}${url.search}`;
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.clone().arrayBuffer();
  const attempt = () => {
    const headers = new Headers(request.headers);
    const { access } = currentAuth();
    if (access) headers.set('Authorization', `Bearer ${access}`);
    return fetch(target, { method: request.method, headers, body, credentials: 'omit' });
  };
  // Access-Token läuft bald ab (oder fehlt, obwohl ein Refresh-Token da ist): vorher erneuern
  const auth = currentAuth();
  if (auth.refresh && (!auth.access || auth.accessExpiresAt - Date.now() < 30_000)) await refreshOnce();
  let res: Response;
  try {
    res = await attempt();
  } catch {
    throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
  }
  if (res.status === 401 && currentAuth().refresh && (await refreshOnce())) {
    try {
      res = await attempt();
    } catch {
      throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
    }
  }
  return res;
}

const client = createClient<paths>({
  baseUrl: '',
  credentials: 'same-origin',
  fetch: async (request) => {
    try {
      return await send(request);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
    }
  },
});

client.use({
  onRequest({ request }) {
    if (!NATIVE && csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      request.headers.set('X-CSRF-Token', csrfToken);
    }
    return request;
  },
});

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Gibt die Daten zurück oder wirft einen ApiError mit der Meldung des Servers. */
export function unwrap<T>({ data, error, response }: Result<T>): T {
  if (response.ok) return data as T;
  const body = error as { error?: { code?: string; message?: string } } | undefined;
  const retry = Number(response.headers.get('Retry-After'));
  if (response.status === 401 && body?.error?.code === 'unauthorized') onUnauthorized();
  throw new ApiError(
    response.status,
    body?.error?.code ?? 'error',
    body?.error?.message ?? 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

export const api = client;

/** Foto-Upload (multipart): openapi-fetch serialisiert FormData nicht, daher direkt über fetch. */
export async function uploadCheckin(photo: Blob, tag: string | null, note: string): Promise<Checkin> {
  const form = new FormData();
  form.set('photo', photo, 'checkin.jpg');
  if (tag) form.set('tag', tag);
  if (note.trim()) form.set('note', note.trim());
  const headers: Record<string, string> = !NATIVE && csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  let response: Response;
  try {
    response = await send(
      new Request('/api/v1/checkins', { method: 'POST', body: form, credentials: 'same-origin', headers }),
    );
  } catch {
    throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
  }
  const json = (await response.json().catch(() => null)) as {
    checkin?: Checkin;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok || !json?.checkin) {
    throw new ApiError(
      response.status,
      json?.error?.code ?? 'error',
      json?.error?.message ?? 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
    );
  }
  return json.checkin;
}
