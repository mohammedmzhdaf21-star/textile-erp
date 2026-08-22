#!/usr/bin/env bash
# Start production app + verify Cloudflare tunnel service.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOG_FILE="$ROOT/deploy/ensure-24-7.log"

RELOAD_APP=false
for arg in "$@"; do
  [[ "$arg" == "--reload-app" ]] && RELOAD_APP=true
done

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

pm2_cmd() {
  command -v pm2 >/dev/null 2>&1 && pm2 "$@" || npx pm2 "$@"
}

log "ensure-24-7: checking production stack"

if [[ "$RELOAD_APP" == "true" ]]; then
  bash "$ROOT/scripts/verify-server-boot.sh" || exit 1
  log "ensure-24-7: deploy — restarting textile-erp"
  tunnel_pm2_restart textile-erp "$LOG_FILE"
else
  if ! pm2_cmd describe textile-erp >/dev/null 2>&1; then
    bash "$ROOT/scripts/verify-server-boot.sh" || exit 1
    pm2_cmd start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG_FILE" 2>&1 || true
  fi
fi

# Remove old PM2 tunnel apps if present (conflicts with system service).
for legacy in textile-tunnel textile-tunnel-guard textile-tunnel-keepalive textile-tunnel-recovery textile-watchdog; do
  if pm2_cmd describe "$legacy" >/dev/null 2>&1; then
    log "ensure-24-7: removing legacy $legacy (use install-cloudflared-service.sh)"
    pm2_cmd delete "$legacy" >>"$LOG_FILE" 2>&1 || true
  fi
done

pm2_cmd save >>"$LOG_FILE" 2>&1 || true

# Ensure official cloudflared service is running.
if [[ -x /etc/init.d/cloudflared ]]; then
  if ! pgrep -f "cloudflared.*tunnel run" >/dev/null 2>&1; then
    log "ensure-24-7: starting cloudflared system service"
    sudo /etc/init.d/cloudflared start >>"$LOG_FILE" 2>&1 || true
  fi
elif command -v systemctl >/dev/null 2>&1; then
  sudo systemctl start cloudflared >>"$LOG_FILE" 2>&1 || true
fi

for _ in $(seq 1 30); do
  tunnel_check_local && break
  sleep 2
done

if ! tunnel_check_local; then
  log "ensure-24-7: ERROR local app not healthy"
  exit 1
fi

if tunnel_check_public_strict "$PUBLIC_HEALTH"; then
  log "ensure-24-7: OK local + public"
  exit 0
fi

log "ensure-24-7: public failed — restarting cloudflared service"
bash "$ROOT/scripts/restart-cloudflared-service.sh" >>"$LOG_FILE" 2>&1 || true
bash "$ROOT/scripts/ensure-tunnel-up.sh" >>"$LOG_FILE" 2>&1 || true
sleep 12

if tunnel_check_public_strict "$PUBLIC_HEALTH"; then
  log "ensure-24-7: OK after cloudflared restart"
else
  log "ensure-24-7: WARN public still failing — check Zero Trust dashboard"
fi

exit 0
