#!/usr/bin/env node
// Setzt die Version in allen Paketen und in apps/api/src/version.ts, oder prüft sie.
//
//   node scripts/bump-version.mjs 0.2.0            setzt 0.2.0 überall (auch 0.2.0-rc.1)
//   node scripts/bump-version.mjs --check v0.2.0   prüft, ob überall genau diese Version steht (Tag "v0.2.0" oder "0.2.0")
//   node scripts/bump-version.mjs --check          prüft nur, ob alle Versionen gleich sind
//
// Die Android-App leitet versionName und versionCode aus apps/android/package.json ab (0.2.0 -> Code 200). Der Release-
// Workflow ruft --check mit dem Tag auf und bricht ab, wenn der Tag nicht zur Version im Code passt.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/android/package.json',
];
const VERSION_TS = 'apps/api/src/version.ts';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const write = (file, text) => writeFileSync(join(ROOT, file), text);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** Die aktuelle Version jeder Stelle (erste "version"-Angabe der package.json bzw. APP_VERSION). */
function current() {
  const found = PACKAGES.map((file) => [file, read(file).match(/"version":\s*"([^"]+)"/)?.[1]]);
  found.push([VERSION_TS, read(VERSION_TS).match(/APP_VERSION = '([^']+)'/)?.[1]]);
  return found;
}

const args = process.argv.slice(2);
const check = args[0] === '--check';
const wanted = (check ? args[1] : args[0])?.replace(/^v/, '');

if (check) {
  const found = current();
  const versions = new Set(found.map(([, v]) => v));
  if (versions.size !== 1) {
    fail(
      `Die Versionen sind nicht einheitlich:\n${found.map(([f, v]) => `  ${f}: ${v}`).join('\n')}`,
    );
  }
  const [version] = versions;
  if (wanted && version !== wanted) {
    fail(
      `Der Tag verlangt ${wanted}, im Code steht ${version}. Erst "node scripts/bump-version.mjs ${wanted}" ausführen und committen.`,
    );
  }
  console.log(`Version ${version}`);
} else {
  if (!wanted || !SEMVER.test(wanted))
    fail('Aufruf: node scripts/bump-version.mjs <Version>   (z. B. 0.2.0 oder 0.2.0-rc.1)');
  for (const file of PACKAGES)
    write(file, read(file).replace(/("version":\s*")[^"]+(")/, `$1${wanted}$2`));
  write(VERSION_TS, read(VERSION_TS).replace(/(APP_VERSION = ')[^']+(')/, `$1${wanted}$2`));
  console.log(`Version ${wanted} gesetzt in ${[...PACKAGES, VERSION_TS].join(', ')}`);
}
