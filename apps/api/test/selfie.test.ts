import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createPhotoSweeper } from '../src/jobs/photo-sweeper.js';
import { HOUR } from '../src/util/time.js';
import { jpegWithExif, MARKERS, noisyJpeg, photoForm, withSelfie } from './fixtures.js';
import { createCouple, createTestEnv, PASSWORD, type TestClient, type TestEnv } from './helpers.js';

/** Alle Dateien im Fotoverzeichnis (relativ). */
function filesOnDisk(env: TestEnv): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, rel ? `${rel}/${name}` : name);
      else out.push(rel ? `${rel}/${name}` : name);
    }
  };
  walk(env.config.photosDir, '');
  return out;
}

async function withSelfieCheckin(who: TestClient) {
  return (await who.upload(
    '/checkins',
    withSelfie(photoForm(await noisyJpeg(), { tag: 'kraft' }), await noisyJpeg(240, 320)),
  )) as { status: number; body: any };
}

describe('Selfie zum Check-in (optional)', () => {
  it('ohne Selfie ändert sich nichts: selfie ist null und es gibt keine Selfie-Datei', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const res = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect(res.status).toBe(201);
    expect(res.body.checkin.selfie).toBeNull();
    expect(filesOnDisk(env)).toHaveLength(2);
    expect((await anna.get(`/photos/${res.body.checkin.id}/selfie-full`)).status).toBe(404);
    expect((await anna.get(`/photos/${res.body.checkin.id}/selfie-thumb`)).status).toBe(404);
  });

  it('speichert Foto und Selfie, liefert beide aus und nennt Maße und Links', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const res = await withSelfieCheckin(anna);
    expect(res.status).toBe(201);
    const { id, selfie, photo } = res.body.checkin;
    expect(selfie).toEqual({
      thumbUrl: `/api/v1/photos/${id}/selfie-thumb`,
      fullUrl: `/api/v1/photos/${id}/selfie-full`,
      width: 240,
      height: 320,
    });
    expect(photo.width).toBe(320);
    expect(filesOnDisk(env)).toHaveLength(4);

    // Auch der Partner sieht das Selfie
    for (const url of [selfie.thumbUrl, selfie.fullUrl]) {
      const img = await ben.get(url);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/jpeg');
      expect(img.headers.get('cache-control')).toBe('private, max-age=3600');
      expect((await sharp(img.body as Buffer).metadata()).format).toBe('jpeg');
    }
    const thumb = await sharp((await ben.get(selfie.thumbUrl)).body as Buffer).metadata();
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(480);
  });

  it('entfernt EXIF/GPS auch aus dem Selfie und wendet die Orientierung an', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const form = withSelfie(photoForm(await noisyJpeg()), await jpegWithExif());
    const res = await anna.upload('/checkins', form);
    expect(res.status).toBe(201);
    const stored = (await anna.get(res.body.checkin.selfie.fullUrl)).body as Buffer;
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation ?? 1).toBe(1);
    // Das Original war 200x100 mit Orientierung 6 (90° gedreht): hochkant
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect(stored.includes(Buffer.from(MARKERS.description))).toBe(false);
    expect(stored.includes(Buffer.from(MARKERS.copyright))).toBe(false);
  });

  it('der Feed und die Wochenliste enthalten das Selfie', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    await withSelfieCheckin(anna);
    const list = (await anna.get('/checkins')).body.checkins;
    expect(list).toHaveLength(1);
    expect(list[0].selfie.thumbUrl).toMatch(/^\/api\/v1\/photos\/[0-9A-Z]{26}\/selfie-thumb$/);
    const feed = (await anna.get('/dashboard')).body.feed;
    expect(feed[0].selfie.fullUrl).toMatch(/selfie-full$/);
  });

  it('fremde Teams und Nutzer ohne Team bekommen 404, nicht angemeldete 401', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const { body } = await withSelfieCheckin(anna);
    const url = body.checkin.selfie.fullUrl;
    const carla = env.client({ ip: '203.0.113.60' });
    await carla.registerFounder('carla@example.org', 'Carla');
    expect((await carla.get(url)).status).toBe(404);
    expect((await env.client({ ip: '203.0.113.61' }).get(url)).status).toBe(401);
    await ben.delete('/team', { password: PASSWORD });
    expect((await ben.get(url)).status).toBe(404);
  });

  it('ein unbrauchbares Selfie lässt den ganzen Check-in scheitern, ohne Reste', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const bad = withSelfie(photoForm(await noisyJpeg()), Buffer.from('kein bild'), 's.jpg');
    const res = await anna.upload('/checkins', bad);
    expect(res.status).toBe(415);
    expect(filesOnDisk(env)).toHaveLength(0);
    const text = withSelfie(
      photoForm(await noisyJpeg()),
      Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]),
      's.jpg',
    );
    expect((await anna.upload('/checkins', text)).status).toBe(400);
    expect(filesOnDisk(env)).toHaveLength(0);
    expect((await anna.get('/checkins')).body.checkins).toEqual([]);
    // Danach klappt derselbe Check-in ohne Selfie
    expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
  });

  it('prüft die Größe je Bild: ein zu großes Selfie wird mit 413 abgewiesen', async () => {
    const env = createTestEnv({ env: { MAX_UPLOAD_MB: '1' } });
    const anna = env.client();
    await anna.registerFounder();
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1.5 * 1024 * 1024)]);
    const res = await anna.upload('/checkins', withSelfie(photoForm(await noisyJpeg()), huge));
    expect(res.status).toBe(413);
    expect(filesOnDisk(env)).toHaveLength(0);
  });

  it('lässt zwei Bilder zu, die zusammen größer als das Einzellimit sind', async () => {
    const env = createTestEnv({ env: { MAX_UPLOAD_MB: '1' } });
    const anna = env.client();
    await anna.registerFounder();
    // Zwei echte, unterschiedliche Bilder knapp unter dem Einzellimit
    const big = async () => {
      const buf = await noisyJpeg(900, 700);
      expect(buf.length).toBeLessThan(1024 * 1024);
      return buf;
    };
    const res = await anna.upload('/checkins', withSelfie(photoForm(await big()), await big()));
    expect(res.status).toBe(201);
  });

  it('Check-in zurücknehmen löscht auch die Selfie-Dateien', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await withSelfieCheckin(anna);
    expect(filesOnDisk(env)).toHaveLength(4);
    expect((await anna.delete(`/checkins/${body.checkin.id}`)).status).toBe(200);
    expect(filesOnDisk(env)).toHaveLength(0);
  });

  it('Team auflösen und Konto löschen entfernen auch die Selfies', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await withSelfieCheckin(anna);
    await withSelfieCheckin(ben);
    expect(filesOnDisk(env)).toHaveLength(8);
    await anna.delete('/me', { password: PASSWORD });
    expect(filesOnDisk(env)).toHaveLength(4); // nur Bens Dateien bleiben
    await ben.delete('/team', { password: PASSWORD });
    expect(filesOnDisk(env)).toHaveLength(0);
  });

  it('der Aufräumjob lässt Selfie-Dateien in Ruhe, entfernt aber verwaiste', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await withSelfieCheckin(anna);
    env.clock.advance(3 * HOUR);
    await createPhotoSweeper()(env.ctx);
    expect(filesOnDisk(env)).toHaveLength(4);
  });

  it('der Export enthält das Selfie neben dem Foto, byte-identisch', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const withOne = await withSelfieCheckin(anna);
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    const start = await anna.post('/me/export', { password: PASSWORD });
    expect(start.status).toBe(201);
    const zip = await anna.get(start.body.downloadUrl);
    expect(zip.status).toBe(200);
    const files = unzipSync(new Uint8Array(zip.body as Buffer));
    const data = JSON.parse(new TextDecoder().decode(files['data.json']));
    const entry = data.checkins.find((c: { id: string }) => c.id === withOne.body.checkin.id);
    expect(entry.selfie).toBe(`photos/${entry.localDate}_${entry.id}.selfie.jpg`);
    expect(data.checkins.filter((c: { selfie: string | null }) => c.selfie === null)).toHaveLength(
      1,
    );
    const row = env.ctx.db.$client
      .prepare('SELECT selfie_key FROM checkins WHERE id = ?')
      .get(entry.id) as { selfie_key: string };
    const onDisk = readFileSync(join(env.config.photosDir, row.selfie_key));
    expect(Buffer.from(files[entry.selfie] as Uint8Array).equals(onDisk)).toBe(true);
    expect(Object.keys(files).filter((n) => n.startsWith('photos/'))).toHaveLength(3);
  });

  it('Dateien liegen unter serverseitig vergebenen Namen', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const form = photoForm(await noisyJpeg(), {}, '../../evil.jpg');
    withSelfie(form, await noisyJpeg(), '../../../selfie-evil.jpg');
    const { status, body } = await anna.upload('/checkins', form);
    expect(status).toBe(201);
    const names = filesOnDisk(env).map((f) => f.split('/').pop());
    const id = body.checkin.id;
    expect(names.sort()).toEqual(
      [`${id}.jpg`, `${id}.thumb.jpg`, `${id}.selfie.jpg`, `${id}.selfie.thumb.jpg`].sort(),
    );
  });
});
