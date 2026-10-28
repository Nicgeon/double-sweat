// Erzeugt design/tokens.css aus design/tokens.json. Aufruf: node design-build.mjs [designDir] [--check]
// Struktur wie in Claude Design: Hell ist Standard, Dunkel per prefers-color-scheme und per data-theme="dark".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const check = args.includes('--check');
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? 'design');
const tokens = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));

const [first, ...rest] = tokens.color.themes.map((t) => t.id);
const val = (t, theme) =>
  typeof t.value === 'string' ? t.value : (t.value[theme] ?? t.value[first]);
const alias = (v) => (/^\{(.+)\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v);
const decl = (list, theme) => list.map((t) => `  --${t.name}: ${alias(val(t, theme))};`).join('\n');

const perTheme = [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])];
const plain = ['spacing', 'radius', 'layout', 'duration', 'easing']
  .flatMap((k) => tokens[k]?.tokens ?? [])
  .map((t) => `  --${t.name}: ${t.value};`);
const families = Object.entries(tokens.type.families).map(([k, v]) => `  --font-${k}: ${v};`);

const faces = tokens.type.fonts.map((f) => {
  const file = f.file.includes('/') ? f.file : `fonts/${f.file}`;
  if (!existsSync(join(dir, file))) throw new Error(`Schriftdatei fehlt: ${file}`);
  return `@font-face {\n  font-family: "${f.family}";\n  src: url("${file}") format("woff2");\n  font-weight: ${f.weight};\n  font-style: ${f.style ?? 'normal'};\n  font-display: swap;\n}`;
});

const styles = tokens.type.groups.flatMap((g) =>
  g.styles.map((s) => {
    const fam = s.family ?? g.family;
    const lines = [
      `  font-family: var(--font-${fam});`,
      `  font-size: ${s.fontSize};`,
      `  line-height: ${s.lineHeight};`,
      `  font-weight: ${s.fontWeight};`,
    ];
    if (s.letterSpacing) lines.push(`  letter-spacing: ${s.letterSpacing};`);
    return `.${s.name} {\n${lines.join('\n')}\n}`;
  }),
);

const darkId = rest[0];
const blocks = [
  '/* Double Sweat — generated from tokens.json. Nicht von Hand ändern: pnpm design:build */',
  ...faces,
  `:root,\n[data-theme="${first}"] {\n  color-scheme: ${first};\n${decl(perTheme, first)}\n}`,
  `@media (prefers-color-scheme: ${darkId}) {\n  :root:not([data-theme="${first}"]) {\n    color-scheme: ${darkId};\n${decl(perTheme, darkId).replace(/^/gm, '  ')}\n  }\n}`,
  `[data-theme="${darkId}"] {\n  color-scheme: ${darkId};\n${decl(perTheme, darkId)}\n}`,
  `:root {\n${[...plain, ...families].join('\n')}\n}`,
  ...styles,
];
const css = `${blocks.join('\n\n')}\n`;

const out = join(dir, 'tokens.css');
if (check) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current !== css) {
    console.error('design/tokens.css ist nicht aktuell. Bitte „pnpm design:build“ ausführen.');
    process.exit(1);
  }
  console.log('tokens.css ist aktuell.');
} else {
  writeFileSync(out, css);
  console.log(`geschrieben: ${out} (${css.length} Zeichen)`);
}
