#!/usr/bin/env bash
# Restart the official cloudflared system service (force-kill if graceful stop hangs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${1:-$ROOT/deploy/tunnel-restart.log}"
PID_FILE="/var/run/cloudflared.pid"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

cloudflared_pids() {
  pgrep -f 'cloudflared.*tunnel run' 2>/dev/null || true
}

stop_cloudflared() {
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib/tunnel-health.sh"

  if [[ -x /etc/init.d/cloudflared ]]; then
    if sudo /etc/init.d/cloudflared stop >>"$LOG_FILE" 2>&1; then
      return 0
    fi
  elif command -v systemctl >/dev/null 2>&1 \
    && systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cloudflared\.service'; then
    if sudo systemctl stop cloudflared >>"$LOG_FILE" 2>&1; then
      return 0
    fi
  fi

  if tunnel_pm2_cmd describe textile-tunnel >/dev/null 2>&1; then
    tunnel_pm2_cmd stop textile-tunnel >>"$LOG_FILE" 2>&1 || true
    tunnel_pm2_cmd delete textile-tunnel >>"$LOG_FILE" 2>&1 || true
    return 0
  fi

  return 1
}

start_cloudflared() {
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib/tunnel-health.sh"

  tunnel_health_load_env "$ROOT"

  if [[ -x /etc/init.d/cloudflared ]]; then
    sudo /etc/init.d/cloudflared start >>"$LOG_FILE" 2>&1
    return $?
  fi
  if command -v systemctl >/dev/null 2>&1 \
    && systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cloudflared\.service'; then
    sudo systemctl start cloudflared >>"$LOG_FILE" 2>&1
    return $?
  fi

  if tunnel_pm2_start_connector "$ROOT" "$LOG_FILE"; then
    log "RESTART: started PM2 textile-tunnel (no system cloudflared service)"
    return 0
  fi

  if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    log "RESTART: ERROR — set CLOUDFLARE_TUNNEL_TOKEN in .env to start the tunnel"
  else
    log "RESTART: ERROR — cloudflared not installed and PM2 tunnel failed to start"
  fi
  return 1
}

log "RESTART: stopping cloudflared"
stop_cloudflared || true

if [[ -n "$(cloudflared_pids)" ]]; then
  log "RESTART: graceful stop failed — sending SIGTERM"
  sudo pkill -TERM -f 'cloudflared.*tunnel run' >>"$LOG_FILE" 2>&1 || true
  sleep 3
fi

if [[ -n "$(cloudflared_pids)" ]]; then
  log "RESTART: still running — sending SIGKILL"
  sudo pkill -KILL -f 'cloudflared.*tunnel run' >>"$LOG_FILE" 2>&1 || true
  sleep 1
fi

if [[ -f "$PID_FILE" ]]; then
  sudo rm -f "$PID_FILE" >>"$LOG_FILE" 2>&1 || true
fi

log "RESTART: starting cloudflared"
start_cloudflared

for _ in $(seq 1 20); do
  if curl -sf --max-time 2 http://127.0.0.1:20241/metrics >/dev/null 2>&1; then
    log "RESTART: cloudflared metrics available"
    exit 0
  fi
  sleep 1
done

log "RESTART: WARN cloudflared started but metrics not ready yet"
exit 0
