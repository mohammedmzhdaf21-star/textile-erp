#!/usr/bin/env bash
# Permanent Cloudflare named tunnel (erp.kutalimzhda.com).
# Uses QUIC with 4 HA connections + fixed metrics port for health monitoring.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
# QUIC opens 4 edge connections (more resilient than HTTP/2's single connection).
TUNNEL_PROTOCOL="${CLOUDFLARE_TUNNEL_PROTOCOL:-quic}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is missing from .env"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed"
  exit 1
fi

# Reduce QUIC drops on cloud VMs (Cloudflare docs recommend larger UDP buffers).
if [[ -w /proc/sys/net/core/rmem_max ]]; then
  echo 8388608 > /proc/sys/net/core/rmem_max 2>/dev/null || true
  echo 8388608 > /proc/sys/net/core/wmem_max 2>/dev/null || true
fi
if command -v sysctl >/dev/null 2>&1; then
  sysctl -w \
    net.core.rmem_max=8388608 \
    net.core.rmem_default=8388608 \
    net.core.wmem_max=8388608 \
    net.core.wmem_default=8388608 \
    2>/dev/null || true
fi

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

echo "==> Starting named Cloudflare tunnel"
echo "    Public URL: $PUBLIC_URL"
echo "    Protocol:   $TUNNEL_PROTOCOL (4 HA connections)"
echo "    Metrics:    localhost:${METRICS_PORT}/metrics"

exec cloudflared tunnel \
  --metrics "127.0.0.1:${METRICS_PORT}" \
  run --token "$TOKEN" --protocol "$TUNNEL_PROTOCOL"
