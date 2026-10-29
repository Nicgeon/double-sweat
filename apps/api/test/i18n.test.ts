import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizeError, translatedMessages } from '../src/i18n/errors.js';
import { localeFromAcceptLanguage } from '../src/i18n/locales.js';
import { NOTIFICATION_TYPES, renderNotification } from '../src/i18n/notifications.js';
import { createCouple, createTestEnv, PASSWORD, SETUP_TOKEN } from './helpers.js';

const EN = { 'accept-language': 'en-US,en;q=0.9' };

describe('Sprachwahl aus Accept-Language', () => {
  it.each([
    ['de-AT,de;q=0.9,en;q=0.8', 'de'],
    ['en-GB,en;q=0.9', 'en'],
    ['fr-FR,fr;q=0.9,en;q=0.5', 'en'],
    ['en;q=0.4, de;q=0.8', 'de'],
    ['en;q=0, de;q=0.1', 'de'],
    ['EN', 'en'],
    ['*', null],
    ['fr-FR,es', null],
    ['', null],
    ['en;q=abc, de', 'en'],
  ])('%j → %j', (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  it('ohne Header gibt es keine Wahl', () => {
    expect(localeFromAcceptLanguage(undefined)).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });

  it('ein riesiger Header wird abgeschnitten statt verarbeitet', () => {
    expect(localeFromAcceptLanguage(`${'x,'.repeat(5000)}en`)).toBeNull();
  });
});

describe('Konto-Sprache', () => {
  it('Standard ist Deutsch', async () => {
    const env = createTestEnv();
    const res = await env.client().registerFounder();
    expect(res.status).toBe(201);
    expect(res.body.user.locale).toBe('de');
  });

  it('DEFAULT_LOCALE legt die Standardsprache des Servers fest', async () => {
    const env = createTestEnv({ env: { DEFAULT_LOCALE: 'en' } });
    const res = await env.client().registerFounder();
    expect(res.body.user.locale).toBe('en');
  });

  it('Accept-Language des Registrierenden bestimmt die Sprache', async () => {
    const env = createTestEnv();
    const res = await env.client().post(
      '/auth/register',
      {
        email: 'anna@example.org',
        password: PASSWORD,
        displayName: 'Anna',
        timezone: 'Europe/Berlin',
        setupToken: SETUP_TOKEN,
      },
      EN,
    );
    expect(res.status).toBe(201);
    expect(res.body.user.locale).toBe('en');
  });

  it('ein ausdrücklich gewähltes locale hat Vorrang vor dem Header', async () => {
    const env = createTestEnv();
    const res = await env.client().post(
      '/auth/register',
      {
        email: 'anna@example.org',
        password: PASSWORD,
        displayName: 'Anna',
        timezone: 'Europe/Berlin',
        setupToken: SETUP_TOKEN,
        locale: 'de',
      },
      EN,
    );
    expect(res.body.user.locale).toBe('de');
  });

  it('PATCH /me ändert die Sprache, ungültige Werte werden abgelehnt', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const res = await anna.patch('/me', { locale: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.user.locale).toBe('en');
    expect((await anna.get('/me')).body.user.locale).toBe('en');
    expect((await anna.patch('/me', { locale: 'fr' })).status).toBe(400);
    expect((await anna.get('/me')).body.user.locale).toBe('en');
  });
});

describe('Mitteilungen in der Sprache des Empfängers', () => {
  it('jede Mitteilung hat in jeder Sprache einen Text', () => {
    for (const locale of ['de', 'en'] as const) {
      for (const type of NOTIFICATION_TYPES) {
        const { title, body } = renderNotification(locale, type, {
          name: 'Anna',
          other: 'Ben',
          missing: 2,
          kind: 'flame',
          role: type === 'reward_earned' ? 'recipient' : 'debtor',
          bet: 'Kaffee',
          reward: 'Kino',
        });
        expect(title).toBe('Double Sweat');
        expect(body.length).toBeGreaterThan(5);
        expect(body).not.toContain('undefined');
      }
    }
  });

  it('Anstupser: englischer Empfänger bekommt Englisch, deutscher Deutsch', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await ben.patch('/me', { locale: 'en' });
    await env.ctx.idle();

    expect((await anna.post('/nudges')).status).toBe(202);
    await env.ctx.idle();
    expect((await ben.get('/notifications')).body.notifications[0].body).toBe(
      'Anna is nudging you: time to work out!',
    );

    env.clock.advance(2 * 3_600_000);
    expect((await ben.post('/nudges')).status).toBe(202);
    await env.ctx.idle();
    expect((await anna.get('/notifications')).body.notifications[0].body).toBe(
      'Ben stupst dich an: Zeit fürs Training!',
    );
  });

  it('das Postfach wird beim Lesen in der aktuellen Sprache dargestellt', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.post('/nudges');
    await env.ctx.idle();
    expect((await ben.get('/notifications')).body.notifications[0].body).toBe(
      'Anna stupst dich an: Zeit fürs Training!',
    );
    await ben.patch('/me', { locale: 'en' });
    expect((await ben.get('/notifications')).body.notifications[0].body).toBe(
      'Anna is nudging you: time to work out!',
    );
    await ben.patch('/me', { locale: 'de' });
    expect((await ben.get('/notifications')).body.notifications[0].body).toBe(
      'Anna stupst dich an: Zeit fürs Training!',
    );
  });

  it('die Test-Mitteilung folgt der Sprache des Kontos', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.patch('/me', { locale: 'en' });
    await anna.post('/push/test');
    await env.ctx.idle();
    const [first] = (await anna.get('/notifications')).body.notifications;
    expect(first.type).toBe('test');
    expect(first.body).toMatch(/[Tt]est/);
    expect(first.body).not.toMatch(/Benachrichtigung/);
  });
});

