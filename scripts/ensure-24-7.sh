#!/usr/bin/env bash
# Idempotent: start all 24/7 services and verify https://erp.kutalimzhda.com is reachable.
# Run after deploy, on boot, or anytime — prevents Cloudflare Error 1033 from staying unfixed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

tunnel_health_load_env "$ROOT"

PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
LOG_FILE="$ROOT/deploy/ensure-24-7.log"
REQUIRED_APPS=(
  textile-erp
  textile-tunnel
  textile-tunnel-keepalive
  textile-tunnel-recovery
  textile-watchdog
)

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

pm2_all_running() {
  local app
  for app in "${REQUIRED_APPS[@]}"; do
    if ! pm2_cmd describe "$app" >/dev/null 2>&1; then
      return 1
    fi
    local status
    status="$(pm2_cmd jlist 2>/dev/null | node -e "
      const apps=JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
      const a=apps.find(x=>x.name===process.argv[1]);
      process.stdout.write(a?.pm2_env?.status||'');
    " "$app" 2>/dev/null || echo "")"
    if [[ "$status" != "online" && "$status" != "launching" ]]; then
      return 1
    fi
  done
  return 0
}

log "ensure-24-7: checking production stack"

if ! pm2_all_running; then
  log "ensure-24-7: starting/reloading full PM2 ecosystem"
  if ! bash "$ROOT/scripts/verify-server-boot.sh"; then
    log "ensure-24-7: ERROR server boot verification failed — not reloading textile-erp"
    tunnel_pm2_restart textile-tunnel "$LOG_FILE"
    exit 1
  fi
  pm2_cmd start "$ROOT/ecosystem.config.cjs" --update-env 2>/dev/null \
    || pm2_cmd reload "$ROOT/ecosystem.config.cjs" --update-env 2>/dev/null \
    || pm2_cmd restart all 2>/dev/null \
    || true
else
  log "ensure-24-7: all PM2 apps present — verifying boot before reload"
  if ! bash "$ROOT/scripts/verify-server-boot.sh"; then
    log "ensure-24-7: ERROR server boot verification failed — restarting existing app only"
    tunnel_pm2_restart textile-erp "$LOG_FILE"
    tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
    exit 1
  fi
  log "ensure-24-7: boot OK — reloading config"
  pm2_cmd reload "$ROOT/ecosystem.config.cjs" --update-env 2>/dev/null \
    || pm2_cmd restart all 2>/dev/null \
    || true
fi

pm2_cmd save >>"$LOG_FILE" 2>&1 || true

log "ensure-24-7: waiting for local app"
for _ in $(seq 1 30); do
  if tunnel_check_local; then
    break
  fi
  sleep 2
done

if ! tunnel_check_local; then
  log "ensure-24-7: ERROR local app not healthy"
  pm2_cmd logs textile-erp --lines 20 --nostream >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

log "ensure-24-7: waiting for public URL"
for i in $(seq 1 24); do
  if tunnel_check_public "$PUBLIC_HEALTH"; then
    ha="$(tunnel_ha_connections "$ROOT" 2>/dev/null || echo "?")"
    log "ensure-24-7: OK public=$PUBLIC_HEALTH ha_connections=${ha}"
    exit 0
  fi
  if [[ "$i" == "6" || "$i" == "12" || "$i" == "18" ]]; then
    log "ensure-24-7: public still down — recovering tunnel (attempt $i)"
    tunnel_recover "$ROOT" "$LOG_FILE" "$PUBLIC_HEALTH" || true
  fi
  sleep 5
done

log "ensure-24-7: ERROR public URL still unreachable after recovery"
exit 1
