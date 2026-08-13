#!/usr/bin/env bash
# Cloudflare named tunnel for https://erp.kutalimzhda.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
PORT="${PORT:-3000}"
PUBLIC_URL="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
PUBLIC_HEALTH="${PUBLIC_URL}/health"
METRICS_PORT="${TUNNEL_METRICS_PORT:-20241}"
TUNNEL_PROTOCOL="${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"
STARTUP_GRACE_SEC="${TUNNEL_STARTUP_GRACE_SEC:-45}"
CHECK_INTERVAL_SEC="${TUNNEL_CHECK_INTERVAL_SEC:-5}"
MIN_HA_CONNECTIONS="${TUNNEL_MIN_HA_CONNECTIONS:-4}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is missing from .env"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed"
  exit 1
fi

tunnel_apply_quic_sysctl

echo "==> Waiting for app on http://127.0.0.1:${PORT}/health"
for _ in $(seq 1 90); do
  curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 2
done

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "ERROR: App not healthy on port ${PORT}"
  exit 1
fi

mkdir -p "$ROOT/deploy"
printf '%s\n' "$PUBLIC_URL" > "$ROOT/deploy/public-url.txt"
printf '%s\n' "$METRICS_PORT" > "$ROOT/deploy/tunnel-metrics.port"

# Only one connector — stale duplicates at Cloudflare edge cause 1033 with ha=4.
pkill -f "cloudflared tunnel --metrics" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1 && lsof -ti ":${METRICS_PORT}" >/dev/null 2>&1; then
  lsof -ti ":${METRICS_PORT}" | xargs -r kill -9 2>/dev/null || true
fi
sleep 2

log_tunnel() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$ROOT/deploy/tunnel.log"
}

read_ha_connections() {
  curl -sf --max-time 3 "http://127.0.0.1:${METRICS_PORT}/metrics" 2>/dev/null \
    | awk '/^cloudflared_tunnel_ha_connections / { print $2; exit }'
}

restart_connector() {
  local reason="$1"
  log_tunnel "Restarting connector: $reason"
  kill -TERM "$CF_PID" 2>/dev/null || true
  wait "$CF_PID" 2>/dev/null || true
  exit 1
}

echo "==> Cloudflare named tunnel"
echo "    Domain:   $PUBLIC_URL"
echo "    Protocol: $TUNNEL_PROTOCOL"

cloudflared tunnel \
  --metrics "127.0.0.1:${METRICS_PORT}" \
  --loglevel info \
  --logfile "$ROOT/deploy/tunnel.log" \
  run --token "$TOKEN" --protocol "$TUNNEL_PROTOCOL" &
CF_PID=$!

started_at=$(date +%s)
public_fail_streak=0
ha_fail_streak=0

while kill -0 "$CF_PID" 2>/dev/null; do
  sleep "$CHECK_INTERVAL_SEC"
  kill -0 "$CF_PID" 2>/dev/null || break

  now=$(date +%s)
  if (( now - started_at < STARTUP_GRACE_SEC )); then
    continue
  fi

  if tunnel_check_local && ! tunnel_check_public_strict "$PUBLIC_HEALTH"; then
    public_fail_streak=$((public_fail_streak + 1))
    log_tunnel "Public domain failed (streak=${public_fail_streak})"
    if (( public_fail_streak >= 1 )); then
      restart_connector "public domain unreachable"
    fi
  else
    public_fail_streak=0
  fi

  ha="$(read_ha_connections || true)"
  if [[ -z "$ha" || ! "$ha" =~ ^[0-9]+$ || "$ha" -lt "$MIN_HA_CONNECTIONS" ]]; then
    ha_fail_streak=$((ha_fail_streak + 1))
    log_tunnel "Low edge connections ha=${ha:-none} (streak=${ha_fail_streak})"
    if (( ha_fail_streak >= 2 )); then
      restart_connector "ha_connections below ${MIN_HA_CONNECTIONS}"
    fi
  else
    ha_fail_streak=0
  fi
done

wait "$CF_PID"
exit $?
