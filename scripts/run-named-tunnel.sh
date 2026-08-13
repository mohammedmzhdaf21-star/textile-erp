#!/usr/bin/env bash
# Permanent Cloudflare named tunnel → https://erp.kutalimzhda.com
# Keeps the connector healthy: if Cloudflare edge links drop or the domain stops
# responding while the app is up, restart cloudflared (PM2 autorestart).
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
STARTUP_GRACE_SEC="${TUNNEL_STARTUP_GRACE_SEC:-60}"
CHECK_INTERVAL_SEC="${TUNNEL_CHECK_INTERVAL_SEC:-15}"
MIN_HA_CONNECTIONS="${TUNNEL_MIN_HA_CONNECTIONS:-4}"
FAIL_STREAK_LIMIT="${TUNNEL_FAIL_STREAK_LIMIT:-2}"

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
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "ERROR: App not healthy on port ${PORT}. Start textile-erp first."
  exit 1
fi

mkdir -p "$ROOT/deploy"
printf '%s\n' "$PUBLIC_URL" > "$ROOT/deploy/public-url.txt"
printf '%s\n' "$METRICS_PORT" > "$ROOT/deploy/tunnel-metrics.port"

if command -v lsof >/dev/null 2>&1 && lsof -ti ":${METRICS_PORT}" >/dev/null 2>&1; then
  lsof -ti ":${METRICS_PORT}" | xargs -r kill -9 2>/dev/null || true
  sleep 2
fi

log_tunnel() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$ROOT/deploy/tunnel.log"
}

read_ha_connections() {
  curl -sf --max-time 3 "http://127.0.0.1:${METRICS_PORT}/metrics" 2>/dev/null \
    | awk '/^cloudflared_tunnel_ha_connections / { print $2; exit }'
}

tunnel_connector_unhealthy() {
  local ha="$1"
  local reason=""

  if [[ -z "$ha" || ! "$ha" =~ ^[0-9]+$ || "$ha" -lt "$MIN_HA_CONNECTIONS" ]]; then
    reason="ha=${ha:-none} (need ${MIN_HA_CONNECTIONS})"
  elif tunnel_check_local && ! tunnel_check_public "$PUBLIC_HEALTH"; then
    reason="domain_unreachable (app ok, public failed)"
  fi

  if [[ -n "$reason" ]]; then
    echo "$reason"
    return 0
  fi
  return 1
}

echo "==> Cloudflare named tunnel"
echo "    Domain:   $PUBLIC_URL"
echo "    Origin:   http://127.0.0.1:${PORT}"
echo "    Protocol: $TUNNEL_PROTOCOL"

cloudflared tunnel \
  --metrics "127.0.0.1:${METRICS_PORT}" \
  --loglevel info \
  --logfile "$ROOT/deploy/tunnel.log" \
  run --token "$TOKEN" --protocol "$TUNNEL_PROTOCOL" &
CF_PID=$!

started_at=$(date +%s)
fail_streak=0

while kill -0 "$CF_PID" 2>/dev/null; do
  sleep "$CHECK_INTERVAL_SEC"

  if ! kill -0 "$CF_PID" 2>/dev/null; then
    break
  fi

  now=$(date +%s)
  if (( now - started_at < STARTUP_GRACE_SEC )); then
    continue
  fi

  ha="$(read_ha_connections || true)"
  unhealthy_reason="$(tunnel_connector_unhealthy "$ha" || true)"

  if [[ -n "$unhealthy_reason" ]]; then
    fail_streak=$((fail_streak + 1))
    log_tunnel "Tunnel unhealthy: ${unhealthy_reason} (streak=${fail_streak})"
    if (( fail_streak >= FAIL_STREAK_LIMIT )); then
      log_tunnel "Restarting tunnel connector"
      kill -TERM "$CF_PID" 2>/dev/null || true
      wait "$CF_PID" 2>/dev/null || true
      exit 1
    fi
  else
    fail_streak=0
  fi
done

wait "$CF_PID"
exit $?
