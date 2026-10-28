import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { mountWeb } from '../src/http/static.js';

function webApp() {
  const root = mkdtempSync(join(tmpdir(), 'ds-web-'));
  mkdirSync(join(root, '_app', 'immutable'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>SPA</title>');
  writeFileSync(join(root, 'manifest.webmanifest'), '{}');
  writeFileSync(join(root, '_app', 'immutable', 'app.abc123.js'), 'console.log(1)');
  writeFileSync(join(root, '..', `${root.split('/').pop()}-secret.txt`), 'geheim');
  const app = new Hono();
  app.get('/api/v1/ping', (c) => c.json({ pong: true }));
  mountWeb(app, root);
  return { app, root };
}

describe('Statische Web-Auslieferung', () => {
  it('liefert index.html für die Wurzel und unbekannte Seitenpfade (SPA-Fallback)', async () => {
    const { app } = webApp();
    for (const path of ['/', '/join/ABCD-EFGH-JKMN-PQRS', '/history']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain('<title>SPA</title>');
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
    }
  });

  it('liefert Assets mit passendem Typ, gehashte Dateien dauerhaft cachebar', async () => {
    const { app } = webApp();
    const js = await app.request('/_app/immutable/app.abc123.js');
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await app.request('/manifest.webmanifest')).headers.get('content-type')).toBe(
      'application/manifest+json',
    );
  });

  it('antwortet für fehlende Dateien mit Endung mit 404 statt mit index.html', async () => {
    const { app } = webApp();
    expect((await app.request('/fehlt.js')).status).toBe(404);
  });

  it('kommt API-Routen nicht in die Quere und bedient /api/ nie', async () => {
    const { app } = webApp();
    expect(await (await app.request('/api/v1/ping')).json()).toEqual({ pong: true });
    expect((await app.request('/api/v1/gibt-es-nicht')).status).toBe(404);
  });

  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2f..%2fetc/passwd',
    '/_app/../../secret.txt',
    '/%00',
  ])('verhindert Path-Traversal: %s', async (path) => {
    const { app } = webApp();
    const res = await app.request(path);
    const body = await res.text();
    expect(body).not.toContain('geheim');
    expect(body).not.toContain('root:');
  });
});
