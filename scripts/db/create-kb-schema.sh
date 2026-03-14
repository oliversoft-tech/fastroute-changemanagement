#!/usr/bin/env bash
set -euo pipefail

# Create FastRoute KB + vector schema in Postgres.
# Usage:
#   DATABASE_URL='postgres://user:pass@host:5432/db' ./scripts/db/create-kb-schema.sh
# or
#   PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=... ./scripts/db/create-kb-schema.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE_DEFAULT="$ROOT_DIR/docs/sql-kb-vector-schema.sql"
SQL_FILE="${KB_SCHEMA_SQL_FILE:-$SQL_FILE_DEFAULT}"

if ! command -v psql >/dev/null 2>&1; then
  echo "[create-kb-schema] psql nao encontrado no PATH." >&2
  exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "[create-kb-schema] arquivo SQL nao encontrado: $SQL_FILE" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  missing=()
  [ -z "${PGHOST:-}" ] && missing+=(PGHOST)
  [ -z "${PGUSER:-}" ] && missing+=(PGUSER)
  [ -z "${PGDATABASE:-}" ] && missing+=(PGDATABASE)

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "[create-kb-schema] defina DATABASE_URL ou variaveis PG* (faltando: ${missing[*]})." >&2
    exit 1
  fi
fi

echo "[create-kb-schema] aplicando schema: $SQL_FILE"
if [ -n "${DATABASE_URL:-}" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
else
  psql -v ON_ERROR_STOP=1 -f "$SQL_FILE"
fi

echo "[create-kb-schema] concluido com sucesso."
