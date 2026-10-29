// Fügt der Startseite des Native-Builds eine Content-Security-Policy als <meta>-Tag hinzu (Capacitor liefert die Dateien
// ohne Header aus). Inline-Skripte werden per Hash erlaubt; Verbindungen gehen nur zu HTTPS-Servern.
// Aufruf: node scripts/inject-csp.mjs <verzeichnis> [--allow-http]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? 'build-native');
const allowHttp = args.includes('--allow-http');
const file = join(dir, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/g, '');

const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
  (m) =>
    `'sha256-${createHash('sha256')
      .update(m[1] ?? '')
      .digest('base64')}'`,
);
const policy = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')}`.trim(),
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' https:${allowHttp ? ' http:' : ''}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

html = html.replace(
  '<head>',
  `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
);
writeFileSync(file, html);
console.log(`CSP in ${file} (${hashes.length} Inline-Skript${hashes.length === 1 ? '' : 'e'})`);
