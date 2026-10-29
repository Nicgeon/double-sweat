import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/** Das Ziel ist nicht erlaubt (SSRF-Schutz). */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

// Adressbereiche, die nie angesprochen werden dürfen: lokal, privat, Link-Local, CGNAT, Metadaten, Multicast, Doku
const blocked = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const V6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
for (const [net, bits] of V4) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of V6) blocked.addSubnet(net, bits, 'ipv6');

/** true, wenn die Adresse öffentlich routbar ist. IPv4-in-IPv6 (::ffff:a.b.c.d) wird als IPv4 geprüft. */
export function isPublicAddress(address: string): boolean {
  let ip = address;
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

export interface ResolvedAddress {
  address: string;
  family: number;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const systemResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) =>
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    ),
  );

export interface SafeFetchOptions {
  /** Hosts, für die private Adressen und http erlaubt sind (z. B. ntfy im eigenen Netz). */
  allowedHosts?: string[];
  resolve?: Resolver;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface SafeRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
}

export interface SafeFetch {
  /** Prüft URL und Auflösung, ohne eine Anfrage zu senden (z. B. beim Registrieren einer Subscription). */
  check(url: string): Promise<void>;
  /** Gibt Status und (auf maxResponseBytes gekürzten) Antwortkörper zurück. Weiterleitungen werden nicht verfolgt. */
  request(url: string, init?: SafeRequest): Promise<{ status: number; body: Buffer }>;
}

const MAX_URL_LENGTH = 2048;

export function createSafeFetch(options: SafeFetchOptions = {}): SafeFetch {
  const allowed = new Set((options.allowedHosts ?? []).map((h) => h.toLowerCase()));
  const resolver = options.resolve ?? systemResolver;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 4096;

  function parse(raw: string): { url: URL; trusted: boolean } {
    if (raw.length > MAX_URL_LENGTH) throw new UnsafeUrlError('URL zu lang');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new UnsafeUrlError('Keine gültige URL');
    }
    if (url.username || url.password)
      throw new UnsafeUrlError('URL darf keine Zugangsdaten enthalten');
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw new UnsafeUrlError('Nur https:// ist erlaubt');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname) throw new UnsafeUrlError('Host fehlt');
    const trusted = allowed.has(hostname);
    if (url.protocol === 'http:' && !trusted) throw new UnsafeUrlError('Nur https:// ist erlaubt');
    return { url, trusted };
  }

  /** Alle aufgelösten Adressen müssen öffentlich sein (sonst könnte eine Antwort auf Interna zeigen). */
  async function resolveSafe(hostname: string, trusted: boolean): Promise<ResolvedAddress[]> {
    const literal = isIP(hostname);
    const addresses = literal ? [{ address: hostname, family: literal }] : await resolver(hostname);
    if (addresses.length === 0) throw new UnsafeUrlError('Host nicht auflösbar');
    if (!trusted && !addresses.every((a) => isPublicAddress(a.address))) {
      throw new UnsafeUrlError('Ziel liegt in einem nicht erlaubten Adressbereich');
    }
    return addresses;
  }

  return {
    async check(raw) {
      const { url, trusted } = parse(raw);
      await resolveSafe(url.hostname.replace(/^\[|\]$/g, ''), trusted);
    },

    async request(raw, init = {}) {
      const { url, trusted } = parse(raw);
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const transport = url.protocol === 'https:' ? https : http;

      // Bei IP-Adressen im URL ruft Node die lookup-Funktion nicht auf, deshalb hier vorab prüfen.
      if (isIP(hostname)) await resolveSafe(hostname, trusted);

      // Die Adresse wird genau einmal aufgelöst, geprüft und dann fest für die Verbindung verwendet.
      // So kann ein DNS-Wechsel zwischen Prüfung und Verbindung (DNS-Rebinding) nichts mehr umlenken.
      const lookup = (
        _host: string,
        opts: dns.LookupOptions,
        callback: (
          err: Error | null,
          address: string | dns.LookupAddress[],
          family?: number,
        ) => void,
      ) => {
        resolveSafe(hostname, trusted).then(
          (addresses) => {
            const first = addresses[0] as ResolvedAddress;
            if (opts.all)
              callback(
                null,
                addresses.map((a) => ({ address: a.address, family: a.family })),
              );
            else callback(null, first.address, first.family);
          },
          (error: Error) => callback(error, '', 0),
        );
      };

      return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
        const req = transport.request(
          url,
          {
            method: init.method ?? 'POST',
            headers: init.headers,
            lookup: lookup as never,
            agent: false,
            timeout: timeoutMs,
          },
          (res) => {
            // Weiterleitungen werden bewusst nicht verfolgt: Der Status wird einfach zurückgegeben.
            let received = 0;
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => {
              received += chunk.length;
              if (received > maxResponseBytes) res.destroy();
              else chunks.push(chunk);
            });
            const done = () =>
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
            res.on('close', done);
            res.on('error', done);
          },
        );
        req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
        req.on('error', reject);
        if (init.body) req.write(init.body);
        req.end();
      });
    },
  };
}
