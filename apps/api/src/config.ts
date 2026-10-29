import { createPrivateKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

export const SIGNUP_MODES = ['open', 'token', 'invite-only', 'closed'] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const PLACEHOLDER =
  /^(change[-_ ]?me|changeme|secret|password|setup[-_ ]?token|your[-_ ].*|example|todo|xxx+)$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const bool = z
  .string()
  .transform((value, ctx) => {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(v)) return true;
    if (['false', '0', 'no'].includes(v)) return false;
    ctx.addIssue({ code: 'custom', message: 'erwartet true oder false' });
    return z.NEVER;
  })
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_URL: z.string().default('http://localhost:3000'),
  ALLOW_INSECURE_HTTP: bool,
  DATA_DIR: z.string().default('./data'),
  WEB_DIR: z.string().optional(),
  SIGNUP_MODE: z.enum(SIGNUP_MODES).default('token'),
  SETUP_TOKEN: z.string().optional(),
  MAX_TEAMS: z.coerce.number().int().min(0).default(0),
  TRUST_PROXY: z.string().default('loopback,private'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(100).default(12),
  CORS_APP_ORIGINS: z.string().default('https://localhost'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  SMTP_REQUIRE_TLS: bool,
  WEBPUSH_ENABLED: bool,
  UNIFIEDPUSH_ENABLED: bool,
  PUSH_ALLOWED_HOSTS: z.string().default(''),
  FCM_ENABLED: bool,
  FCM_SERVICE_ACCOUNT_FILE: z.string().optional(),
  FCM_API_URL: z.string().default('https://fcm.googleapis.com'),
  VAPID_SUBJECT: z.string().optional(),
  DEV_CLOCK_OFFSET_HOURS: z.coerce.number().default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
});

/** Zugang zu Firebase Cloud Messaging (HTTP v1) aus der Service-Account-Datei. */
export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** Privater Schlüssel des Dienstkontos. Als KeyObject, damit er nirgends versehentlich ausgegeben wird. */
  privateKey: KeyObject;
  tokenUri: string;
  apiUrl: string;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicUrl: string;
  publicOrigin: string;
  secureCookies: boolean;
  dataDir: string;
  dbPath: string;
  photosDir: string;
  webDir: string | null;
  signupMode: SignupMode;
  setupToken: string | null;
  maxTeams: number;
  trustProxy: BlockList | null;
  maxUploadBytes: number;
  corsAppOrigins: string[];
  smtp: { url: string; from: string; requireTls: boolean } | null;
  push: {
    webPushEnabled: boolean;
    unifiedPushEnabled: boolean;
    /** Hosts, die auch private/lokale Adressen und http nutzen dürfen (z. B. ntfy im LAN). */
    allowedHosts: string[];
    vapidSubject: string;
    /** Firebase Cloud Messaging für Android-Geräte ohne UnifiedPush. null = abgeschaltet. */
    fcm: FcmConfig | null;
  };
  /** Nur für Entwicklung: verschiebt die Serveruhr, um Wochenwechsel zu testen. In Produktion verboten. */
  devClockOffsetMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  argon2: { memoryKib: number; timeCost: number; parallelism: number };
}

/** Entfernt leere Variablen, damit `SMTP_URL=` in der .env wie "nicht gesetzt" wirkt. */
function compact(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') out[key] = value.trim();
  }
  return out;
}

