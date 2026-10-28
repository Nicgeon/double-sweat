import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pushSubscriptions } from '../src/db/schema.js';
import { MAX_FAILURES } from '../src/modules/push/service.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';
import { type FakePushServer, newDevice, pushEnv, startPushServer } from './push-helpers.js';

let server: FakePushServer;
beforeEach(async () => {
  server = await startPushServer();
});
afterEach(() => server.close());

const webpush = (device: ReturnType<typeof newDevice>, deviceLabel = 'Firefox') => ({
  provider: 'webpush',
  endpoint: device.endpoint,
  keys: device.keys,
  deviceLabel,
});

describe('Push-Konfiguration', () => {
  it('liefert den öffentlichen VAPID-Schlüssel, nie den privaten', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const res = await anna.get('/push/config');
    expect(res.status).toBe(200);
    expect(res.body.webpush.enabled).toBe(true);
    expect(res.body.webpush.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(res.body.unifiedpush).toEqual({ enabled: true });
    const privateKey = (
      env.ctx.db.$client
        .prepare("SELECT value FROM instance_secrets WHERE name = 'vapid_private'")
        .get() as { value: string }
    ).value;
    expect(JSON.stringify(res.body)).not.toContain(privateKey);
  });

  it('erzeugt die Schlüssel einmalig und behält sie über Neustarts', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const first = (await anna.get('/push/config')).body.webpush.publicKey;
    const { createContext } = await import('../src/context.js');
    const restarted = createContext({ config: env.config, db: env.ctx.db, clock: env.clock });
    expect(restarted.push.config().webpush.publicKey).toBe(first);
  });

  it('Anbieter lassen sich abschalten', async () => {
    const env = pushEnv({ env: { WEBPUSH_ENABLED: 'false' } });
    const { anna } = await createCouple(env);
    const config = (await anna.get('/push/config')).body;
    expect(config.webpush).toEqual({ enabled: false, publicKey: null });
    const res = await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/a`)));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('provider_disabled');
  });

  it('verlangt Anmeldung', async () => {
    const env = pushEnv();
    expect((await env.client().get('/push/config')).status).toBe(401);
    expect((await env.client().post('/push/subscriptions', {})).status).toBe(401);
  });
});

describe('Subscriptions registrieren', () => {
  it('registriert Web Push und UnifiedPush (mit und ohne Schlüssel)', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const web = await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/w`)));
    expect(web.status).toBe(201);
    expect(web.body.subscription).toMatchObject({
      provider: 'webpush',
      deviceLabel: 'Firefox',
      failures: 0,
      lastSuccessAt: null,
    });
    const up = newDevice(`${server.base}/u`);
    expect(
      (
        await anna.post('/push/subscriptions', {
          provider: 'unifiedpush',
          endpoint: up.endpoint,
          keys: up.keys,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await anna.post('/push/subscriptions', {
          provider: 'unifiedpush',
          endpoint: `${server.base}/u2`,
        })
      ).status,
    ).toBe(201);
    expect((await anna.get('/push/subscriptions')).body.subscriptions).toHaveLength(3);
  });

  it('die Antwort enthält weder Endpunkt noch Schlüssel', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const device = newDevice(`${server.base}/geheim-endpunkt`);
    const res = await anna.post('/push/subscriptions', webpush(device));
    const text =
      JSON.stringify(res.body) + JSON.stringify((await anna.get('/push/subscriptions')).body);
    expect(text).not.toContain('geheim-endpunkt');
    expect(text).not.toContain(device.keys.p256dh);
    expect(text).not.toContain(device.keys.auth);
  });

  it('dieselbe Registrierung zweimal ist idempotent', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const device = newDevice(`${server.base}/x`);
    const a = await anna.post('/push/subscriptions', webpush(device));
    const b = await anna.post('/push/subscriptions', webpush(device, 'Neuer Name'));
    expect(b.body.subscription.id).toBe(a.body.subscription.id);
    expect(b.body.subscription.deviceLabel).toBe('Neuer Name');
    expect((await anna.get('/push/subscriptions')).body.subscriptions).toHaveLength(1);
  });

  it('übernimmt keinen Endpunkt, der einem anderen Konto gehört', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const device = newDevice(`${server.base}/anna-geraet`);
    await anna.post('/push/subscriptions', webpush(device));
    const res = await ben.post('/push/subscriptions', webpush(device));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('endpoint_in_use');
    expect((await ben.get('/push/subscriptions')).body.subscriptions).toHaveLength(0);
  });

  it('begrenzt die Zahl der Geräte pro Konto', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    for (let i = 0; i < 10; i++)
      expect(
        (await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/d${i}`)))).status,
      ).toBe(201);
    const res = await anna.post(
      '/push/subscriptions',
      webpush(newDevice(`${server.base}/zu-viel`)),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('too_many_subscriptions');
  });

  it('lehnt ungültige Schlüssel ab', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    const device = newDevice(`${server.base}/k`);
    const bad = [
      { ...webpush(device), keys: { p256dh: 'x'.repeat(87), auth: device.keys.auth } },
      { ...webpush(device), keys: { p256dh: device.keys.p256dh, auth: 'y'.repeat(30) } },
      { ...webpush(device), keys: undefined },
    ];
    for (const body of bad) expect((await anna.post('/push/subscriptions', body)).status).toBe(400);
  });

  it('Geräte lassen sich nur selbst entfernen', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const id = (await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/r`)))).body
      .subscription.id;
    expect((await ben.delete(`/push/subscriptions/${id}`)).status).toBe(404);
    expect((await anna.delete(`/push/subscriptions/${id}`)).status).toBe(200);
    expect((await anna.delete(`/push/subscriptions/${id}`)).status).toBe(404);
  });

  describe('SSRF-Schutz bei der Registrierung', () => {
    // Der Standard-Testaufbau erlaubt kein einziges lokales Ziel
    it.each([
      'http://example.org/push', // kein https
      'https://127.0.0.1/push',
      'https://localhost/push',
      'https://[::1]/push',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/push',
      'https://192.168.1.10:8443/push',
      'https://user:pw@push.example.org/x',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ])('lehnt %s ab', async (endpoint) => {
      const env = createTestEnv();
      const { anna } = await createCouple(env);
      const device = newDevice(endpoint);
      for (const body of [webpush(device), { provider: 'unifiedpush', endpoint }]) {
        const res = await anna.post('/push/subscriptions', body);
        expect(res.status, endpoint).toBe(400);
        expect(['unsafe_endpoint', 'validation_error']).toContain(res.body.error.code);
      }
      expect((await anna.get('/push/subscriptions')).body.subscriptions).toHaveLength(0);
    });

    it('lokale Ziele sind nur für ausdrücklich erlaubte Hosts möglich', async () => {
      const closed = createTestEnv();
      const { anna } = await createCouple(closed);
      expect(
        (
          await anna.post('/push/subscriptions', {
            provider: 'unifiedpush',
            endpoint: `${server.base}/a`,
          })
        ).status,
      ).toBe(400);
      const open = pushEnv();
      const couple = await createCouple(open);
      expect(
        (
          await couple.anna.post('/push/subscriptions', {
            provider: 'unifiedpush',
            endpoint: `${server.base}/a`,
          })
        ).status,
      ).toBe(201);
    });
  });
});

