#!/usr/bin/env bash
# Boot helper: resurrect PM2 after server reboot. Add to crontab: @reboot bash /path/scripts/pm2-boot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p "$ROOT/deploy"
LOG="$ROOT/deploy/pm2-boot.log"

{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") pm2-boot ==="
  sleep 15
  if command -v pm2 >/dev/null 2>&1; then
    pm2 resurrect || true
  else
    npx pm2 resurrect || true
  fi
  bash "$ROOT/scripts/ensure-24-7.sh"
} >>"$LOG" 2>&1
