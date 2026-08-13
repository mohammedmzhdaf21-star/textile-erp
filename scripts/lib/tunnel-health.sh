#!/usr/bin/env bash
# Shared tunnel health checks and recovery (sourced by watchdog + cron scripts).
set -euo pipefail

tunnel_health_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

tunnel_health_load_env() {
  local root="$1"
  if [[ -f "$root/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$root/.env"
    set +a
  fi
}

tunnel_metrics_url() {
  local root="${1:-$(tunnel_health_root)}"
  local port_file="$root/deploy/tunnel-metrics.port"
  local port="20241"
  if [[ -f "$port_file" ]]; then
    port="$(tr -d '[:space:]' < "$port_file")"
  fi
  for try_port in "$port" 20241 20242 20243 20244 20245; do
    if curl -sf --max-time 2 "http://127.0.0.1:${try_port}/metrics" >/dev/null 2>&1; then
      echo "http://127.0.0.1:${try_port}/metrics"
      return 0
    fi
  done
  return 1
}

tunnel_ha_connections() {
  local metrics url
  url="$(tunnel_metrics_url "$1" 2>/dev/null || true)"
  [[ -n "$url" ]] || return 1
  metrics="$(curl -sf --max-time 3 "$url" 2>/dev/null || true)"
  echo "$metrics" | awk '/^cloudflared_tunnel_ha_connections / { print $2; exit }'
}

tunnel_check_local() {
  local url="${1:-http://127.0.0.1:3000/health}"
  curl -sf --max-time 8 "$url" >/dev/null 2>&1
}

tunnel_check_public() {
  local public_health="${1:-https://erp.kutalimzhda.com/health}"
  local body code
  body="$(curl -s --max-time 12 "$public_health" 2>/dev/null || true)"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$public_health" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    return 0
  fi
  if echo "$body" | grep -qiE 'error code: (1033|530)|cloudflare tunnel|unable to reach the origin|cloudflare tunnel error'; then
    return 1
  fi
  [[ "$code" == "200" ]]
}

tunnel_pm2_cmd() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v npx >/dev/null 2>&1; then
    npx pm2 "$@"
  else
    return 1
  fi
}

tunnel_pm2_restart() {
  local target="$1"
  local log_file="${2:-/dev/null}"
  tunnel_pm2_cmd restart "$target" --update-env >>"$log_file" 2>&1 || \
    tunnel_pm2_cmd start "$target" --update-env >>"$log_file" 2>&1 || true
}

tunnel_pm2_start_missing() {
  local root="$1"
  local log_file="${2:-/dev/null}"
  tunnel_pm2_cmd start "$root/ecosystem.config.cjs" --update-env >>"$log_file" 2>&1 || true
}

tunnel_recover() {
  local root="${1:-$(tunnel_health_root)}"
  local log_file="${2:-$root/deploy/watchdog.log}"
  local public_health="${3:-${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health}"
  local cooldown_sec="${TUNNEL_RECOVERY_COOLDOWN_SEC:-20}"
  local cooldown_file="$root/deploy/last-tunnel-recovery.ts"
  local lock_file="$root/deploy/tunnel-recovery.lock"

  tunnel_health_load_env "$root"

  exec 8>"$lock_file"
  if ! flock -n 8; then
    printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: skipped (recovery already running)" >>"$log_file"
    return 0
  fi

  if [[ -f "$cooldown_file" ]]; then
    local last now
    last="$(tr -d '[:space:]' < "$cooldown_file" 2>/dev/null || echo 0)"
    now=$(date +%s)
    if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < cooldown_sec )); then
      printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: skipped (cooldown ${cooldown_sec}s)" >>"$log_file"
      return 0
    fi
  fi
  date +%s > "$cooldown_file"

  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: restarting tunnel (1033 prevention)" >>"$log_file"

  tunnel_pm2_restart textile-tunnel "$log_file"
  sleep 10

  if ! tunnel_check_public "$public_health"; then
    printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: public still down — refreshing DNS" >>"$log_file"
    if [[ -x "$root/scripts/setup-custom-domain.sh" ]]; then
      bash "$root/scripts/setup-custom-domain.sh" >>"$log_file" 2>&1 || true
    fi
    tunnel_pm2_restart textile-tunnel "$log_file"
    sleep 10
  fi

  if tunnel_check_public "$public_health"; then
    printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: public health OK" >>"$log_file"
    return 0
  fi

  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: public still failing after tunnel restart" >>"$log_file"
  return 1
}

tunnel_needs_recovery() {
  local root="${1:-$(tunnel_health_root)}"
  local public_health="${2:-${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health}"
  local min_ha="${TUNNEL_MIN_HA_CONNECTIONS:-2}"

  tunnel_health_load_env "$root"

  if ! tunnel_check_local; then
    echo "local_down"
    return 0
  fi

  local ha=""
  ha="$(tunnel_ha_connections "$root" 2>/dev/null || echo "")"
  if [[ -n "$ha" && "$ha" =~ ^[0-9]+$ ]]; then
    if [[ "$ha" -eq 0 ]]; then
      echo "ha_zero"
      return 0
    fi
    if [[ "$ha" -lt "$min_ha" ]]; then
      echo "ha_degraded:${ha}"
      return 0
    fi
  fi

  if ! tunnel_check_public "$public_health"; then
    echo "public_down"
    return 0
  fi

  echo "ok"
  return 0
}

tunnel_apply_quic_sysctl() {
  if [[ -w /proc/sys/net/core/rmem_max ]]; then
    echo 8388608 > /proc/sys/net/core/rmem_max 2>/dev/null || true
    echo 8388608 > /proc/sys/net/core/wmem_max 2>/dev/null || true
    echo 8388608 > /proc/sys/net/core/rmem_default 2>/dev/null || true
    echo 8388608 > /proc/sys/net/core/wmem_default 2>/dev/null || true
  fi
  if command -v sysctl >/dev/null 2>&1; then
    sysctl -w \
      net.core.rmem_max=8388608 \
      net.core.rmem_default=8388608 \
      net.core.wmem_max=8388608 \
      net.core.wmem_default=8388608 \
      2>/dev/null || true
  fi
}