describe('Zustellung', () => {
  it('Web Push: Ende-zu-Ende verschlüsselt, mit VAPID, Inhalt nur für das Gerät lesbar', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const device = newDevice(`${server.base}/ben-web`);
    await ben.post('/push/subscriptions', webpush(device));
    expect((await anna.post('/nudges')).status).toBe(202);
    await env.ctx.idle();

    expect(server.requests).toHaveLength(1);
    const req = server.requests[0]!;
    expect(req.path).toBe('/ben-web');
    expect(req.headers['content-encoding']).toBe('aes128gcm');
    expect(req.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(req.headers.ttl).toBe('3600');
    expect(req.headers.urgency).toBe('high');
    // Der Klartext ist im Transport nirgends sichtbar
    expect(req.body.toString('utf8')).not.toContain('Anna');
    expect(req.body.toString('utf8')).not.toContain('stupst');
    // Aber das Gerät kann ihn lesen
    const message = JSON.parse(device.decrypt(req.body));
    expect(message).toMatchObject({
      type: 'nudge',
      title: 'Double Sweat',
      body: 'Anna stupst dich an: Zeit fürs Training!',
    });
  });

  it('UnifiedPush mit Schlüsseln: verschlüsselt, ohne VAPID', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const device = newDevice(`${server.base}/ben-up`);
    await ben.post('/push/subscriptions', {
      provider: 'unifiedpush',
      endpoint: device.endpoint,
      keys: device.keys,
    });
    await anna.post('/nudges');
    await env.ctx.idle();
    const req = server.requests[0]!;
    expect(req.headers.authorization).toBeUndefined();
    expect(req.headers['content-encoding']).toBe('aes128gcm');
    expect(JSON.parse(device.decrypt(req.body)).body).toContain('Anna');
  });

  it('UnifiedPush ohne Schlüssel: nur ein neutraler Text, keine Namen oder Inhalte', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    await ben.post('/push/subscriptions', {
      provider: 'unifiedpush',
      endpoint: `${server.base}/ben-plain`,
    });
    await anna.post('/nudges');
    await env.ctx.idle();
    const req = server.requests[0]!;
    const text = req.body.toString('utf8');
    expect(JSON.parse(text)).toEqual({
      type: 'nudge',
      title: 'Double Sweat',
      body: 'Du hast eine neue Benachrichtigung.',
    });
    expect(text).not.toMatch(/Anna|stupst/);
  });

  it('liefert an alle Geräte des Empfängers, nicht an andere Konten', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/b1`)));
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/b2`)));
    await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/a1`)));
    await anna.post('/nudges');
    await env.ctx.idle();
    expect(server.requests.map((r) => r.path).sort()).toEqual(['/b1', '/b2']);
  });

  it('erfolgreiche Zustellung setzt lastSuccessAt und Fehlerzähler zurück', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const id = (await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/ok`)))).body
      .subscription.id;
    env.ctx.db
      .update(pushSubscriptions)
      .set({ failureCount: 4 })
      .where(eq(pushSubscriptions.id, id))
      .run();
    await anna.post('/nudges');
    await env.ctx.idle();
    const sub = (await ben.get('/push/subscriptions')).body.subscriptions[0];
    expect(sub).toMatchObject({ failures: 0, lastSuccessAt: env.clock.now() });
  });

  it.each([404, 410])('Status %s entfernt die Subscription', async (status) => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    server.statusFor.set('/weg', status);
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/weg`)));
    await anna.post('/nudges');
    await env.ctx.idle();
    expect((await ben.get('/push/subscriptions')).body.subscriptions).toHaveLength(0);
  });

  it('vorübergehende Fehler zählen hoch; nach zu vielen wird entfernt', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    server.statusFor.set('/kaputt', 503);
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/kaputt`)));
    for (let i = 1; i < MAX_FAILURES; i++) {
      env.clock.advance(61 * 60_000);
      await anna.post('/nudges');
      await env.ctx.idle();
      expect((await ben.get('/push/subscriptions')).body.subscriptions[0].failures).toBe(i);
    }
    env.clock.advance(61 * 60_000);
    await anna.post('/nudges');
    await env.ctx.idle();
    expect((await ben.get('/push/subscriptions')).body.subscriptions).toHaveLength(0);
  });

  it('lehnt auch zur Zustellzeit Ziele im internen Netz ab (manipulierte Datenbankzeile)', async () => {
    const env = createTestEnv(); // keine Ausnahmen
    const { anna, ben } = await createCouple(env);
    const benId = (await ben.get('/me')).body.user.id;
    env.ctx.db
      .insert(pushSubscriptions)
      .values({
        id: 'sub1',
        userId: benId,
        provider: 'unifiedpush',
        endpoint: `${server.base}/intern`,
        createdAt: 1,
        failureCount: 0,
      })
      .run();
    await anna.post('/nudges');
    await env.ctx.idle();
    expect(server.requests).toHaveLength(0);
    expect((await ben.get('/push/subscriptions')).body.subscriptions[0].failures).toBe(1);
  });

  it('Push-Fehler beeinträchtigen den Nudge nicht: das Postfach bekommt ihn trotzdem', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    server.statusFor.set('/boese', 500);
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/boese`)));
    expect((await anna.post('/nudges')).status).toBe(202);
    await env.ctx.idle();
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(1);
  });

  it('loggt keine Endpunkte, Schlüssel oder Inhalte', async () => {
    const env = pushEnv();
    const { anna, ben } = await createCouple(env);
    const device = newDevice(`${server.base}/geheimer-pfad`);
    server.statusFor.set('/geheimer-pfad', 500);
    await ben.post('/push/subscriptions', webpush(device));
    await anna.post('/nudges');
    await env.ctx.idle();
    const log = env.logs.join('\n');
    expect(log).not.toContain('geheimer-pfad');
    expect(log).not.toContain(device.keys.auth);
    expect(log).not.toContain('stupst');
  });

  it('Testbenachrichtigung geht an die eigenen Geräte und ist limitiert', async () => {
    const env = pushEnv();
    const { anna } = await createCouple(env);
    await anna.post('/push/subscriptions', webpush(newDevice(`${server.base}/test`)));
    for (let i = 0; i < 5; i++) expect((await anna.post('/push/test')).status).toBe(202);
    expect((await anna.post('/push/test')).status).toBe(429);
    await env.ctx.idle();
    expect(server.requests).toHaveLength(5);
    expect(server.requests[0]!.headers.urgency).toBe('high');
    expect(server.requests[0]!.headers.ttl).toBe('60');
  });

  it('Konto löschen entfernt die Subscriptions', async () => {
    const env = pushEnv();
    const { ben } = await createCouple(env);
    await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/weg2`)));
    await ben.delete('/me', { password: PASSWORD });
    expect(
      (
        env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });
});
