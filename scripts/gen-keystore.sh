#!/bin/sh
# Erzeugt den Schlüssel, mit dem das Release-APK signiert wird.
#
#   ./scripts/gen-keystore.sh
#
# Ergebnis: apps/android/signing/double-sweat.jks und keystore.properties (beide nicht im Repository).
# WICHTIG: Sichere den Ordner apps/android/signing/ an einem zweiten Ort. Android akzeptiert ein Update nur, wenn es
# mit demselben Schlüssel signiert ist; geht er verloren, muss die App deinstalliert und neu eingerichtet werden.
# Wer den Ordner besitzt, kann Updates in deinem Namen signieren: gib ihn nie weiter.
set -eu

DIR="$(cd "$(dirname "$0")/.." && pwd)/apps/android/signing"
STORE="$DIR/double-sweat.jks"
PROPS="$DIR/keystore.properties"

if [ -e "$STORE" ] || [ -e "$PROPS" ]; then
  echo "Es gibt bereits einen Schlüssel in $DIR. Ihn zu überschreiben würde künftige Updates verhindern." >&2
  echo "Lösche den Ordner nur, wenn du die App ohnehin neu installieren willst." >&2
  exit 1
fi
command -v keytool >/dev/null 2>&1 || { echo "keytool fehlt (JDK 21 installieren)." >&2; exit 1; }

umask 077
mkdir -p "$DIR"
PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"

keytool -genkeypair \
  -keystore "$STORE" -storetype PKCS12 \
  -alias double-sweat -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$PASSWORD" -keypass "$PASSWORD" \
  -dname "CN=Double Sweat, O=selbst gehostet" >/dev/null

cat > "$PROPS" <<PROPS
storeFile=double-sweat.jks
storePassword=$PASSWORD
keyAlias=double-sweat
keyPassword=$PASSWORD
PROPS

echo "Schlüssel erzeugt in $DIR"
keytool -list -keystore "$STORE" -storepass "$PASSWORD" 2>/dev/null | grep -i "fingerprint" || true
echo
echo "Sichere diesen Ordner jetzt an einem zweiten Ort (Passwortmanager, verschlüsseltes Backup)."
