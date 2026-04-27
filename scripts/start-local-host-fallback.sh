#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.local/runtime"
PID_FILE="$RUNTIME_DIR/host-gateway.pid"
LOG_FILE="$RUNTIME_DIR/host-gateway.log"

GATEWAY_HOST="${HOST_FALLBACK_HOST:-127.0.0.1}"
GATEWAY_PORT="${HOST_FALLBACK_PORT:-3020}"
POSTGRES_PORT="${HOST_FALLBACK_POSTGRES_PORT:-55432}"
REDIS_PORT="${HOST_FALLBACK_REDIS_PORT:-56379}"

mkdir -p "$RUNTIME_DIR"
: >"$LOG_FILE"

read_env_value() {
  local key="$1"
  local env_file="$ROOT_DIR/.env"

  if [[ -f "$env_file" ]]; then
    sed -n "s/^${key}=//p" "$env_file" | head -n 1
  fi
}

API_AUTH_TOKEN="${API_AUTH_TOKEN:-$(read_env_value API_AUTH_TOKEN)}"
CODEX_AUTH_MODE="${CODEX_AUTH_MODE:-$(read_env_value CODEX_AUTH_MODE)}"
OPENAI_API_KEY="${OPENAI_API_KEY:-$(read_env_value OPENAI_API_KEY)}"
DEFAULT_PROVIDER="${DEFAULT_PROVIDER:-$(read_env_value DEFAULT_PROVIDER)}"
ENABLED_PROVIDERS="${ENABLED_PROVIDERS:-$(read_env_value ENABLED_PROVIDERS)}"
DECK_ADMIN_USER="${DECK_ADMIN_USER:-$(read_env_value DECK_ADMIN_USER)}"
DECK_ADMIN_PASSWORD="${DECK_ADMIN_PASSWORD:-$(read_env_value DECK_ADMIN_PASSWORD)}"
DECK_JWT_SECRET="${DECK_JWT_SECRET:-$(read_env_value DECK_JWT_SECRET)}"

CODEX_AUTH_MODE="${CODEX_AUTH_MODE:-oauth}"
DEFAULT_PROVIDER="${DEFAULT_PROVIDER:-codex}"
ENABLED_PROVIDERS="${ENABLED_PROVIDERS:-codex}"
DECK_ADMIN_USER="${DECK_ADMIN_USER:-admin}"

if [[ -z "$API_AUTH_TOKEN" ]]; then
  echo "API_AUTH_TOKEN is required. Set it in .env or the shell before starting the fallback." >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"

  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Host fallback gateway is already running with PID $EXISTING_PID."
    echo "Status: http://$GATEWAY_HOST:$GATEWAY_PORT/health"
    exit 0
  fi

  rm -f "$PID_FILE"
fi

if lsof -nP -iTCP:"$GATEWAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $GATEWAY_PORT is already in use. Stop the existing process or change HOST_FALLBACK_PORT." >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "Ensuring Docker Redis/Postgres support services are running on ports $POSTGRES_PORT and $REDIS_PORT..."
POSTGRES_PORT="$POSTGRES_PORT" REDIS_PORT="$REDIS_PORT" docker compose up -d redis postgres >/dev/null

wait_for_port() {
  local port="$1"

  for _ in {1..30}; do
    if bash -c ">/dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  return 1
}

if ! wait_for_port "$POSTGRES_PORT"; then
  echo "PostgreSQL did not become reachable on port $POSTGRES_PORT in time." >&2
  exit 1
fi

if ! wait_for_port "$REDIS_PORT"; then
  echo "Redis did not become reachable on port $REDIS_PORT in time." >&2
  exit 1
fi

if [[ "$CODEX_AUTH_MODE" == "api_key" ]]; then
  if [[ -z "${OPENAI_API_KEY//[[:space:]]/}" ]]; then
    echo "OPENAI_API_KEY is required when CODEX_AUTH_MODE=api_key. Set it in .env or the shell before starting the fallback." >&2
    exit 1
  fi

  echo "Using Codex API key auth; skipping host OAuth status check."
