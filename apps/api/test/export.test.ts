import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { createEmailToken } from '../src/modules/mail/tokens.js';
import { DAY } from '../src/util/time.js';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createCouple, createTestEnv, PASSWORD, type TestClient } from './helpers.js';
import { newDevice, pushEnv, startPushServer } from './push-helpers.js';
import { afterWeek, checkinDays, noon, pair, W1 } from './scenario.js';

const request = (c: TestClient, password = PASSWORD) => c.post('/me/export', { password });
const download = (env: { client: () => TestClient }, url: string) => env.client().get(url);
const open = (zip: unknown) => unzipSync(new Uint8Array(zip as Buffer));
const json = (files: Record<string, Uint8Array>) =>
  JSON.parse(strFromU8(files['data.json'] as Uint8Array));

describe('Datenexport', () => {
  it('verlangt Anmeldung und das richtige Passwort', async () => {
    const env = createTestEnv();
    expect((await request(env.client())).status).toBe(401);
    const { anna } = await createCouple(env);
    const wrong = await request(anna, 'falsch-falsch');
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('invalid_password');
    expect(JSON.stringify(wrong.body)).not.toMatch(/token|downloadUrl/);
  });

  it('liefert nach Passwortprüfung ein Einmal-Token, 60 Sekunden gültig', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const res = await request(anna);
    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(env.clock.now() + 60_000);
    expect(res.body.downloadUrl).toBe(`/api/v1/me/export/${res.body.token}`);
    const stored = JSON.stringify(env.ctx.db.$client.prepare('SELECT * FROM email_tokens').all());
    expect(stored).not.toContain(res.body.token); // nur als Hash gespeichert
  });

  it('der Download funktioniert ohne Sitzung (Token ist die Berechtigung) und ist einmalig', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { downloadUrl } = (await request(anna)).body;
    const res = await download(env, downloadUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="double-sweat-export-2026-03-02.zip"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(open(res.body))).toEqual(['data.json']);
    expect((await download(env, downloadUrl)).status).toBe(404); // zweiter Versuch
  });

  it('das Token verfällt nach 60 Sekunden', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { downloadUrl } = (await request(anna)).body;
    env.clock.advance(61_000);
    expect((await download(env, downloadUrl)).status).toBe(404);
  });

  it('andere Token-Arten und erfundene Token öffnen keinen Export', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const userId = (await anna.get('/me')).body.user.id as string;
    const reset = createEmailToken(env.ctx.db, env.clock.now(), userId, 'reset');
    const verify = createEmailToken(env.ctx.db, env.clock.now(), userId, 'verify');
    for (const token of [reset, verify, 'x'.repeat(43)]) {
      expect((await download(env, `/me/export/${token}`)).status, token).toBe(404);
    }
    expect((await download(env, '/me/export/zu-kurz')).status).toBe(400); // schon die Eingabeprüfung lehnt ab
  });

  it('enthält die eigenen Daten und Fotos, unverändert und ohne Metadaten', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 2, benGoal: 2 });
    await checkinDays(env, anna, W1, 2);
    await checkinDays(env, ben, W1, 1);
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();

    const { downloadUrl } = (await request(anna)).body;
    const files = open((await download(env, downloadUrl)).body);
    const data = json(files);
    expect(data).toMatchObject({
      app: 'double-sweat',
      formatVersion: 1,
      profile: { displayName: 'Anna', email: 'anna@example.org', timezone: 'Europe/Berlin' },
      team: { name: 'Unser Team', partnerDisplayName: 'Ben' },
    });
    // Das erste Ziel gilt sofort, also ab der Beitrittswoche (Mo 2.3.), nicht erst ab W1
    expect(data.goals).toEqual([{ effectiveFrom: '2026-03-02', days: 2 }]);
    expect(data.weekResults).toEqual([{ weekStart: W1, goalDays: 2, doneDays: 2, met: true }]);
    // Der erste Einsatz gilt sofort, ebenfalls ab der Beitrittswoche
    expect(data.bets).toEqual([{ effectiveFrom: '2026-03-02', text: 'Der Verlierer kocht' }]);
    expect(data.debts).toEqual([
      expect.objectContaining({
        weekStart: W1,
        direction: 'owed',
        otherPerson: 'Ben',
        betText: 'Der Verlierer kocht',
      }),
    ]);
    // Beim Setzen des Einsatzes bekommen beide eine Mitteilung vom anderen (bet_set), dazu kommt die Schuld
    expect(data.notifications.map((n: { type: string }) => n.type)).toEqual(
      expect.arrayContaining(['bet_set', 'debt_created']),
    );

    // Genau die Fotos von Anna, byte-identisch zu den gespeicherten Dateien
    expect(data.checkins).toHaveLength(2);
    const names = Object.keys(files).filter((n) => n.startsWith('photos/'));
    expect(names).toEqual(data.checkins.map((c: { photo: string }) => c.photo));
    for (const c of data.checkins as { id: string; photo: string; localDate: string }[]) {
      expect(c.photo).toBe(`photos/${c.localDate}_${c.id}.jpg`);
      const row = env.ctx.db.$client
        .prepare('SELECT photo_key FROM checkins WHERE id = ?')
        .get(c.id) as { photo_key: string };
      const onDisk = readFileSync(join(env.config.photosDir, row.photo_key));
      expect(Buffer.from(files[c.photo] as Uint8Array).equals(onDisk)).toBe(true);
      const meta = await sharp(onDisk).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.exif).toBeUndefined();
    }
  });

  it('enthält nichts vom Partner außer dessen Anzeigename und keine Zugangsdaten', async () => {
    const { env, anna, ben } = await pair();
    await checkinDays(env, anna, W1, 1);
    env.clock.set(noon(W1));
    await ben.get('/me');
    const bensNote = 'GEHEIME-NOTIZ-VON-BEN';
    expect(
      (await ben.upload('/checkins', photoForm(await noisyJpeg(), { note: bensNote }))).status,
    ).toBe(201);
    const bensPhoto = (
      env.ctx.db.$client.prepare('SELECT id FROM checkins WHERE note = ?').get(bensNote) as {
        id: string;
      }
    ).id;
    await anna.get('/me');
    const { downloadUrl } = (await request(anna)).body;
    const files = open((await download(env, downloadUrl)).body);
    const everything = Object.entries(files)
      .filter(([name]) => !name.startsWith('photos/'))
      .map(([, bytes]) => strFromU8(bytes))
      .join('\n');
    expect(everything).not.toContain('ben@example.org');
    expect(everything).not.toContain(bensNote);
    expect(everything).not.toContain(bensPhoto);
    expect(everything).not.toMatch(
      /argon2|passwordHash|password_hash|tokenHash|photoSha|sha256|p256dh|endpoint/i,
    );
    expect(Object.keys(files).filter((n) => n.startsWith('photos/'))).toHaveLength(1);
  });

  it('listet Push-Geräte ohne Endpunkt und Schlüssel', async () => {
    const server = await startPushServer();
    try {
      const env = pushEnv();
      const { anna } = await createCouple(env);
      const device = newDevice(`${server.base}/sehr-geheimer-endpunkt`);
      await anna.post('/push/subscriptions', {
        provider: 'webpush',
        endpoint: device.endpoint,
        keys: device.keys,
        deviceLabel: 'Pixel 8',
      });
      const { downloadUrl } = (await request(anna)).body;
      const text = strFromU8(
        open((await download(env, downloadUrl)).body)['data.json'] as Uint8Array,
      );
      expect(JSON.parse(text).pushDevices).toEqual([
        expect.objectContaining({ provider: 'webpush', deviceLabel: 'Pixel 8' }),
      ]);
      expect(text).not.toContain('sehr-geheimer-endpunkt');
      expect(text).not.toContain(device.keys.auth);
    } finally {
      await server.close();
    }
  });

  it('funktioniert auch ohne Team', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    const { downloadUrl } = (await request(anna)).body;
    const data = json(open((await download(env, downloadUrl)).body));
    expect(data.team).toBeNull();
    expect(data.checkins).toEqual([]);
  });

  it('überspringt fehlende Fotodateien statt abzubrechen', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const row = env.ctx.db.$client.prepare('SELECT photo_key FROM checkins').get() as {
      photo_key: string;
    };
    await env.ctx.photos.remove([row.photo_key]);
    const { downloadUrl } = (await request(anna)).body;
    const res = await download(env, downloadUrl);
    expect(res.status).toBe(200);
    expect(Object.keys(open(res.body))).toEqual(['data.json']);
  });

  it('exportiert viele Fotos als gültiges Archiv', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    for (let i = 0; i < 25; i++) {
      expect((await anna.upload('/checkins', photoForm(await noisyJpeg(480, 360)))).status).toBe(
        201,
      );
      env.clock.advance(DAY);
    }
    const { downloadUrl } = (await request(anna)).body;
    const res = await download(env, downloadUrl);
    const files = open(res.body);
    expect(Object.keys(files).filter((n) => n.startsWith('photos/'))).toHaveLength(25);
    expect((res.body as Buffer).length).toBeGreaterThan(25 * 20_000);
    for (const [name, bytes] of Object.entries(files)) {
      if (name.startsWith('photos/'))
        expect((await sharp(Buffer.from(bytes)).metadata()).format).toBe('jpeg');
    }
  });

  it('begrenzt Anfragen auf drei pro Stunde', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    for (let i = 0; i < 3; i++) expect((await request(anna)).status).toBe(201);
    expect((await request(anna)).status).toBe(429);
  });

  it('das Token taucht nicht im Log auf', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { token, downloadUrl } = (await request(anna)).body;
    await download(env, downloadUrl);
    expect(env.logs.join('\n')).not.toContain(token);
    expect(env.logs.join('\n')).toContain('/api/v1/me/export/:token');
  });
});
