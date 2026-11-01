Double Sweat ist eine selbst gehostete App für zwei Menschen, die gemeinsam trainieren: Jede:r setzt ein Wochenziel, checkt mit einem Foto ein und löst am Ende der Woche gegebenenfalls einen Einsatz ein. Das Designsystem heißt **Scoreboard für zwei**: eine ruhige, neutrale Fläche, auf der zwei Identitäten, jede mit eigener Farbe und Form, gleichberechtigt nebeneinander stehen. Es gibt zwei gleichwertige Themes, **Hell** (Standard) und **Dunkel**; die App folgt dem System, lässt sich aber umstellen. Gebaut wird **mobil zuerst** (Referenzbreite 390 px) und hat ab 1024 px ein eigenes Desktop-Layout.

## Inhaltliche Grundsätze

- **Sprache und Ton.** Deutsch, Anrede „du“, kurze Sätze, ruhig und sachlich, gelegentlich trocken. Der Ton motiviert, er beschämt nie: Ein verfehltes Ziel ist „Verfehlt“, nicht „Versagt“. Keine Emoji, keine Ausrufezeichen in Fehlern und Status, keine Großbuchstaben außer der Überschrift `overline`.
- **Namen statt Rollen.** Der Partner heißt in jedem Text wie im Profil („Jan sieht dein Foto“), nie „dein Partner“ oder „der andere“. Wo kein Name passt, steht „dein Team“. So braucht kein Text Gendern.
- **Buttons beginnen mit einem Verb:** „Einchecken“, „Jan anstupsen“, „Einsatz ändern“, „Erneut versuchen“. Abbrechen heißt „Abbrechen“, nicht „Zurück“.
- **Zahlen und Zeit.** „3 von 4 Tagen“, „KW 43“, „Mo, 26. Okt.“, „19:00 Uhr“, „vor 2 Std.“. Wochen beginnen am Montag. Zahlen stehen als Ziffern, nie ausgeschrieben.
- **Fehler** sagen, was passiert ist und was jetzt geht, in einem Satz, ohne Schuld und ohne Codes: „Der Server ist gerade nicht erreichbar. Versuch es gleich noch einmal.“
- **Benachrichtigungen** sind kurz und neutral, weil unverschlüsselte Push-Wege den Text mitlesen lassen könnten: „Heute noch nicht eingecheckt.“, „Jan stupst dich an.“ Kein Trainingsinhalt, kein Betrag, kein Foto.

| Begriff                   | Verwenden            | Nicht verwenden         |
| ------------------------- | -------------------- | ----------------------- |
| Das tägliche Foto         | Check-in, einchecken | Post, Workout posten    |
| Ziel pro Woche            | Wochenziel           | Quote, Pensum           |
| Folge des Verfehlens      | Einsatz, einlösen    | Wette, Strafe, bezahlen |
| Wochen in Folge           | Serie                | Streak                  |
| Erinnerung an den Partner | anstupsen            | pushen, nerven          |
| Die zwei Menschen         | Team                 | Gruppe, Paar            |
| Ziel, Einsatz, Belohnung  | Abmachung (der Tab)  | Wette, Deal, Vertrag    |
| Startseite                | Heute                | Start, Dashboard        |
| Einstellungen             | Profil               | Mehr                    |

Echte Texte der App:

| Situation               | Text                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Check-in geschafft      | Eingecheckt. Jan sieht dein Foto.                                                          |
| Heute schon eingecheckt | Du hast heute schon eingecheckt. Morgen geht es weiter.                                    |
| Wochenziel erreicht     | Woche geschafft. 4 Wochen in Serie.                                                        |
| Wochenziel verfehlt     | Woche verfehlt. Du löst den Einsatz ein: Sonntag kochen.                                   |
| Einladung               | Mira lädt dich ein.                                                                        |
| Link abgelaufen         | Dieser Link gilt nicht mehr.                                                               |
| Leerer Feed             | Noch kein Foto diese Woche.                                                                |
| Konto löschen           | Konto löschen? Deine Check-ins und Fotos werden endgültig entfernt. Jan behält sein Konto. |
| Zeitzone                | Gilt ab Montag, 2. Nov. Bis dahin zählt Europe/Berlin.                                     |

## Visuelle Grundlagen

