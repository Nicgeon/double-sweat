import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { weekEndInstant } from '../src/domain/weeks.js';
import { createPhotoSweeper } from '../src/jobs/photo-sweeper.js';
import { MAX_CHECKINS_PER_DAY } from '../src/modules/checkins/service.js';
import { DAY, HOUR } from '../src/util/time.js';
import {
  jpegWithExif,
  MARKERS,
  noisyJpeg,
  photoForm,
  pixelBombPng,
  pngImage,
  webpImage,
} from './fixtures.js';
import { createCouple, createTestEnv, PASSWORD, type TestEnv } from './helpers.js';

const photosDir = (env: TestEnv) => env.config.photosDir;
const countFiles = (env: TestEnv) =>
  (env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM checkins').get() as { n: number }).n * 2;

describe('Check-in', () => {
  it('legt einen Check-in mit Foto, Notiz und Tag an', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const res = await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { note: ' Beine-Tag ', tag: 'kraft' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.checkin).toMatchObject({
      displayName: 'Anna',
      localDate: '2026-03-02',
      weekStart: '2026-03-02',
      tag: 'kraft',
      note: 'Beine-Tag',
    });
    expect(res.body.checkin.photo.thumbUrl).toBe(`/api/v1/photos/${res.body.checkin.id}/thumb`);
    expect(res.body.checkin.userId).toBeTruthy();
  });

  it('Notiz und Tag sind optional', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const res = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect(res.status).toBe(201);
    expect(res.body.checkin).toMatchObject({ note: null, tag: null });
  });

  it('erlaubt mehrere Check-ins pro Tag bis zum Limit; der Tag zählt für das Ziel nur einmal', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    for (let i = 0; i < MAX_CHECKINS_PER_DAY; i++) {
      expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
    }
    const sixth = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('daily_limit');
    expect(countFiles(env)).toBe(MAX_CHECKINS_PER_DAY * 2); // der abgelehnte Upload hinterlässt keine Dateien

    const me = (await anna.get('/dashboard')).body.members.find((m: { isMe: boolean }) => m.isMe);
    expect(me).toMatchObject({
      doneDays: 1,
      checkinsToday: MAX_CHECKINS_PER_DAY,
      checkedInToday: true,
    });

    env.clock.advance(DAY);
    expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
  });

  it('gleichzeitige Uploads am selben Tag: das Limit hält, keine Datei bleibt übrig', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const forms = await Promise.all(
      Array.from({ length: MAX_CHECKINS_PER_DAY + 2 }, async () => photoForm(await noisyJpeg())),
    );
    const results = await Promise.all(forms.map((f) => anna.upload('/checkins', f)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_CHECKINS_PER_DAY);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(countFiles(env)).toBe(MAX_CHECKINS_PER_DAY * 2);
  });

  it('dasselbe Foto lässt sich auch am selben Tag nicht noch einmal verwenden', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const jpeg = await noisyJpeg();
    expect((await anna.upload('/checkins', photoForm(jpeg))).status).toBe(201);
    const again = await anna.upload('/checkins', photoForm(jpeg));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('duplicate_photo');
  });

  it('bestimmt den Tag allein aus Serverzeit und Zeitzone, nicht aus Clientangaben', async () => {
    const env = createTestEnv();
    const anna = env.client({ ip: '203.0.113.31' });
    const ben = env.client({ ip: '203.0.113.32' });
    await anna.registerFounder('anna@example.org', 'Anna', 'America/Los_Angeles');
    const invite = (await anna.post('/teams/invites')).body.code;
    await ben.registerWithInvite(invite, 'ben@example.org', 'Ben', 'Pacific/Auckland');
    env.clock.set(Date.parse('2026-03-02T20:00:00Z')); // Mo 12:00 in LA, Di 09:00 in Auckland
    const a = await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { localDate: '1999-01-01', createdAt: '1' }),
    );
    const b = await ben.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { localDate: '1999-01-01' }),
    );
    expect(a.body.checkin.localDate).toBe('2026-03-02');
    expect(b.body.checkin.localDate).toBe('2026-03-03');
    expect(b.body.checkin.weekStart).toBe('2026-03-02');
  });

  it('braucht ein Team und eine Anmeldung', async () => {
    const env = createTestEnv();
    expect((await env.client().upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(401);
    const anna = env.client();
    await anna.registerFounder();
    await anna.delete('/team', { password: PASSWORD });
    const res = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('no_team');
  });

  it('lehnt zu lange Notizen, unbekannte Tags und fehlende Fotos ab', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const jpeg = await noisyJpeg();
    expect(
      (await anna.upload('/checkins', photoForm(jpeg, { note: 'x'.repeat(281) }))).status,
    ).toBe(400);
    expect((await anna.upload('/checkins', photoForm(jpeg, { tag: '<script>' }))).status).toBe(400);
    expect((await anna.upload('/checkins', new FormData())).status).toBe(400);
    expect(countFiles(env)).toBe(0);
  });

  it('begrenzt Uploads pro Nutzer und Stunde', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const bad = photoForm(Buffer.from('kein bild'), {}, 'x.jpg');
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await anna.upload('/checkins', bad)).status;
    expect(last).toBe(429);
  });
});

