# Double Sweat

Selbst gehostete Paar-Fitness-Accountability-App. Zwei Partner setzen je ein Wochenziel (Trainingstage pro
Woche), loggen Workouts per Foto, sehen gegenseitig den Fortschritt und haben einen Wetteinsatz: Wer das Ziel
verfehlt, schuldet dem anderen etwas. Kein Statistik-Tracking, Fokus auf gemeinsames Dranbleiben.

> **Status: in Entwicklung.** Aktuell lauffähig ist das Backend mit Konten, Anmeldung, Team-Einladungen und
> optionalem Mailversand. Wochenlogik, Check-ins, Web-Oberfläche, Push und Android-App folgen.
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

Erstes Konto anlegen (Registrierung mit Setup-Token, `SIGNUP_MODE=token`):

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"anna@example.org","password":"ein langes passwort","displayName":"Anna","timezone":"Europe/Berlin","setupToken":"<SETUP_TOKEN>"}'
```

## Konfiguration

Alle Einstellungen stehen kommentiert in [`.env.example`](.env.example). Wichtig:

| Variable | Bedeutung |
|---|---|
| `PUBLIC_URL` | Öffentliche Adresse (https). Basis für Mail-Links und CSRF-Prüfung. |
| `SIGNUP_MODE` | `open`, `token` (Standard), `invite-only` oder `closed`: wer Teams gründen darf. |
| `SETUP_TOKEN` | Geheimnis zum Gründen eines Teams bei `SIGNUP_MODE=token`. |
| `SMTP_URL` | Optional. Aktiviert E-Mail-Bestätigung und "Passwort vergessen". |
| `TRUST_PROXY` | Welchen Proxys `X-Forwarded-For` geglaubt wird (wichtig für Rate-Limits). |

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

## Sicherheit in Kürze

- Passwörter: argon2id. Session-Cookie `__Host-` + HttpOnly + Secure + SameSite=Lax, CSRF-Schutz über
  Origin-Prüfung und Token. App-Anmeldung mit kurzlebigen Access-Tokens und rotierenden Refresh-Tokens
  (Wiederverwendung widerruft die ganze Anmeldung).
- Einladungscodes (80 Bit) sind einmalig, 7 Tage gültig und liegen nur als Hash in der Datenbank.
- Rate-Limits für Anmeldung, Registrierung, Einladungen, Passwort-Reset (persistent, überleben Neustarts).
- Mail-Links verwenden immer `PUBLIC_URL`, nie den Host-Header. "Passwort vergessen" antwortet immer gleich.
- Es darf nur **eine** API-Instanz laufen (SQLite und In-Process-Scheduler).
