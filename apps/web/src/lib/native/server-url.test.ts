import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinLinkFor, parseJoinLink } from './deeplink.ts';
import { normalizeServerUrl, probeServer, ServerError } from './server-url.ts';

describe('normalizeServerUrl', () => {
  it('ergänzt https und entfernt Pfad und Schrägstrich', () => {
    expect(normalizeServerUrl('sweat.example.org')).toBe('https://sweat.example.org');
    expect(normalizeServerUrl(' https://sweat.example.org/ ')).toBe('https://sweat.example.org');
    expect(normalizeServerUrl('https://sweat.example.org:8443/app?x=1#y')).toBe(
      'https://sweat.example.org:8443',
    );
  });

  it('lehnt unverschlüsseltes http ab, außer im Entwicklungsbuild', () => {
    expect(() => normalizeServerUrl('http://sweat.example.org', false)).toThrow(ServerError);
    expect(normalizeServerUrl('http://127.0.0.1:3000', true)).toBe('http://127.0.0.1:3000');
  });

  it.each([
    '',
    '   ',
    'ftp://sweat.example.org',
    'javascript:alert(1)',
    'https://user:pass@sweat.example.org',
    'https://',
    '://kaputt',
  ])('lehnt %j ab', (input) => {
    expect(() => normalizeServerUrl(input, false)).toThrow(ServerError);
  });

  it('erkennt Tarn-Adressen: Zugangsdaten vor dem eigentlichen Host', () => {
    expect(() => normalizeServerUrl('https://sweat.example.org@evil.example')).toThrow(
      /Zugangsdaten/,
    );
  });
});

describe('probeServer', () => {
  afterEach(() => vi.unstubAllGlobals());
  const health = (over: object = {}) => ({
    app: 'double-sweat',
    version: '0.1.0',
    apiVersion: 1,
    minClientApi: 1,
    signup: { mode: 'token', requiresSetupToken: true },
    features: { mail: false },
    ...over,
  });
  const stub = (res: Response | Error) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (res instanceof Error ? Promise.reject(res) : res)),
    );

  it('akzeptiert einen passenden Server', async () => {
    stub(Response.json(health()));
    await expect(probeServer('https://s.example')).resolves.toMatchObject({
      apiVersion: 1,
      signup: { mode: 'token' },
    });
  });

  it.each([
    ['fremder Dienst', Response.json({ app: 'anderes' }), 'not_double_sweat'],
    ['Webseite statt API', new Response('<html>', { status: 200 }), 'not_double_sweat'],
    ['HTTP-Fehler', new Response('nope', { status: 404 }), 'not_double_sweat'],
    ['App zu alt', Response.json(health({ minClientApi: 2, apiVersion: 2 })), 'client_too_old'],
    ['Server zu alt', Response.json(health({ apiVersion: 0, minClientApi: 0 })), 'server_too_old'],
  ])('lehnt ab: %s', async (_name, res, code) => {
    stub(res);
    await expect(probeServer('https://s.example')).rejects.toMatchObject({ code });
  });

  it('meldet Netzfehler als nicht erreichbar und folgt keinen Weiterleitungen', async () => {
    stub(new TypeError('Failed to fetch'));
    await expect(probeServer('https://s.example')).rejects.toMatchObject({ code: 'unreachable' });
    const f = vi.fn(async () => Response.json(health()));
    vi.stubGlobal('fetch', f);
    await probeServer('https://s.example');
    expect(f).toHaveBeenCalledWith(
      'https://s.example/api/v1/health',
      expect.objectContaining({ redirect: 'error', credentials: 'omit' }),
    );
  });
});

describe('Einladungslink der App', () => {
  it('liest Server und Code', () => {
    expect(
      parseJoinLink('doublesweat://join?s=https%3A%2F%2Fsweat.example.org&c=ABCD-EFGH-JKMN-PQRS'),
    ).toEqual({
      server: 'https://sweat.example.org',
      code: 'ABCD-EFGH-JKMN-PQRS',
    });
  });

  it('erzeugt Links, die sich wieder lesen lassen', () => {
    expect(parseJoinLink(joinLinkFor('https://sweat.example.org', 'ABCD-EFGH-JKMN-PQRS'))).toEqual({
      server: 'https://sweat.example.org',
      code: 'ABCD-EFGH-JKMN-PQRS',
    });
  });

  it.each([
    'https://sweat.example.org/join/ABCD-EFGH-JKMN-PQRS',
    'doublesweat://login?s=https%3A%2F%2Fa.example&c=ABCD-EFGH-JKMN-PQRS',
    'doublesweat://join?c=ABCD-EFGH-JKMN-PQRS',
    'doublesweat://join?s=http%3A%2F%2Fa.example&c=ABCD-EFGH-JKMN-PQRS',
    'doublesweat://join?s=https%3A%2F%2Fa.example&c=kurz',
    'doublesweat://join?s=https%3A%2F%2Fa.example&c=../../etc',
    'kaputt',
  ])('ignoriert %s', (raw) => {
    expect(parseJoinLink(raw)).toBeNull();
  });
});
