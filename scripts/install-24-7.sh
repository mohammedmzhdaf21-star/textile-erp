#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> Textile ERP production installer"
echo "    Permanent domain: ${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is not set in .env"
  echo "Cloudflare Zero Trust → Networks → Tunnels → Install connector → copy token."
  exit 1
fi

echo "==> Installing dependencies"
npm install
(cd frontend && npm install)
npx prisma migrate deploy
npx prisma generate
npm run build:frontend

chmod +x \
  "$ROOT/scripts/start-production.sh" \
  "$ROOT/scripts/install-cloudflared-service.sh" \
  "$ROOT/scripts/rebuild-cloudflare-tunnel.sh" \
  "$ROOT/scripts/diagnose-tunnel-network.sh" \
  "$ROOT/scripts/restart-cloudflared-service.sh" \
  "$ROOT/scripts/restart-cloudflared-service.sh" \
  "$ROOT/scripts/ensure-24-7.sh" \
  "$ROOT/scripts/ensure-tunnel-up.sh" \
  "$ROOT/scripts/pm2-boot.sh" \
  "$ROOT/scripts/setup-boot-persistence.sh" \
  "$ROOT/scripts/setup-custom-domain.sh"

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  echo "==> Ensuring DNS CNAME for ${ERP_HOSTNAME:-erp.kutalimzhda.com}"
  bash "$ROOT/scripts/setup-custom-domain.sh" || true
fi

echo "==> Starting app (PM2)"
bash "$ROOT/scripts/ensure-24-7.sh"

echo "==> Installing Cloudflare tunnel (official system service)"
bash "$ROOT/scripts/install-cloudflared-service.sh"

bash "$ROOT/scripts/setup-boot-persistence.sh"

PUBLIC_URL="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
printf '%s\n' "$PUBLIC_URL" > "$DEPLOY_DIR/public-url.txt"

echo ""
echo "Production ready."
echo "  URL:     $PUBLIC_URL"
echo "  App:     npx pm2 status"
echo "  Tunnel:  Cloudflare system service (see Zero Trust dashboard → HEALTHY)"
echo "  Logs:    /var/log/cloudflared.log"