/** Liest und prüft die Service-Account-Datei von Firebase (Projekteinstellungen, Dienstkonten, neuen Schlüssel erzeugen). */
function loadFcmConfig(file: string | undefined, apiUrl: string): FcmConfig {
  if (!file) {
    throw new ConfigError(
      'FCM_SERVICE_ACCOUNT_FILE fehlt (Pfad zur JSON-Datei des Firebase-Dienstkontos, wenn FCM_ENABLED=true ist)',
    );
  }
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new ConfigError(`FCM_SERVICE_ACCOUNT_FILE: Die Datei "${file}" ist nicht lesbar`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ConfigError('FCM_SERVICE_ACCOUNT_FILE ist keine gültige JSON-Datei');
  }
  const text = (key: string) => (typeof json[key] === 'string' ? (json[key] as string) : '');
  const projectId = text('project_id');
  const clientEmail = text('client_email');
  const tokenUri = text('token_uri') || 'https://oauth2.googleapis.com/token';
  if (!projectId || !clientEmail || !text('private_key')) {
    throw new ConfigError(
      'FCM_SERVICE_ACCOUNT_FILE ist kein Firebase-Dienstkonto (project_id, client_email oder private_key fehlt)',
    );
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(text('private_key'));
  } catch {
    throw new ConfigError('FCM_SERVICE_ACCOUNT_FILE: Der private Schlüssel ist ungültig');
  }
  for (const [name, value] of [
    ['token_uri', tokenUri],
    ['FCM_API_URL', apiUrl],
  ] as const) {
    try {
      new URL(value);
    } catch {
      throw new ConfigError(`FCM: ${name} ist keine gültige URL`);
    }
  }
  return { projectId, clientEmail, privateKey, tokenUri, apiUrl: apiUrl.replace(/\/+$/, '') };
}

export function parseTrustProxy(value: string): BlockList | null {
  const list = new BlockList();
  let any = false;
  for (const raw of value.split(',')) {
    const token = raw.trim().toLowerCase();
    if (!token || token === 'none') continue;
    any = true;
    switch (token) {
      case 'loopback':
        list.addSubnet('127.0.0.0', 8, 'ipv4');
        list.addAddress('::1', 'ipv6');
        break;
      case 'private':
        list.addSubnet('10.0.0.0', 8, 'ipv4');
        list.addSubnet('172.16.0.0', 12, 'ipv4');
        list.addSubnet('192.168.0.0', 16, 'ipv4');
        list.addSubnet('fc00::', 7, 'ipv6');
        break;
      case 'linklocal':
        list.addSubnet('169.254.0.0', 16, 'ipv4');
        list.addSubnet('fe80::', 10, 'ipv6');
        break;
      default: {
        const [addr, prefix] = token.split('/');
        const family = addr ? isIP(addr) : 0;
        if (!addr || !family)
          throw new ConfigError(
            `TRUST_PROXY: "${raw.trim()}" ist keine IP, kein CIDR-Bereich und kein Schlüsselwort`,
          );
        const type = family === 6 ? 'ipv6' : 'ipv4';
        if (prefix === undefined) list.addAddress(addr, type);
        else {
          const bits = Number(prefix);
          if (!Number.isInteger(bits) || bits < 0 || bits > (family === 6 ? 128 : 32)) {
            throw new ConfigError(`TRUST_PROXY: ungültige Präfixlänge in "${raw.trim()}"`);
          }
          list.addSubnet(addr, bits, type);
        }
      }
    }
  }
  return any ? list : null;
}