else
  echo "Checking host Codex OAuth status..."
  codex login status >/dev/null
fi

echo "Building the gateway..."
npm run build >/dev/null

echo "Starting host gateway on http://$GATEWAY_HOST:$GATEWAY_PORT ..."
PID="$(
  ROOT_DIR="$ROOT_DIR" \
  LOG_FILE="$LOG_FILE" \
  GATEWAY_HOST="$GATEWAY_HOST" \
  GATEWAY_PORT="$GATEWAY_PORT" \
  POSTGRES_PORT="$POSTGRES_PORT" \
  REDIS_PORT="$REDIS_PORT" \
  API_AUTH_TOKEN="$API_AUTH_TOKEN" \
  CODEX_AUTH_MODE="$CODEX_AUTH_MODE" \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  DEFAULT_PROVIDER="$DEFAULT_PROVIDER" \
  ENABLED_PROVIDERS="$ENABLED_PROVIDERS" \
  DECK_ADMIN_USER="$DECK_ADMIN_USER" \
  DECK_ADMIN_PASSWORD="$DECK_ADMIN_PASSWORD" \
  DECK_JWT_SECRET="$DECK_JWT_SECRET" \
  CODEX_BINARY_PATH="${CODEX_BINARY_PATH:-codex}" \
  CODEX_WORKING_DIRECTORY="${CODEX_WORKING_DIRECTORY:-$ROOT_DIR}" \
  CODEX_MODEL="${CODEX_MODEL:-gpt-5.4}" \
  CODEX_ENABLE_DANGEROUS_BYPASS="${CODEX_ENABLE_DANGEROUS_BYPASS:-false}" \
  CODEX_SANDBOX="${CODEX_SANDBOX:-read-only}" \
  CODEX_SKIP_GIT_REPO_CHECK="${CODEX_SKIP_GIT_REPO_CHECK:-true}" \
  CODEX_TIMEOUT_MS="${CODEX_TIMEOUT_MS:-60000}" \
  LOG_LEVEL="${LOG_LEVEL:-info}" \
  RECENT_MESSAGE_LIMIT="${RECENT_MESSAGE_LIMIT:-12}" \
  SYSTEM_PROMPT="${SYSTEM_PROMPT:-You answer customer questions about mobile app development projects. Do not use tools or make file changes.}" \
  node <<'NODE'
const { spawn } = require("node:child_process");
const { openSync } = require("node:fs");

const logFile = process.env.LOG_FILE;
const out = openSync(logFile, "a");
const env = {
  ...process.env,
  HOST: process.env.GATEWAY_HOST,
  PORT: process.env.GATEWAY_PORT,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${process.env.POSTGRES_PORT}/varienai`,
  REDIS_URL: `redis://127.0.0.1:${process.env.REDIS_PORT}`,
  CODEX_AUTH_MODE: process.env.CODEX_AUTH_MODE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

const child = spawn(process.execPath, ["dist/src/server.js"], {
  cwd: process.env.ROOT_DIR,
  detached: true,
  env,
  stdio: ["ignore", out, out],
});

child.unref();
console.log(String(child.pid));
NODE
)"

echo "$PID" >"$PID_FILE"

for _ in {1..30}; do
  if curl -fsS "http://$GATEWAY_HOST:$GATEWAY_PORT/health" >/dev/null 2>&1; then
    echo "Host fallback gateway is ready."
    echo "URL: http://$GATEWAY_HOST:$GATEWAY_PORT"
    echo "PID: $PID"
    echo "Log: $LOG_FILE"
    exit 0
  fi

  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Host fallback gateway exited unexpectedly. Tail of the log:" >&2
    tail -n 60 "$LOG_FILE" >&2 || true
    exit 1
  fi

  sleep 1
done

echo "Host fallback gateway did not become healthy in time. Tail of the log:" >&2
tail -n 60 "$LOG_FILE" >&2 || true
exit 1
