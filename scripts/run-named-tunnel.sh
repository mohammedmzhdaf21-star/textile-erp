#!/usr/bin/env bash
# Permanent Cloudflare named tunnel → https://erp.kutalimzhda.com
# DNS: CNAME erp → {tunnel-id}.cfargotunnel.com (configured in Cloudflare, not ephemeral).
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
METRICS_PORT="${TUNNEL_METRICS_PORT:-20241}"

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

echo "==> Cloudflare named tunnel"
echo "    Domain:  $PUBLIC_URL"
echo "    Origin:  http://127.0.0.1:${PORT}"

exec cloudflared tunnel \
  --metrics "127.0.0.1:${METRICS_PORT}" \
  --loglevel info \
  --logfile "$ROOT/deploy/tunnel.log" \
  run --token "$TOKEN"
