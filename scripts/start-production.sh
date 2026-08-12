#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and configure DATABASE_URL first."
  exit 1
fi

echo "==> Applying database migrations"
npx prisma migrate deploy
npx prisma generate

echo "==> Building frontend"
npm run build:frontend

echo "==> Starting Textile ERP (production on port ${PORT:-3000})"
exec bash "$ROOT/scripts/run-server.sh"
