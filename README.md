# Double Sweat

Selbst gehostete Paar-Fitness-Accountability-App. Zwei Partner setzen je ein Wochenziel (Trainingstage pro
Woche), loggen Workouts per Foto, sehen gegenseitig den Fortschritt und haben einen Wetteinsatz: Wer das Ziel
verfehlt, schuldet dem anderen etwas. Kein Statistik-Tracking, Fokus auf gemeinsames Dranbleiben.

> **Status: in Entwicklung.** Aktuell lauffähig ist das Backend: Konten und Anmeldung, Team-Einladungen,
> optionaler Mailversand, Wochenziele, Foto-Check-ins mit Wochenlogik pro Zeitzone, Dashboard, Wetteinsatz mit
> automatischer Wochenabrechnung, Schulden und Historie. Web-Oberfläche, Push und Android-App folgen.
> Diese README wird mit Docker-Setup, Reverse-Proxy-Beispielen und APK-Anleitung vervollständigt.

## Aufbau

```
apps/api   Hono-API (TypeScript), SQLite via Drizzle, OpenAPI-Spec unter /api/v1/openapi.json
apps/web   Web-Oberfläche (SvelteKit, PWA)                         [folgt]
apps/android  Capacitor-Wrapper für die Android-App                [folgt]
```

Keine Telemetrie, keine externen Dienste im Standardbetrieb. Mailversand ist optional und läuft über einen
SMTP-Server deiner Wahl.

## Entwicklung

Voraussetzungen: Node.js 22, pnpm 10.

```bash
pnpm install
cp .env.example .env     # SETUP_TOKEN setzen, PUBLIC_URL=http://localhost:3000 für lokale Entwicklung
pnpm dev:api
```

```bash
pnpm test        # Tests aller Pakete
pnpm typecheck
pnpm lint
```

Die API ist unter `/api/v1` erreichbar, die OpenAPI-Spezifikation unter `/api/v1/openapi.json`.

Erstes Konto anlegen (Registrierung mit Setup-Token, `SIGNUP_MODE=token`):

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"anna@example.org","password":"ein langes passwort","displayName":"Anna","timezone":"Europe/Berlin","setupToken":"<SETUP_TOKEN>"}'
```

## Konfiguration

Alle Einstellungen stehen kommentiert in [`.env.example`](.env.example). Wichtig:

| Variable      | Bedeutung                                                                        |
| ------------- | -------------------------------------------------------------------------------- |
| `PUBLIC_URL`  | Öffentliche Adresse (https). Basis für Mail-Links und CSRF-Prüfung.              |
| `SIGNUP_MODE` | `open`, `token` (Standard), `invite-only` oder `closed`: wer Teams gründen darf. |
| `SETUP_TOKEN` | Geheimnis zum Gründen eines Teams bei `SIGNUP_MODE=token`.                       |
| `SMTP_URL`    | Optional. Aktiviert E-Mail-Bestätigung und "Passwort vergessen".                 |
| `TRUST_PROXY` | Welchen Proxys `X-Forwarded-For` geglaubt wird (wichtig für Rate-Limits).        |

## Server-CLI

Für Aufgaben, die keinen HTTP-Zugriff brauchen (im Container: `docker compose exec app …`):

```bash
pnpm --filter @double-sweat/api cli reset-password anna@example.org   # Einmal-Link, 30 Minuten gültig
pnpm --filter @double-sweat/api cli create-team "Anna und Ben"        # leeres Team + Einladung
pnpm --filter @double-sweat/api cli create-invite <teamId>
pnpm --filter @double-sweat/api cli mail-test anna@example.org
pnpm --filter @double-sweat/api cli backup ./backup.db
```

Ohne SMTP ist die CLI der Weg, ein vergessenes Passwort zurückzusetzen.

## Wochenlogik in Kürze

- Die Woche läuft von Montag 00:00 bis Montag 00:00 in der **Zeitzone des jeweiligen Nutzers**. Jeder Partner
  hat also seine eigene Woche; Umstellungswochen mit 167 oder 169 Stunden sind berücksichtigt.
- Das Datum eines Check-ins bestimmt allein der Server aus seiner Uhr und der Zeitzone des Nutzers.
  Pro Tag zählt höchstens ein Check-in.
- Das Wochenziel (1 bis 7 Tage) ist nur für die **kommende** Woche änderbar. Eine Zeitzonenänderung gilt ab
  dem nächsten Wochenstart (ohne bisherige Check-ins sofort).
- Fotos werden geprüft (JPEG, PNG, WebP), auf höchstens 1600 px verkleinert und ohne EXIF/GPS als JPEG
  gespeichert. Abrufbar sind sie nur für angemeldete Mitglieder desselben Teams.

## Wetteinsatz und Abrechnung

- Jedes Team hat einen Freitext-Einsatz (`PUT /api/v1/bets`). Eine Änderung gilt erst für Wochen, die bei
  **keinem** Partner schon begonnen haben. Der Einsatz lässt sich also nicht kurz vor der Abrechnung ändern.
- Der Wochenabschluss läuft automatisch jede Minute, ist idempotent (pro Nutzer und Woche genau ein Ergebnis)
  und holt verpasste Wochen nach einem Neustart nach. Jeder Partner wird zum Ende **seiner** Woche abgerechnet.
- Gewertet wird ab dem ersten Montag, nachdem das Team vollständig ist; ein unvollständiges Team wird nicht
  abgerechnet. Wer kein Ziel gesetzt hat, wird für die Woche nicht gewertet.
- Wer das Ziel verfehlt, schuldet dem anderen den Einsatz (verfehlen beide, schuldet jeder dem anderen).
  Die Schuld speichert den Einsatztext zum Abrechnungszeitpunkt. Nur die Person, der etwas geschuldet wird,
  kann sie als eingelöst markieren.
- Zum Testen eines Wochenwechsels ohne Warten: `DEV_CLOCK_OFFSET_HOURS=168` (eine Woche vor) setzen und den
  Server neu starten. Die Einstellung wird mit `NODE_ENV=production` abgelehnt. Manuell abrechnen: `cli settle`.

## Sicherheit in Kürze

- Passwörter: argon2id. Session-Cookie `__Host-` + HttpOnly + Secure + SameSite=Lax, CSRF-Schutz über
  Origin-Prüfung und Token. App-Anmeldung mit kurzlebigen Access-Tokens und rotierenden Refresh-Tokens
  (Wiederverwendung widerruft die ganze Anmeldung).
- Einladungscodes (80 Bit) sind einmalig, 7 Tage gültig und liegen nur als Hash in der Datenbank.
- Rate-Limits für Anmeldung, Registrierung, Einladungen, Passwort-Reset (persistent, überleben Neustarts).
- Mail-Links verwenden immer `PUBLIC_URL`, nie den Host-Header. "Passwort vergessen" antwortet immer gleich.
- Foto-Upload: Format wird an den Bytes erkannt, Pixel-Limit gegen Dekompressions-Bomben, exakte Duplikate
  im Team werden abgelehnt.
- Es darf nur **eine** API-Instanz laufen (SQLite und In-Process-Scheduler).