- **Themes.** Setze `data-theme="light"` oder `data-theme="dark"` auf das Wurzelelement; ohne Attribut folgt `tokens.css` dem System (`prefers-color-scheme`). Verwende ausschließlich Farb-Tokens, nie Literale. Das Dunkel-Theme ist kein invertiertes Hell, sondern ein blau-schwarzer Grund mit helleren Akzenten und dunklem Text darauf (`on-…`).
- **Flächen und Text.** Seite `bg`; Karten, Leisten, Seitenleiste und Sheets `surface`; Chips, Eingabefelder und Platzhalter `surface-2`. Text `ink`, Zweittext `ink-muted`. `ink-faint` ist nur Dekoration und deaktiviert, nie Information. Linien sind `border` (Haarlinie, dekorativ) bzw. `border-strong` (Rahmen von Bedienelementen, mindestens 3:1).
- **Aktion ist neutral.** `action` ist Fläche des primären Buttons mit `on-action` darauf; im Hell fast schwarz, im Dunkel fast weiß. Die Aktion gehört keinem Partner. Pro Bereich genau ein primärer Button.
- **Partner-Identität: Form und Farbe zusammen.** Die **Form** gehört zum Slot im Team: Slot 1 ist ein **Kreis**, Slot 2 ein **abgerundetes Quadrat**. Die **Farbe** wählt jede Person selbst aus einer festen Palette von sieben Identitätsfarben: Glut (`ember`, Standard für Slot 1), Flut (`tide`, Standard für Slot 2), Orchidee (`orchid`), Moos (`moss`), Himmel (`sky`), Kakao (`cocoa`) und Graphit (`graphite`). Beide Personen im Team haben verschiedene Farben; die Farbe der anderen Person ist in der Auswahl gesperrt (`ColorPicker`). Freie Farbwahl (Farbrad, Hex) gibt es bewusst nicht, weil sich dafür keine Lesbarkeit garantieren lässt. Jede Farbe X hat vier Tokens: `X` als Fläche oder Grafik (Marker, Balken, Avatar) mit `on-X` darauf, `X-ink` als Text oder Icon und `X-soft` als getönte Fläche. Die Komponenten übernehmen die Farbe über die Klasse `ds-c-<name>` (oder die Eigenschaft `color`) und die Form über `ds-p1`/`ds-p2` (Eigenschaft `partner`). Die Zuordnung folgt der Person, nicht dem Betrachter: Auf beiden Handys ist Mira immer ein Kreis in ihrer Farbe; die eigene Bahn steht oben und trägt „(Du)“. Nie eine Identität nur durch Farbe zeigen, und die drei Statusfarben (Blaugrün, Bernstein, Beere) gehören nicht zur Palette.
- **Status.** `done` (Blaugrün, Geschafft), `risk` (Bernstein, Auf der Kippe), `alert` (Beere, Verfehlt, Schuld, Löschen). Jeder Status trägt Icon und Wort; Blaugrün und Beere liegen bewusst nicht auf der Rot-Grün-Achse. Fläche, Text (`-ink`) und Tönung (`-soft`) folgen derselben Regel wie bei den Partnern.
- **Kontrast.** Jedes Text-Paar erreicht in beiden Themes mindestens 4,5:1, jede Grafik (Marker, Rahmen, Fokusring) mindestens 3:1. Das prüft `pnpm design:check` mit 174 Paaren (alle Identitäts- und Statusfarben); es muss grün sein, bevor ein Token geändert wird. Ausnahme: `ink-faint`.
- **Typografie.** Archivo für Anzeige, Titel, Zahlen und Navigation (`display`, `h1`, `h2`, `h3`, `overline`, `numeral-*`); Atkinson Hyperlegible Next für allen Text (`lead`, `body`, `body-strong`, `small`, `small-strong`, `caption`). Die große Zahl der Anzeigetafel ist `numeral-xl` mit tabellarischen Ziffern in der Breite 112 (Klasse `ds-num`). Kleinste Größe ist 12 px (`caption`); Fließtext 16 px. Beide Schriften liegen als Dateien in `fonts/` und werden nie von einem CDN geladen.
- **Abstände.** 4-px-Raster (`space-1` bis `space-16`). Seitenrand mobil `space-4`, ab 768 px `space-6`. Karten stehen mit `space-3` (mobil) bzw. `space-6` (Desktop) Abstand. Inhalt auf Desktop höchstens `content-max`, Fließtext und Formulare höchstens `readable-max`.
- **Formen.** `radius-md` für Buttons und Felder, `radius-lg` für Karten und Fotos, `radius-xl` für Sheets, `radius-pill` für Chips, Schalter und die Marker von Slot 1. Slot 2 verwendet 30 % der Kantenlänge als Radius.
- **Linien statt Schatten.** Karten haben eine Haarlinie (`border`) und keinen Schatten. Schatten gibt es nur für Sheets und Dialoge (`shadow-sheet`) und für schwebende Elemente wie die Check-in-Schaltfläche über der Tab-Leiste (`shadow-pop`). Keine farbige Seitenkante an Karten, keine Verläufe.
- **Fotos.** Format 3:4, `object-fit: cover`. Text auf einem Foto steht immer im Band `scrim` mit `on-scrim`, nie direkt auf dem Bild. Ohne Foto: `surface-2` mit Icon `image` und Text.
- **Zustände.** Hover: Hintergrund zu `action-hover` bzw. `surface-2`. Gedrückt: Skalierung auf 0,98. Gesperrt: `surface-2` mit `ink-faint`. Lädt: Icon `loader-circle`, Button gesperrt, gleiche Breite. Fokus: 2 px Ring in `focus`, 2 px Abstand, an jedem Bedienelement, nie entfernen.
- **Bewegung.** `dur-fast` (120 ms) für Hover und Druck, `dur-base` (200 ms) für Marker und Schalter, `dur-slow` (320 ms) für Sheets, jeweils `ease-out`. Keine Konfetti, keine Dauerschleifen. Bei `prefers-reduced-motion` entfällt jede Bewegung.
- **Bedienbarkeit.** Jedes Bedienelement ist mindestens 44 × 44 px (`tap-min`); nur `Button size="sm"` (36 px) darf in Listen und auf Desktop kleiner sein. Der Text lässt sich auf 200 % vergrößern, ohne dass etwas abgeschnitten wird.

