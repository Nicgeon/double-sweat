// Statischer Server für den Native-Build im Test: liefert die Dateien wie Capacitor (index.html für Pfade ohne Endung).
// Aufruf: node e2e/static-server.mjs <verzeichnis> <port>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'build-native');
const port = Number(process.argv[3] ?? 4174);
/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path === '/__health') return res.writeHead(200).end('ok');
  let file = resolve(join(root, `.${path}`));
  if (!file.startsWith(root + sep) && file !== root) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(path)) return res.writeHead(404).end('not found');
    file = join(root, 'index.html');
    if (!existsSync(file)) return res.writeHead(503).end('noch nicht gebaut');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
