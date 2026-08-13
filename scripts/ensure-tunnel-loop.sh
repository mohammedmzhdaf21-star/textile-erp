#!/usr/bin/env bash
# PM2 backup for cron — runs tunnel recovery every 2 minutes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL="${TUNNEL_RECOVERY_INTERVAL_SEC:-120}"

while true; do
  bash "$ROOT/scripts/ensure-tunnel-healthy.sh" || true
  sleep "$INTERVAL"
done
