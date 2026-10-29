import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';
import { MAX_FAILURES } from '../src/modules/push/service.js';
import { DAY, HOUR } from '../src/util/time.js';
import { createCouple, createTestEnv, PASSWORD, type TestEnv } from './helpers.js';
import { newDevice } from './push-helpers.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const FCM_TOKEN = `${'a'.repeat(22)}:APA91b${'x'.repeat(100)}`;

interface Google {
  base: string;
  tokenRequests: URLSearchParams[];
  messages: { authorization: string; body: any }[];
  /** Antworten für die nächsten Sendungen (danach 200). */
  sendReplies: { status: number; body?: unknown }[];
  tokenReply: { status: number; expiresIn: number };
  close(): Promise<void>;
}

async function startGoogle(): Promise<Google> {
  const state: Google = {
    base: '',
    tokenRequests: [],
    messages: [],
    sendReplies: [],
    tokenReply: { status: 200, expiresIn: 3600 },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/token') {
        state.tokenRequests.push(new URLSearchParams(body));
        res.statusCode = state.tokenReply.status;
        res.end(
          JSON.stringify(
            state.tokenReply.status === 200
              ? {
                  access_token: `ya29.token-${state.tokenRequests.length}`,
                  expires_in: state.tokenReply.expiresIn,
                }
              : { error: 'invalid_grant' },
          ),
        );
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/projects/ds-test/messages:send') {
        state.messages.push({
          authorization: String(req.headers.authorization),
          body: JSON.parse(body),
        });
        const reply = state.sendReplies.shift() ?? { status: 200 };
        res.statusCode = reply.status;
        res.end(JSON.stringify(reply.body ?? { name: 'projects/ds-test/messages/1' }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}

function serviceAccountFile(google: Google, overrides: Record<string, unknown> = {}): string {
  const file = join(mkdtempSync(join(tmpdir(), 'ds-fcm-')), 'sa.json');
  writeFileSync(
    file,
    JSON.stringify({
      type: 'service_account',
      project_id: 'ds-test',
      client_email: 'push@ds-test.iam.gserviceaccount.com',
      private_key: privatePem,
      token_uri: `${google.base}/token`,
      ...overrides,
    }),
  );
  return file;
}

let google: Google;
beforeEach(async () => {
  google = await startGoogle();
});
afterEach(() => google.close());

function fcmEnv(extra: Record<string, string> = {}): TestEnv {
  return createTestEnv({
    env: {
      PUSH_ALLOWED_HOSTS: '127.0.0.1',
      FCM_ENABLED: 'true',
      FCM_SERVICE_ACCOUNT_FILE: serviceAccountFile(google),
      FCM_API_URL: google.base,
      ...extra,
    },
  });
}

const subscribe = (device: ReturnType<typeof newDevice>, label = 'Pixel') => ({
  provider: 'fcm',
  endpoint: device.endpoint,
  keys: device.keys,
  deviceLabel: label,
});

async function coupleWithDevice(env: TestEnv) {
  const { anna, ben } = await createCouple(env);
  const device = newDevice(FCM_TOKEN);
  expect((await ben.post('/push/subscriptions', subscribe(device))).status).toBe(201);
  return { anna, ben, device };
}

const rows = (env: TestEnv) =>
  env.ctx.db.$client.prepare('SELECT failure_count AS failures FROM push_subscriptions').all() as {
    failures: number;
  }[];

describe('FCM: Konfiguration', () => {
  const base = { NODE_ENV: 'test', PUBLIC_URL: 'https://sweat.example.org', SIGNUP_MODE: 'closed' };

  it('ist standardmäßig aus und wird im Push-Config gemeldet', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.get('/push/config')).body.fcm).toEqual({ enabled: false });
    const on = fcmEnv();
    const { anna: other } = await createCouple(on);
    expect((await other.get('/push/config')).body.fcm).toEqual({ enabled: true });
  });

  it('verlangt eine lesbare Service-Account-Datei mit Projekt, Konto und Schlüssel', () => {
    const bad = (extra: Record<string, string>) => () =>
      loadConfig({ ...base, FCM_ENABLED: 'true', ...extra });
    expect(bad({})).toThrow(ConfigError);
    expect(bad({ FCM_SERVICE_ACCOUNT_FILE: '/gibt/es/nicht.json' })).toThrow(/nicht lesbar/);
    const dir = mkdtempSync(join(tmpdir(), 'ds-fcm-'));
    const write = (name: string, content: string) => {
      const file = join(dir, name);
      writeFileSync(file, content);
      return file;
    };
    expect(bad({ FCM_SERVICE_ACCOUNT_FILE: write('a.json', 'kein json') })).toThrow(
      /keine gültige JSON/,
    );
    expect(bad({ FCM_SERVICE_ACCOUNT_FILE: write('b.json', '{"project_id":"x"}') })).toThrow(
      /kein Firebase-Dienstkonto/,
    );
    expect(
      bad({
        FCM_SERVICE_ACCOUNT_FILE: write(
          'c.json',
          JSON.stringify({ project_id: 'x', client_email: 'a@b', private_key: 'kein schlüssel' }),
        ),
      }),
    ).toThrow(/private Schlüssel/i);
  });

  it('ohne FCM_ENABLED wird die Datei gar nicht gelesen', () => {
    const config = loadConfig({ ...base, FCM_SERVICE_ACCOUNT_FILE: '/gibt/es/nicht.json' });
    expect(config.push.fcm).toBeNull();
  });

  it('der private Schlüssel taucht nirgends in der Konfiguration oder im Log auf', async () => {
    const env = fcmEnv();
    expect(JSON.stringify(env.config)).not.toContain('PRIVATE KEY');
    const { ben } = await coupleWithDevice(env);
    env.ctx.push.notify((await ben.get('/me')).body.user.id, {
      type: 'test',
      title: 'Double Sweat',
      body: 'x',
    });
    await env.ctx.idle();
    expect(env.logs.join('\n')).not.toContain('PRIVATE KEY');
  });
});