### Layout

- **Mobil (bis 767 px).** Oben `AppBar` (56 px), darunter der Inhalt in einer Spalte, unten die `NavBar` als Tab-Leiste (64 px plus `safe-area-inset-bottom`). Vier Ziele: Heute, Verlauf, Abmachung, Profil. **Einchecken** ist keine Tab, sondern eine schwebende Schaltfläche mit Text (`ds-fab`) über der Leiste auf Heute, Verlauf und Abmachung; nach dem ersten Check-in des Tages tritt sie zurück (`ds-fab--quiet`, „Noch ein Check-in“). Abzeichen: Zahl auf Abmachung (Einlösungen, die auf dich warten), Zahl auf der Glocke (ungelesen).
- **Tablet (ab 768 px).** Seitenrand `space-6`, Sheets erscheinen zentriert als Dialog.
- **Desktop (ab 1024 px).** Links die Seitenleiste (`NavBar variant="side"`, 248 px) mit Logo, Einchecken als großer Button oben und dem Postfach unten; rechts der Inhalt, höchstens 1120 px breit. Start: Anzeigetafel links, Einsatz und Fotos rechts. Die App-Leiste entfällt, der Titel steht im Inhalt.
- Fertige Bildschirme (Start, Check-in in drei Schritten, Einsatz, Mehr mit Farbwahl, Einladung) stehen unter den Komponenten in der Gruppe **Screens** und gelten als Vorlage.

## Ikonografie und Marke

- **Icons.** Lucide (ISC-Lizenz), Linien-Icons im 24er-Raster mit Strichstärke 2, gezeichnet mit `currentColor`; 20 px in Zeilen und Buttons, 24 px in der Navigation, 16 px in Chips. Alle verwendeten Icons liegen in `assets/Icons/`. Training: `dumbbell` Kraft, `heart-pulse` Cardio, `footprints` Laufen, `bike` Rad, `waves` Schwimmen, `flower-2` Yoga, `activity` Sonstiges. Keine Emoji, keine zweite Icon-Familie.
- **Marke.** Das Zeichen ist ein Kreis (`ember`) und ein abgerundetes Quadrat (`tide`), die sich überlappen; die Schnittfläche ist `ink`. Daneben steht „Double Sweat“ in Archivo 800 (Breite 112). Zeichen und Schriftzug sind in der Komponente `Logo` und als Dateien in `assets/Logo/` abgelegt (`mark.svg` auf hellem, `mark-on-dark.svg` auf dunklem Grund, `app-icon.svg` und `app-icon-maskable.svg` für Launcher und PWA). Der Schriftzug wird immer als Text gesetzt, nie als Bild.
- Das Zeichen ist ein Entwurf dieses Systems und kein Fremdlogo. Änderungen daran geschehen hier, nicht in der App.

## Komponenten

Marke: `Logo`, `Icon`. Aktionen: `Button`, `ShutterButton`. Eingabe: `Field`, `Segmented`, `Stepper`, `Toggle`, `ColorPicker`. Anzeige: `Avatar`, `StatusChip`, `Streak`, `Card`, `WeekStrip`, `Scoreboard`, `PhotoTile`, `DebtRow`. Navigation: `NavBar`, `AppBar`. Rückmeldung: `Banner`, `Sheet`. Die Klassen tragen den Präfix `ds-` und stehen in `components/bundle.css`; sie nutzen ausschließlich Tokens. `components/bundle.js` ist die React-Referenz (`window.DS`); die Svelte-App übernimmt dasselbe Markup und dieselben Klassen, sie importiert kein React. Hinter jedem Namen liegt eine README mit Eigenschaften, Regeln und Verboten.

## Bekannte Abweichungen

- `ink-faint` (Hell `#8f98ab`, Dunkel `#5e6985`) erreicht 4,5:1 absichtlich nicht; er ist nur für Platzhalter und gesperrte Elemente gedacht.
- Die Schriften sind auf das lateinische Zeichenset beschränkt (Deutsch und westeuropäische Sprachen).
- Die Vorschauen laden React; die Produktiv-App ist Svelte und teilt nur `tokens.css`, `bundle.css` und die Markup-Regeln.
