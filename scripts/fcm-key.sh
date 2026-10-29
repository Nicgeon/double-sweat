#!/bin/sh
# Legt die JSON-Datei des Firebase-Dienstkontos ins Datenvolumen des Containers.
#
#   ./scripts/fcm-key.sh pfad/zur/dienstkonto.json
#
# Der Container sieht nur sein Volume /data, nicht den Projektordner und nicht ./data auf dem Host. Die Datei muss dem
# Container-Nutzer (UID 10001) gehören und darf nur ihm lesbar sein (0600); das erledigt dieses Skript.
# Danach in der .env setzen: FCM_ENABLED=true und FCM_SERVICE_ACCOUNT_FILE=/data/fcm-service-account.json,
# dann: docker compose up -d
set -eu

SRC="${1:?Aufruf: ./scripts/fcm-key.sh pfad/zur/dienstkonto.json}"
SERVICE="${SERVICE:-app}"
TARGET="${TARGET:-fcm-service-account.json}"

[ -f "$SRC" ] || { echo "Datei nicht gefunden: $SRC" >&2; exit 1; }
if ! grep -q '"private_key"' "$SRC" || ! grep -q '"client_email"' "$SRC"; then
  echo "Das sieht nicht nach einem Firebase-Dienstkonto aus (private_key oder client_email fehlt)." >&2
  echo "Gemeint ist die Datei aus Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren," >&2
  echo "nicht die google-services.json der App." >&2
  exit 1
fi

CONTAINER="$(docker compose ps -a -q "$SERVICE" | head -n 1)"
[ -n "$CONTAINER" ] || { echo "Der Container läuft noch nicht. Erst einmal 'docker compose up -d' ausführen." >&2; exit 1; }
VOLUME="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER")"
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER")"
[ -n "$VOLUME" ] || { echo "Kein Datenvolumen unter /data gefunden." >&2; exit 1; }

DIR="$(cd "$(dirname "$SRC")" && pwd)"
FILE="$(basename "$SRC")"

# Kurzlebiger Container mit Root-Rechten: Der App-Container selbst darf (cap_drop ALL) keine Dateien umhängen
docker run --rm --user root --entrypoint sh \
  -v "$VOLUME:/data" -v "$DIR:/src:ro" \
  -e FILE="$FILE" -e TARGET="$TARGET" \
  "$IMAGE" -c '
    set -e
    umask 077
    cp "/src/$FILE" "/data/$TARGET"
    chown 10001:10001 "/data/$TARGET"
    chmod 0600 "/data/$TARGET"'

echo "Gespeichert als /data/$TARGET im Volume $VOLUME."
echo "Setze in der .env: FCM_ENABLED=true und FCM_SERVICE_ACCOUNT_FILE=/data/$TARGET, dann: docker compose up -d"
echo "Die Datei im Projektordner kannst du jetzt löschen (oder sicher aufbewahren, nie ins Repository)."
