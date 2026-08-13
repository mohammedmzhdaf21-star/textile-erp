#!/usr/bin/env bash
# Keeps the ERP app and named tunnel reachable; restarts PM2 processes on failed health checks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

LOCAL_HEALTH="${LOCAL_HEALTH_URL:-http://127.0.0.1:3000/health}"
PUBLIC_HEALTH="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health"
CHECK_INTERVAL="${WATCHDOG_INTERVAL_SEC:-45}"
FAIL_THRESHOLD="${WATCHDOG_FAIL_THRESHOLD:-2}"
LOG_FILE="$ROOT/deploy/watchdog.log"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

check_url() {
  curl -sf --max-time 20 "$1" >/dev/null 2>&1
}

pm2_restart() {
  local target="$1"
  if command -v npx >/dev/null 2>&1; then
    npx pm2 restart "$target" >>"$LOG_FILE" 2>&1 || true
  fi
}

local_failures=0
public_failures=0

log "Watchdog started (local=$LOCAL_HEALTH public=$PUBLIC_HEALTH interval=${CHECK_INTERVAL}s)"

while true; do
  if check_url "$LOCAL_HEALTH"; then
    local_failures=0
  else
    local_failures=$((local_failures + 1))
    log "Local health failed ($local_failures/$FAIL_THRESHOLD)"
    if [[ "$local_failures" -ge "$FAIL_THRESHOLD" ]]; then
      log "Restarting textile-erp"
      pm2_restart textile-erp
      sleep 10
      pm2_restart textile-tunnel
      local_failures=0
      public_failures=0
    fi
  fi

  if check_url "$PUBLIC_HEALTH"; then
    public_failures=0
  else
    public_failures=$((public_failures + 1))
    log "Public health failed ($public_failures/$FAIL_THRESHOLD) for $PUBLIC_HEALTH"
    if [[ "$public_failures" -ge "$FAIL_THRESHOLD" ]]; then
      if check_url "$LOCAL_HEALTH"; then
        log "App is up locally — restarting named tunnel and refreshing DNS"
        pm2_restart textile-tunnel
        if [[ -x "$ROOT/scripts/setup-custom-domain.sh" ]]; then
          bash "$ROOT/scripts/setup-custom-domain.sh" >>"$LOG_FILE" 2>&1 || true
        fi
      else
        log "App and tunnel unhealthy — restarting both"
        pm2_restart textile-erp
        sleep 10
        pm2_restart textile-tunnel
      fi
      public_failures=0
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