describe('Foto-Verarbeitung', () => {
  it('entfernt EXIF/GPS und wendet die Orientierung an', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const original = await jpegWithExif(200, 100);
    // Das Original enthält die Marker tatsächlich (sonst wäre der Test wertlos)
    expect(original.includes(Buffer.from(MARKERS.description))).toBe(true);
    expect(original.includes(Buffer.from(MARKERS.copyright))).toBe(true);
    expect((await sharp(original).metadata()).orientation).toBe(6);

    const { body } = await anna.upload('/checkins', photoForm(original));
    const full = (await anna.get(body.checkin.photo.fullUrl)).body as Buffer;
    const thumb = (await anna.get(body.checkin.photo.thumbUrl)).body as Buffer;
    for (const image of [full, thumb]) {
      expect(image.includes(Buffer.from(MARKERS.description))).toBe(false);
      expect(image.includes(Buffer.from(MARKERS.copyright))).toBe(false);
      expect(image.includes(Buffer.from('Exif'))).toBe(false);
      const meta = await sharp(image).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(meta.format).toBe('jpeg');
    }
    const meta = await sharp(full).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]); // 90° gedreht
    expect([body.checkin.photo.width, body.checkin.photo.height]).toEqual([100, 200]);
  });

  it('verkleinert große Bilder auf höchstens 1600 px und erzeugt ein Vorschaubild', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    const { body } = await anna.upload('/checkins', photoForm(big));
    const full = await sharp(
      (await anna.get(body.checkin.photo.fullUrl)).body as Buffer,
    ).metadata();
    const thumb = await sharp(
      (await anna.get(body.checkin.photo.thumbUrl)).body as Buffer,
    ).metadata();
    expect([full.width, full.height]).toEqual([1600, 1200]);
    expect([thumb.width, thumb.height]).toEqual([480, 360]);
  });

  it('vergrößert kleine Bilder nicht', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg(320, 240)));
    expect([body.checkin.photo.width, body.checkin.photo.height]).toEqual([320, 240]);
  });

  it('akzeptiert PNG und WebP und speichert immer JPEG', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const png = await anna.upload(
      '/checkins',
      photoForm(await pngImage(), {}, 'a.png', 'image/png'),
    );
    expect(png.status).toBe(201);
    env.clock.advance(DAY);
    const webp = await anna.upload(
      '/checkins',
      photoForm(await webpImage(), {}, 'a.webp', 'image/webp'),
    );
    expect(webp.status).toBe(201);
    const stored = (await anna.get(png.body.checkin.photo.fullUrl)).body as Buffer;
    expect((await sharp(stored).metadata()).format).toBe('jpeg');
  });

  it('prüft das Format an den Bytes, nicht am Dateinamen oder Content-Type', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const cases: [string, Buffer][] = [
      ['Text als image/jpeg', Buffer.from('Das ist kein Bild.')],
      ['HTML als image/jpeg', Buffer.from('<html><script>alert(1)</script></html>')],
      [
        'SVG',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ],
      ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary')],
      ['PDF', Buffer.from('%PDF-1.4\n%âãÏÓ\n')],
      ['leere Datei', Buffer.alloc(0)],
    ];
    for (const [name, data] of cases) {
      const res = await anna.upload('/checkins', photoForm(data, {}, 'foto.jpg', 'image/jpeg'));
      expect(res.status, name).toBeGreaterThanOrEqual(400);
      expect(res.status, name).toBeLessThan(500);
    }
    expect(countFiles(env)).toBe(0);
  });

  it('weist beschädigte Bilder ab', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const truncated = (await noisyJpeg()).subarray(0, 300);
    const res = await anna.upload('/checkins', photoForm(truncated));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_image');
  });

  it('weist Dekompressions-Bomben (zu viele Pixel) ab', async () => {
    const env = createTestEnv({ env: { MAX_UPLOAD_MB: '5' } });
    const anna = env.client();
    await anna.registerFounder();
    const bomb = await pixelBombPng();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024); // klein genug, um durch das Größenlimit zu kommen
    const res = await anna.upload('/checkins', photoForm(bomb, {}, 'b.png', 'image/png'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('image_too_large');
  }, 60_000);

  it('weist zu große Uploads mit 413 ab', async () => {
    const env = createTestEnv({ env: { MAX_UPLOAD_MB: '1' } });
    const anna = env.client();
    await anna.registerFounder();
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024)]);
    const res = await anna.upload('/checkins', photoForm(huge));
    expect(res.status).toBe(413);
  });

  it('lehnt dasselbe Foto im Team ein zweites Mal ab', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const photo = await noisyJpeg();
    expect((await anna.upload('/checkins', photoForm(photo))).status).toBe(201);
    const res = await ben.upload('/checkins', photoForm(photo));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('duplicate_photo');
    expect(countFiles(env)).toBe(2);
  });

  it('legt Dateien unter serverseitig vergebenen Namen ab, nie unter dem Clientnamen', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), {}, '../../etc/passwd.jpg'),
    );
    expect(body.checkin.id).toMatch(/^[0-9A-Z]{26}$/);
    const row = env.ctx.db.$client.prepare('SELECT photo_key, thumb_key FROM checkins').get() as {
      photo_key: string;
      thumb_key: string;
    };
    expect(row.photo_key).toMatch(/^[0-9A-Z]{26}\/2026-03\/[0-9A-Z]{26}\.jpg$/);
    expect(row.thumb_key).toMatch(/\.thumb\.jpg$/);
    expect(existsSync(join(photosDir(env), row.photo_key))).toBe(true);
    expect(JSON.stringify(row)).not.toContain('passwd');
  });
});

