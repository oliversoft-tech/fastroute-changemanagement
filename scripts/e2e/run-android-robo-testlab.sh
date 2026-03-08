#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="${MOBILE_DIR:-$ROOT_DIR/mobile}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
ANDROID_ROBO_TIMEOUT="${ANDROID_ROBO_TIMEOUT:-180s}"
ANDROID_ROBO_DEVICE_MODEL="${ANDROID_ROBO_DEVICE_MODEL:-Nexus6}"
ANDROID_ROBO_VERSION="${ANDROID_ROBO_VERSION:-30}"
ANDROID_ROBO_LOCALE="${ANDROID_ROBO_LOCALE:-pt_BR}"
ANDROID_ROBO_ORIENTATION="${ANDROID_ROBO_ORIENTATION:-portrait}"
ANDROID_ROBO_RESULTS_DIR="${ANDROID_ROBO_RESULTS_DIR:-governance-ci/local/android-robo}"
ANDROID_APP_APK="${ANDROID_APP_APK:-}"
ANDROID_BUILD_COMMAND="${ANDROID_BUILD_COMMAND:-}"
DOMAIN_PACKAGE_GLOB="${DOMAIN_PACKAGE_GLOB:-}"

if [[ -z "$FIREBASE_PROJECT_ID" ]]; then
  echo "FIREBASE_PROJECT_ID é obrigatório." >&2
  exit 1
fi

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "Diretório mobile não encontrado: $MOBILE_DIR" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI não encontrado no PATH." >&2
  exit 1
fi

cd "$MOBILE_DIR"
npm ci

if [[ -n "$DOMAIN_PACKAGE_GLOB" ]]; then
  shopt -s nullglob
  domain_packages=( $DOMAIN_PACKAGE_GLOB )
  shopt -u nullglob
  if (( ${#domain_packages[@]} > 0 )); then
    npm install --no-save "${domain_packages[@]}"
  fi
fi

if [[ -z "$ANDROID_APP_APK" ]]; then
  if [[ -z "$ANDROID_BUILD_COMMAND" ]]; then
    if node -e "const p=require('./package.json'); process.exit(p.scripts?.['build:android:debug'] ? 0 : 1)"; then
      ANDROID_BUILD_COMMAND="npm run build:android:debug"
    else
      ANDROID_BUILD_COMMAND="npx expo prebuild --platform android --non-interactive --no-install && (cd android && ./gradlew assembleDebug -x lint -x test)"
    fi
  fi

  echo "Executando build Android para Robo Test..."
  bash -lc "$ANDROID_BUILD_COMMAND"

  ANDROID_APP_APK="$(find "$MOBILE_DIR/android/app/build/outputs/apk" -type f -name '*.apk' | head -n1 || true)"
fi

if [[ -z "$ANDROID_APP_APK" || ! -f "$ANDROID_APP_APK" ]]; then
  echo "APK Android não encontrado. Defina ANDROID_APP_APK ou ajuste ANDROID_BUILD_COMMAND." >&2
  exit 1
fi

gcloud --quiet config set project "$FIREBASE_PROJECT_ID" >/dev/null

echo "Running Firebase Test Lab Robo"
echo "- Project: $FIREBASE_PROJECT_ID"
echo "- App: $ANDROID_APP_APK"
echo "- Device: model=$ANDROID_ROBO_DEVICE_MODEL,version=$ANDROID_ROBO_VERSION,locale=$ANDROID_ROBO_LOCALE,orientation=$ANDROID_ROBO_ORIENTATION"
echo "- Timeout: $ANDROID_ROBO_TIMEOUT"
echo "- Results dir: $ANDROID_ROBO_RESULTS_DIR"

gcloud firebase test android run \
  --type robo \
  --app "$ANDROID_APP_APK" \
  --timeout "$ANDROID_ROBO_TIMEOUT" \
  --device "model=$ANDROID_ROBO_DEVICE_MODEL,version=$ANDROID_ROBO_VERSION,locale=$ANDROID_ROBO_LOCALE,orientation=$ANDROID_ROBO_ORIENTATION" \
  --results-dir "$ANDROID_ROBO_RESULTS_DIR"

echo "Robo Test concluído com sucesso."
