import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createSafeFetch, isPublicAddress, UnsafeUrlError } from '../src/security/safe-fetch.js';

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2a00:1450:4001:81b::200e',
  ])('%s ist öffentlich', (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // Cloud-Metadaten
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4-in-IPv6
    '::ffff:10.1.2.3',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1', // NAT64
    '2002:7f00:1::', // 6to4
    'kein-ip',
    '',
  ])('%s ist nicht erlaubt', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('SafeFetch: URL-Prüfung', () => {
  const safe = createSafeFetch({ resolve: async () => [{ address: '93.184.216.34', family: 4 }] });

  it('lässt https mit öffentlichem Ziel zu', async () => {
    await expect(safe.check('https://push.example.org/send/abc')).resolves.toBeUndefined();
  });

  it.each([
    ['http://push.example.org/x', 'Nur https'],
    ['ftp://push.example.org/x', 'Nur https'],
    ['file:///etc/passwd', 'Nur https'],
    ['https://user:pass@push.example.org/x', 'Zugangsdaten'],
    ['https://127.0.0.1/x', 'Adressbereich'],
    ['https://[::1]/x', 'Adressbereich'],
    ['https://169.254.169.254/latest/meta-data', 'Adressbereich'],
    ['https://10.0.0.1:8443/x', 'Adressbereich'],
    ['https://[::ffff:127.0.0.1]/x', 'Adressbereich'],
    ['https://0x7f.1/x', 'Adressbereich'], // von URL zu 127.0.0.1 normalisiert
    ['https://2130706433/x', 'Adressbereich'], // Dezimalschreibweise von 127.0.0.1
    ['kein url', 'gültige URL'],
    [`https://push.example.org/${'a'.repeat(2100)}`, 'zu lang'],
  ])('lehnt %s ab', async (url, reason) => {
    await expect(safe.check(url)).rejects.toThrow(UnsafeUrlError);
    await expect(safe.check(url)).rejects.toThrow(new RegExp(reason));
  });

  it('lehnt Hostnamen ab, die auf private Adressen zeigen', async () => {
    const rebinding = createSafeFetch({
      resolve: async () => [{ address: '10.0.0.5', family: 4 }],
    });
    await expect(rebinding.check('https://evil.example/x')).rejects.toThrow(/Adressbereich/);
  });

  it('lehnt auch gemischte Antworten ab (eine öffentliche, eine private Adresse)', async () => {
    const mixed = createSafeFetch({
      resolve: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.0.10', family: 4 },
      ],
    });
    await expect(mixed.check('https://evil.example/x')).rejects.toThrow(/Adressbereich/);
  });

  it('lehnt nicht auflösbare Hosts ab', async () => {
    const empty = createSafeFetch({ resolve: async () => [] });
    await expect(empty.check('https://gibtsnicht.example/x')).rejects.toThrow(/auflösbar/);
  });

  it('erlaubte Hosts dürfen private Adressen und http nutzen, andere weiterhin nicht', async () => {
    const lan = createSafeFetch({
      allowedHosts: ['ntfy.lan'],
      resolve: async (host) => [
        { address: host === 'ntfy.lan' ? '192.168.1.20' : '192.168.1.21', family: 4 },
      ],
    });
    await expect(lan.check('http://ntfy.lan/upXYZ')).resolves.toBeUndefined();
    await expect(lan.check('https://ntfy.lan/upXYZ')).resolves.toBeUndefined();
    await expect(lan.check('https://anderer.lan/upXYZ')).rejects.toThrow(/Adressbereich/);
    await expect(lan.check('http://anderer.lan/upXYZ')).rejects.toThrow(/Nur https/);
  });
});

describe('SafeFetch: Anfragen', () => {
  const servers: http.Server[] = [];
  afterEach(() => Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r)))));

  async function serve(handler: http.RequestListener) {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('sendet Methode, Header und Body und liefert den Status', async () => {
    let seen: { method?: string; auth?: string; body: string } = { body: '' };
    const base = await serve((req, res) => {
      seen = { method: req.method, auth: req.headers['x-test'] as string, body: '' };
      req.on('data', (c) => {
        seen.body += c;
      });
      req.on('end', () => {
        res.statusCode = 201;
        res.end('ok');
      });
    });
    const safe = createSafeFetch({ allowedHosts: ['127.0.0.1'] });
    const res = await safe.request(`${base}/push`, {
      method: 'POST',
      headers: { 'x-test': 'ja' },
      body: Buffer.from('hallo'),
    });
    expect(res.status).toBe(201);
    expect(seen).toEqual({ method: 'POST', auth: 'ja', body: 'hallo' });
  });

  it('verweigert lokale Ziele, wenn der Host nicht ausdrücklich erlaubt ist', async () => {
    let hit = false;
    const base = await serve((_req, res) => {
      hit = true;
      res.end();
    });
    const safe = createSafeFetch({});
    await expect(safe.request(base)).rejects.toThrow(UnsafeUrlError);
    await expect(safe.request(base.replace('http:', 'https:'))).rejects.toThrow(/Adressbereich/);
    expect(hit).toBe(false);
  });

  it('folgt Weiterleitungen nicht (z. B. auf Cloud-Metadaten)', async () => {
    let targetHit = false;
    const target = await serve((_req, res) => {
      targetHit = true;
      res.end('geheim');
    });
    const origin = await serve((_req, res) => {
      res.statusCode = 302;
      res.setHeader('Location', target);
      res.end();
    });
    const safe = createSafeFetch({ allowedHosts: ['127.0.0.1'] });
    expect((await safe.request(`${origin}/x`)).status).toBe(302);
    expect(targetHit).toBe(false);
  });

  it('prüft die Adresse erst beim Verbinden und nutzt genau die geprüfte (DNS-Rebinding)', async () => {
    let lookups = 0;
    // Erste (und einzige) Auflösung liefert eine private Adresse: Es darf keine Verbindung entstehen
    const safe = createSafeFetch({
      resolve: async () => {
        lookups++;
        return [{ address: lookups === 1 ? '10.0.0.5' : '93.184.216.34', family: 4 }];
      },
      timeoutMs: 2000,
    });
    await expect(safe.request('https://rebind.example/x')).rejects.toThrow(/Adressbereich/);
    expect(lookups).toBe(1);
  });

  it('bricht bei Zeitüberschreitung ab', async () => {
    const base = await serve(() => {
      /* antwortet nie */
    });
    const safe = createSafeFetch({ allowedHosts: ['127.0.0.1'], timeoutMs: 150 });
    await expect(safe.request(base)).rejects.toThrow(/Zeitüberschreitung/);
  });

  it('liest große Antworten nicht vollständig', async () => {
    const base = await serve((_req, res) => {
      res.statusCode = 200;
      res.write(Buffer.alloc(50_000));
      setTimeout(() => res.end(Buffer.alloc(50_000)), 50);
    });
    const safe = createSafeFetch({ allowedHosts: ['127.0.0.1'], maxResponseBytes: 1024 });
    expect((await safe.request(base)).status).toBe(200);
  });
});