describe('Foto-Zugriff', () => {
  it('Teammitglieder sehen die Fotos des Partners, mit privaten Cache-Headern', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const res = await ben.get(body.checkin.photo.fullUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect((await sharp(res.body as Buffer).metadata()).format).toBe('jpeg');
    expect((await ben.get(body.checkin.photo.thumbUrl)).status).toBe(200);
  });

  it('ohne Anmeldung gibt es kein Foto', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect((await env.client({ ip: '203.0.113.40' }).get(body.checkin.photo.fullUrl)).status).toBe(
      401,
    );
  });

  it('fremde Teams bekommen 404 (kein Hinweis auf die Existenz)', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const carla = env.client({ ip: '203.0.113.41' });
    await carla.registerFounder('carla@example.org', 'Carla');
    const foreign = await carla.get(body.checkin.photo.fullUrl);
    const missing = await carla.get('/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV/full');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('Nutzer ohne Team sehen nichts', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    await ben.delete('/team', { password: PASSWORD });
    expect((await ben.get(body.checkin.photo.fullUrl)).status).toBe(404);
  });

  it('akzeptiert nur thumb und full als Variante und keine Pfadtricks', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    for (const variant of ['original', '..%2F..%2Fetc%2Fpasswd', 'full.jpg']) {
      const res = await anna.get(`/photos/${body.checkin.id}/${variant}`);
      expect([400, 404], variant).toContain(res.status);
    }
    const traversal = await anna.get('/photos/..%2F..%2Fetc/full');
    expect([400, 404]).toContain(traversal.status);
  });

  it('Bearer-Anmeldung (App) darf Fotos laden', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const app = env.client({ origin: 'https://localhost', ip: '203.0.113.42' });
    app.adopt(await app.post('/auth/token', { email: 'ben@example.org', password: PASSWORD }));
    expect((await app.get(body.checkin.photo.thumbUrl)).status).toBe(200);
  });
});