describe('FCM: Registrieren', () => {
  it('nimmt Token samt Schlüsseln an und lehnt Ungültiges ab', async () => {
    const env = fcmEnv();
    const { anna } = await createCouple(env);
    const device = newDevice(FCM_TOKEN);
    const ok = await anna.post('/push/subscriptions', subscribe(device));
    expect(ok.status).toBe(201);
    expect(ok.body.subscription).toMatchObject({ provider: 'fcm', deviceLabel: 'Pixel' });

    const noKeys = await anna.post('/push/subscriptions', {
      provider: 'fcm',
      endpoint: `${FCM_TOKEN}2`,
    });
    expect(noKeys.status).toBe(400);
    const badToken = await anna.post('/push/subscriptions', subscribe(newDevice('zu kurz!')));
    expect(badToken.status).toBe(400);
    expect(badToken.body.error.code).toBe('invalid_token');
    const urlAsToken = await anna.post(
      '/push/subscriptions',
      subscribe(newDevice('https://evil.example/x?aaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
    );
    expect(urlAsToken.status).toBe(400);
    const badKeys = await anna.post('/push/subscriptions', {
      ...subscribe(newDevice(`${FCM_TOKEN}3`)),
      keys: { p256dh: 'AAAA', auth: 'BBBB' },
    });
    expect(badKeys.status).toBe(400);
  });

  it('ist ohne FCM_ENABLED abgelehnt, und ein Token gehört genau einem Konto', async () => {
    const off = createTestEnv();
    const { anna: a } = await createCouple(off);
    const res = await a.post('/push/subscriptions', subscribe(newDevice(FCM_TOKEN)));
    expect(res.body.error.code).toBe('provider_disabled');

    const env = fcmEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.post('/push/subscriptions', subscribe(newDevice(FCM_TOKEN)))).status).toBe(
      201,
    );
    const taken = await ben.post('/push/subscriptions', subscribe(newDevice(FCM_TOKEN)));
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('endpoint_in_use');
  });
});

