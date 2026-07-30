#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Textile ERP dev setup (always use branch: main)"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "cursor/restore-full-features-dd16" ]]; then
  echo "WARNING: You are on branch '$CURRENT_BRANCH', not main."
  echo "         Features may be missing. Run: git checkout main && git pull origin main"
  echo ""
fi

if [[ ! -f .env ]]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "    Edit .env if your database credentials differ."
else
  echo "==> .env already exists"
fi

echo "==> Installing backend dependencies"
npm install

echo "==> Installing frontend dependencies"
(cd frontend && npm install)

echo "==> Applying database migrations"
npx prisma migrate deploy
npx prisma generate

if [[ "${SEED_DB:-}" == "1" ]]; then
  echo "==> Seeding database"
  npm run seed
fi

echo ""
echo "Setup complete."
echo "  Backend:  npm run dev          (http://localhost:3000)"
echo "  Frontend: cd frontend && npm run dev  (http://localhost:5173)"
echo "  Login:    admin@textile.com / admin123"
echo ""
echo "Full feature list: FEATURES.md"
