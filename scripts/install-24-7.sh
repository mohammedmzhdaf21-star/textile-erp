#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> Textile ERP production installer"
echo "    Permanent domain: ${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"

if [[ ! -f .env ]]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo ""
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is not set in .env"
  echo "Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Install connector → copy token."
  exit 1
fi

echo "==> Installing dependencies"
npm install
(cd frontend && npm install)

echo "==> Applying database migrations"
npx prisma migrate deploy
npx prisma generate

echo "==> Building production frontend"
npm run build:frontend

chmod +x \
  "$ROOT/scripts/start-production.sh" \
  "$ROOT/scripts/run-named-tunnel.sh" \
  "$ROOT/scripts/ensure-24-7.sh" \
  "$ROOT/scripts/pm2-boot.sh" \
  "$ROOT/scripts/setup-boot-persistence.sh" \
  "$ROOT/scripts/setup-custom-domain.sh"

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  echo "==> Ensuring permanent DNS for ${ERP_HOSTNAME:-erp.kutalimzhda.com}"
  bash "$ROOT/scripts/setup-custom-domain.sh" || echo "WARN: DNS setup failed; fix in Cloudflare dashboard if needed."
else
  echo "WARN: Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID in .env to auto-configure DNS."
fi

use_systemd=false
if [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]] && systemctl --user show-environment >/dev/null 2>&1; then
  use_systemd=true
fi

if [[ "$use_systemd" == "true" ]]; then
  echo "==> Installing systemd user services (app + tunnel)"
  SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$SERVICE_DIR"
  sed "s|@WORKSPACE@|$ROOT|g" "$ROOT/deploy/textile-erp.service.template" > "$SERVICE_DIR/textile-erp.service"
  sed "s|@WORKSPACE@|$ROOT|g" "$ROOT/deploy/textile-tunnel.service.template" > "$SERVICE_DIR/textile-tunnel.service"
  loginctl enable-linger "$(id -un)" 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable textile-erp.service textile-tunnel.service
  systemctl --user restart textile-erp.service textile-tunnel.service
  bash "$ROOT/scripts/setup-boot-persistence.sh"
  MANAGER="systemd"
else
  echo "==> Starting PM2 (app + Cloudflare named tunnel)"
  bash "$ROOT/scripts/ensure-24-7.sh"
  bash "$ROOT/scripts/setup-boot-persistence.sh"
  MANAGER="pm2"
fi

PUBLIC_URL="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
printf '%s\n' "$PUBLIC_URL" > "$DEPLOY_DIR/public-url.txt"

echo ""
echo "Production started ($MANAGER)."
echo ""
echo "  Permanent URL:  $PUBLIC_URL"
echo "  Local health:   curl http://localhost:3000/health"
echo "  Public health:  curl ${PUBLIC_URL}/health"
echo ""
if [[ "$MANAGER" == "pm2" ]]; then
  echo "  Status:         npx pm2 status"
  echo "  App logs:       npx pm2 logs textile-erp"
  echo "  Tunnel logs:    npx pm2 logs textile-tunnel"
else
  echo "  App:            systemctl --user status textile-erp"
  echo "  Tunnel:         systemctl --user status textile-tunnel"
fi
echo ""
echo "Your domain stays fixed in Cloudflare DNS. The tunnel connector runs 24/7 — no polling scripts."
