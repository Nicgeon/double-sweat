#!/bin/sh
# Sichert Datenbank (konsistent per VACUUM INTO) und Fotos in ein Archiv auf dem Host.
#
#   ./scripts/backup.sh                 # schreibt backups/double-sweat-<Datum>.tar.gz
#   ./scripts/backup.sh /pfad/zum/ziel  # anderes Zielverzeichnis
#
# Das Archiv enthält Passwort-Hashes und alle Fotos: sicher aufbewahren (Rechte 0600), am besten verschlüsselt.
# Wiederherstellen: siehe README, Abschnitt "Backup und Wiederherstellung".
set -eu

TARGET_DIR="${1:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SERVICE="${SERVICE:-app}"

mkdir -p "$TARGET_DIR"
umask 077

# 1) Konsistente Datenbankkopie im Datenvolume anlegen (läuft bei laufendem Betrieb)
docker compose exec -T "$SERVICE" sh -c 'mkdir -p /data/backups && rm -f /data/backups/latest.db' >/dev/null
docker compose exec -T "$SERVICE" cli backup /data/backups/latest.db

# 2) Kopie + Fotos als Archiv streamen (die laufende Datenbankdatei samt WAL wird bewusst nicht kopiert)
docker compose exec -T "$SERVICE" tar -C /data -czf - backups/latest.db photos > "$TARGET_DIR/double-sweat-$STAMP.tar.gz"

# 3) Temporäre Kopie wieder entfernen
docker compose exec -T "$SERVICE" rm -f /data/backups/latest.db

echo "Backup geschrieben: $TARGET_DIR/double-sweat-$STAMP.tar.gz"
