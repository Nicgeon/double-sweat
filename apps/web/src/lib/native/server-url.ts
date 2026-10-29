import { t } from '#lib/i18n/index.svelte.ts';
import { ALLOW_HTTP, CLIENT_API } from './flag.ts';

export type ServerErrorCode =
  | 'invalid_url'
  | 'insecure'
  | 'unreachable'
  | 'not_double_sweat'
  | 'client_too_old'
  | 'server_too_old';

export class ServerError extends Error {
  constructor(
    readonly code: ServerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Macht aus einer Eingabe die Ursprungsadresse des Servers ("https://host[:port]").
 * Nur HTTPS (http nur im Entwicklungsbuild), keine Zugangsdaten, kein Pfad. So kann eine Einladung oder ein
 * Tippfehler die Zugangsdaten nicht an eine unverschlüsselte oder getarnte Adresse schicken.
 */
export function normalizeServerUrl(input: string, allowHttp = ALLOW_HTTP): string {
  let value = input.trim();
  if (!value) throw new ServerError('invalid_url', t('serverUrl.empty'));
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServerError('invalid_url', t('serverUrl.invalid'));
  }
  if (url.protocol === 'http:' && !allowHttp) {
    throw new ServerError('insecure', t('serverUrl.insecure'));
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ServerError('invalid_url', t('serverUrl.invalid'));
  }
  if (url.username || url.password) {
    throw new ServerError('invalid_url', t('serverUrl.credentials'));
  }
  if (!url.hostname) throw new ServerError('invalid_url', t('serverUrl.invalid'));
  return url.origin;
}

export interface ServerInfo {
  version: string;
  apiVersion: number;
  minClientApi: number;
  signup: { mode: string; requiresSetupToken: boolean };
  features: { mail: boolean };
}

/**
 * Prüft, ob unter der Adresse ein Double-Sweat-Server antwortet und ob App und Server zusammenpassen.
 * Erst danach werden Zugangsdaten gesendet.
 */
export async function probeServer(origin: string, timeoutMs = 10_000): Promise<ServerInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: unknown;
  try {
    let res: Response;
    try {
      res = await fetch(`${origin}/api/v1/health`, {
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new ServerError('unreachable', t('serverUrl.unreachable'));
    }
    // Antwort ohne JSON (z. B. eine fremde Webseite): erreichbar, aber kein Double-Sweat-Server
    body = res.ok ? await res.json().catch(() => null) : null;
  } finally {
    clearTimeout(timer);
  }
  const h = body as Partial<ServerInfo> & { app?: string };
  if (
    h?.app !== 'double-sweat' ||
    typeof h.apiVersion !== 'number' ||
    typeof h.minClientApi !== 'number'
  ) {
    throw new ServerError('not_double_sweat', t('serverUrl.notDoubleSweat'));
  }
  if (h.minClientApi > CLIENT_API) {
    throw new ServerError('client_too_old', t('serverUrl.clientTooOld'));
  }
  if (h.apiVersion < CLIENT_API) {
    throw new ServerError('server_too_old', t('serverUrl.serverTooOld'));
  }
  return {
    version: String(h.version ?? ''),
    apiVersion: h.apiVersion,
    minClientApi: h.minClientApi,
    signup: h.signup ?? { mode: 'closed', requiresSetupToken: false },
    features: h.features ?? { mail: false },
  };
}
