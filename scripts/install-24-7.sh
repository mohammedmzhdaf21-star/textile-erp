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

echo "==> Installing dependencies"
npm install
(cd frontend && npm install)

echo "==> Applying database migrations"
npx prisma migrate deploy
npx prisma generate

echo "==> Building production frontend"
npm run build:frontend

chmod +x "$ROOT/scripts/start-production.sh" "$ROOT/scripts/run-tunnel.sh"

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
  loginctl enable-linger "$(id -un)" 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable textile-erp.service textile-tunnel.service
  systemctl --user restart textile-erp.service textile-tunnel.service
  MANAGER="systemd"
else
  echo "==> Installing PM2 process manager (auto-restart 24/7)"
  npx pm2 delete textile-erp textile-tunnel 2>/dev/null || true
  npx pm2 start "$ROOT/ecosystem.config.cjs"
  npx pm2 save

  # Keep PM2 running after reboot when possible
  if command -v crontab >/dev/null 2>&1; then
    CRON_CMD="@reboot cd $ROOT && npx pm2 resurrect >> $DEPLOY_DIR/pm2-reboot.log 2>&1"
    (crontab -l 2>/dev/null | grep -v "pm2 resurrect" || true; echo "$CRON_CMD") | crontab -
    echo "==> Added @reboot cron job for PM2"
  fi

  MANAGER="pm2"
fi

echo ""
echo "24/7 services started ($MANAGER)."
echo ""
if [[ "$MANAGER" == "pm2" ]]; then
  echo "  App status:    npx pm2 status"
  echo "  App logs:      npx pm2 logs textile-erp"
  echo "  Tunnel logs:   npx pm2 logs textile-tunnel"
  echo "  Restart all:   npx pm2 restart all"
else
  echo "  App status:    systemctl --user status textile-erp"
  echo "  Tunnel status: systemctl --user status textile-tunnel"
fi
echo "  Public URL:    cat deploy/public-url.txt"
echo "  Health check:  curl http://localhost:3000/health"
echo ""
echo "Services auto-restart on crash."
echo "Note: the free Cloudflare quick tunnel URL changes when the tunnel restarts."
echo "For a permanent URL, set up a named Cloudflare tunnel (see README)."
