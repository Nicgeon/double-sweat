import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createMailer } from '../src/modules/mail/mailer.js';
import { DAY, HOUR, MINUTE } from '../src/util/time.js';
import { createTestEnv, PASSWORD, SETUP_TOKEN, type TestEnv } from './helpers.js';

const linkOf = (text: string, path: string) => {
  const match = new RegExp(`https://ds\\.test/${path}/([A-Za-z0-9_-]+)`).exec(text);
  return { url: match?.[0], token: match?.[1] };
};

/** Gründer registrieren und E-Mail bestätigen. */
async function verifiedFounder(env: TestEnv) {
  const anna = env.client();
  await anna.registerFounder();
  await env.ctx.idle();
  const { token } = linkOf(env.mailer.sent[0]!.text, 'verify');
  const res = await env.client({ ip: '203.0.113.150' }).post('/auth/verify-email', { token });
  expect(res.status).toBe(200);
  env.mailer.sent.length = 0;
  return anna;
}

describe('E-Mail-Bestätigung', () => {
  it('Registrierung verschickt einen Bestätigungslink an die Adresse', async () => {
    const env = createTestEnv({ mail: true });
    await env.client().registerFounder();
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(1);
    const mail = env.mailer.sent[0]!;
    expect(mail.to).toBe('anna@example.org');
    expect(mail.subject).toContain('bestätigen');
    expect(linkOf(mail.text, 'verify').url).toBeDefined();
    expect(mail.text).toContain('Hallo Anna');
  });

  it('der Link bestätigt die Adresse genau einmal', async () => {
    const env = createTestEnv({ mail: true });
    const anna = env.client();
    await anna.registerFounder();
    await env.ctx.idle();
    const { token } = linkOf(env.mailer.sent[0]!.text, 'verify');
    expect((await anna.get('/me')).body.user.emailVerified).toBe(false);
    expect(
      (await env.client({ ip: '203.0.113.151' }).post('/auth/verify-email', { token })).status,
    ).toBe(200);
    expect((await anna.get('/me')).body.user.emailVerified).toBe(true);
    const again = await env.client({ ip: '203.0.113.152' }).post('/auth/verify-email', { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('invalid_token');
  });

  it('der Link verfällt nach 24 Stunden', async () => {
    const env = createTestEnv({ mail: true });
    await env.client().registerFounder();
    await env.ctx.idle();
    const { token } = linkOf(env.mailer.sent[0]!.text, 'verify');
    env.clock.advance(25 * HOUR);
    expect(
      (await env.client({ ip: '203.0.113.153' }).post('/auth/verify-email', { token })).status,
    ).toBe(400);
  });

  it('Bestätigungsmail lässt sich erneut anfordern (limitiert)', async () => {
    const env = createTestEnv({ mail: true });
    const anna = env.client();
    await anna.registerFounder();
    await env.ctx.idle();
    env.mailer.sent.length = 0;
    for (let i = 0; i < 3; i++)
      expect((await anna.post('/auth/resend-verification')).status).toBe(200);
    expect((await anna.post('/auth/resend-verification')).status).toBe(429);
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(3);
  });
});

describe('Passwort vergessen', () => {
  it('antwortet für bekannte, unbestätigte und unbekannte Adressen identisch', async () => {
    const env = createTestEnv({ mail: true });
    await verifiedFounder(env);
    const unverified = env.client({ ip: '203.0.113.160' });
    await unverified.registerFounder('unbestaetigt@example.org', 'Uwe');
    await env.ctx.idle();
    env.mailer.sent.length = 0;

    const ask = (email: string, ip: string) =>
      env.client({ ip }).post('/auth/forgot-password', { email });
    const known = await ask('anna@example.org', '203.0.113.161');
    const pending = await ask('unbestaetigt@example.org', '203.0.113.162');
    const unknown = await ask('niemand@example.org', '203.0.113.163');
    expect([known.status, pending.status, unknown.status]).toEqual([202, 202, 202]);
    expect(known.body).toEqual(pending.body);
    expect(known.body).toEqual(unknown.body);

    await env.ctx.idle();
    // Nur die bestätigte Adresse bekommt tatsächlich eine Mail
    expect(env.mailer.sent.map((m) => m.to)).toEqual(['anna@example.org']);
  });

  it('Reset-Link: Passwort setzen, alle Sitzungen enden, Link ist einmalig', async () => {
    const env = createTestEnv({ mail: true });
    const anna = await verifiedFounder(env);
    const app = env.client({ origin: 'https://localhost', ip: '203.0.113.170' });
    app.adopt(await app.post('/auth/token', { email: 'anna@example.org', password: PASSWORD }));

    await env
      .client({ ip: '203.0.113.171' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    await env.ctx.idle();
    const mail = env.mailer.sent.find((m) => m.subject.includes('zurücksetzen'))!;
    const { token } = linkOf(mail.text, 'reset');
    expect(mail.text).toContain('30 Minuten');

    const reset = await env
      .client({ ip: '203.0.113.172' })
      .post('/auth/reset-password', { token, newPassword: 'ein ganz neues passwort' });
    expect(reset.status).toBe(200);
    expect((await anna.get('/me')).status).toBe(401);
    expect((await app.get('/me')).status).toBe(401);
    expect(
      (
        await env
          .client({ ip: '203.0.113.173' })
          .post('/auth/login', { email: 'anna@example.org', password: PASSWORD })
      ).status,
    ).toBe(401);
    expect(
      (
        await env
          .client({ ip: '203.0.113.174' })
          .login('anna@example.org', 'ein ganz neues passwort')
      ).status,
    ).toBe(200);

    expect(
      (
        await env
          .client({ ip: '203.0.113.175' })
          .post('/auth/reset-password', { token, newPassword: 'noch ein passwort 123' })
      ).status,
    ).toBe(400);
    await env.ctx.idle();
    expect(env.mailer.sent.some((m) => m.subject.includes('geändert'))).toBe(true);
  });

  it('Reset-Link verfällt nach 30 Minuten', async () => {
    const env = createTestEnv({ mail: true });
    await verifiedFounder(env);
    await env
      .client({ ip: '203.0.113.180' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    await env.ctx.idle();
    const { token } = linkOf(env.mailer.sent[0]!.text, 'reset');
    env.clock.advance(31 * MINUTE);
    const res = await env
      .client({ ip: '203.0.113.181' })
      .post('/auth/reset-password', { token, newPassword: 'ein ganz neues passwort' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('ein neuer Reset-Link macht den älteren ungültig', async () => {
    const env = createTestEnv({ mail: true });
    await verifiedFounder(env);
    await env
      .client({ ip: '203.0.113.182' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    await env.ctx.idle();
    await env
      .client({ ip: '203.0.113.183' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    await env.ctx.idle();
    const [older, newer] = env.mailer.sent.map((m) => linkOf(m.text, 'reset').token!);
    const c = env.client({ ip: '203.0.113.184' });
    expect(
      (
        await c.post('/auth/reset-password', {
          token: older,
          newPassword: 'ein ganz neues passwort',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post('/auth/reset-password', {
          token: newer,
          newPassword: 'ein ganz neues passwort',
        })
      ).status,
    ).toBe(200);
  });

  it('Links verwenden immer PUBLIC_URL, nie den Host-Header (Host-Header-Poisoning)', async () => {
    const env = createTestEnv({ mail: true });
    await verifiedFounder(env);
    await env.app.request(
      'https://evil.example/api/v1/auth/forgot-password',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'evil.example',
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'http',
          origin: 'https://ds.test',
        },
        body: JSON.stringify({ email: 'anna@example.org' }),
      },
      { incoming: { socket: { remoteAddress: '203.0.113.190' } } },
    );
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(1);
    const text = env.mailer.sent[0]!.text;
    expect(text).toContain('https://ds.test/reset/');
    expect(text).not.toContain('evil.example');
  });

  it('begrenzt Anfragen pro Adresse (3/h) und pro IP (10/h)', async () => {
    const env = createTestEnv({ mail: true });
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await env
            .client({ ip: `198.51.100.${i + 1}` })
            .post('/auth/forgot-password', { email: 'anna@example.org' })
        ).status,
      ).toBe(202);
    }
    const fourth = await env
      .client({ ip: '198.51.100.50' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    expect(fourth.status).toBe(429);

    const same = env.client({ ip: '198.51.100.99' });
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await same.post('/auth/forgot-password', { email: `u${i}@example.org` })).status;
    expect(last).toBe(429);
  });

  it('Reset-Versuche sind pro IP begrenzt', async () => {
    const env = createTestEnv({ mail: true });
    const c = env.client({ ip: '198.51.100.120' });
    let last = 0;
    for (let i = 0; i < 21; i++)
      last = (
        await c.post('/auth/reset-password', {
          token: `x${i}`.padEnd(20, 'x'),
          newPassword: 'ein ganz neues passwort',
        })
      ).status;
    expect(last).toBe(429);
  });

  it('wiederholt fehlgeschlagene SMTP-Versuche und gibt dann auf, ohne Daten zu loggen', async () => {
    const env = createTestEnv({ mail: true });
    env.mailer.failNext = 1;
    await env.client().registerFounder();
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(1); // zweiter Versuch gelingt

    const env2 = createTestEnv({ mail: true });
    env2.mailer.failNext = 99;
    await env2.client().registerFounder();
    await env2.ctx.idle();
    expect(env2.mailer.sent).toHaveLength(0);
    const log = env2.logs.join('\n');
    expect(log).toContain('mail_send_failed');
    expect(log).not.toContain('anna@example.org');
  });
});

describe('Ohne SMTP', () => {
  it('Mail-Routen antworten mit 404, die Funktion wird nicht angeboten', async () => {
    const env = createTestEnv();
    const c = env.client();
    expect((await c.post('/auth/forgot-password', { email: 'a@b.de' })).status).toBe(404);
    expect((await c.post('/auth/verify-email', { token: 'x'.repeat(20) })).status).toBe(404);
    expect((await c.get('/health')).body.features.mail).toBe(false);
  });

  it('Reset per CLI-Token funktioniert trotzdem, wenn auch ohne Mail', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { createEmailToken } = await import('../src/modules/mail/tokens.js');
    const user = env.ctx.db.$client.prepare('SELECT id FROM users').get() as { id: string };
    const token = createEmailToken(env.ctx.db, env.clock.now(), user.id, 'reset');
    const res = await env
      .client({ ip: '203.0.113.210' })
      .post('/auth/reset-password', { token, newPassword: 'ein ganz neues passwort' });
    expect(res.status).toBe(200);
    expect((await anna.get('/me')).status).toBe(401);
    expect(
      (
        await env
          .client({ ip: '203.0.113.211' })
          .login('anna@example.org', 'ein ganz neues passwort')
      ).status,
    ).toBe(200);
  });
});

describe('E-Mail-Adresse ändern', () => {
  it('mit SMTP: erst nach Klick auf den Link an der neuen Adresse wirksam, alte Adresse wird informiert', async () => {
    const env = createTestEnv({ mail: true });
    const anna = await verifiedFounder(env);
    const res = await anna.post('/me/email', { newEmail: 'Neu@Example.org', password: PASSWORD });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('verification_sent');
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(1);
    expect(env.mailer.sent[0]!.to).toBe('neu@example.org');
    expect((await anna.get('/me')).body.user.email).toBe('anna@example.org');

    const { token } = linkOf(env.mailer.sent[0]!.text, 'verify');
    const confirm = await env.client({ ip: '203.0.113.220' }).post('/auth/verify-email', { token });
    expect(confirm.body.kind).toBe('email_change');
    await env.ctx.idle();
    expect(
      env.mailer.sent.some((m) => m.to === 'anna@example.org' && m.subject.includes('geändert')),
    ).toBe(true);
    const me = (await anna.get('/me')).body.user;
    expect(me).toMatchObject({ email: 'neu@example.org', emailVerified: true });
    expect((await env.client({ ip: '203.0.113.221' }).login('neu@example.org')).status).toBe(200);
  });

  it('verlangt das Passwort', async () => {
    const env = createTestEnv({ mail: true });
    const anna = await verifiedFounder(env);
    const res = await anna.post('/me/email', {
      newEmail: 'neu@example.org',
      password: 'falsch-falsch',
    });
    expect(res.status).toBe(403);
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(0);
  });

  it('antwortet bei bereits vergebener Adresse neutral und sendet nichts (keine Enumeration)', async () => {
    const env = createTestEnv({ mail: true });
    const anna = await verifiedFounder(env);
    await env.client({ ip: '203.0.113.230' }).registerFounder('carla@example.org', 'Carla');
    await env.ctx.idle();
    env.mailer.sent.length = 0;
    const res = await anna.post('/me/email', { newEmail: 'carla@example.org', password: PASSWORD });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('verification_sent');
    await env.ctx.idle();
    expect(env.mailer.sent).toHaveLength(0);
  });

  it('ohne SMTP: sofortige Änderung, Konflikt bei vergebener Adresse', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await env.client({ ip: '203.0.113.231' }).registerFounder('carla@example.org', 'Carla');
    expect(
      (await anna.post('/me/email', { newEmail: 'carla@example.org', password: PASSWORD })).status,
    ).toBe(409);
    const ok = await anna.post('/me/email', { newEmail: 'anna2@example.org', password: PASSWORD });
    expect(ok.body.status).toBe('changed');
    expect((await anna.get('/me')).body.user.email).toBe('anna2@example.org');
  });
});

describe('Hygiene', () => {
  it('Tokens und Adressen tauchen nie im Log auf; Tokens liegen nur als Hash in der DB', async () => {
    const env = createTestEnv({ mail: true });
    await verifiedFounder(env);
    await env
      .client({ ip: '203.0.113.240' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    await env.ctx.idle();
    const { token } = linkOf(env.mailer.sent[0]!.text, 'reset');
    await env
      .client({ ip: '203.0.113.241' })
      .post('/auth/reset-password', { token, newPassword: 'ein ganz neues passwort' });
    await env.ctx.idle();

    const log = env.logs.join('\n');
    expect(log).not.toContain(token!);
    expect(log).not.toContain('anna@example.org');
    expect(log).not.toContain('ein ganz neues passwort');
    expect(log).not.toContain(SETUP_TOKEN);
    expect(
      JSON.stringify(env.ctx.db.$client.prepare('SELECT * FROM email_tokens').all()),
    ).not.toContain(token!);
    const keys = JSON.stringify(env.ctx.db.$client.prepare('SELECT key FROM rate_limits').all());
    expect(keys).not.toContain('anna@example.org');
  });

  it('räumt abgelaufene Daten auf, ohne gültige anzutasten', async () => {
    const { runHousekeeping } = await import('../src/jobs/housekeeping.js');
    const env = createTestEnv({ mail: true });
    const anna = await verifiedFounder(env);
    await env
      .client({ ip: '203.0.113.250' })
      .post('/auth/forgot-password', { email: 'anna@example.org' });
    env.clock.advance(2 * DAY);
    runHousekeeping(env.ctx);
    const left = env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM email_tokens').get() as {
      n: number;
    };
    expect(left.n).toBe(0);
    expect((await anna.get('/me')).status).toBe(200); // Session ist noch gültig
  });
});

describe('SMTP-Transport (Fake-Server)', () => {
  let server: SMTPServer | undefined;
  afterEach(
    () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
  );

  it('liefert Mails über echtes SMTP an einen lokalen Server', async () => {
    const received: string[] = [];
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, callback) {
        let data = '';
        stream.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        stream.on('end', () => {
          received.push(data);
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.server.address() as { port: number };

    const config = loadConfig({
      PUBLIC_URL: 'https://ds.test',
      SIGNUP_MODE: 'invite-only',
      SMTP_URL: `smtp://127.0.0.1:${port}`,
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'Double Sweat <ds@example.org>',
    });
    const mailer = createMailer(config);
    expect(mailer.enabled).toBe(true);
    await mailer.send({ to: 'anna@example.org', subject: 'Betreff', text: 'Hallo Welt' });
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('Subject: Betreff');
    expect(received[0]).toContain('To: anna@example.org');
    expect(received[0]).toContain('Hallo Welt');
    expect(received[0]).not.toMatch(/<img|http-equiv/i);
  });
});
