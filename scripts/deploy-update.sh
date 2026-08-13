#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Textile ERP deploy update"
echo "    Directory: $ROOT"

echo "==> Pulling latest main"
git fetch origin main
git checkout main
git pull origin main

echo "==> Installing dependencies"
npm install
(cd frontend && npm install)

echo "==> Database migrations"
npx prisma migrate deploy
npx prisma generate

echo "==> Building frontend"
npm run build:frontend

echo "==> Restarting app"
if command -v pm2 >/dev/null 2>&1 && pm2 describe textile-erp >/dev/null 2>&1; then
  pm2 restart textile-erp
  echo "    PM2 restarted textile-erp"
elif npx pm2 describe textile-erp >/dev/null 2>&1; then
  npx pm2 restart textile-erp
  echo "    PM2 restarted textile-erp"
elif systemctl --user is-active textile-erp.service >/dev/null 2>&1; then
  systemctl --user restart textile-erp.service
  echo "    systemd restarted textile-erp.service"
else
  echo "WARN: Could not find PM2 or systemd service. Start manually:"
  echo "      npm run start:prod"
fi

echo ""
echo "Deploy complete."
echo "  Local health:  curl -s http://localhost:${PORT:-3000}/health"
echo "  Plain cloth:   curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT:-3000}/api/plain-cloth"
echo "                  (401 = route exists, 404 = server still old — restart again)"
