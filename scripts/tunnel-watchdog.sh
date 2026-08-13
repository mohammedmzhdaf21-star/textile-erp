#!/usr/bin/env bash
# 24/7 watchdog: detects Cloudflare 1033 and recovers within seconds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

LOCAL_HEALTH="${LOCAL_HEALTH_URL:-http://127.0.0.1:3000/health}"
PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
CHECK_INTERVAL="${WATCHDOG_INTERVAL_SEC:-10}"
LOG_FILE="$ROOT/deploy/watchdog.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

log "Watchdog started (interval=${CHECK_INTERVAL}s, min_ha=${TUNNEL_MIN_HA_CONNECTIONS:-2})"

while true; do
  reason="$(tunnel_needs_recovery "$ROOT" "$PUBLIC_HEALTH" || echo ok)"

  case "$reason" in
    ok)
      ;;
    local_down)
      log "Local app down — restarting textile-erp + tunnel"
      tunnel_pm2_restart textile-erp "$LOG_FILE"
      sleep 12
      tunnel_pm2_restart textile-tunnel "$LOG_FILE"
      ;;
    public_down)
      log "Public URL down (1033/530) — recovering tunnel"
      tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
      ;;
    ha_degraded:*)
      log "Tunnel HA connections degraded ($reason) — proactive restart"
      tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
      ;;
  esac

  sleep "$CHECK_INTERVAL"
done
