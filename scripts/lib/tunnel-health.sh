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

tunnel_pm2_restart() {
  local target="$1"
  local log_file="${2:-/dev/null}"
  if command -v npx >/dev/null 2>&1; then
    npx pm2 restart "$target" >>"$log_file" 2>&1 || true
  fi
}

tunnel_recover() {
  local root="${1:-$(tunnel_health_root)}"
  local log_file="${2:-$root/deploy/watchdog.log}"
  local public_health="${3:-${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health}"

  tunnel_health_load_env "$root"

  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "RECOVER: restarting tunnel (1033 prevention)" >>"$log_file"

  tunnel_pm2_restart textile-tunnel "$log_file"
  sleep 15

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

  if ! tunnel_check_public "$public_health"; then
    echo "public_down"
    return 0
  fi

  local ha
  ha="$(tunnel_ha_connections "$root" 2>/dev/null || echo "")"
  if [[ -n "$ha" && "$ha" =~ ^[0-9]+$ && "$ha" -eq 0 ]]; then
    echo "ha_zero"
    return 0
  fi

  echo "ok"
  return 1
}
