#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.local/runtime"
PID_FILE="$RUNTIME_DIR/host-gateway.pid"

GATEWAY_PORT="${HOST_FALLBACK_PORT:-3020}"
POSTGRES_PORT="${HOST_FALLBACK_POSTGRES_PORT:-55432}"
REDIS_PORT="${HOST_FALLBACK_REDIS_PORT:-56379}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"

  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping host fallback gateway PID $PID..."
    kill "$PID"

    for _ in {1..10}; do
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi

      sleep 1
    done

    if kill -0 "$PID" 2>/dev/null; then
      echo "Gateway did not exit gracefully; sending SIGKILL."
      kill -9 "$PID"
    fi
  fi

  rm -f "$PID_FILE"
else
  echo "No host fallback PID file found."
fi

echo "Stopping Docker Redis/Postgres support services..."
cd "$ROOT_DIR"
POSTGRES_PORT="$POSTGRES_PORT" REDIS_PORT="$REDIS_PORT" docker compose stop redis postgres >/dev/null || true

if lsof -nP -iTCP:"$GATEWAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Warning: something is still listening on port $GATEWAY_PORT." >&2
else
  echo "Host fallback gateway stopped."
fi
