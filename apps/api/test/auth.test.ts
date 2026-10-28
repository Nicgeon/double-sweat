import { describe, expect, it } from 'vitest';
import { DAY, MINUTE } from '../src/util/time.js';
import { createCouple, createTestEnv, PASSWORD, SETUP_TOKEN } from './helpers.js';

const registerBody = (over: Record<string, unknown> = {}) => ({
  email: 'anna@example.org',
  password: PASSWORD,
  displayName: 'Anna',
  timezone: 'Europe/Berlin',
  setupToken: SETUP_TOKEN,
  ...over,
});

describe('Registrierung', () => {
  it('legt Konto und Team an und meldet per Cookie an', async () => {
    const env = createTestEnv();
    const anna = env.client();
    const res = await anna.registerFounder();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'anna@example.org',
      displayName: 'Anna',
      emailVerified: false,
    });
    expect(res.body.team).toMatchObject({ name: 'Unser Team', full: false });
    expect(res.body.team.members).toHaveLength(1);
    expect(res.body.csrfToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('setzt ein sicheres Session-Cookie (__Host-, HttpOnly, Secure, SameSite=Lax)', async () => {
    const env = createTestEnv();
    const res = await env.client().registerFounder();
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('__Host-ds_session='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('nutzt bei http://localhost einen Cookie ohne Secure und ohne __Host-Präfix', async () => {
    const env = createTestEnv({ env: { PUBLIC_URL: 'http://localhost:3000' } });
    const res = await env.client({ origin: 'http://localhost:3000' }).registerFounder();
    const cookie = res.headers.getSetCookie()[0] ?? '';
    expect(cookie.startsWith('ds_session=')).toBe(true);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('speichert Passwörter ausschließlich als argon2id-Hash', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    const row = env.ctx.db.$client.prepare('SELECT password_hash FROM users').get() as {
      password_hash: string;
    };
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it('speichert Session-Tokens nur als Hash', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const token = anna.cookies.get('__Host-ds_session')!;
    const rows = env.ctx.db.$client.prepare('SELECT * FROM sessions').all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('normalisiert die E-Mail-Adresse', async () => {
    const env = createTestEnv();
    const res = await env
      .client()
      .post('/auth/register', registerBody({ email: 'Anna@Example.ORG' }));
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('anna@example.org');
  });

  it('lehnt doppelte Adressen ab (case-insensitiv)', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    const res = await env
      .client({ ip: '203.0.113.99' })
      .post('/auth/register', registerBody({ email: 'ANNA@example.org' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('lehnt schwache Eingaben ab', async () => {
    const env = createTestEnv();
    const c = env.client();
    expect((await c.post('/auth/register', registerBody({ password: 'kurz' }))).status).toBe(400);
    expect(
      (await c.post('/auth/register', registerBody({ password: 'x'.repeat(129) }))).status,
    ).toBe(400);
    const tz = await c.post('/auth/register', registerBody({ timezone: 'Mars/Olympus' }));
    expect(tz.status).toBe(400);
    expect(tz.body.error.code).toBe('invalid_timezone');
    expect((await c.post('/auth/register', registerBody({ displayName: '   ' }))).status).toBe(400);
  });

  it('begrenzt Registrierungen pro IP', async () => {
    const env = createTestEnv();
    const c = env.client();
    for (let i = 0; i < 10; i++)
      await c.post(
        '/auth/register',
        registerBody({ setupToken: 'falsch-falsch-falsch', email: `x${i}@e.org` }),
      );
    const res = await c.post('/auth/register', registerBody());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('Anmeldung (Web)', () => {
  it('meldet mit richtigen Daten an und liefert /me samt CSRF-Token', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    const c = env.client({ ip: '203.0.113.50' });
    const login = await c.login('anna@example.org');
    expect(login.status).toBe(200);
    const me = await c.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('anna@example.org');
    expect(me.body.csrfToken).toBe(c.csrfToken);
    expect(me.body.features).toEqual({ mail: false });
  });

  it('antwortet bei falschem Passwort und unbekannter Adresse identisch', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    const wrong = await env
      .client({ ip: '203.0.113.51' })
      .post('/auth/login', { email: 'anna@example.org', password: 'falsch-falsch' });
    const unknown = await env
      .client({ ip: '203.0.113.52' })
      .post('/auth/login', { email: 'niemand@example.org', password: 'falsch-falsch' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('sperrt eine Adresse nach 8 Fehlversuchen (auch von wechselnden IPs)', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    for (let i = 0; i < 8; i++) {
      const r = await env
        .client({ ip: `198.51.100.${i + 1}` })
        .post('/auth/login', { email: 'anna@example.org', password: 'falsch-falsch' });
      expect(r.status).toBe(401);
    }
    const blocked = await env
      .client({ ip: '198.51.100.200' })
      .post('/auth/login', { email: 'anna@example.org', password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    env.clock.advance(16 * MINUTE);
    expect(
      (
        await env
          .client({ ip: '198.51.100.201' })
          .post('/auth/login', { email: 'anna@example.org', password: PASSWORD })
      ).status,
    ).toBe(200);
  });

  it('ein erfolgreicher Login setzt den Fehlerzähler zurück', async () => {
    const env = createTestEnv();
    await env.client().registerFounder();
    for (let i = 0; i < 5; i++)
      await env
        .client({ ip: '203.0.113.60' })
        .post('/auth/login', { email: 'anna@example.org', password: 'falsch-falsch' });
    expect((await env.client({ ip: '203.0.113.61' }).login('anna@example.org')).status).toBe(200);
    for (let i = 0; i < 7; i++)
      await env
        .client({ ip: '203.0.113.62' })
        .post('/auth/login', { email: 'anna@example.org', password: 'falsch-falsch' });
    expect((await env.client({ ip: '203.0.113.63' }).login('anna@example.org')).status).toBe(200);
  });

  it('begrenzt Versuche pro IP', async () => {
    const env = createTestEnv();
    const c = env.client({ ip: '192.0.2.77' });
    let last = 0;
    for (let i = 0; i < 31; i++)
      last = (
        await c.post('/auth/login', { email: `u${i}@example.org`, password: 'falsch-falsch' })
      ).status;
    expect(last).toBe(429);
  });

  it('läuft nach 14 Tagen Inaktivität ab, verlängert sich aber bei Nutzung', async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    env.clock.advance(10 * DAY);
    expect((await c.get('/me')).status).toBe(200);
    env.clock.advance(10 * DAY);
    expect((await c.get('/me')).status).toBe(200);
    env.clock.advance(15 * DAY);
    expect((await c.get('/me')).status).toBe(401);
  });

  it('endet nach 90 Tagen absolut, auch bei dauernder Nutzung', async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    for (let i = 0; i < 8; i++) {
      env.clock.advance(11 * DAY);
      expect((await c.get('/me')).status).toBe(200);
    }
    env.clock.advance(3 * DAY); // Tag 91: Idle-Frist wäre noch offen, die absolute Frist nicht mehr
    expect((await c.get('/me')).status).toBe(401);
  });
});

describe('CSRF-Schutz (Cookie-Anmeldung)', () => {
  const setup = async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    return { env, c };
  };

  it('lehnt unsichere Anfragen ohne CSRF-Token ab', async () => {
    const { c } = await setup();
    const res = await c.request('PATCH', '/me', { displayName: 'Neu' }, { 'x-csrf-token': '' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_token');
  });

  it('lehnt ein falsches CSRF-Token ab', async () => {
    const { c } = await setup();
    const res = await c.request(
      'PATCH',
      '/me',
      { displayName: 'Neu' },
      { 'x-csrf-token': 'falsch' },
    );
    expect(res.status).toBe(403);
  });

  it('lehnt fremde Origins ab, auch mit gültigem Token', async () => {
    const { c } = await setup();
    const res = await c.request(
      'PATCH',
      '/me',
      { displayName: 'Neu' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_origin');
  });

  it('lehnt die App-Origin bei Cookie-Anmeldung ab (nur PUBLIC_URL ist erlaubt)', async () => {
    const { c } = await setup();
    const res = await c.request(
      'PATCH',
      '/me',
      { displayName: 'Neu' },
      { origin: 'https://localhost' },
    );
    expect(res.status).toBe(403);
  });

  it('lehnt Cookie-Anfragen ohne Origin ab', async () => {
    const { env, c } = await setup();
    const res = await env.app.request('/api/v1/me', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        'x-csrf-token': c.csrfToken!,
      },
      body: JSON.stringify({ displayName: 'Neu' }),
    });
    expect(res.status).toBe(403);
  });

  it('lehnt Cross-Site-Anfragen ohne Origin-Header ab', async () => {
    const { env } = await setup();
    const res = await env.app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ email: 'anna@example.org', password: PASSWORD }),
    });
    expect(res.status).toBe(403);
  });

  it('akzeptiert die richtige Kombination', async () => {
    const { c } = await setup();
    const res = await c.patch('/me', { displayName: 'Anna K.' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Anna K.');
  });

  it('lehnt auch Login-Anfragen von fremden Origins ab (Login-CSRF)', async () => {
    const env = createTestEnv();
    const res = await env
      .client({ origin: 'https://evil.example' })
      .post('/auth/login', { email: 'a@b.de', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('GET-Anfragen brauchen kein Token', async () => {
    const { env, c } = await setup();
    const res = await env.app.request('/api/v1/me', {
      headers: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    expect(res.status).toBe(200);
  });

  it('Abmelden beendet die Sitzung serverseitig und löscht das Cookie', async () => {
    const { c } = await setup();
    const stolen = new Map(c.cookies);
    const out = await c.post('/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().join(';')).toMatch(/Max-Age=0|Expires=/i);
    const replay = await c.request('GET', '/me', undefined, {
      cookie: [...stolen].map(([k, v]) => `${k}=${v}`).join('; '),
    });
    expect(replay.status).toBe(401);
  });
});

describe('App-Anmeldung (Bearer-Tokens)', () => {
  const login = async (env = createTestEnv()) => {
    await env.client().registerFounder();
    const app = env.client({ origin: 'https://localhost', ip: '203.0.113.70' });
    const res = app.adopt(
      await app.post('/auth/token', {
        email: 'anna@example.org',
        password: PASSWORD,
        deviceLabel: 'Pixel 8',
      }),
    );
    return {
      env,
      app,
      tokens: res.body.tokens as { accessToken: string; refreshToken: string; expiresIn: number },
    };
  };

  it('liefert Access- und Refresh-Token ohne Cookie', async () => {
    const { app, tokens } = await login();
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresIn).toBe(900);
    expect(app.cookies.size).toBe(0);
    expect((await app.get('/me')).status).toBe(200);
  });

  it('braucht für unsichere Methoden kein CSRF-Token (keine ambienten Credentials)', async () => {
    const { app } = await login();
    expect((await app.patch('/me', { displayName: 'App-Anna' })).status).toBe(200);
  });

  it('lehnt eine fremde Origin auch mit Bearer-Token ab', async () => {
    const { app } = await login();
    const res = await app.request(
      'PATCH',
      '/me',
      { displayName: 'x' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });

  it('speichert Tokens nur als Hash', async () => {
    const { env, tokens } = await login();
    const dump = JSON.stringify(env.ctx.db.$client.prepare('SELECT * FROM app_tokens').all());
    expect(dump).not.toContain(tokens.accessToken);
    expect(dump).not.toContain(tokens.refreshToken);
  });

  it('Access-Token läuft nach 15 Minuten ab', async () => {
    const { env, app } = await login();
    env.clock.advance(14 * MINUTE);
    expect((await app.get('/me')).status).toBe(200);
    env.clock.advance(2 * MINUTE);
    expect((await app.get('/me')).status).toBe(401);
  });

  it('rotiert Refresh-Tokens: neues Paar gültig, altes Access-Token sofort ungültig', async () => {
    const { env, app, tokens } = await login();
    const oldAccess = tokens.accessToken;
    const res = await env
      .client({ origin: 'https://localhost' })
      .post('/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.tokens.refreshToken).not.toBe(tokens.refreshToken);
    expect(res.body.tokens.accessToken).not.toBe(oldAccess);
    const withNew = env.client({ origin: 'https://localhost' });
    withNew.bearer = res.body.tokens.accessToken;
    expect((await withNew.get('/me')).status).toBe(200);
    app.bearer = oldAccess;
    expect((await app.get('/me')).status).toBe(401);
  });

  it('erkennt Wiederverwendung eines Refresh-Tokens und widerruft die ganze Familie', async () => {
    const { env, tokens } = await login();
    const c = env.client({ origin: 'https://localhost' });
    const first = await c.post('/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(first.status).toBe(200);

    const replay = await env
      .client({ origin: 'https://localhost', ip: '198.51.100.9' })
      .post('/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('refresh_reuse');

    // Das legitime, neuere Token-Paar ist damit ebenfalls tot
    const newest = env.client({ origin: 'https://localhost' });
    newest.bearer = first.body.tokens.accessToken;
    expect((await newest.get('/me')).status).toBe(401);
    const again = await c.post('/auth/refresh', { refreshToken: first.body.tokens.refreshToken });
    expect(again.status).toBe(401);
  });

  it('lehnt unbekannte und abgelaufene Refresh-Tokens ab', async () => {
    const { env, tokens } = await login();
    const c = env.client({ origin: 'https://localhost' });
    expect((await c.post('/auth/refresh', { refreshToken: 'x'.repeat(43) })).status).toBe(401);
    env.clock.advance(31 * DAY);
    expect((await c.post('/auth/refresh', { refreshToken: tokens.refreshToken })).status).toBe(401);
  });

  it('Abmelden widerruft die Token-Familie', async () => {
    const { env, app, tokens } = await login();
    expect((await app.post('/auth/logout')).status).toBe(200);
    expect((await app.get('/me')).status).toBe(401);
    const res = await env
      .client({ origin: 'https://localhost' })
      .post('/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(res.status).toBe(401);
  });

  it('Geräteliste zeigt Web und App, einzelne Geräte lassen sich abmelden', async () => {
    const env = createTestEnv();
    const web = env.client();
    await web.registerFounder();
    const { app } = await login(env);
    const list = await web.get('/auth/sessions');
    expect(list.body.sessions).toHaveLength(2);
    const device = list.body.sessions.find((s: { kind: string }) => s.kind === 'app');
    expect(device).toMatchObject({ label: 'Pixel 8', current: false });
    expect(list.body.sessions.find((s: { kind: string }) => s.kind === 'web').current).toBe(true);

    expect((await web.delete(`/auth/sessions/${device.id}`)).status).toBe(200);
    expect((await app.get('/me')).status).toBe(401);
    expect((await web.delete('/auth/sessions/gibt-es-nicht')).status).toBe(404);
  });
});

describe('Passwort ändern', () => {
  it('verlangt das aktuelle Passwort', async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    const res = await c.post('/auth/change-password', {
      currentPassword: 'falsch-falsch',
      newPassword: 'ein ganz neues passwort',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('invalid_password');
  });

  it('beendet alle anderen Sitzungen, die aktuelle bleibt', async () => {
    const env = createTestEnv();
    const here = env.client();
    await here.registerFounder();
    const other = env.client({ ip: '203.0.113.81' });
    await other.login('anna@example.org');
    const app = env.client({ origin: 'https://localhost', ip: '203.0.113.82' });
    app.adopt(await app.post('/auth/token', { email: 'anna@example.org', password: PASSWORD }));

    const res = await here.post('/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'ein ganz neues passwort',
    });
    expect(res.status).toBe(200);
    expect((await here.get('/me')).status).toBe(200);
    expect((await other.get('/me')).status).toBe(401);
    expect((await app.get('/me')).status).toBe(401);

    expect(
      (
        await env
          .client({ ip: '203.0.113.83' })
          .post('/auth/login', { email: 'anna@example.org', password: PASSWORD })
      ).status,
    ).toBe(401);
    expect(
      (
        await env
          .client({ ip: '203.0.113.84' })
          .login('anna@example.org', 'ein ganz neues passwort')
      ).status,
    ).toBe(200);
  });

  it('zählt falsche Passwörter bei sensiblen Aktionen und sperrt nach 5 Versuchen', async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await c.post('/auth/change-password', {
            currentPassword: 'falsch-falsch',
            newPassword: 'ein ganz neues passwort',
          })
        ).status,
      ).toBe(403);
    }
    const res = await c.post('/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'ein ganz neues passwort',
    });
    expect(res.status).toBe(429);
  });
});

describe('Geschützte Routen', () => {
  it.each([
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['DELETE', '/me'],
    ['GET', '/team'],
    ['POST', '/teams/invites'],
    ['POST', '/auth/logout'],
    ['GET', '/auth/sessions'],
  ])('%s %s verlangt Anmeldung', async (method, path) => {
    const env = createTestEnv();
    const res = await env.client().request(method, path, method === 'GET' ? undefined : {});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('ignoriert ein ungültiges Bearer-Token auch bei vorhandenem Cookie', async () => {
    const env = createTestEnv();
    const c = env.client();
    await c.registerFounder();
    const res = await c.get('/me', { authorization: 'Bearer ungueltig' });
    expect(res.status).toBe(401);
  });

  it('Konto löschen beendet alle Sitzungen und braucht das Passwort', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.delete('/me', { password: 'falsch-falsch' })).status).toBe(403);
    expect((await anna.delete('/me', { password: PASSWORD })).status).toBe(200);
    expect((await anna.get('/me')).status).toBe(401);
    expect(
      (
        await env
          .client({ ip: '203.0.113.99' })
          .post('/auth/login', { email: 'anna@example.org', password: PASSWORD })
      ).status,
    ).toBe(401);
  });
});
