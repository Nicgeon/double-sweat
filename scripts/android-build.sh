#!/bin/sh
# Baut die Android-App.
#
#   sh scripts/android-build.sh debug [fcm]     # Debug-APK: erlaubt http:// und Web-Debugging, für Tests im Heimnetz
#   sh scripts/android-build.sh release [fcm]   # signiertes Release-APK (braucht scripts/gen-keystore.sh)
#   sh scripts/android-build.sh test            # Unit-Tests der Kotlin-Teile
#
# Ohne "fcm" entsteht der Standard-Build: UnifiedPush, keine Google-Bibliotheken. Mit "fcm" kommt Firebase Cloud
# Messaging dazu (braucht apps/android/firebase/google-services.json, siehe README).
#
# Voraussetzung: JDK 21 und das Android-SDK (Umgebungsvariable ANDROID_HOME). Das APK landet in apps/android/dist/.
set -eu

MODE="${1:-}"
FLAVOR=foss
TASK_FLAVOR=Foss
SUFFIX=""
if [ "${2:-}" = "fcm" ]; then
  FLAVOR=fcm
  TASK_FLAVOR=Fcm
  SUFFIX="-fcm"
elif [ -n "${2:-}" ]; then
  echo "Unbekannte Variante: $2 (erlaubt: fcm)" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/apps/android"

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$ANDROID_HOME" ] || [ ! -d "$ANDROID_HOME" ]; then
  echo "ANDROID_HOME zeigt nicht auf ein Android-SDK. Siehe README, Abschnitt Android." >&2
  exit 1
fi
export ANDROID_HOME

sync_web() {
  pnpm --filter @double-sweat/web "$1"
  (cd "$ANDROID" && pnpm exec cap sync android)
}

# Der Build mit Firebase braucht die google-services.json des eigenen Firebase-Projekts. Die App-ID des Builds ist
# der darin eingetragene Paketname (Firebase verlangt, dass beide übereinstimmen).
prepare_fcm() {
  SRC="$ANDROID/firebase/google-services.json"
  if [ ! -f "$SRC" ]; then
    echo "Für den Build mit FCM fehlt apps/android/firebase/google-services.json." >&2
    echo "Lege in der Firebase-Konsole eine Android-App an, lade die Datei herunter und speichere sie dort. Siehe README, Abschnitt FCM." >&2
    exit 1
  fi
  if ! APP_ID="$(node -e "
    const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const names = (j.client || []).map((c) => c.client_info?.android_client_info?.package_name).filter(Boolean);
    if (names.length === 0) process.exit(1);
    console.log(names.find((n) => !n.endsWith('.debug')) ?? names[0]);
  " "$SRC")"; then
    echo "In google-services.json ist keine Android-App eingetragen. Lege sie in der Firebase-Konsole an und lade die Datei neu herunter." >&2
    exit 1
  fi
  echo "FCM-Build mit der App-ID $APP_ID (aus google-services.json)"
  mkdir -p "$ANDROID/android/app/src/fcm"
  cp "$SRC" "$ANDROID/android/app/src/fcm/google-services.json"
}

VERSION="$(node -p "require('$ANDROID/package.json').version")"
mkdir -p "$ANDROID/dist"

case "$MODE" in
  debug)
    [ "$FLAVOR" = fcm ] && prepare_fcm
    sync_web build:native:test
    TASK="assemble${TASK_FLAVOR}Debug"
    (cd "$ANDROID/android" && ./gradlew "$TASK")
    OUT="$ANDROID/dist/double-sweat-$VERSION$SUFFIX-debug.apk"
    cp "$ANDROID/android/app/build/outputs/apk/$FLAVOR/debug/app-$FLAVOR-debug.apk" "$OUT"
    echo "Fertig: apps/android/dist/$(basename "$OUT")"
    ;;
  release)
    if [ ! -f "$ANDROID/signing/keystore.properties" ]; then
      echo "Es gibt noch keinen Signaturschlüssel. Erzeuge ihn einmalig mit: ./scripts/gen-keystore.sh" >&2
      exit 1
    fi
    [ "$FLAVOR" = fcm ] && prepare_fcm
    sync_web build:native
    TASK="assemble${TASK_FLAVOR}Release"
    (cd "$ANDROID/android" && ./gradlew "$TASK")
    OUT="$ANDROID/dist/double-sweat-$VERSION$SUFFIX.apk"
    cp "$ANDROID/android/app/build/outputs/apk/$FLAVOR/release/app-$FLAVOR-release.apk" "$OUT"
    APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
    if [ -n "$APKSIGNER" ]; then
      "$APKSIGNER" verify --verbose --print-certs "$OUT" | grep -E "^(Verifies|Verified using|Signer #1 certificate (DN|SHA-256))" || true
    fi
    echo "Fertig: apps/android/dist/$(basename "$OUT")"
    ;;
  test)
    (cd "$ANDROID/android" && ./gradlew testFossDebugUnitTest)
    ;;
  *)
    echo "Aufruf: sh scripts/android-build.sh debug|release [fcm] | test" >&2
    exit 2
    ;;
esac
