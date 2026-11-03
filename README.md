# Double Sweat

Selbst gehostete Paar-Fitness-Accountability-App. Zwei Partner setzen je ein Wochenziel (Trainingstage pro
Woche), loggen Workouts per Foto, sehen gegenseitig den Fortschritt und haben einen Wetteinsatz: Wer das Ziel
verfehlt, schuldet dem anderen etwas. Kein Statistik-Tracking, Fokus auf gemeinsames Dranbleiben.

Keine Telemetrie und keine externen Dienste im Standardbetrieb. Mailversand und Push über Hersteller-Dienste
sind optional und im Abschnitt [Datenschutz](#datenschutz) beschrieben.

> **Status: in Entwicklung.** Backend, **Web-Oberfläche** (mobil und Desktop, Hell und Dunkel, als PWA
> installierbar) und **Android-App** sind gebaut und automatisch getestet: Konten, Anmeldung, Einladung per
> Link, optionaler Mailversand, Wochenziele, Foto-Check-ins (mehrere pro Tag, optional mit Selfie) mit Wochenlogik pro Zeitzone,
> Anzeigetafel, Wetteinsatz mit automatischer Wochenabrechnung, Schulden, Belohnungen, Reaktionen, Verlauf,
> Push (Web Push und UnifiedPush), Anstupsen und Abend-Erinnerung. **Auf einem echten Gerät ist die App noch nicht ausprobiert**
> (siehe [Android-App](#android-app), Abschnitt "Was noch nicht geprüft ist").
> Die OpenAPI-Spezifikation liegt unter `/api/v1/openapi.json`.

## Inhalt

- [Schnellstart mit Docker](#schnellstart-mit-docker)
- [HTTPS und Reverse-Proxy](#https-und-reverse-proxy)
- [Konfiguration](#konfiguration)
- [Erste Schritte](#erste-schritte)
- [E-Mail (optional)](#e-mail-optional)
- [Sprachen](#sprachen)
- [Push-Benachrichtigungen](#push-benachrichtigungen)
- [Android-App](#android-app)
- [Betrieb: Updates, Backup, Wiederherstellung](#betrieb)
- [Wochenlogik und Wetteinsatz](#wochenlogik-und-wetteinsatz)
- [Sicherheit](#sicherheit) · [Datenschutz](#datenschutz)
- [Entwicklung](#entwicklung) · [Release veröffentlichen](#release-veröffentlichen-github)
- [Lizenz](#lizenz)
- [Roadmap](#roadmap)

## Schnellstart mit Docker

Voraussetzungen: Docker mit Compose, eine Domain, die auf den Server zeigt, offene Ports 80 und 443.
**HTTPS ist Pflicht**: Kamera und Push funktionieren in Browsern und in der App nur über HTTPS.

Startet die Kamera im Browser nicht, sagt die App, woran es liegt: **blockiert** (Kamera-Symbol in der Adressleiste
bzw. Seiteneinstellungen des Browsers), **belegt** (meist hat eine andere App sie offen, etwa die Windows-Kamera-App
oder ein Videoanruf: schließen und "Kamera erneut versuchen") oder **keine Kamera gefunden**. Die Fotoauswahl
funktioniert immer als Ausweg.

**Selfie (freiwillig):** Zu jedem Check-in kann man ein zweites Bild von der Frontkamera mitschicken, als kleines
Bild im Foto (wie bei BeReal). Im Browser schaltet man in der Kamera das Selfie-Symbol ein: nach dem Foto der
Rückkamera folgt nach zwei Sekunden Vorlauf automatisch die Frontkamera. Alternativ fügt man in der Vorschau ein
Selfie hinzu, ersetzt oder entfernt es. In der Android-App läuft es genauso, mit der Live-Kamera der App; dort ist
der Schalter ab Werk an (das Selfie kommt gleich nach dem Foto, "Selfie überspringen" oder das Symbol schaltet es ab,
die Wahl wird gemerkt). Ein kurzer Fehler der Frontkamera wird nach einer Pause erneut versucht. Ohne
Live-Kamera (Berechtigung verweigert, keine Kamera) läuft das Selfie über die Fotoauswahl. Ohne Selfie ändert sich
nichts: ein Foto genügt. Das Selfie wird wie das Foto
verarbeitet (ohne EXIF/GPS) und zählt nicht für die Duplikat-Prüfung.

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
| `MAX_UPLOAD_MB`                                                | Größtes Bild, Foto wie Selfie (Standard 12).                                                                                                                                                       |
| `DEFAULT_LOCALE`                                               | Standardsprache für neue Konten, wenn der Browser keine unterstützte Sprache meldet: `de` (Standard) oder `en`. Siehe [Sprachen](#sprachen).                                                       |
| `SMTP_URL`, `MAIL_FROM`, `SMTP_REQUIRE_TLS`                    | Optionaler Mailversand.                                                                                                                                                                            |
| `WEBPUSH_ENABLED`, `UNIFIEDPUSH_ENABLED`, `PUSH_ALLOWED_HOSTS` | Push-Anbieter und erlaubte lokale Ziele.                                                                                                                                                           |
| `FCM_ENABLED`, `FCM_SERVICE_ACCOUNT_FILE`                      | Optional: Push über Firebase Cloud Messaging (Dienstkonto-Datei), siehe [Push](#push-benachrichtigungen).                                                                                          |
| `CORS_APP_ORIGINS`                                             | Origins der Android-App (Standard `https://localhost`).                                                                                                                                            |

Die Daten (Datenbank, Fotos, Schlüssel) liegen im Volume `data` unter `/data`.

## Erste Schritte

**Im Browser:** Öffne `PUBLIC_URL`, wähle „Neues Team gründen“ (mit dem `SETUP_TOKEN` aus der `.env`), setze dein
Wochenziel und lade deinen Partner über **Heute → Einladen** (Starthilfe) ein. Der Link (`/join/…`) führt ihn durch die
Anmeldung; hat er schon ein Konto, kommt er nach der Anmeldung zurück zur Einladung. Auf dem Handy lässt sich die
Seite über das Browser-Menü als App installieren („Zum Startbildschirm“).

Dieselben Schritte gehen auch direkt über die API. Team gründen (mit dem Setup-Token):

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

Jede Person wählt ihre **Identitätsfarbe** aus sieben Farben (`ember`, `tide`, `orchid`, `moss`, `sky`, `cocoa`,
`graphite`), bei der Registrierung mit `"color"` oder später mit `PATCH /api/v1/me`. Im Team sind die Farben
verschieden (sonst `409 color_taken`); ohne Wahl bekommt Platz 1 Ember und Platz 2 Tide. Die Form (Kreis oder
Quadrat) hängt am Platz im Team und nicht an der Farbe.

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

**Beispiel Gmail.** Das geht ohne eigene Domain, die Mails laufen dann aber über Google (siehe
[Datenschutz](#datenschutz)). Voraussetzung ist ein Google-Konto mit Bestätigung in zwei Schritten; dort legst du
unter <https://myaccount.google.com/apppasswords> ein **App-Passwort** an (16 Buchstaben, nicht dein normales
Passwort). Dann in der `.env`:

```bash
SMTP_URL=smtps://deine.adresse%40gmail.com:abcdefghijklmnop@smtp.gmail.com:465
MAIL_FROM=Double Sweat <deine.adresse@gmail.com>
```

- Der Benutzername ist die volle Gmail-Adresse; das `@` steht in der URL als `%40`. Das App-Passwort schreibst du
  ohne Leerzeichen. Enthält ein Passwort Sonderzeichen, kodiere sie prozentweise (`#` = `%23`, `/` = `%2F`).
- `MAIL_FROM` sollte die Gmail-Adresse sein; Gmail ersetzt fremde Absender ohnehin.
- Statt Port 465 geht auch `smtp://…@smtp.gmail.com:587` (STARTTLS).
- Gmail begrenzt den Versand (einige hundert Mails pro Tag), für zwei Personen mehr als genug.
- Danach den Container neu starten (`docker compose up -d`) und prüfen:
  `docker compose exec app cli mail-test deine.adresse@gmail.com`.

Andere Anbieter (Mailbox.org, Posteo, Strato, eigener Server) funktionieren genauso: Host, Port und Benutzer
stehen in deren SMTP-Hilfe, Port 465 = `smtps://`, Port 587 = `smtp://` mit STARTTLS.

## Sprachen

Die Oberfläche gibt es auf **Deutsch** und **Englisch**. Jedes Konto hat seine eigene Sprache (unter _Profil →
Sprache_); Paare dürfen also verschiedene Sprachen nutzen.

- **Oberfläche:** Vor der Anmeldung gilt die zuletzt gewählte Sprache, sonst die des Browsers, sonst
  `DEFAULT_LOCALE` des Servers. Nach der Anmeldung gilt die Sprache des Kontos. Auf den Seiten vor der Anmeldung
  gibt es unten eine Sprachwahl.
- **Mitteilungen und Push:** Sie entstehen in der Sprache des **Empfängers**. Das Postfach (_Benachrichtigungen_)
  zeigt auch ältere Einträge nach einem Sprachwechsel in der neuen Sprache.
- **E-Mails:** Bestätigung, Passwort-Reset und Hinweise kommen in der Sprache des Kontos.
- **Fehlermeldungen der API:** Der Client sendet `Accept-Language`; der Fehlercode (`code`) bleibt in jeder Sprache
  gleich, nur die Meldung (`message`) wechselt.
- **Android-App:** Die Kanalnamen der Benachrichtigungen folgen der Gerätesprache (Deutsch oder Englisch).
- **Datumsformate** (Wochentage, Monate, Uhrzeiten) richten sich nach der gewählten Sprache. Die Kalenderwoche
  heißt auf Englisch _Week_.

### Eine Sprache hinzufügen

1. Server: `apps/api/src/i18n/locales.ts` (Sprache in `LOCALES`), dazu die Texte in `notifications.ts` (Mitteilungen),
   `modules/mail/templates.ts` (Mails) und `errors.ts` (Fehlermeldungen; fehlende Einträge fallen auf Deutsch zurück).
   Ein Test (`pnpm test`) meldet, wenn eine im Code geworfene Fehlermeldung keine Übersetzung hat.
2. Web: `apps/web/src/lib/i18n/` — `en.ts` als Vorlage kopieren (der Compiler verlangt alle Schlüssel und dieselben
   Platzhalter), in `messages.ts` unter `LOCALES`, `LANGUAGE_NAMES` und `DICTIONARIES` eintragen.
3. Android: `apps/android/android/app/src/main/res/values-<code>/strings.xml`.

## Push-Benachrichtigungen

**Mitteilungen:** Anstupsen, Abend-Erinnerung, Schulden, Belohnungen, Reaktionen und die **Serie**: Ab zwei Wochen
in Folge nennt die Abend-Erinnerung, dass eure Serie auf dem Spiel steht. Bei 2, 4, 8, 12, 26 und 52 Wochen (danach
alle 52) gratuliert der Server beiden. Reißt eine Serie von mindestens zwei Wochen, bekommen beide eine kurze Info
mit der bisherigen Länge.

- **UnifiedPush / ntfy** (empfohlen, vollständig selbst hostbar; für die Android-App): Auf dem Handy
  die ntfy-App als Verteiler installieren. Läuft ntfy in deinem eigenen Netz, trage dessen Hostnamen in
  `PUSH_ALLOWED_HOSTS` ein, sonst lehnt der Server lokale Ziele ab.
- **Web Push** (Browser, installierte PWA): läuft technisch über den Push-Dienst des Browser-Herstellers
  (Mozilla, Google, Apple). Der Inhalt ist Ende-zu-Ende verschlüsselt, die Metadaten sieht der Hersteller.
  Wer das nicht möchte, setzt `WEBPUSH_ENABLED=false`. Auf iOS funktioniert Web Push nur für installierte PWAs.
- Zusätzlich gibt es immer ein **Postfach** (`GET /api/v1/notifications`), das auch ohne Push funktioniert.
- Nudge: `POST /api/v1/nudges`, höchstens einmal pro Stunde. Abend-Erinnerung: zur persönlichen Uhrzeit
  (Standard 19:00), wenn das Wochenziel gefährdet ist (heute noch kein Check-in und kein Puffer mehr).

### FCM (Google) für Geräte ohne UnifiedPush

Wer keine UnifiedPush-App (ntfy) auf dem Handy haben möchte, kann Push über Firebase Cloud Messaging bekommen.
Das ist **optional** und aus: Der Standard-Build der App und der Server kommen ohne Google aus. Voraussetzungen sind
ein eigenes (kostenloses) Firebase-Projekt und eine App-Version mit FCM, die du selbst baust.

1. In der [Firebase-Konsole](https://console.firebase.google.com/) ein Projekt anlegen (Google Analytics nicht aktivieren).
2. **Server:** Projekteinstellungen → Dienstkonten → "Neuen privaten Schlüssel generieren". Das ist eine andere
   Datei als die `google-services.json` der App. Sie gehört **ins Datenvolumen des Containers**, nicht in den
   Projektordner und nicht nach `./data` auf dem Host: Der Container sieht nur sein Volume `/data`, und die Datei muss
   dem Container-Nutzer gehören (UID 10001). Das erledigt ein Skript:

   ```bash
   ./scripts/fcm-key.sh pfad/zur/dienstkonto.json
   ```

   Danach in der `.env` `FCM_ENABLED=true` und `FCM_SERVICE_ACCOUNT_FILE=/data/fcm-service-account.json` setzen
   und `docker compose up -d` ausführen. Die Datei im Projektordner kannst du löschen; sie gehört nie ins Repository.
   Der Server prüft sie beim Start und meldet Fehler im Log (`docker compose logs app`). (Die "Firebase Cloud
   Messaging API (V1)" ist in neuen Projekten aktiv; sonst in der Google Cloud Console einschalten.)
3. **App:** In den Projekteinstellungen "Android-App hinzufügen" mit einem Paketnamen deiner Wahl (zum Beispiel
   `app.doublesweat.mobile`), die `google-services.json` herunterladen und als
   `apps/android/firebase/google-services.json` speichern (auch sie bleibt außerhalb des Repositorys). Der FCM-Build
   übernimmt den Paketnamen aus dieser Datei als App-ID; Debug- und Release-Build teilen sich dieselbe ID.
4. `pnpm android:apk:fcm` baut das signierte APK mit FCM (`pnpm android:debug:fcm` das Test-APK), siehe
   [Android-App](#android-app). Der Standard-Build und der FCM-Build haben (je nach Paketname) verschiedene App-IDs
   und sind getrennte Apps. Debug- und Release-Build des FCM-Builds sind verschieden signiert: beim Wechsel zuerst
   deinstallieren.
5. Auf dem Handy "Profil → Benachrichtigungen → Push": Ist keine UnifiedPush-App installiert, nutzt die App FCM
   direkt. Sind beide Wege möglich, fragt sie nach.

**Was Google sieht.** Die Nachrichten sind **Ende-zu-Ende verschlüsselt** (derselbe Standard wie bei Web Push,
RFC 8291): Das Gerät erzeugt ein Schlüsselpaar und gibt dem Server nur den öffentlichen Teil, der Server
verschlüsselt, Google transportiert unlesbare Bytes. Google sieht trotzdem, **dass** und **wann** eine Nachricht an
ein Gerät geht (Metadaten) und kennt das Gerät über das Token. Die App erzeugt das Token erst, wenn du Push
einschaltest, löscht es beim Ausschalten und beim Abmelden und schaltet die Analyse-Funktionen von Firebase ab.
Der FCM-Build funktioniert nur auf Geräten mit Google Play-Diensten (nicht auf Geräten ohne Google) und enthält
zusätzliche Google-Bibliotheken; der Standard-Build enthält keine.

**Warum gibt es keine fertige FCM-APK zum Herunterladen?** Eine FCM-App ist fest an _ein_ Firebase-Projekt gebunden
(die `google-services.json` steckt im APK), und Nachrichten an sie darf nur senden, wer den Dienstkonto-Schlüssel
genau dieses Projekts hat. Eine fertige APK würde also nur auf Servern Push bekommen, die den Schlüssel des
Veröffentlichenden besitzen, und den gibt niemand heraus. Apps im Play Store umgehen das, weil _eine_ Firma App und
Server betreibt: ein Firebase-Projekt, ein Server. Selbst gehostete Apps haben drei Wege: das eigene Firebase-Projekt
(dieser Abschnitt), ein zentrales Push-Relay, das der Hersteller für alle betreibt (ein zusätzlicher Dienst, der von
jedem Server Metadaten sähe; hier bewusst nicht vorgesehen) oder UnifiedPush ohne Google. Deshalb
veröffentlicht das Release nur den Standard-Build; die FCM-Variante baust du selbst oder mit deinem Fork (siehe
[Release veröffentlichen](#release-veröffentlichen-github)).

## Android-App

**Widgets:** Zwei Widgets für den Startbildschirm: _klein_ (2×1: Serie und ob du heute schon eingecheckt hast) und
_groß_ (4×2: Wochenfortschritt von euch beiden mit Wochenleiste). Sie zeigen den **letzten Stand, den die App beim
Öffnen geschrieben hat** ("Stand 19:04" unten rechts). Sie holen selbst nichts vom Server und haben keine
Zugangsdaten; ein Tipp öffnet die App. Gestaltet nach dem Designsystem (Schriften, Icons, Marker-Formen, Raster
mit 24-dp-Radius); bei kleinen Rastern fallen zuerst Symbol und Kopfzeile weg, nie wird Text abgeschnitten. Beim Abmelden werden sie geleert. Hinzufügen: Startbildschirm lange drücken →
Widgets → Double Sweat.

Die App ist ein Capacitor-Wrapper um dieselbe Web-Oberfläche. Die Oberfläche steckt **im APK** (die App lädt
keine Seiten vom Server nach), nur die Daten kommen von deinem Server. Es gibt keinen Play-Store-Eintrag: du
installierst die fertige APK aus den GitHub-Releases oder baust sie selbst.

### Fertige APK installieren

1. Auf GitHub unter [Releases](https://github.com/Nicgeon/double-sweat/releases) die neueste Datei
   `double-sweat-<Version>.apk` laden (die Standard-Variante ohne Google-Dienste, Push über UnifiedPush/ntfy; eine
   Version mit "rc" im Namen ist eine Vorabversion zum Testen).
2. Auf dem Handy öffnen und "Unbekannte Apps installieren" für den Browser oder Dateimanager erlauben, den Android
   dabei nennt. Installieren.
3. App öffnen, die Adresse deines Servers eintragen (`https://…`) und anmelden. Deinen Server brauchst du vorher
   (siehe [Schnellstart](#schnellstart-mit-docker)); die App und die Version deines Servers müssen zusammenpassen.
4. **Prüfen (empfohlen).** Jedes Release nennt die SHA-256-Prüfsumme der Datei (`sha256sum double-sweat-<Version>.apk`
   muss sie ergeben) und den SHA-256-Fingerabdruck des Signaturzertifikats
   (`apksigner verify --print-certs double-sweat-<Version>.apk`). Der Fingerabdruck ist bei **jedem** Release gleich;
   weicht er ab, wurde mit einem anderen Schlüssel signiert, und Android lässt das Update ohnehin nicht zu. Notiere
   ihn dir beim ersten Mal. Die Prüfsumme schützt vor einem beschädigten Download; gegen ein gekapertes GitHub-Konto
   hilft nur der Fingerabdruck, den du dir schon vorher gemerkt hast.
5. **Update:** die neue APK einfach über die alte installieren (Daten und Anmeldung bleiben). Nach jedem Update der
   App auch den Server aktualisieren (`git pull` und neu bauen, siehe [Betrieb](#betrieb)); bei einer
   Nichtübereinstimmung zeigt die App einen Hinweis.

Wer der Fertig-APK nicht vertraut, baut sie selbst (nächster Abschnitt) und erhält dieselbe App mit eigenem Schlüssel.
Das Repository muss öffentlich sein, damit andere die Release-Dateien ohne GitHub-Konto laden können.

### Selbst bauen

**Voraussetzungen zum Bauen:** JDK 21 und das Android-SDK (Plattform 36, Build-Tools 36). Die Kommandozeilen-Tools
reichen (`sdkmanager "platforms;android-36" "build-tools;35.0.0" "build-tools;36.0.0"`; die 35.0.0 verlangt das
Android-Gradle-Plugin, Gradle lädt sie sonst selbst nach, wenn die Lizenzen akzeptiert sind). Setze `ANDROID_HOME` auf das SDK.

```bash
./scripts/gen-keystore.sh   # einmalig: Signaturschlüssel erzeugen (apps/android/signing/, nicht im Repository)
pnpm android:apk            # baut Web, synchronisiert Capacitor, baut und prüft das signierte Release
pnpm android:apk:fcm        # dasselbe mit Firebase Cloud Messaging (braucht google-services.json, siehe Push)
```

Das Ergebnis liegt in `apps/android/dist/double-sweat-<Version>.apk` (mit FCM: `…-fcm.apk`); das Skript zeigt den Fingerabdruck des
Zertifikats. **Sichere `apps/android/signing/` an einem zweiten Ort.** Android nimmt ein Update nur an, wenn es mit
demselben Schlüssel signiert ist; ohne ihn müsstest du die App deinstallieren und neu einrichten. Wer den Ordner
hat, kann Updates in deinem Namen signieren.

**Installieren (Sideloading):** APK aufs Handy kopieren, öffnen und "Unbekannte Apps installieren" für die
öffnende App erlauben. Oder per Kabel: `adb install double-sweat-0.1.0.apk`. Zur Kontrolle auf dem Rechner:
`apksigner verify --print-certs double-sweat-0.1.0.apk` (zeigt dasselbe Zertifikat wie beim Bauen).

### Die App im Alltag

**Erster Start.** Die App fragt nach der Adresse deines Servers (`https://...`, **nur HTTPS**). Bevor sie
Zugangsdaten sendet, ruft sie `/api/v1/health` ab und prüft, ob dort wirklich ein Double-Sweat-Server in einer
passenden Version antwortet. Danach melden sich beide wie im Web an. Einladungslinks funktionieren auch in der
App: Auf der Beitrittsseite im Browser gibt es "In der App öffnen" (`doublesweat://join?s=<Server>&c=<Code>`).
Zeigt der Link auf einen anderen Server als den eingerichteten, fragt die App mit Anzeige des Hosts nach, bevor sie
etwas tut. (Eigene Schemata kann auch eine fremde App beanspruchen; deshalb gibt es keinen stillen Wechsel.)

**Server-Einstellungen für die App:** `CORS_APP_ORIGINS` bleibt auf dem Standard `https://localhost`
(so nennt sich die WebView der App). Mehr ist nicht nötig; der Server liefert für die App dieselbe API.

**Push.** Installiere einen UnifiedPush-Verteiler, z. B. **ntfy** (F-Droid oder Play Store), und schalte unter
"Profil → Benachrichtigungen" Push ein. Bei mehreren Verteilern fragt die App, welchen sie nehmen soll. Wer keinen
Verteiler möchte, nutzt die App-Version mit **FCM** (siehe [Push](#fcm-google-für-geräte-ohne-unifiedpush)). Ab
Android 13 erscheint die Frage nach der Erlaubnis für Benachrichtigungen. Läuft ntfy in deinem Heimnetz, trage
dessen Hostnamen in `PUSH_ALLOWED_HOSTS` des Servers ein. Anstupser, Abend-Erinnerung und Abrechnung bekommen eigene
Benachrichtigungskanäle, die du in den Android-Einstellungen einzeln einstellst. Ohne Verteiler läuft alles weiter,
du siehst die Meldungen dann in der App unter "Benachrichtigungen".

**Test-APK für ein Gerät im Heimnetz.** `pnpm android:debug` baut ein Debug-APK (`...-debug.apk`, eigene App-ID
`app.doublesweat.mobile.debug`, läuft neben dem Release). Nur dieser Build erlaubt `http://`-Serveradressen
(z. B. `http://192.168.1.20:3000`) und Web-Debugging über `chrome://inspect`. Das Release enthält beides nicht.

**Update der App** (selbst gebaut): `node scripts/bump-version.mjs <Version>` setzt die Version überall, dann
`pnpm android:apk` ausführen und das neue APK über das alte installieren. Beim Einrichten des Servers prüft die App per Health-Check, ob App und Server
zusammenpassen (App zu alt für den Server oder Server zu alt für die App) und zeigt dann einen Hinweis.

**Sicherheit der App.**

- Zugangsdaten (Server, Access- und Refresh-Token) liegen verschlüsselt (AES-256-GCM) in der App; der Schlüssel
  steckt im Android Keystore und ist nicht auslesbar. Backups und Geräteübertragung sind abgeschaltet
  (`allowBackup=false`, Extraktionsregeln), die Daten bleiben auf dem Gerät.
- Access-Token laufen nach 15 Minuten ab. Refresh-Token werden bei jeder Nutzung erneuert; wird ein alter
  Refresh-Token noch einmal benutzt, widerruft der Server die ganze Sitzung (Diebstahl-Erkennung).
- Nur HTTPS, nur Zertifikate, denen das System traut (keine nachinstallierten Zertifizierungsstellen); kein
  Klartext im Release. Die Seite des APK läuft unter einer strengen Content-Security-Policy ohne `unsafe-eval`.
- Berechtigungen: Internet, Benachrichtigungen und **Kamera**. Die App zeigt beim Check-in ein Live-Bild (Foto mit der
  Rückkamera, Selfie mit der Frontkamera, wie im Browser) und fragt dafür beim ersten Mal nach der Kamera-Erlaubnis.
  Lehnst du ab, bietet sie die Kamera-App des Geräts und die Fotoauswahl an; "Kamera erneut versuchen" fragt noch
  einmal, hat Android die Frage gesperrt, hilft nur die App-Einstellung des Handys. Das Live-Bild ist etwas weniger
  scharf als die Kamera-App (höchstens 2000 px, kein HDR, kein Nachtmodus). Aufnahmen verlassen die App nur als
  Check-in.
- Push-Nachrichten sind, wenn der Verteiler Schlüssel liefert, Ende-zu-Ende verschlüsselt und bleiben minimal;
  sonst enthält die Nachricht nur einen neutralen Text.
- Der Standard-Build enthält keinen Google-Dienst, kein Firebase und keine Telemetrie. Der optionale FCM-Build
  (`pnpm android:apk:fcm`) bringt Firebase Cloud Messaging mit, mit abgeschalteter Analyse und nur auf Wunsch
  erzeugtem Token (siehe [FCM](#fcm-google-für-geräte-ohne-unifiedpush)).

**Automatisch getestet:** Web-Logik der App (Server-Prüfung, Token-Erneuerung samt Wiederholung bei 401,
Deep-Links) mit Vitest; der Native-Build läuft in Playwright gegen einen echten Server (Server einrichten,
Team gründen, Fotos mit Bearer-Token laden, Abmelden, Token-Ablauf, Einladungslinks, Serverwechsel);
`pnpm android:test` prüft die Kotlin-Teile (Verschlüsselung der Zugangsdaten, Push-Nachrichten); Android Lint ohne
Fehler; das Release wird beim Bauen mit `apksigner` geprüft.

**Was noch nicht geprüft ist (bitte auf deinem Gerät testen).** Hier gibt es keinen Emulator und kein Handy.
Ungetestet sind deshalb: Live-Kamera und Selfie auf dem Handy, Safe-Area/Statusleiste auf deinem Handy, Push über ntfy (Anmeldung beim
Verteiler und Benachrichtigung), Push über FCM mit echten Google-Servern (die Serverseite ist gegen einen
nachgebauten FCM-Dienst getestet, die Entschlüsselung gegen den Beispielwert aus RFC 8291), Deep-Links aus einem Mail- oder Chat-Programm, Teilen-Menü beim Export,
Tastatur-Verhalten in den Formularen, Verhalten nach Neustart des Handys. Erst nach diesem Test sollte der Stand
nach `main`.

## Betrieb

**Updates**

```bash
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
```

Datenbank-Migrationen laufen beim Start automatisch. Sichere vorher.

**Server und App gehören zusammen.** Ändert sich die API (der Server meldet `apiVersion` und `minClientApi` unter
`/api/v1/health`), müssen Server und APK auf demselben Stand sein. Passt es nicht, sagt die App das beim Start
offen ("App und Server passen nicht zusammen", mit den beiden Versionen) statt abzustürzen. Ein Server, der älter
ist als die App, braucht das Update oben; eine App, die älter ist als der Server, eine neue APK. Unerwartete
Fehler zeigt die App auf einer eigenen Fehlerseite mit "Neu laden" und aufklappbarer technischer Angabe.

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
  sind bis zu **5 Check-ins** möglich (mehrere Workouts); für das Wochenziel zählt der **Tag** nur einmal.
  Eine Zeitzonenänderung gilt ab dem nächsten Wochenstart (ohne bisherige Check-ins sofort).
- Das Wochenziel (1 bis 7 Tage) ist nur für die **kommende** Woche änderbar. Ausnahme: Das allererste Ziel gilt
  sofort, solange die laufende Woche noch nicht gewertet wird (Team nicht vollständig oder Beitrittswoche).
- Der **Einsatz** legt jede Person für sich fest: Was sie dem Partner schuldet, wenn sie ihr Wochenziel verfehlt
  (Freitext). Er gilt ab dem gewählten Montag (Standard: diese Woche), bis ein späterer ihn ablöst, lässt sich
  jederzeit ändern und bis zu 12 Wochen im Voraus festlegen (Abmachung, "Für später festlegen"); der Partner wird
  bei jeder Änderung benachrichtigt. Eine Schuld speichert den Einsatztext des Schuldners zum Abrechnungszeitpunkt.
- Der Einsatz ist **Pflicht, aber erst ab der ersten vollen Woche** (die Woche, in der das Team vollständig wird,
  zählt nicht, so lässt sich die App kennenlernen): Hat eine Person dann keinen Einsatz für die laufende Woche,
  fragt die App ihn ab, bevor es weitergeht. Wer vorher einen für diese Woche festlegt, wird nicht gefragt. Ohne
  Einsatz wird die Woche der Person nicht gewertet. Bisherige Einsätze pro Team gelten nach dem Update bei beiden.
- **Belohnung** als Gegenstück zum Einsatz: Jede Person kann dem Partner eine Belohnung für dessen Wochenziel
  versprechen (Freitext, für den Partner sichtbar, gilt wie der Einsatz erst für Wochen, die noch bei niemandem
  begonnen haben; leer lassen zieht sie zurück). Schafft jemand sein Ziel, wird bei der Abrechnung die Belohnung
  des anderen "verdient" und beide bekommen eine Mitteilung. Nur wer sie verdient hat, markiert sie als
  "Erhalten". Der Text wird bei der Abrechnung festgehalten.
- **Reaktionen:** Auf das Check-in des Partners reagiert man mit Feuer, Bravo, Stark oder Stolz (eine Reaktion
  je Check-in, erneutes Antippen nimmt sie zurück). Der Partner erfährt von der ersten Reaktion; Wechseln oder
  Zurücknehmen erzeugt keine weitere Mitteilung.
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
  Neu-Kodierung als JPEG ohne EXIF/GPS, serverseitige Dateinamen, Abruf nur für Mitglieder desselben Teams. Das
  optionale Selfie läuft durch dieselbe Verarbeitung; `MAX_UPLOAD_MB` gilt je Bild.
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
- Gespeichert werden nur: Konto (E-Mail, Name, Zeitzone), Check-ins mit Foto, optionalem Selfie und optionaler Notiz, Ziele,
  Ergebnisse, Einsatz/Schulden, Push-Registrierungen. Es gibt keine IP-Speicherung (nur kurzlebige Rate-Limit-
  Zähler mit gehashten Schlüsseln).
- Optionale externe Berührungspunkte, alle abschaltbar: dein SMTP-Server (Mail), der Push-Dienst des
  Browser-Herstellers (nur Web Push, Inhalt verschlüsselt), dein ntfy-Server (UnifiedPush), Google Firebase Cloud
  Messaging (nur mit FCM-Build und `FCM_ENABLED`, Inhalt Ende-zu-Ende verschlüsselt).
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
pnpm test           # Tests (Vitest)
pnpm typecheck
pnpm lint           # Biome
pnpm design:check   # Designsystem: tokens.css aktuell, Kontraste (WCAG AA) in Hell und Dunkel
pnpm test:e2e       # Playwright (Chromium mit Fake-Kamera, Browsersprache Deutsch): baut die Web-App, startet die API, mobil, Desktop und App-Build
pnpm android:test   # Kotlin-Unit-Tests der Android-App (braucht ANDROID_HOME)
```

Die Web-Oberfläche entwickelst du mit `pnpm dev:api` (Port 3000) und `pnpm dev:web` (Vite, leitet `/api` an die
API weiter). Nach Änderungen an der API erzeugt `pnpm --filter @double-sweat/web api:types` die Typen des
API-Clients neu. Die Kamera braucht HTTPS oder `localhost`; ohne sie bietet die App die Fotoauswahl an.

```
apps/api       Hono-API (TypeScript), SQLite via Drizzle, Scheduler, CLI
apps/web       Web-Oberfläche (SvelteKit als SPA, PWA, Playwright-Tests)
apps/android   Android-App (Capacitor, Kotlin-Plugins für sicheren Speicher und UnifiedPush)
design/        Designsystem: Tokens, Schriften, Icons, Logo, Komponenten-CSS, Richtlinie
deploy/        Caddy- und Traefik-Beispiele
scripts/       Backup-Skript, Design-Werkzeuge, Android-Bau (Schlüssel, APK)
```

Branches: `main` (stabil, getestet) und `develop` (Integration). Änderungen laufen über `develop`.

**CI.** `.github/workflows/ci.yml` prüft jede Änderung auf `develop`, `main` und jeden Pull Request: Lint, Typen,
Designsystem, Vitest, die Ende-zu-Ende-Tests im Browser (Playwright), die Kotlin-Tests der App und ob alle
Versionsnummern gleich sind. Sie braucht keine Geheimnisse.

### Release veröffentlichen (GitHub)

Ein Tag `v<Version>` löst `.github/workflows/release.yml` aus: Der Workflow baut die signierte Standard-APK
(`foss`), prüft Signatur und Fingerabdruck und legt ein GitHub-Release mit APK, Prüfsumme und Änderungsliste an.

**Einmalig einrichten**

1. Signaturschlüssel erzeugen: `./scripts/gen-keystore.sh`. **Sichere den Ordner `apps/android/signing/` an einem
   zweiten Ort**; ohne den Schlüssel lässt sich kein Update mehr signieren, das Nutzer installieren können.
   **Du hast schon einen Schlüssel** (zum Beispiel aus Android Studio, "Generate Signed Bundle")? Dann brauchst du das
   Skript nicht: Kopiere die `.jks`-Datei nach `apps/android/signing/` und lege dort `keystore.properties` an mit den
   Zeilen `storeFile=<Dateiname>`, `storePassword=…`, `keyAlias=…`, `keyPassword=…` (Store- und Schlüsselpasswort
   dürfen verschieden sein). Nicht verwenden: den Debug-Schlüssel `debug.keystore` von Android Studio. Hast du mit einem
   anderen Schlüssel schon eine Release-APK installiert, muss diese App einmal deinstalliert werden, weil Android
   Updates nur bei gleichem Schlüssel annimmt.
2. Die Ausgabe des Skripts (`--info`) nennt die fertigen Befehle (`./scripts/gen-keystore.sh --info` zeigt sie erneut). Sie
   legen im Repository diese **Secrets** an: `KEYSTORE_BASE64` (die `.jks`-Datei als Base64), `KEYSTORE_PASSWORD`,
   `KEY_PASSWORD`, `KEY_ALIAS`, sowie die **Variable** `APK_CERT_SHA256` (der erwartete Fingerabdruck; der Workflow
   bricht ab, wenn ein verwechselter Schlüssel ein anderes Zertifikat ergäbe).
3. Optional, nur für die FCM-Variante: Secret `GOOGLE_SERVICES_JSON` mit dem Inhalt der Firebase-Datei
   (`gh secret set GOOGLE_SERVICES_JSON < apps/android/firebase/google-services.json`). Der Lauf legt die FCM-APK
   dann als **Artefakt** des Laufs ab (14 Tage, nicht im Release); wer Lesezugriff aufs Repository hat, kann es laden.
4. Das Repository öffentlich machen, wenn andere die APK ohne Konto laden sollen.

**Ein Release**

```bash
git checkout main && git pull
node scripts/bump-version.mjs 0.2.0     # setzt die Version in allen Paketen und in der API
git commit -am "Version 0.2.0" && git push
git tag v0.2.0 && git push origin v0.2.0
```

- Ein **stabiles** Release (`v0.2.0`) muss auf `main` liegen, also erst nach deinem Test auf dem Gerät. Eine
  **Vorabversion** (`v0.2.0-rc.1`, GitHub zeigt sie als "Pre-release") darf auch von `develop` kommen.
- **Ohne Kommandozeile:** GitHub → Releases → "Draft a new release" → bei "Choose a tag" `v0.2.0` eintippen und "Create
  new tag on publish" wählen, **Target** `main` (Vorabversion: `develop`), "Pre-release" bei Vorabversionen anhaken,
  "Publish release". Dabei entsteht der Tag und startet den Workflow; er ergänzt am Release die APK, die Prüfsumme
  und den Text (ein selbst geschriebener Text wird ersetzt). Wichtig: Die Version im Code muss vorher zum Tag
  passen (`bump-version.mjs`, committen).
- Der Tag muss zur Version im Code passen; sonst bricht der Lauf ab, bevor etwas gebaut wird.
  Versionscode der App: `Major*10000 + Minor*100 + Patch` (0.2.0 → 200); ein Suffix wie `-rc.1` steht nur im Namen.
- **Probelauf ohne Release:** Actions → Release → "Run workflow". Er baut und prüft alles und legt die APK nur als
  Artefakt ab. Das empfiehlt sich vor dem ersten echten Release (die Workflows sind noch nie auf GitHub gelaufen).
- Ist ein Tag falsch gesetzt: `git push --delete origin v0.2.0 && git tag -d v0.2.0`, dazu ein bereits angelegtes
  Release auf GitHub löschen.
- Den Server liefert das Release nicht aus: Er läuft weiter per `git pull` und `docker compose up -d --build`.

**Forks.** Wer einen Fork betreibt, setzt die Secrets im eigenen Repository, trägt in `apps/web/src/lib/util/source.ts`
den eigenen Quelltext-Link ein (siehe [Lizenz](#lizenz)) und ändert die App-ID (`app.doublesweat.mobile`) nur, wenn
beide Apps nebeneinander laufen sollen.

## Lizenz

Double Sweat steht unter der **GNU Affero General Public License, Version 3 oder neuer** (AGPL-3.0-or-later), Text in
[LICENSE](LICENSE). Kurz: Du darfst die Software nutzen, verändern und weitergeben. Wer eine **veränderte** Fassung als
Dienst im Netz anbietet, muss den Nutzern den Quelltext dieser Fassung unter derselben Lizenz anbieten (§13). Deshalb
zeigt die Profilseite der App einen Link zum Quelltext; wer verändert und für andere betreibt, trägt dort seine eigene
Adresse ein (`apps/web/src/lib/util/source.ts`). Wer die unveränderte Software für sich und seinen Partner betreibt,
hat keine zusätzliche Pflicht. (Das ist eine Zusammenfassung, keine Rechtsberatung; maßgeblich ist der Lizenztext.)

Mitgelieferte Fremdkomponenten behalten ihre Lizenz: die Schriften Archivo und Atkinson Hyperlegible Next
(SIL Open Font License 1.1) und die Icons von Lucide (ISC), jeweils mit Lizenztext in `design/licenses/`. Die
Abhängigkeiten aus `pnpm-lock.yaml` stehen unter ihren eigenen Lizenzen.

## Roadmap

Umgesetzt (auf `develop`): Serien-Benachrichtigungen, Android-Widgets, Überarbeitung von Navigation und Heute-Seite,
Einsatz pro Person, AGPL-Lizenz sowie CI und Release-Workflow für die Android-App (die Workflows sind noch nicht auf
GitHub gelaufen: erst per Probelauf prüfen), siehe [Push](#push-benachrichtigungen), [Android-App](#android-app) und
[Release veröffentlichen](#release-veröffentlichen-github).
Geplant, in dieser Reihenfolge:

1. **Übersicht und Navigation, Fortsetzung:** Benachrichtigungen (neue Anlässe, Einstellungen pro Art, Postfach mit
   Links, Android-Kanäle), Check-in-Feinschliff und Profil in Unterseiten. Die Abmachung (Offenes, Wenn-dann-Karten
   je Person) ist auf `develop` umgesetzt.
2. **Health Connect** (Android): Workout-Vorschläge aus Wearables, nur auf dem Gerät, das Foto bleibt Pflicht.
