#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"

if [[ ! -f frontend/dist/index.html ]]; then
  echo "Frontend not built. Run: npm run build:frontend"
  exit 1
fi

if [[ ! -x node_modules/.bin/tsx ]]; then
  echo "Missing tsx. Run: npm install"
  exit 1
fi

exec node_modules/.bin/tsx src/server.ts
