# Double Sweat

Selbst gehostete Paar-Fitness-Accountability-App. Zwei Partner setzen je ein Wochenziel (Trainingstage pro
Woche), loggen Workouts per Foto, sehen gegenseitig den Fortschritt und haben einen Wetteinsatz: Wer das Ziel
verfehlt, schuldet dem anderen etwas. Kein Statistik-Tracking, Fokus auf gemeinsames Dranbleiben.

Keine Telemetrie und keine externen Dienste im Standardbetrieb. Mailversand und Push über Hersteller-Dienste
sind optional und im Abschnitt [Datenschutz](#datenschutz) beschrieben.

> **Status: in Entwicklung.** Das Backend ist vollständig und getestet: Konten, Anmeldung, Team-Einladungen,
> optionaler Mailversand, Wochenziele, Foto-Check-ins mit Wochenlogik pro Zeitzone, Dashboard, Wetteinsatz mit
> automatischer Wochenabrechnung, Schulden, Historie, Push (Web Push und UnifiedPush), Nudges und
> Abend-Erinnerung. **Web-Oberfläche und Android-App folgen**; bis dahin ist die API unter `/api/v1`
> bedienbar (OpenAPI-Spezifikation: `/api/v1/openapi.json`).

## Inhalt

- [Schnellstart mit Docker](#schnellstart-mit-docker)
- [HTTPS und Reverse-Proxy](#https-und-reverse-proxy)
- [Konfiguration](#konfiguration)
- [Erste Schritte](#erste-schritte)
- [E-Mail (optional)](#e-mail-optional)
- [Push-Benachrichtigungen](#push-benachrichtigungen)
- [Betrieb: Updates, Backup, Wiederherstellung](#betrieb)
- [Wochenlogik und Wetteinsatz](#wochenlogik-und-wetteinsatz)
- [Sicherheit](#sicherheit) · [Datenschutz](#datenschutz)
- [Entwicklung](#entwicklung)

## Schnellstart mit Docker

Voraussetzungen: Docker mit Compose, eine Domain, die auf den Server zeigt, offene Ports 80 und 443.
**HTTPS ist Pflicht**: Kamera und Push funktionieren in Browsern und in der App nur über HTTPS.

```bash
git clone https://github.com/Nicgeon/double-sweat.git
cd double-sweat
cp .env.example .env
```

In der `.env` mindestens setzen:

```ini
PUBLIC_URL=https://sweat.example.org
DOMAIN=sweat.example.org
SETUP_TOKEN=<Ausgabe von: openssl rand -base64 24>
```

Starten, mit Caddy als HTTPS-Reverse-Proxy (holt das Zertifikat automatisch):

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Prüfen:

```bash
curl https://sweat.example.org/api/v1/health
docker compose ps        # Status "healthy"
docker compose logs -f app
```

Ohne Caddy (du hast schon einen Reverse-Proxy) reicht `docker compose up -d --build`. Der Port ist dann nur
lokal erreichbar (`127.0.0.1:3000`) und dein Proxy leitet dorthin weiter.

> **Es darf nur eine Instanz laufen.** SQLite und der Scheduler (Wochenabschluss, Erinnerungen) arbeiten im
> Prozess. Nicht skalieren, nicht zwei Container auf dieselbe Datenbank richten.

**Hinter einem Firmenproxy mit TLS-Inspektion?** Dann braucht der Build dessen CA:
`docker compose build --secret id=extra_ca,src=/pfad/zur/ca.pem` (sie landet nicht im Image).
Eigene Registry für die Basis-Images: `--build-arg NODE_BUILD_IMAGE=… --build-arg NODE_RUNTIME_IMAGE=…`.

## HTTPS und Reverse-Proxy

| Variante                | Datei                                                                                                        | Hinweis                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Caddy** (empfohlen)   | [`deploy/docker-compose.caddy.yml`](deploy/docker-compose.caddy.yml), [`deploy/Caddyfile`](deploy/Caddyfile) | Zertifikat und Erneuerung automatisch (Let's Encrypt)                                                    |
| **Traefik**             | [`deploy/docker-compose.traefik.yml`](deploy/docker-compose.traefik.yml)                                     | Labels für einen bestehenden Traefik v3; Entrypoint, Resolver und Netzwerkname anpassen                  |
| Anderer Proxy (nginx …) |                                                                                                              | Auf `127.0.0.1:3000` weiterleiten, `X-Forwarded-For` setzen, Upload-Limit mindestens `MAX_UPLOAD_MB` + 1 |

Wichtig für jeden Proxy:

- `PUBLIC_URL` muss exakt der Adresse entsprechen, unter der Nutzer die App öffnen (Schema, Host, Port). Sie
  bestimmt die CSRF-Prüfung, die Cookies und die Links in Mails. Die Adresse im `Host`-Header wird nie benutzt.
- `TRUST_PROXY` legt fest, welchen Adressen `X-Forwarded-For` geglaubt wird (Standard: lokal und private
  Netze, passt zu Docker). Ist der App-Port **direkt aus dem Internet** erreichbar, setze `TRUST_PROXY=none`.
  Sonst könnte jeder seine IP fälschen und damit die Rate-Limits umgehen.

## Konfiguration

Alle Einstellungen stehen kommentiert in [`.env.example`](.env.example). Die App prüft sie beim Start und
bricht mit einer klaren Meldung ab, wenn etwas fehlt oder ein Platzhalter (z. B. `CHANGE_ME`) übrig ist.

| Variable                                                       | Bedeutung                                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                                   | Öffentliche Adresse (https). Basis für Cookies, CSRF-Prüfung und Mail-Links.                                                                                                                       |
| `SIGNUP_MODE`                                                  | Wer ein Team gründen darf: `open` (jeder), `token` (Standard: mit `SETUP_TOKEN`), `invite-only` (nur per CLI), `closed` (niemand). Der Partner tritt immer per Einladung bei (außer bei `closed`). |
| `SETUP_TOKEN`                                                  | Geheimnis zum Gründen eines Teams bei `SIGNUP_MODE=token`.                                                                                                                                         |
| `MAX_TEAMS`                                                    | Höchstzahl an Teams (0 = unbegrenzt).                                                                                                                                                              |
| `TRUST_PROXY`                                                  | Welchen Proxys `X-Forwarded-For` geglaubt wird.                                                                                                                                                    |
| `MAX_UPLOAD_MB`                                                | Größtes Foto (Standard 12).                                                                                                                                                                        |
| `SMTP_URL`, `MAIL_FROM`, `SMTP_REQUIRE_TLS`                    | Optionaler Mailversand.                                                                                                                                                                            |
| `WEBPUSH_ENABLED`, `UNIFIEDPUSH_ENABLED`, `PUSH_ALLOWED_HOSTS` | Push-Anbieter und erlaubte lokale Ziele.                                                                                                                                                           |
| `CORS_APP_ORIGINS`                                             | Origins der Android-App (Standard `https://localhost`).                                                                                                                                            |

Die Daten (Datenbank, Fotos, Schlüssel) liegen im Volume `data` unter `/data`.

## Erste Schritte

Solange es noch keine Web-Oberfläche gibt, geht alles über die API. Team gründen (mit dem Setup-Token):

```bash
curl -X POST https://sweat.example.org/api/v1/auth/register \
  -H 'content-type: application/json' -H 'origin: https://sweat.example.org' \
  -d '{"email":"anna@example.org","password":"ein langes passwort","displayName":"Anna",
       "timezone":"Europe/Berlin","setupToken":"<SETUP_TOKEN>","client":"app"}'
```

Mit `"client":"app"` bekommst du Bearer-Tokens zurück (`Authorization: Bearer …`), mit `"web"` ein Session-Cookie.
Danach den Partner einladen (der Code wird nur einmal angezeigt und gilt 7 Tage):

```bash
curl -X POST https://sweat.example.org/api/v1/teams/invites -H 'authorization: Bearer <accessToken>' \
  -H 'origin: https://sweat.example.org' -H 'content-type: application/json' -d '{}'
```

Der Partner registriert sich mit `"inviteCode":"XXXX-XXXX-XXXX-XXXX"` statt `setupToken`. Die Teamgröße ist auf
genau zwei begrenzt.

Per Server-CLI (im Container: `docker compose exec app cli …`):

| Befehl                       | Zweck                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `cli create-team [name]`     | Leeres Team und Einladung anlegen (umgeht `SIGNUP_MODE`, nötig bei `invite-only`) |
| `cli create-invite <teamId>` | Neue Einladung                                                                    |
| `cli reset-password <email>` | Einmal-Link zum Zurücksetzen des Passworts (30 Minuten gültig)                    |
| `cli settle`                 | Wochenabschluss sofort ausführen                                                  |
| `cli mail-test <adresse>`    | Testmail über `SMTP_URL` senden                                                   |
| `cli backup <datei>`         | Konsistente Datenbankkopie                                                        |

## E-Mail (optional)

Ohne `SMTP_URL` verschickt die App **keine** Mails. Ein vergessenes Passwort setzt dann die Person zurück, die
den Server betreibt: `docker compose exec app cli reset-password anna@example.org` gibt einen Einmal-Link aus.

Mit `SMTP_URL` (z. B. `smtps://benutzer:passwort@mail.example.org:465` oder `smtp://…:587` mit STARTTLS) gibt es:

- E-Mail-Bestätigung nach der Registrierung,
- „Passwort vergessen“ für alle bestätigten Adressen (Link 30 Minuten gültig, einmalig, beendet alle Sitzungen),
- Adresswechsel mit Bestätigung an der neuen und Information an die alte Adresse.

Zustellbarkeit liegt bei dir: richte für die Absenderdomain **SPF, DKIM und DMARC** ein, sonst landen die
Mails im Spam. `cli mail-test` prüft die Verbindung. TLS wird erzwungen (`SMTP_REQUIRE_TLS=true`).

## Push-Benachrichtigungen

- **UnifiedPush / ntfy** (empfohlen, vollständig selbst hostbar; vorgesehen für die Android-App): Auf dem Handy
  die ntfy-App als Verteiler installieren. Läuft ntfy in deinem eigenen Netz, trage dessen Hostnamen in
  `PUSH_ALLOWED_HOSTS` ein, sonst lehnt der Server lokale Ziele ab.
- **Web Push** (Browser, installierte PWA): läuft technisch über den Push-Dienst des Browser-Herstellers
  (Mozilla, Google, Apple). Der Inhalt ist Ende-zu-Ende verschlüsselt, die Metadaten sieht der Hersteller.
  Wer das nicht möchte, setzt `WEBPUSH_ENABLED=false`. Auf iOS funktioniert Web Push nur für installierte PWAs.
- Zusätzlich gibt es immer ein **Postfach** (`GET /api/v1/notifications`), das auch ohne Push funktioniert.
- Nudge: `POST /api/v1/nudges`, höchstens einmal pro Stunde. Abend-Erinnerung: zur persönlichen Uhrzeit
  (Standard 19:00), wenn das Wochenziel gefährdet ist (heute noch kein Check-in und kein Puffer mehr).
- FCM (Firebase) ist nicht Teil des Standard-Builds; die Anbieter-Schnittstelle ist dafür vorbereitet.

## Betrieb

**Updates**

```bash
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Datenbank-Migrationen laufen beim Start automatisch. Sichere vorher.

**Backup** (Datenbank konsistent per `VACUUM INTO`, plus Fotos, bei laufendem Betrieb):

```bash
./scripts/backup.sh            # → backups/double-sweat-<Datum>.tar.gz (Rechte 0600)
```

Das Archiv enthält Passwort-Hashes und alle Fotos: sicher aufbewahren, am besten verschlüsselt, regelmäßig
automatisieren (cron) und die Wiederherstellung einmal testen.

**Wiederherstellung** (auch auf einem neuen Server; die App ist gestoppt, ein vorhandenes Volume wird überschrieben):

```bash
docker compose down
docker run --rm -v double-sweat_data:/data -v "$PWD/backups:/backup:ro" --entrypoint sh node:22-bookworm-slim -c '
  set -e
  tar -xzf /backup/double-sweat-<Datum>.tar.gz -C /data
  mv /data/backups/latest.db /data/double-sweat.db
  rm -rf /data/double-sweat.db-wal /data/double-sweat.db-shm /data/backups
  chown -R 10001:10001 /data && chmod 0700 /data && chmod 0600 /data/double-sweat.db'
docker compose up -d
```

(Der Volume-Name hängt vom Projektordner ab: `docker volume ls`.)

**Logs und Gesundheit.** Logs sind JSON auf stdout und enthalten keine Passwörter, Tokens, Adressen oder
Foto-Namen. `GET /api/v1/health` antwortet ohne Anmeldung und dient als Healthcheck (und als Erreichbarkeitstest
der Android-App).

## Wochenlogik und Wetteinsatz

- Die Woche läuft von Montag 00:00 bis Montag 00:00 in der **Zeitzone des jeweiligen Nutzers**. Jeder Partner
  hat also seine eigene Woche; Umstellungswochen mit 167 oder 169 Stunden sind berücksichtigt.
- Das Datum eines Check-ins bestimmt allein der Server aus seiner Uhr und der Zeitzone des Nutzers. Pro Tag
  zählt höchstens ein Check-in. Eine Zeitzonenänderung gilt ab dem nächsten Wochenstart (ohne bisherige
  Check-ins sofort).
- Das Wochenziel (1 bis 7 Tage) ist nur für die **kommende** Woche änderbar.
- Der Einsatz ist Freitext pro Team; eine Änderung gilt erst für Wochen, die bei **keinem** Partner schon
  begonnen haben. Er lässt sich also nicht kurz vor der Abrechnung ändern.
- Der Wochenabschluss läuft automatisch jede Minute, ist idempotent (pro Nutzer und Woche genau ein Ergebnis)
  und holt verpasste Wochen nach einem Neustart nach. Gewertet wird ab dem ersten Montag, nachdem das Team
  vollständig ist; ein unvollständiges Team wird nicht abgerechnet. Wer kein Ziel gesetzt hat, wird nicht gewertet.
- Wer das Ziel verfehlt, schuldet dem anderen den Einsatz (verfehlen beide, schuldet jeder dem anderen). Die
  Schuld speichert den Einsatztext zum Abrechnungszeitpunkt. Nur die Person, der etwas geschuldet wird, kann sie
  als eingelöst markieren.
- Zum Testen eines Wochenwechsels ohne Warten: `DEV_CLOCK_OFFSET_HOURS=168` setzen (eine Woche vor) und neu
  starten. Mit `NODE_ENV=production` wird die Einstellung abgelehnt.

## Sicherheit

- **Anmeldung:** Passwörter mit argon2id. Web: Cookie `__Host-` + HttpOnly + Secure + SameSite=Lax, Sitzung
  14 Tage Leerlauf bzw. 90 Tage absolut. App: kurzlebige Access-Tokens (15 min) und rotierende Refresh-Tokens;
  wird ein bereits benutztes Refresh-Token erneut vorgelegt, ist die ganze Anmeldung widerrufen.
- **CSRF/CORS:** Origin-Prüfung für alle zustandsändernden Anfragen, bei Cookies zusätzlich Session-Token.
  CORS nur für die konfigurierten App-Origins und ohne Credentials.
- **Brute-Force:** Persistente Rate-Limits (überleben Neustarts) für Anmeldung, Registrierung, Einladungen,
  Passwort-Reset, Uploads und Nudges; Antworten verraten nicht, ob eine Adresse existiert.
- **Einladungen:** 80 Bit Zufall, einmalig, 7 Tage gültig, nur als Hash gespeichert; die Teamgröße von zwei ist
  auch auf Datenbankebene erzwungen.
- **Fotos:** Format wird an den Bytes erkannt (nicht am Dateinamen), Pixel-Limit gegen Dekompressions-Bomben,
  Neu-Kodierung als JPEG ohne EXIF/GPS, serverseitige Dateinamen, Abruf nur für Mitglieder desselben Teams.
- **SSRF:** Push-Ziele kommen vom Client; der Server ruft sie nur über einen gehärteten Client auf (nur https,
  nur öffentliche Adressen bei jedem Verbindungsaufbau erneut geprüft, keine Weiterleitungen, Zeit- und
  Größenlimits).
- **Container:** läuft als Nicht-root (uid 10001), schreibgeschütztes Dateisystem, keine Linux-Capabilities,
  `no-new-privileges`, Port nur lokal gebunden.
- **Secrets:** Platzhalter aus `.env.example` werden abgelehnt; Logs enthalten keine Zugangsdaten.

Sicherheitslücke gefunden? Bitte nicht öffentlich als Issue melden, sondern den Betreiber des Repositories direkt
kontaktieren.

## Datenschutz

- Keine Telemetrie, keine Tracker, keine externen Schriften oder Skripte.
- Gespeichert werden nur: Konto (E-Mail, Name, Zeitzone), Check-ins mit Foto und optionaler Notiz, Ziele,
  Ergebnisse, Einsatz/Schulden, Push-Registrierungen. Es gibt keine IP-Speicherung (nur kurzlebige Rate-Limit-
  Zähler mit gehashten Schlüsseln).
- Optionale externe Berührungspunkte, alle abschaltbar: dein SMTP-Server (Mail), der Push-Dienst des
  Browser-Herstellers (nur Web Push, Inhalt verschlüsselt), dein ntfy-Server (UnifiedPush).
- **Datenexport** (`POST /api/v1/me/export`, Passwort nötig): liefert einen Einmal-Link (60 Sekunden gültig, ohne
  Sitzung nutzbar), der ein ZIP mit `data.json` und allen eigenen Fotos streamt. Enthalten sind nur die eigenen
  Daten (vom Partner nur der Anzeigename), keine Passwort-Hashes und keine Push-Zugangsdaten.
- Konto löschen (`DELETE /api/v1/me`, Passwort nötig) entfernt die eigenen Check-ins samt Fotodateien; das Team
  des Partners bleibt bestehen. Team auflösen (`DELETE /api/v1/team`) löscht alle Teamdaten und -fotos.

## Entwicklung

Voraussetzungen: Node.js 22, pnpm 10.

```bash
pnpm install
cp .env.example .env     # SETUP_TOKEN setzen, PUBLIC_URL=http://localhost:3000
pnpm dev:api
```

```bash
pnpm test        # Tests (Vitest)
pnpm typecheck
pnpm lint        # Biome
```

```
apps/api       Hono-API (TypeScript), SQLite via Drizzle, Scheduler, CLI
apps/web       Web-Oberfläche (SvelteKit, PWA)               [folgt]
apps/android   Capacitor-Wrapper für die Android-App         [folgt]
deploy/        Caddy- und Traefik-Beispiele
scripts/       Backup-Skript
```

Branches: `main` (stabil, getestet) und `develop` (Integration). Änderungen laufen über `develop`.