describe('Check-ins ansehen und zurücknehmen', () => {
  it('listet die Check-ins beider Partner für die Woche, neueste zuerst', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.upload('/checkins', photoForm(await noisyJpeg(), { tag: 'laufen' }));
    env.clock.advance(HOUR);
    await ben.upload('/checkins', photoForm(await noisyJpeg()));
    const res = await anna.get('/checkins');
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe('2026-03-02');
    expect(res.body.checkins.map((c: { displayName: string }) => c.displayName)).toEqual([
      'Ben',
      'Anna',
    ]);
  });

  it('listet eine frühere Woche über das Datum und prüft das Format', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    env.clock.advance(8 * DAY);
    expect((await anna.get('/checkins')).body.checkins).toHaveLength(0);
    const old = await anna.get('/checkins?week=2026-03-05'); // ein Donnerstag derselben Woche
    expect(old.body).toMatchObject({ weekStart: '2026-03-02' });
    expect(old.body.checkins).toHaveLength(1);
    expect((await anna.get('/checkins?week=gestern')).status).toBe(400);
    expect((await anna.get('/checkins?week=2026-02-30')).status).toBe(400);
  });

  it('der Feed zeigt nur Check-ins des eigenen Teams', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const carla = env.client({ ip: '203.0.113.50' });
    await carla.registerFounder('carla@example.org', 'Carla');
    await carla.upload('/checkins', photoForm(await noisyJpeg()));
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const names = (await anna.get('/checkins')).body.checkins.map(
      (c: { displayName: string }) => c.displayName,
    );
    expect(names).toEqual(['Anna']);
  });

  it('eigenen Check-in zurücknehmen löscht Zeile und Dateien und gibt den Tag frei', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const row = env.ctx.db.$client.prepare('SELECT photo_key FROM checkins').get() as {
      photo_key: string;
    };
    expect((await anna.delete(`/checkins/${body.checkin.id}`)).status).toBe(200);
    expect(existsSync(join(photosDir(env), row.photo_key))).toBe(false);
    expect((await anna.get(body.checkin.photo.fullUrl)).status).toBe(404);
    expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
  });

  it('fremde Check-ins lassen sich nicht löschen', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect((await ben.delete(`/checkins/${body.checkin.id}`)).status).toBe(404);
    expect((await ben.get(body.checkin.photo.fullUrl)).status).toBe(200);
  });

  it('nach Ende der Woche ist der Check-in unveränderlich', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin') - 1);
    expect((await anna.get('/me')).status).toBe(200);
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin'));
    const res = await anna.delete(`/checkins/${body.checkin.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('week_closed');
  });
});

describe('Check-in bearbeiten', () => {
  it('ändert Sportart und Notiz des eigenen Check-ins, Foto und Wertung bleiben', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { tag: 'laufen', note: 'Runde' }),
    );
    const id = body.checkin.id;
    // Ben reagiert; die Reaktion bleibt nach der Änderung erhalten
    expect((await ben.put(`/checkins/${id}/reaction`, { kind: 'flame' })).status).toBe(200);

    const res = await anna.patch(`/checkins/${id}`, {
      tag: 'rad',
      note: '  Mit dem Rad ins Büro ',
    });
    expect(res.status).toBe(200);
    expect(res.body.checkin).toMatchObject({
      id,
      displayName: 'Anna',
      tag: 'rad',
      note: 'Mit dem Rad ins Büro',
      localDate: body.checkin.localDate,
      createdAt: body.checkin.createdAt,
      photo: body.checkin.photo,
    });
    expect(res.body.checkin.reactions).toHaveLength(1);

    // Der Feed zeigt den neuen Stand, die Wertung der Woche ist dieselbe
    const feed = (await ben.get('/checkins')).body.checkins;
    expect(feed[0]).toMatchObject({ id, tag: 'rad', note: 'Mit dem Rad ins Büro' });
    const me = (await anna.get('/dashboard')).body.members.find((m: { isMe: boolean }) => m.isMe);
    expect(me).toMatchObject({ doneDays: 1, checkinsToday: 1 });
  });

  it('ein weggelassenes Feld bleibt, null und Leerraum entfernen den Wert', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { tag: 'yoga', note: 'Abends' }),
    );
    const id = body.checkin.id;
    expect((await anna.patch(`/checkins/${id}`, { tag: 'kraft' })).body.checkin).toMatchObject({
      tag: 'kraft',
      note: 'Abends',
    });
    expect((await anna.patch(`/checkins/${id}`, { note: '   ' })).body.checkin).toMatchObject({
      tag: 'kraft',
      note: null,
    });
    expect((await anna.patch(`/checkins/${id}`, { tag: null })).body.checkin).toMatchObject({
      tag: null,
      note: null,
    });
  });

  it('lehnt leere Änderungen, unbekannte Sportarten und zu lange Notizen ab', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg(), { tag: 'kraft' }));
    const id = body.checkin.id;
    const empty = await anna.patch(`/checkins/${id}`, {});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('nothing_to_change');
    expect((await anna.patch(`/checkins/${id}`, { tag: 'tennis' })).status).toBe(400);
    expect((await anna.patch(`/checkins/${id}`, { note: 'x'.repeat(281) })).status).toBe(400);
    // Nichts davon hat etwas verändert
    expect((await anna.get('/checkins')).body.checkins[0]).toMatchObject({ tag: 'kraft' });
  });

  it('fremde Check-ins, unbekannte IDs und Anfragen ohne Anmeldung werden abgewiesen', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg(), { tag: 'kraft' }));
    const id = body.checkin.id;
    expect((await ben.patch(`/checkins/${id}`, { tag: 'yoga' })).status).toBe(404);
    expect((await anna.patch('/checkins/gibtsnicht', { tag: 'yoga' })).status).toBe(404);
    expect((await env.client().patch(`/checkins/${id}`, { tag: 'yoga' })).status).toBe(401);
    expect((await anna.get('/checkins')).body.checkins[0]).toMatchObject({ tag: 'kraft' });
  });

  it('nach Ende der Woche ist auch die Beschriftung unveränderlich', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg(), { tag: 'kraft' }));
    const id = body.checkin.id;
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin') - 1);
    expect((await anna.patch(`/checkins/${id}`, { tag: 'cardio' })).status).toBe(200);
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin'));
    const res = await anna.patch(`/checkins/${id}`, { tag: 'yoga' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('week_closed');
  });

  it('löst keine neue Mitteilung an den Partner aus', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await anna.upload('/checkins', photoForm(await noisyJpeg(), { tag: 'kraft' }));
    const before = (await ben.get('/notifications')).body.notifications.length;
    await anna.patch(`/checkins/${body.checkin.id}`, { tag: 'rad' });
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(before);
  });
});

describe('Aufräumen', () => {
  it('Team auflösen löscht alle Fotodateien des Teams', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    await ben.upload('/checkins', photoForm(await noisyJpeg()));
    const keys = (
      env.ctx.db.$client.prepare('SELECT photo_key, thumb_key FROM checkins').all() as {
        photo_key: string;
        thumb_key: string;
      }[]
    ).flatMap((r) => [r.photo_key, r.thumb_key]);
    expect(keys.every((k) => existsSync(join(photosDir(env), k)))).toBe(true);
    await anna.delete('/team', { password: PASSWORD });
    expect(keys.some((k) => existsSync(join(photosDir(env), k)))).toBe(false);
    expect(countFiles(env)).toBe(0);
  });

  it('Konto löschen entfernt nur die eigenen Fotos', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const a = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const b = await ben.upload('/checkins', photoForm(await noisyJpeg()));
    const bensKey = (
      env.ctx.db.$client
        .prepare('SELECT photo_key FROM checkins WHERE id = ?')
        .get(b.body.checkin.id) as { photo_key: string }
    ).photo_key;
    const annasKey = (
      env.ctx.db.$client
        .prepare('SELECT photo_key FROM checkins WHERE id = ?')
        .get(a.body.checkin.id) as { photo_key: string }
    ).photo_key;
    await anna.delete('/me', { password: PASSWORD });
    expect(existsSync(join(photosDir(env), annasKey))).toBe(false);
    expect(existsSync(join(photosDir(env), bensKey))).toBe(true);
    expect((await ben.get(b.body.checkin.photo.fullUrl)).status).toBe(200);
  });

  it('entfernt verwaiste Dateien nach der Schonfrist, aber keine frischen oder bekannten', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const team = (
      env.ctx.db.$client.prepare('SELECT team_id FROM checkins').get() as { team_id: string }
    ).team_id;
    const dir = join(photosDir(env), team, '2026-03');
    mkdirSync(dir, { recursive: true });
    const stale = join(dir, '01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg');
    const fresh = join(dir, '01ARZ3NDEKTSV4RRFFQ69G5FAW.jpg');
    writeFileSync(stale, 'alt');
    writeFileSync(fresh, 'neu');
    const old = new Date(env.clock.now() - 3 * HOUR);
    utimesSync(stale, old, old);
    utimesSync(fresh, new Date(env.clock.now()), new Date(env.clock.now()));

    await createPhotoSweeper()(env.ctx);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(countFiles(env)).toBe(2);
    const known = env.ctx.db.$client.prepare('SELECT photo_key FROM checkins').get() as {
      photo_key: string;
    };
    expect(existsSync(join(photosDir(env), known.photo_key))).toBe(true);
  });
});
