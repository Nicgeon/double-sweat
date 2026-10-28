// WCAG-2-Kontrastprüfung für design/tokens.json in jedem Theme. Aufruf: node scripts/check-contrast.mjs [tokens.json]
// Text-Paare müssen 4,5:1 erreichen, Grafiken (Marker, Rahmen, Fokusring) 3:1. Halbtransparente Flächen werden
// auf ihren Untergrund gerechnet. Mit ALL=1 werden auch bestandene Paare gezeigt.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] ?? 'design/tokens.json');
const doc = JSON.parse(readFileSync(path, 'utf8'));
const tokens = doc.color.tokens;
const themes = doc.color.themes.map((t) => t.id);

const get = (name, theme) => {
  const t = tokens.find((x) => x.name === name);
  if (!t) throw new Error(`Token fehlt: ${name}`);
  return typeof t.value === 'string' ? t.value : (t.value[theme] ?? t.value[themes[0]]);
};
const hex = (h) => {
  const s = h.replace('#', '');
  const f = s.length <= 4 ? [...s].map((c) => c + c).join('') : s;
  return {
    r: Number.parseInt(f.slice(0, 2), 16),
    g: Number.parseInt(f.slice(2, 4), 16),
    b: Number.parseInt(f.slice(4, 6), 16),
    a: f.length === 8 ? Number.parseInt(f.slice(6, 8), 16) / 255 : 1,
  };
};
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const lin = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a, b) => {
  const [hi, lo] = lum(a) >= lum(b) ? [a, b] : [b, a];
  return (lum(hi) + 0.05) / (lum(lo) + 0.05);
};

const GROUNDS = ['bg', 'surface', 'surface-2'];
const pairs = [];
const text = (fg, grounds, min = 4.5, kind = 'Text') => {
  for (const bg of grounds) pairs.push({ fg, bg, min, kind });
};
const mark = (fg, grounds) => text(fg, grounds, 3, 'Grafik');

text('ink', GROUNDS);
text('ink-muted', GROUNDS);
text('on-action', ['action', 'action-hover']);
for (const p of ['ember', 'tide', 'done', 'risk', 'alert']) {
  text(`on-${p}`, [p]);
  text(`${p}-ink`, [...GROUNDS, `${p}-soft`]);
  mark(p, ['bg', 'surface']);
}
mark('border-strong', GROUNDS);
mark('focus', GROUNDS);
mark('action', ['bg', 'surface']);
// Text auf Fotos: schlechtester Fall ist ein weißes Foto unter dem Scrim
pairs.push({ fg: 'on-scrim', bg: 'scrim', min: 4.5, kind: 'Text', over: '#ffffff' });

const failures = [];
const rows = [];
for (const theme of themes) {
  for (const p of pairs) {
    const ground = hex(p.over ?? get('surface', theme));
    const bg = over(hex(get(p.bg, theme)), ground);
    const fg = over(hex(get(p.fg, theme)), bg);
    const r = ratio(fg, bg);
    rows.push({ theme, ...p, r, ok: r >= p.min });
  }
}
for (const r of rows) if (!r.ok) failures.push(r);

// Kleinste Schriftgröße: nichts unter 12 px
const small = doc.type.groups
  .flatMap((g) => g.styles)
  .filter((s) => Number.parseFloat(s.fontSize) < 12);
for (const s of small)
  failures.push({ theme: '-', fg: s.name, bg: 'fontSize', r: 0, min: 12, kind: 'Größe' });

const fmt = (n) => n.toFixed(2).padStart(5);
for (const theme of themes) {
  console.log(`\n== ${theme} ==`);
  for (const r of rows.filter((x) => x.theme === theme)) {
    if (!r.ok || process.env.ALL) {
      console.log(
        `${r.ok ? ' ok ' : 'FAIL'} ${fmt(r.r)} (min ${r.min})  ${r.kind.padEnd(6)} ${r.fg} auf ${r.bg}`,
      );
    }
  }
}
for (const f of failures.filter((x) => x.kind === 'Größe'))
  console.log(`FAIL Textstil ${f.fg} ist kleiner als 12 px`);
console.log(
  `\n${rows.length} Paare in ${themes.length} Themes geprüft, ${failures.length} unter dem Mindestwert.`,
);
process.exit(failures.length ? 1 : 0);
