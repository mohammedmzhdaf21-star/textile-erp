#!/usr/bin/env bash
# Boot helper: resurrect PM2 after server reboot.
# Installed via setup-boot-persistence.sh (@reboot cron + optional pm2 startup).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/tunnel-health.sh"

mkdir -p "$ROOT/deploy"
LOG="$ROOT/deploy/pm2-boot.log"

{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") pm2-boot ==="
  tunnel_apply_quic_sysctl

  for _ in $(seq 1 30); do
    if curl -sf --max-time 3 http://127.0.0.1:3000/health >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  sleep 10

  if command -v pm2 >/dev/null 2>&1; then
    pm2 resurrect >>"$LOG" 2>&1 || true
    if ! pm2 jlist 2>/dev/null | grep -q textile-erp; then
      echo "pm2-boot: resurrect empty — starting ecosystem"
      pm2 start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG" 2>&1 || true
    fi
  else
    npx pm2 resurrect >>"$LOG" 2>&1 || true
    if ! npx pm2 jlist 2>/dev/null | grep -q textile-erp; then
      echo "pm2-boot: resurrect empty — starting ecosystem"
      npx pm2 start "$ROOT/ecosystem.config.cjs" --update-env >>"$LOG" 2>&1 || true
    fi
  fi

  bash "$ROOT/scripts/ensure-24-7.sh"
} >>"$LOG" 2>&1