describe('Mails in der Sprache des Kontos', () => {
  it('Bestätigungsmail auf Englisch', async () => {
    const env = createTestEnv({ mail: true });
    await env.client().post(
      '/auth/register',
      {
        email: 'anna@example.org',
        password: PASSWORD,
        displayName: 'Anna',
        timezone: 'Europe/Berlin',
        setupToken: SETUP_TOKEN,
        locale: 'en',
      },
      {},
    );
    await env.ctx.idle();
    const mail = env.mailer.sent[0]!;
    expect(mail.subject).toMatch(/confirm/i);
    expect(mail.text).toContain('Hi Anna');
    expect(mail.text).toMatch(/https:\/\/ds\.test\/verify\/[A-Za-z0-9_-]+/);
    expect(mail.text).not.toContain('Hallo');
  });

  it('Bestätigungsmail auf Deutsch (Standard)', async () => {
    const env = createTestEnv({ mail: true });
    await env.client().registerFounder();
    await env.ctx.idle();
    const mail = env.mailer.sent[0]!;
    expect(mail.subject).toContain('bestätigen');
    expect(mail.text).toContain('Hallo Anna');
  });

  it('Passwort-Reset-Mail folgt der Sprache des Kontos', async () => {
    const env = createTestEnv({ mail: true });
    const anna = env.client();
    await anna.registerFounder();
    await env.ctx.idle();
    const token = /verify\/([A-Za-z0-9_-]+)/.exec(env.mailer.sent[0]!.text)![1];
    await env.client({ ip: '203.0.113.150' }).post('/auth/verify-email', { token });
    await anna.patch('/me', { locale: 'en' });
    env.mailer.sent.length = 0;

    await env.client({ ip: '203.0.113.151' }).post('/auth/forgot-password', {
      email: 'anna@example.org',
    });
    await env.ctx.idle();
    const mail = env.mailer.sent[0]!;
    expect(mail.subject).toMatch(/reset/i);
    expect(mail.text).toContain('Hi Anna');
  });
});

