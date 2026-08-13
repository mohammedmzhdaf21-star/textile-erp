#!/usr/bin/env bash
# Keeps Cloudflare tunnel connections warm — prevents idle QUIC/HTTP2 timeout that causes Error 1033.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOCAL_HEALTH="${LOCAL_HEALTH_URL:-http://127.0.0.1:3000/health}"
INTERVAL="${TUNNEL_KEEPALIVE_SEC:-30}"
LOG_FILE="$ROOT/deploy/keepalive.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >>"$LOG_FILE"
}

log "Keepalive started (public=$PUBLIC_HEALTH every ${INTERVAL}s)"

while true; do
  curl -sf --max-time 15 "$LOCAL_HEALTH" >/dev/null 2>&1 || true
  curl -sf --max-time 20 "$PUBLIC_HEALTH" >/dev/null 2>&1 || true
  sleep "$INTERVAL"
done