/** VAPID verlangt ein mailto:- oder https:-Subjekt. Bei http://localhost greift ein Platzhalter. */
function vapidSubject(configured: string | undefined, publicUrl: URL): string {
  if (configured) {
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(configured)) {
      throw new ConfigError(
        'VAPID_SUBJECT muss mailto:name@example.org oder eine https://-URL sein',
      );
    }
    return configured;
  }
  return publicUrl.protocol === 'https:' ? publicUrl.origin : 'mailto:admin@double-sweat.invalid';
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(compact(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new ConfigError(`Ungültige Konfiguration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;

  let url: URL;
  try {
    url = new URL(env.PUBLIC_URL);
  } catch {
    throw new ConfigError('PUBLIC_URL ist keine gültige URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('PUBLIC_URL muss mit https:// beginnen');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username) {
    throw new ConfigError('PUBLIC_URL darf nur Schema, Host und Port enthalten (kein Unterpfad)');
  }
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname) && !env.ALLOW_INSECURE_HTTP) {
    throw new ConfigError(
      'PUBLIC_URL muss https:// verwenden (Kamera und Push funktionieren nur mit HTTPS). Nur für localhost ist http erlaubt.',
    );
  }
  const secureCookies = url.protocol === 'https:';

  let setupToken: string | null = null;
  if (env.SETUP_TOKEN) {
    if (PLACEHOLDER.test(env.SETUP_TOKEN)) {
      throw new ConfigError(
        'SETUP_TOKEN enthält noch einen Platzhalterwert. Erzeugen mit: openssl rand -base64 24',
      );
    }
    setupToken = env.SETUP_TOKEN;
  }
  if (env.SIGNUP_MODE === 'token' && (!setupToken || setupToken.length < 16)) {
    throw new ConfigError(
      'SIGNUP_MODE=token benötigt einen SETUP_TOKEN mit mindestens 16 Zeichen. Erzeugen mit: openssl rand -base64 24',
    );
  }

  const corsAppOrigins = env.CORS_APP_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        const u = new URL(origin);
        if (!['http:', 'https:', 'capacitor:'].includes(u.protocol) || !u.host)
          throw new Error('scheme');
        // new URL(...).origin ist für capacitor:// "null", daher selbst zusammensetzen
        return `${u.protocol}//${u.host}`;
      } catch {
        throw new ConfigError(`CORS_APP_ORIGINS: "${origin}" ist kein gültiger Origin`);
      }
    });

  let smtp: Config['smtp'] = null;
  if (env.SMTP_URL) {
    let smtpUrl: URL;
    try {
      smtpUrl = new URL(env.SMTP_URL);
    } catch {
      throw new ConfigError(
        'SMTP_URL ist keine gültige URL (Beispiel: smtps://user:pass@mail.example.org:465)',
      );
    }
    if (smtpUrl.protocol !== 'smtp:' && smtpUrl.protocol !== 'smtps:') {
      throw new ConfigError('SMTP_URL muss mit smtp:// oder smtps:// beginnen');
    }
    if (!env.MAIL_FROM)
      throw new ConfigError('MAIL_FROM fehlt (Absenderadresse, wenn SMTP_URL gesetzt ist)');
    smtp = { url: env.SMTP_URL, from: env.MAIL_FROM, requireTls: env.SMTP_REQUIRE_TLS ?? true };
  }

  if (env.DEV_CLOCK_OFFSET_HOURS !== 0 && env.NODE_ENV === 'production') {
    throw new ConfigError(
      'DEV_CLOCK_OFFSET_HOURS ist nur für Entwicklung und Tests erlaubt (NODE_ENV=production verboten)',
    );
  }

  const dataDir = isAbsolute(env.DATA_DIR) ? env.DATA_DIR : resolve(env.DATA_DIR);

  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    publicUrl: url.origin,
    publicOrigin: url.origin,
    secureCookies,
    dataDir,
    dbPath: join(dataDir, 'double-sweat.db'),
    photosDir: join(dataDir, 'photos'),
    webDir: env.WEB_DIR ? resolve(env.WEB_DIR) : null,
    signupMode: env.SIGNUP_MODE,
    setupToken,
    maxTeams: env.MAX_TEAMS,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
    corsAppOrigins,
    smtp,
    push: {
      webPushEnabled: env.WEBPUSH_ENABLED ?? true,
      unifiedPushEnabled: env.UNIFIEDPUSH_ENABLED ?? true,
      allowedHosts: env.PUSH_ALLOWED_HOSTS.split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
      vapidSubject: vapidSubject(env.VAPID_SUBJECT, url),
      fcm: env.FCM_ENABLED ? loadFcmConfig(env.FCM_SERVICE_ACCOUNT_FILE, env.FCM_API_URL) : null,
    },
    devClockOffsetMs: env.DEV_CLOCK_OFFSET_HOURS * 3_600_000,
    logLevel: env.LOG_LEVEL,
    argon2: {
      memoryKib: env.ARGON2_MEMORY_KIB,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    },
  };
}
