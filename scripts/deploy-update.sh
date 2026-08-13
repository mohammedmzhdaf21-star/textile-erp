#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"

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

sleep 2

echo ""
echo "==> Verifying deploy"
VERSION_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/version" || echo "000")
PLAIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/commissions/plain-cloth" || echo "000")
HEALTH=$(curl -s "http://localhost:${PORT}/health" || echo "{}")

echo "  /api/version HTTP ${VERSION_CODE} (expect 200)"
echo "  /api/commissions/plain-cloth HTTP ${PLAIN_CODE} (expect 401 without login)"
echo "  /health: ${HEALTH}"

if [[ "${VERSION_CODE}" == "200" ]]; then
  echo ""
  echo "Deploy OK — plain cloth API is available."
  echo "Hard-refresh your browser (Ctrl+Shift+R), then click Reconnect on Plain Cloth Pricing."
else
  echo ""
  echo "WARN: Deploy may be incomplete. /api/version did not return 200."
  echo "Try: pm2 logs textile-erp --lines 50"
  exit 1
fi
