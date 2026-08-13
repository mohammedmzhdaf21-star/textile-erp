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
CHECK_INTERVAL="${WATCHDOG_INTERVAL_SEC:-15}"
FAIL_THRESHOLD="${WATCHDOG_FAIL_THRESHOLD:-1}"
LOG_FILE="$ROOT/deploy/watchdog.log"
TUNNEL_LOG="${TUNNEL_ERROR_LOG:-$HOME/.pm2/logs/textile-tunnel-error.log}"

mkdir -p "$ROOT/deploy"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

check_url() {
  curl -sf --max-time 10 "$1" >/dev/null 2>&1
}

check_public_ok() {
  # Cloudflare 1033/530 often return HTTP 530 or an HTML error page while local app is fine.
  local body code
  body="$(curl -s --max-time 12 "$PUBLIC_HEALTH" 2>/dev/null || true)"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC_HEALTH" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    return 0
  fi
  if echo "$body" | grep -qiE 'error code: (1033|530)|cloudflare tunnel|unable to reach the origin'; then
    return 1
  fi
  [[ "$code" == "200" ]]
}

pm2_restart() {
  local target="$1"
  if command -v npx >/dev/null 2>&1; then
    npx pm2 restart "$target" >>"$LOG_FILE" 2>&1 || true
  fi
}

recover_tunnel() {
  log "Recovering tunnel (local app healthy, public URL unreachable — likely Cloudflare 1033)"
  pm2_restart textile-tunnel
  sleep 8
  if ! check_public_ok; then
    log "Public still failing after tunnel restart — refreshing DNS and retrying tunnel"
    if [[ -x "$ROOT/scripts/setup-custom-domain.sh" ]]; then
      bash "$ROOT/scripts/setup-custom-domain.sh" >>"$LOG_FILE" 2>&1 || true
    fi
    pm2_restart textile-tunnel
    sleep 8
  fi
}

tunnel_log_stale() {
  [[ -f "$TUNNEL_LOG" ]] || return 1
  local line ts now cutoff log_ts
  line="$(grep -E 'no more connections active|Tunnel server stopped' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  ts="$(echo "$line" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' || true)"
  [[ -n "$ts" ]] || return 1
  now=$(date -u +%s)
  cutoff=$((now - 180))
  log_ts=$(date -u -d "$ts" +%s 2>/dev/null || echo 0)
  [[ "$log_ts" -ge "$cutoff" ]]
}

local_failures=0
public_failures=0

log "Watchdog started (local=$LOCAL_HEALTH public=$PUBLIC_HEALTH interval=${CHECK_INTERVAL}s threshold=$FAIL_THRESHOLD)"

while true; do
  local_ok=false
  public_ok=false

  if check_url "$LOCAL_HEALTH"; then
    local_ok=true
    local_failures=0
  else
    local_failures=$((local_failures + 1))
    log "Local health failed ($local_failures/$FAIL_THRESHOLD)"
  fi

  if check_public_ok; then
    public_ok=true
    public_failures=0
  else
    public_failures=$((public_failures + 1))
    log "Public health failed ($public_failures/$FAIL_THRESHOLD) for $PUBLIC_HEALTH"
  fi

  if [[ "$local_ok" == "false" && "$local_failures" -ge "$FAIL_THRESHOLD" ]]; then
    log "Restarting textile-erp"
    pm2_restart textile-erp
    sleep 10
    pm2_restart textile-tunnel
    local_failures=0
    public_failures=0
  elif [[ "$local_ok" == "true" && "$public_ok" == "false" && "$public_failures" -ge "$FAIL_THRESHOLD" ]]; then
    recover_tunnel
    public_failures=0
  elif [[ "$local_ok" == "true" && "$public_ok" == "true" ]] && tunnel_log_stale; then
    log "Tunnel error log shows recent connection loss — proactive tunnel restart"
    pm2_restart textile-tunnel
  fi

  sleep "$CHECK_INTERVAL"
done
