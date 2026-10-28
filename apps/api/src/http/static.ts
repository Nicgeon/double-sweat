import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  });
}
