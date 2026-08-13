#!/usr/bin/env bash
# Start production app + Cloudflare named tunnel. Run after deploy or server reboot.
#
# Usage:
#   ensure-24-7.sh              Ensure both processes are running
#   ensure-24-7.sh --reload-app Restart app after a code deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"
tunnel_apply_quic_sysctl

PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOG_FILE="$ROOT/deploy/ensure-24-7.log"
REQUIRED_APPS=(textile-erp textile-tunnel)

RELOAD_APP=false
for arg in "$@"; do
  [[ "$arg" == "--reload-app" ]] && RELOAD_APP=true
done

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

pm2_cmd() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  else
    npx pm2 "$@"
  fi
}

pm2_app_status() {
  local app="$1"
  pm2_cmd jlist 2>/dev/null | node -e "
    const apps=JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
    const a=apps.find(x=>x.name===process.argv[1]);
    process.stdout.write(a?.pm2_env?.status||'');
  " "$app" 2>/dev/null || echo ""
}

log "ensure-24-7: starting production stack (app + named tunnel)"

if [[ "$RELOAD_APP" == "true" ]]; then
  if ! bash "$ROOT/scripts/verify-server-boot.sh"; then
    log "ensure-24-7: ERROR server boot verification failed"
    exit 1
  fi
  log "ensure-24-7: deploy — restarting textile-erp"
  tunnel_pm2_restart textile-erp "$LOG_FILE"
else
  missing=false
  for app in "${REQUIRED_APPS[@]}"; do
    status="$(pm2_app_status "$app")"
    if [[ "$status" != "online" && "$status" != "launching" ]]; then
      missing=true
      break
    fi
  done
  if [[ "$missing" == "true" ]]; then
    if ! bash "$ROOT/scripts/verify-server-boot.sh"; then
      log "ensure-24-7: ERROR server boot verification failed"
      exit 1
    fi
    pm2_cmd start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG_FILE" 2>&1 \
      || pm2_cmd restart textile-erp textile-tunnel --update-env >>"$LOG_FILE" 2>&1 \
      || true
  fi
fi

# Remove legacy watchdog processes if they were started by an older install.
for legacy in textile-tunnel-keepalive textile-tunnel-recovery textile-watchdog; do
  if pm2_cmd describe "$legacy" >/dev/null 2>&1; then
    log "ensure-24-7: removing legacy monitor $legacy"
    pm2_cmd delete "$legacy" >>"$LOG_FILE" 2>&1 || true
  fi
done

pm2_cmd save >>"$LOG_FILE" 2>&1 || true

log "ensure-24-7: waiting for local app"
for _ in $(seq 1 30); do
  tunnel_check_local && break
  sleep 2
done

if ! tunnel_check_local; then
  log "ensure-24-7: ERROR local app not healthy"
  pm2_cmd logs textile-erp --lines 20 --nostream >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

if tunnel_check_public "$PUBLIC_HEALTH"; then
  log "ensure-24-7: OK local + public ($PUBLIC_HEALTH)"
  exit 0
fi

log "ensure-24-7: public URL not ready yet — restarting tunnel once"
tunnel_pm2_restart textile-tunnel "$LOG_FILE"
sleep 15

if tunnel_check_public "$PUBLIC_HEALTH"; then
  log "ensure-24-7: OK public=$PUBLIC_HEALTH"
  exit 0
fi

log "ensure-24-7: WARN public URL not reachable yet (DNS/tunnel may need a minute)"
log "ensure-24-7: local app is healthy; named tunnel connector is running"
exit 0
