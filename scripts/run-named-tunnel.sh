#!/usr/bin/env bash
# Permanent Cloudflare named tunnel (erp.kutalimzhda.com).
# Requires CLOUDFLARE_TUNNEL_TOKEN in .env — never use the ephemeral quick tunnel in production.
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
# HTTP/2 is more stable than QUIC on cloud VMs (avoids UDP buffer / idle timeout 1033 errors).
TUNNEL_PROTOCOL="${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is missing from .env"
  echo "Create a named tunnel in Cloudflare Zero Trust and paste the run token."
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed"
  exit 1
fi

# Larger UDP receive buffer reduces QUIC instability when protocol is quic.
if [[ -w /proc/sys/net/core/rmem_max ]]; then
  echo 8388608 > /proc/sys/net/core/rmem_max 2>/dev/null || true
fi
if command -v sysctl >/dev/null 2>&1; then
  sysctl -w net.core.rmem_max=8388608 net.core.rmem_default=8388608 2>/dev/null || true
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

echo "==> Starting named Cloudflare tunnel"
echo "    Public URL: $PUBLIC_URL"
echo "    Protocol:   $TUNNEL_PROTOCOL"
exec cloudflared tunnel run --token "$TOKEN" --protocol "$TUNNEL_PROTOCOL"
