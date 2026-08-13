#!/usr/bin/env bash
# Verify the app boots and responds before PM2 reload (prevents 1033 from broken deploys).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERIFY_PORT="${VERIFY_PORT:-3099}"
HEALTH_URL="http://127.0.0.1:${VERIFY_PORT}/health"
LOG_FILE="$ROOT/deploy/verify-boot.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

if [[ ! -x node_modules/.bin/tsx ]]; then
  log "ERROR: tsx missing — run npm install"
  exit 1
fi

if [[ ! -f frontend/dist/index.html ]]; then
  log "ERROR: frontend not built — run npm run build:frontend"
  exit 1
fi

# Free verify port if a stale process is holding it.
if command -v lsof >/dev/null 2>&1 && lsof -ti ":${VERIFY_PORT}" >/dev/null 2>&1; then
  lsof -ti ":${VERIFY_PORT}" | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi

log "verify-boot: starting temporary server on port ${VERIFY_PORT}"

PORT="$VERIFY_PORT" NODE_ENV=production node_modules/.bin/tsx src/server.ts >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 45); do
  if curl -sf --max-time 3 "$HEALTH_URL" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    log "verify-boot: OK"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "verify-boot: FAILED — server process exited early"
    tail -30 "$LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 1
done

log "verify-boot: FAILED — health check timed out"
tail -30 "$LOG_FILE" >&2 || true
exit 1
