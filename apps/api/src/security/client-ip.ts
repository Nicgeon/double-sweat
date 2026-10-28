import { isIP } from 'node:net';
import type { HttpBindings } from '@hono/node-server';
import type { Context } from 'hono';
import type { Config } from '../config.js';

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

/**
 * Ermittelt die Client-IP. X-Forwarded-For wird nur ausgewertet, wenn die direkte Gegenstelle
 * ein vertrauenswürdiger Proxy ist (TRUST_PROXY). Von rechts nach links wird die erste nicht
 * vertrauenswürdige Adresse genommen, damit ein Angreifer die IP nicht per Header fälschen kann.
 */
export function clientIp(c: Context, config: Config): string {
  const env = c.env as Partial<HttpBindings> | undefined;
  const socketIp = normalizeIp(env?.incoming?.socket?.remoteAddress) ?? 'unknown';
  const trust = config.trustProxy;
  const isTrusted = (ip: string) => !!trust && trust.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');

  if (!trust || socketIp === 'unknown' || !isTrusted(socketIp)) return socketIp;
  const forwarded = c.req.header('x-forwarded-for');
  if (!forwarded) return socketIp;
  const hops = forwarded.split(',').map(normalizeIp);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop && !isTrusted(hop)) return hop;
  }
  return hops.find((h): h is string => !!h) ?? socketIp;
}
