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
INTERVAL="${TUNNEL_KEEPALIVE_SEC:-20}"
LOG_FILE="$ROOT/deploy/keepalive.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >>"$LOG_FILE"
}

log "Keepalive started (public=$PUBLIC_HEALTH every ${INTERVAL}s)"

fail_streak=0

while true; do
  local_ok=0
  public_ok=0

  if curl -sf --max-time 10 "$LOCAL_HEALTH" >/dev/null 2>&1; then
    local_ok=1
  fi

  if tunnel_check_public "$PUBLIC_HEALTH"; then
    public_ok=1
    fail_streak=0
  else
    fail_streak=$((fail_streak + 1))
  fi

  if [[ "$local_ok" -eq 0 ]]; then
    log "Keepalive: local app down — restarting textile-erp"
    tunnel_pm2_restart textile-erp "$LOG_FILE"
    sleep 8
    tunnel_pm2_restart textile-tunnel "$LOG_FILE"
  elif [[ "$public_ok" -eq 0 && "$fail_streak" -ge 2 ]]; then
    log "Keepalive: public URL failed ${fail_streak}x — recovering tunnel"
    tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
    fail_streak=0
  fi

  sleep "$INTERVAL"
done
