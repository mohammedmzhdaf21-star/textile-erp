#!/usr/bin/env bash
# One-shot tunnel health check — run from cron every 2 minutes as a backup to PM2 watchdog.
# Prevents Cloudflare Error 1033 by restarting the tunnel before users notice prolonged outages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

LOG_FILE="$ROOT/deploy/tunnel-recovery.log"
PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOCK_FILE="$ROOT/deploy/tunnel-recovery.lock"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >>"$LOG_FILE"
}

# Avoid overlapping recovery runs from cron + watchdog.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

reason="$(tunnel_needs_recovery "$ROOT" "$PUBLIC_HEALTH" || echo ok)"

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
    log "Cron recovery: $reason — restarting tunnel"
    tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
    ;;
  *)
    log "Cron recovery: unknown state ($reason)"
    ;;
esac

exit 0
