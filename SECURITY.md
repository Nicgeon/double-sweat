# Sicherheitsrichtlinie

Danke, dass du Double Sweat sicherer machen willst. Das Projekt wird von einer einzelnen Person in der Freizeit gepflegt.
Ein Bug-Bounty-Programm gibt es nicht, aber jede Meldung wird ernst genommen.

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für die **jüngste stabile Version** (ein Release ohne `-rc` im Namen, auf `main`) und,
solange sie die neueste ist, für die jüngste Vorabversion. Ältere Versionen werden nicht gepflegt. Bitte prüfe vor einer
Meldung, ob es die Lücke in der aktuellen Version noch gibt (Server: `docker compose pull && docker compose up -d`,
App: neueste APK aus den Releases).

## Eine Sicherheitslücke melden

Bitte melde Sicherheitslücken **nicht** als öffentliches Issue, Pull Request oder Diskussion. Solange eine Lücke nicht
behoben ist, hilft ein öffentlicher Hinweis nur Angreifern.

1. Öffne im Repository den Reiter **Security**, dann **Report a vulnerability** (privates Melden über GitHub). Die
   Meldung sehen nur du und die Maintainer.
2. Gibt es diesen Knopf nicht, eröffne ein Issue **ohne Einzelheiten**, zum Beispiel "Ich möchte eine Sicherheitslücke
   melden", und bitte um einen privaten Kontakt. Die Einzelheiten schickst du erst dort.

Hilfreich in einer Meldung:

- betroffene Version (Server, App oder beides) und wie die Instanz betrieben wird (Docker, Web, Android),
- was ein Angreifer damit erreicht (zum Beispiel Fotos oder Daten eines fremden Teams, Übernahme eines Kontos),
- Schritte zum Nachstellen oder ein kleines Beispiel,
- falls vorhanden ein Vorschlag zur Lösung.

Bitte teste nur an **eigenen** Instanzen und mit eigenen Daten, nie an fremden Servern, und lösche oder verändere keine
Daten anderer.

## Was danach passiert

Das ist Best Effort, kein Dienstvertrag:

- Ich bestätige den Eingang in der Regel innerhalb von etwa 7 Tagen und melde mich mit einer ersten Einschätzung.
- Die Korrektur entsteht zuerst privat und kommt dann in ein Release.
- Die Einzelheiten veröffentliche ich (als GitHub Security Advisory) nach dem Release, in Absprache mit dir. Üblich ist
  eine Frist von höchstens 90 Tagen ab der Meldung.
- Wenn du möchtest, nenne ich dich als Entdecker:in. Sag es mir, wenn du das nicht möchtest.

## Geltungsbereich

Im Geltungsbereich sind der Server (API), die Web-Oberfläche, die Android-App, das Docker-Image und die Workflows in
`.github/`. Beispiele für Meldungen, die mich besonders interessieren:

- Zugriff auf Fotos, Notizen oder Konten eines anderen Teams oder einer anderen Person,
- Umgehen von Anmeldung, CSRF-Schutz, Rate-Limits oder der Prüfung beim Datenexport und beim Löschen des Kontos,
- Einschleusen von Code oder Anfragen (XSS, Injection), Ausweiten von Rechten,
- Server-Side Request Forgery über die Push-Ziele (siehe `PUSH_ALLOWED_HOSTS` im README),
- Schwächen bei der Verschlüsselung der Push-Nachrichten oder beim Speichern der Zugangsdaten in der App,
- Geheimnisse, die versehentlich im Repository, im Image oder in Release-Dateien stehen.

Nicht im Geltungsbereich:

- eine falsch eingerichtete eigene Instanz (kein HTTPS, schwache Passwörter, offen erreichbarer Port),
- Angriffe, die ein entsperrtes Gerät, Root-Zugriff oder Zugriff auf den Server voraussetzen,
- reine Überlastung durch sehr viele Anfragen (Rate-Limits gibt es, aber keine Ausfallgarantie),
- Hinweise auf Abhängigkeiten ohne Nachweis, dass Double Sweat tatsächlich betroffen ist,
- fehlende Sicherheits-Header ohne erkennbare Auswirkung, Social Engineering, Spam.

## Wie Double Sweat gebaut ist

Welche Schutzmaßnahmen es gibt und welche Daten gespeichert werden, steht im [README](README.md), in den Abschnitten
"Sicherheit" und "Datenschutz". Wer eine eigene Instanz betreibt, hält sie mit `docker compose pull` aktuell und stellt
sie nur über HTTPS ins Netz.

## English (short)

Please report security vulnerabilities **privately**: use the **Security** tab of this repository and choose
**Report a vulnerability**. If that is not available, open an issue without details and ask for a private contact.
Do not open public issues for vulnerabilities. Only the latest stable release (and the latest pre-release, while it is
the newest) receives fixes. This is a one-person hobby project: I aim to acknowledge reports within about 7 days and to
disclose details after a fix is released, within 90 days at most. Please test only against your own instances.
