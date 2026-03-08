#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="${MOBILE_DIR:-$ROOT_DIR/mobile}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 15}"
IOS_UI_SCRIPT_NAME="${IOS_UI_SCRIPT_NAME:-test:ui:ios:crawler}"
DOMAIN_PACKAGE_GLOB="${DOMAIN_PACKAGE_GLOB:-}"
IOS_APP_PATH="${IOS_APP_PATH:-}"
IOS_BOOT_TIMEOUT_SECONDS="${IOS_BOOT_TIMEOUT_SECONDS:-90}"
IOS_UI_GATE_TIMEOUT_SECONDS="${IOS_UI_GATE_TIMEOUT_SECONDS:-210}"
IOS_CRAWLER_TIMEOUT_SECONDS="${IOS_CRAWLER_TIMEOUT_SECONDS:-120}"

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "Diretório mobile não encontrado: $MOBILE_DIR" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun não encontrado. Este runner deve executar em macOS com Xcode." >&2
  exit 1
fi

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  "$@" &
  local cmd_pid=$!
  local start_ts
  start_ts="$(date +%s)"

  while kill -0 "$cmd_pid" >/dev/null 2>&1; do
    if (( "$(date +%s)" - start_ts >= timeout_seconds )); then
      kill "$cmd_pid" >/dev/null 2>&1 || true
      wait "$cmd_pid" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 1
  done

  wait "$cmd_pid"
}

cd "$MOBILE_DIR"

if [[ -z "$IOS_APP_PATH" ]]; then
  npm ci

  if [[ -n "$DOMAIN_PACKAGE_GLOB" ]]; then
    shopt -s nullglob
    domain_packages=( $DOMAIN_PACKAGE_GLOB )
    shopt -u nullglob
    if (( ${#domain_packages[@]} > 0 )); then
      npm install --no-save "${domain_packages[@]}"
    fi
  fi
else
  echo "IOS_APP_PATH detectado, pulando npm ci no gate iOS."
fi

if ! node -e "const p=require('./package.json'); process.exit(p.scripts?.[process.argv[1]] ? 0 : 1)" "$IOS_UI_SCRIPT_NAME"; then
  echo "Script npm obrigatório ausente: $IOS_UI_SCRIPT_NAME" >&2
  echo "Adicione no fastroute-mobile-hybrid uma suíte de crawler iOS para cobrir a navegação automática." >&2
  exit 1
fi

SIMULATOR_UDID="$(xcrun simctl list devices available | awk -F '[()]' -v name="$IOS_SIMULATOR_NAME" '$0 ~ name {print $2; exit}')"
if [[ -z "$SIMULATOR_UDID" ]]; then
  SIMULATOR_UDID="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/ {print $2; exit}')"
fi

if [[ -z "$SIMULATOR_UDID" ]]; then
  echo "Nenhum simulador iOS disponível no runner." >&2
  exit 1
fi

echo "Booting simulator $SIMULATOR_UDID"
xcrun simctl boot "$SIMULATOR_UDID" || true
if ! run_with_timeout "$IOS_BOOT_TIMEOUT_SECONDS" xcrun simctl bootstatus "$SIMULATOR_UDID" -b; then
  echo "Timeout no boot do simulador iOS (${IOS_BOOT_TIMEOUT_SECONDS}s)." >&2
  exit 1
fi

echo "Running iOS UI crawler ($IOS_UI_SCRIPT_NAME)"
export IOS_APP_PATH
if ! run_with_timeout "$IOS_UI_GATE_TIMEOUT_SECONDS" env \
  IOS_SIMULATOR_UDID="$SIMULATOR_UDID" \
  IOS_SIMULATOR_ID="$SIMULATOR_UDID" \
  IOS_CRAWLER_TIMEOUT_SECONDS="$IOS_CRAWLER_TIMEOUT_SECONDS" \
  npm run "$IOS_UI_SCRIPT_NAME"; then
  echo "Timeout no gate iOS UI (${IOS_UI_GATE_TIMEOUT_SECONDS}s)." >&2
  xcrun simctl shutdown "$SIMULATOR_UDID" || true
  exit 1
fi

xcrun simctl shutdown "$SIMULATOR_UDID" || true
echo "iOS UI simulator suite concluída com sucesso."
