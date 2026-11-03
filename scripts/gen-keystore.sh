#!/bin/sh
# Erzeugt den Schlüssel, mit dem das Release-APK signiert wird, und zeigt, wie er in GitHub eingetragen wird.
#
#   ./scripts/gen-keystore.sh          einmalig: Schlüssel erzeugen
#   ./scripts/gen-keystore.sh --info   Fingerabdruck und die Befehle für die GitHub-Secrets noch einmal anzeigen
#
# Ergebnis: apps/android/signing/double-sweat.jks und keystore.properties (beide nicht im Repository).
# WICHTIG: Sichere den Ordner apps/android/signing/ an einem zweiten Ort. Android akzeptiert ein Update nur, wenn es
# mit demselben Schlüssel signiert ist; geht er verloren, muss die App deinstalliert und neu eingerichtet werden.
# Wer den Ordner besitzt, kann Updates in deinem Namen signieren: gib ihn nie weiter.
set -eu

DIR="$(cd "$(dirname "$0")/.." && pwd)/apps/android/signing"
STORE="$DIR/double-sweat.jks"
PROPS="$DIR/keystore.properties"

command -v keytool >/dev/null 2>&1 || { echo "keytool fehlt (JDK 21 installieren)." >&2; exit 1; }

prop() { sed -n "s/^$1=//p" "$PROPS" | head -1; }

# Zeigt Fingerabdruck und die Befehle, mit denen der Schlüssel als GitHub-Secret hinterlegt wird.
info() {
  PASSWORD="$(prop storePassword)"
  KEYPASSWORD="$(prop keyPassword)"
  ALIAS="$(prop keyAlias)"
  FILE="$(prop storeFile)"
  STORE="$DIR/$FILE"
  [ -f "$STORE" ] || { echo "In $PROPS steht storeFile=$FILE, die Datei fehlt in $DIR." >&2; exit 1; }
  # Dieselbe Schreibweise, die "apksigner" zeigt: Kleinbuchstaben ohne Doppelpunkte.
  FP="$(keytool -list -keystore "$STORE" -storepass "$PASSWORD" 2>/dev/null \
    | sed -n 's/.*(SHA-256): *//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')"
  cat <<INFO

SHA-256 des Zertifikats (das zeigt auch jedes damit signierte APK):
  $FP

Für den Release-Workflow (GitHub: Settings → Secrets and variables → Actions) brauchst du vier Secrets und eine
Variable. Mit der GitHub-CLI ('gh auth login' einmalig) geht es so, im Projektordner:

  # Linux, Git Bash, WSL (macOS: "base64 -i apps/android/signing/$FILE" statt "base64 -w0 …")
  base64 -w0 apps/android/signing/$FILE | gh secret set KEYSTORE_BASE64
  echo '$PASSWORD' | gh secret set KEYSTORE_PASSWORD
  echo '$KEYPASSWORD' | gh secret set KEY_PASSWORD
  echo '$ALIAS' | gh secret set KEY_ALIAS
  gh variable set APK_CERT_SHA256 --body '$FP'

  # Windows PowerShell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("apps\\android\\signing\\$FILE")) | gh secret set KEYSTORE_BASE64
  '$PASSWORD' | gh secret set KEYSTORE_PASSWORD
  '$KEYPASSWORD' | gh secret set KEY_PASSWORD
  '$ALIAS' | gh secret set KEY_ALIAS
  gh variable set APK_CERT_SHA256 --body '$FP'

Ohne GitHub-CLI legst du im Browser dieselben Namen an. Der Wert von KEYSTORE_BASE64 ist die Datei $FILE
als Base64-Text (eine Zeile). APK_CERT_SHA256 gehört unter "Variables", nicht unter "Secrets".

Die Passwörter stehen in $PROPS und oben in dieser Ausgabe: Lösche sie aus dem Terminal-Verlauf, wenn andere
Zugriff darauf haben.
INFO
}

if [ "${1:-}" = "--info" ]; then
  [ -f "$PROPS" ] || { echo "Es gibt noch keinen Schlüssel in $DIR. Erzeuge ihn mit ./scripts/gen-keystore.sh" >&2; exit 1; }
  info
  exit 0
elif [ -n "${1:-}" ]; then
  echo "Aufruf: ./scripts/gen-keystore.sh [--info]" >&2
  exit 2
fi

if [ -e "$STORE" ] || [ -e "$PROPS" ]; then
  echo "Es gibt bereits einen Schlüssel in $DIR. Ihn zu überschreiben würde künftige Updates verhindern." >&2
  echo "Lösche den Ordner nur, wenn du die App ohnehin neu installieren willst." >&2
  echo "Die Befehle für die GitHub-Secrets zeigt: ./scripts/gen-keystore.sh --info" >&2
  exit 1
fi

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
echo
echo "Sichere diesen Ordner jetzt an einem zweiten Ort (Passwortmanager, verschlüsseltes Backup)."
info