describe('Fehlermeldungen', () => {
  it('Standard Deutsch, Code bleibt unabhängig von der Sprache', async () => {
    const env = createTestEnv();
    const res = await env
      .client()
      .post('/auth/login', { email: 'x@example.org', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-Mail oder Passwort ist falsch');
  });

  it('mit Accept-Language: en auf Englisch', async () => {
    const env = createTestEnv();
    const de = await env
      .client()
      .post('/auth/login', { email: 'x@example.org', password: PASSWORD });
    const en = await env
      .client({ ip: '203.0.113.99' })
      .post('/auth/login', { email: 'x@example.org', password: PASSWORD }, EN);
    expect(en.status).toBe(401);
    expect(en.body.error.message).toBe('Email or password is wrong');
    expect(en.body.error.code).toBe(de.body.error.code);
  });

  it('Eingabefehler, 404 und Anmeldepflicht sind übersetzt', async () => {
    const env = createTestEnv();
    const anon = env.client();
    expect((await anon.get('/me', EN)).body.error.message).toBe('Not signed in');
    expect((await anon.get('/me')).body.error.message).toBe('Nicht angemeldet');
    const invalid = await anon.post('/auth/login', { email: 'kein-mail' }, EN);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.message).toBe('Invalid input');
    const missing = await anon.get('/gibt-es-nicht', EN);
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('Not found');
  });

  it('eingesetzte Werte bleiben erhalten', () => {
    expect(localizeError('en', 'Du hast heute schon 5 Check-ins gemacht')).toBe(
      'You have already made 5 check-ins today',
    );
    expect(localizeError('de', 'Du hast heute schon 5 Check-ins gemacht')).toBe(
      'Du hast heute schon 5 Check-ins gemacht',
    );
    expect(localizeError('en', 'Push-Ziel nicht erlaubt: Nur https:// ist erlaubt')).toBe(
      'Push target not allowed: Only https:// is allowed',
    );
  });

  it('unbekannte Meldungen bleiben unverändert (nie ein leerer Text)', () => {
    expect(localizeError('en', 'Etwas ganz Neues')).toBe('Etwas ganz Neues');
  });

  it('ein Konto-Locale wirkt nicht auf die Fehlersprache (nur die Anfrage zählt)', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.patch('/me', { locale: 'en' });
    const res = await anna.post('/teams/join', { code: 'XXXX-XXXX-XXXX-XXXX' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error.message).not.toBe('');
  });
});

/** Alle Quelldateien unterhalb von src/, außer dem Übersetzungs-Katalog selbst. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('Abdeckung des Fehlerkatalogs', () => {
  const SRC = join(import.meta.dirname, '..', 'src');
  const messages = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    // badRequest('code', 'Text'), forbidden/conflict genauso (Text auch über Zeilen verteilt)
    for (const m of text.matchAll(
      /\b(?:badRequest|forbidden|conflict)\(\s*'[a-z_]+',\s*'((?:[^'\\]|\\.)+)'/g,
    ))
      messages.add(m[1]!);
    // notFound('Text'), unauthorized('Text'), tooManyRequests(sec, 'Text')
    for (const m of text.matchAll(/\b(?:notFound|unauthorized)\(\s*'((?:[^'\\]|\\.)+)'/g))
      messages.add(m[1]!);
    // Standardtexte in util/errors.ts
    for (const m of text.matchAll(/message = '((?:[^'\\]|\\.)+)'/g)) messages.add(m[1]!);
  }

  it('der Scan findet überhaupt Meldungen', () => {
    expect(messages.size).toBeGreaterThan(30);
  });

  it('jede im Code geworfene Meldung hat eine englische Fassung', () => {
    const known = new Set(translatedMessages('en'));
    const missing = [...messages]
      .map((m) => m.replace(/\\'/g, "'"))
      .filter((m) => !known.has(m) && localizeError('en', m) === m);
    expect(missing).toEqual([]);
  });

  it('der Katalog enthält keine Einträge ohne Verwendung im Code', () => {
    // Meldungen, die dynamisch zusammengesetzt oder aus Bibliotheken erzeugt werden
    const dynamic = new Set([
      'Ungültige Eingabe',
      'Anfrage zu groß',
      'Interner Fehler',
      'Nicht gefunden',
      'Anfrage von nicht erlaubtem Ursprung',
    ]);
    const sources = sourceFiles(SRC)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const unused = translatedMessages('en').filter((m) => !dynamic.has(m) && !sources.includes(m));
    expect(unused).toEqual([]);
  });
});
