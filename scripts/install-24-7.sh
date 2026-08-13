#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_DIR="$ROOT/deploy"
mkdir -p "$DEPLOY_DIR"

echo "==> Textile ERP 24/7 installer"

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
  echo "Add your Cloudflare named tunnel token (Cloudflare Zero Trust -> Tunnels -> your tunnel -> Install connector)."
  echo "Production uses https://erp.kutalimzhda.com — do not rely on trycloudflare.com URLs."
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
  "$ROOT/scripts/tunnel-watchdog.sh" \
  "$ROOT/scripts/tunnel-keepalive.sh" \
  "$ROOT/scripts/ensure-tunnel-healthy.sh" \
  "$ROOT/scripts/ensure-tunnel-loop.sh" \
  "$ROOT/scripts/setup-custom-domain.sh"

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  echo "==> Ensuring DNS for ${ERP_HOSTNAME:-erp.kutalimzhda.com}"
  bash "$ROOT/scripts/setup-custom-domain.sh" || echo "WARN: DNS setup failed; tunnel may still work if DNS is already correct."
else
  echo "WARN: Skipping DNS setup (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in .env to auto-fix DNS)."
fi

use_systemd=false
if [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]] && systemctl --user show-environment >/dev/null 2>&1; then
  use_systemd=true
fi

if [[ "$use_systemd" == "true" ]]; then
  echo "==> Installing systemd user services"
  SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$SERVICE_DIR"
  sed "s|@WORKSPACE@|$ROOT|g" "$ROOT/deploy/textile-erp.service.template" > "$SERVICE_DIR/textile-erp.service"
  sed "s|@WORKSPACE@|$ROOT|g" "$ROOT/deploy/textile-tunnel.service.template" > "$SERVICE_DIR/textile-tunnel.service"
  sed "s|@WORKSPACE@|$ROOT|g" "$ROOT/deploy/textile-watchdog.service.template" > "$SERVICE_DIR/textile-watchdog.service"
  loginctl enable-linger "$(id -un)" 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable textile-erp.service textile-tunnel.service textile-watchdog.service
  systemctl --user restart textile-erp.service textile-tunnel.service textile-watchdog.service
  MANAGER="systemd"
else
  echo "==> Installing PM2 process manager (auto-restart 24/7)"
  npx pm2 delete textile-erp textile-tunnel textile-tunnel-named textile-watchdog 2>/dev/null || true
  npx pm2 start "$ROOT/ecosystem.config.cjs"
  npx pm2 save

  if command -v crontab >/dev/null 2>&1; then
    CRON_REBOOT="@reboot cd $ROOT && npx pm2 resurrect >> $DEPLOY_DIR/pm2-reboot.log 2>&1"
    CRON_TUNNEL="*/2 * * * * flock -n $DEPLOY_DIR/tunnel-recovery.lock bash $ROOT/scripts/ensure-tunnel-healthy.sh >> $DEPLOY_DIR/tunnel-recovery.log 2>&1"
    (crontab -l 2>/dev/null | grep -v "pm2 resurrect" | grep -v "ensure-tunnel-healthy" || true
     echo "$CRON_REBOOT"
     echo "$CRON_TUNNEL") | crontab -
    echo "==> Added @reboot PM2 + 2-minute tunnel recovery cron"
  fi

  MANAGER="pm2"
fi

PUBLIC_URL="${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}"
printf '%s\n' "$PUBLIC_URL" > "$DEPLOY_DIR/public-url.txt"

echo ""
echo "24/7 services started ($MANAGER)."
echo ""
echo "  Permanent URL:  $PUBLIC_URL"
echo "  Local health:   curl http://localhost:3000/health"
echo "  Public health:  curl ${PUBLIC_URL}/health"
echo ""
if [[ "$MANAGER" == "pm2" ]]; then
  echo "  Status:         npx pm2 status"
  echo "  App logs:       npx pm2 logs textile-erp"
  echo "  Tunnel logs:    npx pm2 logs textile-tunnel"
  echo "  Watchdog logs:  tail -f deploy/watchdog.log"
  echo "  Recovery logs:  tail -f deploy/tunnel-recovery.log"
  echo "  Restart all:    npx pm2 restart all"
else
  echo "  App status:     systemctl --user status textile-erp"
  echo "  Tunnel status:  systemctl --user status textile-tunnel"
  echo "  Watchdog:       systemctl --user status textile-watchdog"
fi
echo ""
echo "The quick trycloudflare.com URL is NOT used in production (it causes 530 errors when it expires)."
