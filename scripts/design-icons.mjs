// Rastert die App-Icons aus design/logo/*.svg zu PNG (Launcher, PWA, Apple, Favicon). Aufruf: pnpm design:icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// sharp ist Abhängigkeit der API; wir nutzen dieselbe Installation
const require = createRequire(resolve('apps/api/package.json'));
const sharp = require('sharp');

const out = resolve('design/logo/png');
mkdirSync(out, { recursive: true });
const svg = (name) => readFileSync(resolve('design/logo', name));
const jobs = [
  ['app-icon.svg', 'icon-192.png', 192],
  ['app-icon.svg', 'icon-512.png', 512],
  ['app-icon.svg', 'apple-touch-icon-180.png', 180],
  ['app-icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['app-icon.svg', 'favicon-32.png', 32],
];
for (const [src, name, size] of jobs) {
  const png = await sharp(svg(src), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(resolve(out, name), png);
  console.log(`${name} (${size}×${size}, ${png.length} Bytes)`);
}

// SVG-Favicon, das dem Farbschema des Browsers folgt
writeFileSync(
  resolve('design/logo/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64">
<style>.e{fill:#e8531f}.t{fill:#2b4bdb}.b{fill:#0e1424}@media (prefers-color-scheme:dark){.e{fill:#ff7a45}.t{fill:#6e8bff}.b{fill:#edf0f7}}</style>
<defs><clipPath id="c"><circle cx="32" cy="32" r="26"/></clipPath></defs>
<circle class="e" cx="32" cy="32" r="26"/>
<rect class="t" x="34" y="6" width="52" height="52" rx="16"/>
<rect class="b" x="34" y="6" width="52" height="52" rx="16" clip-path="url(#c)"/>
</svg>
`,
);
console.log('favicon.svg');
