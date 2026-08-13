#!/usr/bin/env bash
# Start app + Cloudflare named tunnel after server reboot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p "$ROOT/deploy"
LOG="$ROOT/deploy/pm2-boot.log"

{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") pm2-boot ==="
  sleep 10
  if command -v pm2 >/dev/null 2>&1; then
    pm2 resurrect >>"$LOG" 2>&1 || true
    if ! pm2 jlist 2>/dev/null | grep -q textile-erp; then
      pm2 start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG" 2>&1 || true
    fi
  else
    npx pm2 resurrect >>"$LOG" 2>&1 || true
    if ! npx pm2 jlist 2>/dev/null | grep -q textile-erp; then
      npx pm2 start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG" 2>&1 || true
    fi
  fi
  bash "$ROOT/scripts/ensure-24-7.sh"
} >>"$LOG" 2>&1