describe('FCM: Zustellung', () => {
  it('meldet sich mit signiertem JWT an und sendet den Inhalt Ende-zu-Ende verschlüsselt', async () => {
    const env = fcmEnv();
    const { anna, ben, device } = await coupleWithDevice(env);
    expect((await anna.post('/nudges')).status).toBe(202);
    await env.ctx.idle();

    // Anmeldung beim Dienstkonto: JWT mit richtiger Signatur und Zielgruppe
    expect(google.tokenRequests).toHaveLength(1);
    const form = google.tokenRequests[0] as URLSearchParams;
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, claims, signature] = (form.get('assertion') as string).split('.') as [
      string,
      string,
      string,
    ];
    const verifier = createVerify('RSA-SHA256').update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'push@ds-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: `${google.base}/token`,
    });

    // Nachricht: Token des Geräts, Daten-Nachricht (keine Anzeige durch Google), Inhalt verschlüsselt
    expect(google.messages).toHaveLength(1);
    const sent = google.messages[0] as Google['messages'][number];
    expect(sent.authorization).toBe('Bearer ya29.token-1');
    const message = sent.body.message;
    expect(message.token).toBe(FCM_TOKEN);
    expect(message.notification).toBeUndefined();
    expect(message.android).toEqual({ priority: 'HIGH', ttl: '3600s' });
    expect(Object.keys(message.data).sort()).toEqual(['p', 'v']);
    expect(JSON.stringify(sent.body)).not.toContain('stupst');
    const plain = JSON.parse(device.decrypt(Buffer.from(message.data.p, 'base64url')));
    expect(plain).toMatchObject({
      type: 'nudge',
      title: 'Double Sweat',
      body: 'Anna stupst dich an: Zeit fürs Training!',
    });
    const [sub] = (await ben.get('/push/subscriptions')).body.subscriptions;
    expect(sub).toMatchObject({ provider: 'fcm', failures: 0, lastSuccessAt: env.clock.now() });
  });

  it('nutzt das Zugriffstoken weiter und erneuert es kurz vor Ablauf', async () => {
    google.tokenReply.expiresIn = 3600;
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    const id = (await ben.get('/me')).body.user.id as string;
    const notify = async () => {
      env.ctx.push.notify(id, { type: 'reminder', title: 'Double Sweat', body: 'x' });
      await env.ctx.idle();
    };
    await notify();
    await notify();
    expect(google.tokenRequests).toHaveLength(1);
    env.clock.advance(HOUR - 30_000); // weniger als eine Minute Restlaufzeit
    await notify();
    expect(google.tokenRequests).toHaveLength(2);
    expect(google.messages.map((m) => m.authorization)).toEqual([
      'Bearer ya29.token-1',
      'Bearer ya29.token-1',
      'Bearer ya29.token-2',
    ]);
    expect(google.messages[0]?.body.message.android.priority).toBe('NORMAL');
  });

  it('gleichzeitige Sendungen teilen sich eine Anmeldung', async () => {
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    const id = (await ben.get('/me')).body.user.id as string;
    for (let i = 0; i < 4; i++) {
      env.ctx.push.notify(id, { type: 'reminder', title: 'Double Sweat', body: `n${i}` });
    }
    await env.ctx.idle();
    expect(google.messages).toHaveLength(4);
    expect(google.tokenRequests).toHaveLength(1);
  });

  it('ein abgelehntes Zugriffstoken (401) wird einmal erneuert, dann klappt es', async () => {
    google.sendReplies.push({ status: 401, body: { error: { status: 'UNAUTHENTICATED' } } });
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    env.ctx.push.notify((await ben.get('/me')).body.user.id, {
      type: 'reminder',
      title: 'D',
      body: 'x',
    });
    await env.ctx.idle();
    expect(google.tokenRequests).toHaveLength(2);
    expect(google.messages.map((m) => m.authorization)).toEqual([
      'Bearer ya29.token-1',
      'Bearer ya29.token-2',
    ]);
    expect(rows(env)).toEqual([{ failures: 0 }]);
  });

  it('abgemeldete Geräte (UNREGISTERED) werden vergessen', async () => {
    google.sendReplies.push({
      status: 404,
      body: {
        error: {
          status: 'NOT_FOUND',
          details: [
            {
              '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              errorCode: 'UNREGISTERED',
            },
          ],
        },
      },
    });
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    env.ctx.push.notify((await ben.get('/me')).body.user.id, {
      type: 'reminder',
      title: 'D',
      body: 'x',
    });
    await env.ctx.idle();
    expect((await ben.get('/push/subscriptions')).body.subscriptions).toEqual([]);
  });

  it('ein 404 ohne UNREGISTERED (z. B. falsche Projekt-ID) löscht keine Geräte', async () => {
    google.sendReplies.push({ status: 404, body: { error: { status: 'NOT_FOUND' } } });
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    env.ctx.push.notify((await ben.get('/me')).body.user.id, {
      type: 'reminder',
      title: 'D',
      body: 'x',
    });
    await env.ctx.idle();
    expect(rows(env)).toEqual([{ failures: 1 }]);
  });

  it.each([429, 500, 503])(
    'Status %s ist vorübergehend: Gerät bleibt, Fehler werden gezählt',
    async (status) => {
      google.sendReplies.push({ status, body: { error: { status: 'UNAVAILABLE' } } });
      const env = fcmEnv();
      const { ben } = await coupleWithDevice(env);
      env.ctx.push.notify((await ben.get('/me')).body.user.id, {
        type: 'reminder',
        title: 'D',
        body: 'x',
      });
      await env.ctx.idle();
      expect(rows(env)).toEqual([{ failures: 1 }]);
      // Der nächste Erfolg setzt den Zähler zurück
      env.ctx.push.notify((await ben.get('/me')).body.user.id, {
        type: 'reminder',
        title: 'D',
        body: 'y',
      });
      await env.ctx.idle();
      expect(rows(env)).toEqual([{ failures: 0 }]);
    },
  );

  it('ungültige Anfragen (400, 403) zählen als Fehler und entfernen das Gerät nach MAX_FAILURES', async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      google.sendReplies.push({ status: 403, body: { error: { status: 'PERMISSION_DENIED' } } });
    }
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    const id = (await ben.get('/me')).body.user.id as string;
    for (let i = 0; i < MAX_FAILURES; i++) {
      env.ctx.push.notify(id, { type: 'reminder', title: 'D', body: `n${i}` });
      await env.ctx.idle();
    }
    expect((await ben.get('/push/subscriptions')).body.subscriptions).toEqual([]);
  });

  it('Google nicht erreichbar oder Anmeldung abgelehnt: Gerät bleibt, nächster Versuch klappt', async () => {
    google.tokenReply = { status: 400, expiresIn: 0 };
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    const id = (await ben.get('/me')).body.user.id as string;
    env.ctx.push.notify(id, { type: 'reminder', title: 'D', body: 'x' });
    await env.ctx.idle();
    expect(google.messages).toHaveLength(0);
    expect(rows(env)).toEqual([{ failures: 1 }]);
    google.tokenReply = { status: 200, expiresIn: 3600 };
    env.ctx.push.notify(id, { type: 'reminder', title: 'D', body: 'y' });
    await env.ctx.idle();
    expect(google.messages).toHaveLength(1);
    expect(rows(env)).toEqual([{ failures: 0 }]);
  });

  it('Fehler von FCM stören das Postfach nicht: Die Nachricht liegt trotzdem dort', async () => {
    google.sendReplies.push({ status: 503 });
    const env = fcmEnv();
    const { anna, ben } = await createCouple(env);
    await ben.post('/push/subscriptions', subscribe(newDevice(FCM_TOKEN)));
    expect((await anna.post('/nudges')).status).toBe(202);
    await env.ctx.idle();
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(1);
  });
});

describe('FCM: Aufräumen', () => {
  it('beim Löschen des Kontos oder Teams verschwinden die Geräte', async () => {
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    expect(rows(env)).toHaveLength(1);
    expect((await ben.delete('/me', { password: PASSWORD })).status).toBe(200);
    expect(rows(env)).toHaveLength(0);
  });

  it('lange Pausen: nach einem Tag wird das Zugriffstoken ohnehin erneuert', async () => {
    const env = fcmEnv();
    const { ben } = await coupleWithDevice(env);
    const id = (await ben.get('/me')).body.user.id as string;
    env.ctx.push.notify(id, { type: 'reminder', title: 'D', body: 'a' });
    await env.ctx.idle();
    env.clock.advance(DAY);
    env.ctx.push.notify(id, { type: 'reminder', title: 'D', body: 'b' });
    await env.ctx.idle();
    expect(google.tokenRequests).toHaveLength(2);
  });
});
