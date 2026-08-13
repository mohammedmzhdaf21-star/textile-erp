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

echo "==> Ensuring 24/7 stack (app + tunnel + watchdog + keepalive)"
bash "$ROOT/scripts/ensure-24-7.sh"

echo ""
echo "==> Verifying deploy"
VERSION_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/version" || echo "000")
PLAIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/api/commissions/plain-cloth" || echo "000")
PUBLIC_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${ERP_PUBLIC_URL:-https://erp.kutalimzhda.com}/health" || echo "000")
HEALTH=$(curl -s "http://localhost:${PORT}/health" || echo "{}")

echo "  /api/version HTTP ${VERSION_CODE} (expect 200)"
echo "  /api/commissions/plain-cloth HTTP ${PLAIN_CODE} (expect 401 without login)"
echo "  public /health HTTP ${PUBLIC_CODE} (expect 200)"
echo "  /health: ${HEALTH}"

if [[ "${VERSION_CODE}" == "200" && "${PUBLIC_CODE}" == "200" ]]; then
  echo ""
  echo "Deploy OK — app and public URL are healthy."
  echo "Hard-refresh your browser (Ctrl+Shift+R) if needed."
else
  echo ""
  echo "WARN: Deploy verification failed."
  echo "Try: bash scripts/ensure-24-7.sh && npx pm2 logs textile-tunnel --lines 30"
  exit 1
fi
