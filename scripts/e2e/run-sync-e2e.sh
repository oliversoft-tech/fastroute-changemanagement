#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOW_PATH="${1:-$ROOT_DIR/.maestro/flows/flow-sync-all-operations.yaml}"
RESULT_DIR="${RESULT_DIR:-$ROOT_DIR/.maestro/results}"
RESULT_FILE="${RESULT_FILE:-$RESULT_DIR/junit-sync-all-operations.xml}"
DEBUG_DIR="${DEBUG_DIR:-$ROOT_DIR/.maestro/debug/sync-all-operations-$(date +%Y%m%d-%H%M%S)}"

if [[ ! -f "$FLOW_PATH" ]]; then
  echo "Fluxo Maestro não encontrado: $FLOW_PATH" >&2
  exit 1
fi

if [[ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java não encontrado. O Maestro requer Java 17+." >&2
  exit 1
fi

JAVA_VERSION_LINE="$(java -version 2>&1 | head -n1)"
JAVA_MAJOR="$(echo "$JAVA_VERSION_LINE" | sed -E 's/.*version "([0-9]+).*/\1/')"
if [[ -z "${JAVA_MAJOR:-}" || "$JAVA_MAJOR" -lt 17 ]]; then
  echo "Java 17+ é obrigatório para o Maestro. Versão detectada: $JAVA_VERSION_LINE" >&2
  exit 1
fi

export PATH="$HOME/.maestro/bin:$PATH"
if ! command -v maestro >/dev/null 2>&1; then
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
fi

mkdir -p "$RESULT_DIR" "$DEBUG_DIR"

echo "Running sync E2E flow"
echo "- Flow: $FLOW_PATH"
echo "- Result: $RESULT_FILE"
echo "- Debug: $DEBUG_DIR"

maestro test "$FLOW_PATH" --format junit --output "$RESULT_FILE" --debug-output "$DEBUG_DIR"

echo "Sync E2E concluído com sucesso."
