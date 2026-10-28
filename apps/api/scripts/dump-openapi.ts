// Schreibt die OpenAPI-Spezifikation der API in eine Datei (Quelle der generierten Typen der Web-App).
// Aufruf: tsx scripts/dump-openapi.ts <ziel.json>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { openDatabase } from '../src/db/client.js';
import { systemClock } from '../src/util/clock.js';

const target = resolve(process.argv[2] ?? 'openapi.json');
const config = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_URL: 'https://example.invalid',
  SIGNUP_MODE: 'closed',
  DATA_DIR: resolve('.tmp-openapi'),
});
const ctx = createContext({ config, db: openDatabase(':memory:'), clock: systemClock });
const res = await createApp(ctx).request('https://example.invalid/api/v1/openapi.json');
if (res.status !== 200) throw new Error(`OpenAPI nicht abrufbar: ${res.status}`);
const spec = await res.json();
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(spec, null, 2)}\n`);
process.stdout.write(`${target} (${Object.keys(spec.paths).length} Pfade)\n`);
