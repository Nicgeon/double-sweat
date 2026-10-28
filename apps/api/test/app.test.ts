import { describe, expect, it } from 'vitest';
import { createTestEnv, PUBLIC_URL } from './helpers.js';

describe('System', () => {
  it('Health ist öffentlich und beschreibt den Server', async () => {
    const env = createTestEnv();
    const res = await env.client().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      app: 'double-sweat',
      version: '0.1.0',
      apiVersion: 1,
      minClientApi: 1,
      signup: { mode: 'token', requiresSetupToken: true },
      features: { mail: false },
    });
  });

  it('Health verrät keine Interna (keine Pfade, keine Zähler)', async () => {
    const env = createTestEnv();
    const text = JSON.stringify((await env.client().get('/health')).body);
    expect(text).not.toMatch(/data|sqlite|users|path/i);
  });

  it('liefert eine OpenAPI-Spec mit Auth-Schemata und den Kernrouten', async () => {
    const env = createTestEnv();
    const res = await env.client().get('/openapi.json');
    expect(res.status).toBe(200);
    const doc = res.body as {
      openapi: string;
      paths: Record<string, Record<string, { security?: unknown[] }>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.0.3');
    expect(Object.keys(doc.components.securitySchemes)).toEqual(
      expect.arrayContaining(['cookieAuth', 'bearerAuth']),
    );
    for (const path of [
      '/api/v1/health',
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/token',
      '/api/v1/auth/refresh',
      '/api/v1/auth/reset-password',
      '/api/v1/me',
      '/api/v1/team',
      '/api/v1/teams/invites',
      '/api/v1/invites/{code}',
    ]) {
      expect(doc.paths[path], path).toBeDefined();
    }
    expect(doc.paths['/api/v1/me']?.get?.security).toBeDefined();
    expect(doc.paths['/api/v1/health']?.get?.security).toBeUndefined();
  });

  it('setzt Sicherheits-Header auf API-Antworten', async () => {
    const env = createTestEnv();
    const { headers } = await env.client().get('/health');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('permissions-policy')).toContain('camera=(self)');
    expect(headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('sendet kein HSTS bei http://localhost', async () => {
    const env = createTestEnv({ env: { PUBLIC_URL: 'http://localhost:3000' } });
    const { headers } = await env.client().get('/health');
    expect(headers.get('strict-transport-security')).toBeNull();
  });

  it('antwortet auf unbekannte Pfade mit JSON-404', async () => {
    const env = createTestEnv();
    const res = await env.client().get('/gibt-es-nicht');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Nicht gefunden' } });
  });

  it('liefert strukturierte Validierungsfehler', async () => {
    const env = createTestEnv();
    const res = await env.client().post('/auth/login', { email: 'kein-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['email']),
    );
  });

  it('weist kaputtes JSON mit 400 ab', async () => {
    const env = createTestEnv();
    const res = await env.app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
      body: '{kaputt',
    });
    expect(res.status).toBe(400);
  });

  it('begrenzt die Größe von JSON-Anfragen', async () => {
    const env = createTestEnv();
    const res = await env
      .client()
      .post('/auth/login', { email: 'a@b.de', password: 'x'.repeat(100_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('loggt Routen-Vorlagen statt echter Pfade (keine Codes im Log)', async () => {
    const env = createTestEnv();
    await env.client().get('/invites/ABCD-EFGH-JKMN-PQRS');
    const log = env.logs.join('\n');
    expect(log).toContain('/api/v1/invites/:code');
    expect(log).not.toContain('ABCD-EFGH');
  });
});

describe('CORS', () => {
  it('erlaubt die konfigurierte App-Origin ohne Credentials', async () => {
    const env = createTestEnv();
    const res = await env.app.request('/api/v1/auth/token', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
  });

  it('erlaubt fremde Origins nicht', async () => {
    const env = createTestEnv();
    const res = await env.app.request('/api/v1/health', {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
