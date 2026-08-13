#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"

if [[ ! -f frontend/dist/index.html ]]; then
  echo "Frontend not built. Run: npm run build:frontend"
  exit 1
fi

exec npx tsx src/server.ts
