import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { Env, Hono } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/**
 * Content-Security-Policy für die Web-App. Skripte nur aus der eigenen Herkunft und die inline eingebetteten
 * Start-Skripte von SvelteKit per Hash (kein 'unsafe-inline' für Skripte); keine Stile oder Skripte von außen.
 */
const hashCache = new Map<string, { mtimeMs: number; csp: string }>();
async function htmlPolicy(file: string): Promise<string> {
  const { mtimeMs } = await stat(file);
  const cached = hashCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.csp;
  const html = await readFile(file, 'utf8');
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) =>
      `'sha256-${createHash('sha256')
        .update(m[1] ?? '')
        .digest('base64')}'`,
  );
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self'",
    // Stil-Attribute (SvelteKit setzt z. B. beim Seitenwechsel-Hinweis eines; Komponenten setzen CSS-Variablen).
    // Das erlaubt keine <style>-Elemente und keine Skripte.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  hashCache.set(file, { mtimeMs, csp });
  return csp;
}

async function fileIfExists(path: string): Promise<string | null> {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

/**
 * Liefert den statischen Web-Build aus (SPA mit Fallback auf index.html).
 * Pfade außerhalb des Web-Verzeichnisses sind ausgeschlossen. Anfragen unter /api/ werden nie bedient.
 */
export function mountWeb<E extends Env>(app: Hono<E>, webDir: string): void {
  const root = resolve(webDir);
  app.get('*', async (c) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.notFound();
    }
    if (pathname.startsWith('/api/')) return c.notFound();

    const candidate = resolve(join(root, `.${pathname}`));
    const insideRoot = candidate === root || candidate.startsWith(root + sep);
    let file = insideRoot ? await fileIfExists(candidate) : null;
    // SPA-Fallback nur für Seitenaufrufe, nicht für fehlende Dateien mit Endung
    if (!file && !extname(pathname)) file = await fileIfExists(join(root, 'index.html'));
    if (!file) return c.notFound();

    const ext = extname(file);
    const immutable = pathname.includes('/_app/immutable/');
    const headers: Record<string, string> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (ext === '.html') headers['Content-Security-Policy'] = await htmlPolicy(file);
    // Der Service Worker (Push) darf den ganzen Ursprung steuern
    if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
  });
}
