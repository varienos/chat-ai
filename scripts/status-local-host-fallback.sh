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

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"

  if kill -0 "$PID" 2>/dev/null; then
    echo "Gateway: running (PID $PID)"
  else
    echo "Gateway: stale PID file ($PID)"
  fi
else
  echo "Gateway: not running"
fi

echo "Gateway URL: http://$GATEWAY_HOST:$GATEWAY_PORT"
echo "Log file: $LOG_FILE"

if curl -fsS "http://$GATEWAY_HOST:$GATEWAY_PORT/health" >/dev/null 2>&1; then
  echo "Health: up"
  curl -fsS "http://$GATEWAY_HOST:$GATEWAY_PORT/ready"
  printf "\n"
else
  echo "Health: down"
fi

echo "Docker support services:"
cd "$ROOT_DIR"
POSTGRES_PORT="$POSTGRES_PORT" REDIS_PORT="$REDIS_PORT" docker compose ps redis postgres
