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

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is missing from .env"
  echo "Create a named tunnel in Cloudflare Zero Trust and paste the run token."
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared is not installed"
  exit 1
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
exec cloudflared tunnel run --token "$TOKEN"
