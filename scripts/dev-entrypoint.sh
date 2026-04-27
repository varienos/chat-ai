#!/bin/sh
set -eu

HASH_FILE="/app/node_modules/.package-lock.hash"
CURRENT_HASH="$(sha256sum /app/package-lock.json | awk '{ print $1 }')"
INSTALLED_HASH=""

if [ -f "$HASH_FILE" ]; then
  INSTALLED_HASH="$(cat "$HASH_FILE")"
fi

if [ ! -d "/app/node_modules" ] || [ "$CURRENT_HASH" != "$INSTALLED_HASH" ]; then
  npm ci
  mkdir -p /app/node_modules
  printf "%s" "$CURRENT_HASH" > "$HASH_FILE"
fi

exec "$@"
