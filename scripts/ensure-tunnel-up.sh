#!/usr/bin/env bash
# One-shot: if the app is up but the public domain fails, restart the tunnel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOG_FILE="$ROOT/deploy/tunnel-guard.log"
LOCK_FILE="$ROOT/deploy/tunnel-guard.lock"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >>"$LOG_FILE"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

if ! tunnel_check_local; then
  exit 0
fi

if tunnel_check_public_strict "$PUBLIC_HEALTH"; then
  exit 0
fi

log "GUARD: public URL failed while app is healthy — restarting tunnel"
tunnel_pm2_restart textile-tunnel "$LOG_FILE"
sleep 12

if tunnel_check_public_strict "$PUBLIC_HEALTH"; then
  log "GUARD: recovered after tunnel restart"
  exit 0
fi

if [[ -x "$ROOT/scripts/setup-custom-domain.sh" ]] \
  && [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  log "GUARD: still failing — refreshing DNS + tunnel"
  bash "$ROOT/scripts/setup-custom-domain.sh" >>"$LOG_FILE" 2>&1 || true
  tunnel_pm2_restart textile-tunnel "$LOG_FILE"
  sleep 15
fi

if tunnel_check_public_strict "$PUBLIC_HEALTH"; then
  log "GUARD: recovered after DNS refresh"
else
  log "GUARD: public URL still failing"
fi

exit 0
