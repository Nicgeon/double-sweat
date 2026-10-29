// Rastert die Launcher-Icons für Android 7 und älter (ab Android 8 nimmt die App das Vektor-Icon) aus design/logo.
// Aufruf: pnpm android:icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve('apps/api/package.json'));
const sharp = require('sharp');

const res = resolve('apps/android/android/app/src/main/res');
const logo = (name) => readFileSync(resolve('design/logo', name));
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [density, size] of Object.entries(SIZES)) {
  const dir = resolve(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const square = await sharp(logo('app-icon.svg'), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(resolve(dir, 'ic_launcher.png'), square);
  // rund: das randlose Logo, mit Kreis ausgeschnitten
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  const round = await sharp(logo('app-icon-maskable.svg'), { density: 384 })
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  writeFileSync(resolve(dir, 'ic_launcher_round.png'), round);
  console.log(`mipmap-${density}: ${size}×${size}`);
}
