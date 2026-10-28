import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { type Config, loadConfig } from '../src/config.js';
import { type AppContext, createContext } from '../src/context.js';
import { openDatabase } from '../src/db/client.js';
import {
  createMemoryMailer,
  disabledMailer,
  type MemoryMailer,
} from '../src/modules/mail/mailer.js';
import { createFakeClock, type FakeClock } from '../src/util/clock.js';
import { createLogger } from '../src/util/logger.js';

export const PUBLIC_URL = 'https://ds.test';
export const SETUP_TOKEN = 'test-setup-token-1234567890';
export const PASSWORD = 'correct horse battery';

export interface TestEnv {
  ctx: AppContext;
  app: ReturnType<typeof createApp>;
  config: Config;
  clock: FakeClock;
  mailer: MemoryMailer;
  logs: string[];
  client(options?: ClientOptions): TestClient;
}

export interface TestEnvOptions {
  env?: Record<string, string>;
  /** true: Mailversand aktiv (In-Memory-Mailer). */
  mail?: boolean;
}

export function createTestEnv(options: TestEnvOptions = {}): TestEnv {
  const config = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_URL,
    SIGNUP_MODE: 'token',
    SETUP_TOKEN,
    DATA_DIR: mkdtempSync(join(tmpdir(), 'ds-test-')),
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_TIME_COST: '1',
    LOG_LEVEL: 'debug',
    ...options.env,
  });
  const logs: string[] = [];
  const clock = createFakeClock('2026-03-02T10:00:00Z');
  const mailer = createMemoryMailer();
  const ctx = createContext({
    config,
    db: openDatabase(':memory:'),
    clock,
    log: createLogger('debug', (line) => logs.push(line)),
    mailer: options.mail ? mailer : disabledMailer,
    mailRetryDelaysMs: [0, 0],
  });
  const app = createApp(ctx);
  return { ctx, app, config, clock, mailer, logs, client: (o) => new TestClient(app, o) };
}

export interface ClientOptions {
  /** Simulierte Absender-IP (Socket-Adresse). */
  ip?: string;
  /** Origin-Header, den ein Browser bei unsicheren Methoden mitsendet. */
  origin?: string | null;
}

export interface TestResponse {
  status: number;
  body: any;
  headers: Headers;
}

/** Minimaler Browser-/App-Client mit Cookie-Jar und automatischem CSRF-Header. */
export class TestClient {
  cookies = new Map<string, string>();
  csrfToken: string | undefined;
  bearer: string | undefined;
  ip: string;
  origin: string | null;

  constructor(
    private readonly app: {
      request: (input: string, init?: RequestInit, env?: unknown) => Response | Promise<Response>;
    },
    options: ClientOptions = {},
  ) {
    this.ip = options.ip ?? '203.0.113.10';
    this.origin = options.origin === undefined ? PUBLIC_URL : options.origin;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<TestResponse> {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return this.send(method, path, body === undefined ? undefined : JSON.stringify(body), headers);
  }

  /** Multipart-Upload (Fotos). Der Content-Type samt Boundary wird vom Request selbst gesetzt. */
  upload(
    path: string,
    form: FormData,
    extraHeaders: Record<string, string> = {},
  ): Promise<TestResponse> {
    return this.send('POST', path, form, extraHeaders);
  }

  private async send(
    method: string,
    path: string,
    body: string | FormData | undefined,
    extraHeaders: Record<string, string>,
  ): Promise<TestResponse> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.origin && method !== 'GET' && !('origin' in headers)) headers.origin = this.origin;
    if (this.csrfToken && !('x-csrf-token' in headers)) headers['x-csrf-token'] = this.csrfToken;
    if (this.bearer && !('authorization' in headers))
      headers.authorization = `Bearer ${this.bearer}`;
    if (this.cookies.size > 0 && !('cookie' in headers)) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await this.app.request(
      // Die API liefert absolute Pfade (z. B. Foto-URLs) mit Präfix, Tests dürfen beide Formen nutzen
      path.startsWith('/api/v1/') ? `${PUBLIC_URL}${path}` : `${PUBLIC_URL}/api/v1${path}`,
      { method, headers, body },
      { incoming: { socket: { remoteAddress: this.ip } } },
    );
    for (const raw of res.headers.getSetCookie()) {
      const [pair = ''] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw) || value === '')
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('image/')) {
      return {
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        headers: res.headers,
      };
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.request('GET', path, undefined, headers);
  post = (path: string, body?: unknown, headers?: Record<string, string>) =>
    this.request('POST', path, body ?? {}, headers);
  patch = (path: string, body: unknown) => this.request('PATCH', path, body);
  put = (path: string, body: unknown) => this.request('PUT', path, body);
  delete = (path: string, body?: unknown) => this.request('DELETE', path, body);

  /** Registriert ein neues Team (Setup-Token) und übernimmt Cookie bzw. Tokens in den Client. */
  async registerFounder(
    email = 'anna@example.org',
    name = 'Anna',
    timezone = 'Europe/Berlin',
  ): Promise<TestResponse> {
    return this.adopt(
      await this.post('/auth/register', {
        email,
        password: PASSWORD,
        displayName: name,
        timezone,
        setupToken: SETUP_TOKEN,
      }),
    );
  }

  async registerWithInvite(
    code: string,
    email = 'ben@example.org',
    name = 'Ben',
    timezone = 'Europe/Berlin',
  ) {
    return this.adopt(
      await this.post('/auth/register', {
        email,
        password: PASSWORD,
        displayName: name,
        timezone,
        inviteCode: code,
      }),
    );
  }

  async login(email: string, password = PASSWORD): Promise<TestResponse> {
    return this.adopt(await this.post('/auth/login', { email, password }));
  }

  /** Übernimmt CSRF-Token bzw. App-Tokens aus einer Anmelde-Antwort. */
  adopt(res: TestResponse): TestResponse {
    if (res.body?.csrfToken) this.csrfToken = res.body.csrfToken;
    if (res.body?.tokens?.accessToken) this.bearer = res.body.tokens.accessToken;
    return res;
  }
}

/** Gründer + Partner, beide angemeldet (verschiedene Clients). */
export async function createCouple(env: TestEnv) {
  const anna = env.client({ ip: '203.0.113.11' });
  await anna.registerFounder();
  const invite = await anna.post('/teams/invites');
  const ben = env.client({ ip: '203.0.113.12' });
  await ben.registerWithInvite(invite.body.code);
  return { anna, ben, inviteCode: invite.body.code as string };
}
