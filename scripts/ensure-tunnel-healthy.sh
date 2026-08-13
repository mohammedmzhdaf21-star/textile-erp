#!/usr/bin/env bash
# One-shot tunnel health check — run from cron every minute as backup to PM2 watchdog.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

LOG_FILE="$ROOT/deploy/tunnel-recovery.log"
PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >>"$LOG_FILE"
}

reason="$(tunnel_needs_recovery "$ROOT" "$PUBLIC_HEALTH")"

case "$reason" in
  ok)
    exit 0
    ;;
  local_down)
    log "Cron recovery: local app down — restarting textile-erp + tunnel"
    tunnel_pm2_restart textile-erp "$LOG_FILE"
    sleep 12
    tunnel_pm2_restart textile-tunnel "$LOG_FILE"
    ;;
  ha_zero|ha_degraded:*|public_down)
    log "Cron recovery: $reason — recovering tunnel"
    tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
    ;;
  *)
    log "Cron recovery: unexpected state ($reason)"
    ;;
esac

exit 0
