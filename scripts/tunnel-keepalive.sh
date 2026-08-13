#!/usr/bin/env bash
# Keeps Cloudflare tunnel connections warm and triggers recovery on public failures.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

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
  reason="$(tunnel_needs_recovery "$ROOT" "$PUBLIC_HEALTH")"

  case "$reason" in
    ok)
      ;;
    local_down)
      log "Keepalive: local app down — restarting textile-erp + tunnel"
      tunnel_pm2_restart textile-erp "$LOG_FILE"
      sleep 8
      tunnel_pm2_restart textile-tunnel "$LOG_FILE"
      ;;
    ha_zero|ha_degraded:*|public_down)
      log "Keepalive: $reason — recovering tunnel"
      tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
      ;;
  esac

  # Warm the public URL even when healthy (prevents idle edge disconnects).
  curl -sf --max-time 10 "$LOCAL_HEALTH" >/dev/null 2>&1 || true
  tunnel_check_public "$PUBLIC_HEALTH" >/dev/null 2>&1 || true

  sleep "$INTERVAL"
done
