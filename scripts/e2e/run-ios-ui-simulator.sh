#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="${MOBILE_DIR:-$ROOT_DIR/mobile}"
IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 15}"
IOS_UI_SCRIPT_NAME="${IOS_UI_SCRIPT_NAME:-test:ui:ios:crawler}"
DOMAIN_PACKAGE_GLOB="${DOMAIN_PACKAGE_GLOB:-}"

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "Diretório mobile não encontrado: $MOBILE_DIR" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun não encontrado. Este runner deve executar em macOS com Xcode." >&2
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
xcrun simctl bootstatus "$SIMULATOR_UDID" -b

echo "Running iOS UI crawler ($IOS_UI_SCRIPT_NAME)"
IOS_SIMULATOR_UDID="$SIMULATOR_UDID" npm run "$IOS_UI_SCRIPT_NAME"

xcrun simctl shutdown "$SIMULATOR_UDID" || true
echo "iOS UI simulator suite concluída com sucesso."
