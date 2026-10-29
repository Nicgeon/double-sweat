#!/bin/sh
# Baut die Android-App.
#
#   sh scripts/android-build.sh debug     # Debug-APK: erlaubt http:// und Web-Debugging, für Tests im Heimnetz
#   sh scripts/android-build.sh release   # signiertes Release-APK (braucht scripts/gen-keystore.sh)
#   sh scripts/android-build.sh test      # Unit-Tests der Kotlin-Teile
#
# Voraussetzung: JDK 21 und das Android-SDK (Umgebungsvariable ANDROID_HOME). Das APK landet in apps/android/dist/.
set -eu

MODE="${1:-}"
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

VERSION="$(node -p "require('$ANDROID/package.json').version")"
mkdir -p "$ANDROID/dist"

case "$MODE" in
  debug)
    sync_web build:native:test
    (cd "$ANDROID/android" && ./gradlew assembleDebug)
    cp "$ANDROID/android/app/build/outputs/apk/debug/app-debug.apk" "$ANDROID/dist/double-sweat-$VERSION-debug.apk"
    echo "Fertig: apps/android/dist/double-sweat-$VERSION-debug.apk"
    ;;
  release)
    if [ ! -f "$ANDROID/signing/keystore.properties" ]; then
      echo "Es gibt noch keinen Signaturschlüssel. Erzeuge ihn einmalig mit: ./scripts/gen-keystore.sh" >&2
      exit 1
    fi
    sync_web build:native
    (cd "$ANDROID/android" && ./gradlew assembleRelease)
    OUT="$ANDROID/dist/double-sweat-$VERSION.apk"
    cp "$ANDROID/android/app/build/outputs/apk/release/app-release.apk" "$OUT"
    APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
    if [ -n "$APKSIGNER" ]; then
      "$APKSIGNER" verify --verbose --print-certs "$OUT" | grep -E "^(Verifies|Verified using|Signer #1 certificate (DN|SHA-256))" || true
    fi
    echo "Fertig: apps/android/dist/double-sweat-$VERSION.apk"
    ;;
  test)
    (cd "$ANDROID/android" && ./gradlew testDebugUnitTest)
    ;;
  *)
    echo "Aufruf: sh scripts/android-build.sh debug|release|test" >&2
    exit 2
    ;;
esac
