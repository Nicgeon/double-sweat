# Design

Das Designsystem von Double Sweat heißt **Scoreboard für zwei**. Es ist die Quelle für jede Oberfläche
(Web, PWA, Android). Die Richtlinie mit Regeln, Texten und Beispielen steht in
[GUIDELINE.md](GUIDELINE.md). Das System lebt auch in Claude Design als Artifact „Double Sweat“
(Vorschauen aller Komponenten und vier fertiger Bildschirme in Hell und Dunkel):
<https://claude.ai/artifact/Fjap8fDQjmJazDGkLbcjrD> (privat, nur für den Besitzer).

| Pfad             | Inhalt                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`    | **Quelle der Wahrheit** für Farben (Hell und Dunkel), Textstile, Abstände, Radien, Schatten, Layout und Bewegung                             |
| `tokens.css`     | Daraus erzeugt (`pnpm design:build`), nicht von Hand ändern. Hell ist Standard, Dunkel folgt `prefers-color-scheme` oder `data-theme="dark"` |
| `components.css` | Stile aller Komponenten (Präfix `ds-`), nutzt nur Tokens                                                                                     |
| `fonts/`         | Archivo (Anzeige) und Atkinson Hyperlegible Next (Text) als variable woff2, selbst gehostet                                                  |
| `icons/`         | 62 Lucide-Icons als SVG mit `currentColor`                                                                                                   |
| `logo/`          | Zeichen, App-Icon und Favicon als SVG, `logo/png/` die gerasterten Launcher- und PWA-Icons (`pnpm design:icons`)                             |
| `reference/`     | React-Referenz der Komponenten (`components.jsx`, Typen, Icon-Daten). Die Svelte-App übernimmt Markup und Klassen, nicht React               |
| `licenses/`      | OFL (Schriften) und ISC (Lucide)                                                                                                             |

## Arbeiten am Design

```bash
pnpm design:build   # tokens.css aus tokens.json erzeugen
pnpm design:check   # tokens.css aktuell? Kontrast aller Farbpaare in beiden Themes (WCAG AA)
pnpm design:icons   # PNG-Icons aus logo/*.svg rastern
```

- Ein Token wird **nur in `tokens.json`** geändert; danach `pnpm design:build` und `pnpm design:check`. Die Prüfung
  muss grün sein (Text 4,5:1, Grafiken 3:1 in beiden Themes), sonst wird der Wert angepasst.
- Die App-Oberfläche nutzt ausschließlich diese Tokens und die Klassen aus `components.css`, keine eigenen
  Farb- oder Größenwerte.
- Wird das System in Claude Design weiterentwickelt, werden `tokens.json` und die Komponenten-Dateien
  zurückgespiegelt und hier eingecheckt; `tokens.css` entsteht immer aus `tokens.json`.
