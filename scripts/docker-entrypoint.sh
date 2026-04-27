#!/bin/sh
set -eu

# Write auth credentials (as root, since global CLI tools live in /root)
if [ -n "${CODEX_AUTH_JSON:-}" ]; then
  mkdir -p /home/appuser/.codex
  printf '%s' "$CODEX_AUTH_JSON" > /home/appuser/.codex/auth.json
  chown -R appuser:appuser /home/appuser/.codex
  chmod 600 /home/appuser/.codex/auth.json
fi

if [ -n "${GEMINI_AUTH_JSON:-}" ]; then
  mkdir -p /home/appuser/.gemini
  printf '%s' "$GEMINI_AUTH_JSON" > /home/appuser/.gemini/oauth_creds.json
  chown -R appuser:appuser /home/appuser/.gemini
  chmod 600 /home/appuser/.gemini/oauth_creds.json
fi

if [ -n "${CLAUDE_AUTH_JSON:-}" ]; then
  mkdir -p /home/appuser/.claude
  printf '%s' "$CLAUDE_AUTH_JSON" > /home/appuser/.claude/.credentials.json
  chown -R appuser:appuser /home/appuser/.claude
  chmod 600 /home/appuser/.claude/.credentials.json
fi

# Sync knowledge base from git defaults to volume
# Set KNOWLEDGE_SYNC_ON_DEPLOY=true to overwrite volume files with git versions
# Panel edits persist when sync is off — git is source of truth when sync is on
KNOWLEDGE_DIR="${KNOWLEDGE_BASE_PATH:-/app/knowledge}"
if [ -d /app/knowledge.defaults ]; then
  mkdir -p "$KNOWLEDGE_DIR"
  if [ "${KNOWLEDGE_SYNC_ON_DEPLOY:-false}" = "true" ]; then
    cp /app/knowledge.defaults/*.md "$KNOWLEDGE_DIR/" 2>/dev/null || true
    chown -R appuser:appuser "$KNOWLEDGE_DIR"
    echo "[entrypoint] Synced knowledge base from defaults (KNOWLEDGE_SYNC_ON_DEPLOY=true)"
  elif [ -z "$(ls -A "$KNOWLEDGE_DIR" 2>/dev/null)" ]; then
    cp /app/knowledge.defaults/*.md "$KNOWLEDGE_DIR/" 2>/dev/null || true
    chown -R appuser:appuser "$KNOWLEDGE_DIR"
    echo "[entrypoint] Seeded knowledge base (first deploy)"
  fi
fi

# Clear credential env vars before exec to prevent leaking via /proc/1/environ
unset CODEX_AUTH_JSON GEMINI_AUTH_JSON CLAUDE_AUTH_JSON

# Drop to non-root user
exec gosu appuser "$@"
