import createClient from 'openapi-fetch';
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

const client = createClient<paths>({
  baseUrl: '',
  credentials: 'same-origin',
  fetch: async (request) => {
    try {
      return await fetch(request);
    } catch {
      throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
    }
  },
});

client.use({
  onRequest({ request }) {
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
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
  let response: Response;
  try {
    response = await fetch('/api/v1/checkins', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
    });
  } catch {
    throw new ApiError(0, 'network', 'Der Server ist gerade nicht erreichbar.');
  }
  const json = (await response.json().catch(() => null)) as
    | { checkin?: Checkin; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok || !json?.checkin) {
    throw new ApiError(
      response.status,
      json?.error?.code ?? 'error',
      json?.error?.message ?? 'Das hat nicht geklappt. Versuch es gleich noch einmal.',
    );
  }
  return json.checkin;
}
